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
  UserPlus,
  PenTool,
  Play,
  ListChecks,
  CheckSquare,
  Calendar as CalendarIcon,
  Repeat,
  Clock,
  MapPin,
  FlagTriangleRight,
  ChevronDown,
  ChevronUp,
  StopCircle,
  RefreshCcw,
  ArrowLeft,
  CheckCircle,
  Circle,
} from 'lucide-react';
import {
  analyzeSwingVideo,
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
} from '../types';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';

interface NewLessonFormProps {
  existingClients: ClientProfile[];
  /** Lesson packages available to the coach – used to show package/session selection. */
  packages?: LessonPackage[];
  /** All lessons – used to determine which sessions are already recorded. */
  lessons?: Lesson[];
  onSave: (lesson: Lesson, homeworkBatch?: Homework[]) => void;
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
}

interface PendingMedia {
  id: string;
  file: File | null; // Allow null for existing remote files
  previewUrl: string;
  type: 'video' | 'image' | 'audio';
  duration?: number;
  isRemote?: boolean; // Flag for existing files
}

type RecordType = 'PRACTICE' | 'SCORE' | 'LESSON';

// Helper to get local YYYY-MM-DD
const getLocalISODate = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const WEEK_DAYS = [
  { label: '일', value: 0 },
  { label: '월', value: 1 },
  { label: '화', value: 2 },
  { label: '수', value: 3 },
  { label: '목', value: 4 },
  { label: '금', value: 5 },
  { label: '토', value: 6 },
];

const DURATION_OPTIONS = [
  { label: '1주 (7일)', value: 1 },
  { label: '2주 (14일)', value: 2 },
  { label: '4주 (1개월)', value: 4 },
  { label: '8주 (2개월)', value: 8 },
];

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
}) => {
  const { t } = useLanguage();
  // Wizard State: COACH starts at CLIENT_SELECT, CLIENT starts at TYPE_SELECT
  // When prefilledClient is provided, skip CLIENT_SELECT and jump to TYPE_SELECT
  const [step, setStep] = useState<'CLIENT_SELECT' | 'PACKAGE_SELECT' | 'TYPE_SELECT' | 'FORM'>(
    initialData
      ? 'FORM'
      : userRole === 'COACH' && !prefilledClient
      ? 'CLIENT_SELECT'
      : 'TYPE_SELECT'
  );

  const [recordType, setRecordType] = useState<RecordType>('PRACTICE');

  // Media State
  const [mediaItems, setMediaItems] = useState<PendingMedia[]>([]);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);

  // UI State
  const [isAddingMore, setIsAddingMore] = useState(false);
  const [inputMethod, setInputMethod] = useState<'upload' | 'camera' | 'voice' | 'screen'>(
    'upload'
  );

  // Form State
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  // Package/Session selection state (PACKAGE_SELECT step)
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [selectedSessionNumber, setSelectedSessionNumber] = useState<number | null>(null);

  const [title, setTitle] = useState('');
  const [club, setClub] = useState('');
  const [score, setScore] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [enableAI, setEnableAI] = useState(false); // Toggle for AI Analysis

  // Homework State
  const [pendingHomeworkBatch, setPendingHomeworkBatch] = useState<Homework[]>(
    []
  );
  const [homeworkSummaries, setHomeworkSummaries] = useState<
    { title: string; summary: string; count: number }[]
  >([]);

  // Homework Input State
  const [newHomeworkTitle, setNewHomeworkTitle] = useState('');
  const [hwStartDate, setHwStartDate] = useState(getLocalISODate());
  const [hwDuration, setHwDuration] = useState(1);
  const [hwDays, setHwDays] = useState<number[]>([1, 3, 5]); // Default Mon, Wed, Fri
  const [showHwOptions, setShowHwOptions] = useState(false);

  // Golf Data Extraction Mode
  const [isDataExtractionMode, setIsDataExtractionMode] = useState(false);

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

  // Recording State (Main Media)
  const [isMediaReady, setIsMediaReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user'); // Camera facing mode

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // Separate ref for hole recording to avoid conflict
  const holeMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const holeChunksRef = useRef<Blob[]>([]);

  // Track URLs for cleanup
  const mediaUrlsRef = useRef<string[]>([]);
  const savedUrlsRef = useRef<Set<string>>(new Set());

  const showAddInterface = mediaItems.length === 0 || isAddingMore;

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
      setNotes(initialData.coachNotes || '');
      setRecordType(initialData.recordType || 'LESSON');

      if (initialData.recordType === 'SCORE') {
        if (initialData.scorecardDetail) {
          setScoreMode('DETAILED');
          setCourseName(initialData.scorecardDetail.courseName);
          setHoleRecords(initialData.scorecardDetail.holes);
          setScore(initialData.score || initialData.scorecardDetail.totalScore);
        } else {
          setScoreMode('SIMPLE');
          setScore(initialData.score || '');
        }
      }

      // Reconstruct media items
      const reconstructedMedia: PendingMedia[] = [];
      if (initialData.videoUrl) {
        reconstructedMedia.push({
          id: 'main',
          file: null, // Remote file
          previewUrl: initialData.videoUrl,
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
          });
        });
      }
      setMediaItems(reconstructedMedia);
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
    setRecordType('LESSON');

    const today = new Date();
    const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일`;
    setTitle(`${dateStr} 레슨 기록`);

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

        // Find hole data
        const hole = holeRecords.find((h) => h.holeNumber === holeNum);
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
                ? { ...h, voiceUrl: url, aiSummary: '분석 실패' }
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
      console.error(e);
      setError(t('new_lesson_mic_required'));
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
      else typeStr = '연습';

      if (type === 'audio') typeStr += ' (음성)';

      setTitle(`${dateStr} ${typeStr}`);
    }
  };

  const removeMediaItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMediaItems((prev) => {
      const newItems = prev.filter((item) => item.id !== id);
      if (selectedMediaId === id && newItems.length > 0)
        setSelectedMediaId(newItems[0].id);
      if (newItems.length === 0) setIsAddingMore(false);
      return newItems;
    });
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: targetMode },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsMediaReady(true);
    } catch (err) {
      setError(t('new_lesson_camera_required'));
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setIsMediaReady(true);
    } catch (err) {
      setError(t('new_lesson_mic_required'));
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

  // --- Homework Logic ---

  const toggleDay = (dayValue: number) => {
    setHwDays((prev) =>
      prev.includes(dayValue)
        ? prev.filter((d) => d !== dayValue)
        : [...prev, dayValue].sort()
    );
  };

  const generateHomeworkBatch = (): Homework[] => {
    if (!clientName.trim() || !clientPhone.trim()) return [];

    const clientId = `${clientName}_${clientPhone}`;
    const batch: Homework[] = [];

    const [y, m, d] = hwStartDate.split('-').map(Number);
    const cursor = new Date(y, m - 1, d, 12, 0, 0);
    const totalDays = hwDuration * 7;

    for (let i = 0; i < totalDays; i++) {
      const currentDayOfWeek = cursor.getDay();
      if (hwDays.includes(currentDayOfWeek)) {
        const cy = cursor.getFullYear();
        const cm = String(cursor.getMonth() + 1).padStart(2, '0');
        const cd = String(cursor.getDate()).padStart(2, '0');
        const dateStr = `${cy}-${cm}-${cd}`;

        batch.push({
          id: crypto.randomUUID(),
          clientId,
          title: newHomeworkTitle.trim(),
          date: dateStr,
          isCompleted: false,
          createdAt: Date.now() + i,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return batch;
  };

  const addHomework = () => {
    if (!newHomeworkTitle.trim()) {
      setError(t('new_lesson_homework_required'));
      return;
    }
    if (hwDays.length === 0) {
      setError(t('new_lesson_day_required'));
      return;
    }

    const newBatch = generateHomeworkBatch();
    if (newBatch.length === 0) {
      setError(t('new_lesson_no_dates'));
      return;
    }

    setPendingHomeworkBatch((prev) => [...prev, ...newBatch]);

    const daysLabel =
      hwDays.length === 7
        ? '매일'
        : hwDays
            .map((d) => WEEK_DAYS.find((wd) => wd.value === d)?.label)
            .join(',');
    const summaryStr = `${newHomeworkTitle} (${daysLabel}, ${hwDuration}주간)`;

    setHomeworkSummaries((prev) => [
      ...prev,
      {
        title: newHomeworkTitle,
        summary: summaryStr,
        count: newBatch.length,
      },
    ]);

    setNewHomeworkTitle('');
    setError(null);
  };

  const removeHomeworkSummary = (index: number) => {
    const summaryToRemove = homeworkSummaries[index];
    setHomeworkSummaries((prev) => prev.filter((_, i) => i !== index));
    setPendingHomeworkBatch((prev) =>
      prev.filter((h) => h.title !== summaryToRemove.title)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation for Media
    // In Simple Mode, at least one media is required.
    // In Detailed Scorecard Mode, media is optional (user might just input numbers).
    if (recordType !== 'SCORE' || scoreMode === 'SIMPLE') {
      if (mediaItems.length === 0) {
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

    const shouldRunAI = enableAI || isDataExtractionMode;

    // Validation: Require Club Selection for Shot Data Analysis
    if (
      shouldRunAI &&
      isDataExtractionMode &&
      recordType !== 'SCORE' &&
      !club
    ) {
      setError(t('new_lesson_club_required'));
      return;
    }

    setError(null);

    if (shouldRunAI) {
      setIsAnalyzing(true);
      setStatusMessage('AI 분석 준비 중...');
    } else {
      setIsAnalyzing(true);
      setStatusMessage('저장 중...');
    }

    try {
      let analysisResult = initialData?.aiAnalysis || '';
      let extractedGolfData: GolfData | undefined = initialData?.golfData;
      let extractedScore: number | undefined = initialData?.score;
      let scorecardDetail: ScorecardDetail | undefined = undefined;

      const mainMedia = mediaItems.length > 0 ? mediaItems[0] : null;
      const extractionTargetImage = isDataExtractionMode
        ? mediaItems.find((item) => item.type === 'image' && item.file)
        : undefined;

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

        // Generate simple analysis summary if AI enabled
        if (enableAI) {
          const badHoles = holeRecords.filter((h) => h.score >= h.par + 2);
          const goodHoles = holeRecords.filter((h) => h.score < h.par);
          analysisResult = `### ⛳ 라운드 요약 (AI)\n\n**${courseName}**에서의 라운드 결과입니다.\n- **총 타수**: ${totalScore}타\n- **총 퍼팅수**: ${totalPutts}개\n\n`;
          if (goodHoles.length > 0) {
            analysisResult += `👍 **좋았던 홀**: ${goodHoles
              .map((h) => `${h.holeNumber}번(${h.score})`)
              .join(', ')}\n`;
          }
          if (badHoles.length > 0) {
            analysisResult += `⚠️ **아쉬운 홀**: ${badHoles
              .map((h) => `${h.holeNumber}번(${h.score})`)
              .join(', ')}\n`;
          }
          analysisResult += `\n홀별 상세 분석 내용은 아래 기록표를 참고해주세요.`;
        }
      }
      // Logic for SIMPLE Scorecard / Other Modes
      else if (mainMedia && shouldRunAI && mainMedia.file) {
        // Only run AI if there is a NEW file. If editing and no new file, skip (or maybe prompt).
        // For now, if editing and no new file, we keep existing analysis unless explicitly re-triggered which is complex here.
        // Assuming `shouldRunAI` is set fresh, we might re-run if it's a new upload.

        try {
          if (isDataExtractionMode && extractionTargetImage?.file) {
            setStatusMessage(
              recordType === 'SCORE'
                ? '스코어카드 데이터를 분석하고 있습니다...'
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
            if (dataResult.golfData) {
              extractedGolfData = dataResult.golfData;
            }
            if (dataResult.score) {
              extractedScore = dataResult.score;
            }
          } else {
            setStatusMessage(
              'AI가 미디어 자료와 코치님의 피드백을 분석하고 있습니다...'
            );

            let promptContext = notes;
            if (userRole === 'CLIENT') {
              if (recordType === 'SCORE') {
                promptContext = `[필드/스크린 스코어 기록] 사용자가 스코어카드를 업로드했습니다. 점수(${score})와 내용을 정리해주세요. 메모: ${notes}`;
              } else if (recordType === 'LESSON') {
                promptContext = `[레슨 복기 기록] 사용자가 레슨 받은 내용을 직접 정리한 것입니다. 메모: ${notes}`;
              } else {
                promptContext = `[자율 연습 기록] 사용자가 스스로 연습한 내용입니다. 메모: ${notes}`;
              }
            }

            analysisResult = await analyzeSwingVideo(
              mediaItems
                .filter((item) => item.file)
                .map((item) => ({
                  data: item.file!,
                  mimeType: item.file!.type,
                })),
              promptContext,
              undefined
            );
          }
        } catch (err) {
          console.error('Analysis failed', err);
          if (!analysisResult) analysisResult = 'AI 분석에 실패했습니다.';
        }
      }

      if (recordType === 'SCORE') {
        extractedGolfData = undefined;
      }

      // Convert Media Items to MediaItem objects
      // If editing, we mix existing URLs with new Blob URLs
      const additionalMediaObjects: MediaItem[] = mediaItems
        .slice(1)
        .map((item) => ({
          id: item.id,
          url: item.previewUrl,
          type: item.type,
          createdAt: Date.now(),
        }));

      // Auto-tagging based on record type
      const tags = [];
      if (shouldRunAI) tags.push('AI분석');

      if (recordType === 'SCORE')
        tags.push('스코어', '필드기록', courseName || '코스미정');
      else if (recordType === 'LESSON') tags.push('레슨복기', '프로레슨');
      else tags.push('자율연습', '스윙분석');

      if (club) tags.push(club);
      if (mainMedia?.type === 'audio') tags.push('음성기록');
      else if (isDataExtractionMode) tags.push('데이터분석');

      let finalScore: number | undefined = undefined;
      if (recordType === 'SCORE') {
        if (score !== '') {
          finalScore = Number(score);
        } else if (extractedScore !== undefined) {
          finalScore = extractedScore;
        }
      }

      const homeworkTitles = homeworkSummaries.map((s) => s.title);

      const newLesson: Lesson = {
        id: initialData ? initialData.id : crypto.randomUUID(), // Use existing ID if editing
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        coachId: userRole === 'CLIENT' ? currentUser?.coachId : undefined, // Assign coachId if created by client
        createdBy: userRole as 'COACH' | 'CLIENT',
        recordType: userRole === 'CLIENT' ? recordType : 'LESSON',
        date: initialData ? initialData.date : getLocalISODate(),
        title,
        club: club || undefined,
        score: finalScore,
        scorecardDetail,
        swingAngle: undefined,
        videoUrl: mainMedia ? mainMedia.previewUrl : '',
        mediaType: mainMedia ? mainMedia.type : 'image',
        additionalMedia: additionalMediaObjects,
        coachNotes: notes,
        aiAnalysis: analysisResult || undefined,
        golfData: extractedGolfData,
        tags: tags,
        createdAt: initialData ? initialData.createdAt : Date.now(), // Preserve creation date
        shareOption: 'FULL',
        feedbackStatus: initialData ? initialData.feedbackStatus : 'NONE',
        assignedHomework:
          homeworkTitles.length > 0
            ? homeworkTitles
            : initialData?.assignedHomework,
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
          if (h.voiceUrl && h.voiceUrl.startsWith('blob:'))
            savedUrlsRef.current.add(h.voiceUrl);
        });
      }

      onSave(
        newLesson,
        pendingHomeworkBatch.length > 0 ? pendingHomeworkBatch : undefined
      );
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
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden animate-fade-in-up">
        {/* Header */}
        <div className="bg-slate-700 px-6 py-4 flex justify-between items-center text-white">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep('CLIENT_SELECT')}
              className="text-emerald-100 hover:text-white"
              aria-label={t('new_lesson_back_member')}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <BookOpen className="w-5 h-5" /> {t('new_lesson_package_title')}
            </h2>
          </div>
          <button onClick={onCancel} className="text-emerald-100 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Selected client info */}
        <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center gap-3">
          <div className="bg-emerald-100 p-2 rounded-full">
            <UserCheck className="w-4 h-4 text-emerald-700" />
          </div>
          <div>
            <p className="font-bold text-emerald-800 text-sm">{clientName}</p>
            <p className="text-xs text-emerald-600">{clientPhone}</p>
          </div>
        </div>

        {/* Package list */}
        <div className="p-5 max-h-[55vh] overflow-y-auto space-y-4">
          <p className="text-sm text-gray-600">
            기록할 레슨 패키지와 회차를 선택하세요.
          </p>

          {clientPackages.map((pkg) => {
            const completedCount = Array.from({ length: pkg.totalSessions }, (_, i) => i + 1)
              .filter((n) => getSessionLesson(pkg.id, n) != null).length;
            const remaining = pkg.totalSessions - completedCount;

            return (
              <div
                key={pkg.id}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden"
              >
                {/* Package header */}
                <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-gray-900 text-sm">
                      {pkg.totalSessions}회 레슨 패키지
                    </span>
                  </div>
                  <div className="text-right text-xs">
                    <span className="font-bold text-indigo-700">{completedCount}</span>
                    <span className="text-gray-400">/{pkg.totalSessions}회 완료</span>
                    {remaining > 0 && (
                      <span className="text-gray-400 ml-1">({remaining}회 남음)</span>
                    )}
                  </div>
                </div>

                {/* Session grid */}
                <div className="p-3">
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
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
                                  ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                                  : isSelected
                                  ? 'border-indigo-500 bg-indigo-100 text-indigo-700 font-bold'
                                  : 'border-dashed border-gray-300 bg-gray-50 text-gray-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600'
                              }
                            `}
                          >
                            {isRecorded ? (
                              <CheckCircle className="w-3.5 h-3.5 text-gray-400" />
                            ) : isSelected ? (
                              <CheckCircle className="w-3.5 h-3.5 text-indigo-500" />
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
            <p className="text-red-500 text-sm font-bold bg-red-50 p-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="p-5 border-t border-gray-100 space-y-3">
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
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors text-center"
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
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden animate-fade-in-up">
        <div className="bg-emerald-800 px-6 py-4 flex justify-between items-center text-white">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <UserCheck className="w-5 h-5" /> 레슨 대상 입력
          </h2>
          <button
            onClick={onCancel}
            className="text-slate-200 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="block text-sm font-bold text-gray-700">
              회원 이름
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-5 h-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="이름을 입력하세요"
                value={clientName}
                onChange={handleClientNameChange}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-700 outline-none transition-all"
              />
            </div>
            {/* Suggestion List */}
            {clientName.trim() &&
              matchingClients.length > 0 &&
              !isExistingClientSelected && (
                <div className="bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto absolute z-50 w-[calc(100%-3rem)]">
                  {matchingClients.map((c) => (
                    <div
                      key={`${c.name}_${c.phone}`}
                      onClick={() => selectSuggestion(c)}
                      className="px-4 py-3 hover:bg-emerald-50 cursor-pointer border-b border-gray-100 last:border-none flex justify-between items-center"
                    >
                      <span className="font-bold text-gray-800">{c.name}</span>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
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
              <label className="block text-sm font-bold text-gray-700">
                전화번호{' '}
                <span className="text-red-500 text-xs font-normal">
                  (미등록 회원)
                </span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Smartphone className="w-5 h-5 text-gray-400" />
                </div>
                <input
                  type="tel"
                  placeholder="010-0000-0000"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-700 outline-none transition-all"
                />
              </div>
              <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded-lg">
                * 처음 등록하는 회원은 전화번호 입력이 필요합니다.
              </p>
            </div>
          )}

          {/* Existing Client Badge */}
          {isExistingClientSelected && (
            <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl flex items-center gap-3 animate-fade-in">
              <div className="bg-emerald-100 p-2 rounded-full text-emerald-600">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-emerald-800 text-sm">
                  등록된 회원입니다
                </p>
                <p className="text-xs text-emerald-600">{clientPhone}</p>
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-500 text-sm font-bold bg-red-50 p-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>
          )}

          <Button
            onClick={handleStartLesson}
            className="w-full py-4 text-lg font-bold shadow-lg shadow-slate-200 mt-4"
          >
            레슨 기록 시작 <Play className="w-5 h-5 ml-2 fill-current" />
          </Button>
        </div>
      </div>
    );
  }

  // STEP: CLIENT TYPE SELECTION
  if (step === 'TYPE_SELECT') {
    return (
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden animate-fade-in-up">
        <div className="bg-emerald-800 px-6 py-4 flex justify-between items-center text-white">
          <h2 className="text-lg font-bold">기록 유형 선택</h2>
          <button
            onClick={onCancel}
            className="text-emerald-100 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-center text-gray-500 mb-6">
            어떤 활동을 기록하시겠습니까?
          </p>

          <button
            onClick={() => handleSelectType('PRACTICE')}
            className="w-full flex items-center p-4 border-2 border-gray-100 rounded-xl hover:border-emerald-700 hover:bg-emerald-50 transition-all group text-left"
          >
            <div className="bg-emerald-100 p-3 rounded-full text-emerald-600 group-hover:bg-emerald-200 group-hover:text-emerald-800 mr-4">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-gray-900 group-hover:text-emerald-700">
                연습 기록
              </h4>
              <p className="text-xs text-gray-500">
                나의 스윙 연습 영상과 사진을 남깁니다.
              </p>
            </div>
          </button>

          <button
            onClick={() => handleSelectType('SCORE')}
            className="w-full flex items-center p-4 border-2 border-gray-100 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group text-left"
          >
            <div className="bg-blue-100 p-3 rounded-full text-blue-600 group-hover:bg-blue-200 group-hover:text-blue-800 mr-4">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-gray-900 group-hover:text-blue-700">
                라운드 기록
              </h4>
              <p className="text-xs text-gray-500">
                필드나 스크린 골프 라운드 기록을 저장합니다.
              </p>
            </div>
          </button>

          <button
            onClick={() => handleSelectType('LESSON')}
            className="w-full flex items-center p-4 border-2 border-gray-100 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all group text-left"
          >
            <div className="bg-purple-100 p-3 rounded-full text-purple-600 group-hover:bg-purple-200 group-hover:text-purple-800 mr-4">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-gray-900 group-hover:text-purple-700">
                레슨 기록
              </h4>
              <p className="text-xs text-gray-500">
                코치님께 받은 레슨 내용을 메모합니다.
              </p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // STEP: FORM
  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden animate-fade-in">
      {/* ... (Header and other parts remain same) ... */}
      <div
        className={`px-6 py-4 flex justify-between items-center ${
          recordType === 'SCORE'
            ? 'bg-blue-600'
            : recordType === 'LESSON'
            ? 'bg-slate-700'
            : 'bg-emerald-800'
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
            : '새 레슨 기록'}
        </h2>
        <button
          onClick={onCancel}
          className="text-white/80 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Title Input */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">
            제목 <span className="text-red-500">*</span>
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
            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700 outline-none transition-all"
            required
          />
        </div>

        {/* SCORE MODE TOGGLE & DETAILED INPUT (Omitted for brevity, logic remains same) */}
        {recordType === 'SCORE' && (
          <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
            <button
              type="button"
              onClick={() => {
                setScoreMode('SIMPLE');
                setIsDataExtractionMode(false);
              }}
              className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${
                scoreMode === 'SIMPLE'
                  ? 'bg-white shadow-sm text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
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
                  ? 'bg-white shadow-sm text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
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
              <label className="block text-sm font-bold text-gray-700 mb-2">
                골프장 이름 / 코스명
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MapPin className="w-5 h-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={courseName}
                  onChange={handleCourseNameChange}
                  placeholder="골프장 검색 또는 직접 입력"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
                {/* Course Search Dropdown */}
                {showCourseSearch && courseSearchResults.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {courseSearchResults.map((course) => (
                      <div
                        key={course.id}
                        onClick={() => selectCourse(course)}
                        className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-none flex justify-between items-center"
                      >
                        <span className="font-bold text-gray-800">
                          {course.name}
                        </span>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          18홀 Par {course.pars.reduce((a, b) => a + b, 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Hole List (Same as before) */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 grid grid-cols-12 gap-1 text-xs font-bold text-gray-500 text-center">
                <div className="col-span-1">HOLE</div>
                <div className="col-span-2">PAR</div>
                <div className="col-span-2">SCORE</div>
                <div className="col-span-2">PUTT</div>
                <div className="col-span-5">PLAY RECORD (Voice & AI)</div>
              </div>
              <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
                {holeRecords.map((hole) => (
                  <div
                    key={hole.holeNumber}
                    className="bg-white hover:bg-gray-50 transition-colors"
                  >
                    <div className="grid grid-cols-12 gap-1 px-4 py-3 items-center text-center">
                      <div className="col-span-1 font-bold text-gray-900">
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
                          className="w-full text-center p-1 border border-gray-200 rounded text-sm"
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
                          className={`w-full text-center p-1 border rounded text-sm font-bold ${
                            hole.score > 0
                              ? hole.score < hole.par
                                ? 'text-red-500 border-red-200 bg-red-50'
                                : hole.score > hole.par
                                ? 'text-blue-600 border-blue-200 bg-blue-50'
                                : 'text-gray-900 border-gray-200'
                              : 'border-gray-200'
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
                          className="w-full text-center p-1 border border-gray-200 rounded text-sm text-gray-500"
                        />
                      </div>
                      <div className="col-span-5 flex justify-end gap-2">
                        {activeRecordingHole === hole.holeNumber ? (
                          <button
                            type="button"
                            onClick={stopHoleRecording}
                            className="bg-red-500 text-white px-2 py-1 rounded-full text-xs flex items-center gap-1 animate-pulse"
                          >
                            <StopCircle className="w-3 h-3" />{' '}
                            {recordingHoleTime}s
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startHoleRecording(hole.holeNumber)}
                            className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 border transition-colors ${
                              hole.voiceUrl
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-emerald-700 hover:text-emerald-600'
                            }`}
                          >
                            <Mic className="w-3 h-3" />{' '}
                            {hole.voiceUrl ? '다시 녹음' : '기록'}
                          </button>
                        )}
                      </div>
                    </div>
                    {/* ... (Hole details) ... */}
                    {hole.aiSummary && (
                      <div className="px-4 pb-3 pl-14 text-left space-y-2">
                        <div className="bg-blue-50 p-2 rounded-lg border border-blue-100 flex items-start gap-2">
                          <Sparkles className="w-3 h-3 text-blue-500 mt-1 flex-shrink-0" />
                          <p className="text-xs text-blue-800 leading-relaxed">
                            {hole.aiSummary}
                          </p>
                        </div>
                        {hole.shotMetrics && (
                          <div className="flex flex-wrap gap-2 text-[10px]">
                            {hole.shotMetrics.teeDistance && (
                              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded border border-gray-200">
                                티샷: {hole.shotMetrics.teeDistance}m
                              </span>
                            )}
                            {hole.shotMetrics.secondShotDistance && (
                              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded border border-gray-200">
                                세컨: {hole.shotMetrics.secondShotDistance}m
                                남음
                              </span>
                            )}
                            {hole.shotMetrics.firstPuttDistance && (
                              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded border border-gray-200">
                                퍼팅: {hole.shotMetrics.firstPuttDistance}m
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* Totals Footer */}
              <div className="bg-gray-100 px-4 py-3 border-t border-gray-200 grid grid-cols-12 gap-1 text-sm font-bold text-center">
                <div className="col-span-1">TOTAL</div>
                <div className="col-span-2">
                  {holeRecords.reduce((a, b) => a + b.par, 0)}
                </div>
                <div className="col-span-2 text-blue-600">{score}</div>
                <div className="col-span-2 text-gray-600">
                  {holeRecords.reduce((a, b) => a + (b.putts || 0), 0)}
                </div>
                <div className="col-span-5 text-right text-xs text-gray-500 pr-2">
                  {holeRecords.filter((h) => h.voiceUrl).length}개 홀 기록됨
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SIMPLE MEDIA UPLOAD (Default) */}
        {(recordType !== 'SCORE' || scoreMode === 'SIMPLE') && (
          <>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                미디어 (영상/사진/음성) <span className="text-red-500">*</span>
              </label>

              {showAddInterface ? (
                <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 bg-gray-50 hover:bg-gray-100 transition-colors">
                  {/* Method Selection Tabs */}
                  <div className="flex justify-center mb-6 bg-white rounded-full p-1 inline-flex mx-auto shadow-sm border border-gray-200">
                    <button
                      type="button"
                      onClick={() => setInputMethod('upload')}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                        inputMethod === 'upload'
                          ? 'bg-gray-900 text-white shadow-md'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      파일 업로드
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setInputMethod('camera');
                        startCamera();
                      }}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                        inputMethod === 'camera'
                          ? 'bg-gray-900 text-white shadow-md'
                          : 'text-gray-500 hover:text-gray-900'
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
                          ? 'bg-gray-900 text-white shadow-md'
                          : 'text-gray-500 hover:text-gray-900'
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
                          ? 'bg-gray-900 text-white shadow-md'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      {t('new_lesson_screen_capture')}
                    </button>
                  </div>

                  {inputMethod === 'upload' && (
                    <div
                      className="text-center"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm text-emerald-700 cursor-pointer">
                        <Upload className="w-8 h-8" />
                      </div>
                      <p className="text-sm text-gray-600 font-medium mb-1">
                        클릭하여 파일 업로드
                      </p>
                      <p className="text-xs text-gray-400">
                        영상, 사진, 오디오 파일 지원 (최대 5GB)
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
                              className="w-14 h-14 bg-white border-4 border-gray-300 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50"
                            >
                              <Camera className="w-6 h-6 text-gray-600" />
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
                              className="w-16 h-16 bg-white border-4 border-gray-200 rounded-sm flex items-center justify-center shadow-md"
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
                            : 'bg-gray-100'
                        }`}
                      >
                        <Mic
                          className={`w-10 h-10 ${
                            isRecording ? 'text-white' : 'text-gray-400'
                          }`}
                        />
                      </div>
                      {isRecording && (
                        <p className="text-2xl font-bold text-gray-800 mb-4 font-mono">
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
                            <div className="w-2 h-2 bg-white rounded-full" />
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
                              className="w-14 h-14 bg-white border-4 border-gray-300 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Camera className="w-6 h-6 text-gray-600" />
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
                              className="w-16 h-16 bg-white border-4 border-gray-200 rounded-sm flex items-center justify-center shadow-md"
                            >
                              <div className="w-6 h-6 bg-red-600 rounded-sm"></div>
                            </button>
                          </div>
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
                          <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-500 flex-col gap-2">
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
                        {index === 0 && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5">
                            메인 미디어
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Add More Button */}
                    <button
                      type="button"
                      onClick={() => setIsAddingMore(true)}
                      className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 transition-all gap-1"
                    >
                      <Plus className="w-6 h-6" />
                      <span className="text-xs font-bold">추가</span>
                    </button>
                  </div>

                  {/* Active Item Preview (Larger) */}
                  {activeMediaItem && (
                    <div className="bg-black rounded-xl overflow-hidden relative group">
                      <div className="aspect-video flex items-center justify-center bg-gray-900">
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
                      <div className="bg-gray-900 px-4 py-2 flex justify-between items-center border-t border-gray-800">
                        <span className="text-xs text-gray-400 font-mono truncate max-w-[200px]">
                          {activeMediaItem.file?.name || 'Existing File'}
                        </span>
                        <span className="text-xs text-gray-500 uppercase">
                          {activeMediaItem.type}
                        </span>
                      </div>
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
              <label className="block text-sm font-bold text-gray-700 mb-2">
                사용 클럽
              </label>
              <select
                value={club}
                onChange={(e) => setClub(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-700 outline-none"
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
            </div>
          )}

          {/* Score Input (Simple Mode Only) */}
          {recordType === 'SCORE' && scoreMode === 'SIMPLE' && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                라운드 스코어 (Total)
              </label>
              <input
                type="number"
                value={score}
                onChange={(e) =>
                  setScore(e.target.value === '' ? '' : Number(e.target.value))
                }
                placeholder="예: 85"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-lg"
              />
            </div>
          )}
        </div>

        {/* Toggle Data Extraction Mode (Simple Score Only) */}
        {recordType === 'SCORE' &&
          scoreMode === 'SIMPLE' &&
          mediaItems.some((m) => m.type === 'image') && (
            <div
              onClick={() => {
                const newState = !isDataExtractionMode;
                setIsDataExtractionMode(newState);
                // Force AI enable if turning on data extraction
                if (newState) {
                  setEnableAI(true);
                }
              }}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-4 ${
                isDataExtractionMode
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div
                className={`p-2 rounded-full ${
                  isDataExtractionMode
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                <TableProperties className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900 text-sm">
                  AI 스코어카드 분석
                </h4>
                <p className="text-xs text-gray-500">
                  이미지에서 스코어 및 라운드 내용을 분석합니다.
                </p>
              </div>
              {isDataExtractionMode && (
                <div className="ml-auto text-blue-600 font-bold text-xs">
                  ON
                </div>
              )}
            </div>
          )}

        {/* AI Shot Data Extraction Toggle (Non-Score Record) */}
        {recordType !== 'SCORE' &&
          mediaItems.some((m) => m.type === 'image') && (
            <div
              onClick={() => {
                const newState = !isDataExtractionMode;
                setIsDataExtractionMode(newState);
                if (newState) setEnableAI(true);
              }}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-4 ${
                isDataExtractionMode
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div
                className={`p-2 rounded-full ${
                  isDataExtractionMode
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                <TableProperties className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900 text-sm">
                  AI 샷 데이터 분석
                </h4>
                <p className="text-xs text-gray-500">
                  GDR/트랙맨 화면에서 샷 데이터를 추출합니다.
                </p>
              </div>
              {isDataExtractionMode && (
                <div className="ml-auto text-blue-600 font-bold text-xs">
                  ON
                </div>
              )}
            </div>
          )}

        {/* Coach Notes */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">
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
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700 outline-none transition-all resize-none"
          />
        </div>

        {/* Homework Input Section (Inside Lesson Form) */}
        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-indigo-800 flex items-center gap-2">
              <ListChecks className="w-4 h-4" />{' '}
              {userRole === 'COACH' ? '숙제/미션 부여' : '다음 연습 계획'}
            </label>
            <button
              type="button"
              onClick={() => setShowHwOptions(!showHwOptions)}
              className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
            >
              {showHwOptions ? '간편 입력' : '상세 설정(기간/빈도)'}
            </button>
          </div>

          {/* Simple Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newHomeworkTitle}
              onChange={(e) => setNewHomeworkTitle(e.target.value)}
              placeholder={
                userRole === 'COACH'
                  ? '예: 벽대고 빈스윙 20회'
                  : '예: 7번 아이언 리듬 연습'
              }
              className="flex-1 px-3 py-2 border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              onKeyDown={(e) =>
                e.key === 'Enter' && (e.preventDefault(), addHomework())
              }
            />
            <button
              type="button"
              onClick={addHomework}
              className="bg-slate-700 text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-slate-800 transition-colors"
            >
              추가
            </button>
          </div>

          {/* Advanced Options (Frequency, Duration) */}
          {showHwOptions && (
            <div className="bg-white p-3 rounded-lg border border-indigo-100 animate-fade-in space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    시작일
                  </label>
                  <input
                    type="date"
                    value={hwStartDate}
                    onChange={(e) => setHwStartDate(e.target.value)}
                    className="w-full text-xs p-2 border border-gray-200 rounded focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    기간
                  </label>
                  <select
                    value={hwDuration}
                    onChange={(e) => setHwDuration(Number(e.target.value))}
                    className="w-full text-xs p-2 border border-gray-200 rounded focus:border-indigo-500 outline-none"
                  >
                    {DURATION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  반복 요일
                </label>
                <div className="flex justify-between gap-1">
                  {WEEK_DAYS.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value)}
                      className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${
                        hwDays.includes(day.value)
                          ? 'bg-slate-700 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Added Homework List */}
          {homeworkSummaries.length > 0 && (
            <ul className="space-y-2">
              {homeworkSummaries.map((item, idx) => (
                <li
                  key={idx}
                  className="bg-white px-3 py-2 rounded-lg border border-indigo-100 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="w-4 h-4 text-indigo-500" />
                      <span className="text-sm font-bold text-gray-800">
                        {item.title}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeHomeworkSummary(idx)}
                      className="text-gray-400 hover:text-red-500 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-1 ml-6 text-xs text-gray-500">
                    <Repeat className="w-3 h-3" /> {item.summary}
                    <span className="bg-indigo-50 text-indigo-600 px-1.5 rounded-full font-bold">
                      Total {item.count}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* AI Analysis Toggle */}
        <div className="flex items-center justify-between bg-gray-50 p-4 rounded-xl border border-gray-200">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-full ${
                enableAI || isDataExtractionMode
                  ? 'bg-emerald-100 text-emerald-600'
                  : 'bg-gray-200 text-gray-400'
              }`}
            >
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-gray-900 text-sm">AI 레슨 분석</h4>
              <p className="text-xs text-gray-500">
                {recordType === 'SCORE' && scoreMode === 'DETAILED'
                  ? '18홀 기록을 바탕으로 라운드를 요약합니다.'
                  : 'Coachx AI가 영상을 분석하여 리포트를 생성합니다.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEnableAI(!enableAI)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              enableAI || isDataExtractionMode
                ? 'bg-emerald-800'
                : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enableAI || isDataExtractionMode
                  ? 'translate-x-6'
                  : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm font-medium animate-pulse">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {statusMessage && (
          <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 p-3 rounded-lg text-sm font-medium animate-pulse">
            <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            {statusMessage}
          </div>
        )}

        <div className="pt-4 border-t border-gray-100 flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            className="flex-1 py-3 text-gray-500"
          >
            취소
          </Button>
          <Button
            type="submit"
            className="flex-[2] py-3 text-lg font-bold shadow-lg shadow-slate-200"
            isLoading={isAnalyzing}
          >
            {initialData
              ? '수정 내용 저장'
              : userRole === 'COACH'
              ? '레슨 등록하기'
              : '기록 저장하기'}
          </Button>
        </div>
      </form>
    </div>
  );
};
