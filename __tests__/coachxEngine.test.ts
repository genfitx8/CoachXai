import { describe, expect, it } from 'vitest';
import {
  analyzeSwingMetrics,
  buildCoachingPlan,
  buildDeterministicCoachingReport,
  buildGeminiCoachingContext,
  inferLikelyCauses,
} from '../services/coachx-engine';

describe('coachx-engine deterministic pipeline', () => {
  it('classifies swing geometry from face/path/attack metrics', () => {
    const analysis = analyzeSwingMetrics({
      faceAngle: 4,
      clubPath: -2.5,
      attackAngle: -4,
    });

    expect(analysis.faceState).toBe('OPEN');
    expect(analysis.pathState).toBe('OUT_TO_IN');
    expect(analysis.attackState).toBe('DOWNWARD');
    expect(analysis.faceToPathDeg).toBe(6.5);
    expect(analysis.shotShape).toBe('PUSH_FADE');
  });

  it('ranks likely causes by deterministic severity', () => {
    const analysis = analyzeSwingMetrics({
      faceAngle: 5,
      clubPath: -1,
      attackAngle: -3,
    });

    const causes = inferLikelyCauses(analysis);

    expect(causes[0]?.code).toBe('OPEN_FACE_AT_IMPACT');
    expect(causes.some((cause) => cause.code === 'FACE_PATH_MISMATCH')).toBe(true);
    expect(causes.some((cause) => cause.code === 'STEPPED_DOWN_ATTACK')).toBe(true);
  });

  it('builds focused coaching actions from causes', () => {
    const plan = buildCoachingPlan([
      {
        code: 'FACE_PATH_MISMATCH',
        reason: 'Face-to-path gap is large.',
        evidence: 'Face-to-Path 5.0°',
        severity: 8,
      },
      {
        code: 'OUT_TO_IN_PATH',
        reason: 'Path is leftward.',
        evidence: 'Club Path -3.0°',
        severity: 6,
      },
    ]);

    expect(plan.priorities).toHaveLength(2);
    expect(plan.priorities[0]?.title).toContain('Synchronize face and path');
    expect(plan.summary).toContain('Primary deterministic focus');
  });

  it('prepares Gemini-ready context without changing deterministic core output', () => {
    const report = buildDeterministicCoachingReport({
      faceAngle: 3.5,
      clubPath: -2,
      attackAngle: -1,
    });

    const context = buildGeminiCoachingContext(report);

    expect(context.systemTag).toBe('coachx-deterministic-v1');
    expect(context.deterministicReport.analysis.shotShape).toBe(report.analysis.shotShape);
    expect(context.promptSeed).toContain('Use the deterministic report below as fixed truth.');
    expect(context.promptSeed).toContain('Priority Coaching Focus');
  });
});
