/**
 * shotDataService — session-level shot data analytics.
 *
 * Owns the two things `Lesson.golfData` alone can't answer:
 *   1. Per-session roll-ups (max / min / std-dev) from the raw samples of
 *      a Trackman-style multi-shot table.
 *   2. Session-over-session comparison for the same student + club.
 *
 * Kept as pure functions with no I/O so both the extraction pipeline and
 * the analytics UI can call in without a service instance.
 */

import type {
  GolfData,
  Lesson,
  ShotAggregate,
  ShotSample,
  ShotSession,
} from '../types';
import { lessonBelongsToClient } from '../utils/clientMatch';

/**
 * All numeric metric keys that appear on both `GolfData` and `ShotSample`.
 * Iterating this list is what lets max/min/avg/std be metric-agnostic —
 * add a new metric to the interface and it flows through the aggregate.
 */
export const SHOT_METRIC_KEYS: readonly (keyof GolfData)[] = [
  'carryDistance',
  'totalDistance',
  'ballSpeed',
  'clubHeadSpeed',
  'launchAngle',
  'attackAngle',
  'backSpin',
  'sideSpin',
  'spinRate',
  'smashFactor',
  'clubPath',
  'dynamicLoft',
  'spinLoft',
  'faceAngle',
  'sideTotal',
] as const;

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * Filter one metric column across samples, dropping missing/non-finite
 * entries. Reused by every reducer below so they see a clean number[].
 */
const columnValues = (
  samples: ShotSample[],
  key: keyof GolfData
): number[] => {
  const out: number[] = [];
  for (const s of samples) {
    const v = s[key];
    if (isFiniteNumber(v)) out.push(v);
  }
  return out;
};

const mean = (values: number[]): number =>
  values.reduce((acc, v) => acc + v, 0) / values.length;

const stdDev = (values: number[]): number => {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

/**
 * Compute average / max / min / stddev across a per-shot sample set.
 * Every metric that has at least one numeric value shows up in every
 * output object; metrics no shot reported are simply omitted so downstream
 * `data.max?.carryDistance` reads either `number` or `undefined`, never
 * a bogus `NaN` / `0`.
 */
export const aggregateSamples = (samples: ShotSample[]): ShotAggregate => {
  const average: GolfData = {};
  const max: Partial<GolfData> = {};
  const min: Partial<GolfData> = {};
  const stddev: Partial<GolfData> = {};

  for (const key of SHOT_METRIC_KEYS) {
    const values = columnValues(samples, key);
    if (values.length === 0) continue;
    average[key] = round1(mean(values));
    max[key] = round1(Math.max(...values));
    min[key] = round1(Math.min(...values));
    stddev[key] = round1(stdDev(values));
  }

  return { average, max, min, stddev };
};

const nonEmpty = (obj: Partial<GolfData> | undefined): boolean =>
  !!obj && Object.keys(obj).length > 0;

/**
 * Merge an image-read aggregate (what the AI pulled off the 평균 / ± rows)
 * with a computed-from-samples aggregate. The image wins when both agree,
 * but the computed side fills gaps — e.g. many screens print 평균 but no
 * max/min row, so max/min always come from samples.
 *
 * Returns `null` if neither side produced anything useful.
 */
export const buildShotSession = (
  samples: ShotSample[],
  imageAverage: GolfData | null | undefined,
  opts: { club?: string; shotCount?: number; capturedAt?: number } = {}
): ShotSession | null => {
  const cleanSamples = samples.filter((s) =>
    SHOT_METRIC_KEYS.some((k) => isFiniteNumber(s[k]))
  );

  const count =
    typeof opts.shotCount === 'number' && opts.shotCount > 0
      ? opts.shotCount
      : cleanSamples.length;

  const cleanImageAverage: GolfData | null =
    imageAverage &&
    Object.entries(imageAverage).some(([, v]) => isFiniteNumber(v))
      ? Object.fromEntries(
          Object.entries(imageAverage).filter(([, v]) => isFiniteNumber(v))
        )
      : null;

  // A ShotSession only makes sense when there are actual per-shot samples
  // to aggregate over. A single-shot summary screen (metrics only, no
  // shots[]) is fully captured by Lesson.golfData — creating a session
  // with samples:[] would produce a max/min/std of {} and pollute
  // downstream comparisons that read `.aggregate.max`.
  if (cleanSamples.length === 0) return null;

  const computed = aggregateSamples(cleanSamples);

  // Prefer the image's average — that's what the launch monitor
  // authoritatively displayed. Fall back to the computed average
  // otherwise.
  const aggregate: ShotAggregate = {
    average: cleanImageAverage ?? computed.average ?? {},
    max: computed.max,
    min: computed.min,
    stddev: computed.stddev,
  };
  if (!nonEmpty(aggregate.max)) delete aggregate.max;
  if (!nonEmpty(aggregate.min)) delete aggregate.min;
  if (!nonEmpty(aggregate.stddev)) delete aggregate.stddev;

  const source: ShotSession['aggregateSource'] = cleanImageAverage ? 'mixed' : 'computed';

  return {
    count: count || cleanSamples.length,
    samples: cleanSamples,
    aggregate,
    aggregateSource: source,
    capturedAt: opts.capturedAt ?? Date.now(),
    club: opts.club,
  };
};

/**
 * Delta between two per-metric partials. Positive = current improved
 * (higher value) vs previous. Returned only for metrics both sides have.
 */
const diffMetrics = (
  current: Partial<GolfData> | undefined,
  previous: Partial<GolfData> | undefined
): Partial<Record<keyof GolfData, { current: number; previous: number; delta: number }>> => {
  if (!current || !previous) return {};
  const out: Partial<
    Record<keyof GolfData, { current: number; previous: number; delta: number }>
  > = {};
  for (const key of SHOT_METRIC_KEYS) {
    const c = current[key];
    const p = previous[key];
    if (!isFiniteNumber(c) || !isFiniteNumber(p)) continue;
    out[key] = { current: c, previous: p, delta: round1(c - p) };
  }
  return out;
};

export interface SessionComparison {
  /** The comparison target — most recent past session for the same club, or null if none. */
  previous: {
    lessonId: string;
    date: string;
    count: number;
    average: GolfData;
    max: Partial<GolfData>;
  } | null;
  /** Per-metric current-vs-previous delta on the AVERAGE row. */
  avgDelta: ReturnType<typeof diffMetrics>;
  /** Per-metric current-vs-previous delta on the MAX row (best shot of session). */
  maxDelta: ReturnType<typeof diffMetrics>;
  /** All prior sessions with the same club — sorted newest-first. */
  history: {
    lessonId: string;
    date: string;
    session: ShotSession;
  }[];
}

/**
 * Pull the past-session context for a freshly extracted `current` session.
 * Reads from the same client + club, ignores lessons without a stored
 * ShotSession (older lessons that only carried averaged golfData don't
 * count — comparing max requires per-shot samples).
 *
 * `currentLessonId` is optional so this can be called from an unsaved
 * NewLessonForm draft (nothing to exclude).
 */
export const compareToHistory = (
  current: ShotSession,
  allLessons: Lesson[],
  target: { clientName: string; clientPhone: string; club?: string; currentLessonId?: string }
): SessionComparison => {
  const club = target.club ?? current.club;

  const relevant = allLessons
    .filter((l) => l.id !== target.currentLessonId)
    .filter((l) => !club || l.club === club)
    .filter((l) => l.shotSession && l.shotSession.samples.length > 0)
    .filter((l) =>
      lessonBelongsToClient(l, {
        name: target.clientName,
        phone: target.clientPhone,
      })
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const history = relevant.map((l) => ({
    lessonId: l.id,
    date: l.date,
    session: l.shotSession as ShotSession,
  }));

  const previousLesson = relevant[0];
  const previous = previousLesson
    ? {
        lessonId: previousLesson.id,
        date: previousLesson.date,
        count: previousLesson.shotSession!.count,
        average: previousLesson.shotSession!.aggregate.average ?? {},
        max: previousLesson.shotSession!.aggregate.max ?? {},
      }
    : null;

  return {
    previous,
    avgDelta: diffMetrics(current.aggregate.average, previous?.average),
    maxDelta: diffMetrics(current.aggregate.max, previous?.max),
    history,
  };
};

export interface BestEver {
  metric: keyof GolfData;
  value: number;
  date: string;
  lessonId: string;
  shotIndex?: number;
}

/**
 * Best single shot on record for a given metric across all sessions for
 * (student, optional club). Returns null when no session has that metric.
 *
 * Uses per-shot max (not session average) so "최대 캐리 165m" reflects
 * the actual peak shot, not a lucky average.
 */
export const bestEverShot = (
  metric: keyof GolfData,
  allLessons: Lesson[],
  target: { clientName: string; clientPhone: string; club?: string }
): BestEver | null => {
  let best: BestEver | null = null;
  for (const l of allLessons) {
    if (!lessonBelongsToClient(l, { name: target.clientName, phone: target.clientPhone })) continue;
    if (target.club && l.club !== target.club) continue;
    const session = l.shotSession;
    if (!session) continue;
    for (const [i, shot] of session.samples.entries()) {
      const v = shot[metric];
      if (!isFiniteNumber(v)) continue;
      if (!best || v > best.value) {
        best = {
          metric,
          value: v,
          date: l.date,
          lessonId: l.id,
          shotIndex: typeof shot.index === 'number' ? shot.index : i + 1,
        };
      }
    }
  }
  return best;
};
