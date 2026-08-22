/**
 * 코치 앱 레슨 화면의 뒤로가기.
 *
 * 레슨 상세 → 기록 검토 → 레슨 동반으로 이어지는 코치 화면들은 저마다
 * 다른 방식으로 "뒤로"를 그리고 있었다. 원형 아이콘 버튼, 36px짜리 작은
 * 화살표, 오른쪽 구석의 12px 텍스트 링크가 한 흐름 안에 섞여 있었고,
 * 그중 둘은 존재하지 않는 Tailwind 클래스(`bg-white/[0.04]/10`)를 달고
 * 있어 배경이 아예 칠해지지 않았다.
 *
 * 이제 학생 앱과 같은 공용 `BackButton` 하나로 통일한다. 이 테스트는
 * 화면마다 뒤로가기가 (1) 있고, (2) 44x44 탭 영역을 지키며, (3) 누르면
 * 실제로 돌아가는 것을 못 박는다.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { LanguageProvider } from '../components/LanguageContext';
import type { Lesson } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/geminiService', () => ({
  analyzeSwingVideo: vi.fn().mockResolvedValue('mock analysis'),
  analyzeMotionCapture: vi.fn().mockResolvedValue(null),
  generateLessonReviewDraft: vi.fn(async () => ({
    todayCovered: '드라이버 슬라이스 교정',
    feedback: '백스윙에서 오른팔이 매달립니다.',
    nextActions: ['타월 드릴 10분'],
  })),
  generateLessonStoryMeta: vi.fn(async () => ({})),
}));

vi.mock('../services/firebase', () => ({
  firebaseService: {
    getSavedConfig: vi.fn().mockReturnValue(null),
    init: vi.fn().mockReturnValue(false),
    isInitialized: vi.fn().mockReturnValue(false),
  },
}));

vi.mock('../services/storage', () => ({
  storageService: {
    getLessons: vi.fn().mockReturnValue([]),
    saveLesson: vi.fn(),
  },
}));

vi.mock('../services/coachStyleService', () => ({
  coachStyleService: { save: vi.fn(async () => undefined) },
  tierForSource: () => 1 as const,
}));

vi.mock('../services/aiFeedbackService', () => ({
  aiFeedbackService: { record: vi.fn() },
}));

import { LessonDetail } from '../components/LessonDetail';
import { LessonReviewScreen } from '../components/LessonReviewScreen';
import { LiveLessonCompanion } from '../components/LiveLessonCompanion';
import { LiveLessonStudentPicker } from '../components/LiveLessonStudentPicker';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const renderWithLanguage = (ui: React.ReactElement) =>
  render(<LanguageProvider>{ui}</LanguageProvider>);

const lesson = {
  id: 'lesson-001',
  clientName: '김회원',
  clientPhone: '010-1234-5678',
  coachId: 'coach1',
  createdBy: 'COACH',
  recordType: 'LESSON',
  date: '2026-08-19',
  title: '드라이버 교정 레슨',
  videoUrl: '',
  mediaType: 'video',
  coachNotes: '체중 이동에 집중하세요.',
  tags: [],
  createdAt: 1,
} as unknown as Lesson;

/**
 * 공용 BackButton 이 보장하는 것 — 손가락이 닿는 44x44 와 아이콘.
 * 클래스 문자열로 확인한다: jsdom 에는 레이아웃이 없어 실제 크기를 잴 수
 * 없고, 이 화면들이 쓰는 Tailwind 유틸이 곧 탭 영역의 정의다.
 */
function expectSharedBackButton(button: HTMLElement) {
  expect(button.tagName).toBe('BUTTON');
  expect(button.className).toContain('min-h-[44px]');
  expect(button.className).toContain('min-w-[44px]');
  expect(button.querySelector('svg')).not.toBeNull();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('코치 레슨 화면의 뒤로가기', () => {
  it('레슨 상세 — 목록으로 돌아간다', () => {
    const onBack = vi.fn();
    renderWithLanguage(
      <LessonDetail lesson={lesson} role="COACH" onBack={onBack} onUpdate={vi.fn()} />,
    );

    // 본문 하단에도 같은 이름의 보조 CTA 가 있다 — 헤더 것을 집는다.
    const back = screen.getByTestId('lesson-detail-back');
    expect(back).toHaveAccessibleName('목록으로 돌아가기');
    expectSharedBackButton(back);

    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('기록 검토 — 레슨 상세로 돌아간다', () => {
    const onBack = vi.fn();
    renderWithLanguage(
      <LessonReviewScreen
        lesson={lesson}
        coachId="coach1"
        onBack={onBack}
        onSaveDraft={vi.fn(async () => undefined)}
        onApprove={vi.fn(async () => undefined)}
      />,
    );

    const back = screen.getByRole('button', { name: '뒤로' });
    expectSharedBackButton(back);

    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('레슨 동반 학생 선택 — 이전 화면으로 돌아간다', () => {
    const onBack = vi.fn();
    renderWithLanguage(
      <LiveLessonStudentPicker
        clients={[]}
        reservations={[]}
        onSelect={vi.fn()}
        onBack={onBack}
      />,
    );

    const back = screen.getByRole('button', { name: '뒤로' });
    expectSharedBackButton(back);

    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('레슨 동반 — 나가기가 헤더 왼쪽의 뒤로가기다', () => {
    const onCancel = vi.fn();
    renderWithLanguage(
      <LiveLessonCompanion
        studentName="한윤슬"
        lessonDate="2026-08-19"
        onFinish={vi.fn()}
        onCancel={onCancel}
      />,
    );

    const back = screen.getByRole('button', { name: '나가기' });
    expectSharedBackButton(back);

    // 헤더 안에서 학생 이름보다 앞에 온다 — 앱의 다른 뒤로가기와 같은 자리.
    const header = back.closest('header');
    expect(header).not.toBeNull();
    expect(header!.textContent).toContain('한윤슬');
    expect(header!.firstElementChild!.firstElementChild).toBe(back);

    fireEvent.click(back);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
