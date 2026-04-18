
export interface MediaItem {
  id: string;
  url: string;
  type: 'video' | 'image' | 'audio';
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
  swingAngle?: 'FRONT' | 'SIDE'; // Added: Camera angle of the swing
  videoUrl: string; // Blob URL for media
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
  createdAt: number;
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
  type: 'HOMEWORK' | 'LESSON_RECORD' | 'PURCHASE' | 'ADJUSTMENT';
  description: string;
  createdAt: number;
}

// Added: Notification System Interface
export interface NotificationMessage {
  id: string;
  target: 'ALL' | 'COACHES' | 'CLIENTS';
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

export type ViewState = 'LIST' | 'DETAIL' | 'NEW' | 'COMPARE' | 'CLIENTS' | 'CLIENT_STATS';

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
  subscriptionEndDate?: string;
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
  name: string;
  phone: string;
  email?: string; // Added: For Auth
  password?: string; // Added: For Auth
  isSubscribed?: boolean;
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
  // Added: Points
  currentPoints?: number;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

// Video Editing Types
export interface VideoEditMetadata {
  trimStart?: number;
  trimEnd?: number;
  hasAudioOverlay: boolean;
  hasDrawings: boolean;
  drawingData?: DrawingFrame[];
  editedAt: string;
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
