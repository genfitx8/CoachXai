import { describe, it, expect } from 'vitest';
import { __testing__ } from '../services/clubHeadTrackingService';
import type { SwingFrame } from '../types/swingAnalysis';
import type { SkeletonKeypoint } from '../types/postureAnalysis';

const {
  geometricImpactDetector,
  computeClubHeadSpeedKmh,
  computeClubPathAngle,
  CLUB_LENGTHS_M,
} = __testing__;

type PointMap = Record<number, { x: number; y: number; z: number }>;

function makeFrame(t: number, world: PointMap): SwingFrame {
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
  return { t, keypoints, worldKeypoints, angles: {}, confidence: 1 };
}

describe('geometricImpactDetector.detectAt', () => {
  it('extends the lead-shoulder→grip vector by the club length', () => {
    // Right-handed: lead = left side. Landmarks 11=leftShoulder, 15=leftWrist,
    // 16=rightWrist. Shoulder → grip vector = (0, 0.9, 0).
    const frame = makeFrame(0, {
      11: { x: 0, y: -0.5, z: 0 },
      15: { x: 0, y: 0.4, z: 0 },
      16: { x: 0, y: 0.4, z: 0 },
    });
    const head = geometricImpactDetector.detectAt([frame], 0, { handedness: 'right' });
    expect(head).toBeDefined();
    // Expected head y = grip.y (0.4) + unit.y (1) * driverLen (1.15) = 1.55
    expect(head!.y).toBeCloseTo(0.4 + CLUB_LENGTHS_M.driver, 3);
    expect(head!.x).toBeCloseTo(0, 3);
    expect(head!.z).toBeCloseTo(0, 3);
    expect(head!.method).toBe('geometric');
  });

  it('uses the right side for a left-handed player', () => {
    const frame = makeFrame(0, {
      12: { x: 0, y: -0.5, z: 0 },
      15: { x: 0, y: 0.4, z: 0 },
      16: { x: 0, y: 0.4, z: 0 },
    });
    const head = geometricImpactDetector.detectAt([frame], 0, { handedness: 'left' });
    expect(head).toBeDefined();
    expect(head!.y).toBeCloseTo(0.4 + CLUB_LENGTHS_M.driver, 3);
  });

  it('respects the club type when computing extension length', () => {
    const frame = makeFrame(0, {
      11: { x: 0, y: -0.5, z: 0 },
      15: { x: 0, y: 0.4, z: 0 },
      16: { x: 0, y: 0.4, z: 0 },
    });
    const wedge = geometricImpactDetector.detectAt([frame], 0, {
      handedness: 'right',
      club: 'wedge',
    });
    expect(wedge!.y).toBeCloseTo(0.4 + CLUB_LENGTHS_M.wedge, 3);
    expect(wedge!.y).toBeLessThan(0.4 + CLUB_LENGTHS_M.driver);
  });

  it('returns undefined when required landmarks are missing', () => {
    const frame = makeFrame(0, {});
    expect(geometricImpactDetector.detectAt([frame], 0, { handedness: 'right' })).toBeUndefined();
  });

  it('clamps the 2D marker inside [0, 1]', () => {
    // Valid 3D geometry so the detector returns a head, but overridden 2D
    // keypoints land the extrapolated marker off-screen → clamp saves it.
    const frame = makeFrame(0, {
      11: { x: 0, y: -0.5, z: 0 },
      15: { x: 0, y: 0.4, z: 0 },
      16: { x: 0, y: 0.4, z: 0 },
    });
    frame.keypoints[11] = { x: 0.7, y: 0.7, z: 0, confidence: 1, name: 'p11' };
    frame.keypoints[15] = { x: 0.9, y: 0.9, z: 0, confidence: 1, name: 'p15' };
    const head = geometricImpactDetector.detectAt([frame], 0, { handedness: 'right' });
    expect(head).toBeDefined();
    expect(head!.x2d).toBeGreaterThanOrEqual(0);
    expect(head!.x2d).toBeLessThanOrEqual(1);
    expect(head!.y2d).toBeGreaterThanOrEqual(0);
    expect(head!.y2d).toBeLessThanOrEqual(1);
  });
});

describe('computeClubHeadSpeedKmh', () => {
  it('converts 3D velocity to km/h correctly', () => {
    // Head at impact-1 vs impact+1 differs by 0.1 m over 0.1 s → 1 m/s = 3.6 km/h.
    const frames = [
      makeFrame(0.0, {
        11: { x: 0, y: -0.5, z: 0 },
        15: { x: 0, y: 0.4, z: 0 },
        16: { x: 0, y: 0.4, z: 0 },
      }),
      makeFrame(0.05, {
        11: { x: 0.05, y: -0.5, z: 0 },
        15: { x: 0.05, y: 0.4, z: 0 },
        16: { x: 0.05, y: 0.4, z: 0 },
      }),
      makeFrame(0.1, {
        11: { x: 0.1, y: -0.5, z: 0 },
        15: { x: 0.1, y: 0.4, z: 0 },
        16: { x: 0.1, y: 0.4, z: 0 },
      }),
    ];
    const kmh = computeClubHeadSpeedKmh(frames, 1, { handedness: 'right' });
    expect(kmh).toBeCloseTo(3.6, 1);
  });

  it('rejects impossibly large speeds as noise', () => {
    const frames = [
      makeFrame(0, {
        11: { x: 0, y: -0.5, z: 0 },
        15: { x: 0, y: 0.4, z: 0 },
        16: { x: 0, y: 0.4, z: 0 },
      }),
      makeFrame(0.001, {
        11: { x: 0, y: -0.5, z: 0 },
        15: { x: 0, y: 0.4, z: 0 },
        16: { x: 0, y: 0.4, z: 0 },
      }),
      makeFrame(0.002, {
        // Head jumps 5m in 2ms → speed way above 400 km/h → reject.
        11: { x: 5, y: -0.5, z: 0 },
        15: { x: 5, y: 0.4, z: 0 },
        16: { x: 5, y: 0.4, z: 0 },
      }),
    ];
    expect(computeClubHeadSpeedKmh(frames, 1, { handedness: 'right' })).toBeUndefined();
  });

  it('returns undefined at timeline boundaries', () => {
    const frames = [
      makeFrame(0, {
        11: { x: 0, y: -0.5, z: 0 },
        15: { x: 0, y: 0.4, z: 0 },
        16: { x: 0, y: 0.4, z: 0 },
      }),
    ];
    expect(computeClubHeadSpeedKmh(frames, 0, { handedness: 'right' })).toBeUndefined();
  });
});

describe('computeClubPathAngle', () => {
  it('0° when head velocity aligns with the shoulder line', () => {
    // Address shoulders on the Z axis: trail(12) at z=-0.1, lead(11) at z=+0.1.
    // Head velocity from impact-1 to impact+1 also runs along +Z.
    const frames = [
      makeFrame(0, {
        11: { x: 0, y: -0.5, z: 0.1 },
        12: { x: 0, y: -0.5, z: -0.1 },
        15: { x: 0, y: 0.4, z: 0 },
        16: { x: 0, y: 0.4, z: 0 },
      }),
      // impact-1
      makeFrame(0.03, {
        11: { x: 0, y: -0.5, z: 0.05 },
        15: { x: 0, y: 0.4, z: 0.05 },
        16: { x: 0, y: 0.4, z: 0.05 },
      }),
      // impact
      makeFrame(0.06, {
        11: { x: 0, y: -0.5, z: 0.1 },
        15: { x: 0, y: 0.4, z: 0.1 },
        16: { x: 0, y: 0.4, z: 0.1 },
      }),
      // impact+1
      makeFrame(0.09, {
        11: { x: 0, y: -0.5, z: 0.15 },
        15: { x: 0, y: 0.4, z: 0.15 },
        16: { x: 0, y: 0.4, z: 0.15 },
      }),
    ];
    const angle = computeClubPathAngle(frames, 2, 0, { handedness: 'right' });
    expect(angle).toBeCloseTo(0, 0);
  });

  it('returns undefined when the address shoulder line is missing', () => {
    const frames = [
      makeFrame(0, {}), // no shoulder landmarks at address
      makeFrame(0.03, {
        11: { x: 0, y: -0.5, z: 0.05 },
        15: { x: 0, y: 0.4, z: 0.05 },
        16: { x: 0, y: 0.4, z: 0.05 },
      }),
      makeFrame(0.06, {
        11: { x: 0, y: -0.5, z: 0.1 },
        15: { x: 0, y: 0.4, z: 0.1 },
        16: { x: 0, y: 0.4, z: 0.1 },
      }),
      makeFrame(0.09, {
        11: { x: 0, y: -0.5, z: 0.15 },
        15: { x: 0, y: 0.4, z: 0.15 },
        16: { x: 0, y: 0.4, z: 0.15 },
      }),
    ];
    expect(computeClubPathAngle(frames, 2, 0, { handedness: 'right' })).toBeUndefined();
  });

  it('signed: perpendicular velocity gives ±90°', () => {
    // Address shoulder line on Z; head velocity on +X.
    const frames = [
      makeFrame(0, {
        11: { x: 0, y: -0.5, z: 0.1 },
        12: { x: 0, y: -0.5, z: -0.1 },
        15: { x: 0, y: 0.4, z: 0 },
        16: { x: 0, y: 0.4, z: 0 },
      }),
      makeFrame(0.03, {
        11: { x: -0.05, y: -0.5, z: 0 },
        15: { x: -0.05, y: 0.4, z: 0 },
        16: { x: -0.05, y: 0.4, z: 0 },
      }),
      makeFrame(0.06, {
        11: { x: 0, y: -0.5, z: 0 },
        15: { x: 0, y: 0.4, z: 0 },
        16: { x: 0, y: 0.4, z: 0 },
      }),
      makeFrame(0.09, {
        11: { x: 0.05, y: -0.5, z: 0 },
        15: { x: 0.05, y: 0.4, z: 0 },
        16: { x: 0.05, y: 0.4, z: 0 },
      }),
    ];
    const angle = computeClubPathAngle(frames, 2, 0, { handedness: 'right' });
    expect(angle).toBeDefined();
    expect(Math.abs(angle!)).toBeCloseTo(90, 0);
  });
});
