
export interface MediaItem {
  id: string;
  url: string;
  type: 'video' | 'image' | 'audio';
  role?: 'BEFORE' | 'AFTER';
  createdAt: number;
  /**
   * Where this media originated. `live_lesson` marks a clip captured
   * inside the 3c LiveLessonCompanion so downstream surfaces (review,
   * evidence) can badge it as "레슨 중" instead of a manual upload.
   */
  source?: 'live_lesson';
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
  attackAngle?: number; // 어택 앵글 (Attack Angle)
  spinRate?: number; // 스핀량 (Spin Rate, rpm)
  dynamicLoft?: number; // 다이나믹 로프트 (Dyn. Loft)
  spinLoft?: number; // 스핀 로프트 (Spin Loft)
  sideTotal?: number; // 사이드 토탈, +는 오른쪽(R) / -는 왼쪽(L) (m)
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

/**
 * Structured lesson record shown on the coach's 승인 (review) screen
 * (redesign screen `8b`). The agent drafts these fields from lesson audio
 * and video; the coach edits any of them in place and hits 승인 to release
 * to the student. Every field is a plain string so the coach can freely
 * rewrite without a rigid rich-text schema; `attachments` and
 * `nextActions` are the two arrays that carry structure the UI leans on.
 *
 * The last four fields (swingEvidence / historyEvidence / confidence /
 * caveats) mirror the shared `AIEvidenceEnvelope` — the draft ships the
 * evidence that justifies the feedback so the review screen can open the
 * 6a "근거" modal without a second AI call.
 */
export interface LessonReviewSections {
  /** "오늘 다룬 것" — one paragraph the agent distils from the transcript. */
  todayCovered?: string;
  /** "피드백" — the coach's diagnosis, agent-drafted. */
  feedback?: string;
  /**
   * "다음 액션" — the concrete drills / homework the coach wants the
   * student to do before the next lesson. Rendered as an emerald card
   * in the review UI (redesign spec). Kept as an ordered list so the
   * student sees them in priority order.
   */
  nextActions?: string[];
  /**
   * "첨부" — clips / screenshots the agent lifted from the swing video.
   * Shown only when non-empty. Points to lesson.additionalMedia entries
   * by MediaItem.id so the review screen doesn't duplicate the payload.
   */
  attachmentIds?: string[];
  /**
   * "자유 메모" — coach adds anything the structured sections don't
   * cover. Optional; the redesign notes coaches often leave this blank.
   */
  freeMemo?: string;
  /** ISO timestamp of the last edit to any section (autosave marker). */
  updatedAt?: number;
  /** Section keys the coach touched this session (used for the 수정됨 label). */
  editedSections?: Array<'todayCovered' | 'feedback' | 'nextActions' | 'freeMemo'>;
  /** Frame/metric citations the AI cited when drafting `feedback`. */
  swingEvidence?: string[];
  /** Past-lesson references the AI cited when drafting `feedback`. */
  historyEvidence?: string[];
  /** AI's self-reported confidence in the drafted feedback. */
  confidence?: 'strong' | 'plausible' | 'speculative';
  /** Caveats the AI wanted the coach to see before approving. */
  caveats?: string[];
}

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

export interface MotionCaptureMeasurement {
  swingPhase?: string;           // e.g. '어드레스', '백스윙', '임팩트'
  timeSeconds?: number;          // timeline timestamp (e.g. -1.3, 0.0)
  headForwardTilt?: number;      // 고개가 앞으로 쏠림 (cm, positive=forward)
  headLateralSway?: number;      // 머리 좌우로 흔들림 (cm, positive=right)
  upperBodyPush?: number;        // 상체 상부 밀림 (cm, positive=forward)
  headLift?: number;             // 머리 들림 (cm, positive=up)
  upperBodyLateralMove?: number; // 상체 상부 좌우 이동 (cm, positive=right)
  hipSlide?: number;             // 골반 밀림 (cm, positive=forward)
  upperBodyLift?: number;        // 상체 상부 들림 (cm, positive=up)
}

export interface MotionCaptureData {
  measurements: MotionCaptureMeasurement[];
  aiAnalysis: string;
  analyzedAt: number;
}

/** 레슨 동반 필기 한 줄 — 레슨 시작 기준 오프셋(초)과 받아 적은 텍스트. */
export interface LiveLessonTranscriptEntry {
  startSec: number;
  text: string;
}

/**
 * 레슨 동반(LIVE_LESSON) 기록 전용 구조. 레슨 중 동반 화면에서 녹음·촬영한
 * 자료는 일반 레슨 기록과 저장 형태가 다르다: 음성이 ~10초 단위로 받아
 * 적힌 필기(레슨 내용 텍스트)와 그 필기를 정리한 요약본이 함께 남아야
 * 한다. 이 구조가 그 텍스트 자료를 담고, 음성/사진/영상 원본은 기존
 * videoUrl / additionalMedia(source: 'live_lesson')로 함께 저장된다.
 */
export interface LiveLessonDetail {
  /**
   * 레슨(녹음)이 시작된 wall-clock(ms). 레슨 중 찍은 자료의
   * `MediaItem.createdAt` 에서 이 값을 빼면 "레슨 시작 몇 초에 찍혔는지"가
   * 나온다. 스토리 조판기가 자료를 그 시점의 이야기 옆에 놓는 데 쓴다.
   * 구 기록에는 없다.
   */
  startedAt?: number;
  /** 전체 레슨 녹음 길이(초). */
  recordedDurationSec: number;
  /** 레슨 내용 텍스트 — 시간순 필기 노트. */
  transcript: LiveLessonTranscriptEntry[];
  /**
   * 필기를 정리한 최종 요약본 (aiAnalysis 와 동일 내용을 구조에도 보관).
   * 레슨 동반 검토를 거친 기록에서는 코치 요약과 학생 요약을 소제목으로
   * 합친 본문이다.
   */
  summary?: string;
  /**
   * 코치 발화만 근거로 정리한 요약 — 오늘 짚은 교정 포인트·드릴·처방.
   * `summary` 합본에서 이 부분만 따로 쓰는 화면(다음 레슨 이어가기)용.
   */
  coachSummary?: string;
  /**
   * 학생 발화만 근거로 정리한 요약 — 학생이 말한 느낌·어려움·질문·반응.
   * 코치 지시에 눌리지 않게 따로 보관한다(학생 성장 맥락의 근거).
   */
  studentSummary?: string;
  /** 레슨 중 강조된 교정 포인트 모음. */
  keyPoints?: string[];
  /** 레슨 중 언급된 드릴/과제 모음. */
  drills?: string[];
}

/**
 * 레슨 스토리(Lesson Story) — 기록을 블로그/일기 형태로 조판하기 위한
 * 표현 레이어. 기획: docs/LESSON_STORY_UI_PLAN.md
 *
 * 스토리는 블록의 순열이다. `services/lessonStoryComposer.ts` 의
 * `composeStory()` 가 Lesson 을 읽어 이 배열을 만들고, `LessonStoryView`
 * 는 배열만 보고 그린다 — 렌더러는 데이터 출처를 모른다. 덕분에 조판
 * 규칙을 순수 함수 테스트로 고정할 수 있고, 나중에 코치가 순서를 직접
 * 짜게 될 때(M3)는 "배열을 저장한다"가 전부가 된다.
 *
 * `cover` 가 날짜/회차/코치명을 함께 들고 있는 것은 의도다 — 이 정보는
 * 시각적으로 표지 안에 놓이므로 별도 meta 블록으로 쪼개면 렌더러가
 * 둘의 인접을 다시 가정해야 한다.
 */
export type StoryBlock =
  /**
   * 표지 — 한 줄 제목과 날짜·회차·코치명. **자료는 싣지 않는다.**
   * 맨 위에 사진을 크게 거는 것은 "그날의 얼굴"을 만들지만 그 사진이
   * 어느 이야기의 것인지를 지운다. 사진과 영상은 전부 본문으로 내려가
   * 찍힌 시각에 해당하는 문단 옆에 놓인다.
   */
  | {
      kind: 'cover';
      headline: string;
      dek?: string;
      date: string;
      sessionNumber?: number;
      coachName?: string;
    }
  /** 리드 — 본문보다 한 단계 큰 도입 문단. */
  | { kind: 'lead'; text: string }
  /** 오늘의 키워드 — keyPoints(key) / drills(drill) 손글씨 태그. */
  | { kind: 'chips'; items: string[]; tone: 'key' | 'drill' }
  | { kind: 'paragraph'; text: string }
  /** 문단 사이에 꽂히는 사진/영상. size 는 조판기가 번갈아 지정한다. */
  | { kind: 'photo'; mediaId: string; caption?: string; size: 'inset' | 'full' }
  | { kind: 'video'; mediaId: string; caption?: string; size: 'inset' | 'full' }
  /** 레슨 전/후 나란히. */
  | { kind: 'compare'; beforeId: string; afterId: string }
  /** 본문에 다 못 넣은 미디어 — 하단 그리드. */
  | { kind: 'gallery'; mediaIds: string[] }
  | { kind: 'filmstrip'; items: SwingSequenceItem[] }
  /** 샷 데이터 — 가로 스크롤 숫자 스트립. 차트는 자료 탭이 맡는다. */
  | { kind: 'data'; golf: GolfData }
  /** 다음 레슨까지 할 일. checkable 은 학생 뷰에서만 true. */
  | { kind: 'checklist'; items: string[]; checkable: boolean }
  | { kind: 'memo'; text: string }
  /** 그날의 필기 원문 — 기본 접힘. 접힌 동안 DOM 에 넣지 않는다. */
  | { kind: 'notefold'; transcript: LiveLessonTranscriptEntry[]; durationSec: number }
  | { kind: 'signature'; coachName?: string; signedAt?: number }
  /** 학생의 한마디. 비어 있으면 학생 뷰에서만 invite(입력 유도)로 뜬다. */
  | { kind: 'reply'; feedback?: ClientFeedback; invite: boolean };

/**
 * 스토리 조판을 위해 기록에 덧붙는 표현 정보. **모든 필드가 optional** 이고
 * 조판기가 기존 필드 폴백을 가지고 있으므로, 이 값이 통째로 없어도 화면은
 * 그대로 그려진다 — 과거 기록을 마이그레이션하지 않아도 되는 이유다.
 */
export interface LessonStory {
  /** 그날의 한 줄(18자 내외). 없으면 lesson.title 로 폴백한다. */
  headline?: string;
  /** 리드 위에 얹는 한 줄 요약(40자 내외). */
  dek?: string;
  /** mediaId → 손글씨 캡션. */
  captions?: Record<string, string>;
  /** 코치가 직접 짠 블록 순서(M3). 있으면 자동 조판을 건너뛴다. */
  blocks?: StoryBlock[];
  /** true 면 재생성이 blocks 를 덮어쓰지 않는다. */
  editedByCoach?: boolean;
  /** 스토리 메타가 생성된 시각(ms). */
  generatedAt?: number;
}

export interface Lesson {
  id: string;
  /** Composite key: `${clientName}_${clientPhone}` — the app-wide student identifier. */
  clientId?: string;
  clientName: string; // Name of the student/client
  clientPhone: string; // Added: Phone number for unique identification
  coachId?: string; // Added: ID of the coach associated with this lesson
  createdBy: 'COACH' | 'CLIENT'; // Added: Who created this record
  /**
   * Type of the record. 'LIVE_LESSON' (레슨 동반) marks a record created from
   * the 레슨 중 동반 flow — stored as its own category with transcript text
   * and a summary in `liveLessonDetail`, separate from regular lesson records.
   */
  recordType?: 'PRACTICE' | 'SCORE' | 'LESSON' | 'LIVE_LESSON';
  date: string;
  title: string;
  club?: string; // Added: Golf club used (e.g., '7 Iron', 'Driver')
  targetDistance?: number; // Added: Target distance for the shot in meters
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
  motionCaptureData?: MotionCaptureData;
  /**
   * 레슨 동반(LIVE_LESSON) 전용 자료 — 필기(레슨 내용 텍스트)와 요약본.
   * recordType === 'LIVE_LESSON' 인 기록에만 채워진다.
   */
  liveLessonDetail?: LiveLessonDetail;
  /**
   * Structured record sections the coach reviews before releasing to the
   * student (redesign screen `8b`). Populated by the agent when it drafts
   * a record from lesson audio + video; rendered as in-place-editable
   * blocks so the coach can adjust each independently. Optional so
   * legacy lessons that predate the review flow render as before.
   */
  reviewSections?: LessonReviewSections;
  /**
   * 블로그/일기 조판을 위한 표현 정보(헤드라인·캡션·대표컷 등).
   * 전부 optional — 없으면 `composeStory()` 가 기존 필드만으로 조판한다.
   */
  story?: LessonStory;
  /**
   * AI가 처음 뽑은 검토 초안 — write-once (docs/DATA_ARCHITECTURE.md §6.1).
   * `reviewSections`는 코치의 수정으로 계속 덮어써지므로, 그 전 상태를
   * 여기 남겨 "AI 초안 vs 코치 최종본" 학습쌍을 보존한다. 서버가
   * 권위를 가지며(한 번 적히면 갱신 불가), 학생에게는 내려가지 않는다.
   */
  reviewSectionsDraft?: LessonReviewSections;
  /** 초안이 처음 저장된 시각(ms). */
  reviewDraftAt?: number;
  /**
   * Review workflow state:
   * - 'draft':    agent-authored, not visible to student yet
   * - 'approved': coach explicitly approved; visible to student
   * When absent, the lesson is treated as legacy (visible to student
   * without an approval step, matching pre-8b behaviour).
   */
  approvalStatus?: 'draft' | 'approved';
  /** Wall-clock ms when the coach hit 승인 — anchors the 5-min undo window. */
  approvedAt?: number;
  /**
   * Whether the coach chose to also share the approved record with the
   * student in their app. Defaults true (matches the review UI toggle);
   * a coach can approve without sharing (private archive).
   */
  sharedToStudent?: boolean;
  /**
   * Data ownership tier (#309): 'student' | 'shared' | 'coach'. Lessons
   * default to 'shared' — the student keeps read access on handover, the
   * coach retains it while active. Server-authoritative; not settable by
   * clients.
   */
  ownership?: 'student' | 'shared' | 'coach';
  /**
   * Media visibility scope (#309): 'self' | 'coach' | 'branch'. The
   * student can downgrade to 'self' (본인만); the coach can raise to
   * 'branch' (지점까지). Default 'coach' (담당 코치까지).
   */
  visibility?: 'self' | 'coach' | 'branch';
  /**
   * Original coach at record-creation time. Preserved across handovers so
   * attribution survives when coach_id is reassigned or nulled after the
   * coach account closes.
   */
  originalCoachId?: string;
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
  /** Structured weekly schedule (day x hour grid). Optional for backwards compatibility. */
  weeklySchedule?: WeeklySchedule;
  /** Data-driven diagnosis summary used to seed the schedule. */
  diagnosis?: TrainingDiagnosis;
  createdAt: number;
  updatedAt: number;
}

// ── Weekly Schedule Types ────────────────────────────────────────────────────

/** Broad training bucket used for ratio bookkeeping and colour coding. */
export type TrainingCategory =
  | 'SHORT_GAME'      // 숏게임 (100m 이내 샷, 어프로치)
  | 'PUTTING'         // 퍼팅
  | 'CONTROL_SHOT'    // 컨트롤 샷
  | 'SWING'           // 스윙 (스피드/안정성/일관성)
  | 'TARGETING'       // 목표 타겟팅
  | 'BALL_FLIGHT'     // 구질 구현 (클럽 패스/페이스 컨트롤)
  | 'REST';           // 휴식/기타

/** A single training block placed in the weekly grid. */
export interface ScheduleSession {
  id: string;
  /** 0 = Monday … 6 = Sunday. */
  dayOfWeek: number;
  /** 24h format, "HH:MM". */
  startTime: string;
  /** Duration in minutes (30 min increments recommended). */
  durationMinutes: number;
  category: TrainingCategory;
  /** Short human label shown in the cell, e.g. "숏게임", "퍼팅". */
  label: string;
  /** Optional coach note / drill detail. */
  note?: string;
}

/** Configured training-time allocation across categories (minutes per week). */
export interface CategoryAllocation {
  category: TrainingCategory;
  minutes: number;
  /** Fraction of totalMinutes (0–1) for quick display. */
  ratio: number;
}

/** Full week plan produced by the AI and edited by the coach. */
export interface WeeklySchedule {
  /** Total planned minutes per week (sum of sessions). */
  totalMinutes: number;
  /** Per-category time allocation summary. */
  allocations: CategoryAllocation[];
  /** All training blocks in the week. */
  sessions: ScheduleSession[];
  /** Optional overall coach summary displayed above the grid. */
  overview?: string;
}

/** Data-driven diagnosis of a student's weak points. */
export interface TrainingDiagnosis {
  /** Short prose summary of the student's current state. */
  summary: string;
  /** Ranked list of weak areas the AI detected. */
  weakAreas: Array<{
    category: TrainingCategory;
    reason: string;
    /** 0–1 severity used for ratio weighting. */
    severity: number;
  }>;
  /** Ranked list of strengths worth maintaining. */
  strengths: string[];
}

export type ViewState = 'LIST' | 'DETAIL' | 'NEW' | 'COMPARE' | 'CLIENTS' | 'DIAGNOSIS_PROGRAM' | 'DIAGNOSIS_RESULT' | 'CLIENT_STATS' | 'LESSON_LIST' | 'LESSON_PACKAGE' | 'TRAINING_PROGRAM' | 'COACHX' | 'LESSON_UPLOAD' | 'LESSON_IMPACT' | 'POSTURE_ANALYSIS' | 'CURRICULUM';

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

/**
 * Preferred AI tone for the student's CoachX AI conversations.
 * - `friendly`: warm and encouraging (default).
 * - `coach`: direct, coach-like feedback.
 * - `minimal`: short, no fluff, data-first.
 */
export type AITone = 'friendly' | 'coach' | 'minimal';

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
  /**
   * Handover trail (redesign 7a, backed by #309 `previous_coach_ids`).
   * Every prior coach this student worked with, in chronological
   * assignment order. Populated automatically server-side when
   * coach_id changes. The 골프 여권 (6f) surfaces it as "코치 이력";
   * the future 인수인계 summary reads from here to know whose lesson
   * history to include.
   */
  previousCoachIds?: string[];
  /** The student's own 자기소개 / 목표, written from their profile screen. */
  memo?: string;
  /**
   * The assigned coach's private note about this student.
   *
   * Server-side this is a separate column from `memo` and is only ever
   * returned by the coach-scoped endpoints, so it never reaches the student
   * app. Both notes used to share `memo`, which meant a coach's note and a
   * student's bio silently overwrote each other.
   */
  coachMemo?: string;
  memberBodyAnalysis?: LessonBodyAnalysis; // Member body analysis managed in My Info
  // Added: Points
  currentPoints?: number;
  pushToken?: string; // Expo push token for push notifications (web/PWA)
  fcmToken?: string;  // FCM / APNs device token for Capacitor native push notifications
  aiTone?: AITone;
}

// ── Student AI Context ───────────────────────────────────────────────────────

/**
 * A per-club rolling profile aggregated from the student's practice + round data.
 * Written by `studentContextService` when new golf data lands (video analysis,
 * practice log OCR, round save). Read at inference time to seed AI prompts so
 * feedback references the student's actual tendencies instead of generic advice.
 */
export interface ClubProfile {
  club: string;               // e.g. 'DRIVER', '7 IRON', 'PW'
  avgCarry?: number;          // meters
  avgBallSpeed?: number;      // m/s or mph — units follow inputs
  avgClubSpeed?: number;
  ballFlight?: 'draw' | 'fade' | 'straight' | 'push' | 'pull';
  missPattern?: 'slice' | 'hook' | 'thin' | 'fat' | 'push' | 'pull' | null;
  sampleCount: number;
  updatedAt: number;
}

/**
 * Compact summary of one round the student played.
 * Bigger raw data (hole-by-hole scorecards) stays on Lesson/ScorecardDetail;
 * this is the tail that stays hot in the context slice for AI prompts.
 */
export interface RoundSummary {
  id: string;
  date: string;               // YYYY-MM-DD
  courseName?: string;
  totalScore?: number;
  fairwaysHit?: number;
  greensInRegulation?: number;
  totalPutts?: number;
  moodTag?: QuickLogMood;
  notes?: string;
  createdAt: number;
}

/**
 * A single reflective/emotional entry captured from voice or text.
 * Kept short — long transcripts belong in QuickLogEntry.notes.
 */
export interface EmotionEntry {
  id: string;
  date: string;               // YYYY-MM-DD
  mood: QuickLogMood;
  tags?: string[];            // e.g. ['자신감', '피로']
  note?: string;
  source: 'voice' | 'text';
  createdAt: number;
}

/**
 * A recurring swing fault the AI or coach has flagged for this student.
 * Used to highlight regression / improvement across sessions.
 */
export interface SwingFaultEntry {
  fault: string;              // e.g. '백스윙 오버', '스웨이'
  firstSeen: string;          // YYYY-MM-DD
  lastSeen: string;           // YYYY-MM-DD
  occurrences: number;
  lastLessonId?: string;
  status: 'active' | 'improving' | 'resolved';
}

/**
 * Aggregated student memory served to AI features.
 *
 * Stored server-side in Firestore (`student_contexts/{clientId}`) with a
 * localStorage cache for offline reads. Written by `studentContextService`
 * whenever new golf data arrives; read at prompt-build time by:
 *   - generateStudentChatResponse (AI home replies)
 *   - swing analysis prompts (personalized diagnosis)
 *   - round debrief prompts (why-this-hole-missed inference)
 *
 * All fields optional so a brand-new student profile validates as an empty ctx.
 */
export interface StudentContext {
  clientId: string;           // `${name}_${phone}`
  clubProfiles?: ClubProfile[];
  recentRounds?: RoundSummary[]; // capped to ~10
  swingFaultHistory?: SwingFaultEntry[];
  emotionLog?: EmotionEntry[];   // capped to ~30
  coachFeedbackDigest?: string[]; // capped to ~10 lines
  goals?: string[];
  updatedAt: number;
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
  | 'coach_material'
  | 'lesson_summary'
  | 'compare_swings'
  | 'motion_capture'
  | 'training_program'
  | 'student_chat'
  | 'shot_analysis';

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
/**
 * Provenance signal that elevated this exemplar into the coach's style pool.
 * - 'starred': coach explicitly marked the AI output as a good example
 * - 'edited':  coach edited the AI draft (implicit approval of the result)
 * - 'feedback': student rated the deliverable highly (future)
 * - 'auto':    heuristic pick (recency + depth + quality signals)
 * - 'dissent': coach explicitly said "다르게 봐요" — an equally strong signal
 *              that the AI's take diverges from theirs. Stored so future
 *              few-shot injection can carry the negative example alongside
 *              positives; the redesign's 6a screen ("코치 판단") writes here.
 */
export type CoachStyleExemplarSource =
  | 'starred'
  | 'edited'
  | 'feedback'
  | 'auto'
  | 'dissent';

/**
 * A concrete AI output the coach has endorsed for a specific target.
 * Later phases (RAG / few-shot) will retrieve top exemplars per target +
 * coachId at inference time so future AI calls mirror the coach's style.
 */
/**
 * One record per AI call — captured by the invokeBackendAI wrapper so we can
 * measure quality, cost, and latency per feature over time. Written as
 * fire-and-forget from the client after the response returns; a failing
 * write never affects the AI response itself.
 *
 * Design notes:
 * - `promptHash` (short sha) is stored instead of the raw prompt so that PII
 *   (member names, phone numbers, coach notes) never leaks into telemetry.
 * - `promptLength` / `responseLength` are character counts serving as cheap
 *   token proxies. Real Gemini token counts can be added later via the
 *   `usageMetadata` field the API returns.
 * - `status` distinguishes clean success from a fallback-to-heuristic path
 *   (`'fallback'`) and a hard error (`'error'`). Fallback rate is the single
 *   most important quality signal we track.
 */
export interface AiCallLog {
  id: string;
  /** Coach id whose scope the call was made under, if known. */
  coachId?: string;
  /** feature name (matches PromptTarget or the invokeBackendAI feature key). */
  feature: string;
  /** Short sha-256 hash of the prompt (first 12 chars). Never the raw prompt. */
  promptHash: string;
  /** Character count of the prompt sent (token proxy). */
  promptLength: number;
  /** Character count of the response received (token proxy). 0 on hard errors. */
  responseLength: number;
  /** End-to-end wall-clock latency in ms (client → server → Gemini → back). */
  latencyMs: number;
  /**
   * How the call resolved.
   * - 'success':  Gemini returned a valid response used by the caller.
   * - 'fallback': the caller fell back to a heuristic response (Gemini failed
   *   or was unavailable). This is what "AI feels dumb" numerically looks like.
   * - 'error':    an unrecoverable exception, no output usable at all.
   */
  status: 'success' | 'fallback' | 'error';
  /** Short error message when status is not 'success' — truncated to 200 chars. */
  errorMessage?: string;
  /** True when the request payload included coach-style few-shot exemplars. */
  hasExemplars: boolean;
  /** True when responseSchema was attached (structured JSON contract). */
  hasSchema: boolean;
  /**
   * True when the response came from the local aiResponseCache instead of
   * a real Gemini call. Cache hits skip the network entirely — latencyMs
   * will be near-zero and no cost is incurred.
   */
  cached?: boolean;
  /**
   * Which Gemini model actually served the request (e.g. "gemini-2.5-flash",
   * "gemini-2.5-pro"). Populated when the server reports the model in the
   * response; may be undefined for older backends or fallback paths.
   * Enables per-model latency / quality comparisons in the dashboard.
   */
  model?: string;
  /**
   * True when the promptSafety scan flagged the user-supplied portion of
   * this request as a likely injection attempt. Only present for calls
   * whose payload carried `userMessage` — everything else is undefined.
   * We measure but do not block; policy decisions come later.
   */
  injectionSuspected?: boolean;
  /** Comma-joined ids of matched injection patterns (dashboard display). */
  injectionMatches?: string;
  /**
   * Number of concrete evidence items the response carried (swing metrics,
   * frame IDs, past-lesson quotes). Zero means the model's judgement wasn't
   * grounded — the admin observability screen surfaces evidence-less
   * responses so we can find prompts that need tightening.
   */
  evidenceCount?: number;
  /**
   * Coarse-grained confidence the model self-reported for the primary
   * judgement, when the response schema included the field. Anything below
   * 'plausible' should be treated as推정 in the UI. Callers that produce
   * multiple judgements per call should pass the weakest (worst case).
   */
  confidence?: 'strong' | 'plausible' | 'speculative';
  /**
   * Number of prior lessons the response cited by id. Zero is normal for
   * a first-time analysis; a persistently zero count on features that
   * receive lesson history suggests the model isn't actually using it.
   */
  referencedLessonCount?: number;
  createdAt: number;
}

export interface CoachStyleExemplar {
  id: string;
  /**
   * Coach scope for this exemplar, mirroring PromptTemplate.coachId.
   * - undefined: global (owner's default style pool)
   * - <coach id>: only the coach it belongs to
   */
  coachId?: string;
  target: PromptTarget;
  /**
   * Compact snapshot of the input the AI was given, kept short so a batch
   * of exemplars can be injected as few-shot context without blowing the
   * prompt budget. Callers decide the shape per target.
   */
  input: string;
  /** The AI output the coach approved / edited / that was highly rated. */
  output: string;
  source: CoachStyleExemplarSource;
  /** Quality tier: 1 = highest (starred/edited by coach), 2 = medium, 3 = low. */
  tier: 1 | 2 | 3;
  /** Optional metadata: what specifically triggered inclusion. */
  reason?: string;
  createdAt: number;
}

/**
 * 코치·학생이 AI 출력에 보인 반응 = 라벨 (docs/DATA_ARCHITECTURE.md §6.2).
 *
 * CoachStyleExemplarSource 가 "무엇을 예시로 삼을까"의 어휘라면, 이쪽은
 * "무슨 일이 일어났나"의 어휘다. 부정 신호(regenerated, approval_undo)는
 * 예시가 되지 않지만 학습에서는 하드 네거티브로 쓰인다.
 */
export type AiFeedbackKind =
  | 'starred'
  | 'edited'
  | 'dissent'
  | 'regenerated'
  | 'approval_undo'
  | 'thumbs_up'
  | 'thumbs_down';

export interface AiFeedbackEventInput {
  kind: AiFeedbackKind;
  target?: PromptTarget;
  /** 'lesson' | 'weekly_insight' | 'shot_analysis' … */
  entityType?: string;
  entityId?: string;
  /** AI 원안. */
  originalOutput?: string;
  /** 사용자가 내보낸 최종본 (edited/dissent 일 때). */
  finalOutput?: string;
  tier?: 1 | 2 | 3;
  note?: string;
}

/** 목적별 동의 (docs/DATA_ARCHITECTURE.md §8.2). */
export type ConsentPurpose =
  | 'service'
  | 'ai_training'
  | 'media_branch_share'
  | 'marketing';

export interface ConsentRecord {
  purpose: ConsentPurpose;
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
  policyVersion: string | null;
}

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
  /**
   * Coach scope for this template.
   * - `undefined`: global template (applies when no coach-specific one is active).
   * - `<coach id>`: only applies when the caller's coachId matches.
   *
   * Runtime resolution order:
   *   coach-scoped active → global active → BUILTIN_SYSTEM_PROMPTS.
   *
   * Activation exclusivity is scoped: a coach-scoped active template does NOT
   * deactivate the global active template for the same target (they coexist
   * on different "layers"). Two active templates for the SAME (target, coachId)
   * pair are the ones that mutually exclude.
   */
  coachId?: string;
  attachments: PromptAttachment[];
  createdAt: number;
  updatedAt: number;
}

// ── Weekly Insight Types ─────────────────────────────────────────────────────

import type { AIEvidenceEnvelope } from './types/aiEvidence';

export interface WeeklyInsight extends AIEvidenceEnvelope {
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

/**
 * 7a · Coach handover briefing artifact.
 *
 * Generated the moment a student's coach reassignment is confirmed;
 * read by the incoming coach on their first visit to the student.
 * Never carries the outgoing coach's freeMemo — the server strips that
 * field for anyone but the author, and the AI prompt is explicitly told
 * to skip anything the coach marked private.
 */
export interface HandoverSummary extends AIEvidenceEnvelope {
  id: string;
  /** `${name}_${phone}` composite for the student the handover is about. */
  clientId: string;
  fromCoachId: string;
  toCoachId: string;
  headline: string;
  keyPoints: string[];
  recentFocus: string;
  watchOuts?: string[];
  /** Which categories the outgoing coach chose to share (7a review pane). */
  sharedItems: {
    recentLessons: boolean;
    swingHistory: boolean;
    diagnosisScores: boolean;
    currentCurriculum: boolean;
  };
  generatedAt: number;
  /**
   * Timestamp the incoming coach marked the banner as read. When set,
   * downstream UI stops surfacing the briefing (the summary itself is
   * still queryable for reference, just not attention-grabbing).
   */
  readAt?: number;
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
