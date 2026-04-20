import {
  AnalysisConfig,
  AttackState,
  FaceState,
  HorizontalDirection,
  PathState,
  SwingAnalysisResult,
  SwingMetricsInput,
} from './types';

const DEFAULT_CONFIG: Required<AnalysisConfig> = {
  handedness: 'RIGHT',
  faceSquareThresholdDeg: 2,
  pathNeutralThresholdDeg: 2,
  attackNeutralThresholdDeg: 2,
  directionThresholdDeg: 1.5,
};

function toDirectionalValue(value: number, handedness: 'RIGHT' | 'LEFT'): number {
  return handedness === 'RIGHT' ? value : -value;
}

function classifyFaceState(faceAngle: number, threshold: number): FaceState {
  if (faceAngle > threshold) return 'OPEN';
  if (faceAngle < -threshold) return 'CLOSED';
  return 'SQUARE';
}

function classifyPathState(clubPath: number, threshold: number): PathState {
  if (clubPath > threshold) return 'IN_TO_OUT';
  if (clubPath < -threshold) return 'OUT_TO_IN';
  return 'NEUTRAL';
}

function classifyAttackState(attackAngle: number, threshold: number): AttackState {
  if (attackAngle > threshold) return 'UPWARD';
  if (attackAngle < -threshold) return 'DOWNWARD';
  return 'LEVEL';
}

function classifyHorizontalDirection(value: number, threshold: number): HorizontalDirection {
  if (value > threshold) return 'RIGHT';
  if (value < -threshold) return 'LEFT';
  return 'CENTER';
}

function deriveShotShape(startDirection: HorizontalDirection, curveDirection: HorizontalDirection): SwingAnalysisResult['shotShape'] {
  if (startDirection === 'CENTER' && curveDirection === 'CENTER') return 'STRAIGHT';
  if (startDirection === 'RIGHT' && curveDirection === 'CENTER') return 'PUSH';
  if (startDirection === 'LEFT' && curveDirection === 'CENTER') return 'PULL';
  if (startDirection === 'CENTER' && curveDirection === 'RIGHT') return 'FADE';
  if (startDirection === 'CENTER' && curveDirection === 'LEFT') return 'DRAW';
  if (startDirection === 'RIGHT' && curveDirection === 'RIGHT') return 'PUSH_FADE';
  if (startDirection === 'LEFT' && curveDirection === 'RIGHT') return 'PULL_FADE';
  if (startDirection === 'RIGHT' && curveDirection === 'LEFT') return 'PUSH_DRAW';
  return 'PULL_DRAW';
}

export function analyzeSwingMetrics(
  metrics: SwingMetricsInput,
  config: AnalysisConfig = {}
): SwingAnalysisResult {
  const merged = { ...DEFAULT_CONFIG, ...config };

  const normalizedFace = toDirectionalValue(metrics.faceAngle, merged.handedness);
  const normalizedPath = toDirectionalValue(metrics.clubPath, merged.handedness);

  const faceState = classifyFaceState(normalizedFace, merged.faceSquareThresholdDeg);
  const pathState = classifyPathState(normalizedPath, merged.pathNeutralThresholdDeg);
  const attackState = classifyAttackState(metrics.attackAngle, merged.attackNeutralThresholdDeg);

  const faceToPathDeg = Number((normalizedFace - normalizedPath).toFixed(2));
  const startDirection = classifyHorizontalDirection(normalizedFace, merged.directionThresholdDeg);
  const curveDirection = classifyHorizontalDirection(faceToPathDeg, merged.directionThresholdDeg);

  return {
    metrics,
    faceState,
    pathState,
    attackState,
    faceToPathDeg,
    startDirection,
    curveDirection,
    shotShape: deriveShotShape(startDirection, curveDirection),
  };
}
