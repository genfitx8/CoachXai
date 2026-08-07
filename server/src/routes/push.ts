/**
 * Push-notification routes.
 *
 * All routes require a valid JWT via authMiddleware. Requests are always
 * associated with req.user; a client cannot register a token or set
 * preferences for another user.
 *
 * Endpoint summary:
 *   POST   /api/push/register-token       — save/refresh this device's FCM token
 *   DELETE /api/push/tokens/:token        — remove a token (logout / opt-out)
 *   GET    /api/push/preferences          — read caller's preferences
 *   PUT    /api/push/preferences          — update caller's preferences
 *   POST   /api/push/lesson-uploaded      — coach → student: new lesson video
 *   POST   /api/push/practice-logged      — student → coach: practice recorded
 *   POST   /api/push/broadcast            — coach → all their students
 *   POST   /api/push/schedule-lesson-reminders  — schedule pre-lesson reminders
 *   POST   /api/push/cancel-lesson-reminders    — cancel scheduled reminders
 */

import { Router, Request, Response } from 'express';
import pool from '../services/db';
import { authMiddleware } from '../middleware/auth';
import { sendToUser, sendToUsers, isFcmReady } from '../services/fcm';

const router = Router();
router.use(authMiddleware);

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CHANNELS = {
  lessonVideoUploaded: true,
  practiceLogged: true,
  lessonStartingSoon: true,
  coachBroadcast: true,
  reservationRequested: true,
  reservationConfirmed: true,
};

const ALLOWED_REMINDER_MINUTES = [0, 5, 10, 15, 30, 60, 120, 240];

interface Preferences {
  lessonReminderMinutes: number;
  channels: typeof DEFAULT_CHANNELS;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

async function loadPreferences(
  userId: string,
  userRole: 'coach' | 'client'
): Promise<Preferences> {
  const result = await pool.query(
    `SELECT lesson_reminder_minutes, channels, quiet_hours_start, quiet_hours_end
       FROM notification_preferences
      WHERE user_id = $1 AND user_role = $2`,
    [userId, userRole]
  );
  if (result.rows.length === 0) {
    return {
      lessonReminderMinutes: 30,
      channels: { ...DEFAULT_CHANNELS },
      quietHoursStart: null,
      quietHoursEnd: null,
    };
  }
  const row = result.rows[0];
  return {
    lessonReminderMinutes: row.lesson_reminder_minutes,
    channels: { ...DEFAULT_CHANNELS, ...(row.channels as object) },
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
  };
}

/**
 * Returns true if `now` falls inside a preference's quiet hours window.
 * A window that wraps midnight (e.g. 22:00 → 08:00) is supported.
 */
function isInQuietHours(prefs: Preferences, now = new Date()): boolean {
  if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;
  const [sh, sm] = prefs.quietHoursStart.split(':').map(Number);
  const [eh, em] = prefs.quietHoursEnd.split(':').map(Number);
  if (
    Number.isNaN(sh) ||
    Number.isNaN(sm) ||
    Number.isNaN(eh) ||
    Number.isNaN(em)
  ) {
    return false;
  }
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (startMin === endMin) return false;
  if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  // Wraps past midnight.
  return nowMin >= startMin || nowMin < endMin;
}

// ── Token management ─────────────────────────────────────────────────────────

router.post('/register-token', async (req: Request, res: Response) => {
  try {
    const { token, platform, appVariant } = req.body as {
      token?: string;
      platform?: string;
      appVariant?: string;
    };
    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'token is required' });
      return;
    }
    if (platform !== 'ios' && platform !== 'android') {
      res.status(400).json({ error: 'platform must be ios or android' });
      return;
    }
    if (appVariant !== 'coach' && appVariant !== 'student') {
      res.status(400).json({ error: 'appVariant must be coach or student' });
      return;
    }
    const now = Date.now();
    // A token is globally unique per install. If it exists but is associated
    // with another user (account switch on the same device), we overwrite.
    await pool.query(
      `INSERT INTO device_tokens (token, user_id, user_role, platform, app_variant, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT (token) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             user_role = EXCLUDED.user_role,
             platform = EXCLUDED.platform,
             app_variant = EXCLUDED.app_variant,
             updated_at = EXCLUDED.updated_at`,
      [token, req.user!.id, req.user!.role, platform, appVariant, now]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[push] register-token error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/tokens/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    // Only allow deleting a token that belongs to the caller.
    await pool.query(
      `DELETE FROM device_tokens
        WHERE token = $1 AND user_id = $2 AND user_role = $3`,
      [token, req.user!.id, req.user!.role]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[push] delete-token error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Preferences ──────────────────────────────────────────────────────────────

router.get('/preferences', async (req: Request, res: Response) => {
  try {
    const prefs = await loadPreferences(
      req.user!.id,
      req.user!.role as 'coach' | 'client'
    );
    res.json({ preferences: prefs });
  } catch (err) {
    console.error('[push] GET preferences error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/preferences', async (req: Request, res: Response) => {
  try {
    const { lessonReminderMinutes, channels, quietHoursStart, quietHoursEnd } =
      req.body as {
        lessonReminderMinutes?: number;
        channels?: Partial<typeof DEFAULT_CHANNELS>;
        quietHoursStart?: string | null;
        quietHoursEnd?: string | null;
      };

    // Load existing so partial updates don't wipe unset fields.
    const existing = await loadPreferences(
      req.user!.id,
      req.user!.role as 'coach' | 'client'
    );

    const nextMinutes =
      lessonReminderMinutes === undefined
        ? existing.lessonReminderMinutes
        : lessonReminderMinutes;
    if (!ALLOWED_REMINDER_MINUTES.includes(nextMinutes)) {
      res.status(400).json({
        error: `lessonReminderMinutes must be one of ${ALLOWED_REMINDER_MINUTES.join(', ')}`,
      });
      return;
    }

    const nextChannels = { ...existing.channels, ...(channels ?? {}) };

    const nextQhStart =
      quietHoursStart === undefined ? existing.quietHoursStart : quietHoursStart;
    const nextQhEnd =
      quietHoursEnd === undefined ? existing.quietHoursEnd : quietHoursEnd;

    const now = Date.now();
    await pool.query(
      `INSERT INTO notification_preferences
         (user_id, user_role, lesson_reminder_minutes, channels,
          quiet_hours_start, quiet_hours_end, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, user_role) DO UPDATE
         SET lesson_reminder_minutes = EXCLUDED.lesson_reminder_minutes,
             channels                 = EXCLUDED.channels,
             quiet_hours_start        = EXCLUDED.quiet_hours_start,
             quiet_hours_end          = EXCLUDED.quiet_hours_end,
             updated_at               = EXCLUDED.updated_at`,
      [
        req.user!.id,
        req.user!.role,
        nextMinutes,
        JSON.stringify(nextChannels),
        nextQhStart,
        nextQhEnd,
        now,
      ]
    );
    res.json({
      preferences: {
        lessonReminderMinutes: nextMinutes,
        channels: nextChannels,
        quietHoursStart: nextQhStart,
        quietHoursEnd: nextQhEnd,
      },
    });
  } catch (err) {
    console.error('[push] PUT preferences error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Event: coach uploaded a lesson video ─────────────────────────────────────

router.post('/lesson-uploaded', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') {
      res.status(403).json({ error: 'Only coaches can trigger this event' });
      return;
    }
    const { lessonId } = req.body as { lessonId?: string };
    if (!lessonId) {
      res.status(400).json({ error: 'lessonId is required' });
      return;
    }
    // Resolve the target student. Prefer the lesson's client_id when set;
    // otherwise fall back to phone lookup (legacy records).
    const lesson = await pool.query(
      `SELECT client_id, client_phone, client_name, coach_id, title
         FROM lessons WHERE id = $1`,
      [lessonId]
    );
    if (lesson.rows.length === 0) {
      res.status(404).json({ error: 'Lesson not found' });
      return;
    }
    const l = lesson.rows[0];
    if (l.coach_id !== req.user!.id) {
      res.status(403).json({ error: 'Lesson does not belong to this coach' });
      return;
    }
    let studentId: string | null = l.client_id ?? null;
    if (!studentId && l.client_phone) {
      const c = await pool.query(
        `SELECT id FROM clients WHERE phone = $1 LIMIT 1`,
        [l.client_phone]
      );
      if (c.rows.length > 0) studentId = c.rows[0].id;
    }
    if (!studentId) {
      res.json({ ok: true, skipped: 'no matching student' });
      return;
    }
    const prefs = await loadPreferences(studentId, 'client');
    if (!prefs.channels.lessonVideoUploaded || isInQuietHours(prefs)) {
      res.json({ ok: true, skipped: 'muted-by-preference' });
      return;
    }
    const coach = await pool.query(
      `SELECT name FROM coaches WHERE id = $1`,
      [l.coach_id]
    );
    const coachName = coach.rows[0]?.name ?? '코치';
    const result = await sendToUser(studentId, 'client', {
      title: `${coachName} 코치의 새 레슨 영상`,
      body: l.title ? `"${l.title}" 영상이 올라왔어요` : '새 레슨 영상이 올라왔어요',
      data: {
        type: 'LESSON_VIDEO_UPLOADED',
        lessonId,
        deepLink: `/lessons/${lessonId}`,
      },
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[push] lesson-uploaded error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Event: student logged practice ───────────────────────────────────────────

router.post('/practice-logged', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'client') {
      res.status(403).json({ error: 'Only clients can trigger this event' });
      return;
    }
    const { lessonId, summary } = req.body as {
      lessonId?: string;
      summary?: string;
    };
    if (!lessonId) {
      res.status(400).json({ error: 'lessonId is required' });
      return;
    }
    const lesson = await pool.query(
      `SELECT coach_id, client_id, client_name, club, target_distance
         FROM lessons WHERE id = $1`,
      [lessonId]
    );
    if (lesson.rows.length === 0) {
      res.status(404).json({ error: 'Lesson not found' });
      return;
    }
    const l = lesson.rows[0];
    // A client can only trigger a notification for a lesson they own.
    if (l.client_id && l.client_id !== req.user!.id) {
      res.status(403).json({ error: 'Lesson does not belong to this client' });
      return;
    }
    if (!l.coach_id) {
      res.json({ ok: true, skipped: 'no coach on lesson' });
      return;
    }
    const prefs = await loadPreferences(l.coach_id, 'coach');
    if (!prefs.channels.practiceLogged || isInQuietHours(prefs)) {
      res.json({ ok: true, skipped: 'muted-by-preference' });
      return;
    }
    // Prefer the caller's own name from the clients table over legacy lesson denorm.
    const me = await pool.query(`SELECT name FROM clients WHERE id = $1`, [req.user!.id]);
    const studentName = me.rows[0]?.name ?? l.client_name ?? '학생';
    const parts: string[] = [];
    if (l.club) parts.push(String(l.club));
    if (l.target_distance) parts.push(`${l.target_distance}m`);
    const detail = summary ?? (parts.length > 0 ? parts.join(' · ') : undefined);
    const result = await sendToUser(l.coach_id, 'coach', {
      title: `${studentName}님이 연습 기록을 남겼어요`,
      body: detail ?? '새 연습 기록이 등록되었습니다',
      data: {
        type: 'PRACTICE_LOGGED',
        lessonId,
        studentId: req.user!.id,
        deepLink: `/lessons/${lessonId}`,
      },
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[push] practice-logged error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Coach broadcast to all their students ────────────────────────────────────

router.post('/broadcast', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') {
      res.status(403).json({ error: 'Only coaches can broadcast' });
      return;
    }
    if (!isFcmReady()) {
      res.status(503).json({ error: 'Push service is not configured' });
      return;
    }
    const { title, body, deepLink } = req.body as {
      title?: string;
      body?: string;
      deepLink?: string;
    };
    if (!title || !body) {
      res.status(400).json({ error: 'title and body are required' });
      return;
    }
    if (title.length > 100 || body.length > 500) {
      res.status(400).json({
        error: 'title must be ≤100 chars and body ≤500 chars',
      });
      return;
    }
    // Fan out to every client assigned to this coach.
    const students = await pool.query<{ id: string }>(
      `SELECT id FROM clients WHERE coach_id = $1`,
      [req.user!.id]
    );
    // Filter by each student's coachBroadcast preference (and quiet hours).
    const eligible: Array<{ userId: string; userRole: 'client' }> = [];
    for (const s of students.rows) {
      const prefs = await loadPreferences(s.id, 'client');
      if (!prefs.channels.coachBroadcast) continue;
      if (isInQuietHours(prefs)) continue;
      eligible.push({ userId: s.id, userRole: 'client' });
    }
    const result = await sendToUsers(eligible, {
      title,
      body,
      data: {
        type: 'COACH_BROADCAST',
        coachId: req.user!.id,
        ...(deepLink ? { deepLink } : {}),
      },
    });
    const now = Date.now();
    await pool.query(
      `INSERT INTO broadcasts
         (coach_id, title, body, deep_link, recipient_count, delivered_count, failed_count, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        req.user!.id,
        title,
        body,
        deepLink ?? null,
        eligible.length,
        result.delivered,
        result.failed,
        now,
      ]
    );
    res.json({
      ok: true,
      totalStudents: students.rows.length,
      eligibleStudents: eligible.length,
      delivered: result.delivered,
      failed: result.failed,
    });
  } catch (err) {
    console.error('[push] broadcast error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Lesson reminder scheduling ───────────────────────────────────────────────

router.post('/schedule-lesson-reminders', async (req: Request, res: Response) => {
  try {
    const {
      reservationId,
      lessonStartAt,
      coachId,
      clientId,
      coachName,
      clientName,
    } = req.body as {
      reservationId?: string;
      lessonStartAt?: number;
      coachId?: string;
      clientId?: string;
      coachName?: string;
      clientName?: string;
    };
    if (!reservationId || !lessonStartAt || !coachId || !clientId) {
      res.status(400).json({
        error: 'reservationId, lessonStartAt, coachId, clientId are required',
      });
      return;
    }
    // A client scheduling reminders may only do so for their own reservation;
    // a coach may only for their own. Server has no reservations table
    // (Firestore-backed), so we verify via caller identity.
    if (req.user!.role === 'client' && req.user!.id !== clientId) {
      res.status(403).json({ error: 'Cannot schedule for another client' });
      return;
    }
    if (req.user!.role === 'coach' && req.user!.id !== coachId) {
      res.status(403).json({ error: 'Cannot schedule for another coach' });
      return;
    }

    // Cancel any existing PENDING reminders for this reservation before
    // re-scheduling — handles reschedule/change-time cases idempotently.
    const dedupBase = `reservation:${reservationId}`;
    await pool.query(
      `DELETE FROM scheduled_notifications
        WHERE dedup_key LIKE $1 || '%' AND status = 'PENDING'`,
      [dedupBase]
    );

    const targets: Array<{
      userId: string;
      role: 'coach' | 'client';
      otherName: string;
    }> = [
      { userId: coachId, role: 'coach', otherName: clientName ?? '학생' },
      { userId: clientId, role: 'client', otherName: coachName ?? '코치' },
    ];

    const now = Date.now();
    const scheduled: Array<{ userId: string; role: string; fireAt: number }> = [];
    for (const t of targets) {
      const prefs = await loadPreferences(t.userId, t.role);
      if (!prefs.channels.lessonStartingSoon) continue;
      if (prefs.lessonReminderMinutes === 0) continue;
      const fireAt = lessonStartAt - prefs.lessonReminderMinutes * 60_000;
      if (fireAt <= now) continue; // lesson already too close / passed
      await pool.query(
        `INSERT INTO scheduled_notifications
           (target_user_id, target_role, fire_at, type, dedup_key, payload, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'LESSON_STARTING_SOON', $4, $5, 'PENDING', $6, $6)`,
        [
          t.userId,
          t.role,
          fireAt,
          `${dedupBase}:${t.role}`,
          JSON.stringify({
            reservationId,
            lessonStartAt,
            minutesBefore: prefs.lessonReminderMinutes,
            otherName: t.otherName,
          }),
          now,
        ]
      );
      scheduled.push({ userId: t.userId, role: t.role, fireAt });
    }
    res.json({ ok: true, scheduled });
  } catch (err) {
    console.error('[push] schedule-lesson-reminders error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/cancel-lesson-reminders', async (req: Request, res: Response) => {
  try {
    const { reservationId } = req.body as { reservationId?: string };
    if (!reservationId) {
      res.status(400).json({ error: 'reservationId is required' });
      return;
    }
    const result = await pool.query(
      `DELETE FROM scheduled_notifications
        WHERE dedup_key LIKE 'reservation:' || $1 || '%' AND status = 'PENDING'
        RETURNING id`,
      [reservationId]
    );
    res.json({ ok: true, cancelled: result.rowCount ?? 0 });
  } catch (err) {
    console.error('[push] cancel-lesson-reminders error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
