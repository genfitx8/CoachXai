/**
 * 인식기 감시 — "받아쓰기가 아예 안 되는" 상태를 끊어 내는 안전장치.
 *
 * 마이크를 녹음과 인식기가 동시에 잡으면 인식기가 **오류 하나 없이 조용히**
 * 죽는 기기가 있다. 시작은 성공했다고 답했으니 필기 원천은 인식기로 잡혀
 * 있고 AI 전사는 꺼져 있어, 아무도 받아 적지 않는 상태가 레슨 내내 이어진다.
 * 인식기의 보고가 아니라 **결과**로 판단해 AI 전사로 넘긴다.
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

const CLUSTER = [0x1f, 0x43, 0xb6, 0x75];

class FakeMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: ((e?: unknown) => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private n = 0;
  constructor(public stream: unknown, public opts: unknown) {}
  private emit() {
    this.ondataavailable?.({
      data: new Blob([new Uint8Array([1, 2, 3, ...CLUSTER, this.n++])]),
    });
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
 * 사람이 말하는 마이크를 흉내낸다.
 *
 * 일정한 톤이 아니라 **끊김이 있는 신호**여야 한다. 잡음 바닥은 계속되는
 * 소리를 따라 올라가도록(기계음·환풍기) 만들어져 있어서, 쉼 없는 톤은
 * 시간이 지나면 말소리로 세지 않는 것이 정상이다. 실제 말에는 단어 사이
 * 쉼이 있고 그때 바닥이 다시 내려간다.
 */
const stubTalkingMic = () => {
  class FakeAnalyser {
    fftSize = 1024;
    private tick = 0;
    getFloatTimeDomainData(buf: Float32Array) {
      // 1.2초 말하고 0.6초 쉬는 리듬(계기는 0.1초마다 훑는다).
      const speaking = this.tick++ % 18 < 12;
      const level = speaking ? 0.2 : 0.0008;
      for (let i = 0; i < buf.length; i++) buf[i] = i % 2 === 0 ? level : -level;
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

describe('인식기 감시', () => {
  let analyzed: number[];

  const makeSession = () => {
    analyzed = [];
    return new LessonAudioSession({
      studentName: '테스트',
      segmentTargetSec: 5,
      liveRepairIntervalMs: 0,
      analyzer: async (_b, _m, ctx) => {
        analyzed.push(ctx.index);
        return {
          index: ctx.index,
          startSec: ctx.startSec,
          durationSec: ctx.durationSec,
          status: 'done',
          transcript: `AI 전사 ${ctx.index}`,
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

  const run = async (session: LessonAudioSession, seconds: number) => {
    await session.start({} as MediaStream);
    for (let i = 0; i < seconds; i++) await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);
  };

  it('말은 오가는데 인식기가 한 줄도 못 넣으면 AI 전사가 이어받는다', async () => {
    stubTalkingMic();
    const session = makeSession();
    session.setTranscriptSource('speech');
    await run(session, 30);

    // 인식기 필기는 없었고, 감시가 걸린 뒤부터 AI 전사가 들어온다.
    expect(analyzed.length).toBeGreaterThan(0);
    expect(
      session.getNotes().some((n) => n.transcript.startsWith('AI 전사'))
    ).toBe(true);

    await session.discard();
  });

  it('인식기가 받아 적고 있으면 그대로 둔다', async () => {
    stubTalkingMic();
    const session = makeSession();
    session.setTranscriptSource('speech');
    await session.start({} as MediaStream);
    for (let i = 0; i < 30; i++) {
      // 코치의 말이 계속 필기로 들어오는 정상 상태.
      if (i % 5 === 0) session.addSpeechNote(`인식 필기 ${i}`);
      await vi.advanceTimersByTimeAsync(1000);
    }
    await vi.advanceTimersByTimeAsync(0);

    expect(analyzed).toEqual([]);
    expect(
      session.getNotes().every((n) => n.transcript.startsWith('인식 필기'))
    ).toBe(true);

    await session.discard();
  });

  it('AI 전사로 넘어간 뒤 인식기가 되살아나도 두 벌로 적지 않는다', async () => {
    stubTalkingMic();
    const session = makeSession();
    session.setTranscriptSource('speech');
    await run(session, 30);

    // 감시가 걸려 원천이 AI 로 넘어간 상태에서 인식기가 뒤늦게 문장을 흘린다.
    session.addSpeechNote('뒤늦게 살아난 인식기');
    expect(
      session.getNotes().some((n) => n.transcript === '뒤늦게 살아난 인식기')
    ).toBe(false);

    await session.discard();
  });
});
