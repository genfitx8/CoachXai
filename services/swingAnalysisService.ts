import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { SkeletonKeypoint } from '../types/postureAnalysis';
import {
  AnalyzedFrameRange,
  CameraView,
  Handedness,
  SwingAnalysis,
  SwingAnalysisProgress,
  SwingEvent,
  SwingEventName,
  SwingFrame,
  SwingInterval,
  SwingSummary,
} from '../types/swingAnalysis';
import { createLogger } from '../utils/logger';
import { midpoint, subtract, toDeg, toVec3, type Vec3 } from '../utils/vec3';
import {
  clubHeadAugmentSummary,
  type ClubHeadDetector,
} from './clubHeadTrackingService';
import { computeKineticSequence } from './kineticSequenceService';

const log = createLogger('swingAnalysisService');

const HEAVY_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task';

// Cap the number of frames we run inference on. A driver swing is ~1.2s;
// generous 4s clips at 120fps stay near 480. Higher costs GPU time with
// diminishing diagnostic value.
const MAX_FRAMES = 500;
/**
 * Sampling ceiling. iPhone slo-mo shoots at 240fps native; we down-sample to
 * 120 because MediaPipe Heavy takes ~50–80ms per frame on GPU and beyond
 * 120fps the extra samples don't meaningfully improve peak detection
 * (parabolic sub-frame refinement already gives ~±3ms precision at 30fps).
 */
const TARGET_FPS_CAP = 120;
/** Default when native fps detection isn't available (Firefox, older Safari). */
const TARGET_FPS_DEFAULT = 30;

/**
 * Detect the source video's native frame rate using
 * `requestVideoFrameCallback` (Chrome / Edge / iOS Safari 15+). Falls back to
 * `TARGET_FPS_DEFAULT` when the API isn't present. Rounds to the nearest
 * typical camera rate so a noisy 29.7 becomes 30 cleanly.
 */
async function detectVideoFps(
  video: HTMLVideoElement,
  probeMs = 400,
): Promise<number> {
  const rvfc =
    typeof video.requestVideoFrameCallback === 'function'
      ? video.requestVideoFrameCallback.bind(video)
      : null;
  if (!rvfc) return TARGET_FPS_DEFAULT;

  return new Promise<number>((resolve) => {
    const timeout = window.setTimeout(() => resolve(TARGET_FPS_DEFAULT), probeMs + 1200);
    let start: number | null = null;
    let count = 0;
    const onFrame = (now: number) => {
      if (start === null) start = now;
      count += 1;
      const elapsed = now - start;
      if (elapsed >= probeMs && count >= 4) {
        window.clearTimeout(timeout);
        // count-1 intervals between count frames.
        const rawFps = ((count - 1) / elapsed) * 1000;
        const candidates = [24, 25, 30, 48, 50, 60, 90, 120, 200, 240];
        const rounded = candidates.reduce((prev, curr) =>
          Math.abs(curr - rawFps) < Math.abs(prev - rawFps) ? curr : prev,
        );
        resolve(rounded);
      } else {
        rvfc(onFrame);
      }
    };
    // Kick off playback muted; browsers block unmuted autoplay.
    video.muted = true;
    video.currentTime = 0;
    video
      .play()
      .then(() => rvfc(onFrame))
      .catch(() => {
        window.clearTimeout(timeout);
        resolve(TARGET_FPS_DEFAULT);
      });
  });
}

const LANDMARK_NAMES = [
  'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
  'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  'left_pinky', 'right_pinky',
  'left_index', 'right_index',
  'left_thumb', 'right_thumb',
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
  'left_heel', 'right_heel',
  'left_foot_index', 'right_foot_index',
];

let videoLandmarker: PoseLandmarker | null = null;
let isInitializing = false;

/**
 * MediaPipe's VIDEO-mode landmarker requires strictly monotonic timestamps
 * across every `detectForVideo` call for the lifetime of the instance. Since
 * we cache the landmarker across analysis runs (heavy model, ~30 MB), each
 * new run must pick timestamps larger than any we've ever sent — otherwise
 * MediaPipe throws "Packet timestamp mismatch". This counter is bumped every
 * frame and never reset.
 */
let mpTimestampMs = 0;

/** Return a strictly increasing timestamp (ms) for `detectForVideo`. */
function nextMonotonicTimestamp(seedMs: number): number {
  const next = Math.max(mpTimestampMs + 1, seedMs);
  mpTimestampMs = next;
  return next;
}

async function initializeVideoLandmarker(): Promise<PoseLandmarker> {
  if (videoLandmarker) return videoLandmarker;
  if (isInitializing) {
    while (isInitializing) await new Promise((r) => setTimeout(r, 100));
    if (videoLandmarker) return videoLandmarker;
  }
  isInitializing = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );
    videoLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: HEAVY_MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false,
    });
    log.info('Video pose landmarker initialized');
    return videoLandmarker;
  } finally {
    isInitializing = false;
  }
}

function rotationAroundVertical(left: Vec3, right: Vec3): number {
  const v = subtract(right, left);
  return toDeg(Math.atan2(v.z, v.x));
}

/** Interior angle (deg) at vertex `b` between segments b→a and b→c, in 3D. */
function angle3D(a: Vec3, b: Vec3, c: Vec3): number {
  const ba = subtract(a, b);
  const bc = subtract(c, b);
  const lenA = Math.hypot(ba.x, ba.y, ba.z);
  const lenC = Math.hypot(bc.x, bc.y, bc.z);
  if (lenA === 0 || lenC === 0) return NaN;
  const cos = (ba.x * bc.x + ba.y * bc.y + ba.z * bc.z) / (lenA * lenC);
  return toDeg(Math.acos(Math.max(-1, Math.min(1, cos))));
}

function computeGolfAngles(world: SkeletonKeypoint[]): Record<string, number> {
  const angles: Record<string, number> = {};
  const ls = toVec3(world[11]);
  const rs = toVec3(world[12]);
  const lh = toVec3(world[23]);
  const rh = toVec3(world[24]);
  if (!ls || !rs || !lh || !rh) return angles;

  const shoulderCenter = midpoint(ls, rs);
  const hipCenter = midpoint(lh, rh);
  const spineVec = subtract(shoulderCenter, hipCenter);
  const spineLen = Math.hypot(spineVec.x, spineVec.y, spineVec.z);
  if (spineLen > 0) {
    const cos = spineVec.y / spineLen;
    angles.spineTilt3D = toDeg(Math.acos(Math.max(-1, Math.min(1, cos))));
    // Lateral tilt from the frontal camera: angle between the torso axis
    // and gravity in the X/Y plane (ignoring depth). Positive = leaning
    // right in image coords; sign carries meaning so a coach can spot
    // reverse pivots at address (should be near 0) vs. impact (right-hander
    // typically −5 to −15° meaning trail-side tilt away from target).
    const lateralDenom = Math.hypot(spineVec.x, spineVec.y);
    if (lateralDenom > 0) {
      // atan2(x, -y): -y because MediaPipe world Y is +down, so up is -Y.
      // We measure from vertical, positive when spine leans toward +X.
      angles.torsoLateralTiltDeg = toDeg(Math.atan2(spineVec.x, -spineVec.y));
    }
  }

  const shoulderRot = rotationAroundVertical(ls, rs);
  const pelvisRot = rotationAroundVertical(lh, rh);
  angles.shoulderRotation = shoulderRot;
  angles.pelvisRotation = pelvisRot;
  angles.hipShoulderSeparation = shoulderRot - pelvisRot;

  // Wrist height (world Y). Used by impact detection since wrists dip through
  // the ball as the club releases.
  const lw = world[15];
  const rw = world[16];
  if (lw && rw) {
    angles.wristY = (lw.y + rw.y) / 2;
  }

  // Mean knee flexion (3D). Address ~150–165°; less = deeper squat, 180° = fully
  // extended. Loss of knee flex through impact is a "stand-up" fault.
  const lk = toVec3(world[25]);
  const rk = toVec3(world[26]);
  const la = toVec3(world[27]);
  const ra = toVec3(world[28]);
  const lKnee = lh && lk && la ? angle3D(lh, lk, la) : NaN;
  const rKnee = rh && rk && ra ? angle3D(rh, rk, ra) : NaN;
  const valid = [lKnee, rKnee].filter((v) => Number.isFinite(v));
  if (valid.length > 0) {
    angles.kneeFlex = valid.reduce((s, v) => s + v, 0) / valid.length;
  }

  return angles;
}

/**
 * Seek an HTMLVideoElement to `t` seconds and resolve once the frame is ready
 * to sample. Times out after 2s in case the browser stalls on a keyframe.
 */
function seekVideo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const clamped = Math.max(0, Math.min(video.duration || t, t));
    if (Math.abs(video.currentTime - clamped) < 1e-3) {
      resolve();
      return;
    }
    const timeout = window.setTimeout(() => {
      video.removeEventListener('seeked', onSeeked);
      reject(new Error(`Video seek to ${t.toFixed(3)}s timed out`));
    }, 2000);
    const onSeeked = () => {
      window.clearTimeout(timeout);
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = clamped;
  });
}

async function loadVideoElement(videoUrl: string): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.src = videoUrl;
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      video.removeEventListener('loadedmetadata', onReady);
      resolve();
    };
    const onError = () => {
      video.removeEventListener('error', onError);
      reject(new Error('비디오를 불러올 수 없습니다.'));
    };
    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('error', onError);
  });
  return video;
}

/**
 * Locate an event by scanning a scalar signal and returning the extremum frame.
 */
function argExtremum(
  values: number[],
  fromIdx: number,
  toIdx: number,
  mode: 'max' | 'min',
): number {
  let bestIdx = fromIdx;
  let best = values[fromIdx];
  for (let i = fromIdx + 1; i <= toIdx && i < values.length; i++) {
    const v = values[i];
    if (v == null || Number.isNaN(v)) continue;
    if (mode === 'max' ? v > best : v < best) {
      best = v;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Parabolic interpolation around a discrete extremum. Fits a parabola through
 * (k-1, k, k+1) samples and returns the sub-frame offset of the true
 * extremum. Standard signal-processing trick — turns 30fps sampling (±33ms)
 * into ~±3ms precision for smooth curves like wrist speed at impact. Returns
 * undefined at timeline edges or when the samples don't form a valid
 * parabola.
 */
function parabolicRefine(
  values: number[],
  k: number,
): { offset: number; refinedValue: number } | undefined {
  if (k <= 0 || k >= values.length - 1) return undefined;
  const y0 = values[k - 1];
  const y1 = values[k];
  const y2 = values[k + 1];
  if (!Number.isFinite(y0) || !Number.isFinite(y1) || !Number.isFinite(y2)) return undefined;
  const denom = y0 - 2 * y1 + y2;
  // Flat curve → no meaningful refinement.
  if (Math.abs(denom) < 1e-9) return { offset: 0, refinedValue: y1 };
  const offset = (0.5 * (y0 - y2)) / denom;
  // Sanity: true extremum should sit within [-1, 1] of the sampled peak.
  // Anything larger means our chosen k wasn't actually the local max/min.
  if (Math.abs(offset) > 1) return undefined;
  const refinedValue = y1 - 0.25 * (y0 - y2) * offset;
  return { offset, refinedValue };
}

/**
 * NaN-safe centered moving-average smoother. Preserves gaps: any output that
 * would be computed from zero valid samples stays NaN so downstream logic can
 * detect missing signal instead of interpolating over it.
 */
function smooth(values: number[], halfWindow: number): number[] {
  const out: number[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let n = 0;
    const lo = Math.max(0, i - halfWindow);
    const hi = Math.min(values.length - 1, i + halfWindow);
    for (let j = lo; j <= hi; j++) {
      const v = values[j];
      if (v == null || Number.isNaN(v)) continue;
      sum += v;
      n += 1;
    }
    out[i] = n === 0 ? NaN : sum / n;
  }
  return out;
}

/**
 * First-difference velocity (per-frame). Returns NaN wherever either side is
 * missing so we never pretend to know velocity across a gap.
 */
function derivative(values: number[], dt: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1];
    const b = values[i];
    if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) continue;
    out[i] = (b - a) / dt;
  }
  return out;
}

/**
 * Infer camera perspective from address-window worldLandmarks. Face-on has
 * shoulders spanning mostly along X (little Z); down-the-line has them along
 * Z. Falls back to 'unknown' when both spans are similar or landmarks missing.
 */
function detectCameraView(addressFrames: SwingFrame[]): CameraView {
  let xSum = 0;
  let zSum = 0;
  let n = 0;
  for (const f of addressFrames) {
    const world = f.worldKeypoints;
    if (!world) continue;
    const ls = world[11];
    const rs = world[12];
    if (!ls || !rs || ls.z == null || rs.z == null) continue;
    xSum += Math.abs(rs.x - ls.x);
    zSum += Math.abs(rs.z - ls.z);
    n += 1;
  }
  if (n === 0) return 'unknown';
  const xSpan = xSum / n;
  const zSpan = zSum / n;
  if (xSpan <= 0 && zSpan <= 0) return 'unknown';
  const ratio = zSpan / Math.max(xSpan, 1e-4);
  if (ratio < 0.35) return 'face_on';
  if (ratio > 1.3) return 'down_the_line';
  return 'unknown';
}

/**
 * Extract a per-frame lead-wrist 3D position (or 2D fallback) so segmentation
 * can drive off "how fast are the hands moving right now?" — the most
 * camera-view-independent signal in a golf swing. Uses `worldKeypoints`
 * (metric meters) when available and falls back to normalized 2D
 * `keypoints` (pixel space, unitless) with a coarser threshold.
 */
type WristTrack = {
  positions: Array<{ x: number; y: number; z: number } | null>;
  /** True when we're working in metric world coords; thresholds differ. */
  is3D: boolean;
};

function extractWristTrack(frames: SwingFrame[]): WristTrack {
  const positions: WristTrack['positions'] = [];
  let has3D = false;
  for (const f of frames) {
    const w = f.worldKeypoints;
    if (w) {
      const lw = toVec3(w[15]);
      const rw = toVec3(w[16]);
      if (lw && rw) {
        positions.push({ x: (lw.x + rw.x) / 2, y: (lw.y + rw.y) / 2, z: (lw.z + rw.z) / 2 });
        has3D = true;
        continue;
      }
    }
    // 2D fallback (normalized 0..1). Use z=0 so speed magnitude reduces to 2D.
    const lw2 = f.keypoints[15];
    const rw2 = f.keypoints[16];
    if (lw2 && rw2 && lw2.confidence >= 0.3 && rw2.confidence >= 0.3) {
      positions.push({ x: (lw2.x + rw2.x) / 2, y: (lw2.y + rw2.y) / 2, z: 0 });
    } else {
      positions.push(null);
    }
  }
  return { positions, is3D: has3D };
}

/**
 * Percentile of a numeric array, ignoring NaN. Returns fallback when there
 * aren't enough valid samples to be meaningful.
 */
function percentileFinite(values: number[], p: number, fallback: number): number {
  const finite: number[] = [];
  for (const v of values) if (Number.isFinite(v)) finite.push(v);
  if (finite.length < 4) return fallback;
  finite.sort((a, b) => a - b);
  const rank = Math.min(finite.length - 1, Math.max(0, Math.round((p / 100) * (finite.length - 1))));
  return finite[rank];
}

/**
 * Derive still / moving thresholds from the actual wrist-speed distribution
 * instead of hard-coded absolutes. Adapts across swing tempos (senior
 * ~4 m/s peaks vs. pro ~10 m/s), club types (wedge vs. driver), and camera
 * modes (world vs. normalized 2D fallback). A floor prevents landmark flicker
 * from being classified as motion when the whole clip is essentially static.
 */
function adaptiveSpeedThresholds(
  speed: number[],
  is3D: boolean,
): { still: number; moving: number } {
  const floorStill = is3D ? 0.25 : 0.05;
  const floorMoving = is3D ? 0.6 : 0.12;
  const p15 = percentileFinite(speed, 15, floorStill);
  const p60 = percentileFinite(speed, 60, floorMoving);
  const p95 = percentileFinite(speed, 95, floorMoving * 3);
  // still ≈ 20% of the way from baseline to peak (captures address noise
  // without swallowing the takeaway). moving ≈ 40% of that range.
  const still = Math.max(floorStill, Math.min(p15 * 1.5, p95 * 0.15));
  const moving = Math.max(floorMoving, Math.min(p60, p95 * 0.35));
  return { still, moving: Math.max(moving, still * 1.8) };
}

/**
 * Scan an already-sampled frame timeline for distinct swing intervals — the
 * primitive that lets unedited golfer videos (waggle, walking to the ball,
 * multiple swings, chatter) get sliced down to the meaningful segment before
 * event segmentation runs.
 *
 * Algorithm:
 *   1. Compute wrist speed for every frame.
 *   2. Take adaptive still / moving thresholds from the global distribution.
 *   3. Find bursts — runs of ≥100ms where speed exceeds MOVING.
 *   4. For each burst pick the peak frame, then walk outward until we hit a
 *      sustained still window (~200ms before start, ~300ms after end) or the
 *      max plausible swing radius (1.5s back, 1.0s forward from peak).
 *   5. Merge overlapping candidates.
 *   6. Score each candidate: high peak speed, plausible 1.5–3.5s duration,
 *      and clean still-bounded edges → higher confidence.
 *
 * Returns candidates sorted by confidence descending. Empty when no burst
 * clears the moving threshold at all (a still clip with no swing in it).
 */
function detectSwingIntervals(
  frames: SwingFrame[],
  sampledFps: number,
): SwingInterval[] {
  if (frames.length < 8 || sampledFps <= 0) return [];
  const dt = 1 / sampledFps;
  const track = extractWristTrack(frames);
  const rawSpeed: number[] = new Array(frames.length).fill(NaN);
  for (let i = 1; i < frames.length; i++) {
    const a = track.positions[i - 1];
    const b = track.positions[i];
    if (!a || !b) continue;
    rawSpeed[i] = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / dt;
  }
  const halfWin = Math.max(1, Math.round(sampledFps * 0.05));
  const speed = smooth(rawSpeed, halfWin);
  const { still, moving } = adaptiveSpeedThresholds(speed, track.is3D);
  const sustainedFrames = Math.max(2, Math.round(sampledFps * 0.1));

  // Step 1 · Find bursts: runs of length ≥sustainedFrames above MOVING.
  type Burst = { startIdx: number; endIdx: number; peakIdx: number; peakSpeed: number };
  const bursts: Burst[] = [];
  let i = 0;
  while (i < frames.length) {
    if (!(speed[i] > moving)) {
      i += 1;
      continue;
    }
    const runStart = i;
    while (i < frames.length && speed[i] > moving) i += 1;
    const runEnd = i - 1;
    if (runEnd - runStart + 1 >= sustainedFrames) {
      let peakIdx = runStart;
      let peakSpeed = speed[runStart];
      for (let j = runStart; j <= runEnd; j++) {
        const v = speed[j];
        if (Number.isFinite(v) && v > peakSpeed) {
          peakSpeed = v;
          peakIdx = j;
        }
      }
      bursts.push({ startIdx: runStart, endIdx: runEnd, peakIdx, peakSpeed });
    }
  }
  if (bursts.length === 0) return [];

  // Step 2 · For each burst, expand to still boundaries.
  const maxBackFrames = Math.round(sampledFps * 1.5);
  const maxForwardFrames = Math.round(sampledFps * 1.0);
  const preHoldFrames = Math.max(2, Math.round(sampledFps * 0.2));
  const postHoldFrames = Math.max(3, Math.round(sampledFps * 0.3));

  const candidates: Array<SwingInterval & { startIdx: number; endIdx: number }> = [];
  for (const burst of bursts) {
    // Walk back for a still-hold window (address).
    let startIdx = burst.peakIdx;
    for (let k = burst.peakIdx - 1; k >= Math.max(0, burst.peakIdx - maxBackFrames); k--) {
      // Look for a preHoldFrames run of speed < STILL starting at k.
      let allStill = true;
      for (let j = 0; j < preHoldFrames && k - j >= 0; j++) {
        const v = speed[k - j];
        if (!Number.isFinite(v) || v >= still) {
          allStill = false;
          break;
        }
      }
      if (allStill) {
        startIdx = Math.max(0, k - preHoldFrames + 1);
        break;
      }
      startIdx = k;
    }
    // Walk forward for a still-hold window (finish).
    let endIdx = burst.peakIdx;
    for (let k = burst.peakIdx + 1; k < Math.min(frames.length, burst.peakIdx + maxForwardFrames); k++) {
      let allStill = true;
      for (let j = 0; j < postHoldFrames && k + j < frames.length; j++) {
        const v = speed[k + j];
        if (!Number.isFinite(v) || v >= still) {
          allStill = false;
          break;
        }
      }
      if (allStill) {
        endIdx = Math.min(frames.length - 1, k + postHoldFrames - 1);
        break;
      }
      endIdx = k;
    }

    const durationMs = (endIdx - startIdx) * dt * 1000;
    // Score components in [0..1]:
    // • peak: normalized against a strong-swing reference (12 m/s for 3D,
    //   1.5 unit/s for normalized 2D). Clipped at 1.
    const peakRef = track.is3D ? 12 : 1.5;
    const peakScore = Math.min(1, burst.peakSpeed / peakRef);
    // • duration: peak at ~2.3s, half-height at 1s and 4s. Discourages
    //   micro-motions (waggle) and slow drills.
    const target = 2300;
    const durationScore = Math.max(0, 1 - Math.abs(durationMs - target) / target);
    // • boundedness: whether we actually hit stillness on both sides
    //   vs. clipping to the video edge.
    const startBounded = startIdx > 0 ? 1 : 0.5;
    const endBounded = endIdx < frames.length - 1 ? 1 : 0.5;
    const boundedScore = (startBounded + endBounded) / 2;
    const confidence = 0.5 * peakScore + 0.3 * durationScore + 0.2 * boundedScore;

    candidates.push({
      startIdx,
      endIdx,
      startT: frames[startIdx].t,
      endT: frames[endIdx].t,
      peakT: frames[burst.peakIdx].t,
      peakSpeed: burst.peakSpeed,
      confidence,
    });
  }

  // Step 3 · Merge overlapping candidates (keep highest-confidence).
  candidates.sort((a, b) => a.startIdx - b.startIdx);
  const merged: typeof candidates = [];
  for (const c of candidates) {
    const last = merged[merged.length - 1];
    if (last && c.startIdx <= last.endIdx) {
      if (c.confidence > last.confidence) merged[merged.length - 1] = c;
    } else {
      merged.push(c);
    }
  }

  // Step 4 · Return sorted by confidence, stripping internal indices.
  return merged
    .map(({ startT, endT, peakT, peakSpeed, confidence }) => ({
      startT,
      endT,
      peakT,
      peakSpeed,
      confidence,
    }))
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Deterministic segmentation driven by wrist speed magnitude and wrist arc
 * geometry — signals that survive DTL vs face-on camera changes far better
 * than shoulder rotation. Each event has a physically-grounded definition,
 * not just "some threshold crossing":
 *
 *   Address  = last still frame before Takeaway (walk backward from Takeaway)
 *   Takeaway = first frame after start where wrist speed exceeds MOVING
 *   Top      = wrist Y extremum (highest hands) within backswing window,
 *              cross-checked against a nearby speed minimum
 *   Impact   = wrist Y extremum (lowest hands = bottom of arc) between Top
 *              and end, cross-validated with the speed peak; falls back to
 *              speed peak alone when the arc bottom is degenerate
 *   Finish   = first ~300ms window after Impact where speed decays and
 *              stays below STILL
 *
 * Thresholds are adaptive percentiles of the observed speed distribution,
 * so a slow senior swing and a fast pro swing both segment correctly. The
 * pipeline emits a warning when detected timings fall outside plausible
 * human ranges (backswing 200–2500ms, downswing 80–800ms) but still returns
 * the events so callers can inspect them.
 */
function segmentEvents(
  frames: SwingFrame[],
  sampledFps: number,
): {
  events: Partial<Record<SwingEventName, SwingEvent>>;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (frames.length < 8) {
    return { events: {}, warnings: ['프레임 수가 부족해 이벤트를 감지할 수 없습니다.'] };
  }

  const track = extractWristTrack(frames);
  const validCount = track.positions.filter((p) => p !== null).length;
  if (validCount < frames.length * 0.4) {
    return {
      events: {},
      warnings: ['손목 랜드마크 감지 실패가 많아 이벤트를 감지할 수 없습니다. 전신이 화면에 잘 들어오도록 촬영해 주세요.'],
    };
  }

  const dt = sampledFps > 0 ? 1 / sampledFps : 1 / 30;

  // Per-frame speed magnitude (m/s in 3D mode, unit/s in 2D fallback mode).
  const rawSpeed: number[] = new Array(frames.length).fill(NaN);
  for (let i = 1; i < frames.length; i++) {
    const a = track.positions[i - 1];
    const b = track.positions[i];
    if (!a || !b) continue;
    rawSpeed[i] = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / dt;
  }
  // Smoothing over ~100ms cancels landmark flicker without hiding the
  // hundred-millisecond speed spike at impact.
  const halfWin = Math.max(1, Math.round(sampledFps * 0.05));
  const speed = smooth(rawSpeed, halfWin);
  const wristY = smooth(
    track.positions.map((p) => (p ? p.y : NaN)),
    halfWin,
  );

  const { still: STILL, moving: MOVING } = adaptiveSpeedThresholds(speed, track.is3D);

  // ── Takeaway: first frame where speed sustainably exceeds MOVING ────────
  // "Sustainable" = the next 3 frames also stay above STILL, so we don't
  // trip on a single-frame landmark glitch.
  let takeawayIdx = -1;
  const sustainedFrames = Math.max(2, Math.round(sampledFps * 0.08));
  for (let i = 1; i < frames.length - sustainedFrames; i++) {
    if (!(speed[i] > MOVING)) continue;
    let sustained = true;
    for (let j = 1; j <= sustainedFrames; j++) {
      if (!(speed[i + j] > STILL)) {
        sustained = false;
        break;
      }
    }
    if (sustained) {
      takeawayIdx = i;
      break;
    }
  }
  if (takeawayIdx < 0) {
    warnings.push('백스윙 시작을 감지하지 못했습니다. 스윙 전체가 영상에 담겼는지 확인해 주세요.');
  }

  // ── Address: walk backward from Takeaway until speed drops below STILL ─
  // Physically the address is "when the hands stop moving before the swing
  // starts", so backward search from Takeaway is exact — no need to guess a
  // stable window from frame 0 that might have never existed (trimmed clips).
  let addressIdx = 0;
  let addressFoundStill = false;
  if (takeawayIdx > 0) {
    let idx = takeawayIdx - 1;
    while (idx >= 1) {
      const v = speed[idx];
      if (Number.isFinite(v) && v < STILL) {
        addressFoundStill = true;
        break;
      }
      idx -= 1;
    }
    addressIdx = Math.max(0, idx);
    if (!addressFoundStill) {
      // Walked all the way back without finding a still frame → the clip
      // started mid-motion (trimmed too tight to the swing).
      warnings.push('영상이 어드레스 이후에 시작된 것 같습니다. 자세 지표 정확도가 낮아질 수 있어요.');
    }
  }

  // ── Impact: prefer wrist arc bottom, cross-check against speed peak ────
  // Peak speed usually lands 1–3 frames AFTER contact (whip through release);
  // the arc bottom (lowest wrist Y between Top and end) is closer to actual
  // ball contact for driver / neutral strikes. For irons with descending
  // blows the peak-speed frame is a better proxy, so we cross-validate: if
  // the two frames are within ~60ms, average them; if the arc bottom gives a
  // physically implausible downswing (<80ms or >800ms) fall back to speed.
  let impactIdx = -1;
  if (takeawayIdx > 0) {
    const searchStart = takeawayIdx + Math.max(3, Math.round(sampledFps * 0.15));
    const searchEnd = frames.length - 1;
    if (searchEnd > searchStart) {
      const speedPeakIdx = argExtremum(speed, searchStart, searchEnd, 'max');
      const arcBottomIdx = argExtremum(wristY, searchStart, searchEnd, 'max'); // world Y ↓, so bottom = MAX y
      const speedPeakOk = speedPeakIdx > 0 && speed[speedPeakIdx] > MOVING;
      const gapMs = Math.abs(speedPeakIdx - arcBottomIdx) * dt * 1000;
      if (speedPeakOk && arcBottomIdx > 0 && gapMs < 60) {
        impactIdx = Math.round((speedPeakIdx + arcBottomIdx) / 2);
      } else if (speedPeakOk) {
        impactIdx = speedPeakIdx;
      } else if (arcBottomIdx > 0) {
        impactIdx = arcBottomIdx;
      }
    }
  }
  if (impactIdx > 0 && (Number.isNaN(speed[impactIdx]) || speed[impactIdx] < MOVING * 0.6)) {
    warnings.push('임팩트 지점의 손목 속도가 낮아 신뢰도가 떨어집니다.');
  }

  // ── Top: highest hands (min wrist Y in world coords) inside the
  // Takeaway→Impact bracket, sanity-checked against a nearby speed minimum.
  // Wrist Y max is the physical definition of the top of backswing; using
  // speed alone can pick spurious noise dips in a rushed transition.
  let topIdx = -1;
  if (takeawayIdx > 0 && impactIdx > 0 && impactIdx - takeawayIdx > 4) {
    const bracketFrom = takeawayIdx + 2;
    const bracketTo = impactIdx - 2;
    // Highest hands = min world-Y (MediaPipe Y points down).
    const yMinIdx = argExtremum(wristY, bracketFrom, bracketTo, 'min');
    const speedMinIdx = argExtremum(speed, bracketFrom, bracketTo, 'min');
    if (yMinIdx > 0) {
      // Prefer the Y-based top; nudge toward the speed minimum only if they
      // agree within ~200ms (which they typically do on real swings).
      const gapMs = Math.abs(yMinIdx - speedMinIdx) * dt * 1000;
      topIdx = gapMs < 200 && speedMinIdx > 0
        ? Math.round((yMinIdx * 2 + speedMinIdx) / 3)
        : yMinIdx;
    } else if (speedMinIdx > 0) {
      topIdx = speedMinIdx;
    }
  }

  // ── Finish: first sustained still window after Impact ───────────────────
  // "Sustained" = 250ms of speed < STILL. Prevents the choice from jumping to
  // the very last frame just because the clip has a long static tail.
  let finishIdx = frames.length - 1;
  if (impactIdx > 0) {
    const holdFrames = Math.max(3, Math.round(sampledFps * 0.25));
    for (let i = impactIdx + holdFrames; i + holdFrames < frames.length; i++) {
      let stillWindow = true;
      for (let j = 0; j < holdFrames; j++) {
        const v = speed[i + j];
        if (Number.isNaN(v) || v >= STILL) {
          stillWindow = false;
          break;
        }
      }
      if (stillWindow) {
        finishIdx = i;
        break;
      }
    }
  }

  // ── Sanity check plausible timings ──────────────────────────────────────
  if (takeawayIdx > 0 && topIdx > 0) {
    const backswingMs = (topIdx - takeawayIdx) * dt * 1000;
    if (backswingMs < 200 || backswingMs > 2500) {
      warnings.push(`백스윙 지속시간(${Math.round(backswingMs)}ms)이 이례적입니다. Top 감지가 부정확할 수 있어요.`);
    }
  }
  if (topIdx > 0 && impactIdx > 0) {
    const downswingMs = (impactIdx - topIdx) * dt * 1000;
    if (downswingMs < 80 || downswingMs > 800) {
      warnings.push(`다운스윙 지속시간(${Math.round(downswingMs)}ms)이 이례적입니다. Top/Impact 위치를 확인해 주세요.`);
    }
  }

  if (!track.is3D) {
    warnings.push(
      '3D 랜드마크를 얻지 못해 2D 좌표로 감지했습니다. 정확도가 다소 떨어질 수 있습니다.',
    );
  }

  const build = (name: SwingEventName, idx: number): SwingEvent | undefined => {
    if (idx < 0 || idx >= frames.length) return undefined;
    return { name, frameIndex: idx, t: frames[idx].t, metrics: { ...frames[idx].angles } };
  };

  /**
   * Refine an event's timing to sub-frame precision by fitting a parabola
   * through the surrounding samples of `signal`. Mutates the event in place
   * so callers keep the same object reference.
   */
  const refine = (
    event: SwingEvent | undefined,
    signal: number[],
    mode: 'max' | 'min',
  ): void => {
    if (!event) return;
    const k = event.frameIndex;
    if (k <= 0 || k >= frames.length - 1) return;
    // Parabolic formula assumes k is the local extremum. For minima we work
    // on the negated signal so the same math finds the true bottom.
    const source = mode === 'min' ? signal.map((v) => (Number.isFinite(v) ? -v : v)) : signal;
    const refined = parabolicRefine(source, k);
    if (!refined) return;
    const nextT = frames[k].t + refined.offset * dt;
    if (!Number.isFinite(nextT) || nextT < 0) return;
    event.t = +nextT.toFixed(4);
    event.subFrameOffset = +refined.offset.toFixed(3);
  };

  const events: Partial<Record<SwingEventName, SwingEvent>> = {};
  const address = build('address', addressIdx);
  const takeaway = takeawayIdx >= 0 ? build('takeaway', takeawayIdx) : undefined;
  const top = topIdx >= 0 ? build('top', topIdx) : undefined;
  const impact = impactIdx >= 0 ? build('impact', impactIdx) : undefined;
  const finish = build('finish', finishIdx);

  // ── Half-phase markers: LEAD arm parallel to the ground ────────────────
  // TPI P3 / P6 / P8 are all defined by "lead arm horizontal", not by time
  // or wrist height. The lead arm is the straight arm through the swing;
  // the trail arm folds at the elbow so averaging L+R gives a vector that
  // doesn't represent the actual arm plane. We detect handedness inline
  // (from the Top frame we just found) and use LEAD arm only.
  //
  // Signal: project the (leadWrist − leadShoulder) offset onto the gravity
  // axis. That projection is the arm's vertical drop from the shoulder.
  // At address it's ~ +armLength (arm hangs down); at P3 it crosses zero
  // (wrist at shoulder height = horizontal); at Top it's negative (wrist
  // above shoulder). The zero-crossing frame is the physical arm-horizontal
  // moment.
  //
  // Falls back to wrist-Y midpoint when gravity is unavailable (2D-only
  // frames, missing lower-body landmarks in a tightly cropped shot).
  const gravity = track.is3D
    ? estimateGravityFromAddress(frames, addressIdx, Math.min(8, frames.length - addressIdx))
    : undefined;
  const hand: Handedness = topIdx > 0 ? detectHandedness(frames, topIdx) : 'unknown';
  const leadShoulderIdx = hand === 'left' ? 12 : 11;
  const leadWristIdx = hand === 'left' ? 16 : 15;

  /** Vertical drop of the lead wrist below the lead shoulder, along gravity.
   *  Positive = wrist below shoulder (backswing start, address, impact).
   *  Zero    = wrist at shoulder height (arm horizontal — P3/P6/P8).
   *  Negative = wrist above shoulder (top of backswing). */
  const leadWristVerticalDrop = (frameIdx: number): number => {
    if (!gravity) return NaN;
    const w = frames[frameIdx]?.worldKeypoints;
    if (!w) return NaN;
    const s = toVec3(w[leadShoulderIdx]);
    const wr = toVec3(w[leadWristIdx]);
    if (!s || !wr) return NaN;
    const offset = subtract(wr, s);
    // Project onto -gravity (down direction): positive when wrist is below
    // the shoulder. gravity is a unit "up" vector.
    return -(offset.x * gravity.x + offset.y * gravity.y + offset.z * gravity.z);
  };

  const halfMarker = (fromIdx: number, toIdx: number): number => {
    if (fromIdx < 0 || toIdx < 0 || toIdx - fromIdx < 3) return -1;
    // Physical: find the frame closest to arm-horizontal (drop crosses 0).
    if (gravity && hand !== 'unknown') {
      let bestIdx = -1;
      let bestDelta = Infinity;
      for (let i = fromIdx + 1; i < toIdx; i++) {
        const d = leadWristVerticalDrop(i);
        if (!Number.isFinite(d)) continue;
        const absD = Math.abs(d);
        if (absD < bestDelta) {
          bestDelta = absD;
          bestIdx = i;
        }
      }
      // Trust the physical detection only when the wrist gets within 15cm
      // of true shoulder height. Short/punch swings that never reach P3
      // fall through to the geometric midpoint instead of latching to a
      // spuriously-close-to-zero frame at a bracket edge.
      if (bestIdx > 0 && bestDelta < 0.15) return bestIdx;
    }
    // Geometric fallback: wrist Y midpoint between the two parent frames.
    const yStart = wristY[fromIdx];
    const yEnd = wristY[toIdx];
    if (!Number.isFinite(yStart) || !Number.isFinite(yEnd)) {
      return Math.round((fromIdx + toIdx) / 2);
    }
    const target = (yStart + yEnd) / 2;
    let bestIdx = -1;
    let bestDelta = Infinity;
    for (let i = fromIdx + 1; i < toIdx; i++) {
      const y = wristY[i];
      if (!Number.isFinite(y)) continue;
      const d = Math.abs(y - target);
      if (d < bestDelta) {
        bestDelta = d;
        bestIdx = i;
      }
    }
    return bestIdx > 0 ? bestIdx : Math.round((fromIdx + toIdx) / 2);
  };

  const halfBackIdx = addressIdx >= 0 && topIdx > 0 ? halfMarker(addressIdx, topIdx) : -1;
  const midDownIdx = topIdx > 0 && impactIdx > 0 ? halfMarker(topIdx, impactIdx) : -1;
  const followIdx = impactIdx > 0 && finishIdx > 0 ? halfMarker(impactIdx, finishIdx) : -1;

  const halfBackswing = halfBackIdx > 0 ? build('half_backswing', halfBackIdx) : undefined;
  const midDownswing = midDownIdx > 0 ? build('mid_downswing', midDownIdx) : undefined;
  const followThrough = followIdx > 0 ? build('follow_through', followIdx) : undefined;

  // Sub-frame refinement matters most for Impact (peak speed, drives every
  // downstream physics metric) and Top (wrist-Y min, transition timing).
  // Refine each against the signal that actually picked it, not a proxy.
  refine(impact, speed, 'max');
  refine(top, wristY, 'min');
  if (address) events.address = address;
  if (takeaway) events.takeaway = takeaway;
  if (halfBackswing) events.half_backswing = halfBackswing;
  if (top) events.top = top;
  if (midDownswing) events.mid_downswing = midDownswing;
  if (impact) events.impact = impact;
  if (followThrough) events.follow_through = followThrough;
  if (finish) events.finish = finish;
  enrichImpactDiagnostics(events, frames);
  enrichRotationFromAddress(events, frames);
  enrichLateralVerticalDrift(events, frames);
  return { events, warnings };
}

/**
 * Foreshortening-based rotation around vertical, computed from the visible
 * image-plane distance between two symmetric landmarks (shoulders, hips).
 * As the golfer rotates away from parallel-to-camera, the projected
 * distance shrinks exactly as cos(rotation) — a direct measurement that
 * doesn't touch MediaPipe's monocular Z estimate.
 *
 * Sign convention: for a right-hander backswing, the lead (left) shoulder
 * rises and the trail (right) shoulder drops relative to address; that
 * tilt asymmetry gives the direction without needing depth.
 *
 * Returns undefined when address confidence is too low or the address
 * distance is degenerate (subject facing camera badly, occluded).
 */
function rotationFromForeshortening2D(
  addressKp: SkeletonKeypoint[] | undefined,
  currentKp: SkeletonKeypoint[] | undefined,
  leftIdx: number,
  rightIdx: number,
): number | undefined {
  if (!addressKp || !currentKp) return undefined;
  const aL = addressKp[leftIdx];
  const aR = addressKp[rightIdx];
  const cL = currentKp[leftIdx];
  const cR = currentKp[rightIdx];
  if (!aL || !aR || !cL || !cR) return undefined;
  if (aL.confidence < 0.3 || aR.confidence < 0.3) return undefined;
  if (cL.confidence < 0.3 || cR.confidence < 0.3) return undefined;
  const addrWidth = Math.hypot(aR.x - aL.x, aR.y - aL.y);
  if (addrWidth < 0.02) return undefined; // subject facing badly / occluded
  const curWidth = Math.hypot(cR.x - cL.x, cR.y - cL.y);
  // Clamp ratio: numerical noise can push it slightly >1 (both shoulders
  // moved apart in image due to camera drift) — a negative-rotation
  // interpretation would be wrong, so cap at 1.
  const ratio = Math.max(0, Math.min(1, curWidth / addrWidth));
  const magnitude = toDeg(Math.acos(ratio));
  // Sign from left/right vertical asymmetry vs address. In face-on view,
  // a right-handed backswing lifts the LEFT shoulder (y decreases in
  // MediaPipe image coords) and drops the RIGHT — the tilt change flips
  // sign as we go through top → impact → finish.
  const addrTilt = aR.y - aL.y;      // baseline vertical delta
  const curTilt = cR.y - cL.y;
  const tiltDelta = curTilt - addrTilt;
  // Threshold guards against near-zero tilt noise flipping the sign.
  if (Math.abs(tiltDelta) < 0.003 && magnitude < 5) return 0;
  const sign = tiltDelta >= 0 ? 1 : -1;
  return sign * magnitude;
}

/**
 * Write shoulder/pelvis rotation deltas from the address pose onto every
 * event. Coaches read rotations as "how far turned from address", not as
 * absolute world-frame angles — showing +90° at the top and +40° at impact
 * is intuitive; showing 174° / 44° in raw atan2 space isn't.
 *
 * Sign-preserving: backswing direction stays positive on right-handed swings
 * (and negative on left-handed) so a coach can spot reverse pivots at a
 * glance without needing a legend.
 */
function enrichRotationFromAddress(
  events: Partial<Record<SwingEventName, SwingEvent>>,
  frames: SwingFrame[],
): void {
  const address = events.address;
  if (!address) return;
  const shoulderAtAddress = address.metrics.shoulderRotation;
  const pelvisAtAddress = address.metrics.pelvisRotation;
  const addressKp = frames[address.frameIndex]?.keypoints;
  // ±180 wraparound: pick the shorter signed arc so a rotation from 170° to
  // −170° reads as +20°, not −340°.
  const shortestArc = (delta: number): number => {
    let d = delta % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  };
  for (const evt of Object.values(events)) {
    if (!evt) continue;
    // Z-based rotation delta (works well in DTL, noisy in face-on because
    // MediaPipe's monocular Z is heuristic).
    if (typeof shoulderAtAddress === 'number' && typeof evt.metrics.shoulderRotation === 'number') {
      evt.metrics.shoulderRotationFromAddress = +shortestArc(
        evt.metrics.shoulderRotation - shoulderAtAddress,
      ).toFixed(1);
    }
    if (typeof pelvisAtAddress === 'number' && typeof evt.metrics.pelvisRotation === 'number') {
      evt.metrics.pelvisRotationFromAddress = +shortestArc(
        evt.metrics.pelvisRotation - pelvisAtAddress,
      ).toFixed(1);
    }
    // Foreshortening-based rotation delta — the accurate signal for face-on
    // view. Stored under a separate key so the UI / summary can select the
    // right one based on cameraView without losing the DTL-native reading.
    const evtKp = frames[evt.frameIndex]?.keypoints;
    const shoulderFore = rotationFromForeshortening2D(addressKp, evtKp, 11, 12);
    if (typeof shoulderFore === 'number') {
      evt.metrics.shoulderRotationFromAddress2D = +shoulderFore.toFixed(1);
    }
    const pelvisFore = rotationFromForeshortening2D(addressKp, evtKp, 23, 24);
    if (typeof pelvisFore === 'number') {
      evt.metrics.pelvisRotationFromAddress2D = +pelvisFore.toFixed(1);
    }
    // X-Factor stretch from address baseline (shoulder − pelvis delta,
    // relative to address so a coach sees how much MORE separation was
    // gained through the swing).
    if (
      typeof evt.metrics.shoulderRotationFromAddress === 'number' &&
      typeof evt.metrics.pelvisRotationFromAddress === 'number'
    ) {
      evt.metrics.hipShoulderSeparationFromAddress = +(
        evt.metrics.shoulderRotationFromAddress - evt.metrics.pelvisRotationFromAddress
      ).toFixed(1);
    }
    // X-Factor from foreshortening — same idea but using the face-on
    // accurate rotations.
    if (
      typeof evt.metrics.shoulderRotationFromAddress2D === 'number' &&
      typeof evt.metrics.pelvisRotationFromAddress2D === 'number'
    ) {
      evt.metrics.hipShoulderSeparationFromAddress2D = +(
        evt.metrics.shoulderRotationFromAddress2D - evt.metrics.pelvisRotationFromAddress2D
      ).toFixed(1);
    }
    // Torso lateral tilt delta from address baseline. Address's absolute
    // value is the golfer's setup tilt (usually a small trail-side bias
    // for right-handers); the delta shows how much the tilt CHANGED
    // through the swing, which is what coaches actually diagnose from.
    const torsoAtAddress = address.metrics.torsoLateralTiltDeg;
    if (
      typeof torsoAtAddress === 'number' &&
      typeof evt.metrics.torsoLateralTiltDeg === 'number'
    ) {
      evt.metrics.torsoLateralTiltFromAddress = +(
        evt.metrics.torsoLateralTiltDeg - torsoAtAddress
      ).toFixed(1);
    }
  }
}

/**
 * Add impact-event diagnostics that are meaningful only as a delta from
 * address: head sway (mm), hip Z-drift toward the camera / early extension
 * (mm), and spine-tilt loss (deg). Delta-form is deliberate — camera tilt
 * cancels out, so these read correctly on handheld shots the raw absolute
 * angles are unreliable on.
 */
/**
 * Face-on lateral (X) and vertical (Y) displacement of head and hips at
 * every pose, in millimeters relative to address. This is the pair of
 * signals a coach actually reads off a face-on clip:
 *
 *   - Head lateral   → 스웨이 / 리버스 피벗
 *   - Head vertical  → 헤드 바브 (fat/thin, topping 의 근본 원인)
 *   - Hip lateral    → 체중이동 / 힙 슬라이드
 *   - Hip vertical   → 스쿼트 / 스탠드업 (얼리 익스텐션의 2D 대응)
 *
 * Uses NORMALISED 2D keypoints (image plane, 0..1) scaled to millimeters
 * via the address shoulder width — that's stable across camera distance
 * because the golfer's actual shoulder width is a known reference
 * (assumed 400mm for the average adult). Independent of MediaPipe's
 * noisy monocular Z.
 *
 * Sign convention: +X = right in image; +Y = UP (flipped from MediaPipe's
 * Y-down) so a rising head reads as positive, matching coach intuition.
 */
function enrichLateralVerticalDrift(
  events: Partial<Record<SwingEventName, SwingEvent>>,
  frames: SwingFrame[],
): void {
  const address = events.address;
  if (!address) return;
  const addrKp = frames[address.frameIndex]?.keypoints;
  if (!addrKp) return;
  const addrLs = addrKp[11];
  const addrRs = addrKp[12];
  const addrLh = addrKp[23];
  const addrRh = addrKp[24];
  const addrNose = addrKp[0];
  if (!addrLs || !addrRs) return; // shoulder-width scale is essential
  if (addrLs.confidence < 0.3 || addrRs.confidence < 0.3) return;
  // Scale factor from normalised image units → millimeters, anchored to
  // the golfer's actual shoulder span at address.
  const addrShoulderWidthNorm = Math.hypot(
    addrRs.x - addrLs.x,
    addrRs.y - addrLs.y,
  );
  if (addrShoulderWidthNorm < 0.02) return; // subject too small / facing badly
  const ASSUMED_SHOULDER_WIDTH_MM = 400;
  const scaleMm = ASSUMED_SHOULDER_WIDTH_MM / addrShoulderWidthNorm;

  // Head + hip anchors are independent — either can be missing without
  // blocking the other. Occluded nose (baseball cap / low camera) shouldn't
  // hide the coach's ability to see hip slide, and vice versa.
  const headOk =
    !!addrNose && addrNose.confidence >= 0.3;
  const hipsOk =
    !!addrLh && !!addrRh && addrLh.confidence >= 0.3 && addrRh.confidence >= 0.3;
  const addrHipCx = hipsOk ? (addrLh!.x + addrRh!.x) / 2 : 0;
  const addrHipCy = hipsOk ? (addrLh!.y + addrRh!.y) / 2 : 0;

  for (const evt of Object.values(events)) {
    if (!evt) continue;
    const kp = frames[evt.frameIndex]?.keypoints;
    if (!kp) continue;
    if (headOk) {
      const nose = kp[0];
      if (nose && nose.confidence >= 0.3) {
        const dx = (nose.x - addrNose!.x) * scaleMm;
        const dy = (addrNose!.y - nose.y) * scaleMm; // flip: + = up
        evt.metrics.headLateralMmFromAddress = +dx.toFixed(0);
        evt.metrics.headVerticalMmFromAddress = +dy.toFixed(0);
      }
    }
    if (hipsOk) {
      const lh = kp[23];
      const rh = kp[24];
      if (lh && rh && lh.confidence >= 0.3 && rh.confidence >= 0.3) {
        const hipCx = (lh.x + rh.x) / 2;
        const hipCy = (lh.y + rh.y) / 2;
        const dx = (hipCx - addrHipCx) * scaleMm;
        const dy = (addrHipCy - hipCy) * scaleMm; // flip: + = up
        evt.metrics.hipLateralMmFromAddress = +dx.toFixed(0);
        evt.metrics.hipVerticalMmFromAddress = +dy.toFixed(0);
      }
    }
  }
}

function enrichImpactDiagnostics(
  events: Partial<Record<SwingEventName, SwingEvent>>,
  frames: SwingFrame[],
): void {
  const { address, impact } = events;
  if (!address || !impact) return;
  const aWorld = frames[address.frameIndex]?.worldKeypoints;
  const iWorld = frames[impact.frameIndex]?.worldKeypoints;
  if (!aWorld || !iWorld) return;

  const aNose = toVec3(aWorld[0]);
  const iNose = toVec3(iWorld[0]);
  if (aNose && iNose) {
    // Horizontal (X) drift of the head from address to impact. Good players
    // hold the head fairly still (<50 mm); large sways correlate with fat/thin
    // contact.
    impact.metrics.headSwayMm = Math.abs(iNose.x - aNose.x) * 1000;
  }

  const aLh = toVec3(aWorld[23]);
  const aRh = toVec3(aWorld[24]);
  const iLh = toVec3(iWorld[23]);
  const iRh = toVec3(iWorld[24]);
  if (aLh && aRh && iLh && iRh) {
    // MediaPipe world Z points away from the camera; hips drifting toward the
    // camera during the downswing (early extension) shows up as a NEGATIVE Z
    // delta. Report the magnitude so higher = worse, with sign preserved in a
    // second key for downstream consumers that care about direction.
    const aZ = (aLh.z + aRh.z) / 2;
    const iZ = (iLh.z + iRh.z) / 2;
    const dz = iZ - aZ;
    impact.metrics.earlyExtensionMm = Math.abs(dz) * 1000;
    impact.metrics.hipDriftZSignedMm = dz * 1000;
  }

  const aSpine = address.metrics.spineTilt3D;
  const iSpine = impact.metrics.spineTilt3D;
  if (typeof aSpine === 'number' && typeof iSpine === 'number') {
    // Change in forward spine tilt from address to impact. Losing posture
    // (standing up through impact) shows up as a negative delta.
    impact.metrics.spineTiltDelta = iSpine - aSpine;
  }
}

/**
 * Detect handedness by comparing arm extension at Top. The lead arm stays
 * (almost) straight through the backswing while the trail arm folds — so the
 * arm with the larger elbow angle at Top is the lead arm. Right-handed player
 * → lead is left arm. Returns 'unknown' when the two arms are within 10° of
 * each other or landmarks are missing.
 */
function detectHandedness(frames: SwingFrame[], topIdx: number): Handedness {
  const world = frames[topIdx]?.worldKeypoints;
  if (!world) return 'unknown';
  const ls = toVec3(world[11]);
  const le = toVec3(world[13]);
  const lw = toVec3(world[15]);
  const rs = toVec3(world[12]);
  const re = toVec3(world[14]);
  const rw = toVec3(world[16]);
  if (!ls || !le || !lw || !rs || !re || !rw) return 'unknown';
  const lElbow = angle3D(ls, le, lw);
  const rElbow = angle3D(rs, re, rw);
  if (!Number.isFinite(lElbow) || !Number.isFinite(rElbow)) return 'unknown';
  const diff = lElbow - rElbow;
  if (Math.abs(diff) < 10) return 'unknown';
  return diff > 0 ? 'right' : 'left';
}

/** Landmark index of the player's lead wrist given detected handedness. */
function leadWristIndex(handedness: Handedness): number {
  return handedness === 'left' ? 16 : 15;
}

/**
 * Attack angle at impact: angle of the lead-wrist velocity vector from
 * horizontal, in degrees. Uses a symmetric 2-frame delta around impact. In
 * MediaPipe world coords +Y is down, so a negative dy means the wrist is
 * rising → positive attack angle.
 */
function computeAttackAngle(
  frames: SwingFrame[],
  impactIdx: number,
  handedness: Handedness,
): number | undefined {
  if (impactIdx <= 0 || impactIdx >= frames.length - 1) return undefined;
  const idx = leadWristIndex(handedness);
  const pre = toVec3(frames[impactIdx - 1]?.worldKeypoints?.[idx]);
  const post = toVec3(frames[impactIdx + 1]?.worldKeypoints?.[idx]);
  if (!pre || !post) return undefined;
  const dx = post.x - pre.x;
  const dy = post.y - pre.y;
  const dz = post.z - pre.z;
  const horizontal = Math.hypot(dx, dz);
  if (horizontal < 1e-6 && Math.abs(dy) < 1e-6) return undefined;
  return +toDeg(Math.atan2(-dy, horizontal)).toFixed(1);
}

/**
 * Unit normal of the lead-wrist swing plane (Top → mid → Impact), or undefined
 * when the arc is degenerate. Extracted so both raw and gravity-corrected
 * plane-tilt calculations can share the same normal.
 */
function computeSwingPlaneNormal(
  frames: SwingFrame[],
  topIdx: number,
  impactIdx: number,
  handedness: Handedness,
): Vec3 | undefined {
  if (topIdx < 0 || impactIdx <= topIdx) return undefined;
  const midIdx = Math.round((topIdx + impactIdx) / 2);
  if (midIdx === topIdx || midIdx === impactIdx) return undefined;
  const leadWrist = leadWristIndex(handedness);
  const p1 = toVec3(frames[topIdx]?.worldKeypoints?.[leadWrist]);
  const p2 = toVec3(frames[midIdx]?.worldKeypoints?.[leadWrist]);
  const p3 = toVec3(frames[impactIdx]?.worldKeypoints?.[leadWrist]);
  if (!p1 || !p2 || !p3) return undefined;
  const v1 = subtract(p2, p1);
  const v2 = subtract(p3, p1);
  const normal = {
    x: v1.y * v2.z - v1.z * v2.y,
    y: v1.z * v2.x - v1.x * v2.z,
    z: v1.x * v2.y - v1.y * v2.x,
  };
  const len = Math.hypot(normal.x, normal.y, normal.z);
  if (len < 1e-6) return undefined;
  return { x: normal.x / len, y: normal.y / len, z: normal.z / len };
}

function computeSwingPlaneAngle(
  frames: SwingFrame[],
  topIdx: number,
  impactIdx: number,
  handedness: Handedness,
): number | undefined {
  const n = computeSwingPlaneNormal(frames, topIdx, impactIdx, handedness);
  if (!n) return undefined;
  // Plane tilt from horizontal = angle between plane normal and camera Y.
  return +toDeg(Math.acos(Math.abs(n.y))).toFixed(1);
}

/** Unsigned angle in degrees between two 3D vectors. */
function angleBetween(a: Vec3, b: Vec3): number {
  const la = Math.hypot(a.x, a.y, a.z);
  const lb = Math.hypot(b.x, b.y, b.z);
  if (la === 0 || lb === 0) return NaN;
  const cos = (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb);
  return toDeg(Math.acos(Math.max(-1, Math.min(1, cos))));
}

/**
 * Estimate an "up" (gravity) unit vector in world coordinates from the address
 * window. The vector from ankle-midpoint to hip-midpoint approximates vertical
 * because the golfer's legs are nearly upright at address; averaging over a
 * few frames cancels landmark jitter. Returns undefined when the required
 * landmarks are missing across the whole window.
 */
function estimateGravityFromAddress(
  frames: SwingFrame[],
  addressIdx: number,
  windowLen = 4,
): Vec3 | undefined {
  const window = frames.slice(addressIdx, addressIdx + windowLen);
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let n = 0;
  for (const f of window) {
    const w = f.worldKeypoints;
    if (!w) continue;
    const lh = toVec3(w[23]);
    const rh = toVec3(w[24]);
    const la = toVec3(w[27]);
    const ra = toVec3(w[28]);
    if (!lh || !rh || !la || !ra) continue;
    const hipC = midpoint(lh, rh);
    const ankC = midpoint(la, ra);
    sx += hipC.x - ankC.x;
    sy += hipC.y - ankC.y;
    sz += hipC.z - ankC.z;
    n += 1;
  }
  if (n === 0) return undefined;
  const len = Math.hypot(sx, sy, sz);
  if (len < 1e-6) return undefined;
  return { x: sx / len, y: sy / len, z: sz / len };
}

/**
 * Write a `spineTiltCorrected` metric (degrees from true vertical) onto each
 * event. This is the semantically clean spine tilt — 0° at fully upright, ~30°
 * at a typical driver address — and doesn't drift with camera pitch/roll the
 * way the raw `spineTilt3D` does.
 */
function annotateCorrectedSpineTilt(
  events: Partial<Record<SwingEventName, SwingEvent>>,
  frames: SwingFrame[],
  gravity: Vec3,
): void {
  for (const evt of Object.values(events)) {
    if (!evt) continue;
    const w = frames[evt.frameIndex]?.worldKeypoints;
    if (!w) continue;
    const ls = toVec3(w[11]);
    const rs = toVec3(w[12]);
    const lh = toVec3(w[23]);
    const rh = toVec3(w[24]);
    if (!ls || !rs || !lh || !rh) continue;
    const spine = subtract(midpoint(ls, rs), midpoint(lh, rh));
    const tilt = angleBetween(spine, gravity);
    if (Number.isFinite(tilt)) evt.metrics.spineTiltCorrected = +tilt.toFixed(1);
  }
}

function buildSummary(
  frames: SwingFrame[],
  events: Partial<Record<SwingEventName, SwingEvent>>,
  sampledFps: number,
  clubHeadDetector?: ClubHeadDetector,
  enableClubTracking = false,
  cameraViewOverride?: CameraView,
): SwingSummary {
  const addressWindow = events.address
    ? frames.slice(events.address.frameIndex, events.address.frameIndex + 4)
    : frames.slice(0, 4);
  const detectedView = detectCameraView(addressWindow);
  // Coach-specified view wins over the heuristic when provided — auto
  // detection is a fallback / cross-check, not the source of truth.
  const cameraView: CameraView = cameraViewOverride ?? detectedView;

  const summary: SwingSummary = { cameraView };
  if (cameraViewOverride && detectedView !== 'unknown' && detectedView !== cameraViewOverride) {
    summary.cameraViewDetected = detectedView;
  }
  // Face-on body centerline: midpoint of the ankles at address in normalized
  // canvas space. Ankles are more stable than hips (they're planted through
  // the swing) so they anchor a reference the rest of the body drifts against.
  if (cameraView === 'face_on' && events.address) {
    const addressKps = frames[events.address.frameIndex]?.keypoints;
    if (addressKps) {
      const la = addressKps[27];
      const ra = addressKps[28];
      if (la && ra && la.confidence >= 0.3 && ra.confidence >= 0.3) {
        summary.bodyCenterlineX = +((la.x + ra.x) / 2).toFixed(4);
      }
    }
  }
  if (events.address && events.top) {
    summary.backswingMs = Math.round((events.top.t - events.address.t) * 1000);
  }
  if (events.top && events.impact) {
    summary.downswingMs = Math.round((events.impact.t - events.top.t) * 1000);
  }
  if (summary.backswingMs && summary.downswingMs && summary.downswingMs > 0) {
    summary.tempoRatio = +(summary.backswingMs / summary.downswingMs).toFixed(2);
  }
  const handedness = events.top ? detectHandedness(frames, events.top.frameIndex) : 'unknown';
  summary.handedness = handedness;
  if (events.top && events.impact) {
    const plane = computeSwingPlaneAngle(
      frames,
      events.top.frameIndex,
      events.impact.frameIndex,
      handedness,
    );
    if (plane != null) summary.swingPlaneAngle = plane;
  }
  if (events.impact) {
    const attack = computeAttackAngle(frames, events.impact.frameIndex, handedness);
    if (attack != null) summary.attackAngle = attack;
  }

  // Gravity correction: recover the true vertical from the address stance and
  // republish the tilt-sensitive metrics against it. Silently no-op on shots
  // where the address landmarks are too incomplete.
  const gravity = events.address
    ? estimateGravityFromAddress(frames, events.address.frameIndex)
    : undefined;
  if (gravity) {
    summary.gravityAligned = true;
    annotateCorrectedSpineTilt(events, frames, gravity);
    if (events.top && events.impact) {
      const normal = computeSwingPlaneNormal(
        frames,
        events.top.frameIndex,
        events.impact.frameIndex,
        handedness,
      );
      if (normal) {
        const raw = angleBetween(normal, gravity);
        // Normal can point either way; fold to [0, 90] before converting to a
        // plane tilt from horizontal.
        const normalVsUp = Math.min(raw, 180 - raw);
        summary.swingPlaneAngleCorrected = +(90 - normalVsUp).toFixed(1);
      }
    }
  } else {
    summary.gravityAligned = false;
  }
  // Club head augmentation is opt-in. Geometric estimation (Phase C.1) is
  // still too noisy to expose in the coaching UI; keep the code path alive
  // so the ML detector (Phase C.2) can be turned on without a refactor.
  if (enableClubTracking) {
    clubHeadAugmentSummary(summary, frames, events, clubHeadDetector);
  }
  // Swing plane classification — bucket the numeric plane angle into the
  // coaching vocabulary (very flat → very upright). Only meaningful in DTL
  // view; from face-on the plane collapses into 2D and the number's an
  // artefact. Prefer the gravity-corrected angle; fall back to the raw one
  // when the address stance couldn't recover an "up" vector.
  const planeAngle = summary.swingPlaneAngleCorrected ?? summary.swingPlaneAngle;
  if (
    typeof planeAngle === 'number' &&
    Number.isFinite(planeAngle) &&
    cameraView === 'down_the_line'
  ) {
    summary.swingPlaneClassification =
      planeAngle < 35 ? 'very_flat' :
      planeAngle < 45 ? 'flat' :
      planeAngle < 55 ? 'neutral' :
      planeAngle < 65 ? 'upright' : 'very_upright';
  }
  // Downswing wrist arc for DTL trajectory overlay. Sample the lead wrist
  // every frame from Top → Impact in normalised image space so the UI can
  // draw a polyline without touching the raw frame data. Emit only when
  // the caller is on DTL (the arc reads as a chord in face-on and just
  // clutters the snapshot).
  if (cameraView === 'down_the_line' && events.top && events.impact) {
    const leadIdx = leadWristIndex(handedness);
    const arc: Array<{ x: number; y: number }> = [];
    for (let i = events.top.frameIndex; i <= events.impact.frameIndex; i++) {
      const kp = frames[i]?.keypoints?.[leadIdx];
      if (!kp || kp.confidence < 0.3) continue;
      arc.push({ x: +kp.x.toFixed(4), y: +kp.y.toFixed(4) });
    }
    // Need at least 3 samples to draw a meaningful arc — a chord is what
    // swingPlaneOverlay already renders and duplicating it is noise.
    if (arc.length >= 3) summary.downswingWristArc2D = arc;
  }
  if (events.top && events.impact) {
    const kinetic = computeKineticSequence(
      frames,
      events.top.frameIndex,
      events.impact.frameIndex,
      sampledFps,
      handedness,
    );
    if (kinetic) summary.kineticSequence = kinetic;
  }
  // Full-swing grip path — accurate stand-in for the club-head arc (same
  // plane, differs only by shaft length). Sample the midpoint of both
  // wrists across every frame between the address and the finish (or the
  // full array if either event is missing). Skip frames where either wrist
  // confidence dips below 0.3 so the polyline doesn't ping-pong through a
  // dropout.
  const pathStart = events.address?.frameIndex ?? 0;
  const pathEnd = events.finish?.frameIndex ?? frames.length - 1;
  if (pathEnd - pathStart >= 2) {
    const { leadWrist: leadIdx, trailWrist: trailIdx } = leadTrailWristIndices(
      handedness,
    );
    const path: Array<{ x: number; y: number; t: number }> = [];
    for (let i = pathStart; i <= pathEnd; i++) {
      const kps = frames[i]?.keypoints;
      if (!kps) continue;
      const lw = kps[leadIdx];
      const tw = kps[trailIdx];
      // Prefer the midpoint when both are visible; fall back to either alone
      // (a coach filming with a phone on a tripod often loses one hand behind
      // the body at the top, and skipping the frame breaks the trail there).
      let x: number | undefined;
      let y: number | undefined;
      if (lw && tw && lw.confidence >= 0.3 && tw.confidence >= 0.3) {
        x = (lw.x + tw.x) / 2;
        y = (lw.y + tw.y) / 2;
      } else if (lw && lw.confidence >= 0.3) {
        x = lw.x;
        y = lw.y;
      } else if (tw && tw.confidence >= 0.3) {
        x = tw.x;
        y = tw.y;
      }
      if (x == null || y == null) continue;
      path.push({ x: +x.toFixed(4), y: +y.toFixed(4), t: frames[i].t });
    }
    if (path.length >= 3) summary.handPath2D = path;
  }
  return summary;
}

/**
 * Lead/trail wrist landmark indices for the given handedness. Right-handed
 * setup: left wrist (15) leads, right wrist (16) trails. Mirrored for
 * left-handed and unknown handedness (we default to right).
 */
function leadTrailWristIndices(handedness: Handedness): {
  leadWrist: number;
  trailWrist: number;
} {
  const isLeft = handedness === 'left';
  return {
    leadWrist: isLeft ? 16 : 15,
    trailWrist: isLeft ? 15 : 16,
  };
}

export interface AnalyzeSwingOptions {
  onProgress?: (p: SwingAnalysisProgress) => void;
  /** Optional trim window (seconds) — defaults to full video. */
  startTime?: number;
  endTime?: number;
  /**
   * Optional club head detector. Defaults to the geometric baseline. Pass an
   * MLClubHeadDetector (or any ClubHeadDetector) here to swap in a smarter
   * tracker without changing the pipeline.
   */
  clubHeadDetector?: ClubHeadDetector;
  /**
   * Set true to include club-head-derived metrics (head speed, path angle,
   * impact zone trajectory) in the summary. Defaults to false because the
   * geometric baseline (Phase C.1) isn't accurate enough for coaching yet;
   * flip this on once the ML detector is wired.
   */
  enableClubTracking?: boolean;
  /**
   * Coach's declared camera perspective. When set, downstream metrics are
   * tagged for that view instead of relying on the pose-based auto detector.
   * Undefined = let auto-detection decide.
   */
  cameraView?: CameraView;
  /**
   * When true (default), scan the sampled frames for distinct swing bursts
   * and auto-trim to the highest-confidence one before segmentation. Ignored
   * when the caller passes an explicit startTime/endTime — those still mean
   * "analyze exactly this window" for coach workflows that already picked a
   * segment by hand.
   */
  autoTrim?: boolean;
}

/**
 * Nearest sampled frame index for an absolute video-time in seconds. Handles
 * out-of-range values by clamping to [0, N-1] so callers can pass raw user
 * seek values without extra guards.
 */
function nearestFrameIndex(frames: SwingFrame[], t: number): number {
  if (frames.length === 0) return 0;
  if (t <= frames[0].t) return 0;
  const last = frames.length - 1;
  if (t >= frames[last].t) return last;
  // Linear scan is fine — timelines are ≤500 frames after MAX_FRAMES cap.
  let bestIdx = 0;
  let bestDelta = Math.abs(frames[0].t - t);
  for (let i = 1; i < frames.length; i++) {
    const d = Math.abs(frames[i].t - t);
    if (d < bestDelta) {
      bestDelta = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Shift every event's `frameIndex` by `offset` in-place so they refer to the
 * full-video frame array instead of the analysis slice. Event `t` values are
 * already absolute (they were set from full-video time during sampling), so
 * only the discrete frame index needs adjusting.
 */
function shiftEventIndices(
  events: Partial<Record<SwingEventName, SwingEvent>>,
  offset: number,
): void {
  if (offset === 0) return;
  for (const evt of Object.values(events)) {
    if (!evt) continue;
    evt.frameIndex += offset;
  }
}

/**
 * Coach-supplied edits for re-running the summary without re-sampling the
 * video. Every field is optional; unspecified events keep their current
 * position, and an unspecified interval keeps the current analyzed range.
 */
export interface RebuildAnalysisEdits {
  /** Absolute seconds into the source video for the new analysis window start. */
  intervalStartSec?: number;
  /** Absolute seconds into the source video for the new analysis window end. */
  intervalEndSec?: number;
  /**
   * Coach-picked absolute video time (seconds) per event. Overrides the
   * AI's automatic placement for that event only. Set an event to
   * `undefined` explicitly to force re-detection instead of keeping the
   * previous value.
   */
  eventTimeOverrides?: Partial<Record<SwingEventName, number>>;
}

export const swingAnalysisService = {
  async analyzeSwingFromVideo(
    videoUrl: string,
    options: AnalyzeSwingOptions = {},
  ): Promise<SwingAnalysis> {
    const { onProgress } = options;
    onProgress?.({ processedFrames: 0, totalFrames: 0, stage: 'loading' });

    const landmarker = await initializeVideoLandmarker();
    const video = await loadVideoElement(videoUrl);
    try {
      const nativeFps = await detectVideoFps(video);
      // After the fps probe the video is played briefly; pause and rewind so
      // the sampling loop starts from a clean state.
      video.pause();
      video.currentTime = 0;
      const chosenFps = Math.min(nativeFps, TARGET_FPS_CAP);
      log.info('Video fps detected', { nativeFps, chosenFps });

      const start = Math.max(0, options.startTime ?? 0);
      const end = Math.min(video.duration || 0, options.endTime ?? video.duration ?? 0);
      const span = Math.max(0.1, end - start);
      const desired = Math.min(MAX_FRAMES, Math.max(8, Math.round(span * chosenFps)));
      const dt = span / desired;

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 컨텍스트를 만들 수 없습니다.');

      const frames: SwingFrame[] = [];
      onProgress?.({ processedFrames: 0, totalFrames: desired, stage: 'sampling' });

      for (let i = 0; i < desired; i++) {
        const t = start + i * dt;
        await seekVideo(video, t);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Timestamp must be strictly increasing across detectForVideo calls; ms
        // scale is sufficient.
        const tMs = nextMonotonicTimestamp(Math.round(t * 1000) + i);
        const result = landmarker.detectForVideo(canvas, tMs);
        if (!result.landmarks?.[0]) {
          frames.push({ t, keypoints: [], angles: {}, confidence: 0 });
        } else {
          const lms = result.landmarks[0];
          const worldLms = result.worldLandmarks?.[0];
          const keypoints: SkeletonKeypoint[] = lms.map((lm, index) => ({
            x: lm.x,
            y: lm.y,
            z: lm.z,
            confidence: lm.visibility ?? 0.5,
            name: LANDMARK_NAMES[index] || `point_${index}`,
          }));
          const worldKeypoints: SkeletonKeypoint[] | undefined = worldLms
            ? worldLms.map((lm, index) => ({
                x: lm.x,
                y: lm.y,
                z: lm.z,
                confidence: lm.visibility ?? 0.5,
                name: LANDMARK_NAMES[index] || `point_${index}`,
              }))
            : undefined;
          const angles = worldKeypoints ? computeGolfAngles(worldKeypoints) : {};
          const confidence =
            keypoints.reduce((s, kp) => s + kp.confidence, 0) / (keypoints.length || 1);
          frames.push({ t, keypoints, worldKeypoints, angles, confidence });
        }
        onProgress?.({
          processedFrames: i + 1,
          totalFrames: desired,
          stage: 'sampling',
        });
      }

      onProgress?.({ processedFrames: desired, totalFrames: desired, stage: 'segmenting' });
      const sampledFps = desired / span;

      // ── Auto-trim to the detected swing when the caller didn't specify
      // an explicit window. Handles unedited golfer footage — waggle before
      // the swing, walking to the ball, chatter, or multiple swings in one
      // clip — by picking the highest-confidence burst and running the rest
      // of the pipeline on just that slice.
      let startFrameIdx = 0;
      let endFrameIdx = frames.length - 1;
      let analyzedRange: AnalyzedFrameRange | undefined;
      let detectedInterval: SwingInterval | undefined;
      let alternateIntervals: SwingInterval[] | undefined;
      const autoTrim = options.autoTrim !== false && options.startTime == null && options.endTime == null;
      const extraWarnings: string[] = [];
      if (autoTrim) {
        const candidates = detectSwingIntervals(frames, sampledFps);
        if (candidates.length > 0) {
          detectedInterval = candidates[0];
          alternateIntervals = candidates.slice(1);
          startFrameIdx = nearestFrameIndex(frames, detectedInterval.startT);
          endFrameIdx = nearestFrameIndex(frames, detectedInterval.endT);
          if (endFrameIdx - startFrameIdx < 7) {
            // Too aggressive a trim — fall back to full timeline so the
            // pipeline doesn't fail on an under-sampled slice.
            startFrameIdx = 0;
            endFrameIdx = frames.length - 1;
            detectedInterval = undefined;
            alternateIntervals = undefined;
            extraWarnings.push('감지된 스윙 구간이 너무 짧아 전체 영상으로 분석했습니다.');
          } else {
            analyzedRange = { startFrameIdx, endFrameIdx };
          }
        } else {
          extraWarnings.push('영상에서 스윙 움직임을 뚜렷하게 찾지 못했습니다. 스윙만 담긴 짧은 영상으로 다시 시도해 보세요.');
        }
      }

      // Run the whole pipeline on the analysis slice, then re-anchor event
      // frame indices back into the full `frames` array so the timeline
      // editor can display and drag them across the entire video.
      const workingFrames = frames.slice(startFrameIdx, endFrameIdx + 1);
      const { events, warnings } = segmentEvents(workingFrames, sampledFps);
      warnings.push(...extraWarnings);
      const summary = buildSummary(
        workingFrames,
        events,
        sampledFps,
        options.clubHeadDetector,
        options.enableClubTracking === true,
        options.cameraView,
      );
      shiftEventIndices(events, startFrameIdx);

      onProgress?.({ processedFrames: desired, totalFrames: desired, stage: 'done' });
      log.info('Swing analysis completed', {
        allFrames: frames.length,
        analyzedRange,
        sampledFps,
        nativeFps,
        autoTrimmed: detectedInterval !== undefined,
        detectedInterval,
        alternates: alternateIntervals?.length ?? 0,
        detected: Object.keys(events),
        cameraView: summary.cameraView,
        tempoRatio: summary.tempoRatio,
      });
      return {
        videoUrl,
        frames,
        analyzedRange,
        sampledFps,
        nativeFps,
        videoSize: { width: canvas.width, height: canvas.height },
        detectedInterval,
        alternateIntervals,
        events,
        warnings,
        summary,
      };
    } finally {
      video.src = '';
      video.removeAttribute('src');
      video.load();
    }
  },

  /**
   * Rerun segmentation and summary against the ALREADY-SAMPLED frames of a
   * previous analysis, applying the coach's manual adjustments. Cheap — no
   * video re-sampling, no MediaPipe inference — so it fits into the "drag a
   * marker, click 재분석" edit loop.
   *
   * The coach can:
   *   • move the analysis window (`intervalStartSec` / `intervalEndSec`)
   *   • override any of the 8 pose markers to a specific video time
   *
   * Overrides win over AI detection for that event, but neighbours (and
   * the rest of the summary — tempo, kinetic sequence, impact diagnostics)
   * recompute from the overridden values so the coaching read stays
   * internally consistent.
   */
  rebuildAnalysis(prev: SwingAnalysis, edits: RebuildAnalysisEdits): SwingAnalysis {
    if (prev.frames.length < 8) return prev;
    const frames = prev.frames;
    const sampledFps = prev.sampledFps;

    // Resolve the new analysis window.
    const prevRange = prev.analyzedRange;
    const startIdxFromEdit =
      edits.intervalStartSec != null
        ? nearestFrameIndex(frames, edits.intervalStartSec)
        : (prevRange?.startFrameIdx ?? 0);
    const endIdxFromEdit =
      edits.intervalEndSec != null
        ? nearestFrameIndex(frames, edits.intervalEndSec)
        : (prevRange?.endFrameIdx ?? frames.length - 1);
    let startFrameIdx = Math.max(0, Math.min(startIdxFromEdit, frames.length - 1));
    let endFrameIdx = Math.max(0, Math.min(endIdxFromEdit, frames.length - 1));
    if (endFrameIdx <= startFrameIdx) {
      // Guarantee a non-empty window; nudge end forward when the coach
      // dragged the handles across each other.
      endFrameIdx = Math.min(frames.length - 1, startFrameIdx + 7);
    }
    const analyzedRange: AnalyzedFrameRange = { startFrameIdx, endFrameIdx };

    const workingFrames = frames.slice(startFrameIdx, endFrameIdx + 1);
    const { events, warnings } = segmentEvents(workingFrames, sampledFps);

    // Apply coach overrides in absolute frame space, then translate to
    // local indices for buildSummary. Overrides outside the window get
    // clamped to the nearest edge — the coach explicitly moved a marker
    // there, so we honour the intent instead of dropping the override.
    if (edits.eventTimeOverrides) {
      for (const [name, tSec] of Object.entries(edits.eventTimeOverrides) as Array<
        [SwingEventName, number | undefined]
      >) {
        if (typeof tSec !== 'number' || !Number.isFinite(tSec)) continue;
        const absIdx = nearestFrameIndex(frames, tSec);
        const localIdx = Math.max(
          0,
          Math.min(workingFrames.length - 1, absIdx - startFrameIdx),
        );
        const t = workingFrames[localIdx]?.t;
        if (t == null) continue;
        // Preserve the frame's angle metrics (matches `build` inside
        // segmentEvents) so downstream metric consumers stay consistent.
        events[name] = {
          name,
          frameIndex: localIdx,
          t,
          metrics: { ...(workingFrames[localIdx].angles ?? {}) },
        };
      }
    }

    const summary = buildSummary(
      workingFrames,
      events,
      sampledFps,
      undefined,
      false,
      // Coach's original camera view sticks across rebuilds so their edits
      // don't accidentally flip the analysis into the wrong view template.
      prev.summary.cameraView !== 'unknown' ? prev.summary.cameraView : undefined,
    );
    shiftEventIndices(events, startFrameIdx);

    log.info('Analysis rebuilt with coach edits', {
      analyzedRange,
      overrides: Object.keys(edits.eventTimeOverrides ?? {}),
    });
    return {
      ...prev,
      frames,
      analyzedRange,
      events,
      warnings,
      summary,
    };
  },
};

/** Internal helpers exposed for unit tests. Do not import from app code. */
export const __testing__ = {
  smooth,
  derivative,
  angle3D,
  angleBetween,
  detectCameraView,
  detectHandedness,
  computeAttackAngle,
  computeSwingPlaneAngle,
  computeSwingPlaneNormal,
  computeGolfAngles,
  segmentEvents,
  buildSummary,
  estimateGravityFromAddress,
  parabolicRefine,
  adaptiveSpeedThresholds,
  percentileFinite,
  detectSwingIntervals,
};
