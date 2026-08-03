import { describe, it, expect } from 'vitest';
import { __testing__ } from '../services/swingAnalysisService';
import type { SwingFrame } from '../types/swingAnalysis';
import type { SkeletonKeypoint } from '../types/postureAnalysis';

const {
  smooth,
  derivative,
  angle3D,
  angleBetween,
  detectCameraView,
  detectHandedness,
  computeAttackAngle,
  computeSwingPlaneAngle,
  estimateGravityFromAddress,
} = __testing__;

type PointMap = Record<number, { x: number; y: number; z: number }>;

function keypointFor(idx: number, world: PointMap): SkeletonKeypoint {
  const p = world[idx];
  return p
    ? { x: p.x, y: p.y, z: p.z, confidence: 1, name: `p${idx}` }
    : { x: 0, y: 0, z: 0, confidence: 0, name: `p${idx}` };
}

function makeFrame(t: number, world: PointMap): SwingFrame {
  const keypoints: SkeletonKeypoint[] = [];
  const worldKeypoints: SkeletonKeypoint[] = [];
  for (let i = 0; i < 33; i++) {
    const kp = keypointFor(i, world);
    keypoints.push(kp);
    worldKeypoints.push({ ...kp });
  }
  return { t, keypoints, worldKeypoints, angles: {}, confidence: 1 };
}

describe('smooth', () => {
  it('computes rolling mean and preserves gaps as NaN', () => {
    const out = smooth([1, 2, NaN, 4, 5], 1);
    // Window at i=2: samples [2, NaN, 4] → mean of valid values [2, 4] = 3
    expect(out[2]).toBe(3);
    expect(out[0]).toBeCloseTo((1 + 2) / 2);
    expect(out[4]).toBeCloseTo((4 + 5) / 2);
  });

  it('returns NaN when window has no valid samples', () => {
    const out = smooth([NaN, NaN, NaN], 0);
    expect(out.every(Number.isNaN)).toBe(true);
  });

  it('handles halfWindow=0 as identity for finite values', () => {
    expect(smooth([1, 2, 3], 0)).toEqual([1, 2, 3]);
  });
});

describe('derivative', () => {
  it('computes forward differences and preserves first NaN', () => {
    const out = derivative([0, 1, 3, 6], 1);
    expect(Number.isNaN(out[0])).toBe(true);
    expect(out[1]).toBe(1);
    expect(out[2]).toBe(2);
    expect(out[3]).toBe(3);
  });

  it('propagates NaN across gaps without pretending to know velocity', () => {
    const out = derivative([0, NaN, 2, 3], 1);
    expect(Number.isNaN(out[1])).toBe(true);
    expect(Number.isNaN(out[2])).toBe(true);
    expect(out[3]).toBe(1);
  });
});

describe('angle3D', () => {
  it('90° for perpendicular arms', () => {
    const a = { x: 1, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    const c = { x: 0, y: 1, z: 0 };
    expect(angle3D(a, b, c)).toBeCloseTo(90, 4);
  });

  it('180° for a straight line through vertex', () => {
    const a = { x: 1, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    const c = { x: -1, y: 0, z: 0 };
    expect(angle3D(a, b, c)).toBeCloseTo(180, 4);
  });

  it('NaN when a limb has zero length', () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    const c = { x: 1, y: 0, z: 0 };
    expect(Number.isNaN(angle3D(a, b, c))).toBe(true);
  });
});

describe('detectCameraView', () => {
  it('face_on when shoulders span the X axis', () => {
    const frames = [
      makeFrame(0, { 11: { x: -0.25, y: 0, z: 0 }, 12: { x: 0.25, y: 0, z: 0 } }),
    ];
    expect(detectCameraView(frames)).toBe('face_on');
  });

  it('down_the_line when shoulders span the Z axis', () => {
    const frames = [
      makeFrame(0, { 11: { x: 0, y: 0, z: -0.25 }, 12: { x: 0, y: 0, z: 0.25 } }),
    ];
    expect(detectCameraView(frames)).toBe('down_the_line');
  });

  it('unknown for a ~45° diagonal', () => {
    const frames = [
      makeFrame(0, { 11: { x: -0.2, y: 0, z: -0.2 }, 12: { x: 0.2, y: 0, z: 0.2 } }),
    ];
    expect(detectCameraView(frames)).toBe('unknown');
  });

  it('unknown when landmarks are missing', () => {
    expect(detectCameraView([makeFrame(0, {})])).toBe('unknown');
  });
});

describe('detectHandedness', () => {
  // Landmarks: shoulders 11/12, elbows 13/14, wrists 15/16.
  it('right-handed when left arm is more extended at Top', () => {
    // Left arm straight (shoulder-elbow-wrist on X axis) → angle ≈ 180°.
    // Right arm bent 90°.
    const frame = makeFrame(0, {
      11: { x: 0, y: 0, z: 0 },
      13: { x: 0.3, y: 0, z: 0 },
      15: { x: 0.6, y: 0, z: 0 },
      12: { x: 0, y: 0, z: 0 },
      14: { x: 0, y: -0.3, z: 0 },
      16: { x: 0.3, y: -0.3, z: 0 },
    });
    expect(detectHandedness([frame], 0)).toBe('right');
  });

  it('left-handed when right arm is more extended at Top', () => {
    const frame = makeFrame(0, {
      12: { x: 0, y: 0, z: 0 },
      14: { x: -0.3, y: 0, z: 0 },
      16: { x: -0.6, y: 0, z: 0 },
      11: { x: 0, y: 0, z: 0 },
      13: { x: 0, y: -0.3, z: 0 },
      15: { x: -0.3, y: -0.3, z: 0 },
    });
    expect(detectHandedness([frame], 0)).toBe('left');
  });

  it('unknown when both arms have similar extension', () => {
    // Both arms bent to the same angle.
    const frame = makeFrame(0, {
      11: { x: 0, y: 0, z: 0 },
      13: { x: 0.3, y: 0, z: 0 },
      15: { x: 0.3, y: -0.1, z: 0 },
      12: { x: 0, y: 0, z: 0 },
      14: { x: -0.3, y: 0, z: 0 },
      16: { x: -0.3, y: -0.1, z: 0 },
    });
    expect(detectHandedness([frame], 0)).toBe('unknown');
  });
});

describe('computeAttackAngle', () => {
  it('positive for an ascending wrist path (rising = -y in world coords)', () => {
    const frames = [
      makeFrame(0.0, { 15: { x: 0, y: 0.05, z: 0 } }),
      makeFrame(0.03, { 15: { x: 0.1, y: 0, z: 0 } }),
      makeFrame(0.06, { 15: { x: 0.2, y: -0.05, z: 0 } }),
    ];
    const a = computeAttackAngle(frames, 1, 'right');
    expect(a).toBeGreaterThan(0);
  });

  it('negative for a descending wrist path', () => {
    const frames = [
      makeFrame(0.0, { 15: { x: 0, y: -0.05, z: 0 } }),
      makeFrame(0.03, { 15: { x: 0.1, y: 0, z: 0 } }),
      makeFrame(0.06, { 15: { x: 0.2, y: 0.05, z: 0 } }),
    ];
    const a = computeAttackAngle(frames, 1, 'right');
    expect(a).toBeLessThan(0);
  });

  it('uses the right wrist for a left-handed player', () => {
    const frames = [
      makeFrame(0.0, { 15: { x: 0, y: 0, z: 0 }, 16: { x: 0, y: 0.05, z: 0 } }),
      makeFrame(0.03, { 15: { x: 0, y: 0, z: 0 }, 16: { x: 0.1, y: 0, z: 0 } }),
      makeFrame(0.06, { 15: { x: 0, y: 0, z: 0 }, 16: { x: 0.2, y: -0.05, z: 0 } }),
    ];
    const a = computeAttackAngle(frames, 1, 'left');
    expect(a).toBeGreaterThan(0);
  });

  it('returns undefined at the boundary of the timeline', () => {
    const frames = [
      makeFrame(0, { 15: { x: 0, y: 0, z: 0 } }),
      makeFrame(0.03, { 15: { x: 0, y: 0, z: 0 } }),
    ];
    expect(computeAttackAngle(frames, 0, 'right')).toBeUndefined();
    expect(computeAttackAngle(frames, 1, 'right')).toBeUndefined();
  });
});

describe('estimateGravityFromAddress', () => {
  // Landmarks: hips 23/24, ankles 27/28. "Up" ≈ hipCenter − ankleCenter.

  it('recovers vertical up when the golfer stands upright (level camera)', () => {
    // MediaPipe world Y is +down; hips above ankles → hip.y < ankle.y → up.y < 0.
    const frame = makeFrame(0, {
      23: { x: -0.1, y: -0.5, z: 0 },
      24: { x: 0.1, y: -0.5, z: 0 },
      27: { x: -0.1, y: 0.5, z: 0 },
      28: { x: 0.1, y: 0.5, z: 0 },
    });
    const g = estimateGravityFromAddress([frame], 0, 1);
    expect(g).toBeDefined();
    expect(g!.x).toBeCloseTo(0, 4);
    expect(g!.y).toBeCloseTo(-1, 4);
    expect(g!.z).toBeCloseTo(0, 4);
  });

  it('recovers a tilted up vector when the camera is rolled', () => {
    // Camera rolled ~30° right → hips shift toward +x relative to ankles.
    const frame = makeFrame(0, {
      23: { x: 0.4, y: -0.5, z: 0 },
      24: { x: 0.6, y: -0.5, z: 0 },
      27: { x: -0.1, y: 0.5, z: 0 },
      28: { x: 0.1, y: 0.5, z: 0 },
    });
    const g = estimateGravityFromAddress([frame], 0, 1);
    expect(g).toBeDefined();
    expect(g!.x).toBeGreaterThan(0);
    expect(g!.y).toBeLessThan(0);
    // Unit vector.
    expect(Math.hypot(g!.x, g!.y, g!.z)).toBeCloseTo(1, 4);
  });

  it('undefined when required landmarks are missing across the window', () => {
    expect(estimateGravityFromAddress([makeFrame(0, {})], 0, 1)).toBeUndefined();
  });
});

describe('angleBetween', () => {
  it('0° for parallel vectors', () => {
    expect(angleBetween({ x: 0, y: -1, z: 0 }, { x: 0, y: -1, z: 0 })).toBeCloseTo(0, 4);
  });
  it('180° for opposite vectors', () => {
    expect(angleBetween({ x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 })).toBeCloseTo(180, 4);
  });
  it('90° for perpendicular vectors', () => {
    expect(angleBetween({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBeCloseTo(90, 4);
  });
});

describe('computeSwingPlaneAngle', () => {
  it('~0° for a wrist arc lying in the horizontal plane', () => {
    // Three non-collinear points on the ground plane (y=0) → plane == ground.
    const frames = [
      makeFrame(0, { 15: { x: -0.3, y: 0, z: -0.2 } }),
      makeFrame(0.1, { 15: { x: 0, y: 0, z: 0.3 } }),
      makeFrame(0.2, { 15: { x: 0.3, y: 0, z: -0.2 } }),
    ];
    const angle = computeSwingPlaneAngle(frames, 0, 2, 'right');
    expect(angle).toBeCloseTo(0, 0);
  });

  it('~90° for a wrist arc lying in a vertical plane', () => {
    // Three non-collinear points in the x-y plane (z=0) → plane is vertical.
    const frames = [
      makeFrame(0, { 15: { x: -0.3, y: -0.4, z: 0 } }),
      makeFrame(0.1, { 15: { x: 0, y: 0, z: 0 } }),
      makeFrame(0.2, { 15: { x: 0.3, y: -0.4, z: 0 } }),
    ];
    const angle = computeSwingPlaneAngle(frames, 0, 2, 'right');
    expect(angle).toBeCloseTo(90, 0);
  });

  it('undefined for a degenerate (collinear) arc', () => {
    const frames = [
      makeFrame(0, { 15: { x: 0, y: 0, z: 0 } }),
      makeFrame(0.1, { 15: { x: 0.1, y: 0, z: 0 } }),
      makeFrame(0.2, { 15: { x: 0.2, y: 0, z: 0 } }),
    ];
    expect(computeSwingPlaneAngle(frames, 0, 2, 'right')).toBeUndefined();
  });
});
