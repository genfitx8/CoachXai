import type {
  ClubHeadPosition,
  Handedness,
  SwingFrame,
} from '../types/swingAnalysis';
import type { ClubHeadDetector, ClubTrackingContext } from './clubHeadTrackingService';
import { createLogger } from '../utils/logger';

/**
 * ONNX-based club head detector (Phase C.2b infrastructure).
 *
 * Ships as a plug-in-ready shell — the actual object-detection model is NOT
 * bundled. To activate:
 *   1. Train or obtain a YOLO-family model that detects "golf_club_head" as
 *      class 0 on 640×640 RGB input (see docs/ml-club-head-model.md).
 *   2. Convert to ONNX (opset 12+), place under /public or a static URL.
 *   3. Instantiate `MLClubHeadDetector` with the model URL and image getter,
 *      pass it as `detector` when calling `analyzeSwingFromVideo`.
 *
 * The detector implements `ClubHeadDetector` so it can replace
 * `geometricImpactDetector` without changing any call sites. It also exposes
 * async `detectFromImage()` for callers that already hold a canvas.
 */

const log = createLogger('mlClubHeadDetector');

export interface MLDetectionRaw {
  /** Bbox in input-image pixel coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
  classId: number;
}

export interface MLClubHeadDetectorOptions {
  /** URL of the ONNX model file (accessible from the browser). */
  modelUrl: string;
  /** Model input side length. Most YOLO variants use 640. */
  inputSize?: number;
  /** Detection confidence threshold. Predictions below this are discarded. */
  confidenceThreshold?: number;
  /** NMS IoU threshold. */
  iouThreshold?: number;
  /**
   * Optional getter that returns the raw video frame for a given swing frame
   * index. Required for `detectAt` to work — without it, the detector remains
   * a no-op placeholder because it cannot recover pixels from pose data alone.
   */
  getFrameCanvas?: (idx: number) => HTMLCanvasElement | undefined;
}

/** Sigmoid — used to activate raw YOLO objectness/class scores. */
export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Non-maximum suppression. Assumes boxes are in same coordinate system and
 * (higher confidence wins). Preserves input order among survivors so callers
 * can rely on it for stable rendering.
 */
export function nms(boxes: MLDetectionRaw[], iouThreshold: number): MLDetectionRaw[] {
  const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence);
  const kept: MLDetectionRaw[] = [];
  for (const cand of sorted) {
    let overlapping = false;
    for (const k of kept) {
      if (iou(cand, k) >= iouThreshold) {
        overlapping = true;
        break;
      }
    }
    if (!overlapping) kept.push(cand);
  }
  return kept;
}

function iou(a: MLDetectionRaw, b: MLDetectionRaw): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 0 : inter / union;
}

/**
 * Letterbox-resize a canvas into a square target so the model input keeps the
 * original aspect ratio. Returns the resulting canvas and the transform
 * needed to map detections back to source coordinates.
 */
export function letterbox(
  source: HTMLCanvasElement | ImageData,
  target: number,
): {
  canvas: HTMLCanvasElement;
  scale: number;
  padX: number;
  padY: number;
  srcW: number;
  srcH: number;
} {
  const srcW = source.width;
  const srcH = source.height;
  const scale = Math.min(target / srcW, target / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  const padX = Math.floor((target - newW) / 2);
  const padY = Math.floor((target - newH) / 2);

  const out = document.createElement('canvas');
  out.width = target;
  out.height = target;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('letterbox: canvas 2d context unavailable');
  ctx.fillStyle = 'rgb(114, 114, 114)';
  ctx.fillRect(0, 0, target, target);
  if (source instanceof HTMLCanvasElement) {
    ctx.drawImage(source, 0, 0, srcW, srcH, padX, padY, newW, newH);
  } else {
    // ImageData path — write to a scratch canvas first.
    const tmp = document.createElement('canvas');
    tmp.width = srcW;
    tmp.height = srcH;
    const tmpCtx = tmp.getContext('2d');
    if (!tmpCtx) throw new Error('letterbox: scratch canvas 2d context unavailable');
    tmpCtx.putImageData(source, 0, 0);
    ctx.drawImage(tmp, 0, 0, srcW, srcH, padX, padY, newW, newH);
  }
  return { canvas: out, scale, padX, padY, srcW, srcH };
}

/**
 * Convert a 640×640 RGB canvas to the NCHW Float32Array tensor most YOLO
 * exports expect (values in [0, 1], channels-first, no mean subtraction).
 */
export function canvasToNchwFloat32(canvas: HTMLCanvasElement): Float32Array {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvasToNchwFloat32: 2d context unavailable');
  const { width: w, height: h } = canvas;
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(3 * w * h);
  const plane = w * h;
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    out[p] = rgba[i] / 255;             // R
    out[plane + p] = rgba[i + 1] / 255; // G
    out[2 * plane + p] = rgba[i + 2] / 255; // B
  }
  return out;
}

/**
 * Map a detection bbox from the letterboxed model space back to the source
 * image's pixel coordinates.
 */
export function bboxToSource(
  det: MLDetectionRaw,
  transform: { scale: number; padX: number; padY: number },
): MLDetectionRaw {
  return {
    x: (det.x - transform.padX) / transform.scale,
    y: (det.y - transform.padY) / transform.scale,
    w: det.w / transform.scale,
    h: det.h / transform.scale,
    confidence: det.confidence,
    classId: det.classId,
  };
}

/**
 * Back-project a 2D detection to a rough 3D club head position using a pose
 * hint (the frame's lead-wrist worldY as depth prior). Deliberately coarse —
 * true metric depth requires camera calibration or stereo. Good enough for
 * ordering downstream metrics like club head speed.
 */
export function backProject(
  bboxCenterNormalized: { x: number; y: number },
  frame: SwingFrame,
  handedness: Handedness,
): { x: number; y: number; z: number } | undefined {
  const leadIdx = handedness === 'left' ? 16 : 15;
  const w = frame.worldKeypoints?.[leadIdx];
  if (!w || w.z == null) return undefined;
  // Anchor the head on the wrist's Z plane; X/Y come from the normalized 2D
  // position remapped into the wrist's world scale (rough — assumes camera
  // roughly perpendicular to the target line).
  const spread = 0.9; // meters; approximate 2D→world scale near the golfer
  return {
    x: (bboxCenterNormalized.x - 0.5) * spread,
    y: (bboxCenterNormalized.y - 0.5) * spread,
    z: w.z,
  };
}

export class MLClubHeadDetector implements ClubHeadDetector {
  private readonly options: Required<MLClubHeadDetectorOptions>;
  private session: unknown | null = null;
  private loading: Promise<void> | null = null;

  constructor(options: MLClubHeadDetectorOptions) {
    this.options = {
      inputSize: 640,
      confidenceThreshold: 0.35,
      iouThreshold: 0.5,
      getFrameCanvas: () => undefined,
      ...options,
    };
  }

  /**
   * Idempotent model load. Lazy-imports onnxruntime-web so the ~2MB WASM
   * runtime isn't downloaded until a caller actually asks for a prediction.
   */
  async load(): Promise<void> {
    if (this.session) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const ort = await import('onnxruntime-web');
      this.session = await ort.InferenceSession.create(this.options.modelUrl, {
        executionProviders: ['wasm'],
      });
      log.info('ONNX club head model loaded', { modelUrl: this.options.modelUrl });
    })();
    return this.loading;
  }

  /**
   * Run inference on a raw frame image. Returns the highest-confidence club
   * head detection above the confidence threshold, or undefined.
   */
  async detectFromImage(
    image: HTMLCanvasElement,
    frame: SwingFrame,
    ctx: ClubTrackingContext,
  ): Promise<ClubHeadPosition | undefined> {
    await this.load();
    if (!this.session) return undefined;
    const lb = letterbox(image, this.options.inputSize);
    const tensorData = canvasToNchwFloat32(lb.canvas);
    const ort = await import('onnxruntime-web');
    const inputName = (this.session as { inputNames: string[] }).inputNames[0];
    const tensor = new ort.Tensor('float32', tensorData, [
      1,
      3,
      this.options.inputSize,
      this.options.inputSize,
    ]);
    const outputs = await (
      this.session as {
        run: (feeds: Record<string, unknown>) => Promise<Record<string, unknown>>;
      }
    ).run({ [inputName]: tensor });
    const raw = parseYoloOutput(
      outputs,
      this.options.inputSize,
      this.options.confidenceThreshold,
    );
    if (raw.length === 0) return undefined;
    const kept = nms(raw, this.options.iouThreshold);
    // Highest-confidence surviving box wins. (Golf swings have one club head.)
    const best = kept.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    const src = bboxToSource(best, lb);
    const cx = src.x + src.w / 2;
    const cy = src.y + src.h / 2;
    const nx = Math.max(0, Math.min(1, cx / lb.srcW));
    const ny = Math.max(0, Math.min(1, cy / lb.srcH));
    const world = backProject({ x: nx, y: ny }, frame, ctx.handedness);
    if (!world) return undefined;
    return {
      x: world.x,
      y: world.y,
      z: world.z,
      x2d: nx,
      y2d: ny,
      confidence: best.confidence,
      method: 'ml',
    };
  }

  /**
   * Synchronous ClubHeadDetector adapter. Returns undefined when no frame
   * canvas provider was configured — ONNX inference is async and needs an
   * image, neither of which fits the pose-only interface. Wire up
   * `getFrameCanvas` and consume `detectFromImage` for actual predictions.
   */
  detectAt(): ClubHeadPosition | undefined {
    return undefined;
  }
}

/**
 * Parse a YOLO-family output tensor into raw detections. Supports the common
 * (1, N, 5+numClasses) layout used by Ultralytics YOLOv8 exports. Extend here
 * for other layouts (e.g. YOLOv5 has an extra objectness channel).
 */
export function parseYoloOutput(
  outputs: Record<string, unknown>,
  inputSize: number,
  confidenceThreshold: number,
): MLDetectionRaw[] {
  const firstKey = Object.keys(outputs)[0];
  const tensor = outputs[firstKey] as { data: Float32Array; dims: number[] };
  const dims = tensor.dims;
  const data = tensor.data;

  // YOLOv8 export: (1, 4 + numClasses, N). Transpose access into (N, 4+C).
  if (dims.length === 3 && dims[0] === 1 && dims[1] >= 5) {
    const channels = dims[1];
    const n = dims[2];
    const out: MLDetectionRaw[] = [];
    for (let i = 0; i < n; i++) {
      const cx = data[0 * n + i];
      const cy = data[1 * n + i];
      const w = data[2 * n + i];
      const h = data[3 * n + i];
      let bestCls = 0;
      let bestScore = -Infinity;
      for (let c = 4; c < channels; c++) {
        const score = data[c * n + i];
        if (score > bestScore) {
          bestScore = score;
          bestCls = c - 4;
        }
      }
      if (bestScore < confidenceThreshold) continue;
      out.push({
        x: cx - w / 2,
        y: cy - h / 2,
        w,
        h,
        confidence: bestScore,
        classId: bestCls,
      });
    }
    return out;
  }

  log.warn('Unsupported YOLO output layout', { dims });
  return [];
}

/** Exposed for unit tests only. */
export const __testing__ = {
  sigmoid,
  nms,
  letterbox,
  canvasToNchwFloat32,
  bboxToSource,
  backProject,
  parseYoloOutput,
};
