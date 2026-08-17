import { LessonReservation, ReservationStatus, DayOfWeek, CoachProfile } from '../types';
import { firebaseService } from './firebase';
import { storageService } from './storage';
import { apiService } from './apiService';
import {
  sendLessonReservationNotifications,
  sendLessonReservationStatusNotifications,
} from './reservationPushNotificationService';
import { createReservationRequestNotification } from './coachNotificationService';
import { bayReservationService } from './bayReservationService';
import {
  scheduleLessonReminders,
  cancelLessonReminders,
} from './notificationPreferenceService';
import { createLogger } from '../utils/logger';

/**
 * Keep the server-side scheduled push reminders aligned with each
 * reservation write. CONFIRMED (or COACH_APPROVED) with a future startTime
 * → (re)schedules the reminder pair; terminal states → cancels.
 */
async function syncPushRemindersForReservation(r: LessonReservation): Promise<void> {
  if (!r.id) return;
  const CANCEL_STATES: ReservationStatus[] = [
    'CANCELLED',
    'REJECTED',
    'COMPLETED',
    'BLOCKED',
    'AVAILABLE',
  ];
  if (CANCEL_STATES.includes(r.status)) {
    await cancelLessonReminders(r.id);
    return;
  }
  if (r.status !== 'CONFIRMED' && r.status !== 'COACH_APPROVED') return;
  if (!r.startTime || !r.coachId || !r.clientId) return;
  const startAt = new Date(r.startTime).getTime();
  if (!Number.isFinite(startAt) || startAt <= Date.now()) return;
  await scheduleLessonReminders({
    reservationId: r.id,
    lessonStartAt: startAt,
    coachId: r.coachId,
    clientId: r.clientId,
    coachName: r.coachName,
    clientName: r.clientName,
  });
}

const log = createLogger('reservation');

// Constants
const MAX_DATE = '2099-12-31'; // Maximum date for filtering reservations
const OCCUPIED_SLOT_STATUSES: ReservationStatus[] = [
  'PENDING',
  'REQUESTED',
  'COACH_APPROVED',
  'ADMIN_BLOCK_PENDING',
  'CONFIRMED',
  'CHANGE_REQUESTED',
  'CANCEL_REQUESTED',
  'COMPLETED',
];

/** Prefix used for synthesised (virtual) working-hour slot IDs. Not persisted. */
export const VIRTUAL_SLOT_ID_PREFIX = 'virtual_';

const RESERVATION_SYNC_FLAG = 'swingnote_reservations_synced_v1';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ReservationService {
  /**
   * Backend selection (docs/DATA_ARCHITECTURE.md Phase 1): the server API is
   * the source of truth whenever a server session exists; Firebase and
   * localStorage remain as legacy fallbacks. The reservation state machine
   * itself stays in this service — only the storage layer switches.
   */
  private isApiMode(): boolean {
    return apiService.isAvailable() && !!apiService.getToken();
  }

  private isFirebaseMode(): boolean {
    return firebaseService.isInitialized();
  }

  /**
   * One-time promotion of reservations this device accumulated while it was
   * localStorage-only. Runs before the first server read of a login session;
   * upserts are id-keyed so re-running is harmless. Rows the current account
   * isn't allowed to write (another user's data on a shared device) are
   * skipped — they sync when their owner logs in.
   */
  private localSyncPromise: Promise<void> | null = null;

  private syncLocalReservationsOnce(): Promise<void> {
    if (!this.localSyncPromise) {
      this.localSyncPromise = this.uploadLocalReservations().catch((e) => {
        log.warn('Local reservation sync failed; will retry on next read:', e);
        this.localSyncPromise = null;
      });
    }
    return this.localSyncPromise;
  }

  private async uploadLocalReservations(): Promise<void> {
    const token = apiService.getToken() ?? '';
    try {
      // Re-sync per login (flag stores the token) so every account that uses
      // this device gets its own rows promoted.
      if (localStorage.getItem(RESERVATION_SYNC_FLAG) === token) return;
    } catch {
      return;
    }
    const locals = storageService
      .getReservations()
      .filter((r) => r.id && UUID_PATTERN.test(r.id));
    let transientFailure = false;
    for (const r of locals) {
      try {
        await apiService.upsertReservation(r);
      } catch (e) {
        const status = (e as { status?: number }).status;
        // 4xx = not ours / invalid → skip forever. 0/5xx = transient → retry
        // the whole sync on a later read instead of marking it done.
        if (status === undefined || status === 0 || status >= 500) transientFailure = true;
        log.warn(`Skipping local reservation ${r.id} during sync:`, e);
      }
    }
    if (transientFailure) throw new Error('transient reservation sync failure');
    try {
      localStorage.setItem(RESERVATION_SYNC_FLAG, token);
    } catch { /* ignore */ }
  }

  private async listReservations(filter?: {
    coachId?: string;
    clientId?: string;
  }): Promise<LessonReservation[]> {
    const coachId = filter?.coachId;
    const clientId = filter?.clientId;
    let reservations: LessonReservation[];
    if (this.isApiMode()) {
      await this.syncLocalReservationsOnce();
      reservations = await apiService.getReservations(coachId);
    } else if (this.isFirebaseMode()) {
      reservations = await firebaseService.getReservations(coachId, clientId);
    } else {
      reservations = storageService.getReservations();
    }
    if (coachId) reservations = reservations.filter((r) => r.coachId === coachId);
    if (clientId) reservations = reservations.filter((r) => r.clientId === clientId);
    return reservations;
  }

  private async loadReservationById(reservationId: string): Promise<LessonReservation | undefined> {
    if (this.isApiMode()) {
      await this.syncLocalReservationsOnce();
      return (await apiService.getReservation(reservationId)) ?? undefined;
    }
    if (this.isFirebaseMode()) {
      const allReservations = await firebaseService.getReservations();
      return allReservations.find((r) => r.id === reservationId);
    }
    const allReservations = storageService.getReservations();
    return allReservations.find((r) => r.id === reservationId);
  }

  /** Create a brand-new reservation row in the active backend. */
  private async saveNewReservation(reservation: LessonReservation): Promise<void> {
    if (this.isApiMode()) {
      await apiService.upsertReservation(reservation);
      return;
    }
    if (this.isFirebaseMode()) {
      await firebaseService.saveReservation(reservation);
      return;
    }
    storageService.saveReservation(reservation);
  }

  /** Write an updated reservation without touching push reminders. */
  private async writeReservation(reservation: LessonReservation): Promise<void> {
    if (this.isApiMode()) {
      await apiService.upsertReservation(reservation);
      return;
    }
    if (this.isFirebaseMode()) {
      await firebaseService.updateReservation(reservation);
      return;
    }
    storageService.updateReservation(reservation);
  }

  private async removeReservation(reservationId: string): Promise<void> {
    if (this.isApiMode()) {
      await apiService.deleteReservation(reservationId);
      return;
    }
    if (this.isFirebaseMode()) {
      await firebaseService.deleteReservation(reservationId);
      return;
    }
    storageService.deleteReservation(reservationId);
  }

  private async getCoachProfile(coachId: string): Promise<CoachProfile | null> {
    if (this.isApiMode()) return apiService.getCoachById(coachId);
    if (this.isFirebaseMode()) return firebaseService.getCoachById(coachId);
    return storageService.getCoachById(coachId);
  }

  private async persistReservation(reservation: LessonReservation): Promise<void> {
    await this.writeReservation(reservation);
    // Fire-and-forget: keep server-side reminder schedule in sync with the
    // reservation's terminal state. Failures are swallowed so a push-service
    // outage never blocks a reservation write.
    void syncPushRemindersForReservation(reservation).catch(() => { /* non-fatal */ });
  }

  /**
   * 코치가 예약 가능한 시간대 생성
   */
  async createAvailableSlot(
    coachId: string,
    coachName: string,
    startTime: string,
    endTime: string,
    lessonType?: string
  ): Promise<LessonReservation> {
    const reservation: LessonReservation = {
      id: crypto.randomUUID(),
      coachId,
      coachName,
      startTime,
      endTime,
      status: 'AVAILABLE',
      lessonType,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.saveNewReservation(reservation);

    return reservation;
  }

  /**
   * 코치가 1시간 단위 예약 가능 슬롯 생성 (중복 방지)
   */
  async createHourSlot(
    coachId: string,
    coachName: string,
    date: string,      // YYYY-MM-DD
    hour: number,      // 0-23
    lessonType?: string
  ): Promise<LessonReservation> {
    const pad = (n: number) => String(n).padStart(2, '0');
    const startTime = `${date}T${pad(hour)}:00:00`;
    const endTime   = `${date}T${pad(hour + 1)}:00:00`;

    // Duplicate check: same coach, overlapping non-cancelled slot
    const existing = await this.listReservations({ coachId });
    const overlap = existing.find(
      (r) =>
        r.coachId === coachId &&
        r.status !== 'CANCELLED' &&
        r.status !== 'REJECTED' &&
        r.startTime === startTime &&
        r.endTime === endTime
    );
    if (overlap) {
      throw new Error('해당 시간대에 이미 슬롯이 존재합니다.');
    }

    return this.createAvailableSlot(coachId, coachName, startTime, endTime, lessonType);
  }

  /**
   * 코치가 예약 불가능한 시간대 블럭 생성
   */
  async createBlockedSlot(
    coachId: string,
    coachName: string,
    startTime: string,
    endTime: string,
    blockReason?: string
  ): Promise<LessonReservation> {
    const reservation: LessonReservation = {
      id: crypto.randomUUID(),
      coachId,
      coachName,
      startTime,
      endTime,
      status: 'BLOCKED',
      blockReason,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.saveNewReservation(reservation);

    return reservation;
  }

  /**
   * 회원이 예약 요청
   */
  async requestReservation(
    reservationId: string,
    clientId: string,
    clientName: string,
    clientPhone: string,
    notes?: string
  ): Promise<LessonReservation> {
    const reservation = await this.loadReservationById(reservationId);

    if (!reservation) {
      throw new Error('예약을 찾을 수 없습니다.');
    }

    if (reservation.status !== 'AVAILABLE') {
      throw new Error('이미 예약된 시간대입니다.');
    }

    const updatedReservation: LessonReservation = {
      ...reservation,
      clientId,
      clientName,
      clientPhone,
      notes,
      status: 'REQUESTED',
      requestedAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.persistReservation(updatedReservation);

    // Fire-and-forget: send push notifications after successful persistence.
    // Errors are caught inside the service and must not fail the reservation.
    sendLessonReservationNotifications(updatedReservation).catch((e) =>
      log.error('[ReservationService] Unexpected notification error:', e)
    );

    // Create in-app notification for the coach (fire-and-forget).
    createReservationRequestNotification(updatedReservation).catch((e) =>
      log.error('[ReservationService] Unexpected in-app notification error:', e)
    );

    return updatedReservation;
  }

  /**
   * 회원이 직접 시간을 입력하여 예약 요청 (새로운 방식)
   */
  async requestReservationWithTime(
    coachId: string,
    coachName: string,
    clientId: string,
    clientName: string,
    clientPhone: string,
    startTime: string,
    endTime: string,
    notes?: string
  ): Promise<LessonReservation> {
    // 모든 예약 조회
    const allReservations = await this.listReservations({ coachId });

    const requestStart = new Date(startTime);
    const requestEnd = new Date(endTime);

    // 시간 겹침 검증 헬퍼 함수
    const hasTimeOverlap = (start1: Date, end1: Date, start2: Date, end2: Date): boolean => {
      return start1 < end2 && end1 > start2;
    };

    // BLOCKED 시간대와 겹치는지 확인
    const blockedConflict = allReservations.find((r) => {
      if (r.status !== 'BLOCKED') return false;
      const existingStart = new Date(r.startTime);
      const existingEnd = new Date(r.endTime);
      return hasTimeOverlap(requestStart, requestEnd, existingStart, existingEnd);
    });

    if (blockedConflict) {
      throw new Error(`선택하신 시간은 예약이 불가능합니다. (사유: ${blockedConflict.blockReason || '블럭된 시간'})`);
    }

    // 다른 예약(활성 예약 상태)과 겹치는지 확인
    const reservationConflict = allReservations.find((r) => {
      if (!OCCUPIED_SLOT_STATUSES.includes(r.status)) return false;
      const existingStart = new Date(r.startTime);
      const existingEnd = new Date(r.endTime);
      return hasTimeOverlap(requestStart, requestEnd, existingStart, existingEnd);
    });

    if (reservationConflict) {
      throw new Error('선택하신 시간은 이미 다른 예약이 있습니다.');
    }

    // 새 예약 생성
    const reservation: LessonReservation = {
      id: crypto.randomUUID(),
      coachId,
      coachName,
      clientId,
      clientName,
      clientPhone,
      startTime,
      endTime,
      status: 'REQUESTED',
      notes,
      requestedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.saveNewReservation(reservation);

    // Fire-and-forget: send push notifications after successful persistence.
    sendLessonReservationNotifications(reservation).catch((e) =>
      log.error('[ReservationService] Unexpected notification error:', e)
    );

    // Create in-app notification for the coach (fire-and-forget).
    createReservationRequestNotification(reservation).catch((e) =>
      log.error('[ReservationService] Unexpected in-app notification error:', e)
    );

    return reservation;
  }

  /**
   * 코치가 예약 승인
   */
  async approveReservation(reservationId: string): Promise<LessonReservation> {
    const reservation = await this.loadReservationById(reservationId);

    if (!reservation) {
      throw new Error('예약을 찾을 수 없습니다.');
    }

    if (
      reservation.status !== 'PENDING' &&
      reservation.status !== 'REQUESTED' &&
      reservation.status !== 'CHANGE_REQUESTED'
    ) {
      throw new Error('요청된 예약만 승인할 수 있습니다.');
    }

    const updatedReservation: LessonReservation = {
      ...reservation,
      status: 'ADMIN_BLOCK_PENDING',
      coachApprovedAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.persistReservation(updatedReservation);

    sendLessonReservationStatusNotifications(
      updatedReservation,
      'COACH_APPROVED_ADMIN_PENDING'
    ).catch((e) => log.error('[ReservationService] Unexpected notification error:', e));

    return updatedReservation;
  }

  /**
   * 코치가 예약 거부
   */
  async rejectReservation(reservationId: string, reason?: string): Promise<LessonReservation> {
    const reservation = await this.loadReservationById(reservationId);

    if (!reservation) {
      throw new Error('예약을 찾을 수 없습니다.');
    }

    if (
      reservation.status !== 'PENDING' &&
      reservation.status !== 'REQUESTED' &&
      reservation.status !== 'CHANGE_REQUESTED'
    ) {
      throw new Error('요청된 예약만 거부할 수 있습니다.');
    }

    const updatedReservation: LessonReservation = {
      ...reservation,
      status: 'REJECTED',
      rejectedAt: Date.now(),
      rejectionReason: reason,
      updatedAt: Date.now(),
    };
    await this.persistReservation(updatedReservation);

    sendLessonReservationStatusNotifications(updatedReservation, 'REJECTED').catch((e) =>
      log.error('[ReservationService] Unexpected notification error:', e)
    );

    return updatedReservation;
  }

  /**
   * 예약 취소
   */
  async cancelReservation(reservationId: string): Promise<void> {
    const reservation = await this.loadReservationById(reservationId);
    if (!reservation) return;

    if (reservation.status === 'AVAILABLE' || reservation.status === 'BLOCKED') {
      await this.removeReservation(reservationId);
      return;
    }

    const updatedReservation: LessonReservation = {
      ...reservation,
      status: 'CANCELLED',
      updatedAt: Date.now(),
    };
    await this.persistReservation(updatedReservation);
    sendLessonReservationStatusNotifications(updatedReservation, 'CANCELLED').catch((e) =>
      log.error('[ReservationService] Unexpected notification error:', e)
    );
  }

  async requestCancellationByMember(
    reservationId: string,
    clientId: string,
    notes?: string
  ): Promise<LessonReservation> {
    const reservation = await this.loadReservationById(reservationId);
    if (!reservation) throw new Error('예약을 찾을 수 없습니다.');
    if (reservation.clientId !== clientId) {
      throw new Error('본인의 예약만 취소 요청할 수 있습니다.');
    }
    if (
      reservation.status !== 'REQUESTED' &&
      reservation.status !== 'ADMIN_BLOCK_PENDING' &&
      reservation.status !== 'CONFIRMED' &&
      reservation.status !== 'PENDING'
    ) {
      throw new Error('현재 상태에서는 취소 요청할 수 없습니다.');
    }

    const updatedReservation: LessonReservation = {
      ...reservation,
      status: 'CANCEL_REQUESTED',
      cancellationRequestedAt: Date.now(),
      notes: notes ?? reservation.notes,
      updatedAt: Date.now(),
    };
    await this.persistReservation(updatedReservation);
    sendLessonReservationStatusNotifications(updatedReservation, 'CANCEL_REQUESTED').catch((e) =>
      log.error('[ReservationService] Unexpected notification error:', e)
    );
    return updatedReservation;
  }

  async requestChangeByMember(
    reservationId: string,
    clientId: string,
    requestedChangeNote?: string
  ): Promise<LessonReservation> {
    const reservation = await this.loadReservationById(reservationId);
    if (!reservation) throw new Error('예약을 찾을 수 없습니다.');
    if (reservation.clientId !== clientId) {
      throw new Error('본인의 예약만 변경 요청할 수 있습니다.');
    }
    if (
      reservation.status !== 'REQUESTED' &&
      reservation.status !== 'ADMIN_BLOCK_PENDING' &&
      reservation.status !== 'CONFIRMED' &&
      reservation.status !== 'PENDING'
    ) {
      throw new Error('현재 상태에서는 변경 요청할 수 없습니다.');
    }

    const updatedReservation: LessonReservation = {
      ...reservation,
      status: 'CHANGE_REQUESTED',
      changeRequestedAt: Date.now(),
      requestedChangeNote,
      updatedAt: Date.now(),
    };
    await this.persistReservation(updatedReservation);
    sendLessonReservationStatusNotifications(updatedReservation, 'CHANGE_REQUESTED').catch((e) =>
      log.error('[ReservationService] Unexpected notification error:', e)
    );
    return updatedReservation;
  }

  /**
   * 코치의 모든 예약 조회 (시작 시간 오름차순 - 다가오는 예약부터)
   */
  async getCoachReservations(
    coachId: string,
    startDate?: string,
    endDate?: string
  ): Promise<LessonReservation[]> {
    // If coachId is provided and not empty, filter by it; otherwise return all
    let reservations = await this.listReservations(coachId ? { coachId } : undefined);

    // Filter by date range if provided
    if (startDate || endDate) {
      reservations = reservations.filter((r) => {
        const reservationDate = new Date(r.startTime);
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date(MAX_DATE);
        return reservationDate >= start && reservationDate <= end;
      });
    }

    return reservations.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  /**
   * 모든 예약 조회 (캘린더용)
   */
  async getAllReservations(
    startDate?: string,
    endDate?: string
  ): Promise<LessonReservation[]> {
    let reservations: LessonReservation[];

    try {
      reservations = await this.listReservations();
    } catch (error) {
      log.warn('Backend fetch failed, falling back to localStorage:', error);
      reservations = storageService.getReservations();
    }

    // Filter by date range if provided
    if (startDate || endDate) {
      reservations = reservations.filter((r) => {
        const reservationDate = new Date(r.startTime);
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date(MAX_DATE);
        return reservationDate >= start && reservationDate <= end;
      });
    }

    return reservations.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  /**
   * 회원의 모든 예약 조회 (시작 시간 내림차순 - 최근 예약부터)
   */
  async getClientReservations(clientId: string): Promise<LessonReservation[]> {
    const reservations = await this.listReservations({ clientId });

    return reservations.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }

  async getAdminPendingReservations(branchId?: string): Promise<LessonReservation[]> {
    const reservations = await this.listReservations();

    const filtered = reservations.filter((r) => {
      if (r.status !== 'ADMIN_BLOCK_PENDING') return false;
      if (!branchId) return true;
      return !r.branchId || r.branchId === branchId;
    });

    return filtered.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  async confirmReservationByAdmin(params: {
    reservationId: string;
    branchId: string;
    bayId: string;
    adminUsername?: string;
  }): Promise<LessonReservation> {
    const { reservationId, branchId, bayId, adminUsername } = params;
    const reservation = await this.loadReservationById(reservationId);
    if (!reservation) throw new Error('예약을 찾을 수 없습니다.');
    if (reservation.status !== 'ADMIN_BLOCK_PENDING') {
      throw new Error('관리자 확정 대기 상태의 예약만 확정할 수 있습니다.');
    }
    const clientId =
      reservation.clientId ||
      (reservation.clientName && reservation.clientPhone
        ? `${reservation.clientName}_${reservation.clientPhone}`
        : undefined);
    if (!clientId) {
      throw new Error('회원 식별 정보가 없어 레슨 예약을 확정할 수 없습니다.');
    }

    const bayReservation = await bayReservationService.createAdminLessonBayReservation({
      branchId,
      bayId,
      startTime: reservation.startTime,
      endTime: reservation.endTime,
      clientId,
      clientName: reservation.clientName || '회원',
      clientPhone: reservation.clientPhone || '',
      lessonReservationId: reservation.id,
    });
    const bays = await bayReservationService.getBranchBays(branchId);
    const bay = bays.find((b) => b.id === bayId);
    const bayLabel = bay ? `${bay.floor}층 ${bay.roomNumber}번` : bayId;

    const updatedReservation: LessonReservation = {
      ...reservation,
      status: 'CONFIRMED',
      branchId,
      bayId,
      bayLabel,
      bayReservationId: bayReservation.id,
      adminConfirmedAt: Date.now(),
      adminConfirmedBy: adminUsername,
      updatedAt: Date.now(),
    };
    await this.persistReservation(updatedReservation);
    sendLessonReservationStatusNotifications(updatedReservation, 'ADMIN_CONFIRMED').catch((e) =>
      log.error('[ReservationService] Unexpected notification error:', e)
    );
    return updatedReservation;
  }

  /**
   * 특정 코치의 예약 가능한 슬롯 조회 (회원용)
   */
  async getAvailableSlots(
    coachId: string,
    startDate?: string,
    endDate?: string
  ): Promise<LessonReservation[]> {
    let reservations = await this.listReservations({ coachId });

    // Filter for available slots only
    reservations = reservations.filter((r) => r.status === 'AVAILABLE');

    // Filter by date range if provided
    if (startDate || endDate) {
      reservations = reservations.filter((r) => {
        const reservationDate = new Date(r.startTime);
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date(MAX_DATE);
        return reservationDate >= start && reservationDate <= end;
      });
    }

    return reservations.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  /**
   * 코치가 시간대 슬롯 상태 토글 (예약 가능 ↔ 예약 불가)
   * - 기존 슬롯 없음 → BLOCKED 생성 (근무시간 기본값을 불가로 변경)
   * - 기존 BLOCKED 슬롯 → 삭제 (기본 예약 가능으로 복원)
   * - 기존 AVAILABLE 슬롯 → BLOCKED 로 변경
   * - PENDING/CONFIRMED 슬롯 → 오류 (예약된 시간대는 변경 불가)
   */
  async toggleHourSlot(
    coachId: string,
    coachName: string,
    date: string,   // YYYY-MM-DD
    hour: number    // 0-23
  ): Promise<{ action: 'blocked' | 'available' }> {
    const safeDate = date.slice(0, 10); // ensure YYYY-MM-DD only
    const pad = (n: number) => String(n).padStart(2, '0');
    const startTime = `${safeDate}T${pad(hour)}:00:00`;
    const endTime   = `${safeDate}T${pad(hour + 1)}:00:00`;

    const existing = await this.listReservations({ coachId });

    const slot = existing.find(
      (r) =>
        r.coachId === coachId &&
        r.status !== 'CANCELLED' &&
        r.status !== 'REJECTED' &&
        r.startTime === startTime &&
        r.endTime === endTime
    );

    if (slot) {
      if (OCCUPIED_SLOT_STATUSES.includes(slot.status)) {
        throw new Error('이미 예약된 시간대는 변경할 수 없습니다.');
      }

      if (slot.status === 'BLOCKED') {
        // Remove block → restore to working-hour default (available)
        await this.removeReservation(slot.id);
        return { action: 'available' };
      }

      // slot.status === 'AVAILABLE': convert explicit available → BLOCKED
      const updated: LessonReservation = {
        ...slot,
        status: 'BLOCKED',
        updatedAt: Date.now(),
      };
      await this.writeReservation(updated);
      return { action: 'blocked' };
    }

    // No existing record → create BLOCKED (override working-hour default)
    await this.createBlockedSlot(coachId, coachName, startTime, endTime);
    return { action: 'blocked' };
  }

  /**
   * 근무 시간 기준 예약 가능 슬롯 조회 (회원용 - 가상 슬롯 포함)
   * 코치 프로필의 근무 일정을 조회하여 BLOCKED/PENDING/CONFIRMED가 아닌
   * 근무 시간대를 기본 예약 가능 슬롯으로 반환합니다.
   * 가상 슬롯 ID는 "virtual_" 접두사를 사용합니다.
   */
  async getAvailableWorkingHourSlots(
    coachId: string,
    date: string    // YYYY-MM-DD
  ): Promise<LessonReservation[]> {
    const safeDate = date.slice(0, 10); // ensure YYYY-MM-DD only

    // Fetch coach profile to read working schedule
    const coachProfile: CoachProfile | null = await this.getCoachProfile(coachId);

    // If no working schedule configured, fall back to explicit AVAILABLE slots
    if (!coachProfile?.workingSchedule) {
      return this.getAvailableSlots(coachId, `${safeDate}T00:00:00`, `${safeDate}T23:59:59`);
    }

    // Get all reservations for this date
    const allReservations = await this.listReservations({ coachId });

    const dateReservations = allReservations.filter(
      (r) =>
        r.startTime.slice(0, 10) === safeDate &&
        r.status !== 'CANCELLED' &&
        r.status !== 'REJECTED'
    );

    // Determine working hours for this day of week
    const d = new Date(safeDate + 'T00:00:00');
    const DOW_KEYS: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = DOW_KEYS[d.getDay()];
    const dayEntry = coachProfile.workingSchedule[dayKey];

    if (!dayEntry || dayEntry.isClosed) {
      // Non-working day: return only explicit AVAILABLE slots
      return dateReservations
        .filter((r) => r.status === 'AVAILABLE')
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }

    const workStart = parseInt(dayEntry.open.split(':')[0], 10);
    const workEnd   = parseInt(dayEntry.close.split(':')[0], 10);
    const pad = (n: number) => String(n).padStart(2, '0');

    // Build set of hours blocked by BLOCKED / active booked reservations.
    // A reservation spanning multiple hours (e.g. 14:00–16:00) must block
    // every hour it occupies, not just its start hour.
    const unavailableHours = new Set<number>();
    dateReservations
      .filter((r) => r.status === 'BLOCKED' || OCCUPIED_SLOT_STATUSES.includes(r.status))
      .forEach((r) => {
        const startH = parseInt(r.startTime.slice(11, 13), 10);
        let endH = parseInt(r.endTime.slice(11, 13), 10);
        const endMin = parseInt(r.endTime.slice(14, 16), 10) || 0;
        // If the end time falls mid-hour (e.g. 15:30), that hour is still occupied.
        if (endMin > 0) endH += 1;
        // Safety: guarantee at least one blocked hour (same-hour or midnight wrap).
        if (endH <= startH) endH = startH + 1;
        for (let h = startH; h < endH; h++) unavailableHours.add(h);
      });

    const result: LessonReservation[] = [];
    for (let hour = workStart; hour < workEnd; hour++) {
      if (unavailableHours.has(hour)) continue;

      // Prefer an explicit AVAILABLE record if one exists
      const explicit = dateReservations.find(
        (r) => r.status === 'AVAILABLE' && new Date(r.startTime).getHours() === hour
      );
      if (explicit) {
        result.push(explicit);
      } else {
        // Synthesise a virtual available slot for this working hour
        result.push({
          id: `${VIRTUAL_SLOT_ID_PREFIX}${coachId}_${safeDate}_${pad(hour)}`,
          coachId,
          coachName: coachProfile.name,
          startTime: `${safeDate}T${pad(hour)}:00:00`,
          endTime:   `${safeDate}T${pad(hour + 1)}:00:00`,
          status: 'AVAILABLE',
          createdAt: 0,
          updatedAt: 0,
        });
      }
    }

    return result.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  /**
   * 회원이 예약 가능 슬롯을 직접 CONFIRMED 상태로 확정
   */
  async confirmAvailableSlotByStudent(
    reservationId: string,
    clientId: string,
    clientName: string,
    clientPhone: string,
    notes?: string
  ): Promise<LessonReservation> {
    const reservation = await this.loadReservationById(reservationId);
    if (!reservation) throw new Error('예약을 찾을 수 없습니다.');
    if (reservation.status !== 'AVAILABLE') throw new Error('이미 예약된 시간대입니다.');

    const updatedReservation: LessonReservation = {
      ...reservation,
      clientId,
      clientName,
      clientPhone,
      notes,
      status: 'CONFIRMED',
      requestedAt: Date.now(),
      adminConfirmedAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.persistReservation(updatedReservation);

    sendLessonReservationStatusNotifications(updatedReservation, 'ADMIN_CONFIRMED').catch((e) =>
      log.error('[ReservationService] Unexpected notification error:', e)
    );

    return updatedReservation;
  }

  /**
   * 회원이 직접 시간을 입력하여 CONFIRMED 상태로 예약 확정 (새 예약 생성)
   */
  async confirmReservationWithTimeByStudent(
    coachId: string,
    coachName: string,
    clientId: string,
    clientName: string,
    clientPhone: string,
    startTime: string,
    endTime: string,
    notes?: string
  ): Promise<LessonReservation> {
    const allReservations = await this.listReservations({ coachId });

    const requestStart = new Date(startTime);
    const requestEnd = new Date(endTime);

    const hasTimeOverlap = (s1: Date, e1: Date, s2: Date, e2: Date): boolean =>
      s1 < e2 && e1 > s2;

    const blockedConflict = allReservations.find((r) => {
      if (r.status !== 'BLOCKED') return false;
      return hasTimeOverlap(requestStart, requestEnd, new Date(r.startTime), new Date(r.endTime));
    });

    if (blockedConflict) {
      throw new Error(`선택하신 시간은 예약이 불가능합니다. (사유: ${blockedConflict.blockReason || '블럭된 시간'})`);
    }

    const reservationConflict = allReservations.find((r) => {
      if (!OCCUPIED_SLOT_STATUSES.includes(r.status)) return false;
      return hasTimeOverlap(requestStart, requestEnd, new Date(r.startTime), new Date(r.endTime));
    });

    if (reservationConflict) {
      throw new Error('선택하신 시간은 이미 다른 예약이 있습니다.');
    }

    const reservation: LessonReservation = {
      id: crypto.randomUUID(),
      coachId,
      coachName,
      clientId,
      clientName,
      clientPhone,
      startTime,
      endTime,
      status: 'CONFIRMED',
      notes,
      requestedAt: Date.now(),
      adminConfirmedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.saveNewReservation(reservation);

    sendLessonReservationStatusNotifications(reservation, 'ADMIN_CONFIRMED').catch((e) =>
      log.error('[ReservationService] Unexpected notification error:', e)
    );

    return reservation;
  }

  /**
   * 코치가 회원 대신 레슨 예약을 직접 CONFIRMED 상태로 생성
   * - BLOCKED / PENDING / CONFIRMED 슬롯과 겹치면 오류
   * - createdByCoachId 에 코치 ID 기록
   */
  async createCoachMadeLessonReservation(
    coachId: string,
    coachName: string,
    clientId: string,
    clientName: string,
    clientPhone: string,
    startTime: string,
    endTime: string,
    notes?: string
  ): Promise<LessonReservation> {
    const allReservations = await this.listReservations({ coachId });

    const requestStart = new Date(startTime);
    const requestEnd = new Date(endTime);

    const hasTimeOverlap = (s1: Date, e1: Date, s2: Date, e2: Date): boolean =>
      s1 < e2 && e1 > s2;

    const conflict = allReservations.find((r) => {
      if (r.status === 'CANCELLED' || r.status === 'REJECTED') return false;
      const s = new Date(r.startTime);
      const e = new Date(r.endTime);
      return hasTimeOverlap(requestStart, requestEnd, s, e);
    });

    if (conflict) {
      if (conflict.status === 'BLOCKED') {
        throw new Error(
          `선택하신 시간은 예약이 불가능합니다. (사유: ${conflict.blockReason || '블럭된 시간'})`
        );
      }
      throw new Error('선택하신 시간은 이미 다른 예약이 있습니다.');
    }

    const reservation: LessonReservation = {
      id: crypto.randomUUID(),
      coachId,
      coachName,
      clientId,
      clientName,
      clientPhone,
      startTime,
      endTime,
      status: 'CONFIRMED',
      notes,
      createdByCoachId: coachId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.saveNewReservation(reservation);

    return reservation;
  }
}

export const reservationService = new ReservationService();
