/**
 * Tests for coachStyleService (Phase C1 — signal capture).
 *
 * Covers:
 * 1. tierForSource maps sources to the expected quality tiers.
 * 2. save/getForTarget roundtrip via localStorage (non-firebase mode).
 * 3. Coach-scoped exemplars win over global for the same target/coach.
 * 4. includeGlobalFallback fills remaining slots with global exemplars.
 * 5. Ranking prefers higher tier first, then newer.
 * 6. delete removes the exemplar.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { coachStyleService, tierForSource } from '../services/coachStyleService';
import { storageService } from '../services/storage';
import type { CoachStyleExemplar, CoachStyleExemplarSource } from '../types';

const makeExemplar = (
  over: Partial<CoachStyleExemplar> & { id: string }
): CoachStyleExemplar => ({
  target: 'shot_analysis',
  input: '요약',
  output: '## 리포트 본문',
  source: 'starred',
  tier: 1,
  createdAt: Date.now(),
  ...over,
});

beforeEach(() => {
  localStorage.clear();
});

describe('tierForSource', () => {
  const cases: Array<[CoachStyleExemplarSource, 1 | 2 | 3]> = [
    ['starred', 1],
    ['feedback', 1],
    ['edited', 2],
    ['auto', 3],
  ];
  it.each(cases)('maps %s → tier %s', (source, expected) => {
    expect(tierForSource(source)).toBe(expected);
  });
});

describe('coachStyleService.save + getForTarget', () => {
  it('roundtrips through localStorage in non-firebase mode', async () => {
    const exemplar = makeExemplar({ id: 'ex1', coachId: 'coach-A' });
    await coachStyleService.save(exemplar, false);

    const picks = await coachStyleService.getForTarget(
      'shot_analysis',
      'coach-A',
      false
    );
    expect(picks).toHaveLength(1);
    expect(picks[0].id).toBe('ex1');
  });

  it('prefers coach-scoped exemplars over global for the same target', async () => {
    await coachStyleService.save(
      makeExemplar({ id: 'global1', tier: 1, createdAt: 1000 }),
      false
    );
    await coachStyleService.save(
      makeExemplar({ id: 'coach1', coachId: 'coach-A', tier: 1, createdAt: 500 }),
      false
    );

    const picks = await coachStyleService.getForTarget(
      'shot_analysis',
      'coach-A',
      false,
      { limit: 2 }
    );
    // Coach-scoped first, global fills remaining slots.
    expect(picks.map((p) => p.id)).toEqual(['coach1', 'global1']);
  });

  it('honours includeGlobalFallback=false', async () => {
    await coachStyleService.save(
      makeExemplar({ id: 'g1', tier: 1, createdAt: 2000 }),
      false
    );

    const picks = await coachStyleService.getForTarget(
      'shot_analysis',
      'coach-A',
      false,
      { includeGlobalFallback: false }
    );
    expect(picks).toHaveLength(0);
  });

  it('ranks higher tier first, then newer within tier', async () => {
    await coachStyleService.save(
      makeExemplar({ id: 'oldStar', tier: 1, createdAt: 100 }),
      false
    );
    await coachStyleService.save(
      makeExemplar({ id: 'newAuto', tier: 3, createdAt: 999 }),
      false
    );
    await coachStyleService.save(
      makeExemplar({ id: 'newStar', tier: 1, createdAt: 500 }),
      false
    );
    await coachStyleService.save(
      makeExemplar({ id: 'oldEdit', tier: 2, createdAt: 200 }),
      false
    );

    const picks = await coachStyleService.getForTarget(
      'shot_analysis',
      undefined,
      false,
      { limit: 4 }
    );
    // tier 1 newest → tier 1 oldest → tier 2 → tier 3
    expect(picks.map((p) => p.id)).toEqual([
      'newStar',
      'oldStar',
      'oldEdit',
      'newAuto',
    ]);
  });

  it('filters by target so exemplars from other features are not returned', async () => {
    await coachStyleService.save(
      makeExemplar({ id: 'ls1', target: 'lesson_summary' }),
      false
    );
    await coachStyleService.save(
      makeExemplar({ id: 'sa1', target: 'shot_analysis' }),
      false
    );

    const picks = await coachStyleService.getForTarget(
      'shot_analysis',
      undefined,
      false
    );
    expect(picks.map((p) => p.id)).toEqual(['sa1']);
  });

  it('delete removes the exemplar', async () => {
    await coachStyleService.save(makeExemplar({ id: 'gone' }), false);
    expect(storageService.getCoachStyleExemplars()).toHaveLength(1);

    await coachStyleService.delete('gone', false);
    expect(storageService.getCoachStyleExemplars()).toHaveLength(0);
  });
});
