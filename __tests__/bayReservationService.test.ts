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
    saveCoach: vi.fn(),
    updateBayReservation: vi.fn(),
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
  holidays: [],
  isActive: true,
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

// 2026-03-25 is a Wednesday (dayOfWeek=3)
const SAMPLE_PRICE_RULE: BayPriceRule = {
  id: 'rule1',
  branchId: 'branch1',
  dayOfWeek: 3,
  startHour: 10,
  pricePoints: 50,
  isActive: true,
  createdAt: 1000,
};

const SAMPLE_COACH: CoachProfile = {
  id: 'coach1',
  name: '코치김',
  email: 'coach@test.com',
  phone: '010-1234-5678',
  currentPoints: 200,
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
    vi.mocked(firebaseService.getBayPriceRules).mockResolvedValue([SAMPLE_PRICE_RULE]);
    vi.mocked(firebaseService.getBayReservationsByBranch).mockResolvedValue([]);
    vi.mocked(firebaseService.saveBayReservation).mockResolvedValue();
    vi.mocked(firebaseService.saveCoach).mockResolvedValue();
  });

  it('creates a reservation using coach.id as clientId', async () => {
    const { reservation, updatedCoach } = await bayReservationService.createCoachBayReservation({
      branch: SAMPLE_BRANCH,
      bay: SAMPLE_BAYS[0],
      date: '2026-03-25',
      startHour: 10,
      coach: SAMPLE_COACH,
    });

    expect(reservation.clientId).toBe('coach1');
    expect(reservation.clientName).toBe('코치김');
    expect(reservation.branchId).toBe('branch1');
    expect(reservation.bayId).toBe('bay1');
    expect(reservation.status).toBe('CONFIRMED');
    expect(reservation.paidPoints).toBe(50);
    expect(updatedCoach.currentPoints).toBe(150); // 200 - 50
  });

  it('uses deterministic reservation ID', async () => {
    const { reservation } = await bayReservationService.createCoachBayReservation({
      branch: SAMPLE_BRANCH,
      bay: SAMPLE_BAYS[0],
      date: '2026-03-25',
      startHour: 10,
      coach: SAMPLE_COACH,
    });

    expect(reservation.id).toBe('branch1_bay1_20260325_10');
  });

  it('throws when coach has insufficient points', async () => {
    const poorCoach: CoachProfile = { ...SAMPLE_COACH, currentPoints: 10 };

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

  it('throws when the slot is already booked', async () => {
    const existingReservation: BayReservation = {
      id: 'branch1_bay1_20260325_10',
      branchId: 'branch1',
      bayId: 'bay1',
      startTime: '2026-03-25T10:00:00',
      endTime: '2026-03-25T11:00:00',
      clientId: 'other_client',
      clientName: 'other',
      clientPhone: '010',
      paidPoints: 50,
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

  it('throws on holiday date', async () => {
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

  it('uses storageService when firebase is not initialized', async () => {
    vi.mocked(firebaseService.isInitialized).mockReturnValue(false);
    vi.mocked(storageService.getBranches).mockReturnValue([SAMPLE_BRANCH]);
    vi.mocked(storageService.getBayPriceRules).mockReturnValue([SAMPLE_PRICE_RULE]);
    vi.mocked(storageService.getBayReservationsByBranch).mockReturnValue([]);
    vi.mocked(storageService.saveBayReservation).mockImplementation(() => {});
    vi.mocked(storageService.saveCoach).mockImplementation(() => {});

    const { reservation } = await bayReservationService.createCoachBayReservation({
      branch: SAMPLE_BRANCH,
      bay: SAMPLE_BAYS[0],
      date: '2026-03-25',
      startHour: 10,
      coach: SAMPLE_COACH,
    });

    expect(storageService.saveBayReservation).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'coach1' })
    );
    expect(storageService.saveCoach).toHaveBeenCalled();
    expect(reservation.clientId).toBe('coach1');
  });
});
