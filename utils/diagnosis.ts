import { CourseMentalData, DiagnosisFactor, ShortGameDiagnosisData, SkillDiagnosisData, SkillShotData } from '../types/diagnosis';

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

export const getAgeFromBirthDate = (birthDate?: string): number | null => {
  if (!birthDate) return null;

  const parsed = new Date(birthDate);
  if (Number.isNaN(parsed.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - parsed.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > parsed.getMonth() ||
    (today.getMonth() === parsed.getMonth() && today.getDate() >= parsed.getDate());

  if (!hasHadBirthdayThisYear) age -= 1;

  return age >= 0 ? age : null;
};

export const getRadarChartPoints = (factors: DiagnosisFactor[]): { label: string; score: number }[] =>
  factors.map((factor) => ({ label: factor.label, score: factor.score }));

const scoreDistanceAccuracy = (carry: number, target: number): number => {
  const pct = (Math.abs(carry - target) / target) * 100;
  if (pct <= 3) return 100;
  if (pct <= 7) return 85;
  if (pct <= 12) return 70;
  if (pct <= 20) return 55;
  return 35;
};

const scoreDispersion = (dispersion: number): number => {
  if (dispersion <= 5) return 100;
  if (dispersion <= 10) return 80;
  if (dispersion <= 15) return 65;
  if (dispersion <= 25) return 50;
  return 30;
};

const scoreSingleShot = (shot: SkillShotData, isShortGame = false): number | null => {
  const distWeight = isShortGame ? 0.5 : 0.6;
  const dispWeight = isShortGame ? 0.5 : 0.4;
  const parts: number[] = [];
  if (shot.carryDistance != null) parts.push(scoreDistanceAccuracy(shot.carryDistance, shot.targetDistance) * distWeight);
  if (shot.dispersion != null) parts.push(scoreDispersion(shot.dispersion) * dispWeight);
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
};

export const calculateCourseMentalScore = (data: CourseMentalData): number | null => {
  const all = [...data.courseManagement, ...data.mental];
  const rated = all.filter((item) => item.rating !== null);
  if (!rated.length) return null;
  const avg = rated.reduce((sum, item) => sum + (item.rating ?? 0), 0) / rated.length;
  return Math.round(((avg - 1) / 4) * 100);
};

const scoreProximityShortGame = (cm: number): number => {
  if (cm <= 30) return 100;
  if (cm <= 75) return 85;
  if (cm <= 150) return 70;
  if (cm <= 300) return 55;
  return 35;
};

const scoreProximityPutting = (cm: number): number => {
  if (cm <= 15) return 100;
  if (cm <= 30) return 85;
  if (cm <= 60) return 70;
  if (cm <= 100) return 55;
  return 35;
};

export const calculateShortGameDiagnosisScore = (data: ShortGameDiagnosisData): number | null => {
  const pitchScores = data.pitchShots
    .flatMap((d) => d.attempts)
    .filter((a) => a.proximityToHole !== null)
    .map((a) => scoreProximityShortGame(a.proximityToHole!));

  const chipScores = data.chipShots
    .filter((d) => d.proximityToHole !== null)
    .map((d) => scoreProximityShortGame(d.proximityToHole!));

  const distFeelScores = data.puttingDistanceFeel
    .filter((d) => d.proximityToHole !== null)
    .map((d) => scoreProximityPutting(d.proximityToHole!));

  const shortPuttScores = data.shortPutting
    .filter((d) => d.madeCount !== null)
    .map((d) => Math.round((d.madeCount! / 12) * 100));

  const allScores = [...pitchScores, ...chipScores, ...distFeelScores, ...shortPuttScores];
  if (!allScores.length) return null;
  return Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length);
};

export const calculateSkillScore = (data: SkillDiagnosisData): number | null => {
  const fullScores = data.fullShots.map((s) => scoreSingleShot(s, false)).filter((s): s is number => s !== null);
  const shortScores = data.shortGameShots.map((s) => scoreSingleShot(s, true)).filter((s): s is number => s !== null);
  if (!fullScores.length && !shortScores.length) return null;
  const fullAvg = fullScores.length ? fullScores.reduce((a, b) => a + b, 0) / fullScores.length : null;
  const shortAvg = shortScores.length ? shortScores.reduce((a, b) => a + b, 0) / shortScores.length : null;
  if (fullAvg !== null && shortAvg !== null) return Math.round(fullAvg * 0.6 + shortAvg * 0.4);
  return Math.round((fullAvg ?? shortAvg)!);
};
