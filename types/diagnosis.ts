export type DiagnosisFactorKey =
  | 'body'
  | 'equipment'
  | 'skill';

export interface DiagnosisFactor {
  key: DiagnosisFactorKey;
  label: string;
  score: number;
  maxScore: number;
  description: string;
}

export interface DiagnosisProcessStep {
  id: string;
  title: string;
  description: string;
}

export interface DiagnosisProgram {
  title: string;
  subtitle: string;
  description: string;
  factors: DiagnosisFactor[];
  steps: DiagnosisProcessStep[];
}

export interface DiagnosisPartResult {
  id: string;
  title: string;
  summary: string;
  details: string[];
}

export interface DiagnosisRecommendation {
  id: string;
  title: string;
  content: string;
}

export interface DiagnosisResult {
  memberName: string;
  golferProfile?: GolferProfile;
  overallScore: number;
  grade: string;
  summary: string;
  factors: DiagnosisFactor[];
  partResults: DiagnosisPartResult[];
  recommendations: DiagnosisRecommendation[];
}

export interface GolferProfile {
  name: string;
  gender: '' | 'male' | 'female';
  birthDate: string;
  contact: string;
  heightCm: number | null;
  weightKg: number | null;
  yearsOfExperience: number | null;
  handicap: number | null;
  averageScore: number | null;
  bestScore: number | null;
  dominantHand: '' | 'right' | 'left';
  roundFrequency: string;
  practiceFrequency: string;
  injuryHistory: string;
  injuryMemo: string;
  currentPainAreas: string;
  otherSportsExperience: string;
  flexibilitySelfAssessment: number | null;
  driverModel: string;
  ironModel: string;
  shaftFlex: string;
  ballBrand: string;
  diagnosisGoals: string[];
  primaryConcern: string;
  targetHandicap: number | null;
}

export interface DiagnosisInput {
  memberName: string;
  golferProfile?: GolferProfile;
  factorScores: Record<DiagnosisFactorKey, number>;
}

export interface DiagnosisSavedSession {
  id: string;
  createdAt: string;
  input: DiagnosisInput;
  result: DiagnosisResult;
}

export interface DiagnosisSession {
  program: DiagnosisProgram;
  result: DiagnosisResult;
}
