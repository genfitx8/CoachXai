import { SkeletonKeypoint } from './postureAnalysis';

export interface SwingFrame {
  /** Video timestamp in seconds. */
  t: number;
  /** Normalized 2D landmarks for overlay/thumbnail rendering. */
  keypoints: SkeletonKeypoint[];
  /** Metric 3D world coordinates when the pose model provides them. */
  worldKeypoints?: SkeletonKeypoint[];
  /** Golf angles derived from worldKeypoints; empty when unavailable. */
  angles: Record<string, number>;
  /** Mean landmark confidence for this frame. */
  confidence: number;
}

export type SwingEventName = 'address' | 'top' | 'impact' | 'finish';

export interface SwingEvent {
  name: SwingEventName;
  frameIndex: number;
  t: number;
  /** Snapshot of key metrics at this event (spineTilt3D, X-factor, etc.). */
  metrics: Record<string, number>;
}

export interface SwingAnalysis {
  /** Video source (blob URL or original URL) used for the run. */
  videoUrl: string;
  /** Full per-frame timeline sampled from the video. */
  frames: SwingFrame[];
  /** Sample rate actually achieved (frames per second). */
  sampledFps: number;
  /** Detected swing events; may be a partial subset if segmentation was unsure. */
  events: Partial<Record<SwingEventName, SwingEvent>>;
  /** Warnings surfaced to the user (low confidence, missing top, etc.). */
  warnings: string[];
}

export interface SwingAnalysisProgress {
  processedFrames: number;
  totalFrames: number;
  stage: 'loading' | 'sampling' | 'segmenting' | 'done';
}
