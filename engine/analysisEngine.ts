import { analyzeBallFlight } from './ballFlightEngine';
import { analyzeRootCauses } from './causeEngine';

export interface SwingMetricsInput {
  faceAngle: number; // -4 ~ +4
  clubPath: number; // -4 ~ +4
  attackAngle: number; // -7 ~ +7
}

export type HorizontalStartDirection = 'left' | 'center' | 'right';
export type CurvatureDirection = 'left' | 'straight' | 'right';
export type CurvatureMagnitude = 'straight' | 'baby' | 'moderate' | 'severe';
export type ShotShape = 'straight' | 'draw' | 'hook' | 'fade' | 'slice';
export type ShotPattern =
  | 'stock'
  | 'push-fade'
  | 'push-slice'
  | 'push-draw'
  | 'push-hook'
  | 'pull-fade'
  | 'pull-slice'
  | 'pull-draw'
  | 'pull-hook'
  | 'block'
  | 'smother';

export interface ShotClassification {
  startDirection: HorizontalStartDirection;
  shotShape: ShotShape;
  curvatureDirection: CurvatureDirection;
  curvatureMagnitude: CurvatureMagnitude;
  pattern: ShotPattern;
  faceToPath: number;
  attackProfile: 'very-steep' | 'steep' | 'neutral' | 'shallow' | 'very-shallow';
  faceControl: 'square' | 'slightly-open' | 'open' | 'very-open' | 'slightly-closed' | 'closed' | 'very-closed';
  pathControl: 'neutral' | 'in-to-out' | 'strong-in-to-out' | 'out-to-in' | 'strong-out-to-in';
}

export interface BallFlightAnalysis {
  launchWindow: 'low' | 'mid' | 'high';
  curvatureSeverity: number;
  spinAxisTiltEstimate: number;
  distanceEfficiencyScore: number;
  distanceEfficiencyBand: 'optimized' | 'playable' | 'compromised';
  carryTendency: 'compressed-low' | 'neutral' | 'floaty-high';
  missBias: 'left' | 'center' | 'right' | 'two-way';
  summary: string;
}

export interface BiomechanicalCause {
  id: string;
  title: string;
  explanation: string;
  signals: string[];
  confidence: number;
  severity: number;
}

export interface DeterministicSwingAnalysis {
  input: SwingMetricsInput;
  classification: ShotClassification;
  ballFlight: BallFlightAnalysis;
  rootCauses: BiomechanicalCause[];
}

export interface SwingInputValidationError {
  field: keyof SwingMetricsInput;
  message: string;
}

const FACE_MIN = -4;
const FACE_MAX = 4;
const PATH_MIN = -4;
const PATH_MAX = 4;
const ATTACK_MIN = -7;
const ATTACK_MAX = 7;

const inRange = (value: number, min: number, max: number): boolean => value >= min && value <= max;

export const validateSwingMetricsInput = (input: SwingMetricsInput): SwingInputValidationError[] => {
  const errors: SwingInputValidationError[] = [];

  if (!Number.isFinite(input.faceAngle) || !inRange(input.faceAngle, FACE_MIN, FACE_MAX)) {
    errors.push({ field: 'faceAngle', message: `faceAngle must be between ${FACE_MIN} and ${FACE_MAX}.` });
  }
  if (!Number.isFinite(input.clubPath) || !inRange(input.clubPath, PATH_MIN, PATH_MAX)) {
    errors.push({ field: 'clubPath', message: `clubPath must be between ${PATH_MIN} and ${PATH_MAX}.` });
  }
  if (!Number.isFinite(input.attackAngle) || !inRange(input.attackAngle, ATTACK_MIN, ATTACK_MAX)) {
    errors.push({ field: 'attackAngle', message: `attackAngle must be between ${ATTACK_MIN} and ${ATTACK_MAX}.` });
  }

  return errors;
};

const classifyStartDirection = (faceAngle: number): HorizontalStartDirection => {
  if (faceAngle >= 1) return 'right';
  if (faceAngle <= -1) return 'left';
  return 'center';
};

const classifyCurvature = (faceToPath: number): {
  magnitude: CurvatureMagnitude;
  direction: CurvatureDirection;
  shotShape: ShotShape;
} => {
  const abs = Math.abs(faceToPath);
  if (abs <= 0.75) {
    return { magnitude: 'straight', direction: 'straight', shotShape: 'straight' };
  }

  const direction: CurvatureDirection = faceToPath > 0 ? 'right' : 'left';
  if (abs <= 1.75) {
    return { magnitude: 'baby', direction, shotShape: direction === 'right' ? 'fade' : 'draw' };
  }
  if (abs <= 3) {
    return { magnitude: 'moderate', direction, shotShape: direction === 'right' ? 'fade' : 'draw' };
  }
  return { magnitude: 'severe', direction, shotShape: direction === 'right' ? 'slice' : 'hook' };
};

const classifyAttackProfile = (attackAngle: number): ShotClassification['attackProfile'] => {
  if (attackAngle <= -5) return 'very-steep';
  if (attackAngle < -2) return 'steep';
  if (attackAngle <= 2) return 'neutral';
  if (attackAngle < 5) return 'shallow';
  return 'very-shallow';
};

const classifyFaceControl = (faceAngle: number): ShotClassification['faceControl'] => {
  if (faceAngle >= 3) return 'very-open';
  if (faceAngle >= 1.5) return 'open';
  if (faceAngle > 0.25) return 'slightly-open';
  if (faceAngle <= -3) return 'very-closed';
  if (faceAngle <= -1.5) return 'closed';
  if (faceAngle < -0.25) return 'slightly-closed';
  return 'square';
};

const classifyPathControl = (clubPath: number): ShotClassification['pathControl'] => {
  if (clubPath >= 2) return 'strong-in-to-out';
  if (clubPath >= 0.75) return 'in-to-out';
  if (clubPath <= -2) return 'strong-out-to-in';
  if (clubPath <= -0.75) return 'out-to-in';
  return 'neutral';
};

const classifyShotPattern = (
  startDirection: HorizontalStartDirection,
  shotShape: ShotShape,
  curvatureDirection: CurvatureDirection,
  faceAngle: number
): ShotPattern => {
  if (shotShape === 'straight') {
    if (startDirection === 'right') return 'block';
    if (startDirection === 'left') return 'smother';
    return 'stock';
  }

  if (startDirection === 'right') {
    if (curvatureDirection === 'right') return shotShape === 'slice' ? 'push-slice' : 'push-fade';
    return shotShape === 'hook' ? 'push-hook' : 'push-draw';
  }

  if (startDirection === 'left') {
    if (curvatureDirection === 'right') return shotShape === 'slice' ? 'pull-slice' : 'pull-fade';
    return shotShape === 'hook' ? 'pull-hook' : 'pull-draw';
  }

  if (faceAngle >= 0 && curvatureDirection === 'right') {
    return shotShape === 'slice' ? 'push-slice' : 'push-fade';
  }
  if (faceAngle <= 0 && curvatureDirection === 'left') {
    return shotShape === 'hook' ? 'pull-hook' : 'pull-draw';
  }

  return curvatureDirection === 'right'
    ? shotShape === 'slice'
      ? 'pull-slice'
      : 'pull-fade'
    : shotShape === 'hook'
      ? 'push-hook'
      : 'push-draw';
};

export const classifyShot = (input: SwingMetricsInput): ShotClassification => {
  const faceToPath = Number((input.faceAngle - input.clubPath).toFixed(2));
  const startDirection = classifyStartDirection(input.faceAngle);
  const curvature = classifyCurvature(faceToPath);

  return {
    startDirection,
    shotShape: curvature.shotShape,
    curvatureDirection: curvature.direction,
    curvatureMagnitude: curvature.magnitude,
    pattern: classifyShotPattern(startDirection, curvature.shotShape, curvature.direction, input.faceAngle),
    faceToPath,
    attackProfile: classifyAttackProfile(input.attackAngle),
    faceControl: classifyFaceControl(input.faceAngle),
    pathControl: classifyPathControl(input.clubPath),
  };
};

export const analyzeSwing = (input: SwingMetricsInput): DeterministicSwingAnalysis => {
  const errors = validateSwingMetricsInput(input);
  if (errors.length > 0) {
    throw new Error(`Invalid swing metrics: ${errors.map((e) => `${e.field} ${e.message}`).join(' ')}`);
  }

  const classification = classifyShot(input);
  const ballFlight = analyzeBallFlight(input, classification);
  const rootCauses = analyzeRootCauses(input, classification);

  return {
    input,
    classification,
    ballFlight,
    rootCauses,
  };
};
