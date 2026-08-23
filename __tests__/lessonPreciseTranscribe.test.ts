/**
 * 정밀 전사 패스 — 레슨 기록의 정확도를 결정하는 두 번째 받아쓰기.
 *
 * 실시간 필기는 짧은 구간을 따로따로 전사해 빠른 대신 경계에서 문장이
 * 잘리고 앞뒤 맥락이 없다. 검토 단계에서는 기다릴 여유가 있으므로 같은
 * 녹음을 5분짜리 조각으로 다시 들려 준다. 이 테스트가 지키는 계약:
 *  - 조각은 **그 자체로 디코딩되는** 파일이어야 한다(런 헤더로 시작).
 *  - 일부 조각이 실패해도 그 구간 실시간 필기를 잃지 않는다.
 *  - 전부 실패하면 null — 호출부가 실시간 필기를 그대로 쓴다.
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
  buildPreciseTranscribePrompt,
  preciseTranscribeNotes,
  type LessonSegmentNote,
  type TranscriptionSlice,
} from '../services/lessonAudioPipeline';

const HEADER = [1, 2, 3];
const CLUSTER = [0x1f, 0x43, 0xb6, 0x75];

class FakeMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: ((e?: unknown) => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private n = 0;
  constructor(public stream: unknown, public opts: unknown) {}
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
    this.onstop?.();
  }
  pause() {
    this.state = 'paused';
    if (this.timer) clearInterval(this.timer);
  }
  resume() {
    this.state = 'recording';
  }
}

const bytesOf = async (blob: Blob) => [...new Uint8Array(await blob.arrayBuffer())];

const note = (index: number, startSec: number, transcript: string): LessonSegmentNote => ({
  index,
  startSec,
  durationSec: 10,
  status: 'done',
  transcript,
  keyPoints: [],
  drills: [],
  metrics: [],
  studentState: '',
});

describe('getTranscriptionSlices', () => {
  beforeEach(() => {
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('조각마다 런 헤더를 붙여 그 자체로 디코딩되게 만든다', async () => {
    const session = new LessonAudioSession({
      studentName: '테스트',
      segmentTargetSec: 10,
      analyzer: async (_b, _m, ctx) => note(ctx.index, ctx.startSec, `전사 ${ctx.index}`),
      rollingSummarizer: async () => '- 요약',
    });
    await session.start({} as MediaStream);
    for (let i = 0; i < 45; i++) await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);

    // 10초 청크 4개를 20초(=2청크)짜리 조각으로 나눈다.
    const slices = await session.getTranscriptionSlices(20);
    expect(slices.length).toBeGreaterThanOrEqual(2);

    // 런의 첫 조각은 헤더를 이미 품고 있다 — 덧붙이면 헤더가 두 번 온다.
    expect(await bytesOf(slices[0].blob)).toEqual([
      ...HEADER, ...CLUSTER, 0, ...CLUSTER, 1,
    ]);
    // 이후 조각은 헤더가 앞에 붙어 독립 디코딩이 된다.
    expect(await bytesOf(slices[1].blob)).toEqual([
      ...HEADER, ...CLUSTER, 2, ...CLUSTER, 3,
    ]);
    expect(slices[1].startSec).toBe(20);

    await session.discard();
  });
});

describe('preciseTranscribeNotes', () => {
  const slices: TranscriptionSlice[] = [
    { blob: new Blob(['a']), startSec: 0, durationSec: 300 },
    { blob: new Blob(['b']), startSec: 300, durationSec: 300 },
  ];
  const liveNotes = [
    note(0, 10, '실시간 앞구간'),
    note(1, 310, '실시간 뒷구간'),
  ];

  it('정밀 전사 결과로 필기를 다시 만들고 화자를 함께 싣는다', async () => {
    const out = await preciseTranscribeNotes(
      slices,
      liveNotes,
      '김회원',
      'audio/webm',
      async (slice) => [
        { speaker: 'coach', text: `코치 ${slice.startSec}` },
        { speaker: 'student', text: `학생 ${slice.startSec}` },
      ]
    );

    expect(out).not.toBeNull();
    expect(out!.map((n) => n.index)).toEqual([0, 1]);
    expect(out!.map((n) => n.startSec)).toEqual([0, 300]);
    expect(out![0].transcript).toContain('코치 0');
    expect(out![0].turns?.map((t) => t.speaker)).toEqual(['coach', 'student']);
  });

  it('실패한 조각의 구간은 실시간 필기를 그대로 남긴다', async () => {
    const out = await preciseTranscribeNotes(
      slices,
      liveNotes,
      '김회원',
      'audio/webm',
      async (slice) => {
        if (slice.startSec === 0) throw new Error('전사 실패');
        return [{ speaker: 'coach', text: '뒷구간 정밀' }];
      }
    );

    expect(out!.map((n) => n.transcript)).toEqual(['실시간 앞구간', '뒷구간 정밀']);
  });

  it('전부 실패하면 null — 호출부가 실시간 필기를 그대로 쓴다', async () => {
    const out = await preciseTranscribeNotes(
      slices,
      liveNotes,
      '김회원',
      'audio/webm',
      async () => {
        throw new Error('전사 실패');
      }
    );
    expect(out).toBeNull();
  });
});

describe('buildPreciseTranscribePrompt', () => {
  it('골프 코칭 어휘와 구간·학생 이름을 프롬프트에 싣는다', () => {
    const prompt = buildPreciseTranscribePrompt({
      studentName: '김회원',
      startSec: 0,
      durationSec: 300,
    });
    expect(prompt).toContain('김회원');
    expect(prompt).toContain('0:00–5:00');
    expect(prompt).toContain('얼리 익스텐션'); // 코칭 어휘 힌트
    expect(prompt).toContain('지어내지 마세요');
  });
});
