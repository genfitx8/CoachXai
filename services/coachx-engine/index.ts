import { analyzeSwingMetrics } from './analysisEngine';
import { inferLikelyCauses } from './causeEngine';
import { buildCoachingPlan } from './coachingEngine';
import { DeterministicCoachingReport, GeminiCoachingContext, SwingMetricsInput, AnalysisConfig } from './types';
import { MAX_TOP_CAUSES } from './constants';

export * from './types';
export { analyzeSwingMetrics } from './analysisEngine';
export { inferLikelyCauses } from './causeEngine';
export { buildCoachingPlan } from './coachingEngine';

export function buildDeterministicCoachingReport(
  metrics: SwingMetricsInput,
  config: AnalysisConfig = {}
): DeterministicCoachingReport {
  const analysis = analyzeSwingMetrics(metrics, config);
  const causes = inferLikelyCauses(analysis);
  const coaching = buildCoachingPlan(causes);

  return {
    analysis,
    causes,
    coaching,
  };
}

export function buildGeminiCoachingContext(
  report: DeterministicCoachingReport
): GeminiCoachingContext {
  const topCauses = report.causes
    .slice(0, MAX_TOP_CAUSES)
    .map((cause, index) => `${index + 1}. ${cause.code}: ${cause.reason} (${cause.evidence})`)
    .join('\n');

  const promptSeed = [
    'Use the deterministic report below as fixed truth. Do not change the diagnosis.',
    `Shot Shape: ${report.analysis.shotShape}`,
    `Start Direction: ${report.analysis.startDirection}`,
    `Curve Direction: ${report.analysis.curveDirection}`,
    `Face-to-Path: ${report.analysis.faceToPathDeg.toFixed(2)}°`,
    `Top Causes:\n${topCauses || 'No dominant causes detected.'}`,
    `Priority Coaching Focus: ${report.coaching.priorities.map((item) => item.title).join(', ')}`,
    'Generate concise, supportive language only; keep deterministic conclusions unchanged.',
  ].join('\n');

  return {
    systemTag: 'coachx-deterministic-v1',
    deterministicReport: report,
    promptSeed,
  };
}
