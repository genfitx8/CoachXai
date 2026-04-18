import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bayReservationService } from '../services/bayReservationService';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { BayReservation, Bay, Branch, BayPriceRule, CoachProfile } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/firebase', () => ({
  firebaseService: {
    isInitialized: vi.fn(),
    getBayReservationsByBranch: vi.fn(),
    getBays: vi.fn(),
    updateBayReservation: vi.fn(),
    getBranches: vi.fn(),
    getBayPriceRules: vi.fn(),
    saveBayReservation: vi.fn(),
    saveCoach: vi.fn(),
  },
}));

vi.mock('../services/storage', () => ({
  storageService: {
    getBayReservationsByBranch: vi.fn(),
    getBays: vi.fn(),
    getBranches: vi.fn(),
    getBayPriceRules: vi.fn(),
    saveBayReservation: vi.fn(),
  },
}));

vi.mock('../services/reservationPushNotificationService', () => ({
  sendBayReservationNotifications: vi.fn().mockResolvedValue(undefined),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_RESERVATIONS: BayReservation[] = [
  {
    id: 'branch1_bay1_20260325_10',
    branchId: 'branch1',
    bayId: 'bay1',
    startTime: '2026-03-25T10:00:00',
    endTime: '2026-03-25T11:00:00',
    clientId: 'test_010',
    clientName: 'test',
    clientPhone: '010',
    paidPoints: 50,
    status: 'CONFIRMED',
    createdAt: 1000,
  },
];

const SAMPLE_BAYS: Bay[] = [
  {
    id: 'bay1',
    branchId: 'branch1',
    floor: '1',
    roomNumber: '01',
    isActive: true,
    createdAt: 1000,
  },
];

const SAMPLE_BRANCH: Branch = {
  id: 'branch1',
  name: '테스트 지점',
  isActive: true,
  holidays: [],
  createdAt: 1000,
  openingHours: {
    mon: { open: '09:00', close: '22:00', isClosed: false },
    tue: { open: '09:00', close: '22:00', isClosed: false },
    wed: { open: '09:00', close: '22:00', isClosed: false },
    thu: { open: '09:00', close: '22:00', isClosed: false },
    fri: { open: '09:00', close: '22:00', isClosed: false },
    sat: { open: '09:00', close: '22:00', isClosed: false },
    sun: { open: '09:00', close: '22:00', isClosed: false },
  },
};

const SAMPLE_PRICE_RULE: BayPriceRule = {
  id: 'rule1',
  branchId: 'branch1',
  dayOfWeek: 3, // Wednesday (2026-03-25 is a Wednesday)
  startHour: 10,
  pricePoints: 100,
  isActive: true,
  createdAt: 1000,
};

const SAMPLE_COACH: CoachProfile = {
  id: 'coach1',
  name: '김코치',
  email: 'coach@test.com',
  phone: '010-1234-5678',
  currentPoints: 500,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('bayReservationService.getBranchReservations', () => {
  it('uses storageService when firebase is not initialized', async () => {
    vi.mocked(firebaseService.isInitialized).mockReturnValue(false);
    vi.mocked(storageService.getBayReservationsByBranch).mockReturnValue(
      SAMPLE_RESERVATIONS
    );

    const result = await bayReservationService.getBranchReservations(
      'branch1',
      '2026-03-25',
      '2026-03-31'
    );

    expect(storageService.getBayReservationsByBranch).toHaveBeenCalledWith(
      'branch1',
      '2026-03-25',
      '2026-03-31'
    );
    expect(result).toEqual(SAMPLE_RESERVATIONS);
  });

  it('uses firebaseService when firebase is initialized', async () => {
    vi.mocked(firebaseService.isInitialized).mockReturnValue(true);
    vi.mocked(firebaseService.getBayReservationsByBranch).mockResolvedValue(
      SAMPLE_RESERVATIONS
    );

    const result = await bayReservationService.getBranchReservations(
      'branch1',
      '2026-03-25',
      '2026-03-31'
    );

    expect(firebaseService.getBayReservationsByBranch).toHaveBeenCalledWith(
      'branch1',
      '2026-03-25',
      '2026-03-31'
    );
    expect(result).toEqual(SAMPLE_RESERVATIONS);
  });
});

describe('bayReservationService.getBranchBays', () => {
  it('uses storageService when firebase is not initialized', async () => {
    vi.mocked(firebaseService.isInitialized).mockReturnValue(false);
    vi.mocked(storageService.getBays).mockReturnValue(SAMPLE_BAYS);

    const result = await bayReservationService.getBranchBays('branch1');

    expect(storageService.getBays).toHaveBeenCalledWith('branch1');
    expect(result).toEqual(SAMPLE_BAYS);
  });

  it('uses firebaseService when firebase is initialized', async () => {
    vi.mocked(firebaseService.isInitialized).mockReturnValue(true);
    vi.mocked(firebaseService.getBays).mockResolvedValue(SAMPLE_BAYS);

    const result = await bayReservationService.getBranchBays('branch1');

    expect(firebaseService.getBays).toHaveBeenCalledWith('branch1');
    expect(result).toEqual(SAMPLE_BAYS);
  });
});

describe('bayReservationService.approveCancellation', () => {
  beforeEach(() => {
    vi.mocked(firebaseService.isInitialized).mockReturnValue(true);
    vi.mocked(firebaseService.updateBayReservation).mockResolvedValue();
  });

  it('updates reservation status to CANCELLED', async () => {
    await bayReservationService.approveCancellation('res1');
    expect(firebaseService.updateBayReservation).toHaveBeenCalledWith(
      'res1',
      expect.objectContaining({ status: 'CANCELLED' })
    );
  });
});

describe('bayReservationService.rejectCancellation', () => {
  beforeEach(() => {
    vi.mocked(firebaseService.isInitialized).mockReturnValue(true);
    vi.mocked(firebaseService.updateBayReservation).mockResolvedValue();
  });

  it('updates reservation status back to CONFIRMED', async () => {
    await bayReservationService.rejectCancellation('res1');
    expect(firebaseService.updateBayReservation).toHaveBeenCalledWith(
      'res1',
      expect.objectContaining({ status: 'CONFIRMED' })
    );
  });
});

describe('bayReservationService.createCoachBayReservation', () => {
  beforeEach(() => {
    vi.mocked(firebaseService.isInitialized).mockReturnValue(true);
    vi.mocked(firebaseService.getBranches).mockResolvedValue([SAMPLE_BRANCH]);
    vi.mocked(firebaseService.getBays).mockResolvedValue([SAMPLE_BAYS[0]]);
    vi.mocked(firebaseService.getBayPriceRules).mockResolvedValue([SAMPLE_PRICE_RULE]);
    vi.mocked(firebaseService.getBayReservationsByBranch).mockResolvedValue([]);
    vi.mocked(firebaseService.saveBayReservation).mockResolvedValue();
    vi.mocked(firebaseService.saveCoach).mockResolvedValue();
  });

  it('creates a reservation and deducts points from coach profile', async () => {
    const result = await bayReservationService.createCoachBayReservation({
      branch: SAMPLE_BRANCH,
      bay: SAMPLE_BAYS[0],
      date: '2026-03-25',
      startHour: 10,
      coach: SAMPLE_COACH,
    });

    expect(result.reservation.clientId).toBe('coach1');
    expect(result.reservation.clientName).toBe('김코치');
    expect(result.reservation.paidPoints).toBe(100);
    expect(result.reservation.status).toBe('CONFIRMED');
    expect(result.updatedCoach.currentPoints).toBe(400); // 500 - 100
    expect(firebaseService.saveBayReservation).toHaveBeenCalled();
    expect(firebaseService.saveCoach).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'coach1', currentPoints: 400 })
    );
  });

  it('throws when coach has insufficient points', async () => {
    const poorCoach: CoachProfile = { ...SAMPLE_COACH, currentPoints: 50 };
    await expect(
      bayReservationService.createCoachBayReservation({
        branch: SAMPLE_BRANCH,
        bay: SAMPLE_BAYS[0],
        date: '2026-03-25',
        startHour: 10,
        coach: poorCoach,
      })
    ).rejects.toThrow('포인트가 부족합니다');
  });

  it('throws when date is a holiday', async () => {
    const branchWithHoliday: Branch = { ...SAMPLE_BRANCH, holidays: ['2026-03-25'] };
    await expect(
      bayReservationService.createCoachBayReservation({
        branch: branchWithHoliday,
        bay: SAMPLE_BAYS[0],
        date: '2026-03-25',
        startHour: 10,
        coach: SAMPLE_COACH,
      })
    ).rejects.toThrow('휴무일');
  });

  it('throws when the bay is already booked (double-booking prevention)', async () => {
    const existingReservation: BayReservation = {
      id: 'branch1_bay1_20260325_10',
      branchId: 'branch1',
      bayId: 'bay1',
      startTime: '2026-03-25T10:00:00',
      endTime: '2026-03-25T11:00:00',
      clientId: 'other_client',
      clientName: 'other',
      clientPhone: '010',
      paidPoints: 100,
      status: 'CONFIRMED',
      createdAt: 999,
    };
    vi.mocked(firebaseService.getBayReservationsByBranch).mockResolvedValue([existingReservation]);

    await expect(
      bayReservationService.createCoachBayReservation({
        branch: SAMPLE_BRANCH,
        bay: SAMPLE_BAYS[0],
        date: '2026-03-25',
        startHour: 10,
        coach: SAMPLE_COACH,
      })
    ).rejects.toThrow('이미 예약된 타석');
  });

  it('rollbacks the reservation when coach point persistence fails', async () => {
    vi.mocked(firebaseService.saveCoach).mockRejectedValue(new Error('DB error'));
    vi.mocked(firebaseService.updateBayReservation).mockResolvedValue();

    await expect(
      bayReservationService.createCoachBayReservation({
        branch: SAMPLE_BRANCH,
        bay: SAMPLE_BAYS[0],
        date: '2026-03-25',
        startHour: 10,
        coach: SAMPLE_COACH,
      })
    ).rejects.toThrow('포인트 차감에 실패했습니다');

    expect(firebaseService.updateBayReservation).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'CANCELLED' })
    );
  });

  it('uses localStorage when firebase is not initialized', async () => {
    vi.mocked(firebaseService.isInitialized).mockReturnValue(false);
    vi.mocked(storageService.getBranches).mockReturnValue([SAMPLE_BRANCH]);
    vi.mocked(storageService.getBays).mockReturnValue([SAMPLE_BAYS[0]]);
    vi.mocked(storageService.getBayPriceRules).mockReturnValue([SAMPLE_PRICE_RULE]);
    vi.mocked(storageService.getBayReservationsByBranch).mockReturnValue([]);
    vi.mocked(storageService.saveBayReservation).mockReturnValue(undefined);

    const localStorageSpy = vi.spyOn(Storage.prototype, 'setItem');

    const result = await bayReservationService.createCoachBayReservation({
      branch: SAMPLE_BRANCH,
      bay: SAMPLE_BAYS[0],
      date: '2026-03-25',
      startHour: 10,
      coach: SAMPLE_COACH,
    });

    expect(result.reservation.status).toBe('CONFIRMED');
    expect(result.updatedCoach.currentPoints).toBe(400);
    expect(storageService.saveBayReservation).toHaveBeenCalled();
    expect(localStorageSpy).toHaveBeenCalledWith(
      'swingnote_coach_profile',
      expect.stringContaining('"currentPoints":400')
    );
  });
});
