import type { BallFlightAnalysis, ShotClassification, SwingMetricsInput } from './analysisEngine';

const toRange = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const deriveLaunchWindow = (attackAngle: number): BallFlightAnalysis['launchWindow'] => {
  if (attackAngle <= -3) return 'low';
  if (attackAngle >= 3) return 'high';
  return 'mid';
};

const deriveCarryTendency = (attackAngle: number): BallFlightAnalysis['carryTendency'] => {
  if (attackAngle <= -4.5) return 'compressed-low';
  if (attackAngle >= 4.5) return 'floaty-high';
  return 'neutral';
};

const deriveMissBias = (
  classification: ShotClassification,
  faceAngle: number,
  clubPath: number
): BallFlightAnalysis['missBias'] => {
  const faceBias = faceAngle >= 1.25 ? 'right' : faceAngle <= -1.25 ? 'left' : 'center';

  if (Math.abs(faceAngle) >= 1.25 && Math.abs(clubPath) >= 1.25 && Math.sign(faceAngle) !== Math.sign(clubPath)) {
    return 'two-way';
  }

  if (classification.curvatureDirection === 'straight') {
    return faceBias;
  }

  return classification.curvatureDirection;
};

export const analyzeBallFlight = (
  input: SwingMetricsInput,
  classification: ShotClassification
): BallFlightAnalysis => {
  const curvatureSeverity = Number(toRange(Math.abs(classification.faceToPath) / 4, 0, 1).toFixed(2));
  const spinAxisTiltEstimate = Number((classification.faceToPath * 350).toFixed(0));

  const facePenalty = Math.abs(input.faceAngle) * 8;
  const pathPenalty = Math.abs(input.clubPath) * 5;
  const attackPenalty = Math.abs(input.attackAngle + 1) * 2.5;
  const curvaturePenalty = curvatureSeverity * 18;

  const rawScore = 100 - facePenalty - pathPenalty - attackPenalty - curvaturePenalty;
  const distanceEfficiencyScore = Number(toRange(rawScore, 0, 100).toFixed(0));

  const distanceEfficiencyBand: BallFlightAnalysis['distanceEfficiencyBand'] =
    distanceEfficiencyScore >= 78 ? 'optimized' : distanceEfficiencyScore >= 58 ? 'playable' : 'compromised';

  const launchWindow = deriveLaunchWindow(input.attackAngle);
  const carryTendency = deriveCarryTendency(input.attackAngle);
  const missBias = deriveMissBias(classification, input.faceAngle, input.clubPath);

  const summary = [
    `Start line is ${classification.startDirection}`,
    `curve is ${classification.curvatureMagnitude} ${classification.curvatureDirection}`,
    `launch window projects ${launchWindow}`,
    `distance efficiency is ${distanceEfficiencyBand} (${distanceEfficiencyScore}/100)`
  ].join('; ');

  return {
    launchWindow,
    curvatureSeverity,
    spinAxisTiltEstimate,
    distanceEfficiencyScore,
    distanceEfficiencyBand,
    carryTendency,
    missBias,
    summary,
  };
};
