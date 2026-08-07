/**
 * Scheduled-push cron runner.
 *
 * Polls the scheduled_notifications table every minute and sends any row
 * whose fire_at has passed. Uses a per-row row-level SELECT ... FOR UPDATE
 * SKIP LOCKED transaction so multiple server instances running in parallel
 * (e.g. horizontal scale) don't double-fire the same reminder.
 *
 * Reminder notifications are always sent even if the target is inside their
 * quiet-hours window — pre-lesson reminders are explicitly exempted so a
 * user doesn't miss the start of a lesson because of a quiet-hours rule.
 */

import pool from './db';
import { sendToUser } from './fcm';

const POLL_INTERVAL_MS = 60_000;
let timer: NodeJS.Timeout | null = null;
let running = false;

interface Row {
  id: string;
  target_user_id: string;
  target_role: 'coach' | 'client';
  type: string;
  payload: {
    reservationId?: string;
    lessonStartAt?: number;
    minutesBefore?: number;
    otherName?: string;
  };
}

function buildMessage(row: Row): { title: string; body: string; data: Record<string, string> } {
  if (row.type === 'LESSON_STARTING_SOON') {
    const mins = row.payload.minutesBefore ?? 30;
    const other = row.payload.otherName ?? '';
    const label = row.target_role === 'coach' ? '학생' : '코치';
    return {
      title: `${mins}분 뒤 레슨이 시작돼요`,
      body: other ? `${other} ${label}과의 레슨이 곧 시작됩니다` : '곧 레슨이 시작됩니다',
      data: {
        type: 'LESSON_STARTING_SOON',
        reservationId: row.payload.reservationId ?? '',
        deepLink: row.payload.reservationId
          ? `/reservations/${row.payload.reservationId}`
          : '',
      },
    };
  }
  return {
    title: '알림',
    body: '',
    data: { type: row.type },
  };
}

async function tick(): Promise<void> {
  if (running) return; // avoid overlap if a run stretches past the interval
  running = true;
  try {
    const now = Date.now();
    // Claim a batch of due rows atomically. SKIP LOCKED lets sibling workers
    // grab different rows in parallel without waiting on each other.
    const claim = await pool.query<Row>(
      `WITH due AS (
         SELECT id
           FROM scheduled_notifications
          WHERE status = 'PENDING' AND fire_at <= $1
          ORDER BY fire_at ASC
          LIMIT 100
          FOR UPDATE SKIP LOCKED
       )
       UPDATE scheduled_notifications sn
          SET status = 'SENDING', updated_at = $1
         FROM due
        WHERE sn.id = due.id
       RETURNING sn.id, sn.target_user_id, sn.target_role, sn.type, sn.payload`,
      [now]
    );
    for (const row of claim.rows) {
      try {
        const msg = buildMessage(row);
        const result = await sendToUser(row.target_user_id, row.target_role, msg);
        await pool.query(
          `UPDATE scheduled_notifications
              SET status = 'SENT', sent_at = $2, updated_at = $2
            WHERE id = $1`,
          [row.id, Date.now()]
        );
        if (result.failed > 0 && result.delivered === 0 && result.requested === 0) {
          console.warn(`[scheduledPushRunner] row ${row.id} had no tokens`);
        }
      } catch (err) {
        console.error(`[scheduledPushRunner] send failed for row ${row.id}:`, err);
        // Bounce back to PENDING so the next tick retries.
        await pool.query(
          `UPDATE scheduled_notifications
              SET status = 'PENDING', updated_at = $2
            WHERE id = $1`,
          [row.id, Date.now()]
        );
      }
    }
  } catch (err) {
    console.error('[scheduledPushRunner] tick failed:', err);
  } finally {
    running = false;
  }
}

export function startScheduledPushRunner(): void {
  if (timer) return;
  console.log('[scheduledPushRunner] started (1-minute polling)');
  // Run once shortly after boot so any overdue reminders fire quickly,
  // then settle into the 1-minute cadence.
  setTimeout(() => {
    void tick();
  }, 5_000);
  timer = setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
}

export function stopScheduledPushRunner(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
