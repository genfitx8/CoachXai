# ML Club Head Detector — Model Spec

Phase C.2b ships the infrastructure to run an ONNX object-detection model in
the browser via `onnxruntime-web`. The actual model is **not** bundled; this
document tells you exactly what to plug in.

## Runtime contract

`services/mlClubHeadDetector.ts` exposes `MLClubHeadDetector`, which implements
the `ClubHeadDetector` interface used by `services/clubHeadTrackingService.ts`
(the same interface `geometricImpactDetector` implements). Instantiate it once,
load the model, then pass it as the `detector` argument of the tracking
helpers or wire it into `analyzeSwingFromVideo`.

```ts
import { MLClubHeadDetector } from './services/mlClubHeadDetector';

const detector = new MLClubHeadDetector({
  modelUrl: '/models/golf-club-head.onnx',
  inputSize: 640,
  confidenceThreshold: 0.35,
  iouThreshold: 0.5,
  // Optional: needed for detectAt() to work, otherwise call detectFromImage
  // directly with a canvas + frame.
  getFrameCanvas: (idx) => canvasCache.get(idx),
});
await detector.load();
```

`onnxruntime-web` is lazy-imported inside `load()`, so the ~2 MB WASM runtime
is only fetched when a caller actually asks for a prediction.

## Model requirements

| Property | Value |
|---|---|
| **Framework** | Ultralytics YOLOv8 export (or equivalent single-stage detector) |
| **Format** | ONNX, opset ≥ 12 |
| **Input** | `float32[1, 3, 640, 640]`, RGB channels-first, values in `[0, 1]` |
| **Output** | `float32[1, 4 + numClasses, N]` — Ultralytics YOLOv8 default. Each column is `(cx, cy, w, h, class0_score, class1_score, …)` in input-image pixel coords. |
| **Classes** | Class `0` **must** be the club head. Additional classes are ignored. |
| **Runtime provider** | `wasm` (widely supported). WebGPU/WebGL possible if you swap `executionProviders` in `load()`. |

The included YOLO parser (`parseYoloOutput`) handles the standard Ultralytics
export. Other layouts (v5 objectness channel, DFL heads, per-scale outputs)
need a small extension in `parseYoloOutput`.

## Preprocessing pipeline

1. `letterbox(frameCanvas, 640)` — resize keeping aspect ratio, pad with gray.
2. `canvasToNchwFloat32(letterboxed)` — RGBA → RGB NCHW `Float32Array`, `/255`.
3. Feed as `new ort.Tensor('float32', tensor, [1, 3, 640, 640])`.

## Postprocessing pipeline

1. `parseYoloOutput(outputs, 640, confThresh)` → array of raw bboxes.
2. `nms(raws, iouThresh)` → deduplicated bboxes.
3. Pick highest-confidence surviving box (there's only one club head).
4. `bboxToSource(bbox, letterboxTransform)` → source-image pixel coords.
5. `backProject(centerNormalized, frame, handedness)` → coarse 3D position
   (uses lead-wrist worldZ as depth prior).

## Training a model from scratch

- Data: label the club head as a small bounding box in each frame of golf
  swings. Public datasets exist on [Roboflow](https://roboflow.com/) — search
  "golf club head". A few hundred labeled frames from a mix of camera
  angles + swing speeds is enough for a v0 model; more data improves motion
  blur handling.
- Training: Ultralytics YOLOv8n or v8s fits browser inference budgets
  (~5–10 MB ONNX). `yolo detect train data=data.yaml model=yolov8n.pt`.
- Export: `yolo export model=runs/detect/train/weights/best.pt format=onnx opset=12 dynamic=True imgsz=640`.
- Host the resulting `.onnx` in `/public/models/` or any CORS-allowed URL.

## Accuracy caveats

- Even a well-trained detector loses the club head at motion blur peaks
  (mid-downswing at 30 fps). If you're building for phone-shot slo-mo,
  training on ≥ 120 fps clips is critical.
- Back-projection to 3D here uses the lead wrist's world Z as a depth prior.
  Precise 3D would require calibrated camera intrinsics or two-view stereo —
  out of scope for the browser pipeline.

## Slotting into `analyzeSwingFromVideo`

Currently the video sampling loop caches nothing per frame. To use the ML
detector during a full swing analysis, extend the loop to capture each
frame's canvas into a `Map<idx, HTMLCanvasElement>` and pass a
`getFrameCanvas` closure into the detector. That plumbing is intentionally
deferred until a real model is available — no point paying the memory cost
for a detector that returns `undefined`.
