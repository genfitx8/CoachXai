/**
 * Tests for LessonDetail media rendering.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { LanguageProvider } from '../components/LanguageContext';

const renderWithLanguage = (ui: React.ReactElement) =>
  render(<LanguageProvider>{ui}</LanguageProvider>);

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/geminiService', () => ({
  analyzeSwingVideo: vi.fn().mockResolvedValue('mock analysis'),
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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockLesson = {
  id: 'lesson-001',
  clientName: '김회원',
  clientPhone: '010-1234-5678',
  coachId: 'coach1',
  createdBy: 'COACH' as const,
  recordType: 'LESSON' as const,
  date: '2024-01-15',
  title: '드라이버 교정 레슨',
  videoUrl: '',
  mediaType: 'video' as const,
  coachNotes: '체중 이동에 집중하세요.',
  aiAnalysis: '스윙 분석 결과입니다.',
  tags: ['드라이버', '체중이동'],
  createdAt: Date.now(),
};

// ─── LessonDetail integration tests ──────────────────────────────────────────

const lessonWithVideoKey = {
  ...mockLesson,
  videoUrl: '',
  videoKey: 'lessons/lesson-001/main.mp4',
};

const renderDetail = async (lesson: object, extra: Record<string, unknown> = {}) => {
  const { LessonDetail } = await import('../components/LessonDetail');
  return renderWithLanguage(
    <LessonDetail
      lesson={lesson as Parameters<typeof LessonDetail>[0]['lesson']}
      role="COACH"
      onBack={vi.fn()}
      onUpdate={vi.fn()}
      {...extra}
    />
  );
};

describe('LessonDetail – media rendering', () => {
  it('renders playable main video from videoKey in the 자료 tab', async () => {
    const { container } = await renderDetail(lessonWithVideoKey);

    // 기본 탭은 스토리다 — 원본 미디어 뷰어는 자료 탭이 맡는다.
    fireEvent.click(screen.getByRole('tab', { name: '자료' }));

    const video = container.querySelector('video');
    expect(video).toBeTruthy();
    expect(video?.getAttribute('src')).toContain('/api/files/lessons/lesson-001/main.mp4');
  });

  /*
   * 조판기는 대표컷을 본문 미디어 풀에서 뺀다. 기록의 본체가 메인 영상
   * 하나뿐인 경우(흔하다) 표지에서 재생할 수 없으면 그 영상은 스토리
   * 어디에서도 볼 수 없게 되므로, 이 경로를 고정해 둔다.
   */
  it('plays the main video from the story cover — the only place it appears', async () => {
    const { container } = await renderDetail(lessonWithVideoKey);

    expect(container.querySelector('video')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /재생/ }));

    const video = container.querySelector('video');
    expect(video).toBeTruthy();
    expect(video?.getAttribute('src')).toContain('/api/files/lessons/lesson-001/main.mp4');
  });

  it('keeps record-level actions reachable from either tab', async () => {
    // 수정·삭제는 어느 탭을 보고 있든 같은 기록에 대한 동작이다.
    await renderDetail(lessonWithVideoKey, { onEdit: vi.fn() });
    expect(screen.getByRole('button', { name: /레슨 기록 수정하기/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '자료' }));
    expect(screen.getByRole('button', { name: /레슨 기록 수정하기/ })).toBeInTheDocument();
  });
});
