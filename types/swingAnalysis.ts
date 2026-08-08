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
 * Segmentation phases of a swing, in temporal order.
 *
 *   address        — setup pose before the swing starts
 *   takeaway       — first frame the wrists leave address
 *   half_backswing — halfway between takeaway and top (roughly lead arm
 *                    parallel to the ground on the way up)
 *   top            — highest hands, end of backswing
 *   mid_downswing  — halfway between top and impact (lead arm parallel on
 *                    the way down; hands entering the "delivery" zone)
 *   impact         — ball contact
 *   follow_through — halfway between impact and finish (trail arm extended,
 *                    lead arm horizontal on the target side)
 *   finish         — held pose after the swing settles
 *
 * The three "half" markers use a wrist-Y midpoint heuristic between their
 * parent events — a rock-solid proxy for arm-horizontal that works with any
 * camera view and doesn't need a gravity reference.
 */
export type SwingEventName =
  | 'address'
  | 'takeaway'
  | 'half_backswing'
  | 'top'
  | 'mid_downswing'
  | 'impact'
  | 'follow_through'
  | 'finish';

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
  /**
   * Camera perspective the analysis was run against. This is the coach's
   * explicit choice at upload time when provided; otherwise the pipeline's
   * heuristic auto-detection. Downstream UI keys metric visibility off this
   * value (some metrics are only meaningful in face-on, others in DTL).
   */
  cameraView: CameraView;
  /**
   * Auto-detected view when it disagrees with the coach's declared view.
   * Populated only when the two differ — the UI surfaces this as a warning
   * so a mis-selected preset gets caught before the coach reads bogus
   * lateral metrics off a DTL clip (or vice versa).
   */
  cameraViewDetected?: CameraView;
  /**
   * Normalized X (0..1) of the vertical body centerline anchored to the
   * address stance — midpoint of the ankles. Rendered as a dashed line on
   * face-on snapshots so coaches can eyeball head sway, hip slide, and
   * reverse pivot against a fixed reference. Undefined for DTL / unknown
   * views where a vertical line isn't the right check.
   */
  bodyCenterlineX?: number;
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

/**
 * A candidate swing interval detected in a longer video. Each interval
 * bounds a distinct swing so unedited footage — with waggle, walking, or
 * multiple swings — can be sliced down to the meaningful segment.
 */
export interface SwingInterval {
  /** Absolute seconds into the source video where this swing starts. */
  startT: number;
  /** Absolute seconds into the source video where this swing ends. */
  endT: number;
  /** Peak wrist speed within the interval (m/s if 3D, unit/s if 2D). */
  peakSpeed: number;
  /** Time of peak wrist speed in seconds (impact-ish). */
  peakT: number;
  /**
   * 0..1 confidence this interval is a real swing. Combines peak speed,
   * duration plausibility, and how cleanly the interval is bounded by still
   * periods on either side. Callers can rank alternate candidates by this.
   */
  confidence: number;
}

/**
 * The subset of frames the segmentation pipeline actually analyzed. When
 * present, the coach's timeline editor uses this to render the "current
 * analysis window" over the full video, and `rebuildAnalysis` lets them
 * drag the window boundaries without re-sampling.
 */
export interface AnalyzedFrameRange {
  startFrameIdx: number;
  endFrameIdx: number;
}

export interface SwingAnalysis {
  /** Video source (blob URL or original URL) used for the run. */
  videoUrl: string;
  /**
   * Every frame sampled from the video (not just the analyzed window).
   * Coach editors need the full timeline so they can drag events / trim
   * boundaries past the auto-detected interval. Event `frameIndex` values
   * are absolute into this array.
   */
  frames: SwingFrame[];
  /**
   * Slice of `frames` that was actually fed into segmentation. Undefined
   * when the caller passed explicit start/end times or when auto-trim
   * found nothing (the whole video was analyzed).
   */
  analyzedRange?: AnalyzedFrameRange;
  /** Sample rate actually achieved (frames per second). */
  sampledFps: number;
  /**
   * Interval that was auto-detected and used for the analysis. Undefined
   * when the caller passed an explicit startTime/endTime (no auto-detection
   * ran) or when detection found no plausible swing.
   */
  detectedInterval?: SwingInterval;
  /**
   * Other swing candidates found in the video, sorted by confidence
   * descending. Populated only when multiple plausible swings were found —
   * UI can offer them for re-analysis. Excludes the chosen `detectedInterval`.
   */
  alternateIntervals?: SwingInterval[];
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
