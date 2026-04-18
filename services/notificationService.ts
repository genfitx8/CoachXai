import { LessonReservation, NotificationMessage, ClientProfile } from '../types';
import { firebaseService } from './firebase';
import { storageService } from './storage';

/**
 * Formats an ISO datetime string into a human-readable Korean date/time label.
 * e.g. "2026-04-10T10:00:00" → "2026년 4월 10일 10:00"
 */
function formatDateTimeKo(isoString: string): string {
  try {
    const d = new Date(isoString);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hour = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${year}년 ${month}월 ${day}일 ${hour}:${min}`;
  } catch {
    return isoString;
  }
}

class NotificationService {
  private isFirebaseMode(): boolean {
    return firebaseService.isInitialized();
  }

  /**
   * Look up a client profile by composite ID (`${name}_${phone}`).
   * Returns undefined when not found; never throws.
   */
  private async findClientById(clientId: string): Promise<ClientProfile | undefined> {
    try {
      if (this.isFirebaseMode()) {
        const clients = await firebaseService.getClients();
        return clients.find(
          (c) => `${c.name}_${c.phone}` === clientId
        );
      } else {
        const clients = storageService.getClients();
        return clients.find(
          (c) => `${c.name}_${c.phone}` === clientId
        );
      }
    } catch (err) {
      console.error('[NotificationService] Failed to look up client:', err);
      return undefined;
    }
  }

  /**
   * Sends a lesson-confirmed push notification to the member.
   *
   * - Only sends when `reservation.status` is CONFIRMED.
   * - Skips silently if the member has no push token.
   * - Logs delivery failures without throwing.
   * - Returns true when the notification was delivered (or stored), false otherwise.
   */
  async sendLessonConfirmedNotification(
    reservation: LessonReservation
  ): Promise<boolean> {
    if (reservation.status !== 'CONFIRMED') {
      return false;
    }

    if (!reservation.clientId) {
      return false;
    }

    // Build notification content
    const dateLabel = formatDateTimeKo(reservation.startTime);
    const coachName = reservation.coachName || '담당 코치';
    const title = '레슨 예약이 확정되었어요';
    const body = `${coachName} 코치가 ${dateLabel} 레슨 예약을 확정했습니다.`;

    // Attempt to look up the client's push token
    const client = await this.findClientById(reservation.clientId);
    if (client?.pushToken) {
      // Future: deliver via FCM / Web Push using client.pushToken
      // For now this is a no-op placeholder; the in-app notification below
      // is always attempted.
      // e.g. await fcmAdmin.send({ token: client.pushToken, notification: { title, body } });
    }

    // Store an in-app notification targeted to the specific client
    const notification: NotificationMessage = {
      id: crypto.randomUUID(),
      target: 'CLIENTS',
      clientId: reservation.clientId,
      title,
      body,
      createdAt: Date.now(),
    };

    try {
      if (this.isFirebaseMode()) {
        await firebaseService.sendNotification(notification);
      } else {
        storageService.saveNotification(notification);
      }
      return true;
    } catch (err) {
      console.error('[NotificationService] Failed to send lesson confirmation notification:', err);
      return false;
    }
  }
}

export const notificationService = new NotificationService();
