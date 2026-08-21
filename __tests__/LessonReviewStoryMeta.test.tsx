/**
 * 승인 → 스토리 표지 문구 생성 배선 테스트.
 *
 * 이 배선에서 지켜야 할 것은 단 하나다: **승인이 AI 호출을 기다리지
 * 않는다.** 승인은 코치가 학생에게 기록을 내보내는 순간이고 이미 저장
 * 왕복이 하나 걸려 있다. 표지 문구는 없어도 화면이 성립하므로(뷰가
 * lesson.title 로 폴백) 승인을 붙잡아 둘 이유가 없다.
 *
 * 그래서 여기서는 생성이 **끝나지 않은 상태**로 승인이 완료되는지, 그
 * 뒤에 도착한 문구가 기록에 붙는지, 실패해도 승인이 멀쩡한지를 본다.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// vi.mock 팩토리는 파일 최상단으로 끌어올려지므로 목 함수도 함께 올린다.
const { generateLessonStoryMeta, generateLessonReviewDraft } = vi.hoisted(() => ({
  generateLessonStoryMeta: vi.fn(),
  generateLessonReviewDraft: vi.fn(),
}));

vi.mock('../services/geminiService', () => ({
  generateLessonStoryMeta,
  generateLessonReviewDraft,
}));

vi.mock('../services/coachStyleService', () => ({
  coachStyleService: {
    listExemplars: vi.fn(async () => []),
    addExemplar: vi.fn(async () => {}),
  },
  tierForSource: vi.fn(() => 1),
}));

vi.mock('../services/aiFeedbackService', () => ({
  aiFeedbackService: { record: vi.fn() },
}));

import { LessonReviewScreen } from '../components/LessonReviewScreen';
import type { Lesson } from '../types';

const lesson: Lesson = {
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
  reviewSections: {
    todayCovered: '오늘은 슬라이스를 잡았습니다',
    feedback: '백스윙 탑에서 오른팔이 떨어지는 것이 원인이었어요',
    nextActions: ['타월 드릴'],
  },
};

type ReviewProps = React.ComponentProps<typeof LessonReviewScreen>;

const renderScreen = (over: Partial<ReviewProps> = {}) => {
  // 목을 따로 잡고 프롭 시그니처로 타입을 준다 — props 객체째 돌려주면
  // 스프레드가 타입을 넓혀 .mock 에 닿을 수 없고, 인자 없는 vi.fn() 은
  // 인자 튜플이 빈 배열로 추론돼 mock.calls[0][0] 을 읽을 수 없다.
  const onSaveDraft = vi.fn<ReviewProps['onSaveDraft']>();
  const onApprove = vi.fn<ReviewProps['onApprove']>();
  const onStoryMeta = vi.fn<NonNullable<ReviewProps['onStoryMeta']>>();
  render(
    <LessonReviewScreen
      lesson={lesson}
      onSaveDraft={onSaveDraft}
      onApprove={onApprove}
      onStoryMeta={onStoryMeta}
      onBack={vi.fn()}
      {...over}
    />
  );
  return { onSaveDraft, onApprove, onStoryMeta };
};

const approve = async () => {
  const button = await screen.findByRole('button', { name: /승인/ });
  fireEvent.click(button);
};

beforeEach(() => {
  vi.clearAllMocks();
  generateLessonReviewDraft.mockResolvedValue({});
});

describe('승인 → 스토리 표지 문구', () => {
  it('AI 호출이 끝나지 않아도 승인은 완료된다', async () => {
    // 영원히 안 끝나는 생성 — 승인이 이걸 기다리면 테스트가 멈춘다.
    generateLessonStoryMeta.mockReturnValue(new Promise(() => {}));
    const { onApprove } = renderScreen();

    await approve();

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(onApprove.mock.calls[0][0]).toMatchObject({
      approvalStatus: 'approved',
      sharedToStudent: true,
    });
  });

  it('뒤늦게 도착한 표지 문구를 기록에 붙인다', async () => {
    generateLessonStoryMeta.mockResolvedValue({
      headline: '오른팔이 붙기 시작한 날',
      dek: '3주째 잡던 슬라이스가 줄었다',
    });
    const { onStoryMeta } = renderScreen();

    await approve();

    await waitFor(() => expect(onStoryMeta).toHaveBeenCalledTimes(1));
    expect(onStoryMeta.mock.calls[0][0]).toMatchObject({
      headline: '오른팔이 붙기 시작한 날',
      dek: '3주째 잡던 슬라이스가 줄었다',
    });
    expect(onStoryMeta.mock.calls[0][0].generatedAt).toEqual(expect.any(Number));
  });

  it('코치가 방금 고친 문장으로 표지를 짓는다 — 저장 전 값이 아니라', async () => {
    generateLessonStoryMeta.mockResolvedValue({ headline: 'x' });
    renderScreen();

    const feedback = await screen.findByDisplayValue(
      '백스윙 탑에서 오른팔이 떨어지는 것이 원인이었어요'
    );
    fireEvent.change(feedback, { target: { value: '코치가 방금 고친 문장' } });
    await approve();

    await waitFor(() => expect(generateLessonStoryMeta).toHaveBeenCalled());
    const passed = generateLessonStoryMeta.mock.calls[0][0] as Lesson;
    expect(passed.reviewSections?.feedback).toBe('코치가 방금 고친 문장');
  });

  it('생성이 실패해도 승인 결과는 그대로다', async () => {
    generateLessonStoryMeta.mockRejectedValue(new Error('AI down'));
    const { onApprove, onStoryMeta } = renderScreen();

    await approve();

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    // 실패했으니 붙일 것이 없다 — 뷰는 lesson.title 로 폴백한다.
    await waitFor(() => expect(generateLessonStoryMeta).toHaveBeenCalled());
    expect(onStoryMeta).not.toHaveBeenCalled();
    expect(screen.queryByText(/승인에 실패/)).not.toBeInTheDocument();
  });

  it('생성 결과가 없으면(undefined) 아무것도 붙이지 않는다', async () => {
    generateLessonStoryMeta.mockResolvedValue(undefined);
    const { onApprove, onStoryMeta } = renderScreen();

    await approve();

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(generateLessonStoryMeta).toHaveBeenCalled());
    expect(onStoryMeta).not.toHaveBeenCalled();
  });

  it('onStoryMeta 를 안 넘긴 호출부에서는 생성 자체를 건너뛴다', async () => {
    generateLessonStoryMeta.mockResolvedValue({ headline: 'x' });
    const { onApprove } = renderScreen({ onStoryMeta: undefined });

    await approve();

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(generateLessonStoryMeta).not.toHaveBeenCalled();
  });
});
