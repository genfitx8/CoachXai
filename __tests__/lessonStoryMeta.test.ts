/**
 * generateLessonStoryMeta — 스토리 표지 문구 생성.
 *
 * 이 함수의 계약은 "실패해도 화면이 그대로여야 한다"는 것이다. 그래서
 * 성공 경로보다 **부르지 않는 조건과 실패 경로**를 더 촘촘히 잡는다:
 *
 *  - 뽑아낼 글이 없으면 아예 호출하지 않는다(제목만으로 지어내지 않게)
 *  - 코치가 정한 헤드라인은 덮지 않는다
 *  - 코치 최종본(reviewSections)이 AI 초안·요약보다 우선 입력된다
 *  - 응답이 깨지거나 네트워크가 죽으면 undefined — 던지지 않는다
 *
 * 백엔드 경계는 이 저장소의 다른 geminiService 테스트와 같이 `fetch` 에서
 * 끊는다. 모듈 내부 호출은 부분 모킹으로 가로챌 수 없기도 하고, 실제
 * 요청 조립 경로까지 함께 지나가는 편이 낫다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateLessonStoryMeta } from '../services/geminiService';
import type { Lesson } from '../types';

const lesson = (over: Partial<Lesson> = {}): Lesson => ({
  id: 'l1',
  clientName: '이수진',
  clientPhone: '01000000000',
  createdBy: 'COACH',
  date: '2026-08-19',
  title: '드라이버 교정',
  videoUrl: '',
  mediaType: 'video',
  coachNotes: '',
  tags: [],
  createdAt: 1,
  ...over,
});

/** 모델이 부를 만한 길이의 본문. 20자 미만이면 함수가 호출 자체를 건너뛴다. */
const BODY =
  '오늘은 드라이버 슬라이스를 잡는 데 시간을 거의 다 썼습니다. 백스윙 탑에서 오른팔이 몸에서 떨어지는 것이 원인이었어요.';

/** /api/ai/invoke 가 `result` 로 무엇을 돌려줄지 정해 둔다. */
const mockAiResult = (result: unknown) =>
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, result }),
  } as Response);

/** 마지막 요청에 실려 나간 프롬프트. 전송 형태는 { feature, payload }. */
const sentPrompt = (): string => {
  const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1);
  const sent = JSON.parse(String((call?.[1] as RequestInit)?.body)) as {
    feature: string;
    payload: { prompt: string };
  };
  expect(sent.feature).toBe('lesson_story_meta');
  return sent.payload.prompt;
};

const fetchCallCount = () =>
  (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('generateLessonStoryMeta — 부르지 않는 조건', () => {
  it('뽑아낼 글이 없으면 AI 를 부르지 않는다', async () => {
    // 제목만 있는 기록에 제목을 지어내라고 하면 지어낼 수밖에 없다.
    mockAiResult({ headline: '부르면 안 된다' });
    expect(await generateLessonStoryMeta(lesson())).toBeUndefined();
    expect(fetchCallCount()).toBe(0);
  });

  it('본문이 20자 미만이면 부르지 않는다', async () => {
    mockAiResult({ headline: '부르면 안 된다' });
    const result = await generateLessonStoryMeta(
      lesson({ reviewSections: { feedback: '좋았어요' } })
    );
    expect(result).toBeUndefined();
    expect(fetchCallCount()).toBe(0);
  });

  it('코치가 직접 정한 헤드라인은 덮지 않는다', async () => {
    mockAiResult({ headline: '부르면 안 된다' });
    const result = await generateLessonStoryMeta(
      lesson({
        reviewSections: { feedback: BODY },
        story: { headline: '코치가 쓴 제목', editedByCoach: true },
      })
    );
    expect(result).toBeUndefined();
    expect(fetchCallCount()).toBe(0);
  });

  it('editedByCoach 라도 헤드라인이 비어 있으면 지어준다', async () => {
    mockAiResult({ headline: '오른팔이 붙은 날' });
    const result = await generateLessonStoryMeta(
      lesson({
        reviewSections: { feedback: BODY },
        story: { editedByCoach: true, captions: { a: '캡션' } },
      })
    );
    expect(result?.headline).toBe('오른팔이 붙은 날');
  });
});

describe('generateLessonStoryMeta — 입력 우선순위', () => {
  it('코치 최종본이 AI 요약보다 앞에 실린다', async () => {
    mockAiResult({ headline: 'x' });
    await generateLessonStoryMeta(
      lesson({
        reviewSections: { todayCovered: '코치최종본입니다', feedback: BODY },
        liveLessonDetail: {
          recordedDurationSec: 60,
          transcript: [],
          summary: 'AI요약입니다',
        },
      })
    );
    const prompt = sentPrompt();
    expect(prompt.indexOf('코치최종본입니다')).toBeLessThan(prompt.indexOf('AI요약입니다'));
  });

  it('reviewSections 가 없는 구 기록도 aiAnalysis 로 조립된다', async () => {
    mockAiResult({ headline: 'x' });
    await generateLessonStoryMeta(lesson({ aiAnalysis: BODY }));
    expect(sentPrompt()).toContain(BODY);
  });

  it('키워드와 할 일을 프롬프트에 함께 싣는다', async () => {
    mockAiResult({ headline: 'x' });
    await generateLessonStoryMeta(
      lesson({
        reviewSections: { feedback: BODY, nextActions: ['타월 드릴'] },
        liveLessonDetail: {
          recordedDurationSec: 60,
          transcript: [],
          keyPoints: ['오른팔 붙이기'],
        },
      })
    );
    const prompt = sentPrompt();
    expect(prompt).toContain('오른팔 붙이기');
    expect(prompt).toContain('타월 드릴');
  });

  it('본문이 아무리 길어도 프롬프트에 통째로 싣지 않는다', async () => {
    mockAiResult({ headline: 'x' });
    const huge = '가'.repeat(20_000);
    await generateLessonStoryMeta(lesson({ reviewSections: { feedback: huge } }));
    expect(sentPrompt()).not.toContain('가'.repeat(5_000));
  });
});

describe('generateLessonStoryMeta — 응답 처리', () => {
  it('헤드라인과 리드를 다듬어 돌려준다', async () => {
    mockAiResult({
      headline: '  오른팔이 붙기 시작한 날  ',
      dek: '  3주째 잡던 슬라이스가 처음으로 줄었다  ',
    });
    const result = await generateLessonStoryMeta(
      lesson({ reviewSections: { feedback: BODY } })
    );
    expect(result).toEqual({
      headline: '오른팔이 붙기 시작한 날',
      dek: '3주째 잡던 슬라이스가 처음으로 줄었다',
    });
  });

  it('리드가 비면 undefined 로 둔다 — 빈 문자열을 표지에 싣지 않는다', async () => {
    mockAiResult({ headline: '제목', dek: '   ' });
    const result = await generateLessonStoryMeta(
      lesson({ reviewSections: { feedback: BODY } })
    );
    expect(result?.dek).toBeUndefined();
  });

  it('모델이 지침보다 길게 써도 표지가 깨지지 않게 자른다', async () => {
    mockAiResult({ headline: '가'.repeat(120), dek: '나'.repeat(200) });
    const result = await generateLessonStoryMeta(
      lesson({ reviewSections: { feedback: BODY } })
    );
    expect(result!.headline.length).toBeLessThanOrEqual(40);
    expect(result!.dek!.length).toBeLessThanOrEqual(80);
  });

  it('JSON 문자열로 와도 파싱한다', async () => {
    mockAiResult(JSON.stringify({ headline: '문자열 응답', dek: '리드' }));
    const result = await generateLessonStoryMeta(
      lesson({ reviewSections: { feedback: BODY } })
    );
    expect(result?.headline).toBe('문자열 응답');
  });
});

describe('generateLessonStoryMeta — 실패 경로', () => {
  it('헤드라인이 없는 응답은 실패로 보고 undefined 를 돌려준다', async () => {
    mockAiResult({ dek: '리드만 왔다' });
    await expect(
      generateLessonStoryMeta(lesson({ reviewSections: { feedback: BODY } }))
    ).resolves.toBeUndefined();
  });

  it('백엔드가 503 이어도 던지지 않는다 — 승인 흐름을 깨면 안 된다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ ok: false, error: 'Agent Runtime is not configured.' }),
    } as Response);
    await expect(
      generateLessonStoryMeta(lesson({ reviewSections: { feedback: BODY } }))
    ).resolves.toBeUndefined();
  });

  it('네트워크가 죽어도 던지지 않는다', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    await expect(
      generateLessonStoryMeta(lesson({ reviewSections: { feedback: BODY } }))
    ).resolves.toBeUndefined();
  });

  it('응답이 null 이어도 조용히 끝난다', async () => {
    mockAiResult(null);
    await expect(
      generateLessonStoryMeta(lesson({ reviewSections: { feedback: BODY } }))
    ).resolves.toBeUndefined();
  });
});
