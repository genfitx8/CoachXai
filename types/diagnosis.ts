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

export interface TrackmanData {
  clubType: string;
  capturedImageUrl?: string;
  ballSpeed?: number;
  clubSpeed?: number;
  launchAngle?: number;
  spinRate?: number;
  carryDistance?: number;
  totalDistance?: number;
  smashFactor?: number;
  notes?: string;
}

export interface SkillShotData {
  targetDistance: number;
  carryDistance: number | null;
  totalDistance: number | null;
  dispersion: number | null;
  launchAngle: number | null;
  apexHeight: number | null;
  spinRate: number | null;
}

export interface SkillDiagnosisData {
  fullShots: SkillShotData[];
  shortGameShots: SkillShotData[];
}

// ── 숏게임 퍼포먼스 테스트 ────────────────────────────────────────────

export interface PitchShotAttempt {
  proximityToHole: number | null; // cm
}

export interface PitchShotDistance {
  targetDistance: number; // 10, 15, 20, 25, 30
  attempts: PitchShotAttempt[]; // 3 attempts
}

export interface ChipShotDistance {
  targetDistance: number; // 10, 15, 20
  proximityToHole: number | null; // cm
}

export interface PuttingDistanceFeel {
  targetDistance: number; // 1~10m
  proximityToHole: number | null; // cm
}

export interface ShortPuttingRecord {
  targetDistance: number; // 1, 1.5, 2, 2.5, 3
  madeCount: number | null; // out of 12
}

export interface ShortGameDiagnosisData {
  pitchShots: PitchShotDistance[];
  chipShots: ChipShotDistance[];
  puttingDistanceFeel: PuttingDistanceFeel[];
  shortPutting: ShortPuttingRecord[];
}

// ── 스윙 모션 데이터 ──────────────────────────────────────────────────

export interface SwingMotionCapture {
  id: string;
  clubType: string;
  label: string;
  capturedImageUrl?: string;   // base64 (screen capture or image upload)
  videoObjectUrl?: string;     // blob URL — session-only, not persisted
  videoFileName?: string;
  // Trackman motion metrics
  swingPath: number | null;         // 클럽 패스 (°)
  faceAngle: number | null;         // 페이스 앵글 (°)
  attackAngle: number | null;       // 어택 앵글 (°)
  dynamicLoft: number | null;       // 다이나믹 로프트 (°)
  spinLoft: number | null;          // 스핀 로프트 (°)
  hipRotation: number | null;       // 힙 회전 (°)
  shoulderRotation: number | null;  // 어깨 회전 (°)
  swingPlane: number | null;        // 스윙 플레인 (°)
  tempoRatio: string;               // 템포 비율 e.g. "3:1"
  coachNote: string;
}

export interface SwingMotionData {
  captures: SwingMotionCapture[];
}

export interface CourseMentalItem {
  key: string;
  label: string;
  rating: number | null; // 1–5
}

export interface CourseMentalData {
  courseManagement: CourseMentalItem[];
  mental: CourseMentalItem[];
  courseNote: string;
  mentalNote: string;
}

export interface GolferProfile {
  name: string;
  gender: '' | 'male' | 'female';
  age: number | null;
  birthDate?: string; // Legacy saved sessions may still contain birth date data
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
  trackmanData?: TrackmanData[];
  skillDiagnosisData?: SkillDiagnosisData;
  shortGameDiagnosisData?: ShortGameDiagnosisData;
  swingMotionData?: SwingMotionData;
  courseMentalData?: CourseMentalData;
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
