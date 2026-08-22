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
 * Filtering that shared cache by coachId was not enough: the rows the old
 * upward sync minted carry the signing-in coach's own id, so they sailed
 * through the filter and stacked up (레슨 중 동반 전체 학생 433명, 같은
 * 이름·번호가 수십 번). The offline fallback now reads only the coach-scoped
 * cache — the last member list the server actually returned for this coach —
 * and cache-sourced data is still never written back to the server.
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

// The shared device cache — the drawer every account that used this browser
// wrote into: a member linked to another coach, a legacy id-less row with only
// a designatedCoach name (the kind that used to be POSTed to the server as a
// brand-new member of whoever was signed in), and a phantom row stamped with
// *this* coach's id by the removed upward sync. None of it may reach 내 회원.
const cachedClients = [
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
  {
    id: 'client-stamped',
    name: '도장찍힌회원',
    phone: '010-7777-8888',
    coachId: 'coach1',
    designatedCoach: '테스트코치',
    currentPoints: 0,
    subscriptionPlan: 'FREE',
  },
];

// The coach-scoped cache: the member list the server last returned for this
// coach. Duplicated on purpose — the same person twice, once with the phone
// punctuated — because that is how the roster arrives from a polluted table.
const cachedCoachClients = [
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
    id: 'client-own-dup',
    name: '내회원',
    phone: '01011112222',
    coachId: 'coach1',
    designatedCoach: '테스트코치',
    currentPoints: 0,
    subscriptionPlan: 'FREE',
  },
];

vi.mock('../services/storage', () => ({
  storageService: {
    getLessons: vi.fn().mockReturnValue([]),
    getClients: vi.fn(),
    getCoachClients: vi.fn(),
    saveCoachClients: vi.fn(),
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
    vi.mocked(storageService.getCoachClients).mockReturnValue(cachedCoachClients as any);
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
    // Carries this coach's id, so a coachId filter would have let it through.
    expect(screen.queryByText('도장찍힌회원')).not.toBeInTheDocument();
    // The same person twice (하이픈 있는 번호 / 없는 번호) is one member.
    expect(screen.getAllByText('내회원')).toHaveLength(1);

    // Cache-sourced data must never be written back to the server — that
    // write is what used to create the phantom members server-side.
    expect(apiService.saveClients).not.toHaveBeenCalled();
  });
});
