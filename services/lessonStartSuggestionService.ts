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

// ─── Nearby lessons (레슨 중 동반 학생 추천) ───────────────────────────────────

/** How far ahead the companion picker looks for the next lesson (ms). */
export const NEARBY_LOOKAHEAD_MS = 3 * 60 * 60 * 1000; // 3 hours

/** How long after a lesson ends it stays suggestable (ms). */
export const NEARBY_LOOKBACK_MS = 30 * 60 * 1000; // 30 minutes

/** Fallback lesson length when a reservation has no usable `endTime`. */
const DEFAULT_LESSON_MS = 60 * 60 * 1000; // 1 hour

/**
 * Statuses that mean "this lesson is really on the books". REQUESTED and
 * CANCEL_REQUESTED are deliberately excluded — the coach hasn't committed
 * to the first, and the student is trying to back out of the second.
 */
const BOOKED_STATUSES = new Set(['CONFIRMED', 'COACH_APPROVED']);

/** Where a reservation sits relative to now. */
export type NearbyLessonPhase = 'IN_PROGRESS' | 'UPCOMING' | 'JUST_ENDED';

export interface NearbyLesson {
  reservation: LessonReservation;
  phase: NearbyLessonPhase;
  /** Positive = hasn't started yet; negative = already started. */
  minutesUntilStart: number;
  /** Korean status line, e.g. "진행 중", "15분 후 시작", "10분 전 종료". */
  label: string;
  /** Reservation time range, e.g. "14:00 – 15:00". */
  timeRangeLabel: string;
}

/** Local HH:MM for an ISO timestamp; empty string when unparseable. */
function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "3시간 20분 후 시작" / "15분 후 시작" / "곧 시작". */
function upcomingLabel(minutes: number): string {
  if (minutes < 1) return '곧 시작';
  if (minutes < 60) return `${minutes}분 후 시작`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}시간 후 시작` : `${h}시간 ${m}분 후 시작`;
}

/**
 * Ranks a coach's reservations by how close they are to `nowMs`, for the
 * 레슨 중 동반 student picker: lessons happening right now come first, then
 * the ones about to start, then the ones that just wrapped up (the coach
 * often opens the companion a beat late).
 *
 * Only one entry per student survives — their closest reservation — so a
 * student booked twice in the window doesn't crowd out everyone else.
 *
 * Unlike `findUpcomingLesson`, this ignores the localStorage dismissal
 * records: dismissing the "레슨을 시작하시겠습니까?" prompt says nothing about
 * whether the coach wants that student in the picker.
 *
 * @param reservations   Coach's reservations (any status mix is fine).
 * @param nowMs          Current epoch ms (defaults to `Date.now()`).
 * @param lookaheadMs    How far ahead to look for upcoming lessons.
 * @param lookbackMs     How long a finished lesson stays suggestable.
 */
export function findNearbyLessons(
  reservations: LessonReservation[],
  nowMs: number = Date.now(),
  lookaheadMs: number = NEARBY_LOOKAHEAD_MS,
  lookbackMs: number = NEARBY_LOOKBACK_MS,
): NearbyLesson[] {
  const candidates: NearbyLesson[] = [];

  for (const res of reservations) {
    if (!BOOKED_STATUSES.has(res.status)) continue;
    if (!res.clientName) continue;

    const startMs = new Date(res.startTime).getTime();
    if (Number.isNaN(startMs)) continue;

    const parsedEnd = res.endTime ? new Date(res.endTime).getTime() : NaN;
    const endMs =
      Number.isNaN(parsedEnd) || parsedEnd <= startMs
        ? startMs + DEFAULT_LESSON_MS
        : parsedEnd;

    const minutesUntilStart = Math.round((startMs - nowMs) / 60_000);
    const timeRangeLabel = `${timeLabel(res.startTime)} – ${timeLabel(
      new Date(endMs).toISOString(),
    )}`;

    let phase: NearbyLessonPhase;
    let label: string;
    if (nowMs >= startMs && nowMs <= endMs) {
      phase = 'IN_PROGRESS';
      label = '진행 중';
    } else if (startMs > nowMs) {
      if (startMs - nowMs > lookaheadMs) continue;
      phase = 'UPCOMING';
      label = upcomingLabel(minutesUntilStart);
    } else {
      if (nowMs - endMs > lookbackMs) continue;
      phase = 'JUST_ENDED';
      const minutesSinceEnd = Math.round((nowMs - endMs) / 60_000);
      label = minutesSinceEnd < 1 ? '방금 종료' : `${minutesSinceEnd}분 전 종료`;
    }

    candidates.push({ reservation: res, phase, minutesUntilStart, label, timeRangeLabel });
  }

  const phaseRank: Record<NearbyLessonPhase, number> = {
    IN_PROGRESS: 0,
    UPCOMING: 1,
    JUST_ENDED: 2,
  };
  candidates.sort((a, b) => {
    const byPhase = phaseRank[a.phase] - phaseRank[b.phase];
    if (byPhase !== 0) return byPhase;
    // Within a phase, closest to now wins.
    return (
      Math.abs(new Date(a.reservation.startTime).getTime() - nowMs) -
      Math.abs(new Date(b.reservation.startTime).getTime() - nowMs)
    );
  });

  // Keep each student's best-ranked entry only.
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = `${c.reservation.clientName}_${c.reservation.clientPhone ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
