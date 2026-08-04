import { describe, it, expect } from 'vitest';
import { __testing__, detectFaults } from '../services/faultDetectionService';
import type {
  SwingAnalysis,
  SwingEvent,
  SwingEventName,
  SwingSummary,
} from '../types/swingAnalysis';

const {
  detectEarlyExtension,
  detectHeadSway,
  detectSpineLoss,
  detectWeakXFactor,
  detectOverSwing,
  detectTempoIssue,
  detectPlaneIssue,
  detectKneeFlexIssue,
  detectClubPathIssue,
} = __testing__;

function event(name: SwingEventName, metrics: Record<string, number>): SwingEvent {
  return { name, frameIndex: 0, t: 0, metrics };
}

type PartialCtx = {
  summary?: Partial<SwingSummary>;
  events?: Partial<Record<SwingEventName, SwingEvent>>;
};

function ctx({ summary = {}, events = {} }: PartialCtx = {}) {
  return {
    events,
    summary: { cameraView: 'face_on', ...summary } as SwingSummary,
  };
}

describe('detectEarlyExtension', () => {
  it('undefined below the 40mm threshold', () => {
    expect(detectEarlyExtension(ctx({ events: { impact: event('impact', { earlyExtensionMm: 39 }) } }))).toBeUndefined();
  });
  it('minor between 40 and 80mm', () => {
    const f = detectEarlyExtension(ctx({ events: { impact: event('impact', { earlyExtensionMm: 60 }) } }));
    expect(f?.severity).toBe('minor');
    expect(f?.id).toBe('early_extension');
  });
  it('major at or above 80mm', () => {
    const f = detectEarlyExtension(ctx({ events: { impact: event('impact', { earlyExtensionMm: 95 }) } }));
    expect(f?.severity).toBe('major');
  });
  it('undefined when metric missing', () => {
    expect(detectEarlyExtension(ctx({ events: { impact: event('impact', {}) } }))).toBeUndefined();
    expect(detectEarlyExtension(ctx())).toBeUndefined();
  });
});

describe('detectHeadSway', () => {
  it('minor between 50 and 100mm', () => {
    expect(detectHeadSway(ctx({ events: { impact: event('impact', { headSwayMm: 70 }) } }))?.severity).toBe('minor');
  });
  it('major ≥100mm', () => {
    expect(detectHeadSway(ctx({ events: { impact: event('impact', { headSwayMm: 100 }) } }))?.severity).toBe('major');
  });
  it('undefined below 50mm', () => {
    expect(detectHeadSway(ctx({ events: { impact: event('impact', { headSwayMm: 30 }) } }))).toBeUndefined();
  });
});

describe('detectSpineLoss', () => {
  it('minor for absolute delta 8–15°', () => {
    expect(detectSpineLoss(ctx({ events: { impact: event('impact', { spineTiltDelta: -10 }) } }))?.severity).toBe('minor');
  });
  it('major for absolute delta ≥15°', () => {
    expect(detectSpineLoss(ctx({ events: { impact: event('impact', { spineTiltDelta: 17 }) } }))?.severity).toBe('major');
  });
  it('undefined for absolute delta <8°', () => {
    expect(detectSpineLoss(ctx({ events: { impact: event('impact', { spineTiltDelta: 5 }) } }))).toBeUndefined();
  });
});

describe('detectWeakXFactor', () => {
  it('minor when |hipShoulderSeparation@top| <30°', () => {
    const f = detectWeakXFactor(ctx({ events: { top: event('top', { hipShoulderSeparation: 25 }) } }));
    expect(f?.severity).toBe('minor');
    expect(f?.id).toBe('weak_x_factor');
  });
  it('undefined when separation ≥30°', () => {
    expect(detectWeakXFactor(ctx({ events: { top: event('top', { hipShoulderSeparation: 35 }) } }))).toBeUndefined();
  });
});

describe('detectOverSwing', () => {
  it('minor 115–130° shoulder rotation at top', () => {
    expect(detectOverSwing(ctx({ events: { top: event('top', { shoulderRotation: 120 }) } }))?.severity).toBe('minor');
  });
  it('major ≥130°', () => {
    expect(detectOverSwing(ctx({ events: { top: event('top', { shoulderRotation: -140 }) } }))?.severity).toBe('major');
  });
  it('undefined below 115°', () => {
    expect(detectOverSwing(ctx({ events: { top: event('top', { shoulderRotation: 100 }) } }))).toBeUndefined();
  });
});

describe('detectTempoIssue', () => {
  it('quick_tempo when ratio <2.2', () => {
    const f = detectTempoIssue(ctx({ summary: { tempoRatio: 1.8 } }));
    expect(f?.id).toBe('quick_tempo');
    expect(f?.severity).toBe('minor');
  });
  it('slow_tempo when ratio >3.8', () => {
    const f = detectTempoIssue(ctx({ summary: { tempoRatio: 4.6 } }));
    expect(f?.id).toBe('slow_tempo');
    expect(f?.severity).toBe('major');
  });
  it('undefined within 2.2–3.8', () => {
    expect(detectTempoIssue(ctx({ summary: { tempoRatio: 3.0 } }))).toBeUndefined();
  });
});

describe('detectPlaneIssue', () => {
  it('flat when plane <40°', () => {
    const f = detectPlaneIssue(ctx({ summary: { swingPlaneAngle: 28 } }));
    expect(f?.id).toBe('off_plane_flat');
  });
  it('steep when plane >70°', () => {
    const f = detectPlaneIssue(ctx({ summary: { swingPlaneAngle: 82 } }));
    expect(f?.id).toBe('off_plane_steep');
    expect(f?.severity).toBe('major');
  });
  it('prefers corrected plane over raw', () => {
    const f = detectPlaneIssue(ctx({ summary: { swingPlaneAngle: 50, swingPlaneAngleCorrected: 30 } }));
    expect(f?.id).toBe('off_plane_flat');
  });
});

describe('detectKneeFlexIssue', () => {
  it('address_over_extension when knee flex >175°', () => {
    const f = detectKneeFlexIssue(ctx({ events: { address: event('address', { kneeFlex: 178 }) } }));
    expect(f?.id).toBe('address_over_extension');
  });
  it('poor_knee_flex when knee flex <140° but ≥90°', () => {
    const f = detectKneeFlexIssue(ctx({ events: { address: event('address', { kneeFlex: 120 }) } }));
    expect(f?.id).toBe('poor_knee_flex');
  });
  it('undefined for normal range', () => {
    expect(detectKneeFlexIssue(ctx({ events: { address: event('address', { kneeFlex: 160 }) } }))).toBeUndefined();
  });
});

describe('detectClubPathIssue', () => {
  it('out_to_in when path negative and |path| ≥8°', () => {
    const f = detectClubPathIssue(ctx({ summary: { clubPathAtImpactDeg: -10 } }));
    expect(f?.id).toBe('excessive_out_to_in');
    expect(f?.severity).toBe('minor');
  });
  it('in_to_out major when path ≥+12°', () => {
    const f = detectClubPathIssue(ctx({ summary: { clubPathAtImpactDeg: 15 } }));
    expect(f?.id).toBe('excessive_in_to_out');
    expect(f?.severity).toBe('major');
  });
  it('undefined within ±8°', () => {
    expect(detectClubPathIssue(ctx({ summary: { clubPathAtImpactDeg: 5 } }))).toBeUndefined();
  });
});

describe('detectFaults', () => {
  it('runs every rule and returns majors first', () => {
    const analysis: SwingAnalysis = {
      videoUrl: 'test',
      frames: [],
      sampledFps: 30,
      events: {
        address: event('address', { kneeFlex: 178 }),
        top: event('top', { hipShoulderSeparation: 22, shoulderRotation: 100 }),
        impact: event('impact', {
          earlyExtensionMm: 95, // major
          headSwayMm: 70, // minor
          spineTiltDelta: 5,
        }),
      },
      warnings: [],
      summary: {
        cameraView: 'face_on',
        tempoRatio: 4.0, // minor
      },
    };
    const faults = detectFaults(analysis);
    const ids = faults.map((f) => f.id);
    expect(ids).toContain('early_extension');
    expect(ids).toContain('head_sway');
    expect(ids).toContain('slow_tempo');
    expect(ids).toContain('weak_x_factor');
    expect(ids).toContain('address_over_extension');
    // Major first.
    expect(faults[0].severity).toBe('major');
    expect(faults[0].id).toBe('early_extension');
  });

  it('returns empty array for a clean swing', () => {
    const analysis: SwingAnalysis = {
      videoUrl: 'test',
      frames: [],
      sampledFps: 30,
      events: {
        address: event('address', { kneeFlex: 160 }),
        top: event('top', { hipShoulderSeparation: 45, shoulderRotation: 95 }),
        impact: event('impact', {
          earlyExtensionMm: 20,
          headSwayMm: 20,
          spineTiltDelta: 2,
        }),
      },
      warnings: [],
      summary: {
        cameraView: 'face_on',
        tempoRatio: 3.0,
        swingPlaneAngle: 55,
        clubPathAtImpactDeg: 2,
      },
    };
    expect(detectFaults(analysis)).toEqual([]);
  });
});
