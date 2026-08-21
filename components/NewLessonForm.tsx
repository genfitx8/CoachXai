import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from './LanguageContext';
import { Button } from './Button';
import {
  Upload,
  X,
  Video,
  AlertCircle,
  Camera,
  Mic,
  Plus,
  Trash2,
  Smartphone,
  UserCheck,
  Film,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  FileText,
  MonitorPlay,
  TableProperties,
  BarChart3,
  Trophy,
  BookOpen,
  Target,
  Flag,
  Search,
  User,
  PenTool,
  Play,
  ListChecks,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  FlagTriangleRight,
  StopCircle,
  RefreshCcw,
  ArrowLeft,
  CheckCircle,
  Circle,
  Scissors,
  Radio,
} from 'lucide-react';
import {
  extractGolfData,
  summarizeHoleVoice,
} from '../services/geminiService';
import {
  Lesson,
  MediaItem,
  ClientProfile,
  CoachProfile,
  GolfData,
  Homework,
  HoleRecord,
  ScorecardDetail,
  GolfCourse,
  LessonPackage,
  VideoEditMetadata,
  LiveLessonDetail,
} from '../types';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { videoStore, IDB_PREFIX, resolveSync } from '../services/videoStore';
import type { CapturedClip } from './LiveLessonCompanion';
import {
  collectSessionNotes,
  discardLessonAudioSession,
  parseReviewedTranscript,
  type LiveLessonHandoff,
} from '../services/lessonAudioPipeline';
import {
  isMediaPermissionError,
  requestMediaStream,
  type MediaKind,
} from '../utils/mediaPermissions';
import { PermissionDeniedModal } from './PermissionDeniedModal';
import { VideoEditor } from './VideoEditor';

interface NewLessonFormProps {
  existingClients: ClientProfile[];
  /** Lesson packages available to the coach – used to show package/session selection. */
  packages?: LessonPackage[];
  /** All lessons – used to determine which sessions are already recorded. */
  lessons?: Lesson[];
  onSave: (lesson: Lesson, homeworkBatch?: Homework[]) => Promise<void> | void;
  onCancel: () => void;
  userRole?: 'COACH' | 'CLIENT'; // Identify who is creating the lesson
  currentUser?: ClientProfile | CoachProfile;
  initialData?: Lesson; // Added for edit mode
  /**
   * When set, the CLIENT_SELECT step is skipped and the form opens directly
   * at the record-type selection step with this member pre-filled.
   * Used when the lesson-start suggestion flow triggers the new-lesson form.
   */
  prefilledClient?: ClientProfile;
  /**
   * 3c handoff: clips captured during the live-lesson companion mode.
   * The form converts each one to a PendingMedia entry on mount so the
   * coach can review, trim, and save without re-selecting anything.
   * Parent should clear this after handoff to avoid re-consuming on
   * subsequent renders.
   */
  initialClips?: CapturedClip[];
  /** Called once the form has consumed initialClips so the parent can clear its bucket. */
  onInitialClipsConsumed?: () => void;
  /**
   * 3c 핸드오프의 라이브 녹음 세션. 존재하면 저장 시 오디오를 다시 AI로
   * 보내는 대신 레슨 중에 이미 생성된 구간 분석 노트를 수거해 텍스트
   * map-reduce 로 최종 요약을 만든다 — 30–50분 레슨도 요약이 수 초면 끝난다.
   */
  initialLiveSession?: LiveLessonHandoff;
}

interface PendingMedia {
  id: string;
  file: File | null; // Allow null for existing remote files
  previewUrl: string;
  type: 'video' | 'image' | 'audio';
  duration?: number;
  isRemote?: boolean; // Flag for existing files
  role?: 'BEFORE' | 'AFTER';
  editMetadata?: VideoEditMetadata; // Populated when user edits the swing video before upload
  /** 3c handoff: mark clips that came from LiveLessonCompanion. */
  source?: 'live_lesson';
}

type RecordType = 'PRACTICE' | 'SCORE' | 'LESSON' | 'LIVE_LESSON';

// Helper to get local YYYY-MM-DD
const getLocalISODate = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// `pt-safe` keeps the header clear of the status bar / notch. It lives on the
// shell rather than the header because the header already owns a `py-4` and
// `.pt-safe` replaces padding instead of adding to it (it is declared outside
// every cascade layer, so it outranks Tailwind's utilities). The matching
// bottom inset comes from `bottomNavPadClass` below.
const LESSON_FLOW_SHELL_CLASS =
  'fixed inset-0 z-50 bg-base text-ink-high flex flex-col overflow-hidden pt-safe';
const LESSON_FLOW_HEADER_CLASS =
  'bg-base/95 border-b border-line-subtle px-5 py-4 flex items-center justify-between text-ink-high flex-shrink-0 backdrop-blur-md';
const LESSON_FLOW_INPUT_CLASS =
  'w-full pl-10 pr-4 py-3 border border-line-subtle rounded-xl bg-white/[0.04]/[0.04] text-ink-high placeholder:text-ink-muted focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all';
// Every action button in the lesson flow shares one height / radius / type
// scale so the stacked CTAs read as a single group. Colour is the only thing
// that separates the primary action from the secondary ones.
const LESSON_FLOW_ACTION_BTN_CLASS = 'text-base font-bold';

// Detailed Club Options Definition
const CLUB_GROUPS = [
  {
    label: 'Driver',
    options: ['Driver'],
  },
  {
    label: 'Wood',
    options: [
      '3 Wood',
      '4 Wood',
      '5 Wood',
      '6 Wood',
      '7 Wood',
      '8 Wood',
      '9 Wood',
    ],
  },
  {
    label: 'Hybrid',
    options: [
      'Hybrid 1',
      'Hybrid 2',
      'Hybrid 3',
      'Hybrid 4',
      'Hybrid 5',
      'Hybrid 6',
      'Hybrid 7',
    ],
  },
  {
    label: 'Iron',
    options: [
      '1 Iron',
      '2 Iron',
      '3 Iron',
      '4 Iron',
      '5 Iron',
      '6 Iron',
      '7 Iron',
      '8 Iron',
      '9 Iron',
    ],
  },
  {
    label: 'Wedge',
    options: [
      'PW',
      'AW',
      'SW',
      'LW',
      '46°',
      '48°',
      '50°',
      '52°',
      '54°',
      '56°',
      '58°',
      '60°',
    ],
  },
  {
    label: 'Putter',
    options: ['Putter'],
  },
];

export const NewLessonForm: React.FC<NewLessonFormProps> = ({
  existingClients,
  packages,
  lessons: allLessons,
  onSave,
  onCancel,
  userRole = 'COACH',
  currentUser,
  initialData,
  prefilledClient,
  initialClips,
  onInitialClipsConsumed,
  initialLiveSession,
}) => {
  const { t } = useLanguage();
  // Coach shell sits at the same z-index as the fixed coach bottom tab bar, so
  // it reserves the nav's height (that class already folds in the device
  // inset). The student opens this form as a sub-view, which unmounts the
  // student nav — but the gesture bar / home indicator is still there, so the
  // shell takes the bare inset. Either way the sticky footers below can keep
  // their own `p-5` gutter, instead of a bottom-inset utility on the same
  // element overwriting it.
  const bottomNavPadClass = userRole === 'COACH' ? ' above-coach-bottom-nav' : ' pb-safe';
  // 레슨 동반(3c) 핸드오프로 열렸는가 — 이 경우 기록 유형은 코치가 고르는
  // 것이 아니라 'LIVE_LESSON'(레슨 동반 기록)으로 고정되고, 필기·요약본이
  // 함께 저장되는 전용 형태로 남는다.
  const isLiveLessonHandoff = !!(initialClips?.length || initialLiveSession);

  // Wizard State: COACH starts at CLIENT_SELECT, CLIENT starts at TYPE_SELECT
  // When prefilledClient is provided, skip CLIENT_SELECT and jump to TYPE_SELECT.
  // 레슨 동반 핸드오프는 유형이 정해져 있으므로 TYPE_SELECT 를 건너뛴다.
  const [step, setStep] = useState<'CLIENT_SELECT' | 'PACKAGE_SELECT' | 'TYPE_SELECT' | 'FORM'>(
    initialData
      ? 'FORM'
      : userRole === 'COACH' && !prefilledClient
      ? 'CLIENT_SELECT'
      : isLiveLessonHandoff
      ? 'FORM'
      : 'TYPE_SELECT'
  );

  const [recordType, setRecordType] = useState<RecordType>(
    isLiveLessonHandoff ? 'LIVE_LESSON' : 'PRACTICE'
  );

  // Media State
  const [mediaItems, setMediaItems] = useState<PendingMedia[]>([]);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);

  // UI State
  const [isAddingMore, setIsAddingMore] = useState(false);
  const [inputMethod, setInputMethod] = useState<
    'upload' | 'camera' | 'voice' | 'screen' | 'shotdata'
  >('upload');

  // Form State
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  // Package/Session selection state (PACKAGE_SELECT step)
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [selectedSessionNumber, setSelectedSessionNumber] = useState<number | null>(null);

  const [title, setTitle] = useState('');
  const [club, setClub] = useState('');
  const [targetDistance, setTargetDistance] = useState<number | ''>('');
  const [score, setScore] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  // Golf Data Extraction Mode
  const [isDataExtractionMode, setIsDataExtractionMode] = useState(false);

  // Manual Shot Data Entry (structured GolfData inputs)
  const [manualGolfData, setManualGolfData] = useState<Partial<GolfData>>({});

  const updateManualGolfField = (
    key: keyof GolfData,
    raw: string
  ) => {
    setManualGolfData((prev) => {
      const next = { ...prev };
      if (raw === '') {
        delete next[key];
      } else {
        const num = Number(raw);
        if (Number.isFinite(num)) {
          next[key] = num;
        }
      }
      return next;
    });
  };

  const hasManualGolfData = Object.values(manualGolfData).some(
    (v) => v !== undefined && v !== null && !Number.isNaN(v)
  );

  // Shot Data Photo (launch-monitor screenshot attached inside the shot data panel)
  const [shotDataPhoto, setShotDataPhoto] = useState<{
    file: File;
    previewUrl: string;
    mediaId: string;
  } | null>(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [autoFillError, setAutoFillError] = useState<string | null>(null);
  const shotDataPhotoInputRef = useRef<HTMLInputElement>(null);
  const shotDataCameraInputRef = useRef<HTMLInputElement>(null);

  // Scorecard Specific Mode State
  const [scoreMode, setScoreMode] = useState<'SIMPLE' | 'DETAILED'>('SIMPLE');
  const [courseName, setCourseName] = useState('');
  const [holeRecords, setHoleRecords] = useState<HoleRecord[]>(
    Array.from({ length: 18 }, (_, i) => ({
      holeNumber: i + 1,
      par: i < 9 ? (i === 4 || i === 8 ? 5 : i === 2 || i === 6 ? 3 : 4) : 4, // Simple Mock Par Distribution
      score: 0,
      putts: 0,
    }))
  );
  const [activeRecordingHole, setActiveRecordingHole] = useState<number | null>(
    null
  ); // Hole number currently being recorded
  const [recordingHoleTime, setRecordingHoleTime] = useState(0);

  // Course Search State
  const [courseSearchResults, setCourseSearchResults] = useState<GolfCourse[]>(
    []
  );
  const [showCourseSearch, setShowCourseSearch] = useState(false);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [permissionRequest, setPermissionRequest] = useState<{
    kind: MediaKind;
    retry: () => void;
  } | null>(null);

  const getHoleVoiceUrls = (hole: HoleRecord): string[] => {
    if (hole.voiceUrls && hole.voiceUrls.length > 0) {
      return hole.voiceUrls;
    }
    return hole.voiceUrl ? [hole.voiceUrl] : [];
  };

  // Recording State (Main Media)
  const [isMediaReady, setIsMediaReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user'); // Camera facing mode

  // Swing-video pre-upload editor state
  const [editorTargetId, setEditorTargetId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // Separate ref for hole recording to avoid conflict
  const holeMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const holeChunksRef = useRef<Blob[]>([]);

  // Mirror of holeRecords for use inside async media-recorder callbacks where
  // the closure would otherwise see stale par/score/putts values.
  const holeRecordsRef = useRef<HoleRecord[]>([]);

  // Track URLs for cleanup
  const mediaUrlsRef = useRef<string[]>([]);
  const savedUrlsRef = useRef<Set<string>>(new Set());

  // Shot data is a media-upload method of its own (non-score records only).
  const isShotDataTab = recordType !== 'SCORE' && inputMethod === 'shotdata';

  // The shot data panel attaches its photo to mediaItems, so keep the upload
  // interface open while that tab is active instead of flipping to the preview list.
  const showAddInterface =
    mediaItems.length === 0 || isAddingMore || isShotDataTab;

  // 3c handoff: convert clips captured by LiveLessonCompanion into
  // PendingMedia entries once, on the first render that receives them.
  // Guarded with a ref so re-renders with the same clip array don't
  // duplicate. Parent is expected to null out `initialClips` (via
  // onInitialClipsConsumed) after handoff.
  const consumedClipsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!initialClips?.length) return;
    const fresh = initialClips.filter((c) => !consumedClipsRef.current.has(c.id));
    if (fresh.length === 0) return;

    const added: PendingMedia[] = fresh.map((clip) => {
      const type: PendingMedia['type'] =
        clip.kind === 'voice' ? 'audio' : clip.kind === 'photo' ? 'image' : 'video';
      // The companion already produced an object URL for preview; the form
      // creates its own via URL.createObjectURL below so cleanup ownership is
      // clear (mediaUrlsRef → revokeObjectURL on unmount).
      const ext =
        type === 'audio' ? 'webm' : type === 'image' ? 'jpg' : 'mp4';
      const filename = `live-${clip.kind}-${clip.id}.${ext}`;
      const mime =
        type === 'audio'
          ? clip.blob.type || 'audio/webm'
          : type === 'image'
          ? clip.blob.type || 'image/jpeg'
          : clip.blob.type || 'video/mp4';
      const file = new File([clip.blob], filename, { type: mime });
      const previewUrl = URL.createObjectURL(file);
      mediaUrlsRef.current.push(previewUrl);
      consumedClipsRef.current.add(clip.id);
      return {
        id: crypto.randomUUID(),
        file,
        previewUrl,
        type,
        duration: clip.durationSec || undefined,
        isRemote: false,
        source: 'live_lesson',
      };
    });

    setMediaItems((prev) => {
      const next = [...added, ...prev];
      // Keep the first newly-added item selected so the coach lands on it.
      if (added.length > 0) setSelectedMediaId(added[0].id);
      return next;
    });
    onInitialClipsConsumed?.();
  }, [initialClips, onInitialClipsConsumed]);

  // 라이브 세션 핸드오프는 부모가 버킷을 비운 뒤에도 저장 시점까지 필요하다
  // — 첫 수신 때 ref 에 눌러 담아 prop 이 사라져도 유지한다.
  const liveSessionRef = useRef<LiveLessonHandoff | null>(null);
  useEffect(() => {
    if (initialLiveSession) liveSessionRef.current = initialLiveSession;
  }, [initialLiveSession]);

  // 레슨 동반 핸드오프는 TYPE_SELECT(제목 프리필 지점)를 건너뛰고 바로
  // FORM 으로 들어오므로 기본 제목을 여기서 채운다. 마운트 시 한 번만.
  useEffect(() => {
    if (!isLiveLessonHandoff || initialData) return;
    setTitle((prev) => {
      if (prev) return prev;
      const today = new Date();
      return `${today.getMonth() + 1}월 ${today.getDate()}일 레슨 동반 기록`;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // If Client Mode, auto-fill name and phone
    if (userRole === 'CLIENT' && currentUser) {
      setClientName(currentUser.name);
      setClientPhone(currentUser.phone);
    }

    // Pre-fill client from lesson-start suggestion (coach flow, skipped CLIENT_SELECT)
    if (userRole === 'COACH' && prefilledClient && !initialData) {
      setClientName(prefilledClient.name);
      setClientPhone(prefilledClient.phone);
    }

    // Populate from initialData if editing
    if (initialData) {
      setClientName(initialData.clientName);
      setClientPhone(initialData.clientPhone);
      setTitle(initialData.title);
      setClub(initialData.club || '');
      setTargetDistance(
        typeof initialData.targetDistance === 'number'
          ? initialData.targetDistance
          : ''
      );
      setNotes(initialData.coachNotes || '');
      setRecordType(initialData.recordType || 'LESSON');

      if (initialData.golfData) {
        setManualGolfData({ ...initialData.golfData });
      }

      if (initialData.recordType === 'SCORE') {
        if (initialData.scorecardDetail) {
          setScoreMode('DETAILED');
          setCourseName(initialData.scorecardDetail.courseName);
          setHoleRecords(
            initialData.scorecardDetail.holes.map((hole) => ({
              ...hole,
              voiceUrls: getHoleVoiceUrls(hole),
            }))
          );
          setScore(initialData.score || initialData.scorecardDetail.totalScore);
        } else {
          setScoreMode('SIMPLE');
          setScore(initialData.score || '');
        }
      }

      // Reconstruct media items, resolving any idb:// URLs to blob: URLs for
      // playback (browsers cannot load idb:// scheme natively).
      const resolvePreviewUrl = async (url: string): Promise<string> => {
        if (!url?.startsWith(IDB_PREFIX)) return url;
        const sync = resolveSync(url);
        if (sync) return sync;
        return (await videoStore.resolve(url)) ?? url;
      };

      const reconstructedMedia: PendingMedia[] = [];
      if (initialData.videoUrl) {
        reconstructedMedia.push({
          id: 'main',
          file: null,
          previewUrl: initialData.videoUrl, // updated below after resolution
          type: initialData.mediaType,
          isRemote: true,
        });
      }
      if (initialData.additionalMedia) {
        initialData.additionalMedia.forEach((m) => {
          reconstructedMedia.push({
            id: m.id,
            file: null,
            previewUrl: m.url,
            type: m.type,
            isRemote: true,
            role: m.role,
          });
        });
      }
      setMediaItems(reconstructedMedia);

      // Resolve any idb:// preview URLs asynchronously
      (async () => {
        let changed = false;
        const resolved = await Promise.all(
          reconstructedMedia.map(async (item) => {
            if (!item.previewUrl?.startsWith(IDB_PREFIX)) return item;
            const blobUrl = await resolvePreviewUrl(item.previewUrl);
            if (blobUrl !== item.previewUrl) { changed = true; return { ...item, previewUrl: blobUrl }; }
            return item;
          })
        );
        if (changed) setMediaItems(resolved);
      })();
    }

    return () => {
      stopMediaStream();
      // Clean up object URLs to prevent memory leaks, BUT keep the ones that were saved
      mediaUrlsRef.current.forEach((url) => {
        if (!savedUrlsRef.current.has(url)) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [userRole, currentUser, initialData]);

  useEffect(() => {
    if (isMediaReady && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [isMediaReady]);

  // Update total score when hole records change
  useEffect(() => {
    if (scoreMode === 'DETAILED') {
      const total = holeRecords.reduce((sum, h) => sum + (h.score || 0), 0);
      setScore(total > 0 ? total : '');
    }
  }, [holeRecords, scoreMode]);

  // Keep the ref in sync so async recorder callbacks see the latest hole state.
  useEffect(() => {
    holeRecordsRef.current = holeRecords;
  }, [holeRecords]);

  // Suggestion filtering
  const searchableClients =
    userRole === 'COACH' && currentUser && 'id' in currentUser
      ? existingClients.filter((c) => c.coachId === currentUser.id)
      : existingClients;

  const matchingClients = clientName.trim()
    ? searchableClients.filter((c) =>
        c.name.toLowerCase().includes(clientName.toLowerCase())
      )
    : [];

  const isExistingClientSelected = searchableClients.some(
    (c) => c.name === clientName && c.phone === clientPhone
  );

  const handleClientNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setClientName(val);
    if (isExistingClientSelected) {
      setClientPhone('');
    }
  };

  const selectSuggestion = (client: ClientProfile) => {
    setClientName(client.name);
    setClientPhone(client.phone);
  };

  // Course Search Handler
  const handleCourseNameChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const val = e.target.value;
    setCourseName(val);

    if (val.trim().length > 1) {
      let results: GolfCourse[] = [];
      if (firebaseService.isInitialized()) {
        results = await firebaseService.searchGolfCourses(val);
      } else {
        const all = storageService.getGolfCourses();
        results = all.filter((c) => c.name.includes(val));
      }
      setCourseSearchResults(results);
      setShowCourseSearch(true);
    } else {
      setCourseSearchResults([]);
      setShowCourseSearch(false);
    }
  };

  const selectCourse = (course: GolfCourse) => {
    setCourseName(course.name);

    // Update pars
    const newHoleRecords = holeRecords.map((hole, index) => ({
      ...hole,
      par: course.pars[index] || 4,
    }));
    setHoleRecords(newHoleRecords);

    setShowCourseSearch(false);
  };

  const handleStartLesson = () => {
    if (!clientName.trim()) {
      setError(t('new_lesson_member_name_required'));
      return;
    }
    if (!isExistingClientSelected && !clientPhone.trim()) {
      setError(t('new_lesson_member_not_found'));
      return;
    }

    setError(null);
    // 레슨 동반 핸드오프로 열린 폼은 유형이 '레슨 동반 기록'으로 고정된다.
    setRecordType(isLiveLessonHandoff ? 'LIVE_LESSON' : 'LESSON');

    const today = new Date();
    const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일`;
    setTitle(`${dateStr} ${isLiveLessonHandoff ? '레슨 동반 기록' : '레슨 기록'}`);

    // If the selected client has packages, go to PACKAGE_SELECT step first
    const clientId = `${clientName.trim()}_${clientPhone.trim()}`;
    const clientPackages = (packages ?? []).filter((p) => p.clientId === clientId);
    if (clientPackages.length > 0) {
      setSelectedPackageId(null);
      setSelectedSessionNumber(null);
      setStep('PACKAGE_SELECT');
    } else {
      setStep('FORM');
    }
  };

  const handleStartRound = () => {
    if (!clientName.trim()) {
      setError(t('new_lesson_member_name_required'));
      return;
    }
    if (!isExistingClientSelected && !clientPhone.trim()) {
      setError(t('new_lesson_member_not_found'));
      return;
    }

    setError(null);
    setRecordType('SCORE');
    setIsDataExtractionMode(false);
    setScoreMode('SIMPLE');

    const today = new Date();
    const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일`;
    setTitle(`${dateStr} 필드 스코어`);

    setStep('FORM');
  };

  const handleSelectType = (type: RecordType) => {
    setRecordType(type);
    setStep('FORM');

    const today = new Date();
    const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일`;

    if (type === 'SCORE') {
      setTitle(`${dateStr} 필드 스코어`);
      setIsDataExtractionMode(false);
      setScoreMode('SIMPLE'); // Default to simple
    } else if (type === 'LESSON') {
      setTitle(`${dateStr} 레슨 기록`);
    } else {
      setTitle(`${dateStr} 자율 연습`);
    }
  };

  // --- Hole Recording Logic ---

  const startHoleRecording = async (holeNum: number) => {
    try {
      const stream = await requestMediaStream({ audio: true });
      holeChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      holeMediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) holeChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(holeChunksRef.current, { type: 'audio/mp4' });
        const url = URL.createObjectURL(blob);
        mediaUrlsRef.current.push(url);

        // Find hole data (via ref so we see the latest par/score/putts, not
        // stale values from when the recording started).
        const hole = holeRecordsRef.current.find((h) => h.holeNumber === holeNum);
        if (!hole) return;

        // Immediately trigger AI Summary & Metric Extraction
        setStatusMessage(`${holeNum}번 홀 플레이 내용을 분석 중입니다...`);
        setIsAnalyzing(true);

        try {
          const result = await summarizeHoleVoice(
            blob,
            holeNum,
            hole.par,
            hole.score,
            hole.putts
          );

          setHoleRecords((prev) =>
            prev.map((h) =>
              h.holeNumber === holeNum
                ? {
                    ...h,
                    voiceUrls: [...getHoleVoiceUrls(h), url],
                    voiceUrl: url,
                    aiSummary: result.summary,
                    shotMetrics: result.metrics, // Save structured metrics
                  }
                : h
            )
          );
        } catch (e) {
          console.error(e);
          // Save voice even if AI fails
          setHoleRecords((prev) =>
            prev.map((h) =>
              h.holeNumber === holeNum
                ? {
                    ...h,
                    voiceUrls: [...getHoleVoiceUrls(h), url],
                    voiceUrl: url,
                    aiSummary: '분석 실패',
                  }
                : h
            )
          );
        } finally {
          setIsAnalyzing(false);
          setStatusMessage('');
        }

        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setActiveRecordingHole(holeNum);
      setRecordingHoleTime(0);
      timerRef.current = window.setInterval(
        () => setRecordingHoleTime((p) => p + 1),
        1000
      );
    } catch (e) {
      if (isMediaPermissionError(e) && e.kind === 'denied') {
        setPermissionRequest({
          kind: 'microphone',
          retry: () => startHoleRecording(holeNum),
        });
      } else {
        console.error(e);
        setError(t('new_lesson_mic_required'));
      }
    }
  };

  const stopHoleRecording = () => {
    if (holeMediaRecorderRef.current && activeRecordingHole !== null) {
      holeMediaRecorderRef.current.stop();
      setActiveRecordingHole(null);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const updateHoleData = (
    holeNum: number,
    field: keyof HoleRecord,
    value: any
  ) => {
    setHoleRecords((prev) =>
      prev.map((h) => (h.holeNumber === holeNum ? { ...h, [field]: value } : h))
    );
  };

  // --- Main Media Handlers ---

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach((file: File) => processFile(file));
    }
  };

  const processFile = (file: File) => {
    const MAX_SIZE = 5 * 1024 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setError(t('new_lesson_file_too_large'));
      return;
    }

    let type: 'video' | 'image' | 'audio' = 'video';
    if (file.type.startsWith('video/')) type = 'video';
    else if (file.type.startsWith('image/')) type = 'image';
    else if (file.type.startsWith('audio/')) type = 'audio';
    else {
      setError(t('new_lesson_unsupported_file'));
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    mediaUrlsRef.current.push(previewUrl);

    let duration = 0;
    if (type === 'video') {
      const tempVid = document.createElement('video');
      tempVid.src = previewUrl;
      tempVid.onloadedmetadata = () => {
        duration = tempVid.duration;
        setMediaItems((prev) =>
          prev.map((p) =>
            p.previewUrl === previewUrl ? { ...p, duration } : p
          )
        );
      };
    }

    const newItem: PendingMedia = {
      id: crypto.randomUUID(),
      file,
      previewUrl,
      type,
      duration,
      isRemote: false,
    };

    setMediaItems((prev) => {
      const newItems = [...prev, newItem];
      setSelectedMediaId(newItem.id);
      return newItems;
    });

    setError(null);
    setIsAddingMore(false);

    if (!title && mediaItems.length === 0 && !initialData) {
      const today = new Date();
      const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일`;
      let typeStr = '기록';
      if (recordType === 'SCORE') typeStr = '스코어';
      else if (recordType === 'LESSON') typeStr = '레슨';
      else if (recordType === 'LIVE_LESSON') typeStr = '레슨 동반';
      else typeStr = '연습';

      if (type === 'audio') typeStr += ' (음성)';

      setTitle(`${dateStr} ${typeStr}`);
    }

    // Editing is opt-in: the uploaded clip is kept as-is and the coach opens
    // the editor from the preview only when they actually want to trim,
    // add commentary, draw, or slow down the swing.
  };

  const handleEditorSave = (
    editedBlob: Blob,
    metadata: VideoEditMetadata
  ) => {
    if (!editorTargetId) return;
    const targetId = editorTargetId;
    const editedUrl = URL.createObjectURL(editedBlob);
    mediaUrlsRef.current.push(editedUrl);
    const editedFile = new File(
      [editedBlob],
      `swing-edited-${Date.now()}.mp4`,
      { type: editedBlob.type || 'video/mp4' }
    );

    setMediaItems((prev) =>
      prev.map((item) =>
        item.id === targetId
          ? {
              ...item,
              file: editedFile,
              previewUrl: editedUrl,
              editMetadata: metadata,
              isRemote: false,
            }
          : item
      )
    );

    // Refresh duration for the edited clip.
    const tempVid = document.createElement('video');
    tempVid.src = editedUrl;
    tempVid.onloadedmetadata = () => {
      const duration = tempVid.duration;
      setMediaItems((prev) =>
        prev.map((p) => (p.id === targetId ? { ...p, duration } : p))
      );
    };

    setEditorTargetId(null);
  };

  const handleEditorSkip = () => {
    // User dismissed the editor without applying edits — keep the original clip.
    setEditorTargetId(null);
  };

  const editorTargetItem = editorTargetId
    ? mediaItems.find((m) => m.id === editorTargetId)
    : null;

  const removeMediaItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMediaItems((prev) => {
      const newItems = prev.filter((item) => item.id !== id);
      if (selectedMediaId === id && newItems.length > 0)
        setSelectedMediaId(newItems[0].id);
      if (newItems.length === 0) setIsAddingMore(false);
      return newItems;
    });
    if (shotDataPhoto?.mediaId === id) {
      setShotDataPhoto(null);
    }
  };

  const handleShotDataPhotoSelect = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAutoFillError('이미지 파일만 첨부할 수 있습니다.');
      e.target.value = '';
      return;
    }

    // Replace any prior shot-data photo (both in the panel and in mediaItems)
    if (shotDataPhoto) {
      setMediaItems((prev) =>
        prev.filter((item) => item.id !== shotDataPhoto.mediaId)
      );
    }

    const previewUrl = URL.createObjectURL(file);
    mediaUrlsRef.current.push(previewUrl);
    const mediaId = crypto.randomUUID();
    const newItem: PendingMedia = {
      id: mediaId,
      file,
      previewUrl,
      type: 'image',
      isRemote: false,
    };
    setMediaItems((prev) => [...prev, newItem]);
    setShotDataPhoto({ file, previewUrl, mediaId });
    setAutoFillError(null);
    // Allow re-selecting the same file later
    e.target.value = '';

    // Extract shot data from the photo right away — no manual trigger.
    void runAutoFillFromPhoto(file);
  };

  const removeShotDataPhoto = () => {
    if (!shotDataPhoto) return;
    setMediaItems((prev) =>
      prev.filter((item) => item.id !== shotDataPhoto.mediaId)
    );
    setShotDataPhoto(null);
    setAutoFillError(null);
  };

  const runAutoFillFromPhoto = async (file: File) => {
    setIsAutoFilling(true);
    setAutoFillError(null);
    try {
      const nameToSearch = clientName.split('(')[0].trim();
      const result = await extractGolfData(
        {
          data: file,
          mimeType: file.type,
        },
        nameToSearch
      );
      if (result.golfData) {
        setManualGolfData((prev) => ({ ...prev, ...result.golfData }));
      } else {
        setAutoFillError('사진에서 샷 데이터를 찾지 못했습니다.');
      }
    } catch (err) {
      console.error('Shot data auto-fill failed', err);
      setAutoFillError('사진 분석에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsAutoFilling(false);
    }
  };

  const toggleVideoCategory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMediaItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next: 'BEFORE' | 'AFTER' | undefined =
          item.role === undefined
            ? 'BEFORE'
            : item.role === 'BEFORE'
            ? 'AFTER'
            : undefined;
        return { ...item, role: next };
      })
    );
  };

  const stopMediaStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsMediaReady(false);
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecordingTime(0);
  };

  const startCamera = async (overrideMode?: 'user' | 'environment') => {
    const targetMode = overrideMode || facingMode;
    try {
      setError(null);
      stopMediaStream();
      const stream = await requestMediaStream({
        video: { facingMode: targetMode },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsMediaReady(true);
    } catch (err) {
      if (isMediaPermissionError(err) && err.kind === 'denied') {
        setPermissionRequest({
          kind: 'both',
          retry: () => startCamera(targetMode),
        });
      } else {
        setError(t('new_lesson_camera_required'));
      }
    }
  };

  const toggleCamera = () => {
    if (isRecording) return; // Prevent switching while recording
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    startCamera(newMode);
  };

  const startMic = async () => {
    try {
      setError(null);
      stopMediaStream();
      const stream = await requestMediaStream({ audio: true });
      streamRef.current = stream;
      setIsMediaReady(true);
    } catch (err) {
      if (isMediaPermissionError(err) && err.kind === 'denied') {
        setPermissionRequest({ kind: 'microphone', retry: () => startMic() });
      } else {
        setError(t('new_lesson_mic_required'));
      }
    }
  };

  const startScreenCapture = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError(t('lesson_screen_record_unsupported'));
      setInputMethod('upload');
      return;
    }
    try {
      setError(null);
      stopMediaStream();
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsMediaReady(true);
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError(t('lesson_screen_capture_denied'));
      } else if (err.name !== 'AbortError') {
        console.error(err);
      }
      setInputMethod('upload');
    }
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    let mimeType =
      inputMethod === 'voice'
        ? MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm'
        : MediaRecorder.isTypeSupported('video/mp4')
        ? 'video/mp4'
        : 'video/webm';

    try {
      const recorder = new MediaRecorder(streamRef.current, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = mimeType.split('/')[1];
        processFile(new File([blob], `recorded.${ext}`, { type: mimeType }));
        stopMediaStream();
      };
      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(
        () => setRecordingTime((p) => p + 1),
        1000
      );
      // When user clicks browser's native "Stop sharing" button during screen recording
      if (inputMethod === 'screen') {
        const videoTrack = streamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
              mediaRecorderRef.current.stop();
            }
          };
        }
      }
    } catch (err) {
      setError(t('new_lesson_record_start_failed'));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording)
      mediaRecorderRef.current.stop();
  };

  const takePhoto = () => {
    if (!streamRef.current || !videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          processFile(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
          stopMediaStream();
        }
      }, 'image/jpeg');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const hasMeaningfulMemo = notes.trim().length > 0;
    const hasSimpleScore =
      recordType === 'SCORE' && scoreMode === 'SIMPLE' && score !== '';

    // 레슨 동반: 캡처 미디어가 없어도 필기(라이브 세션 또는 기존 기록의
    // transcript)가 있으면 그 자체로 의미 있는 기록이다.
    const hasLiveLessonContent =
      recordType === 'LIVE_LESSON' &&
      !!(liveSessionRef.current || initialData?.liveLessonDetail);

    // Validation for Media
    // In Simple Mode, media or memo is required — except for round records
    // where the user typed a total score directly (score alone is enough).
    // In Detailed Scorecard Mode, media is optional (user might just input numbers).
    // Manual shot data (non-SCORE records) also counts as meaningful content.
    if (recordType !== 'SCORE' || scoreMode === 'SIMPLE') {
      if (
        mediaItems.length === 0 &&
        !hasMeaningfulMemo &&
        !hasSimpleScore &&
        !hasLiveLessonContent &&
        !(recordType !== 'SCORE' && hasManualGolfData)
      ) {
        setError(t('new_lesson_media_required'));
        return;
      }
    }

    if (!title) {
      setError(t('new_lesson_title_required'));
      return;
    }
    if (!clientName.trim() || !clientPhone.trim()) {
      setError(t('new_lesson_user_missing'));
      return;
    }
    if (isRecording) {
      setError('녹음이 완료된 뒤 저장해주세요.');
      return;
    }

    // Validation: Require Club Selection for Shot Data Analysis
    if (isDataExtractionMode && recordType !== 'SCORE' && !club) {
      setError(t('new_lesson_club_required'));
      return;
    }

    setError(null);

    setIsAnalyzing(true);
    setStatusMessage(
      isDataExtractionMode ? '데이터 추출 준비 중...' : '저장 중...'
    );

    try {
      let analysisResult = initialData?.aiAnalysis || '';
      let extractedGolfData: GolfData | undefined = initialData?.golfData;
      let extractedScore: number | undefined = initialData?.score;
      let scorecardDetail: ScorecardDetail | undefined = undefined;

      const mainMedia = mediaItems.length > 0 ? mediaItems[0] : null;
      const extractionTargetImage = isDataExtractionMode
        ? mediaItems.find((item) => item.type === 'image' && item.file)
        : undefined;

      // ── 레슨 동반(LIVE_LESSON) 전용 저장 형태 ──────────────────────────
      // 이 카테고리는 음성/사진/영상 원본만 남기는 게 아니라 레슨 내용
      // 텍스트(필기 노트)와 요약본이 함께 저장되는 것이 핵심이다.
      //
      // 요약은 레슨 종료 직후 "레슨 기록 확인" 검토 화면에서 이미 끝났다.
      // 코치가 거기서 확인·수정한 문장이 이 기록의 요약본이므로, 저장하는
      // 이 자리에서는 AI 를 부르지 않는다 — 같은 레슨을 두 번 요약하지
      // 않고, 코치가 고른 문장이 새 리포트로 밀리지도 않는다. 검토에서
      // 요약을 비워 두고 왔다면 요약 없이 필기만 저장하고, 나중에 검토
      // 화면의 'AI 초안 생성' 버튼으로 코치가 직접 뽑을 수 있다.
      let liveLessonDetail: LiveLessonDetail | undefined =
        initialData?.liveLessonDetail;
      const liveSession = liveSessionRef.current;
      if (recordType === 'LIVE_LESSON' && liveSession) {
        try {
          setStatusMessage('레슨 기록을 저장하고 있습니다...');
          // 검토를 거쳐 온 기록은 본문(필기 전문)이 이미 손에 있다. 남은
          // 구간 분석을 기다려 봐야 얻는 건 keyPoints/drills 뿐인데, 코치
          // 눈에는 저장 버튼을 누른 뒤 도는 대기가 요약을 다시 하는 것으로
          // 보인다. 이미 끝난 노트만 그대로 쓴다.
          const reviewedTranscript = liveSession.editedTranscript?.trim();
          const liveNotes = await collectSessionNotes(liveSession.sessionId, {
            waitMs: reviewedTranscript ? 0 : 10_000,
          });
          const doneNotes = liveNotes.filter(
            (n) => n.status === 'done' && n.transcript
          );
          const dedup = (values: string[]) =>
            Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
          // 코치가 검토 화면에서 확인/수정한 필기 전문이 있으면 그것이
          // 저장되는 기록의 원본이다 — 코치가 고친 내용이 항상 이긴다.
          const editedLines = reviewedTranscript
            ? parseReviewedTranscript(reviewedTranscript)
            : null;
          liveLessonDetail = {
            recordedDurationSec: liveSession.recordedDurationSec,
            transcript:
              editedLines && editedLines.length > 0
                ? editedLines
                : doneNotes.map((n) => ({
                    startSec: n.startSec,
                    text: n.transcript,
                  })),
            keyPoints: dedup(doneNotes.flatMap((n) => n.keyPoints)).slice(0, 12),
            drills: dedup(doneNotes.flatMap((n) => n.drills)).slice(0, 12),
          };
          // 검토에서 확인된 요약본이 그대로 최종 요약본이자 리포트 본문이다.
          const confirmedSummary = liveSession.editedSummary?.trim();
          if (confirmedSummary) {
            liveLessonDetail.summary = confirmedSummary;
            // 코치 요약·학생 요약은 합본과 별개로 그대로 보관한다 — 기록을
            // 다시 열 때 "코치가 시킨 것"과 "학생이 말한 것"을 나눠 보여
            // 주려면 합본을 다시 쪼개는 것보다 원본이 낫다.
            const confirmedCoach = liveSession.editedCoachSummary?.trim();
            const confirmedStudent = liveSession.editedStudentSummary?.trim();
            if (confirmedCoach) liveLessonDetail.coachSummary = confirmedCoach;
            if (confirmedStudent) liveLessonDetail.studentSummary = confirmedStudent;
            analysisResult = confirmedSummary;
          }
        } catch (collectErr) {
          console.error('Live lesson note collection failed', collectErr);
        }
      }

      // Logic for DETAILED Scorecard
      if (recordType === 'SCORE' && scoreMode === 'DETAILED') {
        const totalScore = holeRecords.reduce(
          (acc, h) => acc + (h.score || 0),
          0
        );
        const totalPutts = holeRecords.reduce(
          (acc, h) => acc + (h.putts || 0),
          0
        );

        scorecardDetail = {
          courseName: courseName || 'Unknown Course',
          holes: holeRecords,
          totalScore,
          totalPutts,
        };

        extractedScore = totalScore;
      }
      // Logic for AI shot/scorecard data extraction
      // (레슨 동반은 위 전용 경로가 필기·요약을 이미 처리했으므로 제외)
      else if (recordType !== 'LIVE_LESSON' && extractionTargetImage?.file) {
        try {
          setStatusMessage(
            recordType === 'SCORE'
              ? '스코어카드 데이터를 정리하고 있습니다...'
              : '이미지에서 데이터를 추출하고 있습니다...'
          );

          const nameToSearch = clientName.split('(')[0].trim();

          const dataResult = await extractGolfData(
            {
              data: extractionTargetImage.file,
              mimeType: extractionTargetImage.file.type,
            },
            nameToSearch
          );

          analysisResult = dataResult.textAnalysis;
          // Only replace existing golfData when the AI actually read at
          // least one numeric field. An empty object (all nulls stripped)
          // would silently overwrite whatever the coach had entered.
          if (dataResult.golfData && Object.keys(dataResult.golfData).length > 0) {
            extractedGolfData = dataResult.golfData;
          }
          // Use `!= null` so a legitimate 0-score (rare but possible) is
          // not treated as "no score".
          if (dataResult.score != null) {
            extractedScore = dataResult.score;
          }
        } catch (err) {
          console.error('Analysis failed', err);
          if (!analysisResult) analysisResult = '데이터 추출에 실패했습니다.';
        }
      }

      if (recordType === 'SCORE') {
        extractedGolfData = undefined;
      } else if (hasManualGolfData) {
        // Manual entries take precedence over AI-extracted values.
        extractedGolfData = { ...(extractedGolfData || {}), ...manualGolfData };
      }

      // Convert Media Items to MediaItem objects
      // If editing, we mix existing URLs with new Blob URLs
      const additionalMediaObjects: MediaItem[] = mediaItems
        .slice(1)
        .map((item) => ({
          id: item.id,
          url: item.previewUrl,
          type: item.type,
          role: item.role,
          createdAt: Date.now(),
          ...(item.source ? { source: item.source } : {}),
        }));

      // Auto-tagging based on record type
      const tags = [];

      if (recordType === 'SCORE')
        tags.push('스코어', '필드기록', courseName || '코스미정');
      else if (recordType === 'LESSON') tags.push('레슨복기', '프로레슨');
      else if (recordType === 'LIVE_LESSON') tags.push('레슨동반', '라이브레슨');
      else tags.push('자율연습', '스윙기록');

      if (club) tags.push(club);
      if (mainMedia?.type === 'audio') tags.push('음성기록');
      else if (isDataExtractionMode) tags.push('데이터정리');
      if (recordType !== 'SCORE' && hasManualGolfData) tags.push('샷데이터');

      let finalScore: number | undefined = undefined;
      if (recordType === 'SCORE') {
        if (score !== '') {
          finalScore = Number(score);
        } else if (extractedScore !== undefined) {
          finalScore = extractedScore;
        }
      }

      const trimmedClientName = clientName.trim();
      const trimmedClientPhone = clientPhone.trim();
      const newLesson: Lesson = {
        id: initialData ? initialData.id : crypto.randomUUID(), // Use existing ID if editing
        clientId:
          initialData?.clientId ||
          `${trimmedClientName}_${trimmedClientPhone}`,
        clientName: trimmedClientName,
        clientPhone: trimmedClientPhone,
        coachId: userRole === 'CLIENT' ? currentUser?.coachId : undefined, // Assign coachId if created by client
        createdBy: userRole as 'COACH' | 'CLIENT',
        recordType,
        date: initialData ? initialData.date : getLocalISODate(),
        title,
        club: club || undefined,
        targetDistance: targetDistance === '' ? undefined : Number(targetDistance),
        score: finalScore,
        scorecardDetail,
        swingAngle: undefined,
        videoUrl: mainMedia ? mainMedia.previewUrl : '',
        mediaType: mainMedia ? mainMedia.type : 'image',
        additionalMedia: additionalMediaObjects,
        editedVideoUrl:
          mainMedia?.type === 'video' && mainMedia.editMetadata
            ? mainMedia.previewUrl
            : initialData?.editedVideoUrl,
        videoEditMetadata:
          mainMedia?.type === 'video' && mainMedia.editMetadata
            ? mainMedia.editMetadata
            : initialData?.videoEditMetadata,
        coachNotes: notes,
        aiAnalysis: analysisResult || undefined,
        golfData: extractedGolfData,
        tags: tags,
        createdAt: initialData ? initialData.createdAt : Date.now(), // Preserve creation date
        shareOption: 'FULL',
        feedbackStatus: initialData ? initialData.feedbackStatus : 'NONE',
        assignedHomework: initialData?.assignedHomework,
        // 레슨 동반 전용 자료 — 필기(레슨 내용 텍스트)와 요약본
        liveLessonDetail,
        // Preserve other fields if editing
        swingSequence: initialData?.swingSequence,
        clientFeedback: initialData?.clientFeedback,
        // Attach package/session from the PACKAGE_SELECT step, or preserve from existing record
        lessonPackageId: selectedPackageId ?? initialData?.lessonPackageId,
        sessionNumber: selectedSessionNumber !== null ? selectedSessionNumber : initialData?.sessionNumber,
      };

      // Add new blob URLs to tracked set so they are not revoked immediately
      if (mainMedia && !mainMedia.isRemote) {
        savedUrlsRef.current.add(mainMedia.previewUrl);
      }
      mediaItems.forEach((m) => {
        if (!m.isRemote) savedUrlsRef.current.add(m.previewUrl);
      });
      // Save hole voice URLs
      if (scorecardDetail) {
        scorecardDetail.holes.forEach((h) => {
          getHoleVoiceUrls(h).forEach((voiceUrl) => {
            if (voiceUrl.startsWith('blob:')) {
              savedUrlsRef.current.add(voiceUrl);
            }
          });
        });
      }

      await onSave(newLesson);

      // 레슨이 저장됐으니 라이브 녹음 세션의 복구용 IDB 데이터(청크·노트)는
      // 더 이상 필요 없다. 남겨두면 다음 동반 진입 때 복구 배너가 뜬다.
      if (liveSessionRef.current) {
        void discardLessonAudioSession(liveSessionRef.current.sessionId);
        liveSessionRef.current = null;
      }
    } catch (err) {
      console.error(err);
      setError(t('new_lesson_save_error'));
    } finally {
      setIsAnalyzing(false);
      setStatusMessage('');
    }
  };

  const activeMediaItem =
    mediaItems.find((item) => item.id === selectedMediaId) || mediaItems[0];
  const holeVoiceSummary = holeRecords.reduce(
    (acc, hole) => {
      const voiceCount = getHoleVoiceUrls(hole).length;
      if (voiceCount > 0) acc.holes += 1;
      acc.voices += voiceCount;
      return acc;
    },
    { holes: 0, voices: 0 }
  );

  // STEP: PACKAGE_SELECT – shown after CLIENT_SELECT when the client has packages
  if (step === 'PACKAGE_SELECT') {
    const clientId = `${clientName.trim()}_${clientPhone.trim()}`;
    const clientPackages = (packages ?? []).filter((p) => p.clientId === clientId);

    const getSessionLesson = (packageId: string, sessionNumber: number) =>
      (allLessons ?? []).find(
        (l) => l.lessonPackageId === packageId && l.sessionNumber === sessionNumber
      );

    const handleSelectSession = (pkgId: string, sessionNum: number) => {
      if (selectedPackageId === pkgId && selectedSessionNumber === sessionNum) {
        // Deselect on second click
        setSelectedPackageId(null);
        setSelectedSessionNumber(null);
      } else {
        setSelectedPackageId(pkgId);
        setSelectedSessionNumber(sessionNum);
        setError(null);
      }
    };

    const handleConfirmSession = () => {
      if (!selectedPackageId || selectedSessionNumber === null) {
        setError(t('new_lesson_package_required'));
        return;
      }
      setError(null);
      setStep('FORM');
    };

    const handleSkipPackage = () => {
      setSelectedPackageId(null);
      setSelectedSessionNumber(null);
      setError(null);
      setStep('FORM');
    };

    return (
      <div className={`${LESSON_FLOW_SHELL_CLASS}${bottomNavPadClass}`}>
        {/* Header */}
        <div className={LESSON_FLOW_HEADER_CLASS}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep('CLIENT_SELECT')}
              className="rounded-full p-3 text-ink-high hover:text-white hover:bg-white/[0.04]/15 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label={t('new_lesson_back_member')}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <BookOpen className="w-5 h-5" /> {t('new_lesson_package_title')}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="rounded-full p-3 text-ink-high hover:text-white hover:bg-white/[0.04]/15 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selected client info */}
        <div className="px-5 py-3 bg-white/[0.04]/[0.04] border-b border-line-subtle flex items-center gap-3 flex-shrink-0">
          <div className="bg-emerald-900/60 p-2 rounded-full">
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="font-bold text-ink-high text-sm">{clientName}</p>
            <p className="text-xs text-ink-muted">{clientPhone}</p>
          </div>
        </div>

        {/* Package list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-sm text-ink-muted">
            기록할 레슨 패키지와 회차를 선택하세요.
          </p>

          {clientPackages.map((pkg) => {
            const completedCount = Array.from({ length: pkg.totalSessions }, (_, i) => i + 1)
              .filter((n) => getSessionLesson(pkg.id, n) != null).length;
            const remaining = pkg.totalSessions - completedCount;

            return (
              <div
                key={pkg.id}
                className="bg-white/[0.05] border border-line-subtle rounded-xl overflow-hidden shadow-sm"
              >
                {/* Package header */}
                <div className="px-4 py-3 bg-white/[0.06]/60 border-b border-line-subtle flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-ink-medium" />
                    <span className="font-bold text-ink-high text-sm">
                      {pkg.totalSessions}회 레슨 패키지
                    </span>
                  </div>
                  <div className="text-right text-xs">
                    <span className="font-bold text-emerald-400">{completedCount}</span>
                    <span className="text-ink-muted">/{pkg.totalSessions}회 완료</span>
                    {remaining > 0 && (
                      <span className="text-ink-muted ml-1">({remaining}회 남음)</span>
                    )}
                  </div>
                </div>

                {/* Session grid */}
                <div className="p-3">
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                    {Array.from({ length: pkg.totalSessions }, (_, i) => i + 1).map(
                      (sessionNumber) => {
                        const existingLesson = getSessionLesson(pkg.id, sessionNumber);
                        const isRecorded = existingLesson != null;
                        const isSelected =
                          selectedPackageId === pkg.id &&
                          selectedSessionNumber === sessionNumber;

                        return (
                          <button
                            key={sessionNumber}
                            disabled={isRecorded}
                            onClick={() => handleSelectSession(pkg.id, sessionNumber)}
                            aria-label={`${sessionNumber}회차 선택`}
                            className={`
                              flex flex-col items-center justify-center gap-0.5 p-2 rounded-lg border-2 transition-all text-xs
                              ${
                                isRecorded
                                  ? 'border-line-subtle bg-white/[0.06]/40 text-ink-muted cursor-not-allowed'
                                  : isSelected
                                  ? 'border-emerald-500 bg-emerald-900/40 text-emerald-300 font-bold shadow-sm'
                                  : 'border-dashed border-line-subtle bg-white/[0.05] text-ink-muted hover:border-emerald-500 hover:bg-emerald-900/30 hover:text-emerald-300'
                              }
                            `}
                          >
                            {isRecorded ? (
                              <CheckCircle className="w-3.5 h-3.5 text-ink-muted" />
                            ) : isSelected ? (
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Circle className="w-3.5 h-3.5" />
                            )}
                            <span>{sessionNumber}회차</span>
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {error && (
            <p className="text-red-400 text-sm font-bold bg-red-900/20 border border-red-800/50 p-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex-shrink-0 p-5 border-t border-line-subtle bg-[#070b12] space-y-3">
          <Button
            onClick={handleConfirmSession}
            disabled={!selectedPackageId || selectedSessionNumber === null}
            className="w-full py-3 font-bold"
          >
            {selectedSessionNumber !== null
              ? `${selectedSessionNumber}회차 선택 완료`
              : '회차를 선택하세요'}{' '}
            <Play className="w-4 h-4 ml-2 fill-current" />
          </Button>
          <button
            onClick={handleSkipPackage}
            className="w-full py-2.5 text-sm font-semibold text-ink-muted hover:text-ink-high transition-colors text-center bg-white/[0.05] rounded-xl hover:bg-white/[0.06]"
          >
            패키지 없이 기록하기
          </button>
        </div>
      </div>
    );
  }

  // ... (STEP CLIENT SELECT & TYPE SELECT code remains same) ...
  // STEP: COACH CLIENT SELECT (Redesigned)
  if (step === 'CLIENT_SELECT') {
    return (
      <div className={`${LESSON_FLOW_SHELL_CLASS}${bottomNavPadClass}`}>
        <div className={LESSON_FLOW_HEADER_CLASS}>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <UserCheck className="w-5 h-5" /> 레슨 대상 입력
          </h2>
          <button
            onClick={onCancel}
            className="rounded-full p-3 text-ink-high hover:text-white hover:bg-white/[0.04]/15 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="space-y-2">
            <label className="block text-sm font-bold text-ink-medium">
              회원 이름
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-5 h-5 text-ink-muted" />
              </div>
              <input
                type="text"
                placeholder="이름을 입력하세요"
                value={clientName}
                onChange={handleClientNameChange}
                className={LESSON_FLOW_INPUT_CLASS}
              />
            </div>
            {/* Suggestion List */}
            {clientName.trim() &&
              matchingClients.length > 0 &&
              !isExistingClientSelected && (
                <div className="bg-white/[0.05] border border-line-subtle rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto absolute z-50 w-[calc(100%-3rem)]">
                  {matchingClients.map((c) => (
                    <div
                      key={`${c.name}_${c.phone}`}
                      onClick={() => selectSuggestion(c)}
                      className="px-4 py-3 hover:bg-white/[0.06] cursor-pointer border-b border-line-subtle last:border-none flex justify-between items-center"
                    >
                      <span className="font-bold text-ink-high">{c.name}</span>
                      <span className="text-xs text-ink-muted bg-white/[0.06] px-2 py-0.5 rounded-full">
                        {c.phone}
                      </span>
                    </div>
                  ))}
                </div>
              )}
          </div>

          {/* Phone Input (Visible if new user) */}
            {clientName && !isExistingClientSelected && (
              <div className="space-y-2 animate-fade-in">
                <label className="block text-sm font-bold text-ink-medium">
                  전화번호{' '}
                  <span className="text-red-400 text-xs font-normal">
                    (미등록 회원)
                </span>
              </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Smartphone className="w-5 h-5 text-ink-muted" />
                  </div>
                  <input
                    type="tel"
                    placeholder="010-0000-0000"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className={LESSON_FLOW_INPUT_CLASS}
                  />
                </div>
                <p className="text-xs text-ink-muted bg-white/[0.05] border border-line-subtle p-2 rounded-lg">
                  * 처음 등록하는 회원은 전화번호 입력이 필요합니다.
                </p>
              </div>
            )}

            {/* Existing Client Badge */}
            {isExistingClientSelected && (
              <div className="bg-white/[0.05] border border-line-subtle p-3 rounded-xl flex items-center gap-3 animate-fade-in shadow-sm">
                <div className="bg-emerald-900/60 p-2 rounded-full text-emerald-400">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-ink-high text-sm">
                    등록된 회원입니다
                  </p>
                  <p className="text-xs text-ink-muted">{clientPhone}</p>
                </div>
              </div>
            )}

          {error && (
            <p className="text-red-400 text-sm font-bold bg-red-900/20 border border-red-800/50 p-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>
          )}

          <div className="space-y-3 pt-2">
            <Button
              type="button"
              onClick={handleStartLesson}
              fullWidth
              size="lg"
              className={`${LESSON_FLOW_ACTION_BTN_CLASS} shadow-glow`}
              icon={<Play className="w-5 h-5 fill-current" />}
            >
              레슨 기록 시작
            </Button>

            {userRole === 'COACH' && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleStartRound}
                data-testid="coach-start-round-btn"
                fullWidth
                size="lg"
                className={LESSON_FLOW_ACTION_BTN_CLASS}
                icon={<Trophy className="w-5 h-5" />}
              >
                라운드 기록
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // STEP: CLIENT TYPE SELECTION
  if (step === 'TYPE_SELECT') {
    return (
      <div className={`fixed inset-0 z-50 bg-[#070b12] text-ink-high flex flex-col overflow-hidden pt-safe${bottomNavPadClass}`}>
        <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-emerald-900 px-5 py-4 flex justify-between items-center text-white flex-shrink-0">
          <h2 className="text-lg font-bold flex items-center gap-2"><Target className="w-5 h-5" /> 기록 유형 선택</h2>
          <button
            onClick={onCancel}
            className="rounded-full p-3 text-emerald-100 hover:text-white hover:bg-white/[0.04]/15 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <p className="text-center text-ink-muted mb-6">
            어떤 활동을 기록하시겠습니까?
          </p>

          <button
            onClick={() => handleSelectType('PRACTICE')}
            className="w-full flex items-center p-4 border-2 border-line-subtle rounded-xl hover:border-emerald-500 hover:bg-emerald-900/20 transition-all group text-left"
          >
            <div className="bg-emerald-900/60 p-3 rounded-full text-emerald-400 group-hover:bg-emerald-800/60 mr-4">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-ink-high group-hover:text-emerald-300">
                연습 기록
              </h4>
              <p className="text-xs text-ink-muted">
                나의 스윙 연습 영상과 사진을 남깁니다.
              </p>
            </div>
          </button>

          <button
            onClick={() => handleSelectType('SCORE')}
            className="w-full flex items-center p-4 border-2 border-line-subtle rounded-xl hover:border-blue-500 hover:bg-blue-900/20 transition-all group text-left"
          >
            <div className="bg-blue-900/60 p-3 rounded-full text-blue-400 group-hover:bg-blue-800/60 mr-4">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-ink-high group-hover:text-blue-300">
                라운드 기록
              </h4>
              <p className="text-xs text-ink-muted">
                필드나 스크린 골프 라운드 기록을 저장합니다.
              </p>
            </div>
          </button>

          <button
            onClick={() => handleSelectType('LESSON')}
            className="w-full flex items-center p-4 border-2 border-line-subtle rounded-xl hover:border-purple-500 hover:bg-purple-900/20 transition-all group text-left"
          >
            <div className="bg-purple-900/60 p-3 rounded-full text-purple-400 group-hover:bg-purple-800/60 mr-4">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-ink-high group-hover:text-purple-300">
                레슨 기록
              </h4>
              <p className="text-xs text-ink-muted">
                코치님께 받은 레슨 내용을 메모합니다.
              </p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // STEP: FORM (레슨 동반 전용)
  // 레슨 동반 기록은 일반 레슨 기록과 저장 형태가 다르다: 클럽 지정,
  // 코치 메모, 샷데이터 입력 같은 일반 폼
  // 항목 없이 — 동반 화면에서 기록된 것(캡처된 음성·사진·영상)만 확인해
  // 저장한다. 필기(레슨 내용 텍스트)와 요약본은 handleSubmit 의 전용
  // 경로가 저장 시 자동으로 수거·생성한다.
  if (step === 'FORM' && recordType === 'LIVE_LESSON') {
    const liveInfo = liveSessionRef.current;
    const formatMin = (sec: number) => Math.max(1, Math.round(sec / 60));
    return (
      <div className={`fixed inset-0 z-50 bg-[#070b12] text-ink-high flex flex-col overflow-hidden pt-safe${bottomNavPadClass}`}>
        {/* Header */}
        <div className="px-5 py-4 flex justify-between items-center flex-shrink-0 bg-rose-900/80 border-b border-rose-800">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Radio className="w-6 h-6" />
            {initialData ? '레슨 동반 기록 수정' : '레슨 동반 기록'}
          </h2>
          <button
            onClick={onCancel}
            className="rounded-full p-3 text-white/80 hover:text-white hover:bg-white/[0.04]/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* 안내 — 저장되는 것: 캡처 미디어 + 필기 + 요약본 */}
            <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-[12.5px] leading-relaxed text-ink-medium">
              <span className="font-bold text-rose-300">레슨 동반 기록</span> —
              레슨 중 캡처한 음성·사진·영상과 필기 노트(레슨 내용 텍스트),
              요약본만 저장됩니다.
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-bold text-ink-medium mb-2">
                제목 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 8월 19일 레슨 동반 기록"
                className="w-full px-4 py-3 border border-line-subtle rounded-xl bg-white/[0.04]/[0.04] text-ink-high placeholder:text-ink-muted focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all"
                required
              />
            </div>

            {/* 필기·요약 자동 저장 안내 카드 */}
            <div className="rounded-xl border border-line-subtle bg-white/[0.03] p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-rose-500/15 border border-rose-400/30 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-rose-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold text-ink-high">
                    필기 노트 · 요약본
                  </div>
                  <div className="text-[12px] text-ink-muted">
                    {liveInfo
                      ? `녹음 ${formatMin(liveInfo.recordedDurationSec)}분 · 필기 ${liveInfo.noteCount}구간 — 저장하면 필기와 요약본이 자동으로 정리돼 함께 남습니다.`
                      : initialData?.liveLessonDetail
                      ? `필기 ${initialData.liveLessonDetail.transcript.length}줄이 저장되어 있습니다.`
                      : '저장하면 레슨 중 필기와 요약본이 자동으로 정리돼 함께 남습니다.'}
                  </div>
                </div>
              </div>
            </div>

            {/* 캡처된 미디어 — 동반 화면에서 기록된 것만 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-bold text-ink-medium">
                  캡처된 미디어
                </label>
                <span className="text-[11px] text-ink-muted">
                  {mediaItems.length}건
                </span>
              </div>
              {mediaItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line-subtle bg-white/[0.02] py-8 text-center text-[12px] text-ink-muted">
                  레슨 중 캡처된 미디어가 없어요
                </div>
              ) : (
                <ul className="space-y-2">
                  {mediaItems.map((item, idx) => (
                    <li
                      key={item.id}
                      className="rounded-xl border border-line-subtle bg-white/[0.03] p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-white/[0.04] border border-line-subtle flex items-center justify-center flex-shrink-0">
                          {item.type === 'audio' ? (
                            <Mic className="w-5 h-5 text-emerald-300" />
                          ) : item.type === 'image' ? (
                            <Camera className="w-5 h-5 text-sky-300" />
                          ) : (
                            <Video className="w-5 h-5 text-purple-300" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-bold text-ink-high">
                            #{idx + 1}{' '}
                            {item.type === 'audio'
                              ? '레슨 음성'
                              : item.type === 'image'
                              ? '스윙 사진'
                              : '스윙 영상'}
                          </div>
                          {item.duration ? (
                            <div className="text-[11px] text-ink-muted tabular-nums">
                              {Math.floor(item.duration / 60)}:
                              {String(Math.round(item.duration % 60)).padStart(2, '0')}
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => removeMediaItem(item.id, e)}
                          className="w-9 h-9 rounded-lg text-ink-muted hover:text-red-400 flex items-center justify-center"
                          aria-label="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {item.type === 'image' && (
                        <img
                          src={item.previewUrl}
                          alt="스윙 사진"
                          className="mt-2 rounded-lg w-full max-h-56 object-cover"
                        />
                      )}
                      {item.type === 'video' && (
                        <video
                          src={item.previewUrl}
                          controls
                          preload="metadata"
                          className="mt-2 rounded-lg w-full max-h-56 bg-black"
                        />
                      )}
                      {item.type === 'audio' && (
                        <audio
                          src={item.previewUrl}
                          controls
                          className="mt-2 w-full"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Sticky footer */}
          <div className="flex-shrink-0 px-5 pb-5 pt-4 border-t border-line-subtle bg-[#070b12] space-y-3">
            {error && (
              <div className="flex items-center gap-2 text-red-400 bg-red-900/20 border border-red-800/50 p-3 rounded-lg text-sm font-medium">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}
            {statusMessage && (
              <div className="flex items-center gap-2 text-emerald-400 bg-emerald-900/20 border border-emerald-800/50 p-3 rounded-lg text-sm font-medium">
                <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                {statusMessage}
              </div>
            )}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={onCancel}
                className="flex-1 py-3 text-ink-muted"
              >
                취소
              </Button>
              <Button
                type="submit"
                className="flex-[2] py-3 text-lg font-bold"
                isLoading={isAnalyzing}
              >
                {initialData ? '수정 내용 저장' : '레슨 동반 기록 저장'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  // STEP: FORM
  return (
    <div className={`fixed inset-0 z-50 bg-[#070b12] text-ink-high flex flex-col overflow-hidden pt-safe${bottomNavPadClass}`}>
      <PermissionDeniedModal
        open={!!permissionRequest}
        kind={permissionRequest?.kind ?? 'microphone'}
        onClose={() => setPermissionRequest(null)}
        onRetry={
          permissionRequest
            ? () => {
                const retry = permissionRequest.retry;
                setPermissionRequest(null);
                retry();
              }
            : undefined
        }
      />
      <div
        className={`px-5 py-4 flex justify-between items-center flex-shrink-0 ${
          recordType === 'SCORE'
            ? 'bg-blue-900/80 border-b border-blue-800'
            : recordType === 'LESSON'
            ? 'bg-white/[0.05] border-b border-line-subtle'
            : 'bg-emerald-900/80 border-b border-emerald-800'
        }`}
      >
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          {recordType === 'SCORE' ? (
            <Flag className="w-6 h-6" />
          ) : recordType === 'LESSON' ? (
            <BookOpen className="w-6 h-6" />
          ) : (
            <Video className="w-6 h-6" />
          )}
          {initialData
            ? '기록 수정'
            : userRole === 'CLIENT'
            ? recordType === 'SCORE'
              ? '라운드 기록'
              : recordType === 'LESSON'
              ? '레슨 내용 기록'
              : '새 연습 기록'
            : recordType === 'SCORE'
            ? '라운드 기록'
            : '새 레슨 기록'}
        </h2>
        <button
          onClick={onCancel}
          className="rounded-full p-3 text-white/80 hover:text-white hover:bg-white/[0.04]/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Title Input */}
        <div>
          <label className="block text-sm font-bold text-ink-medium mb-2">
            제목 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              recordType === 'SCORE'
                ? '예: 00CC 필드 라운딩'
                : '예: 7번 아이언 스윙 교정'
            }
            className="w-full px-4 py-3 border border-line-subtle rounded-xl bg-white/[0.04]/[0.04] text-ink-high placeholder:text-ink-muted focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
            required
          />
        </div>

        {/* SCORE MODE TOGGLE & DETAILED INPUT (Omitted for brevity, logic remains same) */}
        {recordType === 'SCORE' && (
          <div className="flex bg-white/[0.05] p-1 rounded-lg mb-4 border border-line-subtle">
            <button
              type="button"
              onClick={() => {
                setScoreMode('SIMPLE');
                setIsDataExtractionMode(false);
              }}
              className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${
                scoreMode === 'SIMPLE'
                  ? 'bg-blue-600 shadow-sm text-white'
                  : 'text-ink-muted hover:text-ink-high'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Camera className="w-4 h-4" /> 사진/간편 입력
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setScoreMode('DETAILED');
                setIsDataExtractionMode(false);
              }}
              className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${
                scoreMode === 'DETAILED'
                  ? 'bg-blue-600 shadow-sm text-white'
                  : 'text-ink-muted hover:text-ink-high'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <ListChecks className="w-4 h-4" /> 상세 스코어카드 (18홀)
              </div>
            </button>
          </div>
        )}

        {/* ... (Detailed Scorecard Input Section) ... */}
        {recordType === 'SCORE' && scoreMode === 'DETAILED' && (
          <div className="space-y-6 animate-fade-in">
            {/* Course Info with Search */}
            <div>
              <label className="block text-sm font-bold text-ink-medium mb-2">
                골프장 이름 / 코스명
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MapPin className="w-5 h-5 text-ink-muted" />
                </div>
                <input
                  type="text"
                  value={courseName}
                  onChange={handleCourseNameChange}
                  placeholder="골프장 검색 또는 직접 입력"
                  className="w-full pl-10 pr-4 py-3 border border-line-subtle rounded-xl bg-white/[0.04]/[0.04] text-ink-high placeholder:text-ink-muted focus:ring-2 focus:ring-blue-500 outline-none"
                />
                {/* Course Search Dropdown */}
                {showCourseSearch && courseSearchResults.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 mt-1 bg-white/[0.05] border border-line-subtle rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {courseSearchResults.map((course) => (
                      <div
                        key={course.id}
                        onClick={() => selectCourse(course)}
                        className="px-4 py-3 hover:bg-blue-900/30 cursor-pointer border-b border-line-subtle last:border-none flex justify-between items-center"
                      >
                        <span className="font-bold text-ink-high">
                          {course.name}
                        </span>
                        <span className="text-xs text-ink-muted bg-white/[0.06] px-2 py-0.5 rounded-full">
                          18홀 Par {course.pars.reduce((a, b) => a + b, 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Hole List (Same as before) */}
            <div className="border border-line-subtle rounded-xl overflow-hidden">
              <div className="bg-white/[0.05] px-4 py-3 border-b border-line-subtle grid grid-cols-12 gap-1 text-xs font-bold text-ink-muted text-center">
                <div className="col-span-1">HOLE</div>
                <div className="col-span-2">PAR</div>
                <div className="col-span-2">SCORE</div>
                <div className="col-span-2">PUTT</div>
                <div className="col-span-5">PLAY RECORD (Voice & AI)</div>
              </div>
              <div className="divide-y divide-slate-700/50 max-h-[60vh] overflow-y-auto">
                {holeRecords.map((hole) => {
                  const holeVoiceCount = getHoleVoiceUrls(hole).length;
                  return (
                    <div
                      key={hole.holeNumber}
                      className="bg-white/[0.05]/40 hover:bg-white/[0.05]/80 transition-colors"
                    >
                      <div className="grid grid-cols-12 gap-1 px-4 py-3 items-center text-center">
                      <div className="col-span-1 font-bold text-ink-high">
                        {hole.holeNumber}
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          value={hole.par}
                          onChange={(e) =>
                            updateHoleData(
                              hole.holeNumber,
                              'par',
                              Number(e.target.value)
                            )
                          }
                          className="w-full text-center p-1 border border-line-subtle rounded text-sm bg-white/[0.06] text-ink-high"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          value={hole.score || ''}
                          placeholder="-"
                          onChange={(e) =>
                            updateHoleData(
                              hole.holeNumber,
                              'score',
                              Number(e.target.value)
                            )
                          }
                          className={`w-full text-center p-1 border rounded text-sm font-bold bg-white/[0.06] ${
                            hole.score > 0
                              ? hole.score < hole.par
                                ? 'text-red-400 border-red-800'
                                : hole.score > hole.par
                                ? 'text-blue-400 border-blue-800'
                                : 'text-ink-high border-emerald-500/40'
                              : 'border-line-subtle text-ink-medium'
                          }`}
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          value={hole.putts || ''}
                          placeholder="-"
                          onChange={(e) =>
                            updateHoleData(
                              hole.holeNumber,
                              'putts',
                              Number(e.target.value)
                            )
                          }
                          className="w-full text-center p-1 border border-line-subtle rounded text-sm text-ink-medium bg-white/[0.06]"
                        />
                      </div>
                      <div className="col-span-5 flex justify-end gap-2">
                        {holeVoiceCount > 0 && (
                          <span
                            aria-label={`${holeVoiceCount}개의 음성 녹음`}
                            className="text-[10px] text-emerald-400 bg-emerald-900/30 border border-emerald-800 rounded-full px-2 py-1"
                          >
                            {holeVoiceCount}개
                          </span>
                        )}
                        {activeRecordingHole === hole.holeNumber ? (
                          <button
                            type="button"
                            onClick={stopHoleRecording}
                            className="bg-red-600 text-white px-2 py-1 rounded-full text-xs flex items-center gap-1 animate-pulse"
                          >
                            <StopCircle className="w-3 h-3" />{' '}
                            {recordingHoleTime}s
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startHoleRecording(hole.holeNumber)}
                            className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 border transition-colors ${
                              holeVoiceCount > 0
                                ? 'bg-emerald-900/40 text-emerald-400 border-emerald-700'
                                : 'bg-white/[0.06] text-ink-muted border-line-subtle hover:border-emerald-600 hover:text-emerald-400'
                            }`}
                          >
                            <Mic className="w-3 h-3" />{' '}
                            {holeVoiceCount > 0 ? '추가 녹음' : '기록'}
                          </button>
                        )}
                      </div>
                    </div>
                    {/* ... (Hole details) ... */}
                    {hole.aiSummary && (
                      <div className="px-4 pb-3 pl-14 text-left space-y-2">
                        <div className="bg-blue-900/30 p-2 rounded-lg border border-blue-800/50 flex items-start gap-2">
                          <Sparkles className="w-3 h-3 text-blue-400 mt-1 flex-shrink-0" />
                          <p className="text-xs text-blue-300 leading-relaxed">
                            {hole.aiSummary}
                          </p>
                        </div>
                        {hole.shotMetrics && (
                          <div className="flex flex-wrap gap-2 text-[10px]">
                            {hole.shotMetrics.teeDistance && (
                              <span className="bg-white/[0.06] text-ink-muted px-2 py-0.5 rounded border border-line-subtle">
                                티샷: {hole.shotMetrics.teeDistance}m
                              </span>
                            )}
                            {hole.shotMetrics.secondShotDistance && (
                              <span className="bg-white/[0.06] text-ink-muted px-2 py-0.5 rounded border border-line-subtle">
                                세컨: {hole.shotMetrics.secondShotDistance}m
                                남음
                              </span>
                            )}
                            {hole.shotMetrics.firstPuttDistance && (
                              <span className="bg-white/[0.06] text-ink-muted px-2 py-0.5 rounded border border-line-subtle">
                                퍼팅: {hole.shotMetrics.firstPuttDistance}m
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                  );
                })}
              </div>
              {/* Totals Footer */}
              <div className="bg-white/[0.05] px-4 py-3 border-t border-line-subtle grid grid-cols-12 gap-1 text-sm font-bold text-center">
                <div className="col-span-1 text-ink-medium">TOTAL</div>
                <div className="col-span-2 text-ink-medium">
                  {holeRecords.reduce((a, b) => a + b.par, 0)}
                </div>
                <div className="col-span-2 text-blue-400">{score}</div>
                <div className="col-span-2 text-ink-muted">
                  {holeRecords.reduce((a, b) => a + (b.putts || 0), 0)}
                </div>
                <div className="col-span-5 text-right text-xs text-ink-muted pr-2">
                  {holeVoiceSummary.holes}개 홀 / {holeVoiceSummary.voices}개 음성
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SIMPLE MEDIA UPLOAD (Default) */}
        {(recordType !== 'SCORE' || scoreMode === 'SIMPLE') && (
          <>
            <div>
              <label className="block text-sm font-bold text-ink-medium mb-2">
                미디어 (영상/사진/음성) <span className="text-red-400">*</span>
              </label>

              {showAddInterface ? (
                <div className="border-2 border-dashed border-line-subtle rounded-2xl p-8 bg-white/[0.05]/40 hover:bg-white/[0.04]/[0.04] transition-colors">
                  {/* Method Selection Tabs */}
                  <div className="flex justify-center mb-6 bg-white/[0.05] rounded-full p-1 inline-flex mx-auto border border-line-subtle">
                    <button
                      type="button"
                      onClick={() => setInputMethod('upload')}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                        inputMethod === 'upload'
                          ? 'bg-emerald-500/20 text-emerald-200 shadow-md'
                          : 'text-ink-muted hover:text-ink-high'
                      }`}
                    >
                      {recordType === 'SCORE' ? '라운드 기록 업로드' : '스윙 영상 업로드'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setInputMethod('camera');
                        startCamera();
                      }}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                        inputMethod === 'camera'
                          ? 'bg-emerald-500/20 text-emerald-200 shadow-md'
                          : 'text-ink-muted hover:text-ink-high'
                      }`}
                    >
                      카메라 촬영
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setInputMethod('voice');
                        startMic();
                      }}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                        inputMethod === 'voice'
                          ? 'bg-emerald-500/20 text-emerald-200 shadow-md'
                          : 'text-ink-muted hover:text-ink-high'
                      }`}
                    >
                      음성 녹음
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setInputMethod('screen');
                        startScreenCapture();
                      }}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                        inputMethod === 'screen'
                          ? 'bg-emerald-500/20 text-emerald-200 shadow-md'
                          : 'text-ink-muted hover:text-ink-high'
                      }`}
                    >
                      {t('new_lesson_screen_capture')}
                    </button>
                    {recordType !== 'SCORE' && (
                      <button
                        type="button"
                        onClick={() => {
                          stopMediaStream();
                          setInputMethod('shotdata');
                        }}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                          inputMethod === 'shotdata'
                            ? 'bg-emerald-500/20 text-emerald-200 shadow-md'
                            : 'text-ink-muted hover:text-ink-high'
                        }`}
                      >
                        샷 데이터
                      </button>
                    )}
                  </div>

                  {inputMethod === 'upload' && (
                    <div
                      className="text-center"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="w-16 h-16 bg-white/[0.04] rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm text-emerald-200 cursor-pointer">
                        <Upload className="w-8 h-8" />
                      </div>
                      <p className="text-sm text-ink-medium font-medium mb-1">
                        {recordType === 'SCORE' ? '클릭하여 라운드 기록 업로드' : '클릭하여 스윙 영상 업로드'}
                      </p>
                      <p className="text-xs text-ink-muted">
                        업로드 후 바로 영상 편집 가능 (최대 5GB)
                      </p>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept="video/*,image/*,audio/*"
                        multiple
                      />
                    </div>
                  )}

                  {inputMethod === 'camera' && (
                    <div className="space-y-4">
                      <div className="relative aspect-[9/16] bg-black rounded-lg overflow-hidden max-w-[320px] mx-auto shadow-lg">
                        {!isMediaReady && (
                          <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
                            카메라 준비 중...
                          </div>
                        )}
                        <video
                          ref={videoRef}
                          autoPlay
                          muted
                          playsInline
                          className={`w-full h-full object-cover ${
                            facingMode === 'user'
                              ? 'transform scale-x-[-1]'
                              : ''
                          }`}
                        />

                        {/* Switch Camera Button */}
                        {!isRecording && isMediaReady && (
                          <button
                            type="button"
                            onClick={toggleCamera}
                            className="absolute top-4 right-4 bg-black/40 text-white p-2.5 rounded-full backdrop-blur-md hover:bg-black/60 transition-all z-20 shadow-lg border border-white/10"
                          >
                            <RefreshCcw className="w-5 h-5" />
                          </button>
                        )}
                      </div>

                      <div className="flex justify-center gap-6 items-center">
                        {!isRecording ? (
                          <>
                            <button
                              type="button"
                              onClick={takePhoto}
                              className="w-14 h-14 bg-white/[0.04] border-4 border-line-subtle rounded-full flex items-center justify-center shadow-sm hover:bg-white/[0.03]"
                            >
                              <Camera className="w-6 h-6 text-ink-medium" />
                            </button>
                            <button
                              type="button"
                              onClick={startRecording}
                              className="w-16 h-16 bg-red-600 border-4 border-white rounded-full shadow-lg hover:scale-105 transition-transform"
                            ></button>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <span className="text-red-500 font-bold animate-pulse">
                              {Math.floor(recordingTime / 60)}:
                              {String(recordingTime % 60).padStart(2, '0')}
                            </span>
                            <button
                              type="button"
                              onClick={stopRecording}
                              className="w-16 h-16 bg-white/[0.04] border-4 border-line-subtle rounded-sm flex items-center justify-center shadow-md"
                            >
                              <div className="w-6 h-6 bg-red-600 rounded-sm"></div>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {inputMethod === 'voice' && (
                    <div className="text-center py-8">
                      <div
                        className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 transition-all ${
                          isRecording
                            ? 'bg-red-500 animate-pulse'
                            : 'bg-white/[0.06]'
                        }`}
                      >
                        <Mic
                          className={`w-10 h-10 ${
                            isRecording ? 'text-white' : 'text-ink-muted'
                          }`}
                        />
                      </div>
                      {isRecording && (
                        <p className="text-2xl font-bold text-ink-high mb-4 font-mono">
                          {Math.floor(recordingTime / 60)}:
                          {String(recordingTime % 60).padStart(2, '0')}
                        </p>
                      )}

                      {!isRecording ? (
                        <Button
                          type="button"
                          onClick={startRecording}
                          className="bg-red-500 hover:bg-red-600 text-white"
                        >
                          녹음 시작
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          onClick={stopRecording}
                          variant="secondary"
                          className="border-red-200 text-red-500"
                        >
                          녹음 완료
                        </Button>
                      )}
                    </div>
                  )}

                  {inputMethod === 'screen' && (
                    <div className="space-y-4">
                      <div className="relative aspect-video bg-black rounded-lg overflow-hidden max-w-full mx-auto shadow-lg">
                        {!isMediaReady && (
                          <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
                            {t('new_lesson_screen_selecting')}
                          </div>
                        )}
                        <video
                          ref={videoRef}
                          autoPlay
                          muted
                          playsInline
                          className="w-full h-full object-contain"
                        />
                        {isRecording && (
                          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-600 px-3 py-1 rounded-full text-white font-bold text-sm flex items-center gap-2 animate-pulse">
                            <div className="w-2 h-2 bg-white/[0.04] rounded-full" />
                            {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}
                          </div>
                        )}
                      </div>
                      <div className="flex justify-center gap-6 items-center">
                        {!isRecording ? (
                          <>
                            <button
                              type="button"
                              onClick={takePhoto}
                              disabled={!isMediaReady}
                              className="w-14 h-14 bg-white/[0.04] border-4 border-line-subtle rounded-full flex items-center justify-center shadow-sm hover:bg-white/[0.03] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Camera className="w-6 h-6 text-ink-medium" />
                            </button>
                            <button
                              type="button"
                              onClick={startRecording}
                              disabled={!isMediaReady}
                              className="w-16 h-16 bg-red-600 border-4 border-white rounded-full shadow-lg hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                            ></button>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <span className="text-red-500 font-bold animate-pulse">
                              {Math.floor(recordingTime / 60)}:
                              {String(recordingTime % 60).padStart(2, '0')}
                            </span>
                            <button
                              type="button"
                              onClick={stopRecording}
                              className="w-16 h-16 bg-white/[0.04] border-4 border-line-subtle rounded-sm flex items-center justify-center shadow-md"
                            >
                              <div className="w-6 h-6 bg-red-600 rounded-sm"></div>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {isShotDataTab && (
                    <div className="space-y-4 text-left">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-full ${
                            hasManualGolfData
                              ? 'bg-emerald-500 text-white'
                              : 'bg-white/[0.06] text-ink-medium'
                          }`}
                        >
                          <BarChart3 className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-ink-high text-sm">
                            샷 데이터
                            {hasManualGolfData && (
                              <span className="ml-2 text-emerald-300 text-xs">
                                · 입력됨
                              </span>
                            )}
                          </h4>
                          <p className="text-xs text-ink-muted">
                            런치모니터 수치를 직접 기록으로 남깁니다.
                          </p>
                        </div>
                      </div>

                      {/* Shot data photo (launch-monitor screenshot) — capture or upload, AI extracts automatically */}
                      <div className="rounded-lg border border-line-subtle bg-white/[0.03] p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-xs font-bold text-ink-medium flex items-center gap-1.5">
                            <Camera className="w-3.5 h-3.5" /> 샷 데이터 사진
                          </label>
                          {shotDataPhoto && (
                            <button
                              type="button"
                              onClick={removeShotDataPhoto}
                              className="text-[11px] text-ink-muted hover:text-red-400 flex items-center gap-1"
                            >
                              <X className="w-3 h-3" /> 사진 제거
                            </button>
                          )}
                          <input
                            ref={shotDataCameraInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={handleShotDataPhotoSelect}
                            data-testid="shot-data-camera-input"
                          />
                          <input
                            ref={shotDataPhotoInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleShotDataPhotoSelect}
                            data-testid="shot-data-photo-input"
                          />
                        </div>

                        {!shotDataPhoto && (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                shotDataCameraInputRef.current?.click()
                              }
                              className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-lg border border-line-subtle bg-white/[0.04] hover:bg-white/[0.06] text-ink-high text-xs font-bold"
                            >
                              <Camera className="w-5 h-5 text-emerald-300" />
                              사진 촬영
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                shotDataPhotoInputRef.current?.click()
                              }
                              className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-lg border border-line-subtle bg-white/[0.04] hover:bg-white/[0.06] text-ink-high text-xs font-bold"
                            >
                              <Upload className="w-5 h-5 text-emerald-300" />
                              파일 업로드
                            </button>
                          </div>
                        )}

                        {shotDataPhoto ? (
                          <div className="flex items-start gap-3">
                            <img
                              src={shotDataPhoto.previewUrl}
                              alt="샷 데이터 사진"
                              className="w-24 h-24 object-cover rounded-lg border border-line-subtle flex-shrink-0"
                            />
                            <div className="flex-1 space-y-2">
                              {isAutoFilling ? (
                                <p className="text-[11px] text-blue-300 leading-relaxed flex items-center gap-1.5">
                                  <Sparkles className="w-3 h-3 animate-pulse" />
                                  AI가 사진에서 샷 데이터를 추출하는 중...
                                </p>
                              ) : autoFillError ? (
                                <p className="text-[11px] text-red-400">
                                  {autoFillError}
                                </p>
                              ) : (
                                <p className="text-[11px] text-emerald-300 leading-relaxed">
                                  AI가 사진에서 추출한 수치를 아래에
                                  채웠습니다. 확인 후 필요하면 수정하세요.
                                </p>
                              )}
                              <p className="text-[11px] text-ink-muted leading-relaxed">
                                사진은 기록에 함께 저장됩니다.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-ink-muted leading-relaxed">
                            GDR/트랙맨 등의 화면을 촬영하거나 업로드하면 AI가
                            수치를 자동으로 추출해 채워줍니다.
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {[
                          { key: 'carryDistance', label: '캐리 (m)', placeholder: '예: 180' },
                          { key: 'totalDistance', label: '총 거리 (m)', placeholder: '예: 195' },
                          { key: 'ballSpeed', label: '볼 스피드 (m/s)', placeholder: '예: 62' },
                          { key: 'clubHeadSpeed', label: '헤드 스피드 (m/s)', placeholder: '예: 43' },
                          { key: 'launchAngle', label: '발사각 (°)', placeholder: '예: 15' },
                          { key: 'smashFactor', label: '정타율', placeholder: '예: 1.44' },
                          { key: 'backSpin', label: '백스핀 (rpm)', placeholder: '예: 2500' },
                          { key: 'sideSpin', label: '사이드스핀 (rpm)', placeholder: '예: 200' },
                          { key: 'clubPath', label: '클럽 패스 (°)', placeholder: '예: -1.5' },
                          { key: 'faceAngle', label: '페이스 앵글 (°)', placeholder: '예: 0.5' },
                          { key: 'attackAngle', label: '어택 앵글 (°)', placeholder: '예: -2' },
                          { key: 'sideTotal', label: '사이드 토탈 (m)', placeholder: '예: -3' },
                        ].map((field) => {
                          const value = manualGolfData[field.key as keyof GolfData];
                          return (
                            <div key={field.key}>
                              <label className="block text-[11px] font-bold text-ink-muted mb-1">
                                {field.label}
                              </label>
                              <input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                value={value === undefined ? '' : value}
                                onChange={(e) =>
                                  updateManualGolfField(
                                    field.key as keyof GolfData,
                                    e.target.value
                                  )
                                }
                                placeholder={field.placeholder}
                                className="w-full px-3 py-2 border border-line-subtle rounded-lg bg-white/[0.04]/[0.04] text-ink-high placeholder:text-ink-muted focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        {hasManualGolfData ? (
                          <button
                            type="button"
                            onClick={() => setManualGolfData({})}
                            className="text-xs text-ink-muted hover:text-ink-high flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" /> 입력값 지우기
                          </button>
                        ) : (
                          <span />
                        )}
                        {mediaItems.length > 0 && !isAddingMore && (
                          <button
                            type="button"
                            onClick={() => setInputMethod('upload')}
                            className="text-xs font-bold text-emerald-300 hover:text-emerald-200"
                          >
                            미디어 목록으로
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                   {/* Selected Media Preview List */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {mediaItems.map((item, index) => (
                      <div
                        key={item.id}
                        onClick={() => setSelectedMediaId(item.id)}
                        className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${
                          selectedMediaId === item.id
                            ? 'border-emerald-700 ring-2 ring-emerald-100'
                            : 'border-transparent'
                        }`}
                      >
                        {item.type === 'video' ? (
                          <video
                            src={item.previewUrl}
                            className="w-full h-full object-cover"
                          />
                        ) : item.type === 'image' ? (
                          <img
                            src={item.previewUrl}
                            className="w-full h-full object-cover"
                            alt="preview"
                          />
                        ) : (
                          <div className="w-full h-full bg-white/[0.06] flex items-center justify-center text-ink-muted flex-col gap-2">
                            <Mic className="w-8 h-8" />
                            <span className="text-xs">오디오</span>
                          </div>
                        )}

                        <div className="absolute top-1 right-1">
                          <button
                            onClick={(e) => removeMediaItem(item.id, e)}
                            className="bg-black/50 text-white p-1 rounded-full hover:bg-red-500 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        {item.type === 'video' && (
                          <button
                            type="button"
                            onClick={(e) => toggleVideoCategory(item.id, e)}
                            className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold leading-tight transition-colors shadow ${
                              item.role === 'BEFORE'
                                ? 'bg-blue-600 text-white'
                                : item.role === 'AFTER'
                                ? 'bg-orange-500 text-white'
                                : 'bg-black/50 text-white/80'
                            }`}
                          >
                            {item.role === 'BEFORE'
                              ? '레슨 전'
                              : item.role === 'AFTER'
                              ? '레슨 후'
                              : '구분'}
                          </button>
                        )}
                        {item.editMetadata && (
                          <div className="absolute top-8 left-1 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-bold leading-tight shadow">
                            편집됨
                          </div>
                        )}
                        {index === 0 && !item.role && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5">
                            메인 미디어
                          </div>
                        )}
                        {item.role && (
                          <div className={`absolute bottom-0 left-0 right-0 text-white text-[10px] text-center py-0.5 ${
                            item.role === 'BEFORE' ? 'bg-blue-600/80' : 'bg-orange-500/80'
                          }`}>
                            {item.role === 'BEFORE' ? '레슨 전 영상' : '레슨 후 영상'}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Add More Button */}
                    <button
                      type="button"
                      onClick={() => setIsAddingMore(true)}
                      className="aspect-square rounded-xl border-2 border-dashed border-line-subtle flex flex-col items-center justify-center text-ink-muted hover:text-emerald-200 hover:border-emerald-300 hover:bg-emerald-500/[0.08] transition-all gap-1"
                    >
                      <Plus className="w-6 h-6" />
                      <span className="text-xs font-bold">추가</span>
                    </button>

                    {/* Shot Data Entry Button (Non-Score Record) */}
                    {recordType !== 'SCORE' && (
                      <button
                        type="button"
                        onClick={() => setInputMethod('shotdata')}
                        className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all gap-1 ${
                          hasManualGolfData
                            ? 'border-emerald-500 text-emerald-200 bg-emerald-500/[0.08]'
                            : 'border-line-subtle text-ink-muted hover:text-emerald-200 hover:border-emerald-300 hover:bg-emerald-500/[0.08]'
                        }`}
                      >
                        <BarChart3 className="w-6 h-6" />
                        <span className="text-xs font-bold">샷 데이터</span>
                        {hasManualGolfData && (
                          <span className="text-[10px]">입력됨</span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Active Item Preview (Larger) */}
                  {activeMediaItem && (
                    <div className="bg-black rounded-xl overflow-hidden relative group">
                      <div className="aspect-video flex items-center justify-center bg-base">
                        {activeMediaItem.type === 'video' && (
                          <video
                            src={activeMediaItem.previewUrl}
                            controls
                            className="max-h-full max-w-full"
                          />
                        )}
                        {activeMediaItem.type === 'image' && (
                          <img
                            src={activeMediaItem.previewUrl}
                            className="max-h-full max-w-full object-contain"
                            alt="Active Preview"
                          />
                        )}
                        {activeMediaItem.type === 'audio' && (
                          <div className="w-full p-8">
                            <audio
                              src={activeMediaItem.previewUrl}
                              controls
                              className="w-full"
                            />
                          </div>
                        )}
                      </div>
                      <div className="bg-base px-4 py-2 flex justify-between items-center gap-2 border-t border-line-subtle">
                        <span className="text-xs text-ink-muted font-mono truncate flex-1 min-w-0">
                          {activeMediaItem.file?.name || 'Existing File'}
                        </span>
                        {activeMediaItem.type === 'video' && !activeMediaItem.isRemote && (
                          <button
                            type="button"
                            onClick={() => setEditorTargetId(activeMediaItem.id)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/[0.12] text-emerald-200 border border-emerald-500/40 hover:bg-emerald-500/20 transition-colors flex-shrink-0"
                          >
                            <Scissors className="w-3.5 h-3.5" />
                            {activeMediaItem.editMetadata ? '다시 편집' : '영상 편집'}
                          </button>
                        )}
                        <span className="text-xs text-ink-muted uppercase flex-shrink-0">
                          {activeMediaItem.type}
                        </span>
                      </div>
                      {activeMediaItem.type === 'video' && !activeMediaItem.isRemote && (
                        <p className="bg-base px-4 pb-2 text-[11px] text-ink-muted">
                          편집은 선택 사항입니다. 자르기·슬로모션·음성·선 긋기가 필요할 때만 눌러주세요.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Dynamic Inputs based on Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Club Selection - Only for Non-Score records (Practice/Lesson) */}
          {recordType !== 'SCORE' && (
            <div>
              <label className="block text-sm font-bold text-ink-medium mb-2">
                사용 클럽
              </label>
              <select
                value={club}
                onChange={(e) => setClub(e.target.value)}
                className="w-full px-4 py-3 border border-line-subtle rounded-xl bg-white/[0.04]/[0.04] text-ink-high focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              >
                <option value="">선택안함</option>
                {CLUB_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <label className="block text-sm font-bold text-ink-medium mt-4 mb-2">
                목표 거리 (m)
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={targetDistance}
                onChange={(e) =>
                  setTargetDistance(
                    e.target.value === '' ? '' : Number(e.target.value)
                  )
                }
                placeholder="예: 150"
                className="w-full px-4 py-3 border border-line-subtle rounded-xl bg-white/[0.04]/[0.04] text-ink-high placeholder:text-ink-muted focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>
          )}

          {/* Score Input (Simple Mode Only) */}
          {recordType === 'SCORE' && scoreMode === 'SIMPLE' && (
            <div>
              <label className="block text-sm font-bold text-ink-medium mb-2">
                라운드 스코어 (Total)
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={score}
                onChange={(e) =>
                  setScore(e.target.value === '' ? '' : Number(e.target.value))
                }
                placeholder="예: 85"
                className="w-full px-4 py-3 border border-line-subtle rounded-xl bg-white/[0.04]/[0.04] text-ink-high placeholder:text-ink-muted focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-bold text-lg"
              />
            </div>
          )}
        </div>

        {/* Toggle Data Extraction Mode (Simple Score Only) */}
        {recordType === 'SCORE' &&
          scoreMode === 'SIMPLE' &&
          mediaItems.some((m) => m.type === 'image') && (
            <div
              onClick={() =>
                setIsDataExtractionMode(!isDataExtractionMode)
              }
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-4 ${
                isDataExtractionMode
                  ? 'border-blue-500 bg-blue-900/30'
                  : 'border-line-subtle hover:border-line-subtle bg-white/[0.05]/40'
              }`}
            >
              <div
                className={`p-2 rounded-full ${
                  isDataExtractionMode
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/[0.06] text-ink-medium'
                }`}
              >
                <TableProperties className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-ink-high text-sm">
                  AI 스코어카드 분석
                </h4>
                <p className="text-xs text-ink-muted">
                  이미지에서 스코어 및 라운드 내용을 분석합니다.
                </p>
              </div>
              {isDataExtractionMode && (
                <div className="ml-auto text-blue-300 font-bold text-xs">
                  ON
                </div>
              )}
            </div>
          )}

        {/* AI Shot Data Extraction Toggle (Non-Score Record) */}
        {recordType !== 'SCORE' &&
          mediaItems.some((m) => m.type === 'image') && (
            <div
              onClick={() =>
                setIsDataExtractionMode(!isDataExtractionMode)
              }
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-4 ${
                isDataExtractionMode
                  ? 'border-blue-500 bg-blue-900/30'
                  : 'border-line-subtle hover:border-line-subtle bg-white/[0.05]/40'
              }`}
            >
              <div
                className={`p-2 rounded-full ${
                  isDataExtractionMode
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/[0.06] text-ink-medium'
                }`}
              >
                <TableProperties className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-ink-high text-sm">
                  AI 샷 데이터 분석
                </h4>
                <p className="text-xs text-ink-muted">
                  GDR/트랙맨 화면에서 샷 데이터를 추출합니다.
                </p>
              </div>
              {isDataExtractionMode && (
                <div className="ml-auto text-blue-300 font-bold text-xs">
                  ON
                </div>
              )}
            </div>
          )}

        {/* Coach Notes */}
        <div>
          <label className="block text-sm font-bold text-ink-medium mb-2">
            {userRole === 'COACH' ? '코치 메모 / 피드백' : '나의 메모'}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              userRole === 'COACH'
                ? '회원에게 전달할 피드백 내용을 입력하세요.'
                : '연습 내용이나 느낀 점을 기록하세요.'
            }
            rows={4}
            className="w-full px-4 py-3 border border-line-subtle rounded-xl bg-white/[0.04]/[0.04] text-ink-high placeholder:text-ink-muted focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all resize-none"
          />
        </div>

        </div>{/* end scrollable area */}

        {/* Sticky footer with error/status and save button */}
        <div className="flex-shrink-0 px-5 pb-5 pt-4 border-t border-line-subtle bg-[#070b12] space-y-3">
        {error && (
          <div className="flex items-center gap-2 text-red-400 bg-red-900/20 border border-red-800/50 p-3 rounded-lg text-sm font-medium">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {statusMessage && (
          <div className="flex items-center gap-2 text-emerald-400 bg-emerald-900/20 border border-emerald-800/50 p-3 rounded-lg text-sm font-medium">
            <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            {statusMessage}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            className="flex-1 py-3 text-ink-muted"
          >
            취소
          </Button>
          <Button
            type="submit"
            className="flex-[2] py-3 text-lg font-bold"
            isLoading={isAnalyzing}
          >
            {initialData
              ? '수정 내용 저장'
              : userRole === 'COACH'
              ? '레슨 등록하기'
              : '기록 저장하기'}
          </Button>
        </div>
        </div>
      </form>

      {editorTargetItem && editorTargetItem.type === 'video' && (
        <VideoEditor
          videoUrl={editorTargetItem.previewUrl}
          onSave={handleEditorSave}
          onCancel={handleEditorSkip}
        />
      )}
    </div>
  );
};
