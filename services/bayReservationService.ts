import {
  Branch,
  Bay,
  BayPriceRule,
  BayReservation,
  BayReservationStatus,
  ClientProfile,
  DayOfWeek,
  OpeningHourEntry,
} from '../types';
import { firebaseService } from './firebase';
import { storageService } from './storage';
import { pointService } from './pointService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return "YYYYMMDD" from a date string or Date */
function toYMD(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** Return "YYYY-MM-DD" from a date string "YYYYMMDD" or ISO */
function toDateStr(ymd: string): string {
  if (ymd.includes('-')) return ymd.slice(0, 10);
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

const DAY_OF_WEEK_KEYS: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function getDayKey(date: string): DayOfWeek {
  const d = new Date(date + 'T00:00:00');
  return DAY_OF_WEEK_KEYS[d.getDay()];
}

function getJsDayOfWeek(date: string): number {
  const d = new Date(date + 'T00:00:00');
  return d.getDay(); // 0=Sun..6=Sat
}

/** Parse "HH:mm" string to hours number */
function parseHour(time: string): number {
  return parseInt(time.split(':')[0], 10);
}

// ─── Persistence helpers ───────────────────────────────────────────────────────

async function loadBranches(): Promise<Branch[]> {
  return firebaseService.isInitialized()
    ? firebaseService.getBranches()
    : Promise.resolve(storageService.getBranches());
}

async function loadBays(branchId: string): Promise<Bay[]> {
  return firebaseService.isInitialized()
    ? firebaseService.getBays(branchId)
    : Promise.resolve(storageService.getBays(branchId));
}

async function loadPriceRules(branchId: string): Promise<BayPriceRule[]> {
  return firebaseService.isInitialized()
    ? firebaseService.getBayPriceRules(branchId)
    : Promise.resolve(storageService.getBayPriceRules(branchId));
}

async function loadReservationsByBranch(
  branchId: string,
  date: string
): Promise<BayReservation[]> {
  return firebaseService.isInitialized()
    ? firebaseService.getBayReservationsByBranch(branchId, date, date)
    : Promise.resolve(storageService.getBayReservationsByBranch(branchId, date, date));
}

async function saveReservation(reservation: BayReservation): Promise<void> {
  if (firebaseService.isInitialized()) {
    await firebaseService.saveBayReservation(reservation);
  } else {
    storageService.saveBayReservation(reservation);
  }
}

async function updateReservation(
  id: string,
  fields: Partial<BayReservation>
): Promise<void> {
  if (firebaseService.isInitialized()) {
    await firebaseService.updateBayReservation(id, fields);
  } else {
    storageService.updateBayReservation(id, fields);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface TimeSlot {
  startHour: number; // 0..23
  startTime: string; // ISO (date + HH:00:00)
  endTime: string;   // ISO (date + HH+1:00:00)
  pricePoints: number | null; // null if no price rule
}

export interface AvailableBay {
  bay: Bay;
  pricePoints: number;
}

export const bayReservationService = {
  /**
   * Load all active branches.
   */
  getActiveBranches: async (): Promise<Branch[]> => {
    const branches = await loadBranches();
    return branches.filter((b) => b.isActive);
  },

  /**
   * Compute hourly time slots for a branch on a given date,
   * filtered to branch opening hours and excluding holidays.
   * Returns slots with their price (null if no price rule defined).
   */
  getAvailableTimeSlots: async (
    branchId: string,
    date: string // "YYYY-MM-DD"
  ): Promise<TimeSlot[]> => {
    const branches = await loadBranches();
    const branch = branches.find((b) => b.id === branchId);
    if (!branch) return [];

    // Check holiday
    if (branch.holidays && branch.holidays.includes(date)) return [];

    const dayKey = getDayKey(date);
    const hours: OpeningHourEntry | undefined = branch.openingHours?.[dayKey];

    if (!hours || hours.isClosed) return [];

    const openHour = parseHour(hours.open);
    const closeHour = parseHour(hours.close);

    if (openHour >= closeHour) return [];

    const priceRules = await loadPriceRules(branchId);
    const jsDow = getJsDayOfWeek(date);

    const slots: TimeSlot[] = [];
    for (let h = openHour; h < closeHour; h++) {
      const rule = priceRules.find(
        (r) => r.isActive && r.dayOfWeek === jsDow && r.startHour === h
      );
      const startTime = `${date}T${String(h).padStart(2, '0')}:00:00`;
      const endHour = h + 1;
      const endTime = `${date}T${String(endHour).padStart(2, '0')}:00:00`;
      slots.push({
        startHour: h,
        startTime,
        endTime,
        pricePoints: rule ? rule.pricePoints : null,
      });
    }
    return slots;
  },

  /**
   * Get available bays for a slot (bays not CONFIRMED for that branchId+date+startHour).
   */
  getAvailableBays: async (
    branchId: string,
    date: string,
    startHour: number
  ): Promise<AvailableBay[]> => {
    const [bays, priceRules, existingReservations] = await Promise.all([
      loadBays(branchId),
      loadPriceRules(branchId),
      loadReservationsByBranch(branchId, date),
    ]);

    const jsDow = getJsDayOfWeek(date);
    const rule = priceRules.find(
      (r) => r.isActive && r.dayOfWeek === jsDow && r.startHour === startHour
    );
    if (!rule) return [];

    const bookedBayIds = new Set(
      existingReservations
        .filter((r) => r.status === 'CONFIRMED')
        .filter((r) => {
          const rHour = parseInt(r.startTime.slice(11, 13), 10);
          return rHour === startHour;
        })
        .map((r) => r.bayId)
    );

    return bays
      .filter((b) => b.isActive && !bookedBayIds.has(b.id))
      .map((b) => ({ bay: b, pricePoints: rule.pricePoints }));
  },

  /**
   * Create a bay reservation with point deduction.
   * Validates: opening hours, no holiday, bay active, price rule active,
   * client has enough points, no double-booking.
   */
  createReservation: async (params: {
    branch: Branch;
    bay: Bay;
    date: string; // "YYYY-MM-DD"
    startHour: number;
    client: ClientProfile;
  }): Promise<{ reservation: BayReservation; updatedClient: ClientProfile }> => {
    const { branch, bay, date, startHour, client } = params;

    // Validate holiday
    if (branch.holidays && branch.holidays.includes(date)) {
      throw new Error('선택한 날짜는 휴무일입니다.');
    }

    // Validate opening hours
    const dayKey = getDayKey(date);
    const hours = branch.openingHours?.[dayKey];
    if (!hours || hours.isClosed) {
      throw new Error('선택한 날짜는 운영하지 않습니다.');
    }
    const openHour = parseHour(hours.open);
    const closeHour = parseHour(hours.close);
    if (startHour < openHour || startHour >= closeHour) {
      throw new Error('선택한 시간은 운영 시간 외입니다.');
    }

    // Validate bay is active
    if (!bay.isActive) {
      throw new Error('선택한 타석은 현재 이용 불가입니다.');
    }

    // Validate price rule
    const priceRules = await loadPriceRules(branch.id);
    const jsDow = getJsDayOfWeek(date);
    const rule = priceRules.find(
      (r) => r.isActive && r.dayOfWeek === jsDow && r.startHour === startHour
    );
    if (!rule) {
      throw new Error('해당 시간대의 가격 정보를 찾을 수 없습니다.');
    }

    // Validate client points
    const clientPoints = client.currentPoints ?? 0;
    if (clientPoints < rule.pricePoints) {
      throw new Error(
        `포인트가 부족합니다. 필요: ${rule.pricePoints}pt, 보유: ${clientPoints}pt`
      );
    }

    // Build deterministic ID and check double-booking
    const ymd = toYMD(date);
    const hh = String(startHour).padStart(2, '0');
    const reservationId = `${branch.id}_${bay.id}_${ymd}_${hh}`;

    const existing = await loadReservationsByBranch(branch.id, date);
    const conflict = existing.find(
      (r) => r.id === reservationId && r.status === 'CONFIRMED'
    );
    if (conflict) {
      throw new Error('이미 예약된 타석입니다. 다른 타석을 선택해주세요.');
    }

    const startTime = `${date}T${hh}:00:00`;
    const endHour = startHour + 1;
    const endTime = `${date}T${String(endHour).padStart(2, '0')}:00:00`;
    const clientId = `${client.name}_${client.phone}`;

    // Save reservation first to prevent double-booking, then deduct points.
    // If point deduction fails, we rollback the reservation to CANCELLED.
    const reservation: BayReservation = {
      id: reservationId,
      branchId: branch.id,
      bayId: bay.id,
      startTime,
      endTime,
      clientId,
      clientName: client.name,
      clientPhone: client.phone,
      paidPoints: rule.pricePoints,
      status: 'CONFIRMED',
      createdAt: Date.now(),
    };

    await saveReservation(reservation);

    let updatedClient: ClientProfile;
    try {
      updatedClient = await pointService.addTransaction(
        client,
        -rule.pricePoints,
        'PURCHASE',
        `타석 예약 - ${branch.name} ${bay.floor}층 ${bay.roomNumber}번 (${date} ${hh}:00)`
      );
    } catch (pointError) {
      // Rollback reservation on payment failure
      await updateReservation(reservationId, { status: 'CANCELLED' as BayReservationStatus });
      throw new Error('포인트 차감에 실패했습니다. 예약이 취소되었습니다.');
    }

    return { reservation, updatedClient };
  },

  /**
   * Load reservations for a client.
   */
  getClientReservations: async (clientId: string): Promise<BayReservation[]> => {
    if (firebaseService.isInitialized()) {
      return firebaseService.getBayReservationsByClient(clientId);
    }
    return Promise.resolve(storageService.getBayReservationsByClient(clientId));
  },

  /**
   * Request cancellation by client (status → CANCEL_REQUESTED).
   * Does NOT refund points (that is handled in PR#6 by branch admin).
   */
  requestCancellation: async (
    reservationId: string,
    clientId: string
  ): Promise<void> => {
    // Load reservation to verify ownership
    const reservations = await (firebaseService.isInitialized()
      ? firebaseService.getBayReservationsByClient(clientId)
      : Promise.resolve(storageService.getBayReservationsByClient(clientId)));

    const reservation = reservations.find((r) => r.id === reservationId);
    if (!reservation) {
      throw new Error('예약을 찾을 수 없습니다.');
    }
    if (reservation.clientId !== clientId) {
      throw new Error('본인의 예약만 취소 요청할 수 있습니다.');
    }
    if (reservation.status !== 'CONFIRMED') {
      throw new Error('확정된 예약만 취소 요청할 수 있습니다.');
    }

    await updateReservation(reservationId, {
      status: 'CANCEL_REQUESTED' as BayReservationStatus,
      cancelRequestedAt: Date.now(),
    });
  },
};
