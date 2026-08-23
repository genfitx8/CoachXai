/**
 * AI 전사 폴백의 컨테이너 헤더 처리 — "듣지 않은 대화가 필기에 적히는"
 * 두 번째 경로.
 *
 * 10초 청크는 그 자체로 완결된 파일이 아니라, 런 첫머리의 컨테이너 헤더를
 * 접두해야 디코딩된다. 첫 타임슬라이스가 클러스터(webm)/moof(fMP4) 시작
 * 전에 끊기는 기기에서는 첫 청크만으로 경계가 안 잡히는데, 예전에는 그럴
 * 때 헤더 없는 조각을 그대로 모델에 보냈다. 디코딩하지 못한 모델은 침묵
 * 대신 그럴듯한 대화를 지어내므로, 그 구간 필기는 통째로 창작이 된다.
 *
 * 지금은 (1) 청크가 하나 더 올 때마다 헤더를 다시 찾고 (2) 끝내 못 찾으면
 * 그 구간 필기를 건너뛴다 — 오디오는 아카이브에 남으므로 음성 파일에는
 * 빠짐이 없다.
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
  type LessonSegmentNote,
} from '../services/lessonAudioPipeline';

const HEADER = [1, 2, 3];
const CLUSTER = [0x1f, 0x43, 0xb6, 0x75];

/** 청크 바이트를 테스트가 직접 정하는 가짜 레코더. */
const makeRecorderClass = (chunkBytes: number[][]) =>
  class FakeMediaRecorder {
    state: 'inactive' | 'recording' | 'paused' = 'inactive';
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    private n = 0;
    constructor(public stream: unknown, public opts: unknown) {}
    private emit() {
      const bytes = chunkBytes[Math.min(this.n, chunkBytes.length - 1)];
      this.n += 1;
      this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) });
    }
    start(timeslice?: number) {
      this.state = 'recording';
      if (timeslice) this.timer = setInterval(() => this.emit(), timeslice);
    }
    stop() {
      if (this.state === 'inactive') return;
      if (this.timer) clearInterval(this.timer);
      this.state = 'inactive';
    }
    pause() {
      this.state = 'paused';
      if (this.timer) clearInterval(this.timer);
    }
    resume() {
      this.state = 'recording';
    }
  };

describe('AI 전사 폴백 — 컨테이너 헤더', () => {
  const analyzed: { index: number; bytes: number[] }[] = [];

  const makeSession = () =>
    new LessonAudioSession({
      studentName: '테스트',
      // 청크 경계 동작을 보는 테스트라 제품 기본값(20초)과 무관하게
      // 10초로 고정한다 — 기본값이 바뀌어도 이 테스트의 의미는 그대로다.
      segmentTargetSec: 10,
      analyzer: async (blob, _mime, ctx) => {
        analyzed.push({
          index: ctx.index,
          bytes: [...new Uint8Array(await blob.arrayBuffer())],
        });
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

  beforeEach(() => {
    analyzed.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const run = async (chunkBytes: number[][], seconds: number) => {
    vi.stubGlobal('MediaRecorder', makeRecorderClass(chunkBytes));
    const session = makeSession();
    await session.start({} as MediaStream);
    for (let i = 0; i < seconds; i++) await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);
    return session;
  };

  it('첫 청크에 경계가 없으면 다음 청크까지 이어 붙여 헤더를 되찾는다', async () => {
    // 첫 청크는 헤더뿐(클러스터 마커가 아직 안 나옴), 둘째 청크에서 시작된다.
    const session = await run(
      [HEADER, [...CLUSTER, 10], [...CLUSTER, 20], [...CLUSTER, 30]],
      35
    );

    // 첫 청크는 그대로(완결 파일로 간주), 이후 청크는 되찾은 헤더가 접두된다.
    expect(analyzed.map((a) => a.index)).toEqual([0, 1, 2]);
    expect(analyzed[1].bytes).toEqual([...HEADER, ...CLUSTER, 10]);
    expect(analyzed[2].bytes).toEqual([...HEADER, ...CLUSTER, 20]);

    await session.discard();
  });

  it('끝내 헤더를 못 찾으면 지어낸 필기 대신 그 구간을 비운다', async () => {
    // 어떤 청크에도 컨테이너 경계가 없다 — 접두할 헤더가 존재하지 않는다.
    const session = await run([[9, 9, 9]], 35);

    // 첫 청크만 전사되고, 디코딩 불가능한 조각은 모델에 보내지 않는다.
    expect(analyzed.map((a) => a.index)).toEqual([0]);
    const notes = session.getNotes();
    expect(notes.map((n) => n.transcript)).toEqual(['전사 0']);

    await session.discard();
  });
});
