import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import App from '../App';
import { apiService } from '../services/apiService';
import { storageService } from '../services/storage';

/**
 * 내 회원 = 학생이 나를 담당 코치로 지정한 회원, 그게 전부다.
 *
 * Regression for the bug where a freshly signed-up coach saw members nobody
 * had registered: when GET /api/clients failed, loadData fell back to this
 * device's localStorage cache — rows cached by other accounts (admin console,
 * demo mode, a previous coach) — showed them app-wide, and then "consistency
 * fixed" them back up to the server, where id-less rows were POSTed as new
 * members owned by the signed-in coach.
 *
 * The fallback list must be scoped to rows already linked to this coach, and
 * cache-sourced data must never be written back to the server.
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

// The device cache: one member genuinely linked to this coach, plus two
// rows left behind by other accounts that used this browser — one linked to
// a different coach, and one legacy id-less row with only a designatedCoach
// name (the kind that used to be POSTed to the server as a brand-new member
// of whoever was signed in).
const cachedClients = [
  {
    id: 'client-own',
    name: '내회원',
    phone: '010-1111-2222',
    coachId: 'coach1',
    designatedCoach: '테스트코치',
    currentPoints: 0,
    subscriptionPlan: 'FREE',
  },
  {
    id: 'client-other',
    name: '남의회원',
    phone: '010-3333-4444',
    coachId: 'other-coach',
    designatedCoach: '다른코치',
    currentPoints: 0,
    subscriptionPlan: 'FREE',
  },
  {
    name: '유령회원',
    phone: '010-5555-6666',
    designatedCoach: '옛날코치',
    currentPoints: 0,
    subscriptionPlan: 'FREE',
  },
];

vi.mock('../services/storage', () => ({
  storageService: {
    // App claims the device cache for the signed-in account on load.
    applyCacheOwner: vi.fn().mockReturnValue(false),
    getCacheOwner: vi.fn().mockReturnValue(null),
    clearUserScopedData: vi.fn(),
    getLessons: vi.fn().mockReturnValue([]),
    getClients: vi.fn(),
    getCoaches: vi.fn().mockReturnValue([]),
    getLessonPackages: vi.fn().mockReturnValue([]),
    getTrainingPrograms: vi.fn().mockReturnValue([]),
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
      // Server unreachable → loadData takes the localStorage fallback path.
      getClients: vi.fn().mockRejectedValue(new Error('network down')),
      getCoaches: vi.fn().mockResolvedValue([]),
      getLessonPackages: vi.fn().mockResolvedValue([]),
      getTrainingPrograms: vi.fn().mockResolvedValue([]),
      saveClients: vi.fn().mockResolvedValue(undefined),
      saveCoach: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe('Coach member list stays scoped to students who designated this coach', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storageService.getClients).mockReturnValue(cachedClients as any);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  it('shows only this coach\'s members from the cache fallback and never syncs the cache to the server', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('CoachX AI')).toBeInTheDocument();
    });

    // 학생 목록 lives in the drawer now — the single-surface relaunch
    // removed the bottom tab bar.
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    fireEvent.click(screen.getByRole('button', { name: '학생 목록' }));

    await waitFor(() => {
      expect(screen.getByText('내회원')).toBeInTheDocument();
    });
    expect(screen.queryByText('남의회원')).not.toBeInTheDocument();
    expect(screen.queryByText('유령회원')).not.toBeInTheDocument();

    // Cache-sourced data must never be written back to the server — that
    // write is what used to create the phantom members server-side.
    expect(apiService.saveClients).not.toHaveBeenCalled();
  });
});
