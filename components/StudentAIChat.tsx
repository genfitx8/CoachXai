import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Lesson, ClientProfile, CoachProfile, Homework, LessonReservation, QuickLogEntry } from '../types';
import {
  ChevronLeft, Send, Sparkles, Bot, MessageCircle, Target, TrendingUp,
  ListChecks, Dumbbell, HelpCircle, Mic, MicOff, MessageSquare, Volume2, VolumeX,
  Calendar, Clock, CheckCircle, XCircle, AlertCircle, Loader2, RotateCcw,
  Paperclip, Camera, Image as ImageIcon, Video, ClipboardList, Play, X, RefreshCw,
} from 'lucide-react';
import { ChatAttachment, ChatAttachmentDestination, CoachXChatMessage } from '../services/coachXService';
import { generateStudentChatResponse } from '../services/geminiService';
import { apiService, resolveMediaUrl } from '../services/apiService';
import { loadChatHistory, saveChatHistory, clearChatHistory, hydrateChatHistoryFromServer } from '../services/chatHistoryService';
import { reservationService } from '../services/reservationService';
import { useLanguage } from './LanguageContext';
import { useTypingReveal } from '../hooks/useTypingReveal';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { renderMarkdown } from '../utils/renderMarkdown';
import { BackButton } from './ui/BackButton';
import { PermissionDeniedModal } from './PermissionDeniedModal';

type Mode = 'voice' | 'chat';
type BookingStep = 'idle' | 'loading-slots' | 'slot-selection' | 'confirming' | 'booking';

interface StudentAIChatProps {
  clientProfile: ClientProfile;
  myLessons: Lesson[];
  homeworkList: Homework[];
  quickLogs?: QuickLogEntry[];
  coachProfile?: CoachProfile;
  onBack: () => void;
  initialQuery?: string;
  /**
   * When provided, replaces the auto-generated greeting used for the very
   * first assistant message. The AI Home passes a context-aware greeting here.
   */
  initialGreeting?: string;
  /**
   * Default conversation mode on first render. Falls back to 'voice' for
   * backwards compatibility with the original entry-point.
   */
  defaultMode?: Mode;
  /**
   * Force-hide the voice/chat mode selection screen even when no
   * `initialQuery` is present. Used by the AI Home which is chat-first.
   */
  hideModeSelector?: boolean;
  /**
   * Hide the back button in the header. Used when this component renders as
   * the app's home screen and there's no "back" destination.
   */
  hideBackButton?: boolean;
  /**
   * Optional element to render where the back button normally sits.
   * The AI Home passes its hamburger button here.
   */
  headerLeftSlot?: React.ReactNode;
  /**
   * Optional banner rendered directly above the message stream in chat
   * mode. Used by the AI Home to surface the redesign's "오늘의 한 가지"
   * and "이번 주 드릴" cards without swapping out the whole chat surface.
   * Scrolls with the messages so it doesn't consume permanent screen space.
   */
  topBannerSlot?: React.ReactNode;
  /**
   * Set when this chat renders underneath the fixed StudentBottomNav (the
   * 대화 tab). The column then sizes itself to the viewport *minus* the nav
   * so the input row stops above it; the nav's own `pb-safe` already clears
   * the home indicator / gesture bar below that. Left unset the chat owns
   * the full viewport and takes the bottom inset itself.
   */
  reserveBottomNav?: boolean;
  /**
   * Persist a record created from a chat attachment. Wired to ClientApp's
   * `onSaveNewRecord` so a file filed from the chat lands in the same store
   * as coach-authored lessons. Omit to hide the "save as record" option — the
   * chat then only offers analysis without keeping anything.
   */
  onSaveLesson?: (lesson: Lesson) => void | Promise<void>;
}

type UploadStage = 'uploading' | 'ready' | 'error';

/** A file being uploaded, before it is committed to the transcript. */
interface PendingAttachment {
  /** Fresh UUID — the R2 key root, and the lesson id if it is filed. */
  id: string;
  file: File;
  type: 'video' | 'image' | 'audio';
  /** Object URL for the local preview; revoked when the pending item clears. */
  previewUrl: string;
  stage: UploadStage;
  /** Absolute /api/files/… URL, once the upload lands. */
  url?: string;
  error?: string;
}

/**
 * Client-side mirror of the server's per-type caps
 * (server/src/routes/files.ts). Checked here so an oversized pick fails
 * instantly with an explanation instead of after a long doomed upload.
 */
const MAX_UPLOAD_BYTES: Record<PendingAttachment['type'], number> = {
  video: 500 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
  image: 20 * 1024 * 1024,
};

const ATTACHMENT_ACCEPT = 'video/*,image/*';

function attachmentTypeOf(mimeType: string): PendingAttachment['type'] | null {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

function newAttachmentId(): string {
  // Matches the UUID shape the presign guard requires; the timestamp fallback
  // is only for environments without crypto.randomUUID (older WebViews).
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** `action: 'attach'` opens the file sheet instead of sending the text. */
const SUGGESTED_PROMPTS_KO = [
  { icon: Video, text: '스윙 영상 분석 받기', action: 'attach' as const },
  { icon: Calendar, text: '레슨 예약하고 싶어요' },
  { icon: TrendingUp, text: '내 최근 레슨 정리해줘' },
  { icon: Target, text: '오늘 연습 뭐 해야 해?' },
  { icon: Dumbbell, text: '드라이버 거리 늘리는 방법' },
  { icon: ListChecks, text: '코치님 피드백 요약해줘' },
  { icon: HelpCircle, text: '퍼팅 잘하는 팁 알려줘' },
];

const SUGGESTED_PROMPTS_EN = [
  { icon: Video, text: 'Analyse my swing video', action: 'attach' as const },
  { icon: Calendar, text: 'I want to book a lesson' },
  { icon: TrendingUp, text: 'Summarize my recent lessons' },
  { icon: Target, text: "What should I practice today?" },
  { icon: Dumbbell, text: 'How to improve driver distance?' },
  { icon: ListChecks, text: "Summarize my coach's feedback" },
  { icon: HelpCircle, text: 'Tips for better putting' },
];

const SUGGESTED_PROMPTS_JA = [
  { icon: Video, text: 'スイング動画を分析してほしい', action: 'attach' as const },
  { icon: Calendar, text: 'レッスンを予約したい' },
  { icon: TrendingUp, text: '最近のレッスンをまとめて' },
  { icon: Target, text: '今日の練習は何をすべき？' },
  { icon: Dumbbell, text: 'ドライバーの飛距離を伸ばす方法' },
  { icon: ListChecks, text: 'コーチのフィードバックをまとめて' },
  { icon: HelpCircle, text: 'パッティングのコツを教えて' },
];

const INITIAL_QUERY_DELAY_MS = 400;

const BOOKING_KEYWORDS_KO = ['예약', '레슨 예약', '신청', '예약하고 싶', '예약 가능', '스케줄', '시간 있어', '빈 시간', '예약할게', '레슨 잡'];
const BOOKING_KEYWORDS_EN = ['book', 'reservation', 'schedule', 'available slot', 'lesson time', 'book a lesson', 'reserve'];
const BOOKING_KEYWORDS_JA = ['予約', 'レッスン予約', '申し込み', '予約したい', 'スケジュール', '空き時間'];

function isBookingIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    BOOKING_KEYWORDS_KO.some(k => lower.includes(k)) ||
    BOOKING_KEYWORDS_EN.some(k => lower.includes(k)) ||
    BOOKING_KEYWORDS_JA.some(k => lower.includes(k))
  );
}

function formatSlotDate(isoStr: string, language: 'ko' | 'en' | 'ja'): string {
  const d = new Date(isoStr);
  const days_ko = ['일', '월', '화', '수', '목', '금', '토'];
  const days_en = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days_ja = ['日', '月', '火', '水', '木', '金', '土'];
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const dow = d.getDay();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');

  if (language === 'en') {
    return `${days_en[dow]} ${month}/${day} ${hh}:${mm}`;
  } else if (language === 'ja') {
    return `${month}月${day}日(${days_ja[dow]}) ${hh}:${mm}`;
  } else {
    return `${month}월 ${day}일(${days_ko[dow]}) ${hh}:${mm}`;
  }
}

function formatSlotRange(start: string, end: string, language: 'ko' | 'en' | 'ja'): string {
  const e = new Date(end);
  const dateStr = formatSlotDate(start, language);
  const endHH = String(e.getHours()).padStart(2, '0');
  const endMM = String(e.getMinutes()).padStart(2, '0');
  return `${dateStr} ~ ${endHH}:${endMM}`;
}

export const StudentAIChat: React.FC<StudentAIChatProps> = ({
  clientProfile,
  myLessons,
  homeworkList,
  quickLogs = [],
  coachProfile,
  onBack,
  initialQuery,
  initialGreeting,
  defaultMode = 'voice',
  hideModeSelector = false,
  hideBackButton = false,
  headerLeftSlot,
  topBannerSlot,
  reserveBottomNav = false,
  onSaveLesson,
}) => {
  const { language, t } = useLanguage();
  const lang = (language as 'ko' | 'en' | 'ja') ?? 'ko';

  const fallbackGreeting = language === 'en'
    ? `Hi **${clientProfile.name}**! I'm **CoachX AI**, your personal golf assistant. I've reviewed your **${myLessons.length} lesson records**. What can I help you with today? 🏌️`
    : language === 'ja'
    ? `こんにちは、**${clientProfile.name}**さん！私は**CoachX AI**、あなた専用のゴルフアシスタントです。**${myLessons.length}件のレッスン記録**を確認しました。今日は何でもお気軽にどうぞ！ 🏌️`
    : `안녕하세요, **${clientProfile.name}**님! 저는 **CoachX AI**예요. ${myLessons.length}개의 레슨 기록을 바탕으로 맞춤 조언을 드릴게요. 말씀하시거나 타이핑으로 물어보세요! 🏌️`;

  const greeting = initialGreeting ?? fallbackGreeting;

  const clientId = `${clientProfile.name}_${clientProfile.phone}`.trim();

  /**
   * Whether anything the student files here can actually reach a coach.
   * The server stamps an upload's coach_id from `clients.coach_id`, so with
   * no linked coach the record is saved but seen by nobody. Same signal the
   * booking flow gates on.
   */
  const hasCoach = !!coachProfile?.id;

  const [mode, setMode] = useState<Mode>(defaultMode);
  const [showModeSelector, setShowModeSelector] = useState<boolean>(
    hideModeSelector ? false : !initialQuery
  );

  // The transcript is restored from localStorage on mount so leaving the app
  // (or the OS evicting the WebView while it sits in the background) no longer
  // wipes the conversation. Only when there is nothing to restore do we seed
  // the greeting. Computed lazily — `loadChatHistory` never throws.
  const restoredRef = useRef<CoachXChatMessage[] | null>(null);
  if (restoredRef.current === null) {
    restoredRef.current = loadChatHistory(clientId);
  }
  const [messages, setMessages] = useState<CoachXChatMessage[]>(() =>
    restoredRef.current && restoredRef.current.length > 0
      ? restoredRef.current
      : [{ role: 'assistant', content: greeting, timestamp: Date.now() }]
  );
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);

  // Booking state
  const [bookingStep, setBookingStep] = useState<BookingStep>('idle');
  const [availableSlots, setAvailableSlots] = useState<LessonReservation[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<LessonReservation | null>(null);
  const [bookingNotes, setBookingNotes] = useState('');

  // Attachment state
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);
  /** Kept so the AI call can read the bytes after the transcript entry exists. */
  const pendingFileRef = useRef<File | null>(null);

  const suggestedPrompts =
    language === 'en' ? SUGGESTED_PROMPTS_EN
    : language === 'ja' ? SUGGESTED_PROMPTS_JA
    : SUGGESTED_PROMPTS_KO;

  const { revealedChars, startReveal, clearReveal } = useTypingReveal(2000);
  const { isSpeaking, speak, stopSpeaking } = useTextToSpeech(language, ttsEnabled && mode === 'voice');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, revealedChars, bookingStep]);

  // ── Transcript persistence ─────────────────────────────────────────────────

  const hasRestoredHistory = (restoredRef.current?.length ?? 0) > 0;

  // Write through on every change. localStorage writes are synchronous, so the
  // transcript is already on disk by the time the OS suspends or kills the
  // WebView — there is no flush to miss on backgrounding.
  useEffect(() => {
    if (messages.length <= 1) return; // greeting only — nothing worth keeping
    saveChatHistory(clientId, messages);
  }, [messages, clientId]);

  // New device / reinstalled app: the local store is empty but the server may
  // hold this student's transcript (Phase 1 server promotion). Hydrate once,
  // and only while the greeting is still the only message so an in-progress
  // conversation is never clobbered.
  useEffect(() => {
    if (hasRestoredHistory) return;
    let cancelled = false;
    hydrateChatHistoryFromServer(clientId).then((restored) => {
      if (cancelled || !restored || restored.length === 0) return;
      restoredRef.current = restored;
      setMessages((prev) => (prev.length <= 1 ? restored : prev));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // The AI Home resolves its context-aware greeting asynchronously, so the
  // first render seeds a placeholder. Refresh it while it is still the only
  // message; once a real turn exists (or a transcript was restored) the
  // greeting is history and must never be rewritten.
  useEffect(() => {
    if (hasRestoredHistory) return;
    setMessages(prev => {
      if (prev.length !== 1 || prev[0].role !== 'assistant') return prev;
      if (prev[0].content === greeting) return prev;
      return [{ ...prev[0], content: greeting }];
    });
  }, [greeting, hasRestoredHistory]);

  const addAssistantMessage = useCallback((content: string, doSpeak = false) => {
    setMessages(prev => [...prev, { role: 'assistant', content, timestamp: Date.now() }]);
    if (doSpeak) speak(content);
    startReveal(content);
  }, [speak, startReveal]);

  // ── Booking flow ───────────────────────────────────────────────────────────

  const startBookingFlow = useCallback(async () => {
    if (!coachProfile?.id) {
      const noCoachMsg = lang === 'en'
        ? 'To book a lesson, you need a designated coach. Please connect with a coach first in your profile settings.'
        : lang === 'ja'
        ? 'レッスンを予約するには担当コーチが必要です。プロフィール設定でコーチと接続してください。'
        : '레슨 예약을 하려면 담당 코치가 필요해요. 프로필 설정에서 코치를 먼저 지정해 주세요.';
      addAssistantMessage(noCoachMsg, true);
      return;
    }

    setBookingStep('loading-slots');

    const loadingMsg = lang === 'en'
      ? `I'll help you book a lesson! Checking **${coachProfile.name}** coach's available slots...`
      : lang === 'ja'
      ? `レッスン予約をお手伝いします！**${coachProfile.name}**コーチの空き時間を確認しています...`
      : `레슨 예약을 도와드릴게요! **${coachProfile.name}** 코치님의 예약 가능한 시간을 확인하고 있어요...`;
    addAssistantMessage(loadingMsg, false);

    try {
      const now = new Date().toISOString();
      const slots = await reservationService.getAvailableSlots(coachProfile.id, now);

      if (slots.length === 0) {
        const noSlotsMsg = lang === 'en'
          ? `Sorry, **${coachProfile.name}** coach doesn't have any available slots right now. Please try again later or contact your coach directly.`
          : lang === 'ja'
          ? `申し訳ありません、**${coachProfile.name}**コーチは現在空き時間がありません。後でもう一度お試しいただくか、コーチに直接ご連絡ください。`
          : `죄송해요, **${coachProfile.name}** 코치님의 현재 예약 가능한 시간이 없어요. 나중에 다시 시도하거나 코치님께 직접 연락해 주세요.`;
        addAssistantMessage(noSlotsMsg, true);
        setBookingStep('idle');
        return;
      }

      setAvailableSlots(slots);
      setBookingStep('slot-selection');

      const slotsMsg = lang === 'en'
        ? `Found **${slots.length} available slots**! Please select your preferred time below. 👇`
        : lang === 'ja'
        ? `**${slots.length}件の空き時間**が見つかりました！以下から希望の時間を選んでください。👇`
        : `**${slots.length}개**의 예약 가능한 시간을 찾았어요! 아래에서 원하는 시간을 선택해 주세요. 👇`;
      addAssistantMessage(slotsMsg, true);
    } catch {
      const errMsg = lang === 'en'
        ? 'Failed to load available slots. Please try again.'
        : lang === 'ja'
        ? '空き時間の取得に失敗しました。もう一度お試しください。'
        : '예약 가능한 시간을 불러오는 데 실패했어요. 다시 시도해 주세요.';
      addAssistantMessage(errMsg, true);
      setBookingStep('idle');
    }
  }, [coachProfile, lang, addAssistantMessage]);

  const handleSlotSelect = useCallback((slot: LessonReservation) => {
    setSelectedSlot(slot);
    setBookingStep('confirming');
  }, []);

  const handleBookingConfirm = useCallback(async () => {
    if (!selectedSlot) return;
    setBookingStep('booking');

    try {
      await reservationService.requestReservation(
        selectedSlot.id,
        clientId,
        clientProfile.name,
        clientProfile.phone,
        bookingNotes || undefined
      );

      const successMsg = lang === 'en'
        ? `🎉 Your lesson has been **successfully requested**!\n\n**Date & Time:** ${formatSlotRange(selectedSlot.startTime, selectedSlot.endTime, lang)}\n**Coach:** ${coachProfile?.name ?? ''}\n\nYour coach will confirm the booking soon. You can check your reservation status in the reservation section.`
        : lang === 'ja'
        ? `🎉 レッスンが**正常にリクエスト**されました！\n\n**日時:** ${formatSlotRange(selectedSlot.startTime, selectedSlot.endTime, lang)}\n**コーチ:** ${coachProfile?.name ?? ''}\n\nコーチが間もなく予約を確認します。予約セクションで予約状況を確認できます。`
        : `🎉 레슨이 **성공적으로 신청**되었어요!\n\n**일시:** ${formatSlotRange(selectedSlot.startTime, selectedSlot.endTime, lang)}\n**코치:** ${coachProfile?.name ?? ''}\n\n코치님께서 곧 예약을 확인하실 거예요. 예약 내역에서 상태를 확인할 수 있어요.`;

      addAssistantMessage(successMsg, true);
    } catch {
      const errMsg = lang === 'en'
        ? `Sorry, the booking failed. The slot may already be taken. Please select another time.`
        : lang === 'ja'
        ? `申し訳ありません、予約に失敗しました。その時間帯はすでに予約済みかもしれません。別の時間を選んでください。`
        : `죄송해요, 예약에 실패했어요. 해당 시간이 이미 예약됐을 수 있어요. 다른 시간을 선택해 주세요.`;
      addAssistantMessage(errMsg, true);
    }

    setBookingStep('idle');
    setSelectedSlot(null);
    setBookingNotes('');
  }, [selectedSlot, clientId, clientProfile, bookingNotes, lang, coachProfile, addAssistantMessage]);

  const handleBookingCancel = useCallback(() => {
    if (bookingStep === 'confirming') {
      setSelectedSlot(null);
      setBookingStep('slot-selection');
    } else {
      setBookingStep('idle');
      setAvailableSlots([]);
      setSelectedSlot(null);
      setBookingNotes('');
    }
  }, [bookingStep]);

  // ── Chat send ──────────────────────────────────────────────────────────────

  /**
   * Ask the AI for a reply to `msgText`. `priorHistory` is the transcript as it
   * stood *before* that message. Split out of `handleSend` so a request that
   * was cut short — the app backgrounded mid-answer and the WebView reclaimed —
   * can be replayed from the restored transcript on the next launch.
   */
  const requestAssistantReply = useCallback(async (
    msgText: string,
    priorHistory: CoachXChatMessage[],
    media: { blob: Blob; mimeType: string }[] = [],
  ) => {
    setIsTyping(true);
    const historyForAI = priorHistory.map(m => ({ role: m.role, content: m.content }));

    try {
      const reply = await generateStudentChatResponse(
        msgText, myLessons, clientProfile, homeworkList, lang, coachProfile, quickLogs, historyForAI,
        media
      );
      setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: Date.now() }]);
      speak(reply);
      startReveal(reply);
    } catch {
      const errMsg = lang === 'en'
        ? "Sorry, I couldn't get a reply just now. Please try asking again."
        : lang === 'ja'
        ? '申し訳ありません、回答を取得できませんでした。もう一度お試しください。'
        : '죄송해요, 답변을 가져오지 못했어요. 다시 한번 물어봐 주세요.';
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg, timestamp: Date.now() }]);
    } finally {
      setIsTyping(false);
    }
  }, [myLessons, clientProfile, homeworkList, lang, coachProfile, quickLogs, speak, startReveal]);

  const handleSend = async (text?: string) => {
    const msgText = (text ?? input).trim();
    if (!msgText) return;

    clearReveal();
    stopSpeaking();

    const priorHistory = messages;
    const userMsg: CoachXChatMessage = { role: 'user', content: msgText, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    if (isBookingIntent(msgText)) {
      await startBookingFlow();
      return;
    }

    await requestAssistantReply(msgText, priorHistory);
  };

  // ── Attachments ────────────────────────────────────────────────────────────

  const clearPending = useCallback(() => {
    setPending(prev => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    pendingFileRef.current = null;
  }, []);

  // An object URL outlives the component unless it is revoked, so a student
  // who leaves the tab mid-upload doesn't leak the whole clip.
  useEffect(() => () => {
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    // Cleanup only — re-running on every `pending` change would revoke the
    // URL the current preview is still displaying.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startUpload = useCallback(async (attachment: PendingAttachment) => {
    setPending({ ...attachment, stage: 'uploading', error: undefined });
    try {
      const url = await apiService.uploadChatAttachment(attachment.file, attachment.id);
      setPending(prev => (prev && prev.id === attachment.id
        ? { ...prev, stage: 'ready', url }
        : prev));
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setPending(prev => (prev && prev.id === attachment.id
        ? { ...prev, stage: 'error', error: message }
        : prev));
    }
  }, []);

  const handleFilePicked = useCallback((file: File | undefined | null) => {
    setAttachSheetOpen(false);
    setAttachError(null);
    if (!file) return;

    const type = attachmentTypeOf(file.type);
    if (!type) {
      setAttachError(lang === 'en'
        ? 'Only videos and photos can be sent here.'
        : lang === 'ja'
        ? 'ここに送れるのは動画と写真だけです。'
        : '여기에는 영상과 사진만 보낼 수 있어요.');
      return;
    }
    const cap = MAX_UPLOAD_BYTES[type];
    if (file.size > cap) {
      setAttachError(lang === 'en'
        ? `That file is ${formatBytes(file.size)} — the limit is ${formatBytes(cap)}. Try trimming the clip to just the swing.`
        : lang === 'ja'
        ? `このファイルは${formatBytes(file.size)}で、上限は${formatBytes(cap)}です。スイング部分だけ切り取って送ってください。`
        : `파일이 ${formatBytes(file.size)}인데 최대 ${formatBytes(cap)}까지 보낼 수 있어요. 스윙 부분만 잘라서 보내주세요.`);
      return;
    }

    // Replacing an in-flight pick drops the previous preview URL with it.
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    pendingFileRef.current = file;
    void startUpload({
      id: newAttachmentId(),
      file,
      type,
      previewUrl: URL.createObjectURL(file),
      stage: 'uploading',
    });
  }, [lang, pending, startUpload]);

  const handleCancelPending = useCallback(() => {
    clearPending();
    setAttachError(null);
  }, [clearPending]);

  /**
   * Commit the uploaded file to the transcript and act on where the student
   * filed it. The record row is only written now — never at upload time — so
   * a cancelled or failed attachment can't leave an empty lesson behind.
   */
  const handleDestination = useCallback(async (destination: ChatAttachmentDestination) => {
    if (!pending || pending.stage !== 'ready' || !pending.url) return;

    const file = pendingFileRef.current;
    const attachment: ChatAttachment = {
      id: pending.id,
      url: pending.url,
      type: pending.type,
      name: pending.file.name,
      size: pending.file.size,
      mimeType: pending.file.type,
      destination,
    };
    const caption = input.trim();

    clearReveal();
    stopSpeaking();

    const priorHistory = messages;
    const userMsg: CoachXChatMessage = {
      role: 'user',
      content: caption,
      timestamp: Date.now(),
      attachments: [attachment],
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    clearPending();

    let savedRecord = false;
    if ((destination === 'practice' || destination === 'reservation') && onSaveLesson) {
      const now = Date.now();
      const ext = (pending.file.type.split('/')[1] || 'bin').split(';')[0]
        .replace(/[^a-z0-9]/gi, '').toLowerCase();
      const lesson: Lesson = {
        id: pending.id,
        clientId,
        clientName: clientProfile.name,
        clientPhone: clientProfile.phone,
        coachId: clientProfile.coachId,
        createdBy: 'CLIENT',
        recordType: 'PRACTICE',
        date: new Date(now).toISOString().slice(0, 10),
        title: caption || (pending.type === 'image' ? '연습 사진' : '연습 영상'),
        videoUrl: attachment.url,
        videoKey: `lessons/${pending.id}/main.${ext}`,
        mediaType: pending.type,
        coachNotes: '',
        tags: ['practice', 'chat'],
        createdAt: now,
      };
      try {
        await onSaveLesson(lesson);
        savedRecord = true;
      } catch {
        savedRecord = false;
      }
    }

    // The server files a student upload under their linked coach
    // (`clients.coach_id`), so an unlinked student's record reaches nobody.
    // Say that plainly instead of promising a delivery that will not happen.
    const savedLabel = savedRecord
      ? hasCoach
        ? (lang === 'en'
            ? '\n\n(Saved to my records and shared with my coach.)'
            : lang === 'ja'
            ? '\n\n(記録に保存し、コーチに共有しました。)'
            : '\n\n(기록에 저장했고 코치님께 공유했어요.)')
        : (lang === 'en'
            ? '\n\n(Saved to my records. No coach is linked yet, so nobody else can see it.)'
            : lang === 'ja'
            ? '\n\n(記録に保存しました。担当コーチが未設定のため、まだ誰にも共有されていません。)'
            : '\n\n(기록에 저장했어요. 지정 코치가 없어서 아직 아무에게도 공유되지 않았어요.)')
      : destination === 'none'
        ? ''
        : (lang === 'en'
            ? '\n\n(Could not save this to my records.)'
            : lang === 'ja'
            ? '\n\n(記録への保存に失敗しました。)'
            : '\n\n(기록 저장에 실패했어요.)');

    const promptText = (caption ||
      (lang === 'en'
        ? 'I sent a file — please take a look.'
        : lang === 'ja'
        ? 'ファイルを送りました。見てください。'
        : '파일을 보냈어요. 봐주세요.')) + savedLabel;

    // The reservation route files the record first so the coach has something
    // to open, then hands off to the existing booking flow with the note
    // pre-filled — the chat has no other way to reach a reservation.
    if (destination === 'reservation') {
      setBookingNotes(lang === 'en'
        ? 'I sent a clip in the chat — please take a look before the lesson.'
        : lang === 'ja'
        ? 'チャットで動画を送りました。レッスン前にご確認ください。'
        : '채팅으로 영상을 보냈어요. 레슨 전에 봐주세요.');
      await startBookingFlow();
      return;
    }

    const media = file && file.size <= MAX_UPLOAD_BYTES[pending.type]
      ? [{ blob: file, mimeType: file.type }]
      : [];
    await requestAssistantReply(promptText, priorHistory, media);
  }, [
    pending, input, messages, clientId, clientProfile, lang, onSaveLesson, hasCoach,
    clearReveal, stopSpeaking, clearPending, requestAssistantReply, startBookingFlow,
  ]);

  // ── Voice STT ──────────────────────────────────────────────────────────────

  const {
    isListening,
    voiceError,
    permissionDenied: micPermissionDenied,
    dismissPermissionDenied: dismissMicPermissionDenied,
    stopListening,
    toggleListening,
  } = useSpeechRecognition({
    language,
    onResult: handleSend,
  });

  useEffect(() => {
    // A restored transcript already contains the answer to the entry-point
    // query (or the resume effect below is about to fetch it) — re-sending it
    // would duplicate the turn on every relaunch.
    if (!initialQuery || hasRestoredHistory) return;
    const timer = setTimeout(() => { void handleSend(initialQuery); }, INITIAL_QUERY_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A restored transcript ending on a user turn means the app went away before
  // the reply landed. Pick the request back up rather than leaving the student
  // staring at their own unanswered question.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current) return;
    const restored = restoredRef.current ?? [];
    const last = restored[restored.length - 1];
    if (!last || last.role !== 'user') return;

    resumedRef.current = true;
    if (isBookingIntent(last.content)) {
      void startBookingFlow();
      return;
    }
    void requestAssistantReply(last.content, restored.slice(0, -1));
  }, [requestAssistantReply, startBookingFlow]);

  const switchMode = useCallback((newMode: Mode) => {
    if (newMode === 'chat') {
      stopListening();
      stopSpeaking();
    }
    setMode(newMode);
  }, [stopListening, stopSpeaking]);

  const handleModeSelect = useCallback((newMode: Mode) => {
    switchMode(newMode);
    setShowModeSelector(false);
  }, [switchMode]);

  /**
   * Wipe the stored transcript and start over. Now that history survives app
   * restarts this is the only way back to a clean thread, so it asks first.
   */
  const handleNewConversation = useCallback(() => {
    const confirmText = lang === 'en'
      ? 'Start a new conversation? The current chat history will be deleted.'
      : lang === 'ja'
      ? '新しい会話を始めますか？現在のチャット履歴は削除されます。'
      : '새 대화를 시작할까요? 지금까지의 대화 내용은 삭제돼요.';
    if (typeof window !== 'undefined' && !window.confirm(confirmText)) return;

    clearReveal();
    stopSpeaking();
    stopListening();
    clearChatHistory(clientId);

    // Nothing left to restore or resume on this mount.
    restoredRef.current = [];
    resumedRef.current = true;

    setMessages([{ role: 'assistant', content: greeting, timestamp: Date.now() }]);
    setInput('');
    setIsTyping(false);
    clearPending();
    setAttachError(null);
    setAttachSheetOpen(false);
    setBookingStep('idle');
    setAvailableSlots([]);
    setSelectedSlot(null);
    setBookingNotes('');
  }, [lang, clearReveal, stopSpeaking, stopListening, clientId, greeting, clearPending]);

  // ── Render helpers ─────────────────────────────────────────────────────────

  const voiceButtonLabel = language === 'en'
    ? (isListening ? 'Stop listening' : 'Tap to speak')
    : language === 'ja'
    ? (isListening ? '停止' : 'タップして話す')
    : (isListening ? '듣는 중... (탭하여 중지)' : '마이크를 탭해서 말하세요');

  const placeholderText = language === 'en'
    ? 'Ask CoachX AI anything...'
    : language === 'ja'
    ? 'CoachX AIに何でも聞いてください...'
    : '골프 질문을 입력하세요...';

  // ── Booking UI panels ──────────────────────────────────────────────────────

  const renderSlotSelection = () => (
    <div className="flex-shrink-0 mx-4 mb-3 bg-white/[0.10] border border-emerald-500/30 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-emerald-900/40 border-b border-emerald-500/20">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-300" />
          <span className="text-sm font-bold text-emerald-200">
            {lang === 'en' ? 'Available Slots' : lang === 'ja' ? '空き時間' : '예약 가능한 시간'}
          </span>
          <span className="bg-emerald-600/60 text-emerald-100 text-xs px-2 py-0.5 rounded-full">
            {availableSlots.length}
          </span>
        </div>
        <button
          onClick={handleBookingCancel}
          className="text-ink-muted hover:text-white transition-colors"
          aria-label="닫기"
        >
          <XCircle className="w-4 h-4" />
        </button>
      </div>
      <div className="max-h-60 overflow-y-auto p-3 space-y-2">
        {availableSlots.map(slot => (
          <button
            key={slot.id}
            onClick={() => handleSlotSelect(slot)}
            className="w-full flex items-center gap-3 px-4 py-3 bg-white/[0.05] hover:bg-emerald-900/40 border border-white/10 hover:border-emerald-400/40 rounded-xl transition-all text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-600/40 transition-colors">
              <Clock className="w-4 h-4 text-emerald-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">
                {formatSlotRange(slot.startTime, slot.endTime, lang)}
              </p>
              {slot.lessonType && (
                <p className="text-xs text-ink-muted mt-0.5">{slot.lessonType}</p>
              )}
            </div>
            <ChevronLeft className="w-4 h-4 text-emerald-400 rotate-180 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </div>
    </div>
  );

  const renderConfirmation = () => {
    if (!selectedSlot) return null;
    return (
      <div className="flex-shrink-0 mx-4 mb-3 bg-white/[0.10] border border-emerald-500/30 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-900/30 border-b border-emerald-500/20">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-bold text-emerald-200">
            {lang === 'en' ? 'Confirm Booking' : lang === 'ja' ? '予約確認' : '예약 확인'}
          </span>
        </div>
        <div className="p-4 space-y-3">
          <div className="bg-base/60 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span className="text-ink-muted font-medium">
                {formatSlotRange(selectedSlot.startTime, selectedSlot.endTime, lang)}
              </span>
            </div>
            {coachProfile && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-ink-muted text-xs">
                  {lang === 'en' ? 'Coach' : lang === 'ja' ? 'コーチ' : '코치'}:
                </span>
                <span className="text-ink-high font-medium">{coachProfile.name}</span>
              </div>
            )}
            {selectedSlot.lessonType && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-ink-muted text-xs">
                  {lang === 'en' ? 'Type' : lang === 'ja' ? '種類' : '종류'}:
                </span>
                <span className="text-ink-high">{selectedSlot.lessonType}</span>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-ink-muted mb-1.5 block">
              {lang === 'en' ? 'Message to coach (optional)' : lang === 'ja' ? 'コーチへのメッセージ（任意）' : '코치님께 전달할 메시지 (선택)'}
            </label>
            <textarea
              value={bookingNotes}
              onChange={e => setBookingNotes(e.target.value)}
              placeholder={lang === 'en' ? 'e.g. First lesson, working on driver...' : lang === 'ja' ? '例: 初レッスンです、ドライバーを練習したい...' : '예: 처음 레슨이에요, 드라이버 연습하고 싶어요...'}
              rows={2}
              className="w-full bg-base border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-emerald-500 resize-none"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleBookingCancel}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-ink-muted text-sm font-medium hover:bg-white/[0.04]/5 transition-colors"
            >
              {lang === 'en' ? 'Back' : lang === 'ja' ? '戻る' : '다시 선택'}
            </button>
            <button
              onClick={() => void handleBookingConfirm()}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors"
            >
              {lang === 'en' ? 'Confirm Booking' : lang === 'ja' ? '予約する' : '예약 신청하기'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderBookingLoading = () => (
    <div className="flex-shrink-0 mx-4 mb-3 flex items-center justify-center gap-3 py-4 bg-white/[0.10] border border-white/10 rounded-2xl">
      <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
      <span className="text-sm text-emerald-300 font-medium">
        {lang === 'en' ? 'Processing your booking...' : lang === 'ja' ? '予約処理中...' : '예약 처리 중...'}
      </span>
    </div>
  );

  /**
   * Where should this file go? Shown once the upload lands. Saving as a record
   * is the default because it is the only route that reaches the coach; the
   * option is dropped entirely when the host gave us no save handler.
   */
  const renderDestinationCard = () => {
    const options: {
      key: ChatAttachmentDestination;
      icon: React.ComponentType<{ className?: string }>;
      title: string;
      desc: string;
      recommended?: boolean;
    }[] = [];

    if (onSaveLesson) {
      options.push({
        key: 'practice',
        icon: ClipboardList,
        recommended: true,
        title: lang === 'en' ? 'Save to my records' : lang === 'ja' ? '記録に保存' : '기록으로 저장',
        desc: hasCoach
          ? (lang === 'en'
              ? 'Kept in the records tab and shared with your coach'
              : lang === 'ja'
              ? '記録タブに保存され、コーチに共有されます'
              : '기록 탭에 저장되고, 코치님께 전달돼요')
          : (lang === 'en'
              ? 'Kept in the records tab — link a coach to share it'
              : lang === 'ja'
              ? '記録タブに保存されます（共有には担当コーチの設定が必要）'
              : '기록 탭에 저장돼요 (공유하려면 지정 코치가 필요해요)'),
      });
    }
    // Booking needs a coach to book with — offering it without one would
    // only dead-end in startBookingFlow's "지정 코치가 필요해요".
    if (onSaveLesson && hasCoach) {
      options.push({
        key: 'reservation',
        icon: Calendar,
        title: lang === 'en' ? 'Save and book a lesson' : lang === 'ja' ? '保存してレッスン予約' : '저장하고 레슨 예약',
        desc: lang === 'en'
          ? 'Saves the record, then opens booking with a note'
          : lang === 'ja'
          ? '記録を保存し、メモ付きで予約へ進みます'
          : '기록을 저장하고, 메모와 함께 예약으로 이어져요',
      });
    }
    options.push({
      key: 'none',
      icon: Sparkles,
      title: lang === 'en' ? 'Just analyse it' : lang === 'ja' ? '分析だけ' : '저장 없이 AI 분석만',
      desc: lang === 'en'
        ? 'Get feedback without keeping a record'
        : lang === 'ja'
        ? '記録を残さずフィードバックだけ受け取ります'
        : '기록을 남기지 않고 피드백만 받아요',
    });

    return (
      <div className="flex-shrink-0 mx-4 mb-3 bg-white/[0.10] border border-emerald-500/30 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-emerald-900/40 border-b border-emerald-500/20">
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-emerald-300" />
            <span className="text-sm font-bold text-emerald-200">
              {lang === 'en' ? 'Where should this go?' : lang === 'ja' ? '保存先を選択' : '저장 위치 선택'}
            </span>
          </div>
          <button
            onClick={handleCancelPending}
            className="text-ink-muted hover:text-white transition-colors"
            aria-label={lang === 'en' ? 'Cancel' : '취소'}
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 space-y-2">
          {options.map(opt => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.key}
                onClick={() => void handleDestination(opt.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${
                  opt.recommended
                    ? 'bg-emerald-600/15 border border-emerald-500/40 hover:bg-emerald-900/40'
                    : 'bg-white/[0.05] border border-white/10 hover:bg-white/[0.08]'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-600/25 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-emerald-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-white">{opt.title}</span>
                    {opt.recommended && (
                      <span className="text-[10px] font-bold text-emerald-100 bg-emerald-600/60 rounded-full px-2 py-0.5">
                        {lang === 'en' ? 'Best' : lang === 'ja' ? 'おすすめ' : '추천'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-muted mt-0.5">{opt.desc}</p>
                </div>
                <ChevronLeft className="w-4 h-4 text-emerald-400 rotate-180 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const modeSelectorTitle = language === 'en'
    ? 'How would you like to talk with CoachX AI?'
    : language === 'ja'
    ? 'CoachX AIとどのように話しますか？'
    : 'CoachX AI와 어떻게 대화하시겠어요?';

  const modeSelectorSubtitle = language === 'en'
    ? 'Choose your preferred way to interact. You can switch anytime.'
    : language === 'ja'
    ? 'お好みの方法を選んでください。いつでも切り替えられます。'
    : '원하시는 방식을 선택해 주세요. 언제든지 바꿀 수 있어요.';

  const voiceCardLabel = language === 'en' ? 'Voice' : language === 'ja' ? '音声' : '음성';
  const chatCardLabel = language === 'en' ? 'Chat' : language === 'ja' ? 'チャット' : '채팅';

  const voiceCardDesc = language === 'en'
    ? 'Speak naturally and hear responses out loud'
    : language === 'ja'
    ? '自然に話しかけて音声で応答を聞く'
    : '자연스럽게 말하고 음성으로 답변 듣기';

  const chatCardDesc = language === 'en'
    ? 'Type your questions and read the replies'
    : language === 'ja'
    ? '質問を入力して回答を読む'
    : '질문을 입력하고 답변을 읽기';

  // A bare 100dvh column ends exactly at the viewport bottom, which is where
  // the fixed StudentBottomNav paints — so the input row rendered *behind*
  // the tab bar, and padding on the parent could not lift it (it only added
  // scrollable space after the column). Under the nav the column has to be
  // shorter than the viewport instead; `student-nav-viewport` does that.
  const shellHeightClass = reserveBottomNav
    ? 'student-nav-viewport'
    : 'min-h-[100dvh]';

  return (
    <div className={`flex flex-col bg-base text-white ${shellHeightClass}`}>
      <PermissionDeniedModal
        open={micPermissionDenied}
        kind="microphone"
        onClose={dismissMicPermissionDenied}
        onRetry={() => {
          dismissMicPermissionDenied();
          toggleListening();
        }}
      />
      {/* Attach source sheet */}
      {attachSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-label={language === 'en' ? 'Send a file' : '파일 보내기'}
          onClick={() => setAttachSheetOpen(false)}
        >
          <div
            className="w-full max-w-md bg-overlay border-t border-white/10 rounded-t-3xl px-4 pt-2 pb-safe-gutter"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-9 h-1 rounded-full bg-white/20 mx-auto mt-1 mb-3.5" />
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-ink-high">
                {language === 'en' ? 'Send a file' : language === 'ja' ? 'ファイルを送る' : '파일 보내기'}
              </p>
              <button
                onClick={() => setAttachSheetOpen(false)}
                aria-label={language === 'en' ? 'Close' : '닫기'}
                className="text-ink-muted hover:text-white transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center gap-3 p-3 min-h-[56px] bg-white/[0.05] hover:bg-white/[0.10] border border-white/10 rounded-xl transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-600/20 flex items-center justify-center flex-shrink-0">
                  <Camera className="w-4.5 h-4.5 text-emerald-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink-high">
                    {language === 'en' ? 'Take a photo or video' : language === 'ja' ? 'カメラで撮影' : '카메라로 촬영'}
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {language === 'en' ? 'Record your swing right now' : language === 'ja' ? 'スイングをその場で撮影' : '스윙을 바로 찍어서 보내요'}
                  </p>
                </div>
                <ChevronLeft className="w-4 h-4 text-emerald-400 rotate-180 flex-shrink-0" />
              </button>
              <button
                onClick={() => albumInputRef.current?.click()}
                className="flex items-center gap-3 p-3 min-h-[56px] bg-white/[0.05] hover:bg-white/[0.10] border border-white/10 rounded-xl transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-600/20 flex items-center justify-center flex-shrink-0">
                  <ImageIcon className="w-4.5 h-4.5 text-emerald-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink-high">
                    {language === 'en' ? 'Choose from library' : language === 'ja' ? 'アルバムから選択' : '앨범에서 선택'}
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {language === 'en' ? 'Pick a photo or video' : language === 'ja' ? '写真・動画を読み込む' : '사진·영상 불러오기'}
                  </p>
                </div>
                <ChevronLeft className="w-4 h-4 text-emerald-400 rotate-180 flex-shrink-0" />
              </button>
            </div>
            <p className="text-[11px] text-ink-muted text-center mt-3.5">
              {language === 'en'
                ? 'Video up to 500MB · Photo up to 20MB'
                : language === 'ja'
                ? '動画は最大500MB・写真は最大20MB'
                : '영상 최대 500MB · 사진 최대 20MB'}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      {/* gap-2 + the flex-shrink-0 / truncate below keep this row on a single
          line at 360px. Without them "CoachX AI" wrapped one character per
          line, ballooning the header to ~190px and pushing the hamburger
          button far down the screen. */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-base/90 backdrop-blur-sm sticky top-0 z-10 pt-safe">
        {headerLeftSlot ?? (!hideBackButton && (
          <BackButton
            onClick={onBack}
            tone="dark"
            label={t('back')}
            ariaLabel={t('back')}
          />
        ))}

        <div className="relative w-9 h-9 flex items-center justify-center flex-shrink-0">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 student-ai-pulse" />
          <Sparkles className="relative z-10 w-4 h-4 text-white" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-white truncate">CoachX AI</p>
          <p className="text-xs text-emerald-300 truncate">
            {language === 'en' ? 'Your Personal Golf Assistant'
              : language === 'ja' ? 'パーソナルゴルフアシスタント'
              : '내 전담 골프 AI 어시스턴트'}
          </p>
        </div>

        {/* Mode toggle — hidden on the selection screen */}
        {!showModeSelector && (
          <div className="flex items-center gap-1 bg-white/[0.10] rounded-xl p-1 border border-white/10 flex-shrink-0">
            <button
              onClick={() => switchMode('voice')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mode === 'voice' ? 'bg-emerald-600 text-white' : 'text-ink-muted hover:text-ink-high'
              }`}
              aria-label={language === 'en' ? 'Voice mode' : '음성 모드'}
            >
              <Mic className="w-3.5 h-3.5" />
              {/* Icon-only under 420px so the header title keeps room to breathe.
                  aria-label above still names the button for screen readers. */}
              <span className="hidden min-[420px]:inline">
                {language === 'en' ? 'Voice' : language === 'ja' ? '音声' : '음성'}
              </span>
            </button>
            <button
              onClick={() => switchMode('chat')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mode === 'chat' ? 'bg-emerald-600 text-white' : 'text-ink-muted hover:text-ink-high'
              }`}
              aria-label={language === 'en' ? 'Chat mode' : '채팅 모드'}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden min-[420px]:inline">
                {language === 'en' ? 'Chat' : language === 'ja' ? 'チャット' : '채팅'}
              </span>
            </button>
          </div>
        )}

        {/* TTS toggle (voice mode only, not on selector) */}
        {!showModeSelector && mode === 'voice' && (
          <button
            onClick={() => { setTtsEnabled(p => !p); if (ttsEnabled) stopSpeaking(); }}
            className="p-2 rounded-full hover:bg-white/[0.04]/10 transition-colors"
            aria-label={ttsEnabled ? '음성 출력 끄기' : '음성 출력 켜기'}
          >
            {ttsEnabled
              ? <Volume2 className="w-4 h-4 text-emerald-300" />
              : <VolumeX className="w-4 h-4 text-ink-muted" />
            }
          </button>
        )}

        {/* New conversation — the transcript now persists across app restarts,
            so this is the student's way back to a clean thread. Only offered
            once there is something to clear. */}
        {!showModeSelector && messages.length > 1 && (
          <button
            onClick={handleNewConversation}
            className="p-2 rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
            aria-label={language === 'en' ? 'New conversation' : language === 'ja' ? '新しい会話' : '새 대화 시작'}
            title={language === 'en' ? 'New conversation' : language === 'ja' ? '新しい会話' : '새 대화 시작'}
          >
            <RotateCcw className="w-4 h-4 text-ink-muted" />
          </button>
        )}

        {/* Online indicator — the label is dropped on narrow phones so the
            header row still fits; the dot alone carries the state there. */}
        <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="hidden min-[420px]:inline text-xs text-green-400 font-medium">
            {language === 'en' ? 'Online' : language === 'ja' ? 'オンライン' : '온라인'}
          </span>
        </div>
      </div>

      {showModeSelector ? (
        /* ── Mode selection screen ── */
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <div className="relative w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 student-ai-pulse" />
                <Sparkles className="relative z-10 w-7 h-7 text-white" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">{modeSelectorTitle}</h2>
              <p className="text-sm text-ink-muted">{modeSelectorSubtitle}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleModeSelect('voice')}
                className="flex flex-col items-center gap-3 p-5 bg-white/[0.10] hover:bg-emerald-900/40 border border-white/10 hover:border-emerald-400/50 rounded-2xl transition-all active:scale-[0.98] group"
                aria-label={language === 'en' ? 'Choose voice mode' : language === 'ja' ? '音声モードを選択' : '음성 모드 선택'}
              >
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform">
                  <Mic className="w-6 h-6 text-white" />
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-white">{voiceCardLabel}</p>
                  <p className="text-xs text-ink-muted mt-1 leading-snug">{voiceCardDesc}</p>
                </div>
              </button>

              <button
                onClick={() => handleModeSelect('chat')}
                className="flex flex-col items-center gap-3 p-5 bg-white/[0.10] hover:bg-emerald-900/40 border border-white/10 hover:border-emerald-400/50 rounded-2xl transition-all active:scale-[0.98] group"
                aria-label={language === 'en' ? 'Choose chat mode' : language === 'ja' ? 'チャットモードを選択' : '채팅 모드 선택'}
              >
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform">
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-white">{chatCardLabel}</p>
                  <p className="text-xs text-ink-muted mt-1 leading-snug">{chatCardDesc}</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* Messages */}
      {/* min-h-0 lets this pane actually shrink inside the fixed-height
          column — without it a long conversation grows the flex item past
          the column and pushes the input row off-screen instead of
          scrolling here. */}
      <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-4">
        {topBannerSlot ? <div className="mb-2">{topBannerSlot}</div> : null}
        <div className="px-4 space-y-4">
        {messages.map((msg, idx) => {
          const isLastAssistant = msg.role === 'assistant' && idx === messages.length - 1;
          const isRevealing = isLastAssistant && revealedChars !== null;
          const displayContent = isRevealing ? msg.content.slice(0, revealedChars) : msg.content;

          return (
            <div
              key={idx}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl text-sm leading-relaxed overflow-hidden ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-sm'
                    : 'bg-white/[0.10] text-ink-high rounded-bl-sm'
                }`}
              >
                {msg.attachments?.map(att => (
                  <div key={att.id} className="border-b border-white/15">
                    {att.type === 'image' ? (
                      // Through resolveMediaUrl rather than straight into src:
                      // the transcript comes back from localStorage or the
                      // server thread, so a poisoned entry must not be able to
                      // put a data:/javascript: URL in front of the student.
                      <img
                        src={resolveMediaUrl(att.url)}
                        alt={att.name || '첨부 이미지'}
                        className="block w-full max-h-56 object-cover"
                      />
                    ) : (
                      <div className="flex items-center gap-2.5 px-4 py-3">
                        <div className="w-9 h-9 rounded-lg bg-black/25 flex items-center justify-center flex-shrink-0">
                          {att.type === 'video'
                            ? <Play className="w-4 h-4" />
                            : <Mic className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold truncate">{att.name || att.type}</p>
                          <p className="text-[11px] opacity-70">{formatBytes(att.size)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {(displayContent || !msg.attachments) && (
                  <div className="px-4 py-3">
                    {renderMarkdown(displayContent)}
                    {isRevealing && (
                      <span className="student-ai-cursor inline-block w-0.5 h-3.5 bg-emerald-400 ml-0.5 align-text-bottom" />
                    )}
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MessageCircle className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
          );
        })}

        {/* In-flight attachment — lives outside `messages` so a cancelled or
            failed upload never reaches the persisted transcript. */}
        {pending && (
          <div className="flex gap-3 justify-end">
            <div className="w-[230px] rounded-2xl rounded-br-sm overflow-hidden border border-white/10 bg-white/[0.06]">
              {pending.type === 'image' ? (
                <img
                  src={pending.previewUrl}
                  alt={pending.file.name}
                  className="block w-full h-32 object-cover"
                />
              ) : (
                <div className="w-full h-32 bg-black/40 flex items-center justify-center">
                  <Video className="w-7 h-7 text-white/70" />
                </div>
              )}
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  {pending.stage === 'error'
                    ? <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    : pending.stage === 'ready'
                    ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    : <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin flex-shrink-0" />}
                  <span className="flex-1 min-w-0 text-xs text-white truncate">{pending.file.name}</span>
                  {pending.stage !== 'uploading' && (
                    <button
                      onClick={handleCancelPending}
                      aria-label={lang === 'en' ? 'Remove attachment' : '첨부 취소'}
                      className="text-ink-muted hover:text-white transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-medium ${
                    pending.stage === 'error' ? 'text-red-300' : 'text-emerald-300'
                  }`}>
                    {pending.stage === 'uploading'
                      ? (lang === 'en' ? 'Uploading…' : lang === 'ja' ? 'アップロード中…' : '업로드 중…')
                      : pending.stage === 'ready'
                      ? (lang === 'en' ? 'Sent' : lang === 'ja' ? '送信済み' : '전송됨')
                      : (lang === 'en' ? 'Failed' : lang === 'ja' ? '失敗' : '실패')}
                  </span>
                  <span className="text-[11px] text-ink-muted">{formatBytes(pending.file.size)}</span>
                </div>
                {pending.stage === 'uploading' && (
                  <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-1 w-1/3 rounded-full bg-emerald-500 student-ai-indeterminate" />
                  </div>
                )}
                {pending.stage === 'error' && (
                  <button
                    onClick={() => void startUpload(pending)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {lang === 'en' ? 'Retry' : lang === 'ja' ? '再試行' : '재시도'}
                  </button>
                )}
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center flex-shrink-0 mt-0.5">
              <MessageCircle className="w-4 h-4 text-white" />
            </div>
          </div>
        )}

        {isTyping && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white/[0.10] rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1.5 items-center h-4">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-emerald-400"
                    style={{ animation: `student-ai-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Suggested prompts — shown only initially */}
        {messages.length <= 1 && bookingStep === 'idle' && (
          <div className="pt-2">
            <p className="text-xs text-ink-muted mb-2">
              {language === 'en' ? 'Try asking...' : language === 'ja' ? 'こんな質問はいかがですか？' : '이런 것도 물어볼 수 있어요'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {suggestedPrompts.map((prompt, i) => {
                const Icon = prompt.icon;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if ('action' in prompt && prompt.action === 'attach') {
                        setAttachSheetOpen(true);
                        return;
                      }
                      void handleSend(prompt.text);
                    }}
                    className={`flex items-center gap-2 text-xs rounded-xl px-3 py-2.5 transition-colors text-left ${
                      'action' in prompt && prompt.action === 'attach'
                        ? 'bg-white/[0.10] border border-emerald-500/40 text-ink-high'
                        : 'bg-white/[0.10] hover:bg-white/[0.08] border border-white/10 text-ink-muted hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <span className="flex-1">{prompt.text}</span>
                    {'action' in prompt && prompt.action === 'attach' && (
                      <span className="text-[9px] font-bold text-emerald-400 tracking-wide">NEW</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
        </div>
      </div>

      {/* Booking slot loading indicator */}
      {bookingStep === 'loading-slots' && (
        <div className="flex-shrink-0 mx-4 mb-3 flex items-center gap-3 py-3 px-4 bg-emerald-900/30 border border-emerald-500/20 rounded-2xl">
          <Loader2 className="w-4 h-4 text-emerald-400 animate-spin flex-shrink-0" />
          <span className="text-sm text-emerald-300">
            {lang === 'en' ? 'Loading available slots...' : lang === 'ja' ? '空き時間を読み込み中...' : '예약 가능한 시간 불러오는 중...'}
          </span>
        </div>
      )}

      {pending?.stage === 'ready' && bookingStep === 'idle' && renderDestinationCard()}

      {attachError && (
        <div className="flex-shrink-0 mx-4 mb-2 px-3 py-2 bg-red-900/40 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1">{attachError}</span>
          <button onClick={() => setAttachError(null)} aria-label="닫기">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {bookingStep === 'slot-selection' && renderSlotSelection()}
      {bookingStep === 'confirming' && renderConfirmation()}
      {bookingStep === 'booking' && renderBookingLoading()}

      {/* Voice error */}
      {voiceError && (
        <div className="flex-shrink-0 mx-4 mb-2 px-3 py-2 bg-red-900/40 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {voiceError}
        </div>
      )}

      {/* Input bar.
          `pb-safe pb-4` did not do what it reads like: `.pb-safe` is unlayered
          CSS and beats Tailwind's layered `pb-4` outright, so the gutter
          collapsed to the raw inset — 0px wherever the platform reports none.
          Under the nav the bar needs no inset at all (the nav below owns it);
          standalone it needs gutter + inset, which `pb-safe-gutter` adds. */}
      <div
        className={`flex-shrink-0 px-4 pt-3 border-t border-white/10 bg-base/90 backdrop-blur-sm ${
          reserveBottomNav ? 'pb-4' : 'pb-safe-gutter'
        }`}
      >
        {mode === 'chat' ? (
          <div className="flex gap-2 items-end">
            {/* Two inputs rather than one: `capture` is what opens the camera
                straight away on mobile, and it can't be toggled per-tap on a
                single element. */}
            <input
              ref={cameraInputRef}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              capture="environment"
              className="hidden"
              onChange={e => { handleFilePicked(e.target.files?.[0]); e.target.value = ''; }}
            />
            <input
              ref={albumInputRef}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              className="hidden"
              onChange={e => { handleFilePicked(e.target.files?.[0]); e.target.value = ''; }}
            />
            <button
              onClick={() => setAttachSheetOpen(true)}
              disabled={!!pending}
              aria-label={language === 'en' ? 'Attach a file' : language === 'ja' ? 'ファイルを添付' : '파일 첨부'}
              className="w-11 h-11 rounded-full bg-white/[0.10] border border-white/10 hover:bg-white/[0.16] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
            >
              <Paperclip className="w-4 h-4 text-ink-medium" />
            </button>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
              placeholder={placeholderText}
              className="flex-1 bg-white/[0.10] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
            />
            <button
              onClick={() => void handleSend()}
              disabled={!input.trim() || isTyping || revealedChars !== null}
              aria-label="Send"
              className="w-11 h-11 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        ) : (
          /* Voice mode UI */
          <div className="flex flex-col items-center gap-3 py-2">
            {/* Speaking indicator */}
            {isSpeaking && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-900/40 border border-emerald-500/30 rounded-full">
                <div className="flex gap-1 items-center">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div
                      key={i}
                      className="w-1 rounded-full bg-emerald-400"
                      style={{
                        height: '14px',
                        animation: `student-ai-wave 0.6s ease-in-out ${i * 0.08}s infinite alternate`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs text-emerald-300">
                  {language === 'en' ? 'CoachX AI speaking...'
                    : language === 'ja' ? 'CoachX AIが話しています...'
                    : 'CoachX AI 답변 중...'}
                </span>
                <button
                  onClick={stopSpeaking}
                  className="text-emerald-400 hover:text-emerald-200 transition-colors"
                  aria-label="음성 중지"
                >
                  <VolumeX className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Mic button */}
            <button
              onClick={toggleListening}
              disabled={isTyping}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg ${
                isListening
                  ? 'bg-red-500 hover:bg-red-400 shadow-red-500/40 scale-110'
                  : isTyping
                  ? 'bg-white/[0.06] cursor-not-allowed opacity-50'
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/30 active:scale-95'
              }`}
              aria-label={isListening ? '음성 인식 중지' : '음성 인식 시작'}
            >
              {isListening
                ? <MicOff className="w-8 h-8 text-white" />
                : <Mic className="w-8 h-8 text-white" />
              }
            </button>

            {/* Status text */}
            <p className="text-xs text-ink-muted text-center">
              {isTyping
                ? (language === 'en' ? 'CoachX AI is thinking...'
                    : language === 'ja' ? 'CoachX AIが考えています...'
                    : 'CoachX AI 생각 중...')
                : voiceButtonLabel
              }
            </p>

            {/* Listening animation bars */}
            {isListening && (
              <div className="flex gap-1.5 items-center mt-1">
                {[0, 1, 2, 3, 4, 5, 6].map(i => (
                  <div
                    key={i}
                    className="w-1.5 rounded-full bg-emerald-400"
                    style={{
                      height: `${10 + (i % 3) * 8}px`,
                      animation: `student-ai-wave 0.5s ease-in-out ${i * 0.07}s infinite alternate`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </>
      )}

      <style>{`
        @keyframes student-ai-bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
        @keyframes student-ai-cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .student-ai-cursor {
          animation: student-ai-cursor-blink 0.7s ease-in-out infinite;
        }
        @keyframes student-ai-pulse-ring {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        .student-ai-pulse::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          background: inherit;
          animation: student-ai-pulse-ring 2s ease-out infinite;
        }
        @keyframes student-ai-wave {
          from { transform: scaleY(0.4); }
          to   { transform: scaleY(1); }
        }
        /* The R2 PUT reports no progress events, so the bar sweeps rather than
           filling — an honest "still working" instead of a made-up percentage. */
        @keyframes student-ai-sweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        .student-ai-indeterminate {
          animation: student-ai-sweep 1.4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};
