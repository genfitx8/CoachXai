import { SwingAnalysisResult, SwingCause } from './types';
import {
  ATTACK_SEVERITY_MULTIPLIER,
  FACE_PATH_MISMATCH_THRESHOLD_DEG,
  FACE_PATH_SEVERITY_MULTIPLIER,
  FACE_SEVERITY_MULTIPLIER,
  PATH_SEVERITY_MULTIPLIER,
} from './constants';

function roundSeverity(value: number): number {
  return Number(Math.max(0, Math.min(10, value)).toFixed(2));
}

export function inferLikelyCauses(analysis: SwingAnalysisResult): SwingCause[] {
  const causes: SwingCause[] = [];

  if (analysis.faceState === 'OPEN') {
    causes.push({
      code: 'OPEN_FACE_AT_IMPACT',
      reason: 'Face is open to target at impact and tends to start/curve the ball right.',
      evidence: `Face Angle ${analysis.metrics.faceAngle.toFixed(1)}°`,
      severity: roundSeverity(Math.abs(analysis.metrics.faceAngle) * FACE_SEVERITY_MULTIPLIER),
    });
  }

  if (analysis.faceState === 'CLOSED') {
    causes.push({
      code: 'CLOSED_FACE_AT_IMPACT',
      reason: 'Face is closed to target at impact and tends to start/curve the ball left.',
      evidence: `Face Angle ${analysis.metrics.faceAngle.toFixed(1)}°`,
      severity: roundSeverity(Math.abs(analysis.metrics.faceAngle) * FACE_SEVERITY_MULTIPLIER),
    });
  }

  if (analysis.pathState === 'OUT_TO_IN') {
    causes.push({
      code: 'OUT_TO_IN_PATH',
      reason: 'Club path is leftward through impact, increasing fade/slice bias.',
      evidence: `Club Path ${analysis.metrics.clubPath.toFixed(1)}°`,
      severity: roundSeverity(Math.abs(analysis.metrics.clubPath) * PATH_SEVERITY_MULTIPLIER),
    });
  }

  if (analysis.pathState === 'IN_TO_OUT') {
    causes.push({
      code: 'IN_TO_OUT_PATH',
      reason: 'Club path is rightward through impact, increasing draw/hook bias.',
      evidence: `Club Path ${analysis.metrics.clubPath.toFixed(1)}°`,
      severity: roundSeverity(Math.abs(analysis.metrics.clubPath) * PATH_SEVERITY_MULTIPLIER),
    });
  }

  if (analysis.attackState === 'DOWNWARD') {
    causes.push({
      code: 'STEPPED_DOWN_ATTACK',
      reason: 'Attack angle is too downward and may steepen strike dynamics.',
      evidence: `Attack Angle ${analysis.metrics.attackAngle.toFixed(1)}°`,
      severity: roundSeverity(Math.abs(analysis.metrics.attackAngle) * ATTACK_SEVERITY_MULTIPLIER),
    });
  }

  if (analysis.attackState === 'UPWARD') {
    causes.push({
      code: 'SHALLOW_UPWARD_ATTACK',
      reason: 'Attack angle is strongly upward and may shift contact tendency high/inside.',
      evidence: `Attack Angle ${analysis.metrics.attackAngle.toFixed(1)}°`,
      severity: roundSeverity(Math.abs(analysis.metrics.attackAngle) * ATTACK_SEVERITY_MULTIPLIER),
    });
  }

  if (Math.abs(analysis.faceToPathDeg) > FACE_PATH_MISMATCH_THRESHOLD_DEG) {
    causes.push({
      code: 'FACE_PATH_MISMATCH',
      reason: 'Face-to-path gap is large and is the strongest contributor to curvature.',
      evidence: `Face-to-Path ${analysis.faceToPathDeg.toFixed(1)}°`,
      severity: roundSeverity(Math.abs(analysis.faceToPathDeg) * FACE_PATH_SEVERITY_MULTIPLIER),
    });
  }

  return causes.sort((a, b) => b.severity - a.severity);
}
