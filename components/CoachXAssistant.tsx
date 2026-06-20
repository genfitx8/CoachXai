import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronLeft, Send, Sparkles, Bot, Mic, MicOff,
  Calendar, Clock, User, CheckCircle, X, MessageSquare,
  CalendarCheck, Layers,
} from 'lucide-react';
import { CoachProfile, ClientProfile, Lesson } from '../types';
import { generateCoachXChatResponse } from '../services/geminiService';
import { reservationService } from '../services/reservationService';
import { useLanguage } from './LanguageContext';

// ── Types ────────────────────────────────────────────────────────────────────

type Mode = 'chat' | 'voice';
type BookingType = 'lesson' | 'bay';
type BookingStep = 'date' | 'time' | 'client' | 'confirm' | 'done' | null;

interface BookingState {
  type: BookingType | null;
  step: BookingStep;
  date: string | null;       // YYYY-MM-DD
  hour: number | null;       // 0-23
  clientId: string | null;
  clientName: string | null;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface CoachXAssistantProps {
  coachProfile: CoachProfile;
  allLessons: Lesson[];
  clients: ClientProfile[];
  onBack: () => void;
  onOpenBayReservation?: () => void;
  onOpenReservationManager?: () => void;
  onOpenCoachXHub?: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const LESSON_HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 08:00–20:00
const TYPING_REVEAL_DURATION_MS = 1800;
const TYPING_TICK_MS = 20;

const pad = (n: number) => String(n).padStart(2, '0');

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDateOptions(): string[] {
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
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${prefix}${month}/${day} (${days[d.getDay()]})`;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function detectBookingIntent(text: string): BookingType | null {
  const lower = text.toLowerCase();
  if (/타석|bay|range|driving/.test(lower)) return 'bay';
  if (/레슨|예약|book|reserv/.test(lower)) return 'lesson';
  return null;
}

// ── Natural language booking parser ──────────────────────────────────────────

interface ParsedBooking {
  date: string | null;
  hour: number | null;
  clientName: string | null;
  clientId: string | null;
}

function parseNaturalLanguageBooking(text: string, clients: ClientProfile[]): ParsedBooking {
  const today = new Date();
  const year = today.getFullYear();

  // ── Date ────────────────────────────────────────────────────────────────
  let date: string | null = null;

  if (/오늘/.test(text)) {
    date = today.toISOString().slice(0, 10);
  } else if (/내일/.test(text)) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    date = d.toISOString().slice(0, 10);
  } else if (/모레/.test(text)) {
    const d = new Date(today); d.setDate(d.getDate() + 2);
    date = d.toISOString().slice(0, 10);
  }

  if (!date) {
    // "7월 20일" / "07월 20일"
    const m = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
    if (m) {
      const mo = parseInt(m[1], 10);
      const dy = parseInt(m[2], 10);
      const candidate = new Date(`${year}-${String(mo).padStart(2,'0')}-${String(dy).padStart(2,'0')}`);
      const useYear = candidate < today ? year + 1 : year;
      date = `${useYear}-${String(mo).padStart(2,'0')}-${String(dy).padStart(2,'0')}`;
    }
  }

  if (!date) {
    // "2026-07-20" ISO
    const m = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) date = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  }

  if (!date) {
    // "월요일", "다음 주 화요일"
    const dayMap: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
    const m = text.match(/(다음\s*주)?\s*(월|화|수|목|금|토|일)요일/);
    if (m) {
      const target = dayMap[m[2]];
      const isNext = /다음/.test(text);
      const d = new Date(today);
      let diff = target - d.getDay();
      if (diff <= 0 || isNext) diff += 7;
      d.setDate(d.getDate() + diff);
      date = d.toISOString().slice(0, 10);
    }
  }

  // ── Time ────────────────────────────────────────────────────────────────
  let hour: number | null = null;

  // "오전 10시" / "오후 3시" / "오후 3시 30분"
  const tm = text.match(/(오전|오후)?\s*(\d{1,2})시/);
  if (tm) {
    let h = parseInt(tm[2], 10);
    if (tm[1] === '오후' && h !== 12) h += 12;
    else if (tm[1] === '오전' && h === 12) h = 0;
    else if (!tm[1] && h <= 7) h += 12; // ambiguous: 1~7시 → assume PM
    hour = h;
  }

  if (hour === null) {
    // "15:00"
    const m24 = text.match(/(\d{1,2}):(\d{2})/);
    if (m24) hour = parseInt(m24[1], 10);
  }

  // ── Client name ──────────────────────────────────────────────────────────
  let clientName: string | null = null;
  let clientId: string | null = null;

  for (const c of clients) {
    if (c.name.length >= 2 && text.includes(c.name)) {
      clientName = c.name;
      clientId = c.phone ?? null;
      break;
    }
  }

  return { date, hour, clientName, clientId };
}

// ── Booking step templates ───────────────────────────────────────────────────

const BOOKING_MESSAGES: Record<string, string> = {
  lesson_start:    '레슨 예약을 시작할게요! 📅\n먼저 **날짜**를 선택해 주세요.',
  bay_start:       '타석 예약을 진행할게요! 🏌️\n먼저 **날짜**를 선택해 주세요.',
  lesson_time:     '날짜가 선택됐어요 ✅\n이제 **시간**을 선택해 주세요.',
  lesson_client:   '시간이 선택됐어요 ✅\n**회원**을 선택해 주세요. (없으면 건너뛰기 가능)',
  lesson_confirm:  '예약 내용을 확인해 주세요 📋',
  lesson_done:     '레슨 예약이 완료됐어요! 🎉\n코치 캘린더에 슬롯이 등록되었습니다.',
  lesson_error:    '예약 처리 중 오류가 발생했어요. 다시 시도해 주세요.',
  bay_nav:         '타석 예약 페이지로 이동할게요! 🏌️',
  general_help:    '안녕하세요! 저는 **CoachX AI**예요.\n\n무엇을 도와드릴까요?\n- 📅 **레슨 예약** — 레슨 슬롯 생성\n- 🏌️ **타석 예약** — 타석 예약 관리\n- 💡 **코칭 인사이트** — AI 분석 및 인사이트\n- 📋 **예약 현황** — 현재 예약 목록',
};

// ── Component ────────────────────────────────────────────────────────────────

export const CoachXAssistant: React.FC<CoachXAssistantProps> = ({
  coachProfile,
  allLessons,
  clients,
  onBack,
  onOpenBayReservation,
  onOpenReservationManager,
  onOpenCoachXHub,
}) => {
  const { language } = useLanguage();

  const coachClients = clients.filter(
    (c) => !c.coachId || c.coachId === coachProfile.id
  );

  const [mode, setMode] = useState<Mode>('chat');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: makeId(),
      role: 'assistant',
      content: `안녕하세요, **${coachProfile.name}** 코치님! 👋\n저는 **CoachX AI**예요.\n\n채팅이나 음성으로 레슨 예약, 타석 예약, 코칭 인사이트를 바로 도와드릴게요.\n무엇이 필요하신가요?`,
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [revealedChars, setRevealedChars] = useState<number | null>(null);
  const revealIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [booking, setBooking] = useState<BookingState>({
    type: null, step: null, date: null, hour: null, clientId: null, clientName: null,
  });
  const [isBookingLoading, setIsBookingLoading] = useState(false);

  // Voice
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    synthRef.current = window.speechSynthesis ?? null;
  }, []);

  // ── Scroll ───────────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, revealedChars, booking.step]);

  // ── Reveal animation ─────────────────────────────────────────────────────

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

  // ── TTS ──────────────────────────────────────────────────────────────────

  const speak = useCallback((text: string) => {
    if (!synthRef.current || mode !== 'voice') return;
    synthRef.current.cancel();
    const plain = text.replace(/\*\*/g, '').replace(/\n/g, ' ');
    const utter = new SpeechSynthesisUtterance(plain);
    utter.lang = language === 'en' ? 'en-US' : 'ko-KR';
    synthRef.current.speak(utter);
  }, [language, mode]);

  // ── Add message ───────────────────────────────────────────────────────────

  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
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

  const startBooking = useCallback((type: BookingType) => {
    clearReveal();
    setBooking({ type, step: 'date', date: null, hour: null, clientId: null, clientName: null });
    const msg = type === 'lesson' ? BOOKING_MESSAGES.lesson_start : BOOKING_MESSAGES.bay_start;
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      addAssistantMessage(msg);
    }, 600);
  }, [clearReveal, addAssistantMessage]);

  const handleDateSelect = useCallback((date: string) => {
    addMessage('user', `📅 ${formatDateKo(date)}`);
    setBooking(prev => {
      // If hour already parsed, skip time picker
      const nextStep: BookingStep = prev.hour !== null ? 'client' : 'time';
      return { ...prev, date, step: nextStep };
    });
    setTimeout(() => {
      setBooking(prev => {
        if (prev.hour !== null) {
          addAssistantMessage(BOOKING_MESSAGES.lesson_client);
        } else {
          addAssistantMessage(BOOKING_MESSAGES.lesson_time);
        }
        return prev;
      });
    }, 400);
  }, [addMessage, addAssistantMessage]);

  const handleTimeSelect = useCallback((hour: number) => {
    addMessage('user', `⏰ ${pad(hour)}:00 ~ ${pad(hour + 1)}:00`);
    setBooking(prev => {
      // If client already matched, skip client picker → confirm
      const nextStep: BookingStep = prev.clientName ? 'confirm' : 'client';
      return { ...prev, hour, step: nextStep };
    });
    setTimeout(() => {
      setBooking(prev => {
        if (prev.clientName) {
          addAssistantMessage(BOOKING_MESSAGES.lesson_confirm);
        } else {
          addAssistantMessage(BOOKING_MESSAGES.lesson_client);
        }
        return prev;
      });
    }, 400);
  }, [addMessage, addAssistantMessage]);

  const handleClientSelect = useCallback((clientId: string | null, clientName: string | null) => {
    if (clientName) {
      addMessage('user', `👤 ${clientName}`);
    } else {
      addMessage('user', '건너뛰기');
    }
    setBooking(prev => ({ ...prev, clientId, clientName, step: 'confirm' }));
    setTimeout(() => addAssistantMessage(BOOKING_MESSAGES.lesson_confirm), 400);
  }, [addMessage, addAssistantMessage]);

  const handleConfirm = useCallback(async () => {
    if (!booking.date || booking.hour === null) return;
    setIsBookingLoading(true);
    try {
      await reservationService.createHourSlot(
        coachProfile.id,
        coachProfile.name,
        booking.date,
        booking.hour,
        booking.clientName ? `레슨 (${booking.clientName})` : '레슨'
      );
      setBooking(prev => ({ ...prev, step: 'done' }));
      addAssistantMessage(BOOKING_MESSAGES.lesson_done);
    } catch (e) {
      const err = e instanceof Error ? e.message : '오류가 발생했습니다.';
      addAssistantMessage(`❌ ${err}\n\n다시 시도해 주세요.`);
      setBooking({ type: null, step: null, date: null, hour: null, clientId: null, clientName: null });
    } finally {
      setIsBookingLoading(false);
    }
  }, [booking, coachProfile, addAssistantMessage]);

  const cancelBooking = useCallback(() => {
    setBooking({ type: null, step: null, date: null, hour: null, clientId: null, clientName: null });
    addAssistantMessage('예약이 취소됐어요. 다시 무엇이든 물어보세요! 😊');
  }, [addAssistantMessage]);

  // ── Send message ──────────────────────────────────────────────────────────

  const handleSend = useCallback(async (text?: string) => {
    const msgText = (text ?? input).trim();
    if (!msgText || isTyping) return;
    clearReveal();

    addMessage('user', msgText);
    setInput('');
    setIsTyping(true);

    // Check for booking intent
    const intent = detectBookingIntent(msgText);
    if (intent === 'bay') {
      setIsTyping(false);
      if (onOpenBayReservation) {
        addAssistantMessage(BOOKING_MESSAGES.bay_nav);
        setTimeout(onOpenBayReservation, 800);
      } else {
        startBooking('bay');
      }
      return;
    }
    if (intent === 'lesson') {
      // Try to parse date / time / client from the natural language message
      const parsed = parseNaturalLanguageBooking(msgText, coachClients);
      setIsTyping(false);

      if (parsed.date && parsed.hour !== null) {
        // All critical info found → jump straight to confirmation
        const clientStr = parsed.clientName ? ` (${parsed.clientName} 회원)` : '';
        setBooking({
          type: 'lesson',
          step: 'confirm',
          date: parsed.date,
          hour: parsed.hour,
          clientId: parsed.clientId,
          clientName: parsed.clientName,
        });
        addAssistantMessage(
          `**${formatDateKo(parsed.date)} ${pad(parsed.hour)}:00~${pad(parsed.hour + 1)}:00${clientStr}** 레슨 예약이군요! 📋\n아래 내용을 확인하고 예약을 확정해 주세요.`
        );
      } else if (parsed.date) {
        // Date found, need time
        setBooking({
          type: 'lesson',
          step: 'time',
          date: parsed.date,
          hour: null,
          clientId: parsed.clientId,
          clientName: parsed.clientName,
        });
        addAssistantMessage(`**${formatDateKo(parsed.date)}** 레슨이군요! ✅\n이제 **시간**을 선택해 주세요.`);
      } else if (parsed.hour !== null) {
        // Time found, need date
        setBooking({
          type: 'lesson',
          step: 'date',
          date: null,
          hour: parsed.hour,
          clientId: parsed.clientId,
          clientName: parsed.clientName,
        });
        addAssistantMessage(`**${pad(parsed.hour)}:00** 시간으로 알겠어요! 📅\n**날짜**를 선택해 주세요.`);
      } else {
        // No info parsed → start normal step-by-step
        startBooking('lesson');
      }
      return;
    }

    // Check for quick commands
    const lower = msgText.toLowerCase();
    if (/예약 현황|reservation status/.test(lower) && onOpenReservationManager) {
      setIsTyping(false);
      addAssistantMessage('예약 현황 페이지로 이동할게요! 📋');
      setTimeout(onOpenReservationManager, 800);
      return;
    }
    if (/인사이트|insight|허브|hub/.test(lower) && onOpenCoachXHub) {
      setIsTyping(false);
      addAssistantMessage('코칭 인사이트 페이지로 이동할게요! 💡');
      setTimeout(onOpenCoachXHub, 800);
      return;
    }

    // General AI response
    try {
      const reply = await generateCoachXChatResponse(msgText, allLessons, clients, language as 'ko' | 'en' | 'ja');
      setIsTyping(false);
      addAssistantMessage(reply);
    } catch {
      setIsTyping(false);
      addAssistantMessage('죄송해요, 잠시 오류가 발생했어요. 다시 시도해 주세요.');
    }
  }, [input, isTyping, clearReveal, addMessage, addAssistantMessage, startBooking, allLessons, clients, coachClients, language, onOpenBayReservation, onOpenReservationManager, onOpenCoachXHub]);

  // ── Quick actions ─────────────────────────────────────────────────────────

  const handleQuickAction = useCallback((action: string) => {
    switch (action) {
      case 'lesson': startBooking('lesson'); break;
      case 'bay':
        if (onOpenBayReservation) {
          addAssistantMessage(BOOKING_MESSAGES.bay_nav);
          setTimeout(onOpenBayReservation, 800);
        } else {
          startBooking('bay');
        }
        break;
      case 'insight':
        if (onOpenCoachXHub) {
          addAssistantMessage('코칭 인사이트 페이지로 이동할게요! 💡');
          setTimeout(onOpenCoachXHub, 800);
        } else {
          void handleSend('내 레슨 데이터 분석해줘');
        }
        break;
      case 'status':
        if (onOpenReservationManager) {
          addAssistantMessage('예약 현황 페이지로 이동할게요! 📋');
          setTimeout(onOpenReservationManager, 800);
        } else {
          void handleSend('예약 현황 알려줘');
        }
        break;
    }
  }, [startBooking, onOpenBayReservation, onOpenCoachXHub, onOpenReservationManager, addAssistantMessage, handleSend]);

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

  const dateOptions = getDateOptions();

  // ── Booking card ──────────────────────────────────────────────────────────

  const renderBookingCard = () => {
    if (!booking.step || booking.step === 'done') return null;

    return (
      <div className="mx-4 mb-3 bg-gray-800/90 border border-violet-500/30 rounded-2xl overflow-hidden">
        {/* Card header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-violet-900/30 border-b border-violet-500/20">
          <div className="flex items-center gap-2">
            {booking.step === 'date' && <Calendar className="w-4 h-4 text-violet-400" />}
            {booking.step === 'time' && <Clock className="w-4 h-4 text-violet-400" />}
            {booking.step === 'client' && <User className="w-4 h-4 text-violet-400" />}
            {booking.step === 'confirm' && <CheckCircle className="w-4 h-4 text-violet-400" />}
            <span className="text-xs font-semibold text-violet-300">
              {booking.step === 'date' && '날짜 선택'}
              {booking.step === 'time' && '시간 선택'}
              {booking.step === 'client' && '회원 선택'}
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
            <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto">
              {dateOptions.map(date => (
                <button
                  key={date}
                  onClick={() => handleDateSelect(date)}
                  className="py-2.5 px-3 text-sm rounded-xl bg-gray-700/80 hover:bg-violet-700/60 border border-white/10 hover:border-violet-500/50 text-gray-200 hover:text-white transition-colors text-left"
                >
                  {formatDateKo(date)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Time picker */}
        {booking.step === 'time' && (
          <div className="p-3">
            <div className="grid grid-cols-4 gap-2">
              {LESSON_HOURS.map(h => (
                <button
                  key={h}
                  onClick={() => handleTimeSelect(h)}
                  className="py-2.5 text-sm rounded-xl bg-gray-700/80 hover:bg-violet-700/60 border border-white/10 hover:border-violet-500/50 text-gray-200 hover:text-white transition-colors"
                >
                  {pad(h)}:00
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Client picker */}
        {booking.step === 'client' && (
          <div className="p-3 space-y-1.5 max-h-52 overflow-y-auto">
            <button
              onClick={() => handleClientSelect(null, null)}
              className="w-full py-2.5 px-3 text-sm rounded-xl bg-gray-700/60 hover:bg-gray-600/60 border border-white/10 text-gray-400 hover:text-gray-200 transition-colors text-left"
            >
              건너뛰기 (회원 없음)
            </button>
            {coachClients.map(c => (
              <button
                key={c.phone}
                onClick={() => handleClientSelect(c.phone, c.name)}
                className="w-full py-2.5 px-3 text-sm rounded-xl bg-gray-700/80 hover:bg-violet-700/60 border border-white/10 hover:border-violet-500/50 text-gray-200 hover:text-white transition-colors text-left"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Confirmation */}
        {booking.step === 'confirm' && booking.date && booking.hour !== null && (
          <div className="p-4">
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Calendar className="w-4 h-4 text-violet-400 flex-shrink-0" />
                <span>{formatDateKo(booking.date)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Clock className="w-4 h-4 text-violet-400 flex-shrink-0" />
                <span>{pad(booking.hour)}:00 ~ {pad(booking.hour + 1)}:00</span>
              </div>
              {booking.clientName && (
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <User className="w-4 h-4 text-violet-400 flex-shrink-0" />
                  <span>{booking.clientName}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={cancelBooking}
                className="flex-1 py-2.5 text-sm rounded-xl bg-gray-700/60 hover:bg-gray-600/60 border border-white/10 text-gray-300 hover:text-white transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleConfirm}
                disabled={isBookingLoading}
                className="flex-1 py-2.5 text-sm rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                {isBookingLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><CheckCircle className="w-4 h-4" /> 예약 확정</>
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
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-600 to-slate-700 coachx-assistant-pulse" />
          <Sparkles className="relative z-10 w-4 h-4 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-white leading-none">CoachX AI</p>
          <p className="text-xs text-violet-300 mt-0.5 truncate">레슨·타석 예약 & 코칭 어시스턴트</p>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-xl p-1 border border-white/10">
          <button
            onClick={() => { setMode('chat'); synthRef.current?.cancel(); stopListening(); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mode === 'chat' ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            채팅
          </button>
          <button
            onClick={() => setMode('voice')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mode === 'voice' ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-gray-200'
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
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-slate-700 text-white rounded-br-sm'
                  : 'bg-gray-800 text-gray-100 rounded-bl-sm'
              }`}>
                {renderContent(displayContent)}
                {isRevealing && (
                  <span className="coachx-assistant-cursor inline-block w-0.5 h-3.5 bg-violet-400 ml-0.5 align-text-bottom" />
                )}
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-slate-700 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1.5 items-center h-4">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-violet-400"
                    style={{ animation: `coachx-assistant-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Quick action chips – shown on first screen */}
        {messages.length <= 1 && !booking.step && (
          <div className="flex flex-col gap-2 pt-2">
            <p className="text-xs text-gray-500 px-1">빠른 실행</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'lesson', icon: <CalendarCheck className="w-4 h-4" />, label: '레슨 예약', color: 'border-violet-500/40 text-violet-300' },
                { key: 'bay', icon: <Layers className="w-4 h-4" />, label: '타석 예약', color: 'border-emerald-500/40 text-emerald-300' },
                { key: 'insight', icon: <Sparkles className="w-4 h-4" />, label: '코칭 인사이트', color: 'border-amber-500/40 text-amber-300' },
                { key: 'status', icon: <Calendar className="w-4 h-4" />, label: '예약 현황', color: 'border-blue-500/40 text-blue-300' },
              ].map(({ key, icon, label, color }) => (
                <button
                  key={key}
                  onClick={() => handleQuickAction(key)}
                  className={`flex items-center gap-2 px-3 py-3 rounded-xl bg-gray-800/80 border hover:bg-gray-700/80 transition-colors text-sm font-medium ${color}`}
                >
                  {icon}
                  {label}
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
              placeholder="메시지를 입력하세요..."
              disabled={isTyping}
              className="flex-1 bg-gray-800 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-400 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors disabled:opacity-50"
            />
            <button
              onClick={() => void handleSend()}
              disabled={!input.trim() || isTyping || revealedChars !== null}
              aria-label="전송"
              className="w-11 h-11 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
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
                  : 'bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-500/30'
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
                    className="w-1 rounded-full bg-violet-400"
                    style={{
                      height: `${12 + Math.random() * 16}px`,
                      animation: `coachx-assistant-wave 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes coachx-assistant-bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
        @keyframes coachx-assistant-cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .coachx-assistant-cursor {
          animation: coachx-assistant-cursor-blink 0.7s ease-in-out infinite;
        }
        @keyframes coachx-assistant-pulse-ring {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .coachx-assistant-pulse::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          background: inherit;
          animation: coachx-assistant-pulse-ring 2s ease-out infinite;
        }
        @keyframes coachx-assistant-wave {
          from { transform: scaleY(0.5); }
          to { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
};
