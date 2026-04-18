/**
 * Tests for:
 * 1. The coach dashboard includes a "레슨 기록 보기" entry.
 * 2. The lesson record list is NOT shown on the initial/default screen.
 * 3. Lesson records are accessible via the dashboard entry (LESSON_LIST view).
 * 4. Unrelated dashboard navigation continues to work.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import App from '../App';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/firebase', () => ({
  firebaseService: {
    getSavedConfig: vi.fn().mockReturnValue(null),
    init: vi.fn().mockReturnValue(false),
    isInitialized: vi.fn().mockReturnValue(false),
    getLessons: vi.fn().mockResolvedValue([]),
    getClients: vi.fn().mockResolvedValue([]),
    getCoaches: vi.fn().mockResolvedValue([]),
    onAuthStateChanged: vi.fn().mockImplementation((_cb: (u: null) => void) => () => {}),
  },
}));

vi.mock('../services/storage', () => ({
  storageService: {
    getLessons: vi.fn().mockReturnValue([]),
    getClients: vi.fn().mockReturnValue([]),
    getCoaches: vi.fn().mockReturnValue([]),
    getLessonPackages: vi.fn().mockReturnValue([]),
    saveLessons: vi.fn(),
    saveClients: vi.fn(),
    saveCoaches: vi.fn(),
  },
}));

vi.mock('../services/authService', () => ({
  authService: {
    restoreSession: vi.fn().mockReturnValue({ role: 'COACH' }),
    getCoachProfile: vi.fn().mockReturnValue({
      id: 'coach1',
      name: '테스트코치',
      email: 'coach@test.com',
      phone: '010-0000-0000',
      branchId: 'branch1',
    }),
    logout: vi.fn(),
  },
}));

vi.mock('../services/coachNotificationService', () => ({
  getUnreadReservationNotificationsForCoach: vi.fn().mockResolvedValue([]),
  markNotificationsAsRead: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/realtime', () => ({
  realtimeSubscribe: vi.fn().mockReturnValue(() => {}),
  realtimeUnsubscribe: vi.fn(),
  realtimeConnect: vi.fn(),
}));

vi.mock('../components/CalendarView', () => ({
  default: () => <div data-testid="calendar-view" />,
}));

vi.mock('../components/CoachReservationNotificationModal', () => ({
  CoachReservationNotificationModal: () => null,
}));

// ─── Helper ───────────────────────────────────────────────────────────────────

const renderCoachApp = async () => {
  const utils = render(<App />);
  // Wait until the loading spinner is gone and the coach dashboard appears
  await waitFor(
    () => {
      expect(screen.getByText(/coach_dashboard|레슨 관리/i)).toBeInTheDocument();
    },
    { timeout: 5000 }
  );
  return utils;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Coach dashboard – lesson record access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a "레슨 기록 보기" button on the coach dashboard', async () => {
    await renderCoachApp();
    expect(
      screen.getByRole('button', { name: /레슨 기록 보기/i })
    ).toBeInTheDocument();
  });

  it('does NOT show the lesson record list on the initial screen', async () => {
    await renderCoachApp();
    // Media toggle ("레슨 미디어 표시") should not be visible on the dashboard
    expect(screen.queryByText(/레슨 미디어 표시/i)).toBeNull();
  });

  it('navigates to the lesson record list when "레슨 기록 보기" is clicked', async () => {
    await renderCoachApp();

    fireEvent.click(screen.getByRole('button', { name: /레슨 기록 보기/i }));

    await waitFor(() => {
      // Media toggle becomes visible in lesson list view
      expect(screen.getByText(/레슨 미디어 표시/i)).toBeInTheDocument();
    });
  });

  it('shows "대시보드로 돌아가기" button in the lesson list view', async () => {
    await renderCoachApp();

    fireEvent.click(screen.getByRole('button', { name: /레슨 기록 보기/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /대시보드로 돌아가기/i })
      ).toBeInTheDocument();
    });
  });

  it('returns to the dashboard when "대시보드로 돌아가기" is clicked', async () => {
    await renderCoachApp();

    fireEvent.click(screen.getByRole('button', { name: /레슨 기록 보기/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /대시보드로 돌아가기/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /대시보드로 돌아가기/i }));

    await waitFor(() => {
      // Back on dashboard: the lesson record button is visible again
      expect(
        screen.getByRole('button', { name: /레슨 기록 보기/i })
      ).toBeInTheDocument();
      // And the media toggle is gone (back to dashboard, not lesson list)
      expect(screen.queryByText(/레슨 미디어 표시/i)).toBeNull();
    });
  });

  it('still shows other dashboard buttons (start lesson, reservation management)', async () => {
    await renderCoachApp();
    // "레슨 시작" or t('start_lesson') — key rendered as-is when LanguageContext unavailable
    expect(
      screen.getByRole('button', { name: /레슨 시작|start_lesson/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /예약 관리|reservation_management/i })
    ).toBeInTheDocument();
  });
});

