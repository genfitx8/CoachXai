import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bayReservationService } from '../services/bayReservationService';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { BayReservation, Bay } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/firebase', () => ({
  firebaseService: {
    isInitialized: vi.fn(),
    getBayReservationsByBranch: vi.fn(),
    getBays: vi.fn(),
    updateBayReservation: vi.fn(),
  },
}));

vi.mock('../services/storage', () => ({
  storageService: {
    getBayReservationsByBranch: vi.fn(),
    getBays: vi.fn(),
  },
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
