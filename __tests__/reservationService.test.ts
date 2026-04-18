import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reservationService } from '../services/reservationService';
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
  },
}));

vi.mock('../services/storage', () => ({
  storageService: {
    getReservations: vi.fn(),
    saveReservation: vi.fn(),
    saveCoach: vi.fn(),
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
