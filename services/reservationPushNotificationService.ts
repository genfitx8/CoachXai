import { LessonReservation, BayReservation, BranchAdminAccount, CoachProfile } from '../types';
import { firebaseService } from './firebase';
import { storageService } from './storage';

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
    console.error('[PushNotification] Delivery failed:', e);
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
  const key = `lesson:${reservation.id}`;
  if (notifiedKeys.has(key)) return;
  notifiedKeys.add(key);

  const clientName = reservation.clientName || FALLBACK_CLIENT_NAME;
  const date = reservation.startTime.slice(0, 10);
  const time = reservation.startTime.slice(11, 16);

  // Notify the assigned coach
  try {
    if (reservation.coachId) {
      const coach = await loadCoachById(reservation.coachId);
      await notifyToken(
        coach?.pushToken,
        '새 레슨 예약',
        `${clientName} 회원이 ${date} ${time} 레슨을 예약했습니다.`
      );
    }
  } catch (e) {
    console.error('[PushNotification] Failed to notify coach:', e);
  }

  // Notify branch admins (only when branchId is available on the reservation)
  try {
    if (reservation.branchId) {
      const admins = await loadBranchAdminAccounts(reservation.branchId);
      await Promise.all(
        admins
          .filter((a) => a.isActive)
          .map((a) =>
            notifyToken(
              a.pushToken,
              '새 레슨 예약 알림',
              `${clientName} 회원이 ${date} ${time} 레슨을 예약했습니다.`
            )
          )
      );
    }
  } catch (e) {
    console.error('[PushNotification] Failed to notify branch admins:', e);
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
    console.error('[PushNotification] Failed to notify branch admins:', e);
  }
}

/** Exposed only for unit tests – clears the in-memory deduplication cache. */
export function _resetNotifiedKeysForTesting(): void {
  notifiedKeys.clear();
}
