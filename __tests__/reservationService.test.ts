import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reservationService } from '../services/reservationService';
import { notificationService } from '../services/notificationService';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { LessonReservation } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/firebase', () => ({
  firebaseService: {
    isInitialized: vi.fn(),
    getReservations: vi.fn(),
    updateReservation: vi.fn(),
  },
}));

vi.mock('../services/storage', () => ({
  storageService: {
    getReservations: vi.fn(),
    updateReservation: vi.fn(),
  },
}));

vi.mock('../services/notificationService', () => ({
  notificationService: {
    sendLessonConfirmedNotification: vi.fn(),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PENDING_RESERVATION: LessonReservation = {
  id: 'res-1',
  coachId: 'coach-1',
  coachName: '김코치',
  clientId: '홍길동_010-1234-5678',
  clientName: '홍길동',
  clientPhone: '010-1234-5678',
  startTime: '2026-04-10T10:00:00',
  endTime: '2026-04-10T11:00:00',
  status: 'PENDING',
  createdAt: 1000,
  updatedAt: 1000,
};

const ALREADY_NOTIFIED_RESERVATION: LessonReservation = {
  ...PENDING_RESERVATION,
  id: 'res-2',
  confirmationNotifiedAt: 9999,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('reservationService.approveReservation – notification on approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(firebaseService.isInitialized).mockReturnValue(false);
    vi.mocked(storageService.updateReservation).mockReturnValue(undefined);
  });

  it('sends a confirmation notification to the member when approval succeeds', async () => {
    vi.mocked(storageService.getReservations).mockReturnValue([PENDING_RESERVATION]);
    vi.mocked(notificationService.sendLessonConfirmedNotification).mockResolvedValue(true);

    const result = await reservationService.approveReservation('res-1');

    expect(result.status).toBe('CONFIRMED');
    expect(notificationService.sendLessonConfirmedNotification).toHaveBeenCalledOnce();
    expect(notificationService.sendLessonConfirmedNotification).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CONFIRMED', id: 'res-1' })
    );
  });

  it('persists confirmationNotifiedAt when notification is sent', async () => {
    vi.mocked(storageService.getReservations).mockReturnValue([PENDING_RESERVATION]);
    vi.mocked(notificationService.sendLessonConfirmedNotification).mockResolvedValue(true);

    const result = await reservationService.approveReservation('res-1');

    expect(result.confirmationNotifiedAt).toBeTypeOf('number');
    // updateReservation called twice: once for CONFIRMED, once for confirmationNotifiedAt
    expect(storageService.updateReservation).toHaveBeenCalledTimes(2);
  });

  it('does not send notification for non-PENDING reservations (throws before notification)', async () => {
    const available: LessonReservation = { ...PENDING_RESERVATION, status: 'AVAILABLE' };
    vi.mocked(storageService.getReservations).mockReturnValue([available]);

    await expect(reservationService.approveReservation('res-1')).rejects.toThrow(
      '대기 중인 예약만 승인할 수 있습니다.'
    );
    expect(notificationService.sendLessonConfirmedNotification).not.toHaveBeenCalled();
  });

  it('skips notification when reservation already has confirmationNotifiedAt', async () => {
    vi.mocked(storageService.getReservations).mockReturnValue([ALREADY_NOTIFIED_RESERVATION]);
    vi.mocked(notificationService.sendLessonConfirmedNotification).mockResolvedValue(true);

    const result = await reservationService.approveReservation('res-2');

    expect(result.status).toBe('CONFIRMED');
    expect(notificationService.sendLessonConfirmedNotification).not.toHaveBeenCalled();
  });

  it('approval succeeds even when notification delivery fails', async () => {
    vi.mocked(storageService.getReservations).mockReturnValue([PENDING_RESERVATION]);
    vi.mocked(notificationService.sendLessonConfirmedNotification).mockResolvedValue(false);

    const result = await reservationService.approveReservation('res-1');

    expect(result.status).toBe('CONFIRMED');
    // confirmationNotifiedAt is NOT set when notification was not delivered
    expect(result.confirmationNotifiedAt).toBeUndefined();
  });

  it('approval succeeds even when notificationService throws', async () => {
    vi.mocked(storageService.getReservations).mockReturnValue([PENDING_RESERVATION]);
    vi.mocked(notificationService.sendLessonConfirmedNotification).mockRejectedValue(
      new Error('Push service unavailable')
    );

    await expect(reservationService.approveReservation('res-1')).resolves.toMatchObject({
      status: 'CONFIRMED',
    });
  });

  it('uses firebaseService when firebase is initialized', async () => {
    vi.mocked(firebaseService.isInitialized).mockReturnValue(true);
    vi.mocked(firebaseService.getReservations).mockResolvedValue([PENDING_RESERVATION]);
    vi.mocked(firebaseService.updateReservation).mockResolvedValue(undefined);
    vi.mocked(notificationService.sendLessonConfirmedNotification).mockResolvedValue(true);

    const result = await reservationService.approveReservation('res-1');

    expect(result.status).toBe('CONFIRMED');
    expect(firebaseService.updateReservation).toHaveBeenCalled();
    expect(storageService.updateReservation).not.toHaveBeenCalled();
    expect(notificationService.sendLessonConfirmedNotification).toHaveBeenCalledOnce();
  });
});

describe('notificationService.sendLessonConfirmedNotification', () => {
  it('returns false for non-CONFIRMED reservations', async () => {
    const { notificationService: realService } = await vi.importActual<
      typeof import('../services/notificationService')
    >('../services/notificationService');

    const pending: LessonReservation = { ...PENDING_RESERVATION, status: 'PENDING' };
    const result = await realService.sendLessonConfirmedNotification(pending);
    expect(result).toBe(false);
  });

  it('returns false when reservation has no clientId', async () => {
    const { notificationService: realService } = await vi.importActual<
      typeof import('../services/notificationService')
    >('../services/notificationService');

    const noClient: LessonReservation = {
      ...PENDING_RESERVATION,
      status: 'CONFIRMED',
      clientId: undefined,
    };
    const result = await realService.sendLessonConfirmedNotification(noClient);
    expect(result).toBe(false);
  });
});
