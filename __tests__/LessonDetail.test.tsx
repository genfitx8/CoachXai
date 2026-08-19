/**
 * Tests for LessonDetail media rendering.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
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

describe('LessonDetail – media rendering', () => {
  it('renders playable main video from videoKey when videoUrl is empty', async () => {
    const { LessonDetail } = await import('../components/LessonDetail');

    const lessonWithVideoKey = {
      ...mockLesson,
      videoUrl: '',
      videoKey: 'lessons/lesson-001/main.mp4',
    };

    const { container } = renderWithLanguage(
      <LessonDetail
        lesson={lessonWithVideoKey as Parameters<typeof LessonDetail>[0]['lesson']}
        role="COACH"
        onBack={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    const video = container.querySelector('video');
    expect(video).toBeTruthy();
    expect(video?.getAttribute('src')).toContain('/api/files/lessons/lesson-001/main.mp4');
  });
});
