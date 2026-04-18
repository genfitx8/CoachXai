import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendLessonReservationNotifications,
  sendBayReservationNotifications,
  _resetNotifiedKeysForTesting,
} from '../services/reservationPushNotificationService';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { LessonReservation, BayReservation, CoachProfile, BranchAdminAccount } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/firebase', () => ({
  firebaseService: {
    isInitialized: vi.fn(),
    getCoachById: vi.fn(),
    getBranchAdminAccounts: vi.fn(),
  },
}));

vi.mock('../services/storage', () => ({
  storageService: {
    getCoachById: vi.fn(),
    getBranchAdminAccounts: vi.fn(),
  },
}));

// Mock global fetch used by sendExpoPush
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const COACH_WITH_TOKEN: CoachProfile = {
  id: 'coach1',
  name: '김코치',
  email: 'coach@example.com',
  pushToken: 'ExponentPushToken[coach-token-abc]',
};

const COACH_WITHOUT_TOKEN: CoachProfile = {
  id: 'coach2',
  name: '이코치',
  email: 'coach2@example.com',
};

const ADMIN_WITH_TOKEN: BranchAdminAccount = {
  id: 'branch1:admin1',
  branchId: 'branch1',
  branchName: '강남점',
  username: 'admin1',
  password: 'pw',
  isActive: true,
  createdAt: 1000,
  pushToken: 'ExponentPushToken[admin-token-xyz]',
};

const ADMIN_WITHOUT_TOKEN: BranchAdminAccount = {
  id: 'branch1:admin2',
  branchId: 'branch1',
  branchName: '강남점',
  username: 'admin2',
  password: 'pw',
  isActive: true,
  createdAt: 1001,
};

const INACTIVE_ADMIN: BranchAdminAccount = {
  id: 'branch1:admin3',
  branchId: 'branch1',
  branchName: '강남점',
  username: 'admin3',
  password: 'pw',
  isActive: false,
  createdAt: 1002,
  pushToken: 'ExponentPushToken[inactive-token]',
};

const LESSON_RESERVATION: LessonReservation = {
  id: 'lesson-res-1',
  coachId: 'coach1',
  coachName: '김코치',
  clientId: '홍길동_010-1234-5678',
  clientName: '홍길동',
  clientPhone: '010-1234-5678',
  startTime: '2026-04-10T10:00:00',
  endTime: '2026-04-10T11:00:00',
  status: 'PENDING',
  branchId: 'branch1',
  createdAt: 1000,
  updatedAt: 1000,
};

const LESSON_RESERVATION_NO_BRANCH: LessonReservation = {
  ...LESSON_RESERVATION,
  id: 'lesson-res-no-branch',
  branchId: undefined,
};

const BAY_RESERVATION: BayReservation = {
  id: 'bay-res-1',
  branchId: 'branch1',
  bayId: 'bay1',
  startTime: '2026-04-10T14:00:00',
  endTime: '2026-04-10T15:00:00',
  clientId: '홍길동_010-1234-5678',
  clientName: '홍길동',
  clientPhone: '010-1234-5678',
  paidPoints: 50,
  status: 'CONFIRMED',
  createdAt: 2000,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function okFetch() {
  mockFetch.mockResolvedValue({ ok: true } as Response);
}

function failFetch() {
  mockFetch.mockResolvedValue({ ok: false, status: 500 } as Response);
}

function getPostedBodies(): Array<{ to: string; title: string; body: string }> {
  return mockFetch.mock.calls.map((call) => JSON.parse(call[1].body));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('reservationPushNotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetNotifiedKeysForTesting();
    vi.mocked(firebaseService.isInitialized).mockReturnValue(false);
    okFetch();
  });

  // ── Lesson reservation notifications ──────────────────────────────────────

  describe('sendLessonReservationNotifications', () => {
    it('sends push to the assigned coach when coach has a push token', async () => {
      vi.mocked(storageService.getCoachById).mockReturnValue(COACH_WITH_TOKEN);
      vi.mocked(storageService.getBranchAdminAccounts).mockReturnValue([]);

      await sendLessonReservationNotifications(LESSON_RESERVATION);

      const bodies = getPostedBodies();
      expect(bodies).toHaveLength(1);
      expect(bodies[0].to).toBe(COACH_WITH_TOKEN.pushToken);
      expect(bodies[0].title).toBe('새 레슨 예약');
      expect(bodies[0].body).toContain('홍길동');
    });

    it('sends push to branch admins with tokens when branchId is present', async () => {
      vi.mocked(storageService.getCoachById).mockReturnValue(null);
      vi.mocked(storageService.getBranchAdminAccounts).mockReturnValue([ADMIN_WITH_TOKEN]);

      await sendLessonReservationNotifications(LESSON_RESERVATION);

      const bodies = getPostedBodies();
      expect(bodies).toHaveLength(1);
      expect(bodies[0].to).toBe(ADMIN_WITH_TOKEN.pushToken);
      expect(bodies[0].title).toBe('새 레슨 예약 알림');
      expect(bodies[0].body).toContain('홍길동');
    });

    it('skips coach notification when coach has no push token', async () => {
      vi.mocked(storageService.getCoachById).mockReturnValue(COACH_WITHOUT_TOKEN);
      vi.mocked(storageService.getBranchAdminAccounts).mockReturnValue([]);

      await sendLessonReservationNotifications(LESSON_RESERVATION);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('skips branch admin notification when branchId is absent', async () => {
      vi.mocked(storageService.getCoachById).mockReturnValue(null);

      await sendLessonReservationNotifications(LESSON_RESERVATION_NO_BRANCH);

      expect(storageService.getBranchAdminAccounts).not.toHaveBeenCalled();
    });

    it('skips inactive branch admins', async () => {
      vi.mocked(storageService.getCoachById).mockReturnValue(null);
      vi.mocked(storageService.getBranchAdminAccounts).mockReturnValue([INACTIVE_ADMIN]);

      await sendLessonReservationNotifications(LESSON_RESERVATION);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('includes the reservation date and time in the notification body', async () => {
      vi.mocked(storageService.getCoachById).mockReturnValue(COACH_WITH_TOKEN);
      vi.mocked(storageService.getBranchAdminAccounts).mockReturnValue([]);

      await sendLessonReservationNotifications(LESSON_RESERVATION);

      const body = getPostedBodies()[0].body;
      expect(body).toContain('2026-04-10');
      expect(body).toContain('10:00');
    });

    it('does NOT send a duplicate notification for the same reservation', async () => {
      vi.mocked(storageService.getCoachById).mockReturnValue(COACH_WITH_TOKEN);
      vi.mocked(storageService.getBranchAdminAccounts).mockReturnValue([]);

      await sendLessonReservationNotifications(LESSON_RESERVATION);
      await sendLessonReservationNotifications(LESSON_RESERVATION);

      // fetch must be called only once (first call only)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not fail the caller when push delivery returns a non-ok response', async () => {
      vi.mocked(storageService.getCoachById).mockReturnValue(COACH_WITH_TOKEN);
      vi.mocked(storageService.getBranchAdminAccounts).mockReturnValue([]);
      failFetch();

      await expect(
        sendLessonReservationNotifications(LESSON_RESERVATION)
      ).resolves.not.toThrow();
    });

    it('does not fail the caller when fetch rejects (network error)', async () => {
      vi.mocked(storageService.getCoachById).mockReturnValue(COACH_WITH_TOKEN);
      vi.mocked(storageService.getBranchAdminAccounts).mockReturnValue([]);
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        sendLessonReservationNotifications(LESSON_RESERVATION)
      ).resolves.not.toThrow();
    });

    it('uses firebaseService when Firebase is initialized', async () => {
      vi.mocked(firebaseService.isInitialized).mockReturnValue(true);
      vi.mocked(firebaseService.getCoachById).mockResolvedValue(COACH_WITH_TOKEN);
      vi.mocked(firebaseService.getBranchAdminAccounts).mockResolvedValue([]);

      await sendLessonReservationNotifications(LESSON_RESERVATION);

      expect(firebaseService.getCoachById).toHaveBeenCalledWith('coach1');
      expect(storageService.getCoachById).not.toHaveBeenCalled();
    });

    it('uses storageService when Firebase is not initialized', async () => {
      vi.mocked(storageService.getCoachById).mockReturnValue(COACH_WITH_TOKEN);
      vi.mocked(storageService.getBranchAdminAccounts).mockReturnValue([]);

      await sendLessonReservationNotifications(LESSON_RESERVATION);

      expect(storageService.getCoachById).toHaveBeenCalledWith('coach1');
      expect(firebaseService.getCoachById).not.toHaveBeenCalled();
    });
  });

  // ── Bay reservation notifications ─────────────────────────────────────────

  describe('sendBayReservationNotifications', () => {
    it('sends push to branch admins with tokens', async () => {
      vi.mocked(storageService.getBranchAdminAccounts).mockReturnValue([ADMIN_WITH_TOKEN]);

      await sendBayReservationNotifications(BAY_RESERVATION, '강남점');

      const bodies = getPostedBodies();
      expect(bodies).toHaveLength(1);
      expect(bodies[0].to).toBe(ADMIN_WITH_TOKEN.pushToken);
      expect(bodies[0].title).toBe('새 타석 예약 알림');
      expect(bodies[0].body).toContain('홍길동');
    });

    it('includes branch name in the notification body', async () => {
      vi.mocked(storageService.getBranchAdminAccounts).mockReturnValue([ADMIN_WITH_TOKEN]);

      await sendBayReservationNotifications(BAY_RESERVATION, '강남점');

      expect(getPostedBodies()[0].body).toContain('강남점');
    });

    it('sends no push when no admins have push tokens', async () => {
      vi.mocked(storageService.getBranchAdminAccounts).mockReturnValue([ADMIN_WITHOUT_TOKEN]);

      await sendBayReservationNotifications(BAY_RESERVATION);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('skips inactive branch admins', async () => {
      vi.mocked(storageService.getBranchAdminAccounts).mockReturnValue([INACTIVE_ADMIN]);

      await sendBayReservationNotifications(BAY_RESERVATION);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sends push to multiple active admins', async () => {
      const secondAdmin: BranchAdminAccount = {
        ...ADMIN_WITH_TOKEN,
        id: 'branch1:admin99',
        pushToken: 'ExponentPushToken[second-admin-token]',
      };
      vi.mocked(storageService.getBranchAdminAccounts).mockReturnValue([
        ADMIN_WITH_TOKEN,
        secondAdmin,
      ]);

      await sendBayReservationNotifications(BAY_RESERVATION);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('includes date and time in the notification body', async () => {
      vi.mocked(storageService.getBranchAdminAccounts).mockReturnValue([ADMIN_WITH_TOKEN]);

      await sendBayReservationNotifications(BAY_RESERVATION);

      const body = getPostedBodies()[0].body;
      expect(body).toContain('2026-04-10');
      expect(body).toContain('14:00');
    });

    it('does NOT send a duplicate notification for the same bay reservation', async () => {
      vi.mocked(storageService.getBranchAdminAccounts).mockReturnValue([ADMIN_WITH_TOKEN]);

      await sendBayReservationNotifications(BAY_RESERVATION);
      await sendBayReservationNotifications(BAY_RESERVATION);

      // fetch must be called only once (first call)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not fail the caller when push delivery returns a non-ok response', async () => {
      vi.mocked(storageService.getBranchAdminAccounts).mockReturnValue([ADMIN_WITH_TOKEN]);
      failFetch();

      await expect(
        sendBayReservationNotifications(BAY_RESERVATION)
      ).resolves.not.toThrow();
    });

    it('does not fail the caller when fetch rejects (network error)', async () => {
      vi.mocked(storageService.getBranchAdminAccounts).mockReturnValue([ADMIN_WITH_TOKEN]);
      mockFetch.mockRejectedValue(new Error('timeout'));

      await expect(
        sendBayReservationNotifications(BAY_RESERVATION)
      ).resolves.not.toThrow();
    });

    it('uses firebaseService when Firebase is initialized', async () => {
      vi.mocked(firebaseService.isInitialized).mockReturnValue(true);
      vi.mocked(firebaseService.getBranchAdminAccounts).mockResolvedValue([]);

      await sendBayReservationNotifications(BAY_RESERVATION);

      expect(firebaseService.getBranchAdminAccounts).toHaveBeenCalledWith('branch1');
      expect(storageService.getBranchAdminAccounts).not.toHaveBeenCalled();
    });
  });
});
