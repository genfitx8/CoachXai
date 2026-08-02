/**
 * Tests for the shot_analysis feature:
 * - summariseShotsByClub: robust median/IQR per club with outlier filtering
 * - analyzeShotStrategy: wire payload uses the shot_analysis systemInstruction
 *   (from promptService or built-in) and passes rich per-club aggregates
 *   into the user prompt.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeShotStrategy,
  summariseShotsByClub,
} from '../services/geminiService';
import { BUILTIN_SYSTEM_PROMPTS } from '../services/promptService';
import type { ClientProfile, Lesson } from '../types';

const now = Date.now();
const daysAgo = (n: number) => now - n * 86_400_000;

const makeLesson = (over: Partial<Lesson> & { id: string }): Lesson => ({
  clientName: '김철수',
  clientPhone: '010-0000-0001',
  coachId: 'coach-1',
  createdBy: 'COACH',
  recordType: 'PRACTICE',
  date: new Date(daysAgo(2)).toISOString().split('T')[0],
  title: '연습',
  coachNotes: '',
  tags: [],
  videoUrl: '',
  mediaType: 'video',
  createdAt: daysAgo(2),
  ...over,
});

const client: ClientProfile = {
  id: 'c1',
  name: '김철수',
  phone: '010-0000-0001',
  handicap: 18,
} as ClientProfile;

describe('summariseShotsByClub', () => {
  it('groups by club and drops IQR outliers from the median', () => {
    // 6 normal 7-iron shots around 135m carry + one obvious mishit at 60m.
    // With IQR-based trimming the median should stay near 135, not slide toward
    // the outlier.
    const lessons: Lesson[] = [
      makeLesson({ id: '1', club: '7I', golfData: { carryDistance: 133 } }),
      makeLesson({ id: '2', club: '7I', golfData: { carryDistance: 135 } }),
      makeLesson({ id: '3', club: '7I', golfData: { carryDistance: 136 } }),
      makeLesson({ id: '4', club: '7I', golfData: { carryDistance: 134 } }),
      makeLesson({ id: '5', club: '7I', golfData: { carryDistance: 137 } }),
      makeLesson({ id: '6', club: '7I', golfData: { carryDistance: 135 } }),
      makeLesson({ id: '7', club: '7I', golfData: { carryDistance: 60 } }), // miss
    ];
    const [seven] = summariseShotsByClub(lessons);
    expect(seven.club).toBe('7I');
    expect(seven.sampleSize).toBe(7);
    expect(seven.carryDistance).toBeDefined();
    // Median of the trimmed set (135ish), not skewed toward the 60 outlier.
    expect(seven.carryDistance!.median).toBeGreaterThan(130);
    expect(seven.carryDistance!.median).toBeLessThan(140);
  });

  it('handles multiple clubs and skips lessons with no golfData or no club', () => {
    const lessons: Lesson[] = [
      makeLesson({ id: 'a', club: 'DRIVER', golfData: { carryDistance: 220, spinRate: 2600, attackAngle: 0.5 } }),
      makeLesson({ id: 'b', club: 'DRIVER', golfData: { carryDistance: 225, spinRate: 2700, attackAngle: 0.7 } }),
      makeLesson({ id: 'c', club: 'DRIVER', golfData: { carryDistance: 228, spinRate: 2500, attackAngle: 1.2 } }),
      makeLesson({ id: 'd', club: 'PW', golfData: { carryDistance: 95 } }),
      makeLesson({ id: 'e', club: 'PW', golfData: { carryDistance: 97 } }),
      // No club → excluded
      makeLesson({ id: 'x', golfData: { carryDistance: 200 } }),
      // No golf data → excluded
      makeLesson({ id: 'y', club: '7I' }),
    ];
    const aggregates = summariseShotsByClub(lessons);
    const clubs = aggregates.map((a) => a.club).sort();
    expect(clubs).toEqual(['DRIVER', 'PW']);

    const driver = aggregates.find((a) => a.club === 'DRIVER')!;
    expect(driver.sampleSize).toBe(3);
    expect(driver.spinRate?.median).toBeGreaterThan(2400);
    expect(driver.attackAngle?.median).toBeGreaterThan(0);
  });

  it('returns an empty array when no shots have both club and golfData', () => {
    expect(summariseShotsByClub([])).toEqual([]);
    expect(
      summariseShotsByClub([makeLesson({ id: 'x' })])
    ).toEqual([]);
  });
});

describe('analyzeShotStrategy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const richLessons = () =>
    [
      makeLesson({ id: '1', club: '7I', golfData: { carryDistance: 133, totalDistance: 143, launchAngle: 17, spinRate: 6800 } }),
      makeLesson({ id: '2', club: '7I', golfData: { carryDistance: 135, totalDistance: 145, launchAngle: 18, spinRate: 6900 } }),
      makeLesson({ id: '3', club: '7I', golfData: { carryDistance: 136, totalDistance: 146, launchAngle: 17, spinRate: 6700 } }),
      makeLesson({ id: '4', club: 'DRIVER', golfData: { carryDistance: 220, ballSpeed: 220, attackAngle: 0.5, clubPath: -1.2, spinRate: 2600 } }),
      makeLesson({ id: '5', club: 'DRIVER', golfData: { carryDistance: 225, ballSpeed: 225, attackAngle: 0.7, clubPath: -1.0, spinRate: 2700 } }),
      makeLesson({ id: '6', club: 'DRIVER', golfData: { carryDistance: 218, ballSpeed: 218, attackAngle: 0.4, clubPath: -1.5, spinRate: 2650 } }),
    ] as Lesson[];

  it('rejects when there is no shot data to analyse', async () => {
    await expect(
      analyzeShotStrategy({ clientProfile: client, lessons: [] })
    ).rejects.toThrow(/볼 데이터가 없습니다/);
  });

  it('sends shot_analysis with built-in systemInstruction when no template is active', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          text: '## 🎯 실제 샷 분포\n...분석 결과...',
        },
      }),
    } as Response);

    const report = await analyzeShotStrategy({
      clientProfile: client,
      lessons: richLessons(),
    });

    expect(report.markdown).toContain('실제 샷 분포');
    expect(report.contributingLessonCount).toBe(6);
    expect(report.clubsAnalysed).toEqual(expect.arrayContaining(['7I', 'DRIVER']));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.feature).toBe('shot_analysis');
    // The built-in prompt carries the coach's methodology headings.
    expect(body.payload.systemInstruction).toBe(BUILTIN_SYSTEM_PROMPTS.shot_analysis);
    expect(body.payload.systemInstruction).toContain('핀 위치별 공략법');
    // Per-club aggregates surfaced in the user prompt.
    expect(body.payload.prompt).toContain('7I');
    expect(body.payload.prompt).toContain('DRIVER');
    // Robust summary language should appear (median + IQR).
    expect(body.payload.prompt).toContain('median');
    expect(body.payload.prompt).toContain('IQR');
    // Motion/body absence must be flagged so the model marks those sections
    // as data-insufficient rather than fabricating.
    expect(body.payload.prompt).toContain('신체 분석 데이터 없음');
    expect(body.payload.prompt).toContain('모션 데이터 없음');
  });

  it('rejects when the AI returns an empty response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { text: '' } }),
    } as Response);

    await expect(
      analyzeShotStrategy({ clientProfile: client, lessons: richLessons() })
    ).rejects.toThrow(/빈 응답/);
  });
});
