import { LessonReservation, BayReservation, BranchAdminAccount, CoachProfile, ClientProfile } from '../types';
import { firebaseService } from './firebase';
import { storageService } from './storage';
import { createLogger } from '../utils/logger';

const log = createLogger('pushNotification');

// ─── Duplicate-notification guard ─────────────────────────────────────────────
// Tracks notification keys sent within the current app session so the same
// reservation event never triggers two notifications.
const notifiedKeys = new Set<string>();

const FALLBACK_CLIENT_NAME = '회원';

// ─── Persistence helpers ───────────────────────────────────────────────────────

async function loadCoachById(coachId: string): Promise<CoachProfile | null> {
  if (firebaseService.isInitialized()) {
    return firebaseService.getCoachById(coachId);
  }
  return Promise.resolve(storageService.getCoachById(coachId));
}

async function loadBranchAdminAccounts(branchId: string): Promise<BranchAdminAccount[]> {
  if (firebaseService.isInitialized()) {
    return firebaseService.getBranchAdminAccounts(branchId);
  }
  return Promise.resolve(storageService.getBranchAdminAccounts(branchId));
}

async function loadAllBranchAdminAccounts(): Promise<BranchAdminAccount[]> {
  if (firebaseService.isInitialized()) {
    return firebaseService.getBranchAdminAccounts();
  }
  return Promise.resolve(storageService.getBranchAdminAccounts());
}

async function loadClientByReservation(
  reservation: LessonReservation
): Promise<ClientProfile | null> {
  const clientId = reservation.clientId;
  if (!clientId) return null;

  const [namePart, ...phoneParts] = clientId.split('_');
  const phone = phoneParts.join('_') || reservation.clientPhone || '';
  const name = namePart || reservation.clientName || '';

  try {
    if (firebaseService.isInitialized()) {
      const clients = await firebaseService.getClients();
      return clients.find((c) => c.name === name && c.phone === phone) ?? null;
    }
    const clients = storageService.getClients();
    return clients.find((c) => c.name === name && c.phone === phone) ?? null;
  } catch {
    return null;
  }
}

// ─── Push delivery ─────────────────────────────────────────────────────────────

/**
 * Send a push notification to a single Expo push token.
 * Exported for testing / injection purposes.
 */
export async function sendExpoPush(
  token: string,
  title: string,
  body: string
): Promise<void> {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: token, sound: 'default', title, body }),
  });
  if (!response.ok) {
    throw new Error(`Expo push API responded with status ${response.status}`);
  }
}

/**
 * Attempt to deliver a push notification to a single token.
 * Silently skips absent tokens and logs (but does not throw) on delivery failure.
 */
async function notifyToken(
  token: string | undefined,
  title: string,
  body: string
): Promise<void> {
  if (!token) return;
  try {
    await sendExpoPush(token, title, body);
  } catch (e) {
    log.error('[PushNotification] Delivery failed:', e);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Send push notifications after a lesson reservation is successfully created.
 *
 * Recipients:
 *  - The assigned coach (looked up via coachId).
 *  - All active branch admins for the reservation's branchId, if available.
 *
 * Failures are logged but never propagate to the caller – the reservation
 * itself must not be rolled back due to notification errors.
 */
export async function sendLessonReservationNotifications(
  reservation: LessonReservation
): Promise<void> {
  await sendLessonReservationStatusNotifications(reservation, 'REQUESTED');
}

export type LessonReservationNotificationEvent =
  | 'REQUESTED'
  | 'COACH_APPROVED_ADMIN_PENDING'
  | 'ADMIN_CONFIRMED'
  | 'CANCEL_REQUESTED'
  | 'CHANGE_REQUESTED'
  | 'REJECTED'
  | 'CANCELLED';

export async function sendLessonReservationStatusNotifications(
  reservation: LessonReservation,
  event: LessonReservationNotificationEvent
): Promise<void> {
  const key = `lesson:${event}:${reservation.id}`;
  if (notifiedKeys.has(key)) return;
  notifiedKeys.add(key);

  const clientName = reservation.clientName || FALLBACK_CLIENT_NAME;
  const date = reservation.startTime.slice(0, 10);
  const time = reservation.startTime.slice(11, 16);
  const [coach, client, admins] = await Promise.all([
    reservation.coachId ? loadCoachById(reservation.coachId) : Promise.resolve(null),
    loadClientByReservation(reservation),
    reservation.branchId
      ? loadBranchAdminAccounts(reservation.branchId)
      : loadAllBranchAdminAccounts(),
  ]);

  const notifyCoach = async (title: string, body: string) => {
    try {
      await notifyToken(coach?.pushToken, title, body);
    } catch (e) {
      log.error('[PushNotification] Failed to notify coach:', e);
    }
  };
  const notifyMember = async (title: string, body: string) => {
    try {
      await notifyToken(client?.pushToken, title, body);
    } catch (e) {
      log.error('[PushNotification] Failed to notify member:', e);
    }
  };
  const notifyAdmins = async (title: string, body: string) => {
    try {
      await Promise.all(
        admins
          .filter((a) => a.isActive)
          .map((a) => notifyToken(a.pushToken, title, body))
      );
    } catch (e) {
      log.error('[PushNotification] Failed to notify branch admins:', e);
    }
  };

  switch (event) {
    case 'REQUESTED': {
      await notifyCoach(
        '새 레슨 예약 요청',
        `${clientName} 회원이 ${date} ${time} 레슨을 요청했습니다.`
      );
      break;
    }
    case 'COACH_APPROVED_ADMIN_PENDING': {
      await notifyAdmins(
        '레슨 예약 타석 배정 필요',
        `${clientName} 회원의 ${date} ${time} 레슨이 코치 승인되었습니다. 타석 배정을 진행해주세요.`
      );
      break;
    }
    case 'ADMIN_CONFIRMED': {
      const bayLabel = reservation.bayLabel ? ` (${reservation.bayLabel})` : '';
      await notifyToken(
        coach?.pushToken,
        '레슨 예약 확정',
        `${clientName} 회원의 ${date} ${time} 레슨이 최종 확정되었습니다.${bayLabel}`
      );
      await notifyMember(
        '레슨 예약 확정',
        `${reservation.coachName} 코치와의 ${date} ${time} 레슨이 확정되었습니다.${bayLabel}`
      );
      break;
    }
    case 'CANCEL_REQUESTED': {
      await Promise.all([
        notifyCoach(
          '레슨 취소 요청',
          `${clientName} 회원이 ${date} ${time} 레슨 취소를 요청했습니다.`
        ),
        notifyAdmins(
          '레슨 취소 요청',
          `${clientName} 회원의 ${date} ${time} 레슨 취소 요청이 접수되었습니다.`
        ),
      ]);
      break;
    }
    case 'CHANGE_REQUESTED': {
      await Promise.all([
        notifyCoach(
          '레슨 변경 요청',
          `${clientName} 회원이 ${date} ${time} 레슨 변경을 요청했습니다.`
        ),
        notifyAdmins(
          '레슨 변경 요청',
          `${clientName} 회원의 ${date} ${time} 레슨 변경 요청이 접수되었습니다.`
        ),
      ]);
      break;
    }
    case 'REJECTED': {
      await notifyMember(
        '레슨 예약 거절',
        `${date} ${time} 레슨 요청이 거절되었습니다.${reservation.rejectionReason ? ` 사유: ${reservation.rejectionReason}` : ''}`
      );
      break;
    }
    case 'CANCELLED': {
      await Promise.all([
        notifyCoach(
          '레슨 예약 취소 완료',
          `${clientName} 회원의 ${date} ${time} 레슨이 취소되었습니다.`
        ),
        notifyMember(
          '레슨 예약 취소 완료',
          `${date} ${time} 레슨 취소가 완료되었습니다.`
        ),
      ]);
      break;
    }
    default: {
      break;
    }
  }
}

/**
 * Send push notifications after a bay/타석 reservation is successfully created.
 *
 * Recipients:
 *  - All active branch admins for the reservation's branchId.
 *
 * Failures are logged but never propagate to the caller.
 */
export async function sendBayReservationNotifications(
  reservation: BayReservation,
  branchName?: string
): Promise<void> {
  const key = `bay:${reservation.id}`;
  if (notifiedKeys.has(key)) return;
  notifiedKeys.add(key);

  const clientName = reservation.clientName || FALLBACK_CLIENT_NAME;
  const date = reservation.startTime.slice(0, 10);
  const time = reservation.startTime.slice(11, 16);
  const locationSuffix = branchName ? ` (${branchName})` : '';

  try {
    const admins = await loadBranchAdminAccounts(reservation.branchId);
    await Promise.all(
      admins
        .filter((a) => a.isActive)
        .map((a) =>
          notifyToken(
            a.pushToken,
            '새 타석 예약 알림',
            `${clientName} 회원이 ${date} ${time} 타석을 예약했습니다.${locationSuffix}`
          )
        )
    );
  } catch (e) {
    log.error('[PushNotification] Failed to notify branch admins:', e);
  }
}

/** Exposed only for unit tests – clears the in-memory deduplication cache. */
export function _resetNotifiedKeysForTesting(): void {
  notifiedKeys.clear();
}
