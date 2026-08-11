/**
 * Client-side wrapper around /api/push preferences and event triggers.
 * All server-authoritative logic lives in server/src/routes/push.ts; this
 * file just formats the HTTP calls and surfaces typed results.
 */

import { resolveApiBaseUrl } from './apiBase';

const TOKEN_KEY = 'swingnote_api_token';

export interface NotificationChannels {
  lessonVideoUploaded: boolean;
  practiceLogged: boolean;
  lessonStartingSoon: boolean;
  coachBroadcast: boolean;
  reservationRequested: boolean;
  reservationConfirmed: boolean;
}

export interface NotificationPreferences {
  lessonReminderMinutes: number;
  channels: NotificationChannels;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

export const REMINDER_MINUTE_OPTIONS = [
  { value: 0, label: '알림 안 받음' },
  { value: 5, label: '5분 전' },
  { value: 10, label: '10분 전' },
  { value: 15, label: '15분 전' },
  { value: 30, label: '30분 전' },
  { value: 60, label: '1시간 전' },
  { value: 120, label: '2시간 전' },
  { value: 240, label: '4시간 전' },
];

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const jwt = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${resolveApiBaseUrl()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getPreferences(): Promise<NotificationPreferences> {
  const { preferences } = await req<{ preferences: NotificationPreferences }>(
    'GET',
    '/api/push/preferences'
  );
  return preferences;
}

export async function updatePreferences(
  patch: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  const { preferences } = await req<{ preferences: NotificationPreferences }>(
    'PUT',
    '/api/push/preferences',
    patch
  );
  return preferences;
}

// ── Event triggers ───────────────────────────────────────────────────────────

export async function notifyLessonUploaded(lessonId: string): Promise<void> {
  await req('POST', '/api/push/lesson-uploaded', { lessonId });
}

export async function notifyPracticeLogged(
  lessonId: string,
  summary?: string
): Promise<void> {
  await req('POST', '/api/push/practice-logged', { lessonId, summary });
}

export interface BroadcastResult {
  totalStudents: number;
  eligibleStudents: number;
  delivered: number;
  failed: number;
}

export async function broadcastToStudents(
  title: string,
  body: string,
  deepLink?: string
): Promise<BroadcastResult> {
  return req<BroadcastResult>('POST', '/api/push/broadcast', {
    title,
    body,
    ...(deepLink ? { deepLink } : {}),
  });
}

export interface ScheduleReminderInput {
  reservationId: string;
  lessonStartAt: number;
  coachId: string;
  clientId: string;
  coachName?: string;
  clientName?: string;
}

export async function scheduleLessonReminders(
  input: ScheduleReminderInput
): Promise<void> {
  await req('POST', '/api/push/schedule-lesson-reminders', input);
}

export async function cancelLessonReminders(reservationId: string): Promise<void> {
  await req('POST', '/api/push/cancel-lesson-reminders', { reservationId });
}
