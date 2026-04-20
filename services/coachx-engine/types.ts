export interface SwingMetricsInput {
  faceAngle: number;
  clubPath: number;
  attackAngle: number;
}

export type SwingHandedness = 'RIGHT' | 'LEFT';

export interface AnalysisConfig {
  handedness?: SwingHandedness;
  faceSquareThresholdDeg?: number;
  pathNeutralThresholdDeg?: number;
  attackNeutralThresholdDeg?: number;
  directionThresholdDeg?: number;
}

export type FaceState = 'OPEN' | 'SQUARE' | 'CLOSED';
export type PathState = 'IN_TO_OUT' | 'NEUTRAL' | 'OUT_TO_IN';
export type AttackState = 'UPWARD' | 'LEVEL' | 'DOWNWARD';
export type HorizontalDirection = 'LEFT' | 'CENTER' | 'RIGHT';

export interface SwingAnalysisResult {
  metrics: SwingMetricsInput;
  faceState: FaceState;
  pathState: PathState;
  attackState: AttackState;
  faceToPathDeg: number;
  startDirection: HorizontalDirection;
  curveDirection: HorizontalDirection;
  shotShape:
    | 'STRAIGHT'
    | 'PUSH'
    | 'PULL'
    | 'FADE'
    | 'DRAW'
    | 'PUSH_FADE'
    | 'PULL_FADE'
    | 'PUSH_DRAW'
    | 'PULL_DRAW';
}

export type CauseCode =
  | 'OPEN_FACE_AT_IMPACT'
  | 'CLOSED_FACE_AT_IMPACT'
  | 'OUT_TO_IN_PATH'
  | 'IN_TO_OUT_PATH'
  | 'STEPPED_DOWN_ATTACK'
  | 'SHALLOW_UPWARD_ATTACK'
  | 'FACE_PATH_MISMATCH';

export interface SwingCause {
  code: CauseCode;
  reason: string;
  evidence: string;
  severity: number;
}

export interface CoachingAction {
  title: string;
  cue: string;
  drill: string;
}

export interface CoachingPlan {
  summary: string;
  priorities: CoachingAction[];
}

export interface DeterministicCoachingReport {
  analysis: SwingAnalysisResult;
  causes: SwingCause[];
  coaching: CoachingPlan;
}

export interface GeminiCoachingContext {
  systemTag: 'coachx-deterministic-v1';
  deterministicReport: DeterministicCoachingReport;
  promptSeed: string;
}
