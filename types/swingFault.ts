/**
 * Deterministic swing faults detected from `SwingSummary` + per-event metrics.
 * The rules are documented in `services/faultDetectionService.ts`; drill
 * prescriptions live in `services/drillLibrary.ts`. Both are keyed off
 * `FaultId` so a new fault only needs one entry in each file.
 */

export type FaultId =
  | 'early_extension'
  | 'head_sway'
  | 'spine_loss'
  | 'weak_x_factor'
  | 'over_swing'
  | 'quick_tempo'
  | 'slow_tempo'
  | 'off_plane_flat'
  | 'off_plane_steep'
  | 'poor_knee_flex'
  | 'address_over_extension'
  | 'excessive_out_to_in'
  | 'excessive_in_to_out'
  | 'weak_shoulder_turn'
  | 'reverse_spine'
  | 'inverted_kinetic_sequence'
  | 'simultaneous_kinetic_peaks';

export type FaultSeverity = 'info' | 'minor' | 'major';

export interface DrillRecommendation {
  /** Short Korean name. */
  name: string;
  /** One- to two-sentence Korean description of how to perform the drill. */
  description: string;
  /** Suggested dosage, e.g. "5분 x 3세트" or "10회 반복". */
  duration?: string;
  /** Equipment the golfer needs, e.g. ["얼라인먼트 스틱", "임팩트 백"]. */
  props?: string[];
  /** Optional external reference (YouTube search URL, coaching article). */
  externalUrl?: string;
}

export interface SwingFault {
  id: FaultId;
  severity: FaultSeverity;
  /** Short Korean title shown as the fault card header. */
  title: string;
  /**
   * One-sentence Korean explanation of the detected pattern, including the
   * numeric evidence (e.g. "임팩트에서 골반이 카메라 쪽으로 82mm 이동").
   */
  description: string;
  /** Metric keys that triggered this fault, for debugging & tooltips. */
  evidence: string[];
  /** Ordered list of drill recommendations to fix the fault. */
  drills: DrillRecommendation[];
}
