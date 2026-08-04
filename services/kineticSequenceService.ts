import type {
  Handedness,
  KineticOrder,
  KineticSegment,
  KineticSegmentPeak,
  KineticSequence,
  SwingFrame,
} from '../types/swingAnalysis';
import { subtract, toDeg, toVec3 } from '../utils/vec3';

/**
 * Kinetic (kinematic) sequence — the TPI / GEARS pro-level swing metric.
 *
 * A well-sequenced downswing has angular velocity peaks fire in strict order
 * (pelvis → torso → lead arm → hands). Each segment decelerates as it hands
 * energy off to the next. This service computes each segment's angular speed
 * timeline, finds its peak between Top and Impact, and reports the ordering.
 *
 * All work is deterministic and read-only over SwingFrame[] — no external
 * dependencies, no training data required.
 */

/** Simple moving-average smoother, NaN-safe. Small window (~70ms). */
function smoothSeries(values: number[], halfWindow: number): number[] {
  const out: number[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let n = 0;
    const lo = Math.max(0, i - halfWindow);
    const hi = Math.min(values.length - 1, i + halfWindow);
    for (let j = lo; j <= hi; j++) {
      const v = values[j];
      if (v == null || !Number.isFinite(v)) continue;
      sum += v;
      n += 1;
    }
    out[i] = n === 0 ? NaN : sum / n;
  }
  return out;
}

/**
 * Angular velocity magnitude between two consecutive planar rotation samples
 * (degrees). Handles the ±180° wraparound so a peak that crosses the seam
 * doesn't register as a spurious spike.
 */
function angularSpeedDegPerSec(a: number, b: number, dt: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || dt <= 0) return NaN;
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return Math.abs(d) / dt;
}

/** Interior angle at `b` (deg) between rays b→a and b→c, in 3D. */
function angle3D(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  c: { x: number; y: number; z: number },
): number {
  const ba = subtract(a, b);
  const bc = subtract(c, b);
  const lenA = Math.hypot(ba.x, ba.y, ba.z);
  const lenC = Math.hypot(bc.x, bc.y, bc.z);
  if (lenA === 0 || lenC === 0) return NaN;
  const cos = (ba.x * bc.x + ba.y * bc.y + ba.z * bc.z) / (lenA * lenC);
  return toDeg(Math.acos(Math.max(-1, Math.min(1, cos))));
}

/**
 * Angle (deg) between two 3D vectors. Used to measure how much the lead arm's
 * direction rotates between consecutive frames — the arm's angular speed
 * proxy without needing a fixed rotation axis.
 */
function angleBetweenVectors(
  u: { x: number; y: number; z: number },
  v: { x: number; y: number; z: number },
): number {
  const lu = Math.hypot(u.x, u.y, u.z);
  const lv = Math.hypot(v.x, v.y, v.z);
  if (lu === 0 || lv === 0) return NaN;
  const cos = (u.x * v.x + u.y * v.y + u.z * v.z) / (lu * lv);
  return toDeg(Math.acos(Math.max(-1, Math.min(1, cos))));
}

function leadIndices(handedness: Handedness) {
  const isLeft = handedness === 'left';
  return {
    leadShoulder: isLeft ? 12 : 11,
    leadWrist: isLeft ? 16 : 15,
  };
}

/**
 * Compute a per-frame timeline of angular speeds for the four kinetic
 * segments. Missing landmarks fall through as NaN so downstream peak
 * detection can still work on the segments that DO have data.
 */
function buildSpeedTimelines(
  frames: SwingFrame[],
  fps: number,
  handedness: Handedness,
): {
  pelvis: number[];
  torso: number[];
  leadArm: number[];
  hands: number[];
} {
  const dt = fps > 0 ? 1 / fps : 1 / 30;
  const n = frames.length;
  const pelvisRot = frames.map((f) => f.angles.pelvisRotation ?? NaN);
  const torsoRot = frames.map((f) => f.angles.shoulderRotation ?? NaN);

  const pelvis = new Array(n).fill(NaN);
  const torso = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    pelvis[i] = angularSpeedDegPerSec(pelvisRot[i - 1], pelvisRot[i], dt);
    torso[i] = angularSpeedDegPerSec(torsoRot[i - 1], torsoRot[i], dt);
  }

  const { leadShoulder, leadWrist } = leadIndices(handedness);
  const armVec = frames.map((f) => {
    const w = f.worldKeypoints;
    if (!w) return null;
    const s = toVec3(w[leadShoulder]);
    const wr = toVec3(w[leadWrist]);
    if (!s || !wr) return null;
    return subtract(wr, s);
  });
  const leadArm = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const a = armVec[i - 1];
    const b = armVec[i];
    if (!a || !b) continue;
    const angle = angleBetweenVectors(a, b);
    if (Number.isFinite(angle)) leadArm[i] = angle / dt;
  }

  // Hands = lead-wrist 3D linear speed (m/s) converted to a "degree-of-arc
  // per second" via a nominal arm-length prior (0.6 m). That keeps the four
  // signals on the same visual scale in the UI chart.
  const HANDS_ARC_LENGTH_M = 0.6;
  const wristPos = frames.map((f) => {
    const w = f.worldKeypoints;
    if (!w) return null;
    return toVec3(w[leadWrist]) ?? null;
  });
  const hands = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const a = wristPos[i - 1];
    const b = wristPos[i];
    if (!a || !b) continue;
    const speedMs = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / dt;
    // Arc = speed / radius; convert rad→deg.
    hands[i] = (speedMs / HANDS_ARC_LENGTH_M) * (180 / Math.PI);
  }

  const halfWin = Math.max(1, Math.round(fps * 0.035));
  return {
    pelvis: smoothSeries(pelvis, halfWin),
    torso: smoothSeries(torso, halfWin),
    leadArm: smoothSeries(leadArm, halfWin),
    hands: smoothSeries(hands, halfWin),
  };
}

/** Pick the argmax within [lo, hi] inclusive, skipping NaN. */
function argMaxInRange(values: number[], lo: number, hi: number): number {
  let bestIdx = -1;
  let best = -Infinity;
  const from = Math.max(0, lo);
  const to = Math.min(values.length - 1, hi);
  for (let i = from; i <= to; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (v > best) {
      best = v;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function buildPeak(
  segment: KineticSegment,
  peakIdx: number,
  values: number[],
  frames: SwingFrame[],
  topT: number,
): KineticSegmentPeak | undefined {
  if (peakIdx < 0 || peakIdx >= values.length) return undefined;
  const v = values[peakIdx];
  if (!Number.isFinite(v) || v <= 0) return undefined;
  const t = frames[peakIdx].t;
  return {
    segment,
    peakValue: +v.toFixed(1),
    peakT: +t.toFixed(3),
    msFromTop: Math.round((t - topT) * 1000),
  };
}

/**
 * Determine sequence quality. `simultaneous` fires when all peaks land within
 * `SIMUL_THRESHOLD_MS` of each other — a symptom of the whole body firing
 * together instead of chaining. `inverted` fires when hands / arm peak before
 * pelvis (over-the-top / casting pattern).
 */
function classifyOrder(
  peaks: Array<KineticSegmentPeak | undefined>,
): KineticOrder {
  const valid = peaks.filter((p): p is KineticSegmentPeak => !!p);
  if (valid.length < 3) return 'unknown';

  const ordered = [...valid].sort((a, b) => a.msFromTop - b.msFromTop);
  const span = ordered[ordered.length - 1].msFromTop - ordered[0].msFromTop;
  if (span < 30) return 'simultaneous';

  const expected: KineticSegment[] = ['pelvis', 'torso', 'lead_arm', 'hands'];
  const validSegments = valid.map((p) => p.segment);
  const expectedSubset = expected.filter((s) => validSegments.includes(s));
  const actualOrder = ordered.map((p) => p.segment);

  const correct =
    expectedSubset.length === actualOrder.length &&
    expectedSubset.every((s, i) => s === actualOrder[i]);
  if (correct) return 'correct';

  // Inverted signal: hands or lead_arm appears before pelvis in the ordered sequence.
  const pelvisIdx = actualOrder.indexOf('pelvis');
  const handsIdx = actualOrder.indexOf('hands');
  const armIdx = actualOrder.indexOf('lead_arm');
  if (pelvisIdx >= 0 && ((handsIdx >= 0 && handsIdx < pelvisIdx) || (armIdx >= 0 && armIdx < pelvisIdx))) {
    return 'inverted';
  }
  return 'partial';
}

/**
 * Public entry: compute the kinetic sequence between Top and Impact.
 * Returns undefined when both bracketing events are missing.
 */
export function computeKineticSequence(
  frames: SwingFrame[],
  topIdx: number,
  impactIdx: number,
  fps: number,
  handedness: Handedness,
): KineticSequence | undefined {
  if (topIdx < 0 || impactIdx < 0 || impactIdx <= topIdx) return undefined;
  const topT = frames[topIdx].t;
  const speeds = buildSpeedTimelines(frames, fps, handedness);

  // Search for each segment's peak inside a padded downswing window — some
  // segments (pelvis) genuinely peak a few frames before the visual "Top",
  // others (hands) at/near Impact.
  const searchLo = Math.max(0, topIdx - 2);
  const searchHi = Math.min(frames.length - 1, impactIdx + 1);

  const pelvisIdx = argMaxInRange(speeds.pelvis, searchLo, searchHi);
  const torsoIdx = argMaxInRange(speeds.torso, searchLo, searchHi);
  const leadArmIdx = argMaxInRange(speeds.leadArm, searchLo, searchHi);
  const handsIdx = argMaxInRange(speeds.hands, searchLo, searchHi);

  const pelvis = buildPeak('pelvis', pelvisIdx, speeds.pelvis, frames, topT);
  const torso = buildPeak('torso', torsoIdx, speeds.torso, frames, topT);
  const leadArm = buildPeak('lead_arm', leadArmIdx, speeds.leadArm, frames, topT);
  const hands = buildPeak('hands', handsIdx, speeds.hands, frames, topT);

  const order = classifyOrder([pelvis, torso, leadArm, hands]);

  const msValues = [pelvis, torso, leadArm, hands]
    .filter((p): p is KineticSegmentPeak => !!p)
    .map((p) => p.msFromTop);
  const peakSpanMs = msValues.length >= 2 ? Math.max(...msValues) - Math.min(...msValues) : undefined;

  // Timeline slice for chart rendering (downswing frames only).
  const chartLo = Math.max(0, topIdx - 1);
  const chartHi = Math.min(frames.length - 1, impactIdx + 2);
  const frameIndices: number[] = [];
  const pelvisSlice: number[] = [];
  const torsoSlice: number[] = [];
  const leadArmSlice: number[] = [];
  const handsSlice: number[] = [];
  for (let i = chartLo; i <= chartHi; i++) {
    frameIndices.push(i);
    pelvisSlice.push(Number.isFinite(speeds.pelvis[i]) ? +speeds.pelvis[i].toFixed(1) : 0);
    torsoSlice.push(Number.isFinite(speeds.torso[i]) ? +speeds.torso[i].toFixed(1) : 0);
    leadArmSlice.push(Number.isFinite(speeds.leadArm[i]) ? +speeds.leadArm[i].toFixed(1) : 0);
    handsSlice.push(Number.isFinite(speeds.hands[i]) ? +speeds.hands[i].toFixed(1) : 0);
  }

  return {
    pelvis,
    torso,
    leadArm,
    hands,
    order,
    peakSpanMs,
    timeline: {
      frameIndices,
      pelvis: pelvisSlice,
      torso: torsoSlice,
      leadArm: leadArmSlice,
      hands: handsSlice,
    },
  };
}

/** Internal helpers for unit tests. */
export const __testing__ = {
  smoothSeries,
  angularSpeedDegPerSec,
  angle3D,
  angleBetweenVectors,
  argMaxInRange,
  classifyOrder,
  buildSpeedTimelines,
};
