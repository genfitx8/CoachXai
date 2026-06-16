import { TrackmanData } from '../types/diagnosis';
import { ClubBenchmarkPoint, ClubOptimizationStandard, CLUB_OPTIMIZATION_STANDARDS } from '../constants/clubOptimization';

export interface MetricAnalysisResult {
  label: string;
  unit: string;
  actual: number;
  optimal: number;
  deviation: number;
  deviationPct: number;
  score: number;
  status: 'optimal' | 'acceptable' | 'poor';
  hint: string;
}

export interface ClubEquipmentAnalysis {
  clubType: string;
  clubSpeed: number;
  optimalBenchmark: ClubBenchmarkPoint;
  overallScore: number;
  smashFactor?: MetricAnalysisResult;
  launchAngle?: MetricAnalysisResult;
  spinRate?: MetricAnalysisResult;
  carryDistance?: MetricAnalysisResult;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolateBenchmark(
  clubSpeedMps: number,
  benchmarks: ClubBenchmarkPoint[],
): ClubBenchmarkPoint {
  if (clubSpeedMps <= benchmarks[0].clubSpeedMps) return { ...benchmarks[0], clubSpeedMps };
  if (clubSpeedMps >= benchmarks[benchmarks.length - 1].clubSpeedMps) {
    return { ...benchmarks[benchmarks.length - 1], clubSpeedMps };
  }
  for (let i = 0; i < benchmarks.length - 1; i++) {
    const lo = benchmarks[i];
    const hi = benchmarks[i + 1];
    if (clubSpeedMps >= lo.clubSpeedMps && clubSpeedMps <= hi.clubSpeedMps) {
      const t = (clubSpeedMps - lo.clubSpeedMps) / (hi.clubSpeedMps - lo.clubSpeedMps);
      return {
        clubSpeedMps,
        ballSpeedMps: lerp(lo.ballSpeedMps, hi.ballSpeedMps, t),
        smashFactor: lerp(lo.smashFactor, hi.smashFactor, t),
        launchAngleDeg: lerp(lo.launchAngleDeg, hi.launchAngleDeg, t),
        spinRateRpm: lerp(lo.spinRateRpm, hi.spinRateRpm, t),
        carryDistanceM: lerp(lo.carryDistanceM, hi.carryDistanceM, t),
      };
    }
  }
  return benchmarks[0];
}

function scoreSmashFactor(actual: number, optimal: number): number {
  const diff = Math.abs(actual - optimal);
  if (diff <= 0.02) return 100;
  if (diff <= 0.04) return 80;
  if (diff <= 0.06) return 60;
  if (diff <= 0.10) return 40;
  return 20;
}

function scoreLaunchAngle(actual: number, optimal: number): number {
  const diff = Math.abs(actual - optimal);
  if (diff <= 1) return 100;
  if (diff <= 2) return 85;
  if (diff <= 3) return 70;
  if (diff <= 5) return 55;
  return 35;
}

function scoreSpinRate(actual: number, optimal: number): number {
  const pct = (Math.abs(actual - optimal) / optimal) * 100;
  if (pct <= 5) return 100;
  if (pct <= 10) return 80;
  if (pct <= 20) return 60;
  if (pct <= 30) return 40;
  return 20;
}

function scoreCarryDistance(actual: number, optimal: number): number {
  const pct = (Math.abs(actual - optimal) / optimal) * 100;
  if (pct <= 3) return 100;
  if (pct <= 8) return 80;
  if (pct <= 15) return 60;
  if (pct <= 25) return 40;
  return 20;
}

function toStatus(score: number): 'optimal' | 'acceptable' | 'poor' {
  if (score >= 80) return 'optimal';
  if (score >= 55) return 'acceptable';
  return 'poor';
}

function buildSmashFactorResult(actual: number, optimal: number): MetricAnalysisResult {
  const score = scoreSmashFactor(actual, optimal);
  const deviation = actual - optimal;
  return {
    label: '스매시팩터',
    unit: '',
    actual,
    optimal: Math.round(optimal * 100) / 100,
    deviation: Math.round(deviation * 100) / 100,
    deviationPct: Math.round((deviation / optimal) * 1000) / 10,
    score,
    status: toStatus(score),
    hint:
      deviation < -0.04
        ? '임팩트 효율이 낮습니다. 센터 임팩트 훈련을 권장합니다.'
        : deviation > 0.04
        ? '스매시팩터가 기준을 초과합니다. 측정값을 재확인하세요.'
        : '스매시팩터가 최적 범위 내에 있습니다.',
  };
}

function buildLaunchAngleResult(actual: number, optimal: number): MetricAnalysisResult {
  const score = scoreLaunchAngle(actual, optimal);
  const deviation = actual - optimal;
  return {
    label: '발사각',
    unit: '°',
    actual,
    optimal: Math.round(optimal * 10) / 10,
    deviation: Math.round(deviation * 10) / 10,
    deviationPct: Math.round((deviation / optimal) * 1000) / 10,
    score,
    status: toStatus(score),
    hint:
      deviation < -2
        ? '발사각이 낮습니다. 어택앵글 또는 로프트 조정을 검토하세요.'
        : deviation > 2
        ? '발사각이 높습니다. 임팩트 로프트 감소를 권장합니다.'
        : '발사각이 최적 범위 내에 있습니다.',
  };
}

function buildSpinRateResult(actual: number, optimal: number): MetricAnalysisResult {
  const score = scoreSpinRate(actual, optimal);
  const deviation = actual - optimal;
  return {
    label: '스핀',
    unit: 'rpm',
    actual,
    optimal: Math.round(optimal),
    deviation: Math.round(deviation),
    deviationPct: Math.round((deviation / optimal) * 1000) / 10,
    score,
    status: toStatus(score),
    hint:
      deviation < -optimal * 0.15
        ? '스핀이 부족합니다. 임팩트 로프트와 어택앵글을 점검하세요.'
        : deviation > optimal * 0.15
        ? '스핀이 과도합니다. 스윙패스 및 클럽 로프트 점검을 권장합니다.'
        : '스핀이 최적 범위 내에 있습니다.',
  };
}

function buildCarryResult(actual: number, optimal: number): MetricAnalysisResult {
  const score = scoreCarryDistance(actual, optimal);
  const deviation = actual - optimal;
  return {
    label: '캐리 거리',
    unit: 'm',
    actual,
    optimal: Math.round(optimal),
    deviation: Math.round(deviation),
    deviationPct: Math.round((deviation / optimal) * 1000) / 10,
    score,
    status: toStatus(score),
    hint:
      deviation < -optimal * 0.1
        ? '캐리 거리가 기준보다 짧습니다. 스매시팩터와 발사각 최적화를 우선하세요.'
        : deviation > optimal * 0.1
        ? '캐리 거리가 기준을 초과합니다. 측정값을 재확인하세요.'
        : '캐리 거리가 최적 범위 내에 있습니다.',
  };
}

export function analyzeTrackmanData(data: TrackmanData): ClubEquipmentAnalysis | null {
  if (!data.clubSpeed) return null;

  const standard: ClubOptimizationStandard | undefined = CLUB_OPTIMIZATION_STANDARDS.find(
    (s) => s.clubType === data.clubType,
  );
  if (!standard) return null;

  const optimal = interpolateBenchmark(data.clubSpeed, standard.benchmarks);

  const effectiveSmashFactor =
    data.smashFactor ?? (data.ballSpeed ? data.ballSpeed / data.clubSpeed : undefined);

  const metrics: Partial<Pick<ClubEquipmentAnalysis, 'smashFactor' | 'launchAngle' | 'spinRate' | 'carryDistance'>> =
    {};

  if (effectiveSmashFactor != null) {
    metrics.smashFactor = buildSmashFactorResult(effectiveSmashFactor, optimal.smashFactor);
  }
  if (data.launchAngle != null) {
    metrics.launchAngle = buildLaunchAngleResult(data.launchAngle, optimal.launchAngleDeg);
  }
  if (data.spinRate != null) {
    metrics.spinRate = buildSpinRateResult(data.spinRate, optimal.spinRateRpm);
  }
  if (data.carryDistance != null) {
    metrics.carryDistance = buildCarryResult(data.carryDistance, optimal.carryDistanceM);
  }

  const scored = [metrics.smashFactor, metrics.launchAngle, metrics.spinRate, metrics.carryDistance].filter(
    (m): m is MetricAnalysisResult => m !== undefined,
  );

  if (scored.length === 0) return null;

  // Weighted average: smashFactor 35%, launchAngle 25%, spinRate 25%, carryDistance 15%
  const weights: Record<string, number> = {
    smashFactor: 0.35,
    launchAngle: 0.25,
    spinRate: 0.25,
    carryDistance: 0.15,
  };
  const keys = ['smashFactor', 'launchAngle', 'spinRate', 'carryDistance'] as const;

  let weightSum = 0;
  let scoreSum = 0;
  for (const key of keys) {
    const m = metrics[key];
    if (m) {
      weightSum += weights[key];
      scoreSum += m.score * weights[key];
    }
  }

  const overallScore = Math.round(scoreSum / weightSum);

  return {
    clubType: data.clubType,
    clubSpeed: data.clubSpeed,
    optimalBenchmark: optimal,
    overallScore,
    ...metrics,
  };
}

export function calculateEquipmentScore(trackmanDataList: TrackmanData[]): number | null {
  const analyses = trackmanDataList
    .map(analyzeTrackmanData)
    .filter((a): a is ClubEquipmentAnalysis => a !== null);

  if (analyses.length === 0) return null;
  const avg = analyses.reduce((sum, a) => sum + a.overallScore, 0) / analyses.length;
  return Math.round(avg);
}
