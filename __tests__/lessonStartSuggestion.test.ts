import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  findUpcomingLesson,
  wasDismissedToday,
  markSkippedToday,
  markRemindLater,
  clearRemindLater,
  pruneStaleDismisal,
  WINDOW_BEFORE_MS,
  WINDOW_AFTER_MS,
} from '../services/lessonStartSuggestionService';
import { LessonReservation } from '../types';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const NOW_ISO = '2026-04-20T14:00:00'; // local-time reference
const NOW_MS = new Date(NOW_ISO).getTime();

/** Build a minimal CONFIRMED reservation starting at `startIso`. */
function makeReservation(
  startIso: string,
  overrides: Partial<LessonReservation> = {},
): LessonReservation {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour
  return {
    id: 'res-001',
    coachId: 'coach1',
    coachName: '박코치',
    clientId: 'client1',
    clientName: '김회원',
    clientPhone: '010-0000-0000',
    startTime: startIso,
    endTime: end.toISOString(),
    status: 'CONFIRMED',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

// ─── localStorage mock ─────────────────────────────────────────────────────────

let store: Record<string, string> = {};

beforeEach(() => {
  store = {};
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── findUpcomingLesson ────────────────────────────────────────────────────────

describe('findUpcomingLesson', () => {
  it('returns null when reservations list is empty', () => {
    expect(findUpcomingLesson([], NOW_MS)).toBeNull();
  });

  it('returns null for non-CONFIRMED reservations', () => {
    const res = makeReservation(NOW_ISO, { status: 'PENDING' });
    expect(findUpcomingLesson([res], NOW_MS)).toBeNull();
  });

  it('returns null when reservation has no clientName', () => {
    const res = makeReservation(NOW_ISO, { clientName: undefined });
    expect(findUpcomingLesson([res], NOW_MS)).toBeNull();
  });

  it('returns suggestion when lesson starts in 5 minutes (within window)', () => {
    const startMs = NOW_MS + 5 * 60 * 1000;
    const res = makeReservation(new Date(startMs).toISOString());
    const result = findUpcomingLesson([res], NOW_MS);
    expect(result).not.toBeNull();
    expect(result!.minutesUntilStart).toBe(5);
  });

  it('returns suggestion when lesson started 5 minutes ago (within after-window)', () => {
    const startMs = NOW_MS - 5 * 60 * 1000;
    const res = makeReservation(new Date(startMs).toISOString());
    const result = findUpcomingLesson([res], NOW_MS);
    expect(result).not.toBeNull();
    expect(result!.minutesUntilStart).toBe(-5);
  });

  it('returns null when lesson starts exactly at WINDOW_BEFORE limit boundary (just outside)', () => {
    // 1 second past the "before" window – should NOT trigger
    const startMs = NOW_MS + WINDOW_BEFORE_MS + 1000;
    const res = makeReservation(new Date(startMs).toISOString());
    expect(findUpcomingLesson([res], NOW_MS)).toBeNull();
  });

  it('returns null when lesson started beyond WINDOW_AFTER (too late)', () => {
    const startMs = NOW_MS - WINDOW_AFTER_MS - 1000;
    const res = makeReservation(new Date(startMs).toISOString());
    expect(findUpcomingLesson([res], NOW_MS)).toBeNull();
  });

  it('returns null when reservation is for a different day', () => {
    const yesterdayIso = '2026-04-19T14:00:00';
    const res = makeReservation(yesterdayIso);
    expect(findUpcomingLesson([res], NOW_MS)).toBeNull();
  });

  it('returns null when reservation was already dismissed today', () => {
    const startMs = NOW_MS + 5 * 60 * 1000;
    const res = makeReservation(new Date(startMs).toISOString());
    markSkippedToday(res.id, NOW_MS);
    expect(findUpcomingLesson([res], NOW_MS)).toBeNull();
  });

  it('returns the first matching reservation from a mixed list', () => {
    const res1 = makeReservation(new Date(NOW_MS - WINDOW_AFTER_MS - 1000).toISOString(), { id: 'past' });
    const res2 = makeReservation(new Date(NOW_MS + 3 * 60 * 1000).toISOString(), { id: 'near' });
    const res3 = makeReservation(new Date(NOW_MS + 20 * 60 * 1000).toISOString(), { id: 'far' });
    const result = findUpcomingLesson([res1, res2, res3], NOW_MS);
    expect(result!.reservation.id).toBe('near');
  });
});

// ─── dismissal helpers ─────────────────────────────────────────────────────────

describe('markSkippedToday / wasDismissedToday', () => {
  it('marks a reservation as dismissed and wasDismissedToday returns true', () => {
    expect(wasDismissedToday('res-001', NOW_MS)).toBe(false);
    markSkippedToday('res-001', NOW_MS);
    expect(wasDismissedToday('res-001', NOW_MS)).toBe(true);
  });

  it('dismissal does not carry over to a different reservation id', () => {
    markSkippedToday('res-001', NOW_MS);
    expect(wasDismissedToday('res-002', NOW_MS)).toBe(false);
  });
});

describe('markRemindLater / clearRemindLater', () => {
  it('sets "later" flag and clears it', () => {
    markRemindLater('res-001', NOW_MS);
    expect(wasDismissedToday('res-001', NOW_MS)).toBe(true);
    clearRemindLater('res-001', NOW_MS);
    expect(wasDismissedToday('res-001', NOW_MS)).toBe(false);
  });

  it('clearRemindLater does not clear a "skip" flag', () => {
    markSkippedToday('res-001', NOW_MS);
    clearRemindLater('res-001', NOW_MS); // Should be a no-op
    expect(wasDismissedToday('res-001', NOW_MS)).toBe(true);
  });
});

// ─── pruneStaleDismisal ────────────────────────────────────────────────────────

describe('pruneStaleDismisal', () => {
  it('removes entries whose date is before today', () => {
    // Store a stale entry for yesterday
    const yesterdayMs = NOW_MS - 24 * 60 * 60 * 1000;
    markSkippedToday('res-old', yesterdayMs);
    // Verify it exists
    expect(localStorage.length).toBe(1);
    // Prune using today's timestamp
    pruneStaleDismisal(NOW_MS);
    expect(localStorage.length).toBe(0);
  });

  it('keeps entries for today', () => {
    markSkippedToday('res-001', NOW_MS);
    pruneStaleDismisal(NOW_MS);
    expect(localStorage.length).toBe(1);
  });

  it('does not touch unrelated localStorage keys', () => {
    store['coach_showMedia'] = 'false';
    markSkippedToday('res-old', NOW_MS - 24 * 60 * 60 * 1000);
    pruneStaleDismisal(NOW_MS);
    // Only the stale suggestion key should be removed
    expect(store['coach_showMedia']).toBe('false');
    expect(localStorage.length).toBe(1);
  });
});
