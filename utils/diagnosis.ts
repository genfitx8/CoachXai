import { DiagnosisFactor } from '../types/diagnosis';

export const clampDiagnosisScore = (score: number): number =>
  Math.max(0, Math.min(100, Math.round(score)));

export const getDiagnosisAverageScore = (factors: DiagnosisFactor[]): number => {
  if (!factors.length) return 0;
  const total = factors.reduce((sum, factor) => sum + factor.score, 0);
  return Math.round(total / factors.length);
};

export const getDiagnosisGrade = (score: number): string => {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  return 'D';
};

export const getRadarChartPoints = (factors: DiagnosisFactor[]): { label: string; score: number }[] =>
  factors.map((factor) => ({ label: factor.label, score: factor.score }));
