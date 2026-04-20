import type { DeterministicSwingAnalysis } from '../engine/analysisEngine';

const causeLines = (analysis: DeterministicSwingAnalysis): string => {
  if (analysis.rootCauses.length === 0) {
    return '- No dominant biomechanical root cause was triggered.';
  }

  return analysis.rootCauses
    .map(
      (cause, index) =>
        `${index + 1}. ${cause.title} (confidence ${cause.confidence.toFixed(2)}, severity ${cause.severity.toFixed(2)}): ${cause.explanation}`
    )
    .join('\n');
};

export const buildCoachXCoachingPrompt = (analysis: DeterministicSwingAnalysis): string => {
  return [
    'Deterministic swing analysis results are below. Explain them for coaching only.',
    'Do not change any classifications or infer alternative metrics.',
    '',
    `Input metrics: faceAngle=${analysis.input.faceAngle}, clubPath=${analysis.input.clubPath}, attackAngle=${analysis.input.attackAngle}`,
    `Shot classification: pattern=${analysis.classification.pattern}, shape=${analysis.classification.shotShape}, start=${analysis.classification.startDirection}, curve=${analysis.classification.curvatureMagnitude} ${analysis.classification.curvatureDirection}`,
    `Ball flight: launch=${analysis.ballFlight.launchWindow}, distanceEfficiency=${analysis.ballFlight.distanceEfficiencyScore}/100 (${analysis.ballFlight.distanceEfficiencyBand}), missBias=${analysis.ballFlight.missBias}`,
    'Root causes:',
    causeLines(analysis),
    '',
    'Return exactly 3 sections:',
    '1) Ball Flight Diagnosis',
    '2) Biomechanical Root Causes',
    '3) Priority Coaching Plan (3 drills max, measurable cues).'
  ].join('\n');
};
