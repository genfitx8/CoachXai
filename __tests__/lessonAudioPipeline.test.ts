/**
 * lessonAudioPipeline 순수 로직 테스트.
 *
 * 녹음(MediaRecorder)·IndexedDB 는 브라우저 통합 영역이라 여기서는
 * 파이프라인의 판단 로직을 검증한다:
 *  - 세그먼트 분석 응답 파싱(스키마 미지원 런타임 방어 포함)
 *  - map-reduce 병합 프롬프트 조립(실패 구간 명시, 시간창 표기)
 *  - 재시도 큐(동시성 제한, 백오프 재시도, give-up 콜백, settle)
 */
import { describe, it, expect, vi } from 'vitest';

// 파이프라인이 끌고 들어오는 무거운 의존성(AI 게이트웨이, 프롬프트 관리,
// firebase)은 순수 로직 테스트에 필요 없다 — 전부 스텁으로 끊는다.
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
  parseSegmentNoteResponse,
  parseTranscriptResponse,
  buildSegmentPrompt,
  buildTranscribePrompt,
  buildMergePrompt,
  buildRollingSummaryPrompt,
  formatClock,
  audioExtensionForMime,
  SegmentAnalysisQueue,
  RollingSummaryController,
  type LessonSegmentNote,
} from '../services/lessonAudioPipeline';

const noteBase = { index: 0, startSec: 0, durationSec: 180 };

describe('formatClock', () => {
  it('renders minutes and hours', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});

describe('audioExtensionForMime', () => {
  it('maps container mime to extension', () => {
    expect(audioExtensionForMime('audio/webm;codecs=opus')).toBe('webm');
    expect(audioExtensionForMime('audio/mp4')).toBe('m4a');
  });
});

describe('parseSegmentNoteResponse', () => {
  it('parses a well-formed JSON response', () => {
    const note = parseSegmentNoteResponse(
      JSON.stringify({
        transcript: '백스윙 탑에서 오버스윙 교정.',
        keyPoints: ['오버스윙 줄이기', ' 코킹 유지 '],
        drills: ['하프스윙 드릴'],
        metrics: ['드라이버 캐리 210m'],
        studentState: '탑 위치가 안정되기 시작함',
      }),
      noteBase
    );
    expect(note.status).toBe('done');
    expect(note.transcript).toBe('백스윙 탑에서 오버스윙 교정.');
    expect(note.keyPoints).toEqual(['오버스윙 줄이기', '코킹 유지']);
    expect(note.drills).toEqual(['하프스윙 드릴']);
    expect(note.metrics).toEqual(['드라이버 캐리 210m']);
    expect(note.studentState).toBe('탑 위치가 안정되기 시작함');
  });

  it('tolerates prose-wrapped JSON (schema-less legacy runtime)', () => {
    const note = parseSegmentNoteResponse(
      '분석 결과는 다음과 같습니다:\n{"transcript":"임팩트 구간 피드백","keyPoints":["헤드업 방지"],"drills":[],"metrics":[],"studentState":""}\n이상입니다.',
      noteBase
    );
    expect(note.transcript).toBe('임팩트 구간 피드백');
    expect(note.keyPoints).toEqual(['헤드업 방지']);
  });

  it('falls back to raw text as transcript when no JSON is present', () => {
    const note = parseSegmentNoteResponse('그립 교정에 대한 구간이었습니다.', noteBase);
    expect(note.transcript).toBe('그립 교정에 대한 구간이었습니다.');
    expect(note.keyPoints).toEqual([]);
  });

  it('drops non-string array entries defensively', () => {
    const note = parseSegmentNoteResponse(
      JSON.stringify({ transcript: 't', keyPoints: ['a', 3, null, ''], drills: 'x' }),
      noteBase
    );
    expect(note.keyPoints).toEqual(['a']);
    expect(note.drills).toEqual([]);
  });
});

describe('parseTranscriptResponse', () => {
  it('parses the JSON text field', () => {
    expect(parseTranscriptResponse('{"text":"백스윙에서 힘 빼세요."}')).toBe(
      '백스윙에서 힘 빼세요.'
    );
  });

  it('returns empty string for silent segments', () => {
    expect(parseTranscriptResponse('{"text":""}')).toBe('');
    expect(parseTranscriptResponse('(대화 없음)')).toBe('');
  });

  it('falls back to plain text when no JSON is present', () => {
    expect(parseTranscriptResponse('그립을 조금 더 짧게 잡아볼게요.')).toBe(
      '그립을 조금 더 짧게 잡아볼게요.'
    );
  });
});

describe('buildTranscribePrompt', () => {
  it('carries the time window and forbids summarizing', () => {
    const prompt = buildTranscribePrompt({
      studentName: '김회원',
      index: 12,
      startSec: 120,
      durationSec: 10,
      previousKeyPoints: [],
    });
    expect(prompt).toContain('2:00–2:10');
    expect(prompt).toContain('요약하지 마세요');
  });
});

describe('buildSegmentPrompt', () => {
  it('includes the time window and prior key points', () => {
    const prompt = buildSegmentPrompt({
      studentName: '김회원',
      index: 2,
      startSec: 360,
      durationSec: 180,
      previousKeyPoints: ['오버스윙 줄이기'],
    });
    expect(prompt).toContain('김회원');
    expect(prompt).toContain('6:00–9:00');
    expect(prompt).toContain('오버스윙 줄이기');
  });

  it('omits the prior-points block on the first segment', () => {
    const prompt = buildSegmentPrompt({
      studentName: '김회원',
      index: 0,
      startSec: 0,
      durationSec: 180,
      previousKeyPoints: [],
    });
    expect(prompt).not.toContain('이전 구간까지의 핵심 포인트');
  });
});

describe('buildMergePrompt', () => {
  const doneNote = (index: number, extra: Partial<LessonSegmentNote> = {}): LessonSegmentNote => ({
    index,
    startSec: index * 180,
    durationSec: 180,
    status: 'done',
    transcript: `구간 ${index} 전사`,
    keyPoints: [`포인트${index}`],
    drills: [],
    metrics: [],
    studentState: '',
    ...extra,
  });

  it('orders segments by index and carries coach notes', () => {
    const prompt = buildMergePrompt(
      [doneNote(1), doneNote(0)],
      '오늘은 드라이버 위주',
      { studentName: '김회원', totalDurationSec: 2400 }
    );
    expect(prompt.indexOf('구간 0 전사')).toBeLessThan(prompt.indexOf('구간 1 전사'));
    expect(prompt).toContain('오늘은 드라이버 위주');
    expect(prompt).toContain('약 40분');
    expect(prompt).toContain('분석 구간**: 2/2');
  });

  it('marks failed segments instead of silently dropping them', () => {
    const failed: LessonSegmentNote = { ...doneNote(1), status: 'failed' };
    const prompt = buildMergePrompt([doneNote(0), failed], '');
    expect(prompt).toContain('오디오 분석에 실패');
    expect(prompt).toContain('분석 구간**: 1/2');
  });

  it('renders time windows for each segment', () => {
    const prompt = buildMergePrompt([doneNote(2)], '');
    expect(prompt).toContain('[6:00–9:00]');
  });

  it('drops silent (empty-transcript) segments entirely', () => {
    const silent = doneNote(1, {
      transcript: '',
      keyPoints: [],
      drills: [],
      metrics: [],
      studentState: '',
    });
    const prompt = buildMergePrompt([doneNote(0), silent], '');
    expect(prompt).not.toContain('(대화 없음)');
    expect(prompt).toContain('분석 구간**: 1/1');
  });
});

describe('buildRollingSummaryPrompt', () => {
  const note = (index: number, status: LessonSegmentNote['status'] = 'done'): LessonSegmentNote => ({
    index,
    startSec: index * 120,
    durationSec: 120,
    status,
    transcript: `구간 ${index} 전사`,
    keyPoints: [`포인트${index}`],
    drills: [],
    metrics: index === 1 ? ['캐리 210m'] : [],
    studentState: '',
  });

  it('includes only done segments, in order, with metrics quoted', () => {
    const prompt = buildRollingSummaryPrompt([note(1), note(0), note(2, 'analyzing')], '김회원');
    expect(prompt).toContain('김회원');
    expect(prompt.indexOf('구간 0 전사')).toBeLessThan(prompt.indexOf('구간 1 전사'));
    expect(prompt).not.toContain('구간 2 전사');
    expect(prompt).toContain('캐리 210m');
    expect(prompt).toContain('불릿');
  });
});

describe('RollingSummaryController', () => {
  const doneNote = (index: number): LessonSegmentNote => ({
    index,
    startSec: index * 120,
    durationSec: 120,
    status: 'done',
    transcript: 't',
    keyPoints: [],
    drills: [],
    metrics: [],
    studentState: '',
  });

  it('runs a single flight and a trailing update for notes arriving mid-flight', async () => {
    const calls: number[] = [];
    const resolvers: Array<(v: string) => void> = [];
    const controller = new RollingSummaryController(
      (notes) =>
        new Promise<string>((resolve) => {
          calls.push(notes.length);
          resolvers.push(resolve);
        }),
      vi.fn()
    );

    controller.notify([doneNote(0)], 's');
    // 비행 중 두 번 더 도착 — 합쳐서 트레일링 1회만 더 돌아야 한다.
    controller.notify([doneNote(0), doneNote(1)], 's');
    controller.notify([doneNote(0), doneNote(1), doneNote(2)], 's');
    expect(calls).toEqual([1]);

    resolvers[0]('요약1');
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toEqual([1, 3]); // 트레일링은 최신 노트(3개)로 1회

    resolvers[1]('요약2');
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toEqual([1, 3]);
    expect(controller.isUpdating).toBe(false);
  });

  it('delivers summaries via onUpdate and keeps the old one on failure', async () => {
    const updates: string[] = [];
    let fail = false;
    const controller = new RollingSummaryController(
      async () => {
        if (fail) throw new Error('down');
        return '요약';
      },
      (s) => updates.push(s)
    );

    controller.notify([doneNote(0)], 's');
    await new Promise((r) => setTimeout(r, 0));
    expect(updates).toEqual(['요약']);

    fail = true;
    controller.notify([doneNote(0), doneNote(1)], 's');
    await new Promise((r) => setTimeout(r, 0));
    expect(updates).toEqual(['요약']); // 실패해도 이전 요약 유지(onUpdate 미호출)
  });

  it('does nothing when no segment has finished', async () => {
    const summarize = vi.fn(async () => 'x');
    const controller = new RollingSummaryController(summarize, vi.fn());
    controller.notify([{ ...doneNote(0), status: 'analyzing' }], 's');
    await new Promise((r) => setTimeout(r, 0));
    expect(summarize).not.toHaveBeenCalled();
  });
});

describe('SegmentAnalysisQueue', () => {
  const instantSleep = () => Promise.resolve();

  it('retries a failing task up to maxAttempts then gives up', async () => {
    const queue = new SegmentAnalysisQueue(2, 3, () => 0, instantSleep);
    let attempts = 0;
    const gaveUp = vi.fn();
    queue.enqueue(
      0,
      async () => {
        attempts += 1;
        throw new Error('boom');
      },
      gaveUp
    );
    await queue.settle();
    expect(attempts).toBe(3);
    expect(gaveUp).toHaveBeenCalledTimes(1);
  });

  it('succeeds on a later attempt without invoking give-up', async () => {
    const queue = new SegmentAnalysisQueue(1, 3, () => 0, instantSleep);
    let attempts = 0;
    const gaveUp = vi.fn();
    queue.enqueue(
      0,
      async () => {
        attempts += 1;
        if (attempts < 2) throw new Error('transient');
      },
      gaveUp
    );
    await queue.settle();
    expect(attempts).toBe(2);
    expect(gaveUp).not.toHaveBeenCalled();
  });

  it('caps concurrency', async () => {
    const queue = new SegmentAnalysisQueue(2, 1, () => 0, instantSleep);
    let running = 0;
    let peak = 0;
    let started = 0;
    const resolvers: Array<() => void> = [];
    for (let i = 0; i < 5; i++) {
      queue.enqueue(i, async () => {
        started += 1;
        running += 1;
        peak = Math.max(peak, running);
        await new Promise<void>((r) => resolvers.push(r));
        running -= 1;
      });
    }
    // 큐가 첫 2개를 태울 때까지 마이크로태스크 양보
    await Promise.resolve();
    expect(queue.pendingCount).toBe(5);
    while (started < 5 || resolvers.length > 0) {
      resolvers.splice(0).forEach((r) => r());
      await new Promise((r) => setTimeout(r, 0));
    }
    await queue.settle();
    expect(peak).toBeLessThanOrEqual(2);
    expect(queue.pendingCount).toBe(0);
  });

  it('settle with timeout returns even while a task hangs', async () => {
    const queue = new SegmentAnalysisQueue(1, 1, () => 0, instantSleep);
    queue.enqueue(0, () => new Promise(() => {}));
    const started = Date.now();
    await queue.settle(50);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(queue.pendingCount).toBe(1);
  });
});
