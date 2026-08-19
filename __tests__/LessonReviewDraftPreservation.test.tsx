/**
 * AI 초안 보존 (docs/DATA_ARCHITECTURE.md §6.1 — 데이터 가치 1위).
 *
 * 지금까지 검토 화면은 `reviewSections` 한 칸만 저장했고, 코치가 고치면
 * AI 원안은 그 자리에서 사라졌다. "AI 초안 vs 코치 최종본"은 코치가
 * 실제 업무 중에 만들어 주는 선호 라벨(DPO 학습쌍)이라 돈 주고도 못 사는
 * 데이터인데, 매 레슨 그게 덮어써지고 있었던 것이다.
 *
 * 이 테스트는 승인 시 원안이 함께 올라가는 배선을 못 박는다.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Lesson, LessonReviewSections } from '../types';

const AI_DRAFT: LessonReviewSections = {
  todayCovered: '드라이버 슬라이스 교정',
  feedback: '백스윙에서 오른팔이 매달립니다.',
  nextActions: ['타월 드릴 10분'],
};

vi.mock('../services/geminiService', () => ({
  generateLessonReviewDraft: vi.fn(async () => AI_DRAFT),
}));
vi.mock('../services/coachStyleService', () => ({
  coachStyleService: { save: vi.fn(async () => undefined) },
  tierForSource: () => 1 as const,
}));
vi.mock('../services/aiFeedbackService', () => ({
  aiFeedbackService: { record: vi.fn() },
}));

import { LessonReviewScreen } from '../components/LessonReviewScreen';
import { aiFeedbackService } from '../services/aiFeedbackService';
import { generateLessonReviewDraft } from '../services/geminiService';

const baseLesson = (overrides: Partial<Lesson> = {}): Lesson =>
  ({
    id: 'lesson-1',
    clientName: '김한나',
    clientPhone: '010-0000-0000',
    createdBy: 'COACH',
    date: '2026-08-19',
    title: '드라이버 레슨',
    videoUrl: '',
    mediaType: 'video',
    coachNotes: '',
    tags: [],
    createdAt: 1,
    ...overrides,
  }) as Lesson;

const renderScreen = (lesson: Lesson, handlers: Record<string, unknown> = {}) =>
  render(
    <LessonReviewScreen
      lesson={lesson}
      coachId="coach-1"
      onSaveDraft={vi.fn(async () => undefined)}
      onApprove={vi.fn(async () => undefined)}
      onBack={vi.fn()}
      {...handlers}
    />
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LessonReviewScreen · AI 초안 보존', () => {
  it('승인 시 AI 원안을 최종본과 함께 올린다', async () => {
    const onApprove = vi.fn(async () => undefined);
    renderScreen(baseLesson(), { onApprove });

    // 첫 방문 자동 초안이 화면에 얹힐 때까지 기다린다.
    await waitFor(() =>
      expect(screen.getByDisplayValue('드라이버 슬라이스 교정')).toBeTruthy()
    );

    await userEvent.click(screen.getByRole('button', { name: /승인/ }));

    await waitFor(() => expect(onApprove).toHaveBeenCalled());
    const patch = onApprove.mock.calls[0][0] as {
      reviewSections: LessonReviewSections;
      reviewSectionsDraft?: LessonReviewSections;
    };
    expect(patch.reviewSectionsDraft).toEqual(AI_DRAFT);
    expect(patch.reviewSections.feedback).toBe(AI_DRAFT.feedback);
  });

  it('코치가 고친 뒤 승인해도 원안은 고치기 전 그대로다 — 이 둘의 차이가 학습쌍이다', async () => {
    const onApprove = vi.fn(async () => undefined);
    renderScreen(baseLesson(), { onApprove });

    const feedbackBox = await screen.findByDisplayValue(AI_DRAFT.feedback!);
    await userEvent.clear(feedbackBox);
    await userEvent.type(feedbackBox, '오른팔보다 골반 회전이 먼저 멈춥니다.');

    await userEvent.click(screen.getByRole('button', { name: /승인/ }));

    await waitFor(() => expect(onApprove).toHaveBeenCalled());
    const patch = onApprove.mock.calls[0][0] as {
      reviewSections: LessonReviewSections;
      reviewSectionsDraft?: LessonReviewSections;
    };
    expect(patch.reviewSectionsDraft?.feedback).toBe(AI_DRAFT.feedback);
    expect(patch.reviewSections.feedback).toBe('오른팔보다 골반 회전이 먼저 멈춥니다.');
  });

  it('이미 초안이 저장된 레슨에는 다시 보내지 않는다 (서버 write-once와 짝을 맞춘다)', async () => {
    const onApprove = vi.fn(async () => undefined);
    renderScreen(
      baseLesson({
        reviewSections: { feedback: '코치가 이미 정리한 내용' },
        reviewSectionsDraft: { feedback: '예전 AI 원안' },
      }),
      { onApprove }
    );

    await userEvent.click(screen.getByRole('button', { name: /승인/ }));

    await waitFor(() => expect(onApprove).toHaveBeenCalled());
    const patch = onApprove.mock.calls[0][0] as {
      reviewSectionsDraft?: LessonReviewSections;
    };
    expect(patch.reviewSectionsDraft).toBeUndefined();
  });

  /**
   * 레슨 동반 기록은 레슨 종료 직후 검토 화면에서 코치가 필기·요약을
   * 확인·수정해 저장한다 — 이미 한 번 요약을 마친 기록이다. 검토 화면이
   * 첫 방문마다 AI 초안을 새로 뽑으면 같은 레슨을 두 번 요약하는 셈이고,
   * 코치가 고른 문장이 새 초안에 밀린다.
   */
  it('레슨 동반 요약본이 있으면 자동 초안을 돌리지 않고 그 요약을 그대로 채운다', async () => {
    const onApprove = vi.fn(async () => undefined);
    renderScreen(
      baseLesson({
        recordType: 'LIVE_LESSON',
        liveLessonDetail: {
          recordedDurationSec: 1800,
          transcript: [{ startSec: 0, text: '그립 압력을 부드럽게' }],
          summary: '- 그립 압력 교정\n- 백스윙 템포 일정하게',
          drills: ['빈 스윙 10회'],
        },
      }),
      { onApprove }
    );

    // 코치 확인본이 "오늘 다룬 것"에 그대로 들어온다(줄바꿈은 조회 시 공백으로 정규화된다).
    await waitFor(() =>
      expect(screen.getByDisplayValue(/그립 압력 교정.*백스윙 템포 일정하게/)).toBeTruthy()
    );
    // 레슨 중 잡힌 드릴이 다음 액션의 출발점이 된다.
    expect(screen.getByDisplayValue('빈 스윙 10회')).toBeTruthy();
    // AI 초안은 돌지 않는다.
    expect(generateLessonReviewDraft).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /승인/ }));
    await waitFor(() => expect(onApprove).toHaveBeenCalled());
    const patch = onApprove.mock.calls[0][0] as {
      reviewSections: LessonReviewSections;
      reviewSectionsDraft?: LessonReviewSections;
    };
    expect(patch.reviewSections.todayCovered).toBe(
      '- 그립 압력 교정\n- 백스윙 템포 일정하게'
    );
    // AI 가 쓴 원안이 없으므로 학습쌍도 남기지 않는다.
    expect(patch.reviewSectionsDraft).toBeUndefined();
  });

  it('코치가 누른 재생성은 버려지는 원안과 함께 부정 라벨로 남는다', async () => {
    renderScreen(baseLesson());

    await waitFor(() =>
      expect(screen.getByDisplayValue('드라이버 슬라이스 교정')).toBeTruthy()
    );
    await userEvent.click(screen.getByRole('button', { name: /초안|재생성|다시/ }));

    expect(aiFeedbackService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'regenerated',
        entityId: 'lesson-1',
        originalOutput: expect.stringContaining('오른팔이 매달립니다'),
      })
    );
  });
});
