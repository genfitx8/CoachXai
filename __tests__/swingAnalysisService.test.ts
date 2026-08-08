import { describe, it, expect } from 'vitest';
import { __testing__, swingAnalysisService } from '../services/swingAnalysisService';
import type { SwingAnalysis, SwingFrame } from '../types/swingAnalysis';
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
  parabolicRefine,
  adaptiveSpeedThresholds,
  percentileFinite,
  segmentEvents,
  detectSwingIntervals,
  buildSummary,
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

describe('parabolicRefine', () => {
  it('finds the true peak of a synthetic parabola between samples', () => {
    // y = -(x - 2.3)^2 + 10 has its peak at x = 2.3.
    // Sample at x = 2, 3, 4 → y values 9.51, 9.51... wait let me recompute
    // y(2) = -0.09 + 10 = 9.91
    // y(3) = -0.49 + 10 = 9.51
    // y(4) = -2.89 + 10 = 7.11
    // Parabolic fit through (2, 9.91), (3, 9.51), (4, 7.11) → peak near x=2.3
    // With sampling at indices k-1=0, k=1, k+1=2 (mapping x=2→k=1), the
    // returned offset should be -0.7 (peak is left of the sampled k=1).
    const values = [9.91, 9.51, 7.11];
    const r = parabolicRefine(values, 1);
    expect(r).toBeDefined();
    expect(r!.offset).toBeCloseTo(-0.7, 1);
    expect(r!.refinedValue).toBeGreaterThan(9.91);
  });

  it('returns zero offset for a flat sample triple', () => {
    const r = parabolicRefine([5, 5, 5], 1);
    expect(r).toBeDefined();
    expect(r!.offset).toBe(0);
  });

  it('undefined at timeline edges', () => {
    expect(parabolicRefine([1, 2, 3], 0)).toBeUndefined();
    expect(parabolicRefine([1, 2, 3], 2)).toBeUndefined();
  });

  it('undefined when samples are non-finite', () => {
    expect(parabolicRefine([NaN, 1, 2], 1)).toBeUndefined();
    expect(parabolicRefine([1, 2, NaN], 1)).toBeUndefined();
  });

  it('linear ramp: flat-curve branch returns zero offset (no refinement possible)', () => {
    // Denominator 1 - 2·2 + 3 = 0 → the fit is degenerate; helper falls back
    // to offset 0 rather than returning ±∞.
    const r = parabolicRefine([1, 2, 3], 1);
    expect(r).toBeDefined();
    expect(r!.offset).toBe(0);
  });
});

describe('percentileFinite', () => {
  it('returns the given percentile ignoring NaN', () => {
    // 5 valid samples → rank at p=50 is index 2 = 3.
    expect(percentileFinite([1, 2, 3, 4, NaN, 5], 50, 999)).toBe(3);
    expect(percentileFinite([1, 2, 3, 4, 5], 0, 999)).toBe(1);
    expect(percentileFinite([1, 2, 3, 4, 5], 100, 999)).toBe(5);
  });
  it('falls back when fewer than 4 valid samples', () => {
    expect(percentileFinite([1, 2, NaN], 50, 42)).toBe(42);
    expect(percentileFinite([], 50, 7)).toBe(7);
  });
});

describe('adaptiveSpeedThresholds', () => {
  it('scales moving threshold with the peak of the distribution', () => {
    const slowSwing = [0.1, 0.1, 0.2, 0.3, 0.5, 1.0, 2.0, 3.0, 4.0, 2.0, 0.5, 0.2, 0.1];
    const fastSwing = slowSwing.map((v) => v * 3);
    const slow = adaptiveSpeedThresholds(slowSwing, true);
    const fast = adaptiveSpeedThresholds(fastSwing, true);
    expect(fast.moving).toBeGreaterThan(slow.moving);
    expect(fast.still).toBeGreaterThanOrEqual(slow.still);
  });
  it('enforces a floor so landmark flicker in a still clip is not called motion', () => {
    const stillClip = Array.from({ length: 30 }, () => 0.05 + Math.random() * 0.02);
    const t = adaptiveSpeedThresholds(stillClip, true);
    // Floor for is3D is 0.25 m/s; ensures a jittery still address isn't
    // classified as "moving".
    expect(t.still).toBeGreaterThanOrEqual(0.25);
    expect(t.moving).toBeGreaterThan(t.still);
  });
  it('always keeps moving strictly above still', () => {
    const uniform = Array.from({ length: 20 }, () => 0.5);
    const t = adaptiveSpeedThresholds(uniform, true);
    expect(t.moving).toBeGreaterThan(t.still);
  });
});

describe('segmentEvents — integration', () => {
  // Build a synthetic right-handed swing with a clear address, backswing,
  // top, downswing, impact, and finish. The pipeline should recover all
  // five events with plausible ordering (address < takeaway < top < impact
  // < finish) and physically-reasonable timing.
  function buildSyntheticSwing(fps: number): SwingFrame[] {
    const frames: SwingFrame[] = [];
    const dt = 1 / fps;
    // Segments in seconds: address 0.5, backswing 0.8, downswing 0.3,
    // follow-through 0.3, finish 0.4 → 2.3s total.
    const totalT = 2.3;
    const nFrames = Math.round(totalT * fps);
    for (let i = 0; i < nFrames; i++) {
      const t = i * dt;
      // Lead wrist (index 15) — Y sweeps from address (0) → top (−1.5) →
      // impact (+0.2) → finish (−0.4). X sweeps ±0.6 across the arc.
      let x: number, y: number;
      if (t < 0.5) {
        // Address: nearly static.
        x = 0;
        y = 0;
      } else if (t < 1.3) {
        // Backswing: rise to top over 0.8s.
        const u = (t - 0.5) / 0.8;
        x = -0.6 * u;
        y = -1.5 * u; // negative = higher in MediaPipe world coords
      } else if (t < 1.6) {
        // Downswing: from top back through ball (y = +0.2 at t=1.6). Use a
        // quadratic ease-in so speed peaks at impact (t=1.6), matching a
        // real swing's release / whip — otherwise the impact detector
        // picks an arbitrary frame in a constant-velocity slide.
        const u = (t - 1.3) / 0.3;
        const uu = u * u;
        x = -0.6 + 1.2 * uu; // −0.6 → +0.6
        y = -1.5 + 1.7 * uu; // −1.5 → +0.2
      } else if (t < 1.9) {
        // Follow-through: continue past the ball.
        const u = (t - 1.6) / 0.3;
        x = 0.6 - 0.3 * u;
        y = 0.2 - 0.6 * u; // rises to −0.4
      } else {
        // Finish: hold pose.
        x = 0.3;
        y = -0.4;
      }
      // Both wrists at the same spot (simplification — the track averages
      // them). Add shoulders (fixed at torso height y=-0.7), lower-body
      // landmarks (so `estimateGravityFromAddress` can recover "up"), and
      // asymmetric elbows so `detectHandedness` can identify the lead arm
      // — the physical arm-horizontal detection needs both.
      //
      // Right-handed pattern: left (lead) arm nearly straight so its elbow
      // sits on the shoulder-wrist line; right (trail) arm folds so its
      // elbow is pulled in toward the body.
      const shoulderL = { x: -0.2, y: -0.7, z: 0 };
      const shoulderR = { x: 0.2, y: -0.7, z: 0 };
      const wrist = { x, y, z: 0 };
      // Lead (left) elbow ~ midpoint of shoulder→wrist (straight arm).
      const elbowL = {
        x: (shoulderL.x + wrist.x) / 2,
        y: (shoulderL.y + wrist.y) / 2,
        z: 0,
      };
      // Trail (right) elbow closer to the body — bent.
      const elbowR = {
        x: shoulderR.x - 0.1,
        y: (shoulderR.y + wrist.y) / 2 - 0.05,
        z: 0,
      };
      const world: PointMap = {
        11: shoulderL,
        12: shoulderR,
        13: elbowL,
        14: elbowR,
        15: wrist,
        16: wrist,
        23: { x: -0.1, y: 0, z: 0 },
        24: { x: 0.1, y: 0, z: 0 },
        27: { x: -0.1, y: 0.9, z: 0 },
        28: { x: 0.1, y: 0.9, z: 0 },
      };
      frames.push(makeFrame(t, world));
    }
    return frames;
  }

  it('detects address / takeaway / top / impact / finish in order for a synthetic swing', () => {
    const fps = 60;
    const frames = buildSyntheticSwing(fps);
    const { events, warnings } = segmentEvents(frames, fps);

    expect(events.address).toBeDefined();
    expect(events.takeaway).toBeDefined();
    expect(events.top).toBeDefined();
    expect(events.impact).toBeDefined();
    expect(events.finish).toBeDefined();

    const a = events.address!.frameIndex;
    const tk = events.takeaway!.frameIndex;
    const tp = events.top!.frameIndex;
    const im = events.impact!.frameIndex;
    const fn = events.finish!.frameIndex;
    expect(a).toBeLessThan(tk);
    expect(tk).toBeLessThan(tp);
    expect(tp).toBeLessThan(im);
    expect(im).toBeLessThan(fn);

    // Backswing ≈ 800ms, downswing ≈ 300ms → both plausible → no sanity warns.
    const backswingMs = (tp - tk) * (1000 / fps);
    const downswingMs = (im - tp) * (1000 / fps);
    expect(backswingMs).toBeGreaterThan(200);
    expect(backswingMs).toBeLessThan(2500);
    expect(downswingMs).toBeGreaterThan(80);
    expect(downswingMs).toBeLessThan(800);
    // No sanity-timing warnings for a plausible synthetic swing.
    expect(warnings.some((w) => w.includes('이례적'))).toBe(false);
  });

  it('emits half_backswing / mid_downswing / follow_through between their parents', () => {
    const fps = 60;
    const frames = buildSyntheticSwing(fps);
    const { events } = segmentEvents(frames, fps);
    expect(events.half_backswing).toBeDefined();
    expect(events.mid_downswing).toBeDefined();
    expect(events.follow_through).toBeDefined();

    const a = events.address!.frameIndex;
    const tk = events.takeaway!.frameIndex;
    const hb = events.half_backswing!.frameIndex;
    const tp = events.top!.frameIndex;
    const md = events.mid_downswing!.frameIndex;
    const im = events.impact!.frameIndex;
    const ft = events.follow_through!.frameIndex;
    const fn = events.finish!.frameIndex;

    // Full 8-event ordering address ≤ takeaway < half < top < mid < impact
    // < follow < finish. The half markers sit strictly between their parents.
    expect(a).toBeLessThanOrEqual(tk);
    expect(tk).toBeLessThan(hb);
    expect(hb).toBeLessThan(tp);
    expect(tp).toBeLessThan(md);
    expect(md).toBeLessThan(im);
    expect(im).toBeLessThan(ft);
    expect(ft).toBeLessThan(fn);
  });

  it('half_backswing lands where the lead arm is horizontal (P3), within cm of shoulder height', () => {
    // Synthetic backswing sweeps the wrist from address (t=0.5, y=0) linearly
    // to top (t=1.3, y=-1.5). Shoulder Y = -0.7. Arm horizontal means the
    // lead wrist Y is within ~5cm of the lead shoulder Y — a much tighter
    // bound than the wristY-midpoint fallback would deliver. Achieving this
    // proves the lead-arm-only physical path is active (handedness
    // detected + gravity recovered).
    const fps = 60;
    const frames = buildSyntheticSwing(fps);
    const { events } = segmentEvents(frames, fps);
    const hb = events.half_backswing!;
    const w = frames[hb.frameIndex].worldKeypoints!;
    // Right-handed synthetic: lead is left arm (index 15 wrist, 11 shoulder).
    const leadWristY = w[15].y;
    const leadShoulderY = w[11].y;
    expect(Math.abs(leadWristY - leadShoulderY)).toBeLessThan(0.05);
  });

  it('mid_downswing lands where the lead arm is horizontal on the way down', () => {
    // Downswing crosses arm-horizontal on the way back down. The frame we
    // pick should have the lead wrist within cm of shoulder height, same
    // physical criterion as half_backswing.
    const fps = 60;
    const frames = buildSyntheticSwing(fps);
    const { events } = segmentEvents(frames, fps);
    const md = events.mid_downswing!;
    const w = frames[md.frameIndex].worldKeypoints!;
    const leadWristY = w[15].y;
    const leadShoulderY = w[11].y;
    expect(Math.abs(leadWristY - leadShoulderY)).toBeLessThan(0.15);
  });

  it('detectSwingIntervals finds the single swing in a clip with idle preamble', () => {
    // Build a 6s clip: 2s of idle preamble (waggle-ish micro-motion), then
    // a real swing (2.3s) starting at t=2s, then 1.7s of chatter afterward.
    const fps = 60;
    const dt = 1 / fps;
    const frames: SwingFrame[] = [];
    const totalT = 6.0;
    const nFrames = Math.round(totalT * fps);
    // Small helper that reuses the synthetic swing geometry starting at
    // absolute time `swingStart` and lasting 2.3s.
    const wristAt = (swingLocalT: number): { x: number; y: number } => {
      if (swingLocalT < 0 || swingLocalT >= 2.3) return { x: 0, y: 0 };
      if (swingLocalT < 0.5) return { x: 0, y: 0 };
      if (swingLocalT < 1.3) {
        const u = (swingLocalT - 0.5) / 0.8;
        return { x: -0.6 * u, y: -1.5 * u };
      }
      if (swingLocalT < 1.6) {
        const u = (swingLocalT - 1.3) / 0.3;
        return { x: -0.6 + 1.2 * u, y: -1.5 + 1.7 * u };
      }
      if (swingLocalT < 1.9) {
        const u = (swingLocalT - 1.6) / 0.3;
        return { x: 0.6 - 0.3 * u, y: 0.2 - 0.6 * u };
      }
      return { x: 0.3, y: -0.4 };
    };
    const swingStart = 2.0;
    for (let i = 0; i < nFrames; i++) {
      const t = i * dt;
      const { x, y } = wristAt(t - swingStart);
      // Idle preamble: tiny sinusoidal jitter (waggle), well below MOVING.
      const jitter = t < 1.9 ? 0.01 * Math.sin(t * 6) : 0;
      const world: PointMap = {
        11: { x: -0.2, y: -0.7, z: 0 },
        12: { x: 0.2, y: -0.7, z: 0 },
        15: { x: x + jitter, y, z: 0 },
        16: { x: x + jitter, y, z: 0 },
        23: { x: -0.1, y: 0, z: 0 },
        24: { x: 0.1, y: 0, z: 0 },
        27: { x: -0.1, y: 0.9, z: 0 },
        28: { x: 0.1, y: 0.9, z: 0 },
      };
      frames.push(makeFrame(t, world));
    }

    const intervals = detectSwingIntervals(frames, fps);
    expect(intervals.length).toBeGreaterThanOrEqual(1);
    const best = intervals[0];
    // Detected window brackets the real swing (2.0s – 4.3s) with modest slack.
    expect(best.startT).toBeGreaterThan(1.0);
    expect(best.startT).toBeLessThan(2.5);
    expect(best.endT).toBeGreaterThan(4.0);
    expect(best.endT).toBeLessThan(5.5);
    expect(best.confidence).toBeGreaterThan(0.3);
    // Peak sits near impact (t ≈ 3.5s, since impact is 1.5s into the swing
    // which started at 2.0s).
    expect(best.peakT).toBeGreaterThan(3.0);
    expect(best.peakT).toBeLessThan(4.0);
  });

  it('detectSwingIntervals returns empty when the clip has no swing', () => {
    // 3s of nothing but landmark jitter — no burst should register.
    const fps = 60;
    const dt = 1 / fps;
    const frames: SwingFrame[] = [];
    for (let i = 0; i < 180; i++) {
      const t = i * dt;
      const jitter = 0.005 * Math.sin(t * 7);
      const world: PointMap = {
        11: { x: -0.2, y: -0.7, z: 0 },
        12: { x: 0.2, y: -0.7, z: 0 },
        15: { x: jitter, y: 0, z: 0 },
        16: { x: jitter, y: 0, z: 0 },
        23: { x: -0.1, y: 0, z: 0 },
        24: { x: 0.1, y: 0, z: 0 },
        27: { x: -0.1, y: 0.9, z: 0 },
        28: { x: 0.1, y: 0.9, z: 0 },
      };
      frames.push(makeFrame(t, world));
    }
    const intervals = detectSwingIntervals(frames, fps);
    expect(intervals).toEqual([]);
  });

  it('warns and uses frame 0 as address when the clip starts mid-motion', () => {
    const fps = 60;
    const full = buildSyntheticSwing(fps);
    // Cut off the first 40 frames (~0.67s, past the 0.5s address hold) so
    // the clip starts partway into the backswing.
    const trimmed = full.slice(40).map((f, i) => ({ ...f, t: i / fps }));
    const { events, warnings } = segmentEvents(trimmed, fps);
    expect(events.address).toBeDefined();
    // Address falls back to a very early frame since no still window exists.
    expect(events.address!.frameIndex).toBeLessThan(5);
    // The pipeline warns the user rather than silently returning wrong events.
    expect(
      warnings.some((w) => w.includes('어드레스 이후에 시작') || w.includes('백스윙 시작')),
    ).toBe(true);
  });
});

describe('swingAnalysisService.rebuildAnalysis', () => {
  // Build a minimal SwingAnalysis by running segmentEvents on the synthetic
  // swing, then wrapping the result in the public shape. This is what
  // analyzeSwingFromVideo would produce in the browser, without needing a
  // real HTMLVideoElement in unit-test land.
  function buildSyntheticAnalysis(fps: number): SwingAnalysis {
    const frames: SwingFrame[] = [];
    const dt = 1 / fps;
    const totalT = 2.3;
    const nFrames = Math.round(totalT * fps);
    for (let i = 0; i < nFrames; i++) {
      const t = i * dt;
      let x: number, y: number;
      if (t < 0.5) { x = 0; y = 0; }
      else if (t < 1.3) { const u = (t - 0.5) / 0.8; x = -0.6 * u; y = -1.5 * u; }
      else if (t < 1.6) {
        const u = (t - 1.3) / 0.3;
        const uu = u * u;
        x = -0.6 + 1.2 * uu; y = -1.5 + 1.7 * uu;
      }
      else if (t < 1.9) { const u = (t - 1.6) / 0.3; x = 0.6 - 0.3 * u; y = 0.2 - 0.6 * u; }
      else { x = 0.3; y = -0.4; }
      const shoulderL = { x: -0.2, y: -0.7, z: 0 };
      const shoulderR = { x: 0.2, y: -0.7, z: 0 };
      const wrist = { x, y, z: 0 };
      const elbowL = { x: (shoulderL.x + wrist.x) / 2, y: (shoulderL.y + wrist.y) / 2, z: 0 };
      const elbowR = { x: shoulderR.x - 0.1, y: (shoulderR.y + wrist.y) / 2 - 0.05, z: 0 };
      frames.push(
        makeFrame(t, {
          11: shoulderL, 12: shoulderR, 13: elbowL, 14: elbowR,
          15: wrist, 16: wrist,
          23: { x: -0.1, y: 0, z: 0 }, 24: { x: 0.1, y: 0, z: 0 },
          27: { x: -0.1, y: 0.9, z: 0 }, 28: { x: 0.1, y: 0.9, z: 0 },
        }),
      );
    }
    const { events, warnings } = segmentEvents(frames, fps);
    const summary = buildSummary(frames, events, fps, undefined, false);
    return {
      videoUrl: 'mock://synthetic',
      frames,
      sampledFps: fps,
      analyzedRange: { startFrameIdx: 0, endFrameIdx: frames.length - 1 },
      events,
      warnings,
      summary,
    };
  }

  it('moving the impact override to a new time relocates the event and refreshes tempo', () => {
    const fps = 60;
    const analysis = buildSyntheticAnalysis(fps);
    const originalImpactT = analysis.events.impact!.t;
    const newImpactT = originalImpactT + 5 / fps; // 5 frames later
    const rebuilt = swingAnalysisService.rebuildAnalysis(analysis, {
      eventTimeOverrides: { impact: newImpactT },
    });
    // Event t rounds to the nearest sampled frame — within one frame period.
    expect(Math.abs(rebuilt.events.impact!.t - newImpactT)).toBeLessThan(1 / fps);
    // Downswing (top → impact) grew relative to the original.
    expect(rebuilt.summary.downswingMs!).toBeGreaterThan(analysis.summary.downswingMs!);
    // Original analysis object unchanged (rebuild returns a new object).
    expect(analysis.events.impact!.t).toBeCloseTo(originalImpactT, 6);
  });

  it('shrinking the analysis window prunes events that no longer fit inside', () => {
    const fps = 60;
    const analysis = buildSyntheticAnalysis(fps);
    // Original impact lives around t ≈ 1.55s. Cut the window at t=1.4 so the
    // impact/follow/finish need to be re-detected inside a narrower slice.
    const rebuilt = swingAnalysisService.rebuildAnalysis(analysis, {
      intervalStartSec: 0.3,
      intervalEndSec: 1.4,
    });
    expect(rebuilt.analyzedRange!.endFrameIdx).toBeLessThan(analysis.analyzedRange!.endFrameIdx);
    // Every returned event's frameIndex lies inside the new window (absolute
    // indices into the full frames array).
    const { startFrameIdx, endFrameIdx } = rebuilt.analyzedRange!;
    for (const evt of Object.values(rebuilt.events)) {
      if (!evt) continue;
      expect(evt.frameIndex).toBeGreaterThanOrEqual(startFrameIdx);
      expect(evt.frameIndex).toBeLessThanOrEqual(endFrameIdx);
    }
  });

  it('rebuild preserves the coach-declared cameraView across edits', () => {
    const fps = 60;
    const analysis = buildSyntheticAnalysis(fps);
    // Force the analysis to look like the coach explicitly picked DTL — the
    // synthetic geometry auto-detects as face_on, so overriding is enough
    // to exercise the "sticky camera view" branch of rebuildAnalysis.
    const dtlAnalysis: SwingAnalysis = {
      ...analysis,
      summary: { ...analysis.summary, cameraView: 'down_the_line' },
    };
    const rebuilt = swingAnalysisService.rebuildAnalysis(dtlAnalysis, {});
    expect(rebuilt.summary.cameraView).toBe('down_the_line');
  });

  it('rebuild with no edits returns an equivalent analysis (idempotent)', () => {
    const fps = 60;
    const analysis = buildSyntheticAnalysis(fps);
    const rebuilt = swingAnalysisService.rebuildAnalysis(analysis, {});
    // Every original event still exists at the same frame (or within the
    // detection tolerance since we re-run segmentation).
    for (const name of Object.keys(analysis.events) as Array<keyof typeof analysis.events>) {
      expect(rebuilt.events[name]).toBeDefined();
      const dropOff = Math.abs(
        (rebuilt.events[name]!.frameIndex - analysis.events[name]!.frameIndex),
      );
      expect(dropOff).toBeLessThanOrEqual(1);
    }
  });
});
