
export interface MediaItem {
  id: string;
  url: string;
  type: 'video' | 'image' | 'audio';
  role?: 'BEFORE' | 'AFTER';
  createdAt: number;
}

export interface ClientFeedback {
  text?: string;
  voiceUrl?: string; // Data URL (Base64) for persistence
  updatedAt: number;
}

export interface GolfData {
  carryDistance?: number;
  totalDistance?: number;
  ballSpeed?: number;
  clubHeadSpeed?: number;
  launchAngle?: number;
  backSpin?: number;
  sideSpin?: number;
  smashFactor?: number;
  clubPath?: number;
  faceAngle?: number;
}

export interface SwingSequenceItem {
  id: string;
  label: string; // 'Address', 'Top', 'Impact', 'Finish', etc.
  imageUrl: string;
  timestamp: number;
}

// Added: Detailed Shot Metrics extracted from Voice
export interface ShotMetrics {
  teeDistance?: number; // m
  teeDirection?: 'CENTER' | 'LEFT' | 'RIGHT' | 'OB' | 'HAZARD';
  secondShotDistance?: number; // m (remaining)
  parOn?: boolean; // GIR
  approachDistance?: number; // m (remaining if missed GIR)
  firstPuttDistance?: number; // m
}

// Added: Detailed Hole Record
export interface HoleRecord {
  holeNumber: number;
  par: number;
  score: number;
  putts: number;
  voiceUrl?: string; // Audio reflection for this hole
  voiceUrls?: string[]; // Multiple audio reflections for this hole
  aiSummary?: string; // AI summary of the play
  shotMetrics?: ShotMetrics; // Added: Structured data from AI
}

// Added: Full Scorecard Data
export interface ScorecardDetail {
  courseName: string;
  holes: HoleRecord[]; // Array of 18 holes
  totalScore: number;
  totalPutts: number;
}

export type BodyImpactLevel = '상' | '하' | '-';

export type LessonBodyType =
  | '이상체형'
  | '삼각체형'
  | '역삼각체형'
  | '사각체형'
  | '모래시계형'
  | '마름모꼴체형'
  | '둥근체형'
  | '튜브체형';

export type LessonSwingType = '지렛대형' | '아크형' | '넓이형';

export interface LessonStructuralMetricInput {
  frontAxisTiltDeg?: number;
  headTiltDeg?: number;
  shoulderTiltDeg?: number;
  pelvisTiltDeg?: number;
  kneeTiltDeg?: number;
}

export interface LessonStructuralFactor {
  name: string;
  value: string;
  impact: BodyImpactLevel;
}

export interface LessonBodyAnalysis {
  bodyType: LessonBodyType;
  swingType: LessonSwingType;
  structuralInput: LessonStructuralMetricInput;
  structuralFactors: LessonStructuralFactor[];
  coachComment?: string;
}

export interface Lesson {
  id: string;
  clientName: string; // Name of the student/client
  clientPhone: string; // Added: Phone number for unique identification
  coachId?: string; // Added: ID of the coach associated with this lesson
  createdBy: 'COACH' | 'CLIENT'; // Added: Who created this record
  recordType?: 'PRACTICE' | 'SCORE' | 'LESSON'; // Added: Type of the record
  date: string;
  title: string;
  club?: string; // Added: Golf club used (e.g., '7 Iron', 'Driver')
  score?: number; // Added: Score for 'SCORE' record type
  scorecardDetail?: ScorecardDetail; // Added: Detailed scorecard data
  memberBodyAnalysis?: LessonBodyAnalysis; // Added: Member body analysis captured during lesson
  swingAngle?: 'FRONT' | 'SIDE'; // Added: Camera angle of the swing
  videoUrl: string; // Blob URL for media
  videoKey?: string; // Storage key for media, used to recover URL when videoUrl is missing
  mediaType: 'video' | 'image' | 'audio';
  additionalMedia?: MediaItem[];
  thumbnailUrl?: string;
  coachNotes: string;
  aiAnalysis?: string;
  golfData?: GolfData; // Added: Extracted launch monitor data
  swingSequence?: SwingSequenceItem[]; // Added: Extracted swing sequence images
  tags: string[];
  shareOption?: 'MEDIA_ONLY' | 'FULL'; // Control what the client sees
  clientFeedback?: ClientFeedback; // Added: Client's personal notes and voice
  feedbackStatus?: 'NONE' | 'REQUESTED' | 'COMPLETED'; // Added: Feedback workflow status
  assignedHomework?: string[]; // Added: Homework tasks assigned during this lesson
  editedVideoUrl?: string; // Added: Edited video URL (Firebase Storage)
  videoEditMetadata?: VideoEditMetadata; // Added: Video editing metadata
  compareVideoUrl?: string; // Added: Before/After comparison video URL
  compareVideoMetadata?: CompareVideoMetadata; // Added: Comparison video metadata
  /** ID of the lesson package this record belongs to. Always set together with `sessionNumber`. */
  lessonPackageId?: string;
  /** 1-based session number within the lesson package. Always set together with `lessonPackageId`. */
  sessionNumber?: number;
  createdAt: number;
}

/**
 * Represents a lesson package assigned by a coach to a member.
 * A package tracks a fixed number of sessions (e.g. 5-lesson or 10-lesson plan).
 */
export interface LessonPackage {
  id: string;
  coachId: string;
  /** Composite key: `${clientName}_${clientPhone}` */
  clientId: string;
  clientName: string;
  clientPhone: string;
  /** Total number of lesson sessions in this package. */
  totalSessions: number;
  createdAt: number;
  updatedAt: number;
}

// Added: Homework Interfaces
export interface Homework {
  id: string;
  clientId: string; // Composite key: "Name_Phone" or just Phone if unique enough. We use Name_Phone in this app.
  coachId?: string;
  title: string;
  description?: string;
  isCompleted: boolean;
  date: string; // YYYY-MM-DD (Due date or Assigned date)
  createdAt: number;
}

export interface HomeworkTemplate {
  id: string;
  title: string;
  category?: string; // e.g., 'Putting', 'Swing', 'Fitness'
}

// Added: Point System Interfaces
export interface PointTransaction {
  id: string;
  clientId: string;
  amount: number; // Positive for earn, negative for spend
  type: 'HOMEWORK' | 'LESSON_RECORD' | 'PURCHASE' | 'ADJUSTMENT' | 'POINT_TOPUP_TOSS' | 'POINT_TOPUP_PAYAPP' | 'BRANCH_ADMIN_GRANT';
  description: string;
  /** Branch admin username who granted the points (only for BRANCH_ADMIN_GRANT) */
  grantedBy?: string;
  /** Optional reason or memo for the transaction */
  memo?: string;
  /** Whether the recipient is a regular member or a coach (for BRANCH_ADMIN_GRANT) */
  recipientType?: 'MEMBER' | 'COACH';
  createdAt: number;
}

// Added: Notification System Interface
export interface NotificationMessage {
  id: string;
  target: 'ALL' | 'COACHES' | 'CLIENTS';
  /** If set, only the coach with this ID should see this notification. */
  targetCoachId?: string;
  /** Notification subtype for filtering (e.g. 'LESSON_RESERVATION_REQUEST'). */
  type?: string;
  /** ID of the associated reservation, used for deduplication. */
  reservationId?: string;
  title: string;
  body: string;
  createdAt: number;
  isRead?: boolean; // For client-side tracking
}

// Added: Golf Course Management
export interface GolfCourse {
  id: string;
  name: string;
  pars: number[]; // Array of 18 integers representing Par for each hole
  createdAt: number;
}

/**
 * Configuration inputs provided by the user for a training program.
 */
export interface TrainingProgramConfig {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  frequencyPerWeek: number; // e.g., 3
  sessionDurationMinutes: number; // e.g., 60
  performanceGoal: string; // e.g., "드라이버 정확도 향상"
}

/**
 * A generated training program for a member based on lesson-record data.
 */
export interface TrainingProgram {
  id: string;
  coachId: string;
  /** Composite key: `${clientName}_${clientPhone}` */
  clientId: string;
  clientName: string;
  clientPhone: string;
  config: TrainingProgramConfig;
  /** AI-generated program content in markdown format. */
  generatedPlan: string;
  createdAt: number;
  updatedAt: number;
}

export type ViewState = 'LIST' | 'DETAIL' | 'NEW' | 'COMPARE' | 'CLIENTS' | 'CLIENT_STATS' | 'LESSON_LIST' | 'LESSON_PACKAGE' | 'TRAINING_PROGRAM' | 'COACHX' | 'COACHX_CHAT' | 'LESSON_UPLOAD' | 'LESSON_IMPACT' | 'DIAGNOSIS_PROGRAM' | 'DIAGNOSIS_RESULT';

// Branch / BranchAdmin types (for driving range bay reservation)

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface OpeningHourEntry {
  open: string;  // "HH:mm"
  close: string; // "HH:mm"
  isClosed?: boolean;
}

export type OpeningHours = Partial<Record<DayOfWeek, OpeningHourEntry>>;

export interface Branch {
  id: string;
  name: string;
  openingHours?: OpeningHours;
  holidays: string[]; // YYYY-MM-DD
  timeZone?: string;  // default: "Asia/Seoul"
  isActive: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface BranchAdminAccount {
  /** Composite key: `${branchId}:${username}` */
  id: string;
  branchId: string;
  branchName: string; // denormalized for convenience
  username: string;
  /** MVP: plaintext password. Do NOT use in production without hashing. */
  password: string;
  isActive: boolean;
  createdAt: number;
  updatedAt?: number;
  pushToken?: string; // Expo push token for push notifications (web/PWA)
  fcmToken?: string;  // FCM / APNs device token for Capacitor native push notifications
}

export interface Bay {
  id: string;
  branchId: string;
  floor: string;       // e.g. "B1", "1", "2"
  roomNumber: string;  // e.g. "01", "10" (string to allow leading zeros)
  isActive: boolean;
  createdAt: number;
  updatedAt?: number;
}

/**
 * Bay price rule for a branch.
 * Defines the point cost for a 1-hour slot starting at `startHour` on `dayOfWeek`.
 * dayOfWeek: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
 * startHour: 0..23 (slot covers HH:00 ~ HH+1:00)
 */
export interface BayPriceRule {
  id: string;
  branchId: string;
  dayOfWeek: number;    // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  startHour: number;    // 0..23
  pricePoints: number;  // points charged for 1 hour
  isActive: boolean;
  createdAt: number;
  updatedAt?: number;
}

// Bay Reservation Types

export type BayReservationStatus = 'CONFIRMED' | 'CANCEL_REQUESTED' | 'CANCELLED' | 'REJECTED';

/**
 * Bay reservation for a client.
 * id: deterministic `${branchId}_${bayId}_${YYYYMMDD}_${HH}` to prevent double-booking.
 */
export interface BayReservation {
  id: string;
  branchId: string;
  bayId: string;
  /** Optional link to a lesson reservation that triggered this bay block. */
  lessonReservationId?: string;
  startTime: string;   // ISO string
  endTime: string;     // ISO string
  clientId: string;    // `${name}_${phone}`
  clientName: string;
  clientPhone: string;
  paidPoints: number;
  status: BayReservationStatus;
  createdAt: number;
  updatedAt?: number;
  cancelRequestedAt?: number;
}

/** UI helper: human-readable label for dayOfWeek */
export const DAY_OF_WEEK_LABELS = {
  0: '일요일',
  1: '월요일',
  2: '화요일',
  3: '수요일',
  4: '목요일',
  5: '금요일',
  6: '토요일',
} as const;

export interface AIAnalysisState {
  isLoading: boolean;
  error: string | null;
  result: string | null;
}

export interface ComparisonResult {
  improvementScore: number;
  summary: string;
  keyChanges: string[];
  coachComment: string;
}

export interface CoachProfile {
  id: string;
  name: string;
  email: string;
  phone?: string; // Added: Phone number for identification by clients
  password?: string;
  isSubscribed?: boolean;
  subscriptionPlan?: 'FREE' | 'PRO';
  subscriptionEndDate?: string;
  pushToken?: string; // Expo push token for push notifications (web/PWA)
  fcmToken?: string;  // FCM / APNs device token for Capacitor native push notifications
  currentPoints?: number; // Added: Points balance (grantable by branch admin)
  workingSchedule?: OpeningHours; // Working days and hours configuration
}

// Added: Detailed Club Specifications
export type ClubCategory = 'DRIVER' | 'WOOD_UTIL' | 'IRON' | 'WEDGE' | 'PUTTER';

export interface ClubSpec {
  id: string;
  category: ClubCategory;
  brand: string;
  model: string;
  spec1?: string; // Driver: Loft, Iron: Composition(5-P), Putter: Length
  spec2?: string; // Driver: Flex, Iron: Shaft, Putter: Type
}

export interface ClientProfile {
  id?: string;
  name: string;
  phone: string;
  email?: string; // Added: For Auth
  password?: string; // Added: For Auth
  isSubscribed?: boolean;
  subscriptionPlan?: 'FREE' | 'PRO';
  subscriptionEndDate?: string;
  // Added: Golf Profile Info
  golfExperience?: string; // Legacy string e.g., "3년"
  golfStartDate?: string; // Added: ISO Date "YYYY-MM-DD" for precise calculation
  handicap?: number;
  bestScore?: number;
  bagComposition?: string; // Keep for legacy
  detailedBag?: ClubSpec[]; // Added: Structured club data
  designatedCoach?: string; // Name of the coach
  coachId?: string; // Added: ID of the designated coach
  memo?: string;
  memberBodyAnalysis?: LessonBodyAnalysis; // Member body analysis managed in My Info
  // Added: Points
  currentPoints?: number;
  pushToken?: string; // Expo push token for push notifications (web/PWA)
  fcmToken?: string;  // FCM / APNs device token for Capacitor native push notifications
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

// Reservation Types
export type ReservationStatus =
  | 'AVAILABLE'
  | 'BLOCKED'
  | 'PENDING' // legacy pending status (backward compatibility)
  | 'REQUESTED'
  | 'COACH_APPROVED'
  | 'ADMIN_BLOCK_PENDING'
  | 'CONFIRMED'
  | 'CHANGE_REQUESTED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'COMPLETED';

export interface LessonReservation {
  id: string;
  coachId: string;
  coachName: string;
  clientId?: string;
  clientName?: string;
  clientPhone?: string;
  startTime: string; // ISO string
  endTime: string;   // ISO string
  status: ReservationStatus;
  lessonType?: string; // 레슨 종류 (예: 드라이버, 아이언 등)
  blockReason?: string; // 블럭 사유 (BLOCKED status인 경우)
  notes?: string;
  branchId?: string; // Optional: branch the reservation belongs to (for branch admin notifications)
  branchName?: string;
  bayId?: string;
  bayLabel?: string;
  bayReservationId?: string;
  requestedAt?: number;
  coachApprovedAt?: number;
  adminConfirmedAt?: number;
  cancellationRequestedAt?: number;
  changeRequestedAt?: number;
  rejectedAt?: number;
  rejectionReason?: string;
  adminConfirmedBy?: string;
  requestedChangeNote?: string;
  /** Set when a coach creates the reservation on behalf of a member. */
  createdByCoachId?: string;
  createdAt: number;
  updatedAt: number;
}

// Before/After Comparison Video Types
export interface CompareVideoMetadata {
  beforeMediaId: string; // ID of the BEFORE media item
  afterMediaId: string;  // ID of the AFTER media item
  watermarkText: string; // Watermark text burned into the video
  createdAt: string;     // ISO 8601
}

// Video Editing Types
export interface VideoEditMetadata {
  trimStart?: number;
  trimEnd?: number;
  hasAudioOverlay: boolean;
  hasDrawings: boolean;
  drawingData?: DrawingFrame[];
  editedAt: string;
  slowMotionSpeed?: 0.5 | 0.25 | 0.125;
}

export interface DrawingFrame {
  timestamp: number; // milliseconds
  canvasData: string; // fabric.js toJSON()
}

export interface DrawingTool {
  type: 'line' | 'arrow' | 'circle' | 'rect' | 'free';
  color: string;
  width: number;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
}

// ── Quick Log Types ──────────────────────────────────────────────────────────

export type QuickLogMood = 'GREAT' | 'GOOD' | 'OKAY' | 'BAD' | 'TERRIBLE';

export type PracticeArea = 'DRIVER' | 'IRON' | 'SHORT_GAME' | 'PUTTING' | 'ROUND' | 'OTHER';

export interface QuickLogEntry {
  id: string;
  clientId: string; // `${name}_${phone}`
  coachId?: string;
  createdAt: number;
  updatedAt: number;
  logDate: string; // YYYY-MM-DD
  mood: QuickLogMood;
  goodPoint: string;
  problemPoint: string;
  notes?: string;
  practiceArea?: PracticeArea;
}

// ── Prompt Management Types ──────────────────────────────────────────────────

/**
 * Identifies which AI feature a prompt template targets.
 * Used as a stable key for active-prompt lookups.
 */
export type PromptTarget =
  | 'coachx_chat'
  | 'coachx_insights'
  | 'weekly_insight'
  | 'coach_material';

/** A file attached to a PromptTemplate for additional AI context. */
export interface PromptAttachment {
  id: string;
  promptId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  /** Firebase Storage path (online mode). */
  storagePath?: string;
  /** Pre-signed / public download URL (online mode). */
  downloadUrl?: string;
  /** Base64 data URL for local-only mode. */
  localDataUrl?: string;
  createdAt: number;
}

/**
 * A managed prompt template stored centrally and served to Gemini at runtime.
 * Admins create/edit these via the Admin Prompt Manager.
 */
export interface PromptTemplate {
  id: string;
  name: string;
  target: PromptTarget;
  /** The full system / developer-level prompt text sent to Gemini. */
  systemPrompt: string;
  /** Optional extra developer notes (shown in admin UI, not sent to Gemini). */
  developerNote?: string;
  /** True when this template is the one used at runtime for its target. */
  isActive: boolean;
  /** Language scope for this template. 'all' means used for every language. */
  language?: 'ko' | 'en' | 'ja' | 'all';
  attachments: PromptAttachment[];
  createdAt: number;
  updatedAt: number;
}

// ── Weekly Insight Types ─────────────────────────────────────────────────────

export interface WeeklyInsight {
  id: string;
  clientId: string; // `${name}_${phone}`
  coachId?: string;
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string;   // YYYY-MM-DD (Sunday)
  summary: string;
  keyPatterns: string[];
  recommendedFocus: string;
  generatedAt: number;
}

// ── Golf Lesson Upload / Impact Selection Types (MVP scaffolding) ─────────────

/**
 * A student enrolled under a coach.
 * Kept minimal for the MVP; extended in future phases.
 */
export interface Student {
  id: string;
  name: string;
  phone: string;
  email?: string;
  coachId?: string;
}

/**
 * Represents a pending lesson upload with BEFORE and AFTER video files.
 * Files are held in local state until submitted; URLs are set after upload.
 */
export interface LessonUpload {
  id: string;
  studentId: string;
  /** Local File object selected by the coach (not persisted to server yet). */
  beforeVideoFile?: File;
  /** Local File object selected by the coach (not persisted to server yet). */
  afterVideoFile?: File;
  /** Object URL created from beforeVideoFile for preview. */
  beforeVideoUrl?: string;
  /** Object URL created from afterVideoFile for preview. */
  afterVideoUrl?: string;
  createdAt: number;
}

/**
 * Stores the coach-specified impact timestamps for a lesson upload.
 * Both timestamps are in seconds relative to the start of each video.
 */
export interface ImpactSelection {
  lessonId: string;
  /** Impact timestamp in the BEFORE video (seconds). */
  beforeImpactTimeSec: number;
  /** Impact timestamp in the AFTER video (seconds). */
  afterImpactTimeSec: number;
}
