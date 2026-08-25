/**
 * 무음 구간 방어 — "말하지 않은 글씨가 써지는" 문제의 원천 차단.
 *
 * 레슨 중에는 학생이 혼자 공을 치는 시간이 길어 타구음·기계음만 있는
 * 구간이 흔하다. 그런 오디오를 전사 모델에 보내면 모델은 침묵하는 대신
 * 그럴듯한 코칭 대화를 지어낸다. 두 겹으로 막는다.
 *  1. 말소리가 없던 구간은 전사 자체를 보내지 않는다(VAD 게이트).
 *  2. 그래도 새어 나오는 자막 상투구는 필기에 넣지 않는다.
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
  buildTranscribePrompt,
  parseTranscriptTurns,
  type LessonSegmentNote,
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

/**
 * 마이크 입력을 흉내내는 AudioContext. `level` 이 곧 파형 진폭이라
 * 조용한 방(0.0005)과 말소리(0.2)를 그대로 만들어 낼 수 있다.
 */
const stubAudioContext = (level: () => number) => {
  class FakeAnalyser {
    fftSize = 1024;
    getFloatTimeDomainData(buf: Float32Array) {
      const v = level();
      for (let i = 0; i < buf.length; i++) buf[i] = i % 2 === 0 ? v : -v;
    }
  }
  class FakeAudioContext {
    createAnalyser() {
      return new FakeAnalyser();
    }
    createMediaStreamSource() {
      return { connect: () => {} };
    }
    close() {
      return Promise.resolve();
    }
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);
};

describe('무음 구간은 전사하지 않는다', () => {
  let analyzed: number[];

  const makeSession = () => {
    analyzed = [];
    return new LessonAudioSession({
      studentName: '테스트',
      segmentTargetSec: 10,
      analyzer: async (_b, _m, ctx) => {
        analyzed.push(ctx.index);
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
  };

  beforeEach(() => {
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('타구음만 있는 조용한 구간은 모델에 보내지 않는다', async () => {
    // 잡음 바닥 수준으로만 신호가 있는 상태 — 사람 말은 없다.
    stubAudioContext(() => 0.004);
    const session = makeSession();
    await session.start({} as MediaStream);
    for (let i = 0; i < 35; i++) await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(analyzed).toEqual([]);
    await session.discard();
  });

  it('말소리가 있으면 그대로 전사한다', async () => {
    stubAudioContext(() => 0.2);
    const session = makeSession();
    await session.start({} as MediaStream);
    for (let i = 0; i < 35; i++) await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(analyzed.length).toBeGreaterThan(0);
    await session.discard();
  });

  it('마이크 신호를 못 재는 환경에서는 게이트를 걸지 않는다', async () => {
    // AudioContext 가 없는 브라우저 — 못 재는 것과 말이 없는 것은 다르다.
    vi.stubGlobal('AudioContext', undefined);
    const session = makeSession();
    await session.start({} as MediaStream);
    for (let i = 0; i < 35; i++) await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(analyzed.length).toBeGreaterThan(0);
    await session.discard();
  });
});

describe('자막 상투구는 필기에 넣지 않는다', () => {
  it('무음 구간에서 흔한 지어낸 문장을 걸러낸다', () => {
    const turns = parseTranscriptTurns(
      JSON.stringify({
        turns: [
          { speaker: 'coach', text: '시청해 주셔서 감사합니다' },
          { speaker: 'coach', text: '구독과 좋아요 부탁드립니다' },
          { speaker: 'coach', text: '다음 영상에서 만나요' },
          { speaker: 'coach', text: '[음악]' },
          { speaker: 'coach', text: '체중을 왼발에 실어 보세요' },
        ],
      })
    );
    expect(turns.map((t) => t.text)).toEqual(['체중을 왼발에 실어 보세요']);
  });

  it('레슨에서 실제로 쓰일 수 있는 말은 지우지 않는다', () => {
    const turns = parseTranscriptTurns(
      JSON.stringify({
        turns: [
          { speaker: 'student', text: '감사합니다' },
          { speaker: 'coach', text: '오늘은 여기까지 할게요' },
        ],
      })
    );
    expect(turns).toHaveLength(2);
  });
});

describe('전사 프롬프트', () => {
  it('말이 없는 구간은 비워 두는 것이 정답이라고 알려 준다', () => {
    const prompt = buildTranscribePrompt({
      studentName: '김회원',
      index: 0,
      startSec: 0,
      durationSec: 20,
    });
    expect(prompt).toContain('말이 한 마디도 없을 수 있습니다');
    expect(prompt).toContain('{"turns":[]}');
    expect(prompt).toContain('지어 넣는 것이 이 작업에서 가장 큰 실패');
  });
});
