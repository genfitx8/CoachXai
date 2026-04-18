import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createReservationRequestNotification,
  getUnreadReservationNotificationsForCoach,
  markNotificationsAsRead,
  RESERVATION_REQUEST_TYPE,
} from '../services/coachNotificationService';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { LessonReservation, NotificationMessage } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/firebase', () => ({
  firebaseService: {
    isInitialized: vi.fn(),
    sendNotification: vi.fn(),
    getNotifications: vi.fn(),
    updateNotification: vi.fn(),
  },
}));

vi.mock('../services/storage', () => ({
  storageService: {
    saveNotification: vi.fn(),
    getNotifications: vi.fn(),
    updateNotification: vi.fn(),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makePendingReservation = (
  overrides: Partial<LessonReservation> = {}
): LessonReservation => ({
  id: 'res-001',
  coachId: 'coach1',
  coachName: '박코치',
  clientId: 'client1',
  clientName: '김회원',
  clientPhone: '010-0000-0000',
  startTime: '2026-04-10T14:00:00',
  endTime: '2026-04-10T15:00:00',
  status: 'PENDING',
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

const makeNotification = (
  overrides: Partial<NotificationMessage> = {}
): NotificationMessage => ({
  id: 'notif-001',
  target: 'COACHES',
  targetCoachId: 'coach1',
  type: RESERVATION_REQUEST_TYPE,
  reservationId: 'res-001',
  title: '새 레슨 예약 요청',
  body: '김회원 회원이 2026-04-10 14:00 레슨을 요청했습니다.',
  createdAt: 1000,
  isRead: false,
  ...overrides,
});

// ─── createReservationRequestNotification (storage mode) ─────────────────────

describe('coachNotificationService – createReservationRequestNotification (storage)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (firebaseService.isInitialized as any).mockReturnValue(false);
    (storageService.getNotifications as any).mockReturnValue([]);
    (storageService.saveNotification as any).mockReturnValue(undefined);
  });

  it('creates a notification with the correct fields', async () => {
    const reservation = makePendingReservation();
    await createReservationRequestNotification(reservation);

    expect(storageService.saveNotification).toHaveBeenCalledTimes(1);
    const saved = (storageService.saveNotification as any).mock.calls[0][0] as NotificationMessage;
    expect(saved.target).toBe('COACHES');
    expect(saved.targetCoachId).toBe('coach1');
    expect(saved.type).toBe(RESERVATION_REQUEST_TYPE);
    expect(saved.reservationId).toBe('res-001');
    expect(saved.isRead).toBe(false);
    expect(saved.title).toBe('새 레슨 예약 요청');
    expect(saved.body).toContain('김회원');
    expect(saved.body).toContain('2026-04-10');
    expect(saved.body).toContain('14:00');
  });

  it('uses fallback client name when clientName is absent', async () => {
    const reservation = makePendingReservation({ clientName: undefined });
    await createReservationRequestNotification(reservation);

    const saved = (storageService.saveNotification as any).mock.calls[0][0] as NotificationMessage;
    expect(saved.body).toContain('회원');
  });

  it('skips duplicate notification for the same reservationId', async () => {
    // Existing notification for the same reservation
    (storageService.getNotifications as any).mockReturnValue([
      makeNotification({ isRead: false }),
    ]);

    await createReservationRequestNotification(makePendingReservation());

    expect(storageService.saveNotification).not.toHaveBeenCalled();
  });

  it('does not throw when storage throws, error is caught', async () => {
    (storageService.getNotifications as any).mockImplementation(() => {
      throw new Error('storage error');
    });

    await expect(
      createReservationRequestNotification(makePendingReservation())
    ).resolves.toBeUndefined();
  });
});

// ─── createReservationRequestNotification (firebase mode) ────────────────────

describe('coachNotificationService – createReservationRequestNotification (firebase)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (firebaseService.isInitialized as any).mockReturnValue(true);
    (firebaseService.getNotifications as any).mockResolvedValue([]);
    (firebaseService.sendNotification as any).mockResolvedValue(undefined);
  });

  it('uses firebaseService.sendNotification in firebase mode', async () => {
    const reservation = makePendingReservation();
    await createReservationRequestNotification(reservation);

    expect(firebaseService.sendNotification).toHaveBeenCalledTimes(1);
    expect(storageService.saveNotification).not.toHaveBeenCalled();
    const saved = (firebaseService.sendNotification as any).mock.calls[0][0] as NotificationMessage;
    expect(saved.targetCoachId).toBe('coach1');
    expect(saved.type).toBe(RESERVATION_REQUEST_TYPE);
  });

  it('deduplicates using firebaseService.getNotifications in firebase mode', async () => {
    (firebaseService.getNotifications as any).mockResolvedValue([
      makeNotification(),
    ]);

    await createReservationRequestNotification(makePendingReservation());

    expect(firebaseService.sendNotification).not.toHaveBeenCalled();
  });
});

// ─── getUnreadReservationNotificationsForCoach ────────────────────────────────

describe('coachNotificationService – getUnreadReservationNotificationsForCoach', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (firebaseService.isInitialized as any).mockReturnValue(false);
  });

  it('returns only unread notifications for the target coach', async () => {
    (storageService.getNotifications as any).mockReturnValue([
      makeNotification({ id: 'n1', targetCoachId: 'coach1', isRead: false }),
      makeNotification({ id: 'n2', targetCoachId: 'coach1', isRead: true }),   // read – must be excluded
      makeNotification({ id: 'n3', targetCoachId: 'coach2', isRead: false }),  // different coach
      makeNotification({ id: 'n4', targetCoachId: 'coach1', isRead: false, reservationId: 'res-002' }),
    ]);

    const result = await getUnreadReservationNotificationsForCoach('coach1');

    expect(result).toHaveLength(2);
    expect(result.map((n) => n.id)).toEqual(expect.arrayContaining(['n1', 'n4']));
  });

  it('returns an empty array when there are no unread notifications', async () => {
    (storageService.getNotifications as any).mockReturnValue([]);
    const result = await getUnreadReservationNotificationsForCoach('coach1');
    expect(result).toEqual([]);
  });

  it('does not return notifications for unrelated coaches', async () => {
    (storageService.getNotifications as any).mockReturnValue([
      makeNotification({ targetCoachId: 'coach99', isRead: false }),
    ]);

    const result = await getUnreadReservationNotificationsForCoach('coach1');
    expect(result).toHaveLength(0);
  });

  it('returns an empty array when storage throws (never blocks login)', async () => {
    (storageService.getNotifications as any).mockImplementation(() => {
      throw new Error('storage error');
    });

    const result = await getUnreadReservationNotificationsForCoach('coach1');
    expect(result).toEqual([]);
  });

  it('filters only LESSON_RESERVATION_REQUEST type notifications', async () => {
    (storageService.getNotifications as any).mockReturnValue([
      makeNotification({ id: 'n1', type: RESERVATION_REQUEST_TYPE, isRead: false }),
      makeNotification({ id: 'n2', type: 'OTHER_TYPE', isRead: false }),
    ]);

    const result = await getUnreadReservationNotificationsForCoach('coach1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('n1');
  });
});

// ─── markNotificationsAsRead ──────────────────────────────────────────────────

describe('coachNotificationService – markNotificationsAsRead', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (firebaseService.isInitialized as any).mockReturnValue(false);
    (storageService.updateNotification as any).mockReturnValue(undefined);
  });

  it('marks all provided notification IDs as read (storage mode)', async () => {
    await markNotificationsAsRead(['n1', 'n2', 'n3']);

    expect(storageService.updateNotification).toHaveBeenCalledTimes(3);
    expect(storageService.updateNotification).toHaveBeenCalledWith('n1', { isRead: true });
    expect(storageService.updateNotification).toHaveBeenCalledWith('n2', { isRead: true });
    expect(storageService.updateNotification).toHaveBeenCalledWith('n3', { isRead: true });
  });

  it('does nothing when the IDs array is empty', async () => {
    await markNotificationsAsRead([]);
    expect(storageService.updateNotification).not.toHaveBeenCalled();
  });

  it('continues processing remaining IDs if one update fails', async () => {
    (storageService.updateNotification as any)
      .mockImplementationOnce(() => { throw new Error('fail'); })
      .mockReturnValue(undefined);

    await expect(markNotificationsAsRead(['n1', 'n2'])).resolves.toBeUndefined();
    // n2 should still have been attempted
    expect(storageService.updateNotification).toHaveBeenCalledWith('n2', { isRead: true });
  });

  it('uses firebaseService.updateNotification in firebase mode', async () => {
    (firebaseService.isInitialized as any).mockReturnValue(true);
    (firebaseService.updateNotification as any).mockResolvedValue(undefined);

    await markNotificationsAsRead(['n1']);

    expect(firebaseService.updateNotification).toHaveBeenCalledWith('n1', { isRead: true });
    expect(storageService.updateNotification).not.toHaveBeenCalled();
  });
});

// ─── Integration: requestReservation triggers notification ───────────────────

describe('reservationService integration – notification created on requestReservation', () => {
  // This is tested via the reservationService.test.ts mock, which ensures
  // sendLessonReservationNotifications and createReservationRequestNotification
  // are called. We verify the coachNotificationService mock here.
  it('RESERVATION_REQUEST_TYPE constant has expected value', () => {
    expect(RESERVATION_REQUEST_TYPE).toBe('LESSON_RESERVATION_REQUEST');
  });
});
