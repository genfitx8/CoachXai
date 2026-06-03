// ─── Diagnosis Program Domain Types ──────────────────────────────────────────

export type DiagnosisPartType =
  | 'COURSE_MANAGEMENT'
  | 'MENTAL_CONTROL'
  | 'TECHNICAL'
  | 'PHYSICAL'
  | 'EQUIPMENT';

export type DiagnosisLevel = 'ELITE' | 'ADVANCED' | 'DEVELOPING' | 'FOUNDATION' | 'RESET_NEEDED';

export type DiagnosisStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type ApplicationStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'SCHEDULED'
  | 'COMPLETED'
  | 'REJECTED';

export type RecommendationCategory =
  | 'IMMEDIATE'
  | 'SHORT_TERM'
  | 'LONG_TERM'
  | 'MAINTENANCE';

export type DiagnosisGrade = 'S' | 'A' | 'B' | 'C' | 'D';

export type DiagnosisAssetType = 'SWING_VIDEO' | 'TRACKMAN_CAPTURE' | 'BODY_SCAN' | 'EQUIPMENT_PHOTO';

// ─── Asset ────────────────────────────────────────────────────────────────────

export interface DiagnosisAsset {
  id: string;
  type: DiagnosisAssetType;
  label: string;
  url: string; // placeholder or real URL
  capturedAt?: number;
  note?: string;
}

// ─── Application / Pre-survey ─────────────────────────────────────────────────

export interface DiagnosisApplication {
  id: string;
  applicantName: string;
  handicap?: number;
  targetHandicap?: number;
  primaryGoal: string;
  status: ApplicationStatus;
  appliedAt: number;
  scheduledAt?: number;
  coachId?: string;
  notes?: string;
}

// ─── Metric definition & value ────────────────────────────────────────────────

export interface MetricDefinition {
  id: string;
  label: string;
  maxScore: number;
  description?: string;
}

export interface MetricValue {
  metricId: string;
  score: number;
  comment?: string;
}

// ─── Part score ───────────────────────────────────────────────────────────────

export interface PartScore {
  partType: DiagnosisPartType;
  score: number;
  maxScore: number;
  summary: string;
  metrics: MetricValue[];
}

// ─── Recommendation ───────────────────────────────────────────────────────────

export interface DiagnosisRecommendation {
  id: string;
  partType: DiagnosisPartType;
  category: RecommendationCategory;
  priority: number; // 1 = highest
  title: string;
  detail: string;
  estimatedWeeks?: number;
}

// ─── Follow-up plan ───────────────────────────────────────────────────────────

export interface FollowUpPlanItem {
  weekOffset: number; // weeks from diagnosis date
  title: string;
  description: string;
  partTypes: DiagnosisPartType[];
}

export interface FollowUpPlan {
  items: FollowUpPlanItem[];
  nextCheckInWeeks: number;
  coachNote?: string;
}

// ─── Diagnosis session ────────────────────────────────────────────────────────

export interface DiagnosisSession {
  id: string;
  applicationId: string;
  clientName: string;
  coachName: string;
  conductedAt: number;
  status: DiagnosisStatus;
  partScores: PartScore[];
  totalScore: number;
  maxTotalScore: number;
  overallComment: string;
  grade: DiagnosisGrade;
  level: DiagnosisLevel;
  recommendations: DiagnosisRecommendation[];
  followUpPlan: FollowUpPlan;
  assets: DiagnosisAsset[];
}

// ─── Grade definition ─────────────────────────────────────────────────────────

export interface GradeDefinition {
  grade: DiagnosisGrade;
  level: DiagnosisLevel;
  label: string;
  description: string;
  minScore: number; // percentage 0-100
  maxScore: number; // percentage 0-100
  color: string; // tailwind color token
}

// ─── Program overview ─────────────────────────────────────────────────────────

export interface ProgramOverview {
  title: string;
  subtitle: string;
  description: string;
  duration: string;
  price: string;
  includesItems: string[];
}

// ─── Radar chart data ─────────────────────────────────────────────────────────

export interface RadarChartPoint {
  label: string;
  value: number; // 0-100 percentage
  partType: DiagnosisPartType;
}
