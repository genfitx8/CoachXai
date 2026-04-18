/**
 * Tests for the KakaoTalk lesson note sharing feature:
 * 1. kakaoShareService.sendLessonNoteViaKakao returns 'no_key' when env var is not set.
 * 2. kakaoShareService.sendLessonNoteViaKakao returns 'success' when Kakao SDK is mocked.
 * 3. kakaoShareService.sendLessonNoteViaKakao returns 'error' when Kakao.Share.sendDefault throws.
 * 4. LessonDetail renders the KakaoTalk share button for COACH role.
 * 5. LessonDetail does NOT render the KakaoTalk share button for CLIENT role.
 * 6. Clicking the share button shows the error message when no key is configured.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

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

// ─── kakaoShareService unit tests ─────────────────────────────────────────────

describe('kakaoShareService', () => {
  beforeEach(() => {
    // Remove any cached Kakao object
    delete (window as Window & { Kakao?: unknown }).Kakao;
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    // Clean up injected SDK script tag
    const el = document.getElementById('kakao-sdk');
    if (el) el.remove();
  });

  it('returns "no_key" when VITE_KAKAO_APP_KEY is not set', async () => {
    vi.stubEnv('VITE_KAKAO_APP_KEY', '');

    // Re-import after stub (vitest caches modules, so we use dynamic import)
    const { sendLessonNoteViaKakao } = await import('../services/kakaoShareService');
    const result = await sendLessonNoteViaKakao(mockLesson as Parameters<typeof sendLessonNoteViaKakao>[0]);
    expect(result).toBe('no_key');
  });

  it('buildLessonShareUrl includes the lesson id as a hash fragment', async () => {
    const { buildLessonShareUrl } = await import('../services/kakaoShareService');
    const url = buildLessonShareUrl(mockLesson as Parameters<typeof buildLessonShareUrl>[0]);
    expect(url).toContain('#lesson=');
    expect(url).toContain('lesson-001');
  });

  it('returns "success" when Kakao SDK is available and share succeeds', async () => {
    vi.stubEnv('VITE_KAKAO_APP_KEY', 'test-app-key-12345');

    // Mock the Kakao SDK on window
    (window as Window & { Kakao?: unknown }).Kakao = {
      isInitialized: vi.fn().mockReturnValue(false),
      init: vi.fn(),
      Share: {
        sendDefault: vi.fn(), // Does not throw
      },
    };

    const { sendLessonNoteViaKakao } = await import('../services/kakaoShareService');
    const result = await sendLessonNoteViaKakao(mockLesson as Parameters<typeof sendLessonNoteViaKakao>[0]);
    expect(result).toBe('success');
  });

  it('returns "error" when Kakao.Share.sendDefault throws', async () => {
    vi.stubEnv('VITE_KAKAO_APP_KEY', 'test-app-key-12345');

    (window as Window & { Kakao?: unknown }).Kakao = {
      isInitialized: vi.fn().mockReturnValue(true),
      init: vi.fn(),
      Share: {
        sendDefault: vi.fn().mockImplementation(() => {
          throw new Error('SDK error');
        }),
      },
    };

    const { sendLessonNoteViaKakao } = await import('../services/kakaoShareService');
    const result = await sendLessonNoteViaKakao(mockLesson as Parameters<typeof sendLessonNoteViaKakao>[0]);
    expect(result).toBe('error');
  });
});

// ─── LessonDetail integration tests ──────────────────────────────────────────

describe('LessonDetail – KakaoTalk share button', () => {
  beforeEach(() => {
    delete (window as Window & { Kakao?: unknown }).Kakao;
    vi.unstubAllEnvs();
  });

  it('renders the KakaoTalk share button for COACH role', async () => {
    const { LessonDetail } = await import('../components/LessonDetail');

    render(
      <LessonDetail
        lesson={mockLesson as Parameters<typeof LessonDetail>[0]['lesson']}
        role="COACH"
        onBack={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    expect(screen.getByTestId('kakao-share-button')).toBeDefined();
    expect(screen.getByText('카카오톡으로 공유하기')).toBeDefined();
  });

  it('does NOT render the KakaoTalk share button for CLIENT role', async () => {
    const { LessonDetail } = await import('../components/LessonDetail');

    render(
      <LessonDetail
        lesson={{ ...mockLesson, createdBy: 'CLIENT' } as Parameters<typeof LessonDetail>[0]['lesson']}
        role="CLIENT"
        onBack={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    expect(screen.queryByTestId('kakao-share-button')).toBeNull();
  });

  it('shows no_key warning and copy-link button when app key is missing and button is clicked', async () => {
    vi.stubEnv('VITE_KAKAO_APP_KEY', '');

    const { LessonDetail } = await import('../components/LessonDetail');

    render(
      <LessonDetail
        lesson={mockLesson as Parameters<typeof LessonDetail>[0]['lesson']}
        role="COACH"
        onBack={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('kakao-share-button'));

    await waitFor(() => {
      expect(
        screen.getByText(/카카오톡 공유 기능이 설정되지 않았습니다/i)
      ).toBeDefined();
      expect(screen.getByTestId('copy-link-button')).toBeDefined();
    });
  });

  it('copies the lesson link when copy-link button is clicked', async () => {
    vi.stubEnv('VITE_KAKAO_APP_KEY', '');

    // Mock clipboard API
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const { LessonDetail } = await import('../components/LessonDetail');

    render(
      <LessonDetail
        lesson={mockLesson as Parameters<typeof LessonDetail>[0]['lesson']}
        role="COACH"
        onBack={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    // First trigger the no_key state
    fireEvent.click(screen.getByTestId('kakao-share-button'));
    await waitFor(() => expect(screen.getByTestId('copy-link-button')).toBeDefined());

    // Click the copy button
    fireEvent.click(screen.getByTestId('copy-link-button'));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        expect.stringContaining('lesson-001')
      );
    });
  });
});
