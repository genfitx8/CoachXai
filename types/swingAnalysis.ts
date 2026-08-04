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

/**
 * Segmentation phases of a swing, in temporal order. `takeaway` marks the
 * first frame where the wrists leave the address position (the "start of
 * backswing" in coaching parlance) — added so coaches can see the moment
 * the swing actually begins, separately from the still address pose.
 */
export type SwingEventName = 'address' | 'takeaway' | 'top' | 'impact' | 'finish';

export interface SwingEvent {
  name: SwingEventName;
  frameIndex: number;
  t: number;
  /** Snapshot of key metrics at this event (spineTilt3D, X-factor, etc.). */
  metrics: Record<string, number>;
  /**
   * Sub-frame offset in fractional frames from `frameIndex` (range roughly
   * [-0.5, 0.5]). Set only when parabolic interpolation refined the timing
   * beyond the discrete sample grid; `t` already reflects the offset.
   * Undefined for events that snap exactly to a sampled frame.
   */
  subFrameOffset?: number;
}

export type CameraView = 'face_on' | 'down_the_line' | 'unknown';
export type Handedness = 'right' | 'left' | 'unknown';
export type ClubType = 'driver' | 'iron' | 'wedge';
export type ClubHeadDetectionMethod = 'geometric' | 'flow' | 'ml';

export interface ClubHeadPosition {
  /** World-coord position in meters (MediaPipe pelvis-relative frame). */
  x: number;
  y: number;
  z: number;
  /** Normalized 2D coordinates for canvas overlay ([0, 1]). */
  x2d: number;
  y2d: number;
  /** 0-1 confidence in the estimate. */
  confidence: number;
  /** How this position was obtained — geometric baseline, optical flow, or ML detector. */
  method: ClubHeadDetectionMethod;
}

export interface ClubHeadTrajectory {
  /** Head positions ordered by ascending frame index. */
  positions: ClubHeadPosition[];
  /** Absolute frame indices into SwingAnalysis.frames aligned with `positions`. */
  frameIndices: number[];
  /** Maximum instantaneous 3D speed observed across the trajectory (km/h). */
  maxSpeedKmh?: number;
}

/**
 * Kinetic (kinematic) sequence analysis — the pro-level metric that
 * differentiates an efficient swing from an amateur one. In a well-sequenced
 * downswing, angular velocity peaks fire in strict order:
 *
 *   Pelvis → Torso (shoulders) → Lead Arm → Hands/Club
 *
 * Each segment decelerates as it hands energy off to the next. Reverse or
 * simultaneous firing wastes energy and typically produces early extension,
 * casting, or over-the-top faults.
 */
export type KineticSegment = 'pelvis' | 'torso' | 'lead_arm' | 'hands';

export interface KineticSegmentPeak {
  segment: KineticSegment;
  /**
   * Peak angular speed in deg/s (or normalized speed for hands, which we
   * derive from lead-wrist 3D linear speed since the club shaft isn't
   * directly observable).
   */
  peakValue: number;
  /** Absolute video timestamp of the peak in seconds. */
  peakT: number;
  /** Time from Top event to peak, in ms. Negative if the peak occurred before Top. */
  msFromTop: number;
}

export type KineticOrder =
  | 'correct'        // pelvis → torso → lead_arm → hands, spaced apart
  | 'partial'        // some peaks in order but at least one missing or out of place
  | 'simultaneous'   // all peaks within ~30ms of each other → no sequencing
  | 'inverted'       // hands / arm peak before pelvis → classic amateur pattern
  | 'unknown';       // insufficient data

export interface KineticSequence {
  pelvis?: KineticSegmentPeak;
  torso?: KineticSegmentPeak;
  leadArm?: KineticSegmentPeak;
  hands?: KineticSegmentPeak;
  order: KineticOrder;
  /** ms from first peak to last peak. Efficient tour swings ≈ 75–150ms. */
  peakSpanMs?: number;
  /**
   * Per-frame series for chart rendering. Frame indices are absolute into
   * SwingAnalysis.frames; the four value arrays are aligned.
   */
  timeline?: {
    frameIndices: number[];
    pelvis: number[];
    torso: number[];
    leadArm: number[];
    hands: number[];
  };
}

export interface SwingSummary {
  /** Detected camera perspective, inferred from address-window landmarks. */
  cameraView: CameraView;
  /** Player handedness, inferred from arm extension at Top. */
  handedness?: Handedness;
  /**
   * Attack angle at impact in degrees (positive = ascending, negative =
   * descending). Computed from lead-wrist trajectory around impact.
   */
  attackAngle?: number;
  /** Backswing (address → top) duration in milliseconds, if both events found. */
  backswingMs?: number;
  /** Downswing (top → impact) duration in milliseconds, if both events found. */
  downswingMs?: number;
  /**
   * Ratio backswing:downswing (target on tour ≈ 3.0). Undefined when either
   * segment was not detected.
   */
  tempoRatio?: number;
  /**
   * Swing plane inclination from horizontal in degrees, computed from the
   * lead-wrist arc (Top → mid-downswing → Impact). Typical driver plane
   * ~45–55°, irons steeper. Undefined when Top/Impact are missing or the arc
   * is degenerate.
   */
  swingPlaneAngle?: number;
  /**
   * Swing plane inclination measured against a gravity vector estimated from
   * the address stance, instead of the raw camera Y-axis. Preferred when the
   * camera is handheld / tilted — cancels the pitch/roll of the phone.
   */
  swingPlaneAngleCorrected?: number;
  /**
   * True when a stable gravity vector was recovered from the address window
   * and the corrected metrics can be trusted. When false, corrected values
   * fall back to raw camera-relative measurements.
   */
  gravityAligned?: boolean;
  /**
   * Estimated club head position at impact (Phase C.1 = geometric baseline
   * from lead-arm single-lever assumption). Replaced by ML detector output
   * in Phase C.2 without callers changing.
   */
  impactClubHead?: ClubHeadPosition;
  /**
   * Estimated club head speed at impact in km/h. World-coord velocity
   * magnitude from head positions at (impact-1, impact+1) / 2Δt.
   */
  clubHeadSpeedKmh?: number;
  /**
   * Club path angle at impact in degrees, projected onto the ground plane.
   * Positive = in-to-out (for right-handed player, target = +X). Undefined
   * when target direction is ambiguous (e.g. cameraView == unknown).
   */
  clubPathAtImpactDeg?: number;
  /**
   * Club head trajectory across the impact zone (±N frames around impact,
   * where the single-lever assumption holds). Enables path overlay + a max
   * speed estimate that's less noisy than the single-frame delta.
   */
  impactZoneTrajectory?: ClubHeadTrajectory;
  /**
   * Peak club head speed observed inside the impact zone (km/h). Typically
   * ≥ `clubHeadSpeedKmh` since it scans a wider window.
   */
  maxClubHeadSpeedKmh?: number;
  /**
   * Kinetic sequence — angular velocity peak ordering across the downswing.
   * Undefined when Top or Impact is missing (needs both to bound the search).
   */
  kineticSequence?: KineticSequence;
}

export interface SwingAnalysis {
  /** Video source (blob URL or original URL) used for the run. */
  videoUrl: string;
  /** Full per-frame timeline sampled from the video. */
  frames: SwingFrame[];
  /** Sample rate actually achieved (frames per second). */
  sampledFps: number;
  /**
   * Detected source video frame rate. Undefined when the browser's
   * `requestVideoFrameCallback` isn't available (e.g. some Firefox / older
   * Safari builds). When the source is a 240fps iPhone slo-mo capture, this
   * lets the UI show "slo-mo detected" and callers understand why more
   * frames were processed than usual.
   */
  nativeFps?: number;
  /** Detected swing events; may be a partial subset if segmentation was unsure. */
  events: Partial<Record<SwingEventName, SwingEvent>>;
  /** Warnings surfaced to the user (low confidence, missing top, etc.). */
  warnings: string[];
  /** Aggregate summary (camera view, tempo). */
  summary: SwingSummary;
}

export interface SwingAnalysisProgress {
  processedFrames: number;
  totalFrames: number;
  stage: 'loading' | 'sampling' | 'segmenting' | 'done';
}
