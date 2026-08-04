import type {
  ClubHeadPosition,
  ClubHeadTrajectory,
  ClubType,
  Handedness,
  SwingEvent,
  SwingEventName,
  SwingFrame,
  SwingSummary,
} from '../types/swingAnalysis';
import { midpoint, subtract, toDeg, toVec3 } from '../utils/vec3';

/**
 * Club head tracking — Phase C.1 (geometric baseline).
 *
 * We do NOT run a golf-club detector on the video. Instead we approximate the
 * club head geometrically from the pose landmarks. At impact the shaft is
 * nearly aligned with the lead arm (single-lever assumption), so extending the
 * lead-shoulder→grip vector by the club length lands roughly at the head.
 *
 * Accuracy caveat: the assumption is only usable within ~2 frames of impact.
 * Anywhere else in the swing (Top, mid-downswing) the shaft has significant
 * angle to the arm and this estimate breaks down. That's why the public
 * surface only exposes impact-frame values.
 *
 * Phase C.2 will replace `geometricImpactDetector` with an ML detector (YOLO
 * or an optical-flow tracker) behind the same `ClubHeadDetector` interface,
 * without changing any callers.
 */

const CLUB_LENGTHS_M: Record<ClubType, number> = {
  driver: 1.15,
  iron: 0.95,
  wedge: 0.87,
};

/** Assumed shoulder-to-wrist arm length for 2D scaling. */
const ARM_LENGTH_M = 0.6;

export interface ClubTrackingContext {
  handedness: Handedness;
  /** Defaults to 'driver'. */
  club?: ClubType;
}

export interface ClubHeadDetector {
  /**
   * Estimate the club head position for the frame at `idx`. Returns undefined
   * when the required landmarks are missing or the estimate is degenerate.
   */
  detectAt(
    frames: SwingFrame[],
    idx: number,
    ctx: ClubTrackingContext,
  ): ClubHeadPosition | undefined;
}

function leadIndices(handedness: Handedness) {
  const isLeft = handedness === 'left';
  return {
    leadShoulder: isLeft ? 12 : 11,
    trailShoulder: isLeft ? 11 : 12,
    leadWrist: isLeft ? 16 : 15,
    trailWrist: isLeft ? 15 : 16,
  };
}

export const geometricImpactDetector: ClubHeadDetector = {
  detectAt(frames, idx, ctx) {
    const frame = frames[idx];
    if (!frame) return undefined;
    const world = frame.worldKeypoints;
    if (!world) return undefined;

    const { leadShoulder: lsIdx, leadWrist: lwIdx, trailWrist: twIdx } = leadIndices(ctx.handedness);
    const leadShoulder = toVec3(world[lsIdx]);
    const leadWrist = toVec3(world[lwIdx]);
    const trailWrist = toVec3(world[twIdx]);
    if (!leadShoulder || !leadWrist) return undefined;

    // Grip = midpoint of both hands (they overlap on the club). Fall back to
    // lead wrist alone if trail wrist is missing.
    const grip = trailWrist ? midpoint(leadWrist, trailWrist) : leadWrist;

    // Shaft direction ≈ lead shoulder → grip, at impact. Extend by club length.
    const dir = subtract(grip, leadShoulder);
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (len < 1e-6) return undefined;
    const unit = { x: dir.x / len, y: dir.y / len, z: dir.z / len };

    const clubLen = CLUB_LENGTHS_M[ctx.club ?? 'driver'];
    const head: { x: number; y: number; z: number } = {
      x: grip.x + unit.x * clubLen,
      y: grip.y + unit.y * clubLen,
      z: grip.z + unit.z * clubLen,
    };

    // Project to normalized 2D for canvas overlay. Extrapolate along the 2D
    // shoulder→wrist vector by (clubLen / ARM_LENGTH_M).
    const leadShoulder2D = frame.keypoints[lsIdx];
    const leadWrist2D = frame.keypoints[lwIdx];
    let x2d = leadWrist2D?.x ?? 0.5;
    let y2d = leadWrist2D?.y ?? 0.5;
    if (leadShoulder2D && leadWrist2D) {
      const dx2 = leadWrist2D.x - leadShoulder2D.x;
      const dy2 = leadWrist2D.y - leadShoulder2D.y;
      const armLen2D = Math.hypot(dx2, dy2);
      if (armLen2D > 1e-4) {
        const scale = clubLen / ARM_LENGTH_M;
        x2d = leadWrist2D.x + dx2 * scale;
        y2d = leadWrist2D.y + dy2 * scale;
      }
    }
    x2d = Math.max(0, Math.min(1, x2d));
    y2d = Math.max(0, Math.min(1, y2d));

    return {
      x: head.x,
      y: head.y,
      z: head.z,
      x2d,
      y2d,
      confidence: 0.5,
      method: 'geometric',
    };
  },
};

/** Club head position at impact. */
export function estimateClubHeadAtImpact(
  frames: SwingFrame[],
  impactIdx: number,
  ctx: ClubTrackingContext,
  detector: ClubHeadDetector = geometricImpactDetector,
): ClubHeadPosition | undefined {
  return detector.detectAt(frames, impactIdx, ctx);
}

/**
 * Club head speed at impact in km/h — magnitude of 3D world velocity from
 * (impact-1, impact+1) / 2Δt. Rejects results outside a plausible range
 * (0–400 km/h) which usually indicate landmark jitter.
 */
export function computeClubHeadSpeedKmh(
  frames: SwingFrame[],
  impactIdx: number,
  ctx: ClubTrackingContext,
  detector: ClubHeadDetector = geometricImpactDetector,
): number | undefined {
  if (impactIdx <= 0 || impactIdx >= frames.length - 1) return undefined;
  const pre = detector.detectAt(frames, impactIdx - 1, ctx);
  const post = detector.detectAt(frames, impactIdx + 1, ctx);
  if (!pre || !post) return undefined;
  const dt = frames[impactIdx + 1].t - frames[impactIdx - 1].t;
  if (dt <= 0) return undefined;
  const dx = post.x - pre.x;
  const dy = post.y - pre.y;
  const dz = post.z - pre.z;
  const speedMs = Math.hypot(dx, dy, dz) / dt;
  const kmh = speedMs * 3.6;
  if (!Number.isFinite(kmh) || kmh < 0 || kmh > 400) return undefined;
  return +kmh.toFixed(1);
}

/**
 * Club path angle at impact in degrees, projected onto the ground (X-Z)
 * plane. Reference direction = the address shoulder line (trail → lead
 * shoulder), which points toward the target for a squared setup. Positive =
 * in-to-out for a right-handed player.
 */
export function computeClubPathAngle(
  frames: SwingFrame[],
  impactIdx: number,
  addressIdx: number,
  ctx: ClubTrackingContext,
  detector: ClubHeadDetector = geometricImpactDetector,
): number | undefined {
  if (impactIdx <= 0 || impactIdx >= frames.length - 1) return undefined;
  const pre = detector.detectAt(frames, impactIdx - 1, ctx);
  const post = detector.detectAt(frames, impactIdx + 1, ctx);
  if (!pre || !post) return undefined;
  const vx = post.x - pre.x;
  const vz = post.z - pre.z;

  const addressWorld = frames[addressIdx]?.worldKeypoints;
  if (!addressWorld) return undefined;
  const { leadShoulder, trailShoulder } = leadIndices(ctx.handedness);
  const ls = toVec3(addressWorld[leadShoulder]);
  const ts = toVec3(addressWorld[trailShoulder]);
  if (!ls || !ts) return undefined;
  const rx = ls.x - ts.x;
  const rz = ls.z - ts.z;
  const rLen = Math.hypot(rx, rz);
  const vLen = Math.hypot(vx, vz);
  if (rLen < 1e-4 || vLen < 1e-4) return undefined;

  const rxU = rx / rLen;
  const rzU = rz / rLen;
  const vxU = vx / vLen;
  const vzU = vz / vLen;
  // Signed angle from target line to velocity, viewing the ground plane from
  // above (+Y up in the world's up direction, which is -Y in MediaPipe raw).
  const cross = rxU * vzU - rzU * vxU;
  const dot = rxU * vxU + rzU * vzU;
  return +toDeg(Math.atan2(cross, dot)).toFixed(1);
}

/**
 * Estimate the club head trajectory in the impact zone (±windowFrames around
 * impact). The geometric detector's single-lever assumption is only reliable
 * within a handful of frames of impact, so we deliberately clip the window
 * — extending further introduces misleading positions in mid-swing where the
 * shaft has hinged away from the arm line.
 *
 * Returns undefined when fewer than 2 usable positions can be sampled.
 */
export function estimateImpactZoneTrajectory(
  frames: SwingFrame[],
  impactIdx: number,
  windowFrames: number,
  ctx: ClubTrackingContext,
  detector: ClubHeadDetector = geometricImpactDetector,
): ClubHeadTrajectory | undefined {
  if (impactIdx < 0 || impactIdx >= frames.length) return undefined;
  const lo = Math.max(0, impactIdx - windowFrames);
  const hi = Math.min(frames.length - 1, impactIdx + windowFrames);
  const positions: ClubHeadPosition[] = [];
  const frameIndices: number[] = [];
  for (let i = lo; i <= hi; i++) {
    const p = detector.detectAt(frames, i, ctx);
    if (!p) continue;
    positions.push(p);
    frameIndices.push(i);
  }
  if (positions.length < 2) return undefined;

  let maxSpeedKmh: number | undefined;
  for (let i = 1; i < positions.length; i++) {
    const dt = frames[frameIndices[i]].t - frames[frameIndices[i - 1]].t;
    if (dt <= 0) continue;
    const a = positions[i - 1];
    const b = positions[i];
    const speed = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / dt;
    const kmh = speed * 3.6;
    // Same 400 km/h ceiling as the point speed estimator — anything past that
    // is landmark jitter, not a real swing.
    if (!Number.isFinite(kmh) || kmh < 0 || kmh > 400) continue;
    if (maxSpeedKmh == null || kmh > maxSpeedKmh) maxSpeedKmh = kmh;
  }
  return {
    positions,
    frameIndices,
    maxSpeedKmh: maxSpeedKmh != null ? +maxSpeedKmh.toFixed(1) : undefined,
  };
}

/**
 * Augment a SwingSummary in place with club head metrics when address and
 * impact events are both detected. No-op otherwise. Callers can pass a
 * non-default detector (e.g. `MLClubHeadDetector`) to change the source of
 * every head estimate — the geometric baseline stays the default.
 */
export function clubHeadAugmentSummary(
  summary: SwingSummary,
  frames: SwingFrame[],
  events: Partial<Record<SwingEventName, SwingEvent>>,
  detector: ClubHeadDetector = geometricImpactDetector,
): void {
  const impact = events.impact;
  const address = events.address;
  if (!impact) return;
  const ctx: ClubTrackingContext = {
    handedness: summary.handedness ?? 'unknown',
    club: 'driver',
  };
  const head = estimateClubHeadAtImpact(frames, impact.frameIndex, ctx, detector);
  if (head) summary.impactClubHead = head;
  const speed = computeClubHeadSpeedKmh(frames, impact.frameIndex, ctx, detector);
  if (speed != null) summary.clubHeadSpeedKmh = speed;
  if (address) {
    const path = computeClubPathAngle(
      frames,
      impact.frameIndex,
      address.frameIndex,
      ctx,
      detector,
    );
    if (path != null) summary.clubPathAtImpactDeg = path;
  }
  const trajectory = estimateImpactZoneTrajectory(
    frames,
    impact.frameIndex,
    3,
    ctx,
    detector,
  );
  if (trajectory) {
    summary.impactZoneTrajectory = trajectory;
    if (trajectory.maxSpeedKmh != null) summary.maxClubHeadSpeedKmh = trajectory.maxSpeedKmh;
  }
}

/** Internal helpers exposed for unit tests. */
export const __testing__ = {
  geometricImpactDetector,
  estimateClubHeadAtImpact,
  computeClubHeadSpeedKmh,
  computeClubPathAngle,
  estimateImpactZoneTrajectory,
  CLUB_LENGTHS_M,
};
