/**
 * LessonAudioSession 통합(로직 레벨) 테스트 — "첫 10초만 필기되고 멈춤"
 * 회귀 방지.
 *
 * 원래 설계는 세그먼트용 MediaRecorder 를 10초마다 정지→재생성했는데,
 * 모바일 브라우저에서 재생성이 조용히 실패해 첫 세그먼트 이후 필기가
 * 멈췄다. 현재 설계는 단일 레코더의 타임슬라이스 청크를 세그먼트로 쓰고
 * 첫 청크에서 떼어낸 컨테이너 헤더를 접두한다. 이 테스트는 가짜
 * MediaRecorder 로 그 경로 전체(청크 → 헤더 접두 → 전사 큐 → done 노트)를
 * 검증한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../services/geminiService', () => ({
  invokeBackendAI: vi.fn(),
  getResponseText: (r: unknown) => (typeof r === 'string' ? r : null),
}));
vi.mock('../services/promptService', () => ({
  promptService: { getActiveSystemPrompt: vi.fn(async () => 'SYSTEM') },
}));
vi.mock('../services/firebase', () => ({
  firebaseService: { isInitialized: () => false },
}));

import {
  LessonAudioSession,
  findInitSegmentEnd,
  type LessonSegmentNote,
} from '../services/lessonAudioPipeline';

// webm Cluster 마커(1F 43 B6 75) 를 흉내낸 청크: 첫 청크만 3바이트
// 헤더([1,2,3])를 앞에 갖는다 — 실제 타임슬라이스 산출물과 같은 구조.
const HEADER = [1, 2, 3];
const CLUSTER = [0x1f, 0x43, 0xb6, 0x75];

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: ((e?: unknown) => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private n = 0;
  constructor(public stream: unknown, public opts: unknown) {
    FakeMediaRecorder.instances.push(this);
  }
  private emit() {
    const bytes =
      this.n === 0
        ? new Uint8Array([...HEADER, ...CLUSTER, 0])
        : new Uint8Array([...CLUSTER, this.n]);
    this.n += 1;
    this.ondataavailable?.({ data: new Blob([bytes]) });
  }
  start(timeslice?: number) {
    this.state = 'recording';
    if (timeslice) this.timer = setInterval(() => this.emit(), timeslice);
  }
  stop() {
    if (this.state === 'inactive') return;
    if (this.timer) clearInterval(this.timer);
    this.state = 'inactive';
    this.emit(); // 브라우저처럼 stop 직전 꼬리 청크를 흘린다
    this.onstop?.();
  }
  pause() {
    this.state = 'paused';
    if (this.timer) clearInterval(this.timer);
  }
  resume() {
    this.state = 'recording';
    this.timer = setInterval(() => this.emit(), 10_000);
  }
}

describe('LessonAudioSession — 타임슬라이스 필기 파이프라인', () => {
  beforeEach(() => {
    FakeMediaRecorder.instances = [];
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const makeSession = (
    analyzedIndexes: number[],
    analyzedBlobs: Blob[]
  ): LessonAudioSession =>
    new LessonAudioSession({
      studentName: '테스트',
      analyzer: async (blob, _mime, ctx) => {
        analyzedIndexes.push(ctx.index);
        analyzedBlobs.push(blob);
        return {
          index: ctx.index,
          startSec: ctx.startSec,
          durationSec: ctx.durationSec,
          status: 'done',
          transcript: `전사 ${ctx.index}`,
          keyPoints: [],
          drills: [],
          metrics: [],
          studentState: '',
        } as LessonSegmentNote;
      },
      rollingSummarizer: async () => '- 요약',
    });

  it('첫 세그먼트 이후에도 필기가 계속 쌓인다 (회귀: 10초 후 멈춤)', async () => {
    const analyzedIndexes: number[] = [];
    const analyzedBlobs: Blob[] = [];
    const session = makeSession(analyzedIndexes, analyzedBlobs);

    await session.start({} as MediaStream);
    // 레코더는 딱 하나만 생성돼야 한다 — 재생성이 곧 버그의 근원이었다.
    expect(FakeMediaRecorder.instances).toHaveLength(1);

    for (let i = 0; i < 35; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    await vi.advanceTimersByTimeAsync(0);

    expect(analyzedIndexes).toEqual([0, 1, 2]);
    const done = session.getNotes().filter((n) => n.status === 'done');
    expect(done.map((n) => n.transcript)).toEqual(['전사 0', '전사 1', '전사 2']);
    // 타임스탬프가 10초 간격으로 이어져야 한다
    expect(done.map((n) => n.startSec)).toEqual([0, 10, 20]);

    await session.discard();
  });

  it('둘째 청크부터는 첫 청크의 컨테이너 헤더가 접두된다', async () => {
    const analyzedIndexes: number[] = [];
    const analyzedBlobs: Blob[] = [];
    const session = makeSession(analyzedIndexes, analyzedBlobs);

    await session.start({} as MediaStream);
    for (let i = 0; i < 25; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    await vi.advanceTimersByTimeAsync(0);

    expect(analyzedIndexes).toEqual([0, 1]);
    const secondBytes = new Uint8Array(await analyzedBlobs[1].arrayBuffer());
    // [헤더(1,2,3)] + [Cluster 마커 + 페이로드]
    expect(Array.from(secondBytes.slice(0, 3))).toEqual(HEADER);
    expect(Array.from(secondBytes.slice(3, 7))).toEqual(CLUSTER);

    await session.discard();
  });

  it('stop() 은 꼬리 청크까지 처리한 뒤 전체 오디오와 핸드오프를 돌려준다', async () => {
    const analyzedIndexes: number[] = [];
    const analyzedBlobs: Blob[] = [];
    const session = makeSession(analyzedIndexes, analyzedBlobs);

    await session.start({} as MediaStream);
    for (let i = 0; i < 15; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    const result = await session.stop();
    await vi.advanceTimersByTimeAsync(0);

    // 청크 2개(10s 정규 + 5s 꼬리)가 아카이브에 합쳐진다
    expect(result.fullAudioBlob.size).toBeGreaterThan(0);
    expect(result.durationSec).toBe(15);
    expect(result.handoff.sessionId).toBe(session.id);
    // 꼬리 청크(5s, ≥3s)도 필기로 들어간다
    expect(analyzedIndexes).toEqual([0, 1]);

    await session.discard();
  });
});

describe('findInitSegmentEnd', () => {
  it('webm Cluster 마커 앞까지를 헤더로 본다', () => {
    const bytes = new Uint8Array([9, 8, 7, 6, 0x1f, 0x43, 0xb6, 0x75, 1]);
    expect(findInitSegmentEnd(bytes)).toBe(4);
  });

  it('fMP4 는 첫 moof 박스 시작(size 필드 포함)을 경계로 본다', () => {
    // [ftyp-ish 8바이트][size:4]['moof']
    const bytes = new Uint8Array([
      0, 0, 0, 4, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 8, 0x6d, 0x6f, 0x6f, 0x66,
    ]);
    expect(findInitSegmentEnd(bytes)).toBe(8);
  });

  it('경계를 못 찾으면 -1', () => {
    expect(findInitSegmentEnd(new Uint8Array([1, 2, 3, 4, 5]))).toBe(-1);
  });
});
