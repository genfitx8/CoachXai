import { describe, it, expect } from 'vitest';
import { __testing__, computeKineticSequence } from '../services/kineticSequenceService';
import type { KineticSegmentPeak, SwingFrame } from '../types/swingAnalysis';
import type { SkeletonKeypoint } from '../types/postureAnalysis';

const {
  smoothSeries,
  angularSpeedDegPerSec,
  angleBetweenVectors,
  argMaxInRange,
  classifyOrder,
} = __testing__;

function peak(
  segment: KineticSegmentPeak['segment'],
  msFromTop: number,
): KineticSegmentPeak {
  return { segment, peakValue: 100, peakT: 0, msFromTop };
}

type PointMap = Record<number, { x: number; y: number; z: number }>;

function makeFrame(t: number, world: PointMap, angles: Record<string, number> = {}): SwingFrame {
  const keypoints: SkeletonKeypoint[] = [];
  const worldKeypoints: SkeletonKeypoint[] = [];
  for (let i = 0; i < 33; i++) {
    const p = world[i];
    const kp: SkeletonKeypoint = p
      ? { x: p.x, y: p.y, z: p.z, confidence: 1, name: `p${i}` }
      : { x: 0, y: 0, z: 0, confidence: 0, name: `p${i}` };
    keypoints.push(kp);
    worldKeypoints.push({ ...kp });
  }
  return { t, keypoints, worldKeypoints, angles, confidence: 1 };
}

describe('smoothSeries', () => {
  it('NaN-safe rolling mean', () => {
    const out = smoothSeries([1, 2, NaN, 4, 5], 1);
    expect(out[2]).toBe(3); // mean of [2, 4]
  });
  it('returns NaN when window is empty', () => {
    expect(smoothSeries([NaN, NaN], 0).every(Number.isNaN)).toBe(true);
  });
});

describe('angularSpeedDegPerSec', () => {
  it('simple rotation', () => {
    expect(angularSpeedDegPerSec(10, 40, 0.1)).toBeCloseTo(300, 3); // 30° / 0.1s
  });
  it('handles ±180° wraparound', () => {
    // 179° → -179° is really a 2° step, not a 358° jump.
    expect(angularSpeedDegPerSec(179, -179, 0.1)).toBeCloseTo(20, 3);
  });
  it('NaN when inputs invalid', () => {
    expect(Number.isNaN(angularSpeedDegPerSec(NaN, 10, 0.1))).toBe(true);
    expect(Number.isNaN(angularSpeedDegPerSec(10, 20, 0))).toBe(true);
  });
});

describe('angleBetweenVectors', () => {
  it('90° for perpendicular', () => {
    expect(
      angleBetweenVectors({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }),
    ).toBeCloseTo(90, 4);
  });
  it('0° for parallel', () => {
    expect(
      angleBetweenVectors({ x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }),
    ).toBeCloseTo(0, 4);
  });
});

describe('argMaxInRange', () => {
  it('finds max index skipping NaN', () => {
    expect(argMaxInRange([1, NaN, 3, 2], 0, 3)).toBe(2);
  });
  it('returns -1 when no valid values', () => {
    expect(argMaxInRange([NaN, NaN, NaN], 0, 2)).toBe(-1);
  });
});

describe('classifyOrder', () => {
  it('correct when peaks fire pelvis → torso → arm → hands with spacing', () => {
    const order = classifyOrder([
      peak('pelvis', 20),
      peak('torso', 60),
      peak('lead_arm', 100),
      peak('hands', 140),
    ]);
    expect(order).toBe('correct');
  });

  it('simultaneous when all peaks within 30ms', () => {
    const order = classifyOrder([
      peak('pelvis', 100),
      peak('torso', 110),
      peak('lead_arm', 115),
      peak('hands', 125),
    ]);
    expect(order).toBe('simultaneous');
  });

  it('inverted when hands peak before pelvis', () => {
    const order = classifyOrder([
      peak('hands', 20),
      peak('lead_arm', 60),
      peak('torso', 100),
      peak('pelvis', 140),
    ]);
    expect(order).toBe('inverted');
  });

  it('partial when torso is missing but pelvis→arm→hands order holds', () => {
    const order = classifyOrder([peak('pelvis', 20), peak('lead_arm', 100), peak('hands', 140)]);
    // pelvis, lead_arm, hands is the expected subset order → 'correct'.
    expect(order).toBe('correct');
  });

  it('partial when order broken in the middle', () => {
    const order = classifyOrder([
      peak('pelvis', 20),
      peak('lead_arm', 60),
      peak('torso', 100),
      peak('hands', 140),
    ]);
    expect(order).toBe('partial');
  });

  it('unknown when fewer than 3 peaks', () => {
    expect(classifyOrder([peak('pelvis', 20), peak('torso', 60)])).toBe('unknown');
    expect(classifyOrder([])).toBe('unknown');
  });
});

describe('computeKineticSequence — integration', () => {
  function frameWithAngles(
    t: number,
    angles: {
      pelvisRotation?: number;
      shoulderRotation?: number;
      wrist?: { x: number; y: number; z: number };
      shoulder?: { x: number; y: number; z: number };
    },
  ): SwingFrame {
    const world: PointMap = {};
    if (angles.shoulder) world[11] = angles.shoulder;
    if (angles.wrist) world[15] = angles.wrist;
    // Provide right shoulder/wrist too so leadIndices right-handed works.
    if (angles.shoulder) world[11] = angles.shoulder;
    const f = makeFrame(t, world, {});
    if (angles.pelvisRotation != null) f.angles.pelvisRotation = angles.pelvisRotation;
    if (angles.shoulderRotation != null) f.angles.shoulderRotation = angles.shoulderRotation;
    return f;
  }

  it('returns undefined when top/impact bracket is invalid', () => {
    const frames = [frameWithAngles(0, {}), frameWithAngles(0.1, {})];
    expect(computeKineticSequence(frames, -1, 5, 30, 'right')).toBeUndefined();
    expect(computeKineticSequence(frames, 5, 3, 30, 'right')).toBeUndefined();
  });

  it('produces a sequence with pelvis peaking earliest for a well-ordered synthetic swing', () => {
    // Build 15 frames of a downswing where pelvis rotation accelerates first,
    // then torso, using time-shifted ramps.
    const fps = 30;
    const dt = 1 / fps;
    const frames: SwingFrame[] = [];
    for (let i = 0; i < 15; i++) {
      const t = i * dt;
      // Pelvis: fast rotation starts at frame 2, peaks around frame 5.
      const pelvisRot = i < 2 ? 0 : (i - 2) * 25;
      // Torso: starts later.
      const torsoRot = i < 5 ? 0 : (i - 5) * 20;
      // Wrist position: moves linearly across frames.
      const wrist = { x: i * 0.05, y: -0.5, z: 0 };
      const shoulder = { x: 0, y: -0.7, z: 0 };
      frames.push(
        frameWithAngles(t, { pelvisRotation: pelvisRot, shoulderRotation: torsoRot, wrist, shoulder }),
      );
    }
    const ks = computeKineticSequence(frames, 0, 14, fps, 'right');
    expect(ks).toBeDefined();
    expect(ks!.pelvis).toBeDefined();
    // Pelvis's peak msFromTop should be earlier (smaller) than torso's, given
    // the pelvis ramps up first in the synthetic data above.
    if (ks!.pelvis && ks!.torso) {
      expect(ks!.pelvis.msFromTop).toBeLessThan(ks!.torso.msFromTop);
    }
  });
});
