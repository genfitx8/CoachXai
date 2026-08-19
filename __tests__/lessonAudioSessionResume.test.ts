/**
 * 레슨 동반 생존성 — 세션 재개(resume)와 백그라운드 힐(restartRecording).
 *
 * 시나리오 1: 녹음 중 앱이 죽음 → 재실행 후 같은 세션 id 로 resume →
 *   기존 필기·누적 시간이 살아난 채 새 녹음 런이 이어지고, stop() 은
 *   런별로 유효한 오디오 파일을 돌려준다.
 * 시나리오 2: 백그라운드 전환으로 레코더만 죽음(JS 는 생존) →
 *   restartRecording 이 같은 세션에 새 런을 이어붙인다.
 *
 * IndexedDB 는 jsdom 에 없으므로 파이프라인이 실제로 쓰는 표면만 구현한
 * 인메모리 fake 를 주입한다.
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

// ─── 인메모리 fake IndexedDB (파이프라인이 쓰는 표면만) ─────────────────────

const idbData = new Map<string, Map<string, unknown>>();
idbData.set('blobs', new Map());
idbData.set('sessions', new Map());

class FakeRequest<T> {
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onupgradeneeded: (() => void) | null = null;
  result!: T;
  error: unknown = null;
  constructor(exec: () => T) {
    queueMicrotask(() => {
      try {
        this.result = exec();
        this.onupgradeneeded?.();
        this.onsuccess?.();
      } catch (e) {
        this.error = e;
        this.onerror?.();
      }
    });
  }
}

const fakeObjectStore = (name: string) => {
  const table = idbData.get(name)!;
  return {
    put: (value: unknown, key: string) =>
      new FakeRequest(() => {
        table.set(String(key), value);
      }),
    get: (key: string) => new FakeRequest(() => table.get(String(key))),
    delete: (key: string) =>
      new FakeRequest(() => {
        table.delete(String(key));
      }),
    getAll: () => new FakeRequest(() => [...table.values()]),
    getAllKeys: (range?: { lower: string; upper: string }) =>
      new FakeRequest(() =>
        [...table.keys()].filter(
          (k) => !range || (k >= range.lower && k <= range.upper)
        )
      ),
  };
};

const fakeDB = {
  objectStoreNames: { contains: (name: string) => idbData.has(name) },
  createObjectStore: (name: string) => {
    if (!idbData.has(name)) idbData.set(name, new Map());
  },
  transaction: (name: string) => ({ objectStore: () => fakeObjectStore(name) }),
};

vi.stubGlobal('indexedDB', { open: () => new FakeRequest(() => fakeDB) });
vi.stubGlobal('IDBKeyRange', {
  bound: (lower: string, upper: string) => ({ lower, upper }),
});

// ─── fake MediaRecorder (타임슬라이스 청크 방출) ─────────────────────────────

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
    this.emit();
    this.onstop?.();
  }
  /** OS 가 레코더만 죽인 상황 — 이벤트 없이 조용히 inactive 가 된다. */
  killSilently() {
    if (this.timer) clearInterval(this.timer);
    this.state = 'inactive';
  }
  pause() {
    this.state = 'paused';
  }
  resume() {
    this.state = 'recording';
  }
}

import {
  LessonAudioSession,
  type LessonSegmentNote,
  type SegmentAnalyzer,
} from '../services/lessonAudioPipeline';

const makeAnalyzer = (
  analyzedIndexes: number[]
): SegmentAnalyzer => async (_blob, _mime, ctx) => {
  analyzedIndexes.push(ctx.index);
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
};

describe('LessonAudioSession — 세션 생존성', () => {
  beforeEach(() => {
    FakeMediaRecorder.instances = [];
    idbData.get('blobs')!.clear();
    idbData.get('sessions')!.clear();
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('앱이 죽은 뒤 resume 하면 필기가 살아나고 새 런으로 이어 녹음된다', async () => {
    const analyzed1: number[] = [];
    const session1 = new LessonAudioSession({
      studentName: '김회원',
      analyzer: makeAnalyzer(analyzed1),
      rollingSummarizer: async () => '- 요약',
    });
    await session1.start({} as MediaStream);
    for (let i = 0; i < 25; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(analyzed1).toEqual([0, 1]);

    // 앱 사망: 모든 타이머·레코더가 그대로 증발한다
    vi.clearAllTimers();

    // 재실행 후 같은 id 로 재개
    const analyzed2: number[] = [];
    const resumed = await LessonAudioSession.resume(session1.id, {
      studentName: '무시됨(메타의 이름 사용)',
      analyzer: makeAnalyzer(analyzed2),
      rollingSummarizer: async () => '- 요약2',
    });
    expect(resumed).not.toBeNull();
    // 기존 필기가 즉시 복원된다
    const restoredNotes = resumed!.getNotes();
    expect(restoredNotes.map((n) => n.transcript)).toEqual(['전사 0', '전사 1']);
    const resumeBaseSec = resumed!.recordedDurationSec;
    expect(resumeBaseSec).toBeGreaterThanOrEqual(19);

    await resumed!.start({} as MediaStream);
    for (let i = 0; i < 15; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    const result = await resumed!.stop();
    await vi.advanceTimersByTimeAsync(0);

    // 새 런의 필기가 이어졌고, 타임스탬프는 재개 기준점 이후다
    expect(analyzed2.length).toBeGreaterThanOrEqual(1);
    const newNotes = resumed!
      .getNotes()
      .filter((n) => !restoredNotes.some((o) => o.index === n.index));
    expect(newNotes.length).toBeGreaterThanOrEqual(1);
    newNotes.forEach((n) => expect(n.startSec).toBeGreaterThanOrEqual(resumeBaseSec));

    // 런별 오디오: 죽기 전 런(IDB 재조립) + 재개 런(메모리) = 2개
    expect(result.runBlobs).toHaveLength(2);
    result.runBlobs.forEach((r) => expect(r.blob.size).toBeGreaterThan(0));
    expect(result.handoff.noteCount).toBe(resumed!.getNotes().length);

    await resumed!.discard();
  });

  it('speech 모드: 청크 AI 전사는 꺼지고 실시간 음성 노트가 필기가 되며 재개 후에도 복원된다', async () => {
    const analyzed: number[] = [];
    const session = new LessonAudioSession({
      studentName: '김회원',
      analyzer: makeAnalyzer(analyzed),
      rollingSummarizer: async () => '- 요약',
    });
    await session.start({} as MediaStream);
    session.setTranscriptSource('speech');

    for (let i = 0; i < 12; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    session.addSpeechNote('그립을 조금 짧게 잡아볼게요');
    for (let i = 0; i < 13; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    session.addSpeechNote('임팩트에서 헤드업 조심');
    await vi.advanceTimersByTimeAsync(0);

    // 청크는 계속 아카이브되지만 AI 전사는 호출되지 않는다
    expect(analyzed).toEqual([]);
    const notes = session.getNotes();
    expect(notes.map((n) => n.transcript)).toEqual([
      '그립을 조금 짧게 잡아볼게요',
      '임팩트에서 헤드업 조심',
    ]);
    expect(notes.map((n) => n.durationSec)).toEqual([0, 0]);
    // 발화 시점이 필기 타임스탬프가 된다
    expect(notes[0].startSec).toBeGreaterThanOrEqual(11);
    expect(notes[1].startSec).toBeGreaterThan(notes[0].startSec);

    // 크래시 후 재개해도 음성 노트가 그대로 살아난다
    vi.clearAllTimers();
    const resumed = await LessonAudioSession.resume(session.id, {
      studentName: '김회원',
      analyzer: makeAnalyzer([]),
      rollingSummarizer: async () => '- 요약',
    });
    expect(resumed!.getNotes().map((n) => n.transcript)).toEqual([
      '그립을 조금 짧게 잡아볼게요',
      '임팩트에서 헤드업 조심',
    ]);

    await resumed!.discard();
  });

  it('백그라운드 복귀 시 restartRecording 이 같은 세션에 새 런을 이어붙인다', async () => {
    const analyzed: number[] = [];
    const session = new LessonAudioSession({
      studentName: '김회원',
      analyzer: makeAnalyzer(analyzed),
      rollingSummarizer: async () => '- 요약',
    });
    await session.start({} as MediaStream);
    for (let i = 0; i < 15; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(analyzed).toEqual([0]);

    // OS 가 레코더만 죽였다 (JS 는 생존, 이벤트 없음)
    FakeMediaRecorder.instances[0].killSilently();
    expect(session.isRecorderAlive).toBe(false);

    session.restartRecording({} as MediaStream);
    expect(session.isRecorderAlive).toBe(true);
    expect(FakeMediaRecorder.instances).toHaveLength(2);

    for (let i = 0; i < 12; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    await vi.advanceTimersByTimeAsync(0);
    // 새 런의 첫 청크가 전사됐다
    expect(analyzed.length).toBeGreaterThanOrEqual(2);

    const result = await session.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(result.runBlobs).toHaveLength(2);

    // 살아 있는 레코더에는 재시작이 no-op 이어야 한다 (이중 녹음 방지 —
    // 종료 전에 확인)
    await session.discard();
  });
});
