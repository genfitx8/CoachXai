import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import React from 'react';
import App from '../App';
import { apiService } from '../services/apiService';
import { ClientProfile } from '../types';

/**
 * A student designates their coach from the student app (PUT /api/clients/me).
 * The coach app must pick that up without a manual reload:
 *   1. refetch on tab/webview focus (visibilitychange → visible, window focus)
 *   2. poll GET /api/clients on an interval while visible
 *   3. refetch immediately when the coach opens the 학생 tab
 */

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
    // App claims the device cache for the signed-in account on load.
    applyCacheOwner: vi.fn().mockReturnValue(false),
    getCacheOwner: vi.fn().mockReturnValue(null),
    clearUserScopedData: vi.fn(),
    getLessons: vi.fn().mockReturnValue([]),
    getClients: vi.fn().mockReturnValue([]),
    getCoaches: vi.fn().mockReturnValue([]),
    getLessonPackages: vi.fn().mockReturnValue([]),
    getTrainingPrograms: vi.fn().mockReturnValue([]),
    saveLessons: vi.fn(),
    saveClients: vi.fn(),
    saveCoaches: vi.fn(),
  },
}));

const coachProfile = {
  id: 'coach1',
  name: '테스트코치',
  email: 'coach@test.com',
  phone: '010-0000-0000',
  branchId: 'branch1',
};

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
    saveCoachProfile: vi.fn(),
    renewSessionToken: vi.fn().mockResolvedValue(false),
    logout: vi.fn(),
  },
}));

vi.mock('../services/coachNotificationService', () => ({
  getUnreadReservationNotificationsForCoach: vi.fn().mockResolvedValue([]),
  markNotificationsAsRead: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/reservationService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/reservationService')>();
  return {
    ...actual,
    reservationService: {
      ...actual.reservationService,
      getCoachReservations: vi.fn().mockResolvedValue([]),
    },
  };
});

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

// Serve the member list from a mutable variable so tests can simulate a
// student linking this coach from the student app between two fetches.
let serverClients: ClientProfile[] = [];

vi.mock('../services/apiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/apiService')>();
  return {
    ...actual,
    apiService: {
      ...actual.apiService,
      isAvailable: vi.fn().mockReturnValue(true),
      getToken: vi.fn().mockReturnValue('test-jwt'),
      getMyCoachProfile: vi.fn().mockResolvedValue({
        id: 'coach1',
        name: '테스트코치',
        email: 'coach@test.com',
        phone: '010-0000-0000',
        branchId: 'branch1',
      }),
      getLessons: vi.fn().mockResolvedValue([]),
      getClients: vi.fn().mockImplementation(async () => [...serverClients]),
      getCoaches: vi.fn().mockResolvedValue([]),
      getLessonPackages: vi.fn().mockResolvedValue([]),
      getTrainingPrograms: vi.fn().mockResolvedValue([]),
      saveClients: vi.fn().mockResolvedValue(undefined),
      saveCoach: vi.fn().mockResolvedValue(undefined),
    },
  };
});

const newMember: ClientProfile = {
  id: 'client-new',
  name: '신규회원',
  phone: '010-9999-8888',
  coachId: 'coach1',
  designatedCoach: '테스트코치',
  currentPoints: 0,
  subscriptionPlan: 'FREE',
};

const renderCoachApp = async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByText('CoachX AI')).toBeInTheDocument();
  });
  // Initial loadData has fetched the (empty) member list once.
  await waitFor(() => {
    expect(vi.mocked(apiService.getClients).mock.calls.length).toBeGreaterThanOrEqual(1);
  });
};

const setDocumentVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
};

describe('Coach app near-real-time member list refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverClients = [];
    setDocumentVisibility('visible');
  });

  afterEach(() => {
    setDocumentVisibility('visible');
  });

  it('refetches members when the tab becomes visible again and shows the newly linked student', async () => {
    await renderCoachApp();
    const callsAfterLoad = vi.mocked(apiService.getClients).mock.calls.length;

    // Student links this coach from the student app while the coach tab is
    // in the background…
    serverClients = [newMember];
    setDocumentVisibility('hidden');
    fireEvent(document, new Event('visibilitychange'));

    // …and the coach comes back to the tab.
    setDocumentVisibility('visible');
    await act(async () => {
      fireEvent(document, new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(vi.mocked(apiService.getClients).mock.calls.length).toBeGreaterThan(
        callsAfterLoad
      );
    });

    // The new member is visible in the 학생 목록 (drawer entry — the
    // single-surface relaunch removed the bottom tab bar) without a reload.
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    fireEvent.click(screen.getByRole('button', { name: '학생 목록' }));
    await waitFor(() => {
      expect(screen.getByText('신규회원')).toBeInTheDocument();
    });
  });

  it('refetches members on window focus', async () => {
    await renderCoachApp();
    const callsAfterLoad = vi.mocked(apiService.getClients).mock.calls.length;

    serverClients = [newMember];
    await act(async () => {
      fireEvent(window, new Event('focus'));
    });

    await waitFor(() => {
      expect(vi.mocked(apiService.getClients).mock.calls.length).toBeGreaterThan(
        callsAfterLoad
      );
    });
  });

  it('refetches members when the coach opens the 학생 목록', async () => {
    await renderCoachApp();
    const callsAfterLoad = vi.mocked(apiService.getClients).mock.calls.length;

    serverClients = [newMember];
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    fireEvent.click(screen.getByRole('button', { name: '학생 목록' }));

    await waitFor(() => {
      expect(vi.mocked(apiService.getClients).mock.calls.length).toBeGreaterThan(
        callsAfterLoad
      );
    });
    await waitFor(() => {
      expect(screen.getByText('신규회원')).toBeInTheDocument();
    });
  });

  it('polls the member list on an interval while the coach app stays visible', async () => {
    vi.useFakeTimers();
    try {
      render(<App />);
      // Flush the initial load under fake timers.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(
        vi.mocked(apiService.getClients).mock.calls.length
      ).toBeGreaterThanOrEqual(1);
      const callsAfterLoad = vi.mocked(apiService.getClients).mock.calls.length;

      serverClients = [newMember];
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });

      expect(vi.mocked(apiService.getClients).mock.calls.length).toBeGreaterThan(
        callsAfterLoad
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
