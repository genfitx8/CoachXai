/**
 * Lesson Start Suggestion Service
 *
 * When the coach opens the app the service scans CONFIRMED reservations and
 * checks whether the current time falls inside the "start window" (10 min before
 * the lesson start up to 15 min after).  When a match is found the coach is
 * shown a prompt: "학생 레슨을 시작하시겠습니까?"
 *
 * Dismissals are persisted in localStorage so the same reservation is not
 * suggested again within the same calendar day.
 */

import { LessonReservation } from '../types';

/** How far before the lesson start the prompt appears (ms). */
export const WINDOW_BEFORE_MS = 10 * 60 * 1000; // 10 minutes

/** How far after the lesson start the prompt is still shown (ms). */
export const WINDOW_AFTER_MS = 15 * 60 * 1000; // 15 minutes

/** Shape returned when a matching reservation is found. */
export interface LessonSuggestion {
  reservation: LessonReservation;
  /** Positive = lesson hasn't started yet; negative = lesson already started. */
  minutesUntilStart: number;
}

// ─── localStorage key helpers ──────────────────────────────────────────────────

const DISMISSAL_KEY_PREFIX = 'lesson_suggestion_dismissed_';

/** Returns the localStorage key for a reservation's dismissal on a given date. */
function dismissalKey(reservationId: string, dateStr: string): string {
  return `${DISMISSAL_KEY_PREFIX}${reservationId}_${dateStr}`;
}

/** Returns today's date in YYYY-MM-DD local time. */
function localDateStr(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the first CONFIRMED reservation whose time window overlaps with
 * `nowMs`, or `null` if none is found.
 *
 * @param reservations  Coach's reservations (any status mix is fine; only
 *                      CONFIRMED ones are evaluated).
 * @param nowMs         Current epoch ms (defaults to `Date.now()`).
 * @param windowBeforeMs  How far before start to begin showing the prompt.
 * @param windowAfterMs   How far after start to keep showing the prompt.
 */
export function findUpcomingLesson(
  reservations: LessonReservation[],
  nowMs: number = Date.now(),
  windowBeforeMs: number = WINDOW_BEFORE_MS,
  windowAfterMs: number = WINDOW_AFTER_MS,
): LessonSuggestion | null {
  const now = new Date(nowMs);
  const todayStr = localDateStr(now);

  for (const res of reservations) {
    if (res.status !== 'CONFIRMED') continue;
    if (!res.clientName) continue;

    // Skip if already dismissed today
    if (wasDismissedToday(res.id, nowMs)) continue;

    const startMs = new Date(res.startTime).getTime();
    const diff = startMs - nowMs;

    // Inside window: [-windowAfterMs, +windowBeforeMs]
    if (diff <= windowBeforeMs && diff >= -windowAfterMs) {
      // Also make sure the reservation date is today
      const resDateStr = res.startTime.slice(0, 10);
      if (resDateStr !== todayStr) continue;

      return {
        reservation: res,
        minutesUntilStart: Math.round(diff / 60_000),
      };
    }
  }

  return null;
}

/**
 * Returns `true` if the reservation has been dismissed today (either via
 * "나중에" - re-check after interval - or "오늘 제외" - full day skip).
 */
export function wasDismissedToday(
  reservationId: string,
  nowMs: number = Date.now(),
): boolean {
  const todayStr = localDateStr(new Date(nowMs));
  return localStorage.getItem(dismissalKey(reservationId, todayStr)) !== null;
}

/**
 * Marks the reservation as "skipped for today" – the prompt will not appear
 * again for this reservation on the current calendar day.
 */
export function markSkippedToday(
  reservationId: string,
  nowMs: number = Date.now(),
): void {
  const todayStr = localDateStr(new Date(nowMs));
  localStorage.setItem(dismissalKey(reservationId, todayStr), 'skip');
}

/**
 * Marks the reservation as "remind later" – stores a timestamp so the caller
 * knows when to re-check.  The key is the same as a "skip" key so the same
 * reservation won't be re-suggested in the same render cycle; however the
 * caller is responsible for clearing this flag and re-checking after the
 * desired interval.
 *
 * In practice the app re-checks on every page-focus event, so pressing
 * "나중에" simply dismisses the modal for the current mount.
 */
export function markRemindLater(
  reservationId: string,
  nowMs: number = Date.now(),
): void {
  const todayStr = localDateStr(new Date(nowMs));
  localStorage.setItem(dismissalKey(reservationId, todayStr), 'later');
}

/**
 * Clears the "remind later" flag for a reservation so that it can be
 * re-suggested.  Used when a window focus event triggers a fresh check.
 */
export function clearRemindLater(
  reservationId: string,
  nowMs: number = Date.now(),
): void {
  const todayStr = localDateStr(new Date(nowMs));
  const key = dismissalKey(reservationId, todayStr);
  if (localStorage.getItem(key) === 'later') {
    localStorage.removeItem(key);
  }
}

/**
 * Removes all dismissal records whose date is before today (cleanup).
 * Call this once on app start to prevent localStorage from growing.
 */
export function pruneStaleDismissal(nowMs: number = Date.now()): void {
  const todayStr = localDateStr(new Date(nowMs));
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(DISMISSAL_KEY_PREFIX)) continue;
    // Key format: prefix + reservationId + _ + YYYY-MM-DD
    const datePart = key.slice(key.lastIndexOf('_') + 1);
    if (datePart < todayStr) keysToRemove.push(key);
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
}
