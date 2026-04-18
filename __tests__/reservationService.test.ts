import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reservationService, VIRTUAL_SLOT_ID_PREFIX } from '../services/reservationService';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { LessonReservation, CoachProfile } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/firebase', () => ({
  firebaseService: {
    isInitialized: vi.fn(),
    getReservations: vi.fn(),
    saveReservation: vi.fn(),
    saveCoach: vi.fn(),
    updateReservation: vi.fn(),
    deleteReservation: vi.fn(),
    getCoachById: vi.fn(),
  },
}));

vi.mock('../services/storage', () => ({
  storageService: {
    getReservations: vi.fn(),
    saveReservation: vi.fn(),
    saveCoach: vi.fn(),
    updateReservation: vi.fn(),
    deleteReservation: vi.fn(),
    getCoachById: vi.fn(),
  },
}));

vi.mock('../services/reservationPushNotificationService', () => ({
  sendLessonReservationNotifications: vi.fn().mockResolvedValue(undefined),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_COACH: CoachProfile = {
  id: 'coach1',
  name: '박코치',
  email: 'coach@example.com',
  phone: '010-1234-5678',
};

const makeReservation = (
  overrides: Partial<LessonReservation> = {}
): LessonReservation => ({
  id: 'res1',
  coachId: 'coach1',
  coachName: '박코치',
  startTime: '2026-04-01T09:00:00',
  endTime: '2026-04-01T10:00:00',
  status: 'AVAILABLE',
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

// ─── createHourSlot ───────────────────────────────────────────────────────────

describe('reservationService – createHourSlot', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (firebaseService.isInitialized as any).mockReturnValue(false);
    (storageService.getReservations as any).mockReturnValue([]);
    (storageService.saveReservation as any).mockReturnValue(undefined);
  });

  it('creates a 1-hour AVAILABLE slot with correct start/end times (storage mode)', async () => {
    const result = await reservationService.createHourSlot('coach1', '박코치', '2026-04-01', 9);

    expect(result.coachId).toBe('coach1');
    expect(result.coachName).toBe('박코치');
    expect(result.startTime).toBe('2026-04-01T09:00:00');
    expect(result.endTime).toBe('2026-04-01T10:00:00');
    expect(result.status).toBe('AVAILABLE');
    expect(storageService.saveReservation).toHaveBeenCalledWith(
      expect.objectContaining({ startTime: '2026-04-01T09:00:00', endTime: '2026-04-01T10:00:00' })
    );
  });

  it('pads single-digit hours correctly (hour 8 → 08:00)', async () => {
    const result = await reservationService.createHourSlot('coach1', '박코치', '2026-04-01', 8);
    expect(result.startTime).toBe('2026-04-01T08:00:00');
    expect(result.endTime).toBe('2026-04-01T09:00:00');
  });

  it('throws when the same hour slot already exists (non-cancelled)', async () => {
    (storageService.getReservations as any).mockReturnValue([
      makeReservation({ startTime: '2026-04-01T09:00:00', endTime: '2026-04-01T10:00:00', status: 'AVAILABLE' }),
    ]);

    await expect(
      reservationService.createHourSlot('coach1', '박코치', '2026-04-01', 9)
    ).rejects.toThrow('해당 시간대에 이미 슬롯이 존재합니다.');
  });

  it('allows creating a slot when only a CANCELLED reservation exists for that hour', async () => {
    (storageService.getReservations as any).mockReturnValue([
      makeReservation({
        startTime: '2026-04-01T09:00:00',
        endTime: '2026-04-01T10:00:00',
        status: 'CANCELLED',
      }),
    ]);

    const result = await reservationService.createHourSlot('coach1', '박코치', '2026-04-01', 9);
    expect(result.status).toBe('AVAILABLE');
  });

  it('does not treat a different coachId as a conflict', async () => {
    (storageService.getReservations as any).mockReturnValue([
      makeReservation({
        coachId: 'other_coach',
        startTime: '2026-04-01T09:00:00',
        endTime: '2026-04-01T10:00:00',
        status: 'AVAILABLE',
      }),
    ]);

    const result = await reservationService.createHourSlot('coach1', '박코치', '2026-04-01', 9);
    expect(result.status).toBe('AVAILABLE');
  });

  it('uses firebase saveReservation when firebase is initialized', async () => {
    (firebaseService.isInitialized as any).mockReturnValue(true);
    (firebaseService.getReservations as any).mockResolvedValue([]);
    (firebaseService.saveReservation as any).mockResolvedValue(undefined);

    const result = await reservationService.createHourSlot('coach1', '박코치', '2026-04-01', 14);

    expect(result.startTime).toBe('2026-04-01T14:00:00');
    expect(firebaseService.saveReservation).toHaveBeenCalled();
    expect(storageService.saveReservation).not.toHaveBeenCalled();
  });

  it('throws when firebase slot already exists (firebase mode)', async () => {
    (firebaseService.isInitialized as any).mockReturnValue(true);
    (firebaseService.getReservations as any).mockResolvedValue([
      makeReservation({ startTime: '2026-04-01T10:00:00', endTime: '2026-04-01T11:00:00', status: 'CONFIRMED' }),
    ]);

    await expect(
      reservationService.createHourSlot('coach1', '박코치', '2026-04-01', 10)
    ).rejects.toThrow('해당 시간대에 이미 슬롯이 존재합니다.');
  });
});

// ─── CoachProfile.workingSchedule ────────────────────────────────────────────

describe('CoachProfile.workingSchedule type field', () => {
  it('accepts a coach profile with a workingSchedule', () => {
    const coach: CoachProfile = {
      ...SAMPLE_COACH,
      workingSchedule: {
        mon: { open: '09:00', close: '18:00', isClosed: false },
        tue: { open: '09:00', close: '18:00', isClosed: false },
        sat: { open: '10:00', close: '15:00', isClosed: false },
        sun: { isClosed: true, open: '00:00', close: '00:00' },
      },
    };
    expect(coach.workingSchedule?.mon?.open).toBe('09:00');
    expect(coach.workingSchedule?.sun?.isClosed).toBe(true);
  });

  it('accepts a coach profile without a workingSchedule (optional field)', () => {
    const coach: CoachProfile = { ...SAMPLE_COACH };
    expect(coach.workingSchedule).toBeUndefined();
  });
});

// ─── toggleHourSlot ───────────────────────────────────────────────────────────

describe('reservationService – toggleHourSlot', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (firebaseService.isInitialized as any).mockReturnValue(false);
    (storageService.getReservations as any).mockReturnValue([]);
    (storageService.saveReservation as any).mockReturnValue(undefined);
    (storageService.updateReservation as any).mockReturnValue(undefined);
    (storageService.deleteReservation as any).mockReturnValue(undefined);
  });

  it('creates a BLOCKED slot when no existing record (working-hour default → blocked)', async () => {
    const result = await reservationService.toggleHourSlot('coach1', '박코치', '2026-04-01', 9);

    expect(result.action).toBe('blocked');
    expect(storageService.saveReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'BLOCKED',
        startTime: '2026-04-01T09:00:00',
        endTime: '2026-04-01T10:00:00',
        coachId: 'coach1',
      })
    );
  });

  it('deletes BLOCKED slot and restores to default-available', async () => {
    (storageService.getReservations as any).mockReturnValue([
      makeReservation({ id: 'block1', status: 'BLOCKED' }),
    ]);

    const result = await reservationService.toggleHourSlot('coach1', '박코치', '2026-04-01', 9);

    expect(result.action).toBe('available');
    expect(storageService.deleteReservation).toHaveBeenCalledWith('block1');
    expect(storageService.saveReservation).not.toHaveBeenCalled();
  });

  it('converts explicit AVAILABLE slot to BLOCKED', async () => {
    (storageService.getReservations as any).mockReturnValue([
      makeReservation({ id: 'avail1', status: 'AVAILABLE' }),
    ]);

    const result = await reservationService.toggleHourSlot('coach1', '박코치', '2026-04-01', 9);

    expect(result.action).toBe('blocked');
    expect(storageService.updateReservation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'avail1', status: 'BLOCKED' })
    );
    expect(storageService.deleteReservation).not.toHaveBeenCalled();
  });

  it('throws when attempting to toggle a PENDING (booked) slot', async () => {
    (storageService.getReservations as any).mockReturnValue([
      makeReservation({ status: 'PENDING', clientId: 'client1', clientName: '김회원' }),
    ]);

    await expect(
      reservationService.toggleHourSlot('coach1', '박코치', '2026-04-01', 9)
    ).rejects.toThrow('이미 예약된 시간대는 변경할 수 없습니다.');
  });

  it('throws when attempting to toggle a CONFIRMED (booked) slot', async () => {
    (storageService.getReservations as any).mockReturnValue([
      makeReservation({ status: 'CONFIRMED', clientId: 'client1', clientName: '김회원' }),
    ]);

    await expect(
      reservationService.toggleHourSlot('coach1', '박코치', '2026-04-01', 9)
    ).rejects.toThrow('이미 예약된 시간대는 변경할 수 없습니다.');
  });

  it('ignores CANCELLED slots when checking for existing record', async () => {
    (storageService.getReservations as any).mockReturnValue([
      makeReservation({ status: 'CANCELLED' }),
    ]);

    const result = await reservationService.toggleHourSlot('coach1', '박코치', '2026-04-01', 9);

    expect(result.action).toBe('blocked');
    expect(storageService.saveReservation).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'BLOCKED' })
    );
  });
});

// ─── getAvailableWorkingHourSlots ─────────────────────────────────────────────

describe('reservationService – getAvailableWorkingHourSlots', () => {
  const COACH_WITH_SCHEDULE: CoachProfile = {
    ...SAMPLE_COACH,
    workingSchedule: {
      // 2026-04-01 is a Wednesday (wed)
      wed: { open: '09:00', close: '12:00', isClosed: false },
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    (firebaseService.isInitialized as any).mockReturnValue(false);
    (storageService.getReservations as any).mockReturnValue([]);
    (storageService.getCoachById as any).mockReturnValue(COACH_WITH_SCHEDULE);
  });

  it('returns virtual AVAILABLE slots for each working hour with no reservations', async () => {
    const slots = await reservationService.getAvailableWorkingHourSlots('coach1', '2026-04-01');

    // 09:00, 10:00, 11:00 (3 hours: 09–12)
    expect(slots).toHaveLength(3);
    expect(slots[0].startTime).toBe('2026-04-01T09:00:00');
    expect(slots[0].endTime).toBe('2026-04-01T10:00:00');
    expect(slots[0].status).toBe('AVAILABLE');
    expect(slots[0].id).toMatch(new RegExp(`^${VIRTUAL_SLOT_ID_PREFIX}`));
    expect(slots[2].startTime).toBe('2026-04-01T11:00:00');
  });

  it('excludes hours blocked by BLOCKED reservations', async () => {
    (storageService.getReservations as any).mockReturnValue([
      makeReservation({ startTime: '2026-04-01T10:00:00', endTime: '2026-04-01T11:00:00', status: 'BLOCKED' }),
    ]);

    const slots = await reservationService.getAvailableWorkingHourSlots('coach1', '2026-04-01');

    expect(slots).toHaveLength(2);
    expect(slots.find((s) => s.startTime.includes('T10:'))).toBeUndefined();
  });

  it('excludes hours with PENDING reservations', async () => {
    (storageService.getReservations as any).mockReturnValue([
      makeReservation({
        startTime: '2026-04-01T09:00:00',
        endTime: '2026-04-01T10:00:00',
        status: 'PENDING',
        clientId: 'client1',
      }),
    ]);

    const slots = await reservationService.getAvailableWorkingHourSlots('coach1', '2026-04-01');

    expect(slots).toHaveLength(2);
    expect(slots[0].startTime).toBe('2026-04-01T10:00:00');
  });

  it('excludes hours with CONFIRMED reservations', async () => {
    (storageService.getReservations as any).mockReturnValue([
      makeReservation({
        startTime: '2026-04-01T11:00:00',
        endTime: '2026-04-01T12:00:00',
        status: 'CONFIRMED',
        clientId: 'client1',
      }),
    ]);

    const slots = await reservationService.getAvailableWorkingHourSlots('coach1', '2026-04-01');

    expect(slots).toHaveLength(2);
    expect(slots.find((s) => s.startTime.includes('T11:'))).toBeUndefined();
  });

  it('returns empty array for non-working days (isClosed)', async () => {
    const closedCoach: CoachProfile = {
      ...SAMPLE_COACH,
      workingSchedule: {
        wed: { open: '09:00', close: '18:00', isClosed: true },
      },
    };
    (storageService.getCoachById as any).mockReturnValue(closedCoach);

    const slots = await reservationService.getAvailableWorkingHourSlots('coach1', '2026-04-01');

    expect(slots).toHaveLength(0);
  });

  it('falls back to explicit available slots when no working schedule configured', async () => {
    (storageService.getCoachById as any).mockReturnValue({ ...SAMPLE_COACH });
    (storageService.getReservations as any).mockReturnValue([
      makeReservation({ startTime: '2026-04-01T09:00:00', endTime: '2026-04-01T10:00:00', status: 'AVAILABLE' }),
    ]);

    const slots = await reservationService.getAvailableWorkingHourSlots('coach1', '2026-04-01');

    expect(slots).toHaveLength(1);
    expect(slots[0].id).not.toMatch(new RegExp(`^${VIRTUAL_SLOT_ID_PREFIX}`));
  });

  it('prefers explicit AVAILABLE record over virtual slot for same hour', async () => {
    (storageService.getReservations as any).mockReturnValue([
      makeReservation({ id: 'real1', startTime: '2026-04-01T09:00:00', endTime: '2026-04-01T10:00:00', status: 'AVAILABLE' }),
    ]);

    const slots = await reservationService.getAvailableWorkingHourSlots('coach1', '2026-04-01');

    const nineSlot = slots.find((s) => s.startTime.includes('T09:'));
    expect(nineSlot?.id).toBe('real1');
  });

  it('returns slots sorted by start time', async () => {
    const slots = await reservationService.getAvailableWorkingHourSlots('coach1', '2026-04-01');

    for (let i = 1; i < slots.length; i++) {
      expect(new Date(slots[i].startTime).getTime()).toBeGreaterThan(
        new Date(slots[i - 1].startTime).getTime()
      );
    }
  });
});
