import { describe, expect, it } from 'vitest';
import {
  aggregateSamples,
  bestEverShot,
  buildShotSession,
  compareToHistory,
  SHOT_METRIC_KEYS,
} from '../services/shotDataService';
import type { Lesson, ShotSample, ShotSession } from '../types';

describe('shotDataService — session-level roll-ups + comparison', () => {
  // Trackman 8-shot sample from the user's real screenshot. Kept as the
  // canonical fixture so any future prompt/parser change is measured
  // against a realistic input.
  const eightIronSamples: ShotSample[] = [
    { index: 1, clubHeadSpeed: 79.5, clubPath: -7.0, dynamicLoft: 16.6, carryDistance: 145.7, totalDistance: 165.4, ballSpeed: 112.9, spinRate: 4370 },
    { index: 2, clubHeadSpeed: 80.2, clubPath: -5.2, dynamicLoft: 16.9, carryDistance: 154.0, totalDistance: 168.7, ballSpeed: 117.5, spinRate: 4700 },
    { index: 3, clubHeadSpeed: 81.7, clubPath: -4.0, dynamicLoft: 17.0, carryDistance: 153.1, totalDistance: 168.9, ballSpeed: 116.6, spinRate: 4520 },
    { index: 4, clubHeadSpeed: 83.1, clubPath: -6.6, dynamicLoft: 19.4, carryDistance: 152.1, totalDistance: 160.9, ballSpeed: 117.4, spinRate: 5400 },
    { index: 5, clubHeadSpeed: 83.8, clubPath: -7.0, dynamicLoft: 19.7, carryDistance: 145.9, totalDistance: 155.7, ballSpeed: 113.9, spinRate: 5450 },
    { index: 6, clubHeadSpeed: 84.9, clubPath: -6.0, dynamicLoft: 20.1, carryDistance: 146.8, totalDistance: 155.9, ballSpeed: 114.1, spinRate: 5430 },
    { index: 7, clubHeadSpeed: 82.6, clubPath: -5.4, dynamicLoft: 18.0, carryDistance: 139.7, totalDistance: 156.9, ballSpeed: 109.7, spinRate: 4730 },
    { index: 8, clubHeadSpeed: 84.0, clubPath: -5.6, dynamicLoft: 19.9, carryDistance: 153.4, totalDistance: 161.1, ballSpeed: 117.9, spinRate: 5410 },
  ];

  describe('aggregateSamples', () => {
    it('computes max/min/avg/std across a Trackman-style 8-shot session', () => {
      const agg = aggregateSamples(eightIronSamples);

      // Max carry = shot #2 (154.0). Rounded to 1 dp.
      expect(agg.max?.carryDistance).toBe(154);
      expect(agg.min?.carryDistance).toBe(139.7);
      // Session average carry ~ 148.8 — same as the 평균 row on the image.
      expect(agg.average?.carryDistance).toBeGreaterThan(148);
      expect(agg.average?.carryDistance).toBeLessThan(150);
      // stddev is defined and non-zero (values do vary).
      expect(agg.stddev?.carryDistance).toBeGreaterThan(0);
    });

    it('preserves sign on negative metrics (club path 인-투-아웃)', () => {
      const agg = aggregateSamples(eightIronSamples);
      // Every clubPath value is negative — min is the most-negative, max the closest to zero.
      expect(agg.min?.clubPath).toBeLessThan(0);
      expect(agg.max?.clubPath).toBeLessThan(0);
      expect(agg.average?.clubPath).toBeLessThan(0);
    });

    it('omits metrics no sample carried (no NaN pollution)', () => {
      const agg = aggregateSamples([
        { index: 1, carryDistance: 100 },
        { index: 2, carryDistance: 120 },
      ]);
      // Only carryDistance should appear anywhere.
      expect(agg.max).toEqual({ carryDistance: 120 });
      expect(agg.min).toEqual({ carryDistance: 100 });
      expect(agg.average).toEqual({ carryDistance: 110 });
      // ballSpeed etc. must not be filled with 0 / NaN.
      expect(agg.max?.ballSpeed).toBeUndefined();
    });
  });

  describe('buildShotSession', () => {
    it('prefers the image-reported average and back-fills max/min/std from samples', () => {
      const imageAvg = { carryDistance: 148.8, ballSpeed: 115.0 };
      const session = buildShotSession(eightIronSamples, imageAvg, {
        club: '6 Iron',
        shotCount: 8,
      });
      expect(session).not.toBeNull();
      expect(session!.count).toBe(8);
      // Image-authoritative average wins over the sample-derived one.
      expect(session!.aggregate.average?.carryDistance).toBe(148.8);
      // Max/min/std come from samples since the image didn't publish them.
      expect(session!.aggregate.max?.carryDistance).toBe(154);
      expect(session!.aggregateSource).toBe('mixed');
      expect(session!.club).toBe('6 Iron');
    });

    it('handles a samples-only case (image gave no 평균 row)', () => {
      const session = buildShotSession(eightIronSamples, null);
      expect(session!.aggregateSource).toBe('computed');
      expect(session!.aggregate.average?.carryDistance).toBeGreaterThan(148);
    });

    it('returns null when neither samples nor an average exist', () => {
      expect(buildShotSession([], null)).toBeNull();
    });

    it('returns null when there are no samples even if an average was read (single-shot screen → golfData only)', () => {
      expect(buildShotSession([], { carryDistance: 180 })).toBeNull();
    });

    it('drops sample rows that are empty except for index (hidden shots)', () => {
      const session = buildShotSession(
        [
          { index: 1, carryDistance: 100 },
          { index: 2 }, // hidden — no readable values
        ],
        null
      );
      expect(session!.samples.length).toBe(1);
      expect(session!.aggregate.average?.carryDistance).toBe(100);
    });
  });

  describe('SHOT_METRIC_KEYS', () => {
    it('stays in lockstep with the interface (no drift)', () => {
      // Update this list only when you add a metric to GolfData. Guard-rail
      // against silent additions that skip aggregation.
      expect(SHOT_METRIC_KEYS).toEqual([
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
      ]);
    });
  });

  describe('compareToHistory', () => {
    const buildLesson = (
      overrides: Partial<Lesson> & { id: string; date: string; session?: ShotSession }
    ): Lesson => ({
      id: overrides.id,
      clientName: '홍길동',
      clientPhone: '010-0000-0000',
      createdBy: 'COACH',
      date: overrides.date,
      title: 'session',
      club: overrides.club ?? '6 Iron',
      videoUrl: '',
      mediaType: 'image',
      coachNotes: '',
      tags: [],
      createdAt: 0,
      shotSession: overrides.session,
    });

    it('returns null previous when there is no prior session for the same club', () => {
      const current = buildShotSession(eightIronSamples, null)!;
      const cmp = compareToHistory(current, [], {
        clientName: '홍길동',
        clientPhone: '010-0000-0000',
        club: '6 Iron',
      });
      expect(cmp.previous).toBeNull();
      expect(cmp.history).toEqual([]);
    });

    it('picks the most recent prior session and computes avg + max deltas', () => {
      const priorSession = buildShotSession(
        [
          { index: 1, carryDistance: 140, totalDistance: 150 },
          { index: 2, carryDistance: 138, totalDistance: 148 },
        ],
        null
      )!;
      const currentSession = buildShotSession(
        [
          { index: 1, carryDistance: 145, totalDistance: 155 },
          { index: 2, carryDistance: 150, totalDistance: 160 },
        ],
        null
      )!;

      const history: Lesson[] = [
        buildLesson({ id: 'old', date: '2026-08-01', session: priorSession }),
        // Different club — must be excluded.
        buildLesson({
          id: 'other-club',
          date: '2026-08-05',
          club: 'Driver',
          session: buildShotSession(
            [{ index: 1, carryDistance: 250 }],
            null
          )!,
        }),
      ];

      const cmp = compareToHistory(currentSession, history, {
        clientName: '홍길동',
        clientPhone: '010-0000-0000',
        club: '6 Iron',
      });
      expect(cmp.previous?.lessonId).toBe('old');
      // Current avg carry (147.5) - prior avg carry (139) = +8.5
      expect(cmp.avgDelta.carryDistance?.delta).toBeCloseTo(8.5, 1);
      // Current max carry (150) - prior max carry (140) = +10
      expect(cmp.maxDelta.carryDistance?.delta).toBeCloseTo(10, 1);
    });

    it('excludes the current lesson id from history to avoid self-compare', () => {
      const session = buildShotSession(eightIronSamples, null)!;
      const cmp = compareToHistory(session, [
        buildLesson({ id: 'me', date: '2026-08-11', session }),
      ], {
        clientName: '홍길동',
        clientPhone: '010-0000-0000',
        club: '6 Iron',
        currentLessonId: 'me',
      });
      expect(cmp.previous).toBeNull();
    });
  });

  describe('bestEverShot', () => {
    it('finds the single best-shot across all past sessions for a given metric+club', () => {
      const buildLesson = (id: string, date: string, samples: ShotSample[]): Lesson => ({
        id,
        clientName: '홍길동',
        clientPhone: '010-0000-0000',
        createdBy: 'COACH',
        date,
        title: 'session',
        club: '6 Iron',
        videoUrl: '',
        mediaType: 'image',
        coachNotes: '',
        tags: [],
        createdAt: 0,
        shotSession: buildShotSession(samples, null)!,
      });

      const lessons: Lesson[] = [
        buildLesson('a', '2026-07-01', [{ index: 1, carryDistance: 140 }, { index: 2, carryDistance: 148 }]),
        buildLesson('b', '2026-07-15', [{ index: 1, carryDistance: 162 }, { index: 2, carryDistance: 145 }]),
        buildLesson('c', '2026-08-01', [{ index: 1, carryDistance: 155 }]),
      ];

      const best = bestEverShot('carryDistance', lessons, {
        clientName: '홍길동',
        clientPhone: '010-0000-0000',
        club: '6 Iron',
      });
      expect(best?.value).toBe(162);
      expect(best?.date).toBe('2026-07-15');
      expect(best?.lessonId).toBe('b');
    });

    it('returns null when no session has the metric', () => {
      expect(
        bestEverShot('carryDistance', [], {
          clientName: '홍길동',
          clientPhone: '010-0000-0000',
        })
      ).toBeNull();
    });
  });
});
