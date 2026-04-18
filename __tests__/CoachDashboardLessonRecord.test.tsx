/**
 * Tests for:
 * 1. The coach dashboard includes a "레슨 기록 보기" entry.
 * 2. The lesson record list is NOT shown on the initial/default screen.
 * 3. Lesson records are accessible via the dashboard entry (LESSON_LIST view).
 * 4. The dashboard shows lesson-record-centric stats and sections.
 * 5. Package progress is visible on the dashboard.
 * 6. Reservation-related buttons remain accessible (but secondary).
 * 7. Unrelated dashboard navigation continues to work.
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

vi.mock('../services/storage', () => {
  const today = new Date().toISOString().slice(0, 10);
  const lessons = [
    {
      id: 'l1',
      clientName: '김회원',
      clientPhone: '010-1111-0001',
      coachId: 'coach1',
      createdBy: 'COACH',
      date: today,
      title: '드라이버 자세',
      videoUrl: '',
      mediaType: 'video',
      coachNotes: '',
      tags: [],
      createdAt: Date.now() - 1000,
    },
    {
      id: 'l2',
      clientName: '이회원',
      clientPhone: '010-1111-0002',
      coachId: 'coach1',
      createdBy: 'COACH',
      date: '2024-01-10',
      title: '아이언 스윙',
      videoUrl: '',
      mediaType: 'video',
      coachNotes: '',
      tags: [],
      createdAt: Date.now() - 2000,
      lessonPackageId: 'pkg1',
      sessionNumber: 1,
    },
  ];
  const clients = [
    { id: 'c1', name: '김회원', phone: '010-1111-0001', coachId: 'coach1', email: '' },
    { id: 'c2', name: '이회원', phone: '010-1111-0002', coachId: 'coach1', email: '' },
  ];
  const packages = [
    {
      id: 'pkg1',
      coachId: 'coach1',
      clientId: '이회원_010-1111-0002',
      clientName: '이회원',
      clientPhone: '010-1111-0002',
      totalSessions: 10,
      createdAt: Date.now() - 10000,
      updatedAt: Date.now() - 10000,
    },
  ];
  return {
    storageService: {
      getLessons: vi.fn().mockReturnValue(lessons),
      getClients: vi.fn().mockReturnValue(clients),
      getCoaches: vi.fn().mockReturnValue([]),
      getLessonPackages: vi.fn().mockReturnValue(packages),
      getTrainingPrograms: vi.fn().mockReturnValue([]),
      saveLessons: vi.fn(),
      saveClients: vi.fn(),
      saveCoaches: vi.fn(),
    },
  };
});

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

// ─── New: Lesson-record-centric dashboard sections ────────────────────────────

describe('Coach dashboard – lesson-record-centric layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the lesson-record stats section on the dashboard', async () => {
    await renderCoachApp();
    // Stats row contains these labels
    expect(screen.getByText(/전체 레슨 기록/i)).toBeInTheDocument();
    expect(screen.getByText(/오늘 레슨/i)).toBeInTheDocument();
    expect(screen.getByText(/미완료 패키지/i)).toBeInTheDocument();
    expect(screen.getByText(/담당 회원/i)).toBeInTheDocument();
  });

  it('shows today\'s lesson count correctly in stats', async () => {
    await renderCoachApp();
    // The stats row has a "오늘 레슨" label — confirm the label is present (count is data-driven)
    const todayLabel = screen.getByText(/오늘 레슨/i);
    expect(todayLabel).toBeInTheDocument();
    // Parent card contains both the count and the label
    const statCard = todayLabel.parentElement;
    expect(statCard?.textContent).toMatch('1');
  });

  it('shows the "최근 레슨 기록" section when there are lessons', async () => {
    await renderCoachApp();
    expect(screen.getByText(/최근 레슨 기록/i)).toBeInTheDocument();
  });

  it('shows lesson names from recent records on the dashboard', async () => {
    await renderCoachApp();
    // Both mock clients' names should appear in the recent lessons section
    expect(screen.getAllByText('김회원').length).toBeGreaterThan(0);
    expect(screen.getAllByText('이회원').length).toBeGreaterThan(0);
  });

  it('shows package progress section when incomplete packages exist', async () => {
    await renderCoachApp();
    expect(screen.getByText(/레슨 패키지 진행 현황/i)).toBeInTheDocument();
  });

  it('shows incomplete package member name and session count in progress section', async () => {
    await renderCoachApp();
    // Package for 이회원: 10 sessions total, 1 recorded → 9 remaining
    expect(screen.getByText(/1 \/ 10회/i)).toBeInTheDocument();
  });

  it('navigates to lesson list with client filter when package progress item is clicked', async () => {
    await renderCoachApp();

    // Click on the member name in the package progress section using data-testid
    const progressLinks = screen.getAllByTestId('package-progress-member');
    expect(progressLinks.length).toBeGreaterThan(0);
    fireEvent.click(progressLinks[0]);

    await waitFor(() => {
      expect(screen.getByText(/레슨 미디어 표시/i)).toBeInTheDocument();
    });
  });

  it('shows "오늘의 레슨 기록" section for today\'s lessons', async () => {
    await renderCoachApp();
    expect(screen.getByText(/오늘의 레슨 기록/i)).toBeInTheDocument();
  });

  it('reservation buttons are present but in the secondary section', async () => {
    await renderCoachApp();
    // Secondary section label
    expect(screen.getByText(/예약 및 관리/i)).toBeInTheDocument();
    // Reservation buttons still accessible
    expect(
      screen.getByRole('button', { name: /예약 관리|reservation_management/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^타석 예약$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /나의 타석 예약/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /회원 관리/i })
    ).toBeInTheDocument();
  });

  it('lesson record primary actions appear before reservation section', async () => {
    await renderCoachApp();
    const lessonBtn = screen.getByRole('button', { name: /레슨 기록 보기/i });
    const reservationLabel = screen.getByText(/예약 및 관리/i);
    // "레슨 기록 보기" appears before the secondary "예약 및 관리" label
    expect(
      lessonBtn.compareDocumentPosition(reservationLabel) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});

// ─── New: Calendar relocated to reservation management ────────────────────────

describe('Coach dashboard – calendar removed from main screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT render calendar-view on the coach main/home screen', async () => {
    await renderCoachApp();
    expect(screen.queryByTestId('calendar-view')).toBeNull();
  });

  it('navigates to reservation management when "예약 관리" button is clicked', async () => {
    await renderCoachApp();
    fireEvent.click(screen.getByRole('button', { name: /예약 관리|reservation_management/i }));
    await waitFor(() => {
      // ReservationManager renders "예약 관리" heading
      expect(screen.getByText(/예약 관리/i)).toBeInTheDocument();
    });
  });
});
