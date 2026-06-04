export type DiagnosisFactorKey =
  | 'body'
  | 'equipment'
  | 'skill'
  | 'courseManagement'
  | 'mental';

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
  overallScore: number;
  grade: string;
  summary: string;
  factors: DiagnosisFactor[];
  partResults: DiagnosisPartResult[];
  recommendations: DiagnosisRecommendation[];
}

export interface DiagnosisInput {
  memberName: string;
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
