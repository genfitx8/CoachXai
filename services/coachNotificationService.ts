/**
 * Coach in-app notification service.
 *
 * When a member submits a lesson reservation request, a persistent
 * NotificationMessage is created with:
 *   - target: 'COACHES'
 *   - targetCoachId: the coach's ID
 *   - type: 'LESSON_RESERVATION_REQUEST'
 *   - isRead: false
 *
 * On coach login, unread notifications for that coach are fetched and
 * surfaced as a popup.  Once acknowledged the notifications are marked read
 * so they do not reappear on subsequent logins.
 *
 * All errors are caught internally – this service must never break the
 * reservation creation or authentication flows.
 */

import { NotificationMessage, LessonReservation } from '../types';
import { firebaseService } from './firebase';
import { storageService } from './storage';

export const RESERVATION_REQUEST_TYPE = 'LESSON_RESERVATION_REQUEST';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isFirebase(): boolean {
  return firebaseService.isInitialized();
}

async function saveNotification(n: NotificationMessage): Promise<void> {
  if (isFirebase()) {
    await firebaseService.sendNotification(n);
  } else {
    storageService.saveNotification(n);
  }
}

async function loadAllNotifications(): Promise<NotificationMessage[]> {
  if (isFirebase()) {
    return firebaseService.getNotifications();
  }
  return storageService.getNotifications();
}

async function markNotificationRead(id: string): Promise<void> {
  if (isFirebase()) {
    await firebaseService.updateNotification(id, { isRead: true });
  } else {
    storageService.updateNotification(id, { isRead: true });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a coach-targeted in-app notification for a new lesson reservation request.
 *
 * A dedup check is performed: if a notification for the same reservationId
 * already exists (regardless of read status) the new one is skipped so that
 * repeated calls (e.g. retries) do not create duplicates.
 *
 * Errors are caught and logged; they must not propagate to the caller.
 */
export async function createReservationRequestNotification(
  reservation: LessonReservation
): Promise<void> {
  try {
    // Dedup: skip if a notification for this reservation already exists.
    const existing = await loadAllNotifications();
    const duplicate = existing.some(
      (n) =>
        n.type === RESERVATION_REQUEST_TYPE &&
        n.reservationId === reservation.id
    );
    if (duplicate) return;

    const clientName = reservation.clientName || '회원';
    const date = reservation.startTime.slice(0, 10);
    const time = reservation.startTime.slice(11, 16);

    const notification: NotificationMessage = {
      id: crypto.randomUUID(),
      target: 'COACHES',
      targetCoachId: reservation.coachId,
      type: RESERVATION_REQUEST_TYPE,
      reservationId: reservation.id,
      title: '새 레슨 예약 요청',
      body: `${clientName} 회원이 ${date} ${time} 레슨을 요청했습니다.`,
      createdAt: Date.now(),
      isRead: false,
    };

    await saveNotification(notification);
  } catch (e) {
    console.error('[CoachNotification] Failed to create reservation notification:', e);
  }
}

/**
 * Return all unread lesson-reservation-request notifications for a specific coach.
 *
 * Returns an empty array on error so that login is never blocked.
 */
export async function getUnreadReservationNotificationsForCoach(
  coachId: string
): Promise<NotificationMessage[]> {
  try {
    const all = await loadAllNotifications();
    return all.filter(
      (n) =>
        n.type === RESERVATION_REQUEST_TYPE &&
        n.targetCoachId === coachId &&
        !n.isRead
    );
  } catch (e) {
    console.error('[CoachNotification] Failed to fetch unread notifications:', e);
    return [];
  }
}

/**
 * Mark a list of notification IDs as read.
 *
 * Errors are caught and logged.
 */
export async function markNotificationsAsRead(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map(async (id) => {
      try {
        await markNotificationRead(id);
      } catch (e) {
        console.error('[CoachNotification] Failed to mark notification read:', id, e);
      }
    })
  );
}
