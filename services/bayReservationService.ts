import {
  Branch,
  Bay,
  BayPriceRule,
  BayReservation,
  BayReservationStatus,
  ClientProfile,
  CoachProfile,
  DayOfWeek,
  OpeningHourEntry,
} from '../types';
import { branchService } from './branchService';
import { pointService } from './pointService';
import { sendBayReservationNotifications } from './reservationPushNotificationService';
import { createLogger } from '../utils/logger';

const log = createLogger('bayReservation');

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
// All storage goes through branchService (api → firebase → localStorage,
// docs/DATA_ARCHITECTURE.md Phase 1); the booking/validation logic here is
// backend-agnostic.

async function loadBranches(): Promise<Branch[]> {
  return branchService.getBranches();
}

async function loadBays(branchId: string): Promise<Bay[]> {
  return branchService.getBays(branchId);
}

async function loadPriceRules(branchId: string): Promise<BayPriceRule[]> {
  return branchService.getBayPriceRules(branchId);
}

async function loadReservationsByBranch(
  branchId: string,
  date: string
): Promise<BayReservation[]> {
  return branchService.getBayReservationsByBranch(branchId, date, date);
}

async function saveReservation(reservation: BayReservation): Promise<void> {
  await branchService.saveBayReservation(reservation);
}

async function updateReservation(
  id: string,
  fields: Partial<BayReservation>
): Promise<void> {
  await branchService.updateBayReservation(id, fields);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface TimeSlot {
  startHour: number; // 0..23
  startTime: string; // ISO (date + HH:00:00)
  endTime: string;   // ISO (date + HH+1:00:00)
  pricePoints: number | null; // null if no price rule
}

/**
 * True when an active reservation at `bayId` overlaps the half-open range
 * [reqStartHour, reqEndHour). CONFIRMED and CANCEL_REQUESTED both count as
 * blocking — a cancel-requested slot has not yet been approved and must not
 * be re-booked, and its deterministic-id record must not be silently
 * overwritten by a new save.
 */
function findBayTimeConflict(
  reservations: BayReservation[],
  bayId: string,
  reqStartHour: number,
  reqEndHour: number
): BayReservation | undefined {
  return reservations.find((r) => {
    if (r.bayId !== bayId) return false;
    if (r.status !== 'CONFIRMED' && r.status !== 'CANCEL_REQUESTED') return false;
    const rStartHour = parseInt(r.startTime.slice(11, 13), 10);
    let rEndHour = parseInt(r.endTime.slice(11, 13), 10);
    const rEndMin = parseInt(r.endTime.slice(14, 16), 10) || 0;
    if (rEndMin > 0) rEndHour += 1;
    if (rEndHour <= rStartHour) rEndHour = rStartHour + 1;
    return rStartHour < reqEndHour && reqStartHour < rEndHour;
  });
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

    // A bay counts as booked when a CONFIRMED (or pending-cancellation) reservation
    // overlaps the requested [startHour, startHour+1) slot. Multi-hour lesson bay
    // blocks (e.g. 10:00–12:00 stored as one record at hour 10) must also cover 11.
    const slotEndHour = startHour + 1;
    const bookedBayIds = new Set(
      existingReservations
        .filter(
          (r) => r.status === 'CONFIRMED' || r.status === 'CANCEL_REQUESTED'
        )
        .filter((r) => {
          const rStartHour = parseInt(r.startTime.slice(11, 13), 10);
          let rEndHour = parseInt(r.endTime.slice(11, 13), 10);
          const rEndMin = parseInt(r.endTime.slice(14, 16), 10) || 0;
          if (rEndMin > 0) rEndHour += 1;
          if (rEndHour <= rStartHour) rEndHour = rStartHour + 1;
          return rStartHour < slotEndHour && startHour < rEndHour;
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
    const conflict = findBayTimeConflict(existing, bay.id, startHour, startHour + 1);
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

    // Fire-and-forget: send push notifications after successful reservation + payment.
    // Errors are logged but must not fail the reservation itself.
    sendBayReservationNotifications(reservation, branch.name).catch((e) =>
      log.error('[BayReservationService] Unexpected notification error:', e)
    );

    return { reservation, updatedClient };
  },

  /**
   * Load reservations for a client.
   */
  getClientReservations: async (clientId: string): Promise<BayReservation[]> => {
    return branchService.getBayReservationsByClient(clientId);
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
    const reservations = await branchService.getBayReservationsByClient(clientId);

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

  /**
   * Load all reservations for a branch, optionally filtered by date range.
   * Used by branch admin to view reservation status.
   */
  getBranchReservations: async (
    branchId: string,
    dateFrom?: string, // "YYYY-MM-DD"
    dateTo?: string    // "YYYY-MM-DD"
  ): Promise<BayReservation[]> => {
    return branchService.getBayReservationsByBranch(branchId, dateFrom, dateTo);
  },

  /**
   * Load all bays for a branch (for mapping bayId → display label).
   * Used by branch admin reservation status view.
   */
  getBranchBays: async (branchId: string): Promise<Bay[]> => {
    return loadBays(branchId);
  },

  /**
   * Create bay blocking for an admin-confirmed lesson reservation (no point deduction).
   */
  createAdminLessonBayReservation: async (params: {
    branchId: string;
    bayId: string;
    startTime: string;
    endTime: string;
    clientId: string;
    clientName: string;
    clientPhone: string;
    lessonReservationId: string;
  }): Promise<BayReservation> => {
    const {
      branchId,
      bayId,
      startTime,
      endTime,
      clientId,
      clientName,
      clientPhone,
      lessonReservationId,
    } = params;
    const startDate = startTime.slice(0, 10);
    const startHour = parseInt(startTime.slice(11, 13), 10);
    let endHour = parseInt(endTime.slice(11, 13), 10);
    const endMin = parseInt(endTime.slice(14, 16), 10) || 0;
    if (endMin > 0) endHour += 1;
    if (endHour <= startHour) endHour = startHour + 1;
    const reservationId = `${branchId}_${bayId}_${toYMD(startDate)}_${String(startHour).padStart(2, '0')}`;

    const existing = await loadReservationsByBranch(branchId, startDate);
    const conflict = findBayTimeConflict(existing, bayId, startHour, endHour);
    if (conflict) {
      throw new Error('선택한 타석은 이미 예약되어 있습니다.');
    }

    const reservation: BayReservation = {
      id: reservationId,
      branchId,
      bayId,
      lessonReservationId,
      startTime,
      endTime,
      clientId,
      clientName,
      clientPhone,
      paidPoints: 0,
      status: 'CONFIRMED',
      createdAt: Date.now(),
    };

    await saveReservation(reservation);
    return reservation;
  },

  /**
   * Approve a cancellation request by branch admin (status → CANCELLED).
   * Intended to be paired with point refund in a future step.
   */
  approveCancellation: async (reservationId: string): Promise<void> => {
    await updateReservation(reservationId, {
      status: 'CANCELLED' as BayReservationStatus,
    });
  },

  /**
   * Reject a cancellation request by branch admin (status → CONFIRMED).
   */
  rejectCancellation: async (reservationId: string): Promise<void> => {
    await updateReservation(reservationId, {
      status: 'CONFIRMED' as BayReservationStatus,
    });
  },

  /**
   * Create a bay reservation for a coach member.
   * Identical validation rules as createReservation, but uses coach.id as
   * clientId and deducts points from the coach's balance.
   */
  createCoachBayReservation: async (params: {
    branch: Branch;
    bay: Bay;
    date: string; // "YYYY-MM-DD"
    startHour: number;
    coach: CoachProfile;
  }): Promise<{ reservation: BayReservation; updatedCoach: CoachProfile }> => {
    const { branch, bay, date, startHour, coach } = params;

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

    // Validate coach points
    const coachPoints = coach.currentPoints ?? 0;
    if (coachPoints < rule.pricePoints) {
      throw new Error(
        `포인트가 부족합니다. 필요: ${rule.pricePoints}pt, 보유: ${coachPoints}pt`
      );
    }

    // Build deterministic ID and check double-booking
    const ymd = toYMD(date);
    const hh = String(startHour).padStart(2, '0');
    const reservationId = `${branch.id}_${bay.id}_${ymd}_${hh}`;

    const existing = await loadReservationsByBranch(branch.id, date);
    const conflict = findBayTimeConflict(existing, bay.id, startHour, startHour + 1);
    if (conflict) {
      throw new Error('이미 예약된 타석입니다. 다른 타석을 선택해주세요.');
    }

    const startTime = `${date}T${hh}:00:00`;
    const endHour = startHour + 1;
    const endTime = `${date}T${String(endHour).padStart(2, '0')}:00:00`;

    // Save reservation first to prevent double-booking, then deduct points.
    // If point deduction fails, rollback the reservation to CANCELLED.
    const reservation: BayReservation = {
      id: reservationId,
      branchId: branch.id,
      bayId: bay.id,
      startTime,
      endTime,
      clientId: coach.id,
      clientName: coach.name,
      clientPhone: coach.phone ?? '',
      paidPoints: rule.pricePoints,
      status: 'CONFIRMED',
      createdAt: Date.now(),
    };

    await saveReservation(reservation);

    let updatedCoach: CoachProfile;
    try {
      updatedCoach = await pointService.spendCoachPoints(
        coach,
        -rule.pricePoints,
        `타석 예약 - ${branch.name} ${bay.floor}층 ${bay.roomNumber}번 (${date} ${hh}:00)`
      );
    } catch (pointError) {
      // Rollback reservation on payment failure
      await updateReservation(reservationId, { status: 'CANCELLED' as BayReservationStatus });
      throw new Error('포인트 차감에 실패했습니다. 예약이 취소되었습니다.');
    }

    // Fire-and-forget: send push notifications after successful reservation + payment.
    sendBayReservationNotifications(reservation, branch.name).catch((e) =>
      log.error('[BayReservationService] Unexpected notification error:', e)
    );

    return { reservation, updatedCoach };
  },
};
