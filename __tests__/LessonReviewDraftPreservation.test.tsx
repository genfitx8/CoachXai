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
