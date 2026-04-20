import { describe, expect, it } from 'vitest';
import { analyzeSwing, classifyShot, validateSwingMetricsInput } from '../engine/analysisEngine';
import { analyzeCoachXSwing, createCoachXGolfService } from '../services/coachXService';

describe('CoachX deterministic golf engine', () => {
  it('classifies a severe right miss as push-slice pattern', () => {
    const shot = classifyShot({ faceAngle: 3, clubPath: -1.5, attackAngle: -4.2 });
    expect(shot.pattern).toBe('push-slice');
    expect(shot.shotShape).toBe('slice');
    expect(shot.startDirection).toBe('right');
    expect(shot.attackProfile).toBe('steep');
  });

  it('classifies a severe left miss as pull-hook pattern', () => {
    const shot = classifyShot({ faceAngle: -2.8, clubPath: 1.4, attackAngle: 2.1 });
    expect(shot.pattern).toBe('pull-hook');
    expect(shot.shotShape).toBe('hook');
    expect(shot.startDirection).toBe('left');
  });

  it('returns deterministic ball flight and root causes', () => {
    const result = analyzeSwing({ faceAngle: 2.5, clubPath: -2.2, attackAngle: -5.6 });
    expect(result.ballFlight.distanceEfficiencyScore).toBeLessThan(60);
    expect(result.rootCauses.length).toBeGreaterThan(0);
    expect(result.rootCauses[0].confidence).toBeGreaterThan(0);
  });

  it('validates input ranges', () => {
    const errors = validateSwingMetricsInput({ faceAngle: 4.5, clubPath: 0, attackAngle: 0 });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('faceAngle');
  });
});

describe('CoachX golf service orchestration', () => {
  it('uses deterministic fallback feedback when no model is provided', async () => {
    const result = await analyzeCoachXSwing({ faceAngle: 1.8, clubPath: -1.1, attackAngle: -3.5 });
    expect(result.llmUsed).toBe(false);
    expect(result.coachingFeedback).toContain('Ball Flight Diagnosis');
  });

  it('uses explanation model output when provided', async () => {
    const service = createCoachXGolfService({
      model: {
        generate: async () => 'LLM coaching explanation',
      },
    });

    const result = await service.analyzeSwing({ faceAngle: -1.5, clubPath: 0.6, attackAngle: -0.5 });
    expect(result.llmUsed).toBe(true);
    expect(result.coachingFeedback).toBe('LLM coaching explanation');
  });

  it('throws validation error for out-of-range metrics', async () => {
    await expect(
      analyzeCoachXSwing({ faceAngle: 0, clubPath: 0, attackAngle: 8 })
    ).rejects.toThrow('CoachX swing input validation failed');
  });
});
