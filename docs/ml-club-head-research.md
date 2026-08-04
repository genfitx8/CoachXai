# Golf Club Head Detection — Public Datasets & Pretrained Models

Research notes for Phase C.2c. The goal is to pick a starting point for a real
ML detector that slots into `MLClubHeadDetector` (see
[ml-club-head-model.md](./ml-club-head-model.md)) without spending weeks on
data collection.

## Datasets (Roboflow Universe)

| Dataset | Size | Notes |
|---|---|---|
| [club-head-tracking/golf-club-tracking (v2)](https://universe.roboflow.com/club-head-tracking/golf-club-tracking/dataset/2) | 6,750 images | YOLOv11 support, biggest single set, multi-angle |
| [jonathan-tidbury-kt5x7/golf-club-head](https://universe.roboflow.com/jonathan-tidbury-kt5x7/golf-club-head) | Unknown | Purpose-built for the head class alone |
| [public-bezoe/golf-club---head-object-detection](https://universe.roboflow.com/public-bezoe/golf-club---head-object-detection) | 300 images | Small but scoped to head |
| [Golf Club Keypoints Project](https://universe.roboflow.com/golf-sv3kn/golf-club-keypoints-project) | Unknown | Keypoint (not just bbox) — useful for shaft direction later |
| [myspace-riqj6/golf-pth94](https://universe.roboflow.com/myspace-riqj6/golf-pth94) | Unknown | Multi-class (ball + club) |

**Best starting dataset**: `club-head-tracking/golf-club-tracking` — largest,
already annotated for YOLOv11.

## Pretrained models

| Project | Framework | Notes |
|---|---|---|
| [oswinkil-git/AICaddy-A-Golf-Club-Tracer](https://github.com/oswinkil-git/AICaddy-A-Golf-Club-Tracer) | YOLOv8 | Trained on 6,000+ driver head images. Closest to a drop-in. **Driver only** — irons/wedges may need extra training. |
| [matiarj/dj_masters](https://github.com/matiarj/dj_masters) | Custom ensemble | ML-powered swing analyzer, includes club detection module |
| [itiyabosi/golf-swing-analyzer](https://github.com/itiyabosi/golf-swing-analyzer) | MediaPipe + YOLOv8/v11 + MoveNet | Multi-detector ensemble, useful for reference architecture |
| [simonryu328/Golf-Swing-Extractor](https://github.com/simonryu328/Golf-Swing-Extractor) | Roboflow + RNN | Uses a Roboflow-hosted detector + RNN for event detection |
| [wmcnally/golfdb](https://github.com/wmcnally/golfdb) (SwingNet) | Video CNN | Event detection, **not** object detection (complement to what we already do) |

**Best starting model**: [AICaddy](https://github.com/oswinkil-git/AICaddy-A-Golf-Club-Tracer)
— a YOLOv8 `.pt` trained on 6k+ driver-head images. Check the repo LICENSE
before shipping.

## Recommended integration path

1. **Verify license** on AICaddy weights (usually GitHub default = repo LICENSE
   file; if none, contact author).
2. **Download** `best.pt` from the repo (or retrain on the Roboflow
   golf-club-tracking dataset for wider club coverage).
3. **Export to ONNX**:
   ```
   yolo export model=best.pt format=onnx opset=12 dynamic=True imgsz=640
   ```
4. **Host** the resulting `best.onnx` under `/public/models/` in this repo or
   any CORS-allowed static URL (Cloudflare R2, S3, etc.).
5. **Wire into the pipeline** — extend `analyzeSwingFromVideo` to cache each
   sampled frame's canvas in a `Map<idx, HTMLCanvasElement>` and pass a
   `getFrameCanvas` closure into `MLClubHeadDetector`. Instantiate the
   detector once per session and pass it via `AnalyzeSwingOptions.clubHeadDetector`.

## Iron/wedge coverage gap

AICaddy trained on drivers only. If we want irons/wedges (which most
recreational players use more often), we need to:
- Fine-tune on `club-head-tracking/golf-club-tracking` (~6750 mixed-club
  images), OR
- Collect + label ~500 iron/wedge frames from the coaches' own lessons and
  fine-tune on top of the driver checkpoint.

Either takes 1–3 GPU hours; both are Phase C.2c-external work, not
in-session.

## Motion blur caveat (all detectors)

At 30 fps, the club head at impact travels ~1.5–2 m per frame → severe
motion blur. Detection accuracy through impact drops sharply. Two mitigations:
- Train on high-fps footage (240 fps iPhone slo-mo) so the model sees a
  broader blur distribution.
- Combine ML detections with the geometric baseline near impact via a
  Kalman-style fuse — the geometric estimate is single-lever accurate around
  impact even when the pixels are smeared.

Both are Phase C.3+ territory.
