/**
 * 라이브 오타 교정 — 레슨 중에 방금 적힌 줄이 스스로 다듬어지는 경로.
 *
 * 2초 조각 받아쓰기는 빠른 대신 골프 용어를 자주 놓친다. 몇 줄이 모이면
 * 그 묶음을 통째로 다시 읽어 코칭 언어로 되돌린다 — 코치 눈에는 방금 적힌
 * 글이 잠시 뒤 고쳐지는 것으로 보이고, 그게 "AI가 따라 적으며 정리하고
 * 있다"는 신뢰의 근거가 된다.
 *
 * 계약:
 *  - 줄이 충분히 모이면 교정이 돈다.
 *  - 한 줄은 한 번만 손본다(확정된 필기가 레슨 내내 흔들리면 안 된다).
 *  - 교정에 실패해도 원문은 남는다.
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
  LIVE_QUEUE_MAX_PENDING,
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
    const bytes = new Uint8Array([1, 2, 3, ...CLUSTER, this.n]);
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

describe('라이브 오타 교정', () => {
  beforeEach(() => {
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    // AudioContext 없음 = 말소리 측정 불가 → 게이트 없이 전부 전사한다.
    vi.stubGlobal('AudioContext', undefined);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const makeSession = (repairer: (prompt: string) => Promise<string>) =>
    new LessonAudioSession({
      studentName: '테스트',
      segmentTargetSec: 1,
      liveRepairIntervalMs: 5_000,
      transcriptRepairer: repairer,
      analyzer: async (_b, _m, ctx) =>
        ({
          index: ctx.index,
          startSec: ctx.startSec,
          durationSec: ctx.durationSec,
          status: 'done',
          transcript: `얼리 익스텐숀 ${ctx.index}`,
          keyPoints: [],
          drills: [],
          metrics: [],
          studentState: '',
        }) as LessonSegmentNote,
      rollingSummarizer: async () => '- 요약',
    });

  const runFor = async (session: LessonAudioSession, seconds: number) => {
    await session.start({} as MediaStream);
    for (let i = 0; i < seconds; i++) await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);
  };

  it('줄이 모이면 오타를 코칭 용어로 되돌린다', async () => {
    const repairer = vi.fn(async (prompt: string) => {
      // 프롬프트에 실린 줄 번호를 그대로 받아 코칭 용어로 고쳐 돌려준다.
      const ids = [...prompt.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
      return JSON.stringify({
        fixes: ids.map((i) => ({ i, text: `얼리 익스텐션 ${i}` })),
      });
    });
    const session = makeSession(repairer);
    await runFor(session, 8);

    expect(repairer).toHaveBeenCalled();
    // 교정이 돈 시점까지의 줄은 코칭 용어로 바뀌어 있다. 그 뒤에 적힌 줄은
    // 다음 주기 몫이라 아직 원문이다 — 그게 "위에서부터 다듬어지는" 모습이다.
    const notes = session.getNotes();
    expect(notes.length).toBeGreaterThan(4);
    expect(notes.slice(0, 4).every((n) => n.transcript.startsWith('얼리 익스텐션'))).toBe(
      true
    );
    expect(notes.slice(0, 4).every((n) => n.repaired)).toBe(true);

    await session.discard();
  });

  it('이미 손본 줄은 다시 고치지 않는다', async () => {
    const seen: number[] = [];
    const repairer = vi.fn(async (prompt: string) => {
      const ids = [...prompt.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
      seen.push(ids.length);
      return JSON.stringify({ fixes: [] });
    });
    const session = makeSession(repairer);
    await runFor(session, 20);

    // 매 주기마다 "새로 적힌 줄"만 대상이 된다 — 누적으로 커지지 않는다.
    expect(seen.length).toBeGreaterThan(1);
    expect(Math.max(...seen)).toBeLessThan(12);

    await session.discard();
  });

  it('전사가 크게 밀리면 라이브 필기를 건너뛰어 뒤처지지 않게 한다', async () => {
    // 응답이 오지 않는 상태 — 조각은 계속 쌓이고 큐는 비지 않는다.
    const session = new LessonAudioSession({
      studentName: '테스트',
      segmentTargetSec: 1,
      liveRepairIntervalMs: 0,
      analyzer: () => new Promise(() => {}),
      rollingSummarizer: async () => '- 요약',
    });
    await session.start({} as MediaStream);
    for (let i = 0; i < 60; i++) await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);

    // 60초 동안 조각은 60개가 나왔지만, 밀린 뒤로는 큐에 넣지 않는다.
    const analyzing = session
      .getNotes()
      .filter((n) => n.status === 'analyzing').length;
    expect(analyzing).toBeGreaterThan(0);
    expect(analyzing).toBeLessThanOrEqual(LIVE_QUEUE_MAX_PENDING);

    await session.discard();
  });

  it('교정이 실패해도 받아 적은 원문은 남는다', async () => {
    const repairer = vi.fn(async () => {
      throw new Error('네트워크 실패');
    });
    const session = makeSession(repairer);
    await runFor(session, 8);

    const texts = session.getNotes().map((n) => n.transcript);
    expect(texts.every((t) => t.startsWith('얼리 익스텐숀'))).toBe(true);

    await session.discard();
  });
});
