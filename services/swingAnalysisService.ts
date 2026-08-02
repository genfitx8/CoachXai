import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { SkeletonKeypoint } from '../types/postureAnalysis';
import {
  CameraView,
  SwingAnalysis,
  SwingAnalysisProgress,
  SwingEvent,
  SwingEventName,
  SwingFrame,
  SwingSummary,
} from '../types/swingAnalysis';
import { createLogger } from '../utils/logger';

const log = createLogger('swingAnalysisService');

const HEAVY_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task';

// Cap the number of frames we run inference on. A driver swing is ~1.2s; even
// generous 5s clips at 30fps stay under 150. Higher costs GPU time with no
// diagnostic value.
const MAX_FRAMES = 300;
const TARGET_FPS = 30;

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

type Vec3 = { x: number; y: number; z: number };

function toVec3(kp: SkeletonKeypoint | undefined): Vec3 | undefined {
  if (!kp || kp.z == null) return undefined;
  return { x: kp.x, y: kp.y, z: kp.z };
}

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function rotationAroundVertical(left: Vec3, right: Vec3): number {
  const v = subtract(right, left);
  return toDeg(Math.atan2(v.z, v.x));
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
 * Deterministic segmentation with smoothing + velocity-aware impact:
 *   Address = first stable window (smoothed rotation range < 5°)
 *   Top     = frame with max |smoothedRot - address baseline|
 *   Impact  = post-Top frame that both (a) sits near the baseline crossing and
 *             (b) shows max downward wrist velocity — the two agree at real
 *             impact and diverge on noisy short swings, so we score both.
 *   Finish  = last stable rotation window after impact.
 */
function segmentEvents(
  frames: SwingFrame[],
  sampledFps: number,
): {
  events: Partial<Record<SwingEventName, SwingEvent>>;
  warnings: string[];
} {
  const warnings: string[] = [];
  const rawRot = frames.map((f) => f.angles.shoulderRotation ?? NaN);
  const rawWristY = frames.map((f) => f.angles.wristY ?? NaN);
  if (!rawRot.some((v) => !Number.isNaN(v)) || frames.length < 8) {
    return { events: {}, warnings: ['프레임 수가 부족하거나 3D 좌표가 없어 이벤트를 감지할 수 없습니다.'] };
  }

  // ~100ms smoothing window: enough to kill single-frame flicker without
  // washing out the fast downswing (~200ms peak).
  const halfWin = Math.max(1, Math.round(sampledFps * 0.05));
  const rot = smooth(rawRot, halfWin);
  const wristY = smooth(rawWristY, halfWin);
  const dt = sampledFps > 0 ? 1 / sampledFps : 1 / 30;
  const wristVy = derivative(wristY, dt);

  // Address: first 4-frame window where smoothed rotation range < 5°.
  let addressIdx = 0;
  for (let i = 0; i + 3 < frames.length; i++) {
    const w = rot.slice(i, i + 4).filter((v) => !Number.isNaN(v));
    if (w.length < 3) continue;
    if (Math.max(...w) - Math.min(...w) < 5) {
      addressIdx = i;
      break;
    }
  }
  const addressRot = rot[addressIdx] ?? 0;

  // Top: max absolute delta from address baseline.
  const rotDelta = rot.map((v) => (Number.isNaN(v) ? NaN : Math.abs(v - addressRot)));
  const topIdx = argExtremum(rotDelta, addressIdx + 1, frames.length - 1, 'max');
  if (rotDelta[topIdx] < 25) {
    warnings.push('회전량이 작아 백스윙 톱을 확실히 감지하지 못했습니다.');
  }

  // Impact candidates:
  //   crossIdx = first sign-flip of (rot - addressRot) after top
  //   velIdx   = frame with maximum downward wrist velocity after top
  //              (worldLandmarks Y is +down in MediaPipe → wristVy>0 = falling)
  const signAtTop = Math.sign(rot[topIdx] - addressRot);
  let crossIdx = -1;
  for (let i = topIdx + 1; i < frames.length; i++) {
    if (Number.isNaN(rot[i])) continue;
    if (Math.sign(rot[i] - addressRot) !== signAtTop) {
      crossIdx = i;
      break;
    }
  }
  const velIdx = argExtremum(wristVy, topIdx + 1, frames.length - 1, 'max');
  const velHasSignal =
    velIdx > topIdx && !Number.isNaN(wristVy[velIdx]) && wristVy[velIdx] > 0;

  let impactIdx = -1;
  if (crossIdx > 0 && velHasSignal) {
    // Both signals available → pick whichever gives the tighter estimate;
    // if they disagree by more than ~120ms, warn and trust wrist velocity
    // (rotation baseline drifts on tilted cameras).
    const gapFrames = Math.abs(crossIdx - velIdx);
    const gapMs = (gapFrames / Math.max(sampledFps, 1)) * 1000;
    if (gapMs > 120) {
      warnings.push('회전 신호와 손목 속도가 서로 다른 임팩트를 가리킵니다. 손목 속도를 사용합니다.');
      impactIdx = velIdx;
    } else {
      // Small disagreement: average the two (round to nearest frame).
      impactIdx = Math.round((crossIdx + velIdx) / 2);
    }
  } else if (crossIdx > 0) {
    impactIdx = crossIdx;
  } else if (velHasSignal) {
    impactIdx = velIdx;
  } else {
    impactIdx = argExtremum(wristY, topIdx + 1, frames.length - 1, 'max');
    if (Number.isNaN(wristY[impactIdx])) {
      warnings.push('임팩트 지점을 감지하지 못했습니다.');
      impactIdx = -1;
    }
  }

  // Finish: last stable rotation window after impact.
  let finishIdx = frames.length - 1;
  const finishSearchFrom = impactIdx > 0 ? impactIdx + 1 : topIdx + 1;
  for (let i = frames.length - 4; i > finishSearchFrom; i--) {
    const w = rot.slice(i, i + 4).filter((v) => !Number.isNaN(v));
    if (w.length < 3) continue;
    if (Math.max(...w) - Math.min(...w) < 5) {
      finishIdx = i;
      break;
    }
  }

  const build = (name: SwingEventName, idx: number): SwingEvent | undefined => {
    if (idx < 0 || idx >= frames.length) return undefined;
    return { name, frameIndex: idx, t: frames[idx].t, metrics: { ...frames[idx].angles } };
  };

  const events: Partial<Record<SwingEventName, SwingEvent>> = {};
  const address = build('address', addressIdx);
  const top = build('top', topIdx);
  const impact = impactIdx >= 0 ? build('impact', impactIdx) : undefined;
  const finish = build('finish', finishIdx);
  if (address) events.address = address;
  if (top) events.top = top;
  if (impact) events.impact = impact;
  if (finish) events.finish = finish;
  return { events, warnings };
}

function buildSummary(
  frames: SwingFrame[],
  events: Partial<Record<SwingEventName, SwingEvent>>,
): SwingSummary {
  const addressWindow = events.address
    ? frames.slice(events.address.frameIndex, events.address.frameIndex + 4)
    : frames.slice(0, 4);
  const cameraView = detectCameraView(addressWindow);

  const summary: SwingSummary = { cameraView };
  if (events.address && events.top) {
    summary.backswingMs = Math.round((events.top.t - events.address.t) * 1000);
  }
  if (events.top && events.impact) {
    summary.downswingMs = Math.round((events.impact.t - events.top.t) * 1000);
  }
  if (summary.backswingMs && summary.downswingMs && summary.downswingMs > 0) {
    summary.tempoRatio = +(summary.backswingMs / summary.downswingMs).toFixed(2);
  }
  return summary;
}

export interface AnalyzeSwingOptions {
  onProgress?: (p: SwingAnalysisProgress) => void;
  /** Optional trim window (seconds) — defaults to full video. */
  startTime?: number;
  endTime?: number;
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
      const start = Math.max(0, options.startTime ?? 0);
      const end = Math.min(video.duration || 0, options.endTime ?? video.duration ?? 0);
      const span = Math.max(0.1, end - start);
      const desired = Math.min(MAX_FRAMES, Math.max(8, Math.round(span * TARGET_FPS)));
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
        const tMs = Math.round(t * 1000) + i;
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
      const { events, warnings } = segmentEvents(frames, sampledFps);
      const summary = buildSummary(frames, events);

      onProgress?.({ processedFrames: desired, totalFrames: desired, stage: 'done' });
      log.info('Swing analysis completed', {
        frames: frames.length,
        sampledFps,
        detected: Object.keys(events),
        cameraView: summary.cameraView,
        tempoRatio: summary.tempoRatio,
      });
      return { videoUrl, frames, sampledFps, events, warnings, summary };
    } finally {
      video.src = '';
      video.removeAttribute('src');
      video.load();
    }
  },
};
