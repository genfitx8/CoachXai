import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Lesson, ClientProfile, Homework, LessonReservation } from '../types';
import {
  ChevronLeft, Send, Sparkles, Bot, Mic, MicOff,
  Calendar, Clock, CheckCircle, X, MessageSquare,
  CalendarCheck, Layers, TrendingUp, HelpCircle,
} from 'lucide-react';
import { generateStudentChatResponse } from '../services/geminiService';
import { reservationService } from '../services/reservationService';
import { useLanguage } from './LanguageContext';

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = 'chat' | 'voice';
type BookingType = 'lesson' | 'bay';
type BookingStep = 'date' | 'slot' | 'confirm' | 'done' | null;

interface BookingState {
  type: BookingType | null;
  step: BookingStep;
  date: string | null;
  selectedSlot: LessonReservation | null;
  availableSlots: LessonReservation[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface StudentAIChatProps {
  clientProfile: ClientProfile;
  myLessons: Lesson[];
  homeworkList: Homework[];
  onBack: () => void;
  onOpenBayReservation?: () => void;
  onOpenMyReservations?: () => void;
  onOpenStats?: () => void;
  onOpenRecords?: () => void;
  onOpenProfile?: () => void;
  initialQuery?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPING_REVEAL_DURATION_MS = 1800;
const TYPING_TICK_MS = 20;

const pad = (n: number) => String(n).padStart(2, '0');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getNext14Days(): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

function formatDateKo(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const prefix = dateStr === today ? '오늘 ' : dateStr === tomorrow ? '내일 ' : '';
  return `${prefix}${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`;
}

function formatSlotTime(slot: LessonReservation): string {
  const start = new Date(slot.startTime);
  const end = new Date(slot.endTime);
  return `${pad(start.getHours())}:${pad(start.getMinutes())} ~ ${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

function detectBookingIntent(text: string): BookingType | null {
  const lower = text.toLowerCase();
  if (/타석|bay|range|driving/.test(lower)) return 'bay';
  if (/레슨|예약|book|reserv/.test(lower)) return 'lesson';
  return null;
}

function parseNaturalDate(text: string): string | null {
  const today = new Date();
  const year = today.getFullYear();

  if (/오늘/.test(text)) return today.toISOString().slice(0, 10);
  if (/내일/.test(text)) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  if (/모레/.test(text)) {
    const d = new Date(today); d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  }

  const monthDay = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (monthDay) {
    const mo = parseInt(monthDay[1], 10);
    const dy = parseInt(monthDay[2], 10);
    const candidate = new Date(`${year}-${pad(mo)}-${pad(dy)}`);
    const useYear = candidate < today ? year + 1 : year;
    return `${useYear}-${pad(mo)}-${pad(dy)}`;
  }

  const iso = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;

  const dayMap: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
  const dayMatch = text.match(/(다음\s*주)?\s*(월|화|수|목|금|토|일)요일/);
  if (dayMatch) {
    const target = dayMap[dayMatch[2]];
    const isNext = /다음/.test(text);
    const d = new Date(today);
    let diff = target - d.getDay();
    if (diff <= 0 || isNext) diff += 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const StudentAIChat: React.FC<StudentAIChatProps> = ({
  clientProfile,
  myLessons,
  homeworkList,
  onBack,
  onOpenBayReservation,
  onOpenMyReservations,
  onOpenStats,
  onOpenRecords,
  onOpenProfile,
  initialQuery,
}) => {
  const { language } = useLanguage();

  const greeting =
    language === 'en'
      ? `Hi **${clientProfile.name}**! I'm **CoachX AI** 🏌️\nYou can chat, book lessons, or reserve a bay — just ask!\n\nI've reviewed your **${myLessons.length} lesson records**.`
      : language === 'ja'
      ? `こんにちは、**${clientProfile.name}**さん！私は**CoachX AI**です 🏌️\nレッスン予約、打席予約、ゴルフ質問など何でもどうぞ！\n\n**${myLessons.length}件**のレッスン記録を確認しました。`
      : `안녕하세요, **${clientProfile.name}**님! 저는 **CoachX AI**예요 🏌️\n채팅 또는 음성으로 레슨·타석 예약, 골프 질문까지 도와드릴게요!\n\n현재 **${myLessons.length}개**의 레슨 기록을 분석 중이에요.`;

  const [mode, setMode] = useState<Mode>('chat');
  const [messages, setMessages] = useState<Message[]>([
    { id: makeId(), role: 'assistant', content: greeting, timestamp: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [revealedChars, setRevealedChars] = useState<number | null>(null);
  const revealIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [booking, setBooking] = useState<BookingState>({
    type: null, step: null, date: null, selectedSlot: null, availableSlots: [],
  });
  const [isBookingLoading, setIsBookingLoading] = useState(false);

  // Voice
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const clientId = `${clientProfile.name}_${clientProfile.phone}`;
  const coachId = clientProfile.coachId ?? '';

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    synthRef.current = window.speechSynthesis ?? null;
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, revealedChars, booking.step]);

  // ── Reveal animation ──────────────────────────────────────────────────────

  const clearReveal = useCallback(() => {
    if (revealIntervalRef.current !== null) {
      clearInterval(revealIntervalRef.current);
      revealIntervalRef.current = null;
    }
    setRevealedChars(null);
  }, []);

  useEffect(() => () => { clearReveal(); }, [clearReveal]);

  const startReveal = useCallback((text: string) => {
    const totalChars = text.length;
    const totalTicks = Math.ceil(TYPING_REVEAL_DURATION_MS / TYPING_TICK_MS);
    const charsPerTick = Math.max(1, Math.ceil(totalChars / totalTicks));
    setRevealedChars(0);
    revealIntervalRef.current = setInterval(() => {
      setRevealedChars(prev => {
        if (prev === null) return null;
        const next = prev + charsPerTick;
        if (next >= totalChars) {
          if (revealIntervalRef.current !== null) {
            clearInterval(revealIntervalRef.current);
            revealIntervalRef.current = null;
          }
          return null;
        }
        return next;
      });
    }, TYPING_TICK_MS);
  }, []);

  // ── TTS ───────────────────────────────────────────────────────────────────

  const speak = useCallback((text: string) => {
    if (!synthRef.current || mode !== 'voice') return;
    synthRef.current.cancel();
    const plain = text.replace(/\*\*/g, '').replace(/\n/g, ' ');
    const utter = new SpeechSynthesisUtterance(plain);
    utter.lang = language === 'en' ? 'en-US' : 'ko-KR';
    synthRef.current.speak(utter);
  }, [language, mode]);

  // ── Message helpers ───────────────────────────────────────────────────────

  const addMessage = useCallback((role: 'user' | 'assistant', content: string): Message => {
    const msg: Message = { id: makeId(), role, content, timestamp: Date.now() };
    setMessages(prev => [...prev, msg]);
    return msg;
  }, []);

  const addAssistantMessage = useCallback((content: string) => {
    addMessage('assistant', content);
    startReveal(content);
    speak(content);
  }, [addMessage, startReveal, speak]);

  // ── Booking flow ──────────────────────────────────────────────────────────

  const startLessonBooking = useCallback(async (prefillDate?: string | null) => {
    clearReveal();

    if (!coachId) {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        addAssistantMessage('담당 코치가 아직 지정되지 않았어요. 프로필에서 코치를 연결한 후 예약해 주세요! 😊');
      }, 400);
      return;
    }

    setIsBookingLoading(true);
    let slots: LessonReservation[] = [];
    try {
      slots = await reservationService.getAvailableSlots(coachId);
    } catch {
      // ignore, show empty list
    }
    setIsBookingLoading(false);

    if (slots.length === 0) {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        addAssistantMessage('현재 코치님이 등록한 예약 가능한 슬롯이 없어요. 코치님께 문의해 보세요! 📞');
      }, 400);
      return;
    }

    setBooking({
      type: 'lesson',
      step: prefillDate ? 'slot' : 'date',
      date: prefillDate ?? null,
      selectedSlot: null,
      availableSlots: slots,
    });

    const msg = prefillDate
      ? `**${formatDateKo(prefillDate)}** 날짜가 선택됐어요 ✅\n이제 원하는 시간을 골라주세요!`
      : '레슨 예약을 시작할게요! 📅\n먼저 **날짜**를 선택해 주세요.';

    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      addAssistantMessage(msg);
    }, 500);
  }, [clearReveal, coachId, addAssistantMessage]);

  const handleDateSelect = useCallback((date: string) => {
    addMessage('user', `📅 ${formatDateKo(date)}`);
    setBooking(prev => ({ ...prev, date, step: 'slot' }));
    setTimeout(() => {
      addAssistantMessage(`**${formatDateKo(date)}** 날짜가 선택됐어요 ✅\n아래에서 원하는 시간대를 골라주세요!`);
    }, 400);
  }, [addMessage, addAssistantMessage]);

  const handleSlotSelect = useCallback((slot: LessonReservation) => {
    addMessage('user', `⏰ ${formatSlotTime(slot)}`);
    setBooking(prev => ({ ...prev, selectedSlot: slot, step: 'confirm' }));
    setTimeout(() => {
      addAssistantMessage('예약 내용을 확인해 주세요 📋');
    }, 400);
  }, [addMessage, addAssistantMessage]);

  const handleConfirmLesson = useCallback(async () => {
    const { selectedSlot } = booking;
    if (!selectedSlot) return;

    setIsBookingLoading(true);
    try {
      await reservationService.requestReservation(
        selectedSlot.id,
        clientId,
        clientProfile.name,
        clientProfile.phone ?? '',
        undefined
      );
      setBooking(prev => ({ ...prev, step: 'done' }));
      addAssistantMessage('레슨 예약 요청이 완료됐어요! 🎉\n코치님 확인 후 승인되면 알림을 보내드릴게요.');
    } catch (e) {
      const err = e instanceof Error ? e.message : '오류가 발생했습니다.';
      addAssistantMessage(`❌ ${err}\n다시 시도해 주세요.`);
      setBooking({ type: null, step: null, date: null, selectedSlot: null, availableSlots: [] });
    } finally {
      setIsBookingLoading(false);
    }
  }, [booking, clientId, clientProfile, addAssistantMessage]);

  const cancelBooking = useCallback(() => {
    setBooking({ type: null, step: null, date: null, selectedSlot: null, availableSlots: [] });
    addAssistantMessage('예약이 취소됐어요. 다시 무엇이든 물어보세요! 😊');
  }, [addAssistantMessage]);

  // ── Main send ─────────────────────────────────────────────────────────────

  const handleSend = useCallback(async (text?: string) => {
    const msgText = (text ?? input).trim();
    if (!msgText || isTyping) return;
    clearReveal();

    addMessage('user', msgText);
    setInput('');
    setIsTyping(true);

    const intent = detectBookingIntent(msgText);

    // Bay reservation → navigate out
    if (intent === 'bay') {
      setIsTyping(false);
      if (onOpenBayReservation) {
        addAssistantMessage('타석 예약 페이지로 이동할게요! 🏌️');
        setTimeout(onOpenBayReservation, 800);
      } else {
        addAssistantMessage('타석 예약은 홈 화면의 **타석 예약** 버튼을 이용해 주세요!');
      }
      return;
    }

    // Lesson reservation
    if (intent === 'lesson') {
      setIsTyping(false);
      const parsedDate = parseNaturalDate(msgText);
      await startLessonBooking(parsedDate);
      return;
    }

    const lower = msgText.toLowerCase();

    // Navigation intents
    if (/홈|대시보드|메인|처음|home|dashboard|main/.test(lower)) {
      setIsTyping(false);
      addAssistantMessage('홈 화면으로 돌아갈게요! 🏠');
      setTimeout(onBack, 800);
      return;
    }
    if ((/내 예약|my reservation|予約確認/.test(lower)) && onOpenMyReservations) {
      setIsTyping(false);
      addAssistantMessage('내 예약 내역으로 이동할게요! 📋');
      setTimeout(onOpenMyReservations, 800);
      return;
    }
    if (/통계|스탯|stats|statistics|성장/.test(lower) && onOpenStats) {
      setIsTyping(false);
      addAssistantMessage('상세 통계 페이지로 이동할게요! 📊');
      setTimeout(onOpenStats, 800);
      return;
    }
    if (/레슨 기록|최근 기록|기록 목록|records|history/.test(lower) && onOpenRecords) {
      setIsTyping(false);
      addAssistantMessage('레슨 기록 목록으로 이동할게요! 📝');
      setTimeout(onOpenRecords, 800);
      return;
    }
    if (/프로필|내 정보|profile/.test(lower) && onOpenProfile) {
      setIsTyping(false);
      addAssistantMessage('프로필 페이지로 이동할게요! 👤');
      setTimeout(onOpenProfile, 800);
      return;
    }

    // General AI response
    try {
      const lang = (language as 'ko' | 'en' | 'ja') ?? 'ko';
      const reply = await generateStudentChatResponse(msgText, myLessons, clientProfile, homeworkList, lang);
      setIsTyping(false);
      addAssistantMessage(reply);
    } catch {
      setIsTyping(false);
      addAssistantMessage('잠시 오류가 발생했어요. 다시 시도해 주세요. 😅');
    }
  }, [input, isTyping, clearReveal, addMessage, addAssistantMessage, startLessonBooking, myLessons, clientProfile, homeworkList, language, onOpenBayReservation, onOpenMyReservations]);

  // Auto-send initial query on mount
  useEffect(() => {
    if (!initialQuery) return;
    const t = setTimeout(() => { void handleSend(initialQuery); }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Quick actions ─────────────────────────────────────────────────────────

  const handleQuickAction = useCallback((action: string) => {
    switch (action) {
      case 'lesson': void startLessonBooking(null); break;
      case 'bay':
        if (onOpenBayReservation) {
          addAssistantMessage('타석 예약 페이지로 이동할게요! 🏌️');
          setTimeout(onOpenBayReservation, 800);
        } else {
          addAssistantMessage('타석 예약은 홈 화면의 **타석 예약** 버튼을 이용해 주세요!');
        }
        break;
      case 'myreservations':
        if (onOpenMyReservations) {
          addAssistantMessage('내 예약 내역으로 이동할게요! 📋');
          setTimeout(onOpenMyReservations, 800);
        } else {
          void handleSend('내 예약 현황 알려줘');
        }
        break;
      case 'tip':
        void handleSend('최근 레슨 기반으로 연습 팁 알려줘');
        break;
      case 'home':
        addAssistantMessage('홈 화면으로 돌아갈게요! 🏠');
        setTimeout(onBack, 800);
        break;
    }
  }, [startLessonBooking, onOpenBayReservation, onOpenMyReservations, addAssistantMessage, handleSend]);

  // ── Voice ─────────────────────────────────────────────────────────────────

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    setVoiceError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SRConstructor: (new () => SpeechRecognition) | undefined = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SRConstructor) {
      setVoiceError('이 브라우저는 음성 인식을 지원하지 않습니다.');
      return;
    }
    const rec = new SRConstructor();
    rec.lang = language === 'en' ? 'en-US' : 'ko-KR';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onstart = () => setIsListening(true);
    rec.onend = () => setIsListening(false);
    rec.onerror = (e: Event) => {
      setIsListening(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((e as any).error !== 'aborted') setVoiceError('음성 인식 중 오류가 발생했어요.');
    };
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0]?.[0]?.transcript ?? '';
      if (transcript) void handleSend(transcript);
    };
    recognitionRef.current = rec;
    rec.start();
  }, [language, handleSend]);

  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, stopListening, startListening]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderContent = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <p key={i} className={i < lines.length - 1 ? 'mb-1' : ''}>
          {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
        </p>
      );
    });
  };

  // ── Booking card ──────────────────────────────────────────────────────────

  const renderBookingCard = () => {
    if (!booking.step || booking.step === 'done') return null;

    // Slots filtered for selected date
    const slotsForDate = booking.availableSlots.filter(s => {
      if (!booking.date) return false;
      return s.startTime.startsWith(booking.date);
    });

    return (
      <div className="mx-4 mb-3 bg-gray-800/90 border border-indigo-500/30 rounded-2xl overflow-hidden">
        {/* Card header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-900/30 border-b border-indigo-500/20">
          <div className="flex items-center gap-2">
            {booking.step === 'date' && <Calendar className="w-4 h-4 text-indigo-400" />}
            {booking.step === 'slot' && <Clock className="w-4 h-4 text-indigo-400" />}
            {booking.step === 'confirm' && <CheckCircle className="w-4 h-4 text-indigo-400" />}
            <span className="text-xs font-semibold text-indigo-300">
              {booking.step === 'date' && '날짜 선택'}
              {booking.step === 'slot' && '시간 선택'}
              {booking.step === 'confirm' && '예약 확인'}
            </span>
          </div>
          <button
            onClick={cancelBooking}
            className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            aria-label="예약 취소"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Date picker */}
        {booking.step === 'date' && (
          <div className="p-3">
            {/* Unique dates that have available slots */}
            {(() => {
              const dates = [...new Set(booking.availableSlots.map(s => s.startTime.slice(0, 10)))]
                .filter(d => d >= new Date().toISOString().slice(0, 10))
                .sort()
                .slice(0, 14);
              return dates.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto">
                  {dates.map(date => (
                    <button
                      key={date}
                      onClick={() => handleDateSelect(date)}
                      className="py-2.5 px-3 text-sm rounded-xl bg-gray-700/80 hover:bg-indigo-700/60 border border-white/10 hover:border-indigo-500/50 text-gray-200 hover:text-white transition-colors text-left"
                    >
                      {formatDateKo(date)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center py-4">예약 가능한 날짜가 없어요.<br />코치님께 문의해 주세요.</p>
              );
            })()}
          </div>
        )}

        {/* Slot picker */}
        {booking.step === 'slot' && (
          <div className="p-3">
            {slotsForDate.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto">
                {slotsForDate.map(slot => (
                  <button
                    key={slot.id}
                    onClick={() => handleSlotSelect(slot)}
                    className="py-2.5 px-3 text-sm rounded-xl bg-gray-700/80 hover:bg-indigo-700/60 border border-white/10 hover:border-indigo-500/50 text-gray-200 hover:text-white transition-colors"
                  >
                    {formatSlotTime(slot)}
                    {slot.lessonType && (
                      <span className="block text-[10px] text-indigo-300 mt-0.5">{slot.lessonType}</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center">
                <p className="text-xs text-gray-400">해당 날짜에 가능한 시간대가 없어요.</p>
                <button
                  onClick={() => setBooking(prev => ({ ...prev, step: 'date' }))}
                  className="mt-2 text-xs text-indigo-400 hover:underline"
                >
                  다른 날짜 선택하기
                </button>
              </div>
            )}
          </div>
        )}

        {/* Confirmation */}
        {booking.step === 'confirm' && booking.selectedSlot && (
          <div className="p-4">
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Calendar className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <span>{booking.date ? formatDateKo(booking.date) : ''}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Clock className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <span>{formatSlotTime(booking.selectedSlot)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <CheckCircle className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <span>코치: {booking.selectedSlot.coachName}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={cancelBooking}
                className="flex-1 py-2.5 text-sm rounded-xl bg-gray-700/60 hover:bg-gray-600/60 border border-white/10 text-gray-300 hover:text-white transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => void handleConfirmLesson()}
                disabled={isBookingLoading}
                className="flex-1 py-2.5 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                {isBookingLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><CheckCircle className="w-4 h-4" /> 예약 요청</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col bg-gray-950 text-white" style={{ height: '100dvh' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-gray-900/90 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={onBack}
          className="p-2.5 rounded-full hover:bg-white/10 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
          aria-label="뒤로"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>

        <div className="relative w-8 h-8 flex items-center justify-center flex-shrink-0">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 student-ai-pulse" />
          <Sparkles className="relative z-10 w-4 h-4 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-white leading-none">CoachX AI</p>
          <p className="text-xs text-indigo-300 mt-0.5 truncate">
            {language === 'en' ? 'Booking & Golf Assistant'
              : language === 'ja' ? '予約＆ゴルフアシスタント'
              : '레슨·타석 예약 & 골프 어시스턴트'}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-xl p-1 border border-white/10">
          <button
            onClick={() => { setMode('chat'); synthRef.current?.cancel(); stopListening(); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mode === 'chat' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            채팅
          </button>
          <button
            onClick={() => setMode('voice')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mode === 'voice' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            음성
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, idx) => {
          const isLastAssistant = msg.role === 'assistant' && idx === messages.length - 1;
          const isRevealing = isLastAssistant && revealedChars !== null;
          const displayContent = isRevealing ? msg.content.slice(0, revealedChars ?? undefined) : msg.content;

          return (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-gray-800 text-gray-100 rounded-bl-sm'
              }`}>
                {renderContent(displayContent)}
                {isRevealing && (
                  <span className="student-ai-cursor inline-block w-0.5 h-3.5 bg-indigo-400 ml-0.5 align-text-bottom" />
                )}
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1.5 items-center h-4">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-indigo-400"
                    style={{ animation: `student-ai-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Quick action chips – shown on first screen only */}
        {messages.length <= 1 && !booking.step && (
          <div className="flex flex-col gap-2 pt-2">
            <p className="text-xs text-gray-500 px-1">빠른 실행</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'lesson', icon: <CalendarCheck className="w-4 h-4" />, label: '레슨 예약', color: 'border-indigo-500/40 text-indigo-300' },
                { key: 'bay', icon: <Layers className="w-4 h-4" />, label: '타석 예약', color: 'border-emerald-500/40 text-emerald-300' },
                { key: 'myreservations', icon: <Calendar className="w-4 h-4" />, label: '내 예약', color: 'border-blue-500/40 text-blue-300' },
                { key: 'tip', icon: <TrendingUp className="w-4 h-4" />, label: '연습 팁', color: 'border-amber-500/40 text-amber-300' },
                { key: 'home', icon: <ChevronLeft className="w-4 h-4" />, label: '홈으로', color: 'border-gray-500/40 text-gray-300' },
              ].map(({ key, icon, label, color }) => (
                <button
                  key={key}
                  onClick={() => handleQuickAction(key)}
                  className={`flex items-center gap-2 px-3 py-3 rounded-xl bg-gray-800/80 border hover:bg-gray-700/80 transition-colors text-sm font-medium ${color} ${key === 'home' ? 'col-span-2 justify-center' : ''}`}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>

            <p className="text-xs text-gray-500 px-1 mt-1">또는 직접 물어보세요</p>
            <div className="flex flex-wrap gap-2">
              {[
                { icon: <HelpCircle className="w-3 h-3" />, text: '내일 레슨 예약해줘' },
                { icon: <TrendingUp className="w-3 h-3" />, text: '최근 레슨 정리해줘' },
                { icon: <HelpCircle className="w-3 h-3" />, text: '드라이버 거리 늘리는 법' },
              ].map((p, i) => (
                <button
                  key={i}
                  onClick={() => void handleSend(p.text)}
                  className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-white/10 text-gray-300 hover:text-white rounded-full px-3 py-1.5 transition-colors"
                >
                  {p.icon}
                  {p.text}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Voice error */}
      {voiceError && (
        <div className="mx-4 mb-2 px-3 py-2 bg-red-900/40 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
          <X className="w-3.5 h-3.5 flex-shrink-0" />
          {voiceError}
        </div>
      )}

      {/* Booking card */}
      {renderBookingCard()}

      {/* Input bar */}
      <div className="px-4 pb-safe pb-4 border-t border-white/10 bg-gray-900/90 backdrop-blur-sm pt-3">
        {mode === 'chat' ? (
          <div className="flex gap-2 items-end">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
              placeholder={
                language === 'en' ? 'Ask anything or say "book lesson"...'
                : language === 'ja' ? 'なんでも聞いてください...'
                : '"레슨 예약" 또는 골프 질문을 입력하세요...'
              }
              disabled={isTyping}
              className="flex-1 bg-gray-800 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors disabled:opacity-50"
            />
            <button
              onClick={() => void handleSend()}
              disabled={!input.trim() || isTyping || revealedChars !== null}
              aria-label="전송"
              className="w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-2">
            <button
              onClick={toggleListening}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                isListening
                  ? 'bg-red-500 hover:bg-red-400 shadow-lg shadow-red-500/40 scale-110'
                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/30'
              }`}
              aria-label={isListening ? '음성 인식 중지' : '음성 인식 시작'}
            >
              {isListening ? <MicOff className="w-7 h-7 text-white" /> : <Mic className="w-7 h-7 text-white" />}
            </button>
            <p className="text-xs text-gray-400">
              {isListening ? '🔴 듣고 있어요... (탭하여 중지)' : '마이크 버튼을 눌러 말하세요'}
            </p>
            {isListening && (
              <div className="flex gap-1.5 items-center">
                {[0, 1, 2, 3, 4].map(i => (
                  <div
                    key={i}
                    className="w-1 rounded-full bg-indigo-400"
                    style={{
                      height: `${12 + Math.random() * 16}px`,
                      animation: `student-ai-wave 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

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
          100% { transform: scale(1.6); opacity: 0; }
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
          from { transform: scaleY(0.5); }
          to { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
};
