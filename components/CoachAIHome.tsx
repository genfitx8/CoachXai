import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Lesson, ClientProfile, CoachProfile } from '../types';
import { CoachXChatMessage } from '../services/coachXService';
import { generateCoachXChatResponseStream } from '../services/geminiService';
import { useLanguage } from './LanguageContext';
import {
  Send, Mic, MicOff, VolumeX, Menu, PenSquare, ChevronRight, Search, Video,
} from 'lucide-react';
import { useTypingReveal } from '../hooks/useTypingReveal';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { renderMarkdown } from '../utils/renderMarkdown';
import { CoachXMark, CoachXMarkLive } from './ui';

export interface TodayLessonSummary {
  id: string;
  clientName: string;
  time: string;
  title: string;
  status: 'scheduled' | 'completed';
}

interface CoachAIHomeProps {
  coachProfile: CoachProfile;
  allLessons: Lesson[];
  clients: ClientProfile[];
  todayLessons: TodayLessonSummary[];
  /**
   * Opens the coach hamburger drawer. This screen covers the app shell's
   * header, so — exactly like the student 대화 tab — it has to carry the
   * menu entry itself; App.tsx stops rendering its own header here.
   */
  onOpenMenu?: () => void;
  /**
   * When provided, auto-sent as the first user message on mount. Used by
   * "ask about this member" entry points from the dashboard, member list,
   * and student detail — after the unification, every AI entry point
   * lands here rather than opening a separate chat surface.
   */
  initialQuery?: string;
  /** Cleared once the initial query has been consumed. */
  onInitialQueryConsumed?: () => void;
  /**
   * Starts the during-lesson companion (동반 레슨) — the service's core
   * action. With a student name the companion opens directly on that
   * student; without one it falls back to the picker view. The agent
   * proposes this the moment the coach logs in, and the in-conversation
   * student cards call it with the chosen name.
   */
  onStartLiveLesson?: (studentName?: string) => void;
  /** Opens the manual lesson-record form (동반 없이 기록만 남길 때). */
  onNewRecord?: () => void;
  /**
   * 음성 읽기 on/off. The toggle itself lives in the coach drawer now, so
   * the preference is owned by the shell and handed down here.
   */
  ttsEnabled?: boolean;
}

const INITIAL_QUERY_DELAY_MS = 400;

/**
 * The conversation drives everything: the agent opens with a greeting and a
 * 동반 레슨 proposal card, accepting expands an in-thread student picker,
 * and anything typed or spoken drops into the normal agent chat. There is
 * no tab bar — this surface IS the app.
 */
type Phase = 'proposal' | 'picking' | 'chat';

export const CoachAIHome: React.FC<CoachAIHomeProps> = ({
  coachProfile,
  allLessons,
  clients,
  todayLessons,
  onOpenMenu,
  initialQuery,
  onInitialQueryConsumed,
  onStartLiveLesson,
  onNewRecord,
  ttsEnabled = true,
}) => {
  const { language } = useLanguage();
  const lang = (language as 'ko' | 'en' | 'ja') ?? 'ko';

  const t3 = (ko: string, en: string, ja: string) =>
    lang === 'en' ? en : lang === 'ja' ? ja : ko;

  const buildGreeting = () => {
    const name = coachProfile.name;
    const count = todayLessons.length;
    if (lang === 'en') {
      return count > 0
        ? `Hello, **${name}** coach! You have **${count} lesson${count > 1 ? 's' : ''}** scheduled today.`
        : `Hello, **${name}** coach! No lessons scheduled for today.`;
    }
    if (lang === 'ja') {
      return count > 0
        ? `こんにちは、**${name}**コーチ！今日は**${count}件**のレッスンがあります。`
        : `こんにちは、**${name}**コーチ！今日のレッスンはありません。`;
    }
    return count > 0
      ? `안녕하세요, **${name}** 코치님! 오늘 **${count}개**의 레슨이 예정되어 있어요.`
      : `안녕하세요, **${name}** 코치님! 오늘 예정된 레슨은 없어요.`;
  };

  const [phase, setPhase] = useState<Phase>(initialQuery ? 'chat' : 'proposal');
  const [messages, setMessages] = useState<CoachXChatMessage[]>(() => [
    { role: 'assistant', content: buildGreeting(), timestamp: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [userHasSent, setUserHasSent] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { revealedChars, startReveal, clearReveal } = useTypingReveal(1800);
  const { isSpeaking, speak, stopSpeaking } = useTextToSpeech(language, ttsEnabled);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, revealedChars, phase]);

  // Turning 음성 읽기 off in the drawer must silence whatever is mid-sentence.
  useEffect(() => {
    if (!ttsEnabled) stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsEnabled]);

  const handleSend = async (text?: string) => {
    const msgText = (text ?? input).trim();
    if (!msgText || isTyping) return;

    clearReveal();
    stopSpeaking();
    setUserHasSent(true);
    setPhase('chat');

    const userMsg: CoachXChatMessage = { role: 'user', content: msgText, timestamp: Date.now() };
    // Assistant placeholder with a unique timestamp so onChunk can update
    // this specific message in-place — matches the CoachXChat pattern so
    // streaming feels the same across every chat surface.
    const assistantTs = Date.now() + 1;
    setMessages(prev => [
      ...prev,
      userMsg,
      { role: 'assistant', content: '', timestamp: assistantTs },
    ]);
    setInput('');
    setIsTyping(true);

    const reply = await generateCoachXChatResponseStream(
      msgText,
      allLessons,
      clients,
      (_delta, accumulated) => {
        setMessages(prev =>
          prev.map(m =>
            m.timestamp === assistantTs && m.role === 'assistant'
              ? { ...m, content: accumulated }
              : m
          )
        );
      },
      lang,
    );

    // Final content correction — the heuristic fallback path delivers the
    // full text as one onChunk call, this ensures the placeholder shows it.
    setMessages(prev =>
      prev.map(m =>
        m.timestamp === assistantTs && m.role === 'assistant'
          ? { ...m, content: reply }
          : m
      )
    );
    setIsTyping(false);
    speak(reply);
    // Skip the client-side typing reveal — streaming already produced that effect.
  };

  const { isListening, voiceError, toggleListening } = useSpeechRecognition({
    language,
    onResult: handleSend,
  });

  // Auto-send the initial query once on mount so member-card / dashboard
  // deep-links land in the same chat surface instead of opening a
  // separate one. Consumed callback lets the parent clear its pending
  // query so a later back-and-forth navigation doesn't refire it.
  useEffect(() => {
    if (!initialQuery) return;
    const timer = setTimeout(() => {
      void handleSend(initialQuery);
      onInitialQueryConsumed?.();
    }, INITIAL_QUERY_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * "네, 동반 시작" — stays inside the conversation: the acceptance and the
   * agent's follow-up question are appended as ordinary messages, then the
   * in-thread student picker card renders after them.
   */
  const handleAcceptProposal = () => {
    const now = Date.now();
    const nearest = todayLessons[0];
    const followUp = nearest
      ? t3(
          `좋아요! 누구와 함께하나요? 지금 시간엔 **${nearest.clientName}** 님 예약이 있어요.`,
          `Great! Who are we coaching? **${nearest.clientName}** is booked around now.`,
          `いいですね！どなたとご一緒しますか？**${nearest.clientName}**さんの予約があります。`,
        )
      : t3(
          '좋아요! 누구와 함께하나요?',
          'Great! Who are we coaching?',
          'いいですね！どなたとご一緒しますか？',
        );
    setMessages(prev => [
      ...prev,
      { role: 'user', content: t3('네, 동반 시작할게요', "Yes, let's start", 'はい、始めましょう'), timestamp: now },
      { role: 'assistant', content: followUp, timestamp: now + 1 },
    ]);
    setPickerQuery('');
    setPhase('picking');
  };

  /**
   * Students for the in-thread picker: today's booked students first (they
   * carry their reservation time), then the rest of this coach's roster.
   */
  const rankedStudents = useMemo(() => {
    const roster = clients.filter(
      (c) => !c.coachId || c.coachId === coachProfile.id
    );
    const todayNames = new Set(todayLessons.map((l) => l.clientName));
    const today = todayLessons.map((l) => ({
      name: l.clientName,
      meta: l.time || t3('오늘 예약', 'Booked today', '本日予約'),
      booked: true,
    }));
    const rest = roster
      .filter((c) => !todayNames.has(c.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ name: c.name, meta: '', booked: false }));
    return [...today, ...rest];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, todayLessons, coachProfile.id]);

  const filteredStudents = pickerQuery.trim()
    ? rankedStudents.filter((s) => s.name.includes(pickerQuery.trim()))
    : rankedStudents;

  const showProposal = phase === 'proposal' && !userHasSent && !!onStartLiveLesson;
  const showPicker = phase === 'picking' && !!onStartLiveLesson;

  return (
    <div
      // Single conversational surface — no tab bar below it any more, so the
      // shell reaches the bottom edge; the input dock owns the home-indicator
      // inset itself. `pt-safe` keeps the header row off the notch.
      className="fixed inset-x-0 top-0 bottom-0 z-30 flex flex-col bg-base text-white pt-safe"
    >
      {/* Ambient background — brand emerald, layered depth */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(16,185,129,0.07),transparent_55%)]" />
        <div className="absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -top-24 -left-16 h-80 w-80 rounded-full bg-emerald-400/6 blur-3xl" />
      </div>

      {/* Header. Deliberately bare — a single hamburger, no wordmark and no
          action buttons. 대시보드 / 음성 읽기 live inside the drawer now, so
          the conversation itself is the only thing on screen. */}
      <div className="relative z-10 flex items-center px-2 py-2">
        {onOpenMenu && (
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Open menu"
            className="flex-shrink-0 rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Conversation */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-lg space-y-4">
          {messages.map((msg, idx) => {
            const isLast = idx === messages.length - 1;
            const displayContent =
              msg.role === 'assistant' && isLast && revealedChars !== null
                ? msg.content.slice(0, revealedChars)
                : msg.content;

            return (
              <div
                key={msg.timestamp}
                className={`flex animate-fade-in-up ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="mr-2 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center">
                    <CoachXMark size={18} tone="dark" />
                  </div>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'rounded-tr-sm border border-emerald-500/25 bg-emerald-600/20 text-white'
                      : 'rounded-tl-sm border border-white/8 bg-white/6 text-white/85'
                  }`}
                >
                  {renderMarkdown(displayContent)}
                  {msg.role === 'assistant' && isLast && revealedChars !== null && (
                    <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-white/50 align-middle" />
                  )}
                </div>
              </div>
            );
          })}

          {/* The agent's opening proposal — the service's core action,
              delivered as a message-side card rather than app chrome. */}
          {showProposal && (
            <div className="flex animate-fade-in-up justify-start">
              <div className="mr-2 mt-0.5 h-7 w-7 shrink-0" />
              <div className="w-full max-w-[320px] overflow-hidden rounded-2xl rounded-tl-sm border border-emerald-400/30 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent shadow-lg shadow-emerald-950/40 backdrop-blur-sm">
                <div className="flex items-start gap-3 px-4 pt-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-500/20 text-emerald-300">
                    <Mic className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold leading-snug tracking-tight text-white">
                      {t3('레슨 동반을 시작하시겠습니까?', 'Shall we start a live lesson?', '同伴レッスンを始めますか？')}
                    </h2>
                  </div>
                </div>
                <div className="flex flex-col gap-2 p-4">
                  <button
                    type="button"
                    onClick={handleAcceptProposal}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-md shadow-emerald-900/40 transition-colors hover:bg-emerald-500 active:scale-[0.99]"
                  >
                    <Mic className="h-4 w-4" />
                    {t3('네, 동반 시작', "Yes, let's start", 'はい、始める')}
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSend(t3('오늘 브리핑 해줘', "Give me today's briefing", '今日のブリーフィングをして'))}
                      className="flex h-10 flex-1 items-center justify-center rounded-xl border border-white/12 text-xs font-semibold text-white/60 transition-colors hover:border-white/25 hover:bg-white/5 hover:text-white/85"
                    >
                      {t3('오늘 브리핑', "Today's briefing", '本日ブリーフィング')}
                    </button>
                    {onNewRecord && (
                      <button
                        type="button"
                        onClick={onNewRecord}
                        className="flex h-10 flex-1 items-center justify-center gap-1 rounded-xl border border-white/12 text-xs font-semibold text-white/60 transition-colors hover:border-white/25 hover:bg-white/5 hover:text-white/85"
                      >
                        <PenSquare className="h-3 w-3" />
                        {t3('기록만 작성', 'Just a record', '記録だけ')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* In-thread student picker — accepting the proposal asks "누구와
              함께하나요?" and answers arrive as cards, not a separate screen. */}
          {showPicker && (
            <div className="flex animate-fade-in-up justify-start">
              <div className="mr-2 mt-0.5 h-7 w-7 shrink-0" />
              <div className="w-full max-w-[320px] space-y-2">
                {filteredStudents.slice(0, 5).map((s, i) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => onStartLiveLesson?.(s.name)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.99] ${
                      s.booked && i === 0
                        ? 'border-emerald-400/40 bg-emerald-500/12 shadow-md shadow-emerald-950/30 hover:bg-emerald-500/20'
                        : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
                    }`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${
                      s.booked ? 'border-emerald-300/30 bg-emerald-500/15 text-emerald-200' : 'border-white/15 bg-white/8 text-white/60'
                    }`}>
                      {s.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">{s.name}</span>
                      {s.meta && (
                        <span className="block text-[11px] text-emerald-300/80">
                          {s.meta} {t3('예약', 'booked', '予約')}
                        </span>
                      )}
                    </span>
                    {s.booked && i === 0 ? (
                      <span className="flex h-9 shrink-0 items-center rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white">
                        {t3('바로 시작', 'Start', '開始')}
                      </span>
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
                    )}
                  </button>
                ))}

                {/* Roster search */}
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/4 px-4 py-2.5">
                  <Search className="h-4 w-4 shrink-0 text-white/30" />
                  <input
                    type="text"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder={t3('다른 학생 검색…', 'Search students…', '他の生徒を検索…')}
                    className="w-full bg-transparent text-sm text-white placeholder-white/30 outline-none"
                  />
                </div>
                {filteredStudents.length === 0 && (
                  <p className="px-2 text-xs text-white/35">
                    {t3('일치하는 학생이 없어요. 이름 그대로 새 학생과 시작할까요?', 'No matching student. Start with a new student under this name?', '該当する生徒がいません。この名前で新しく始めますか？')}
                  </p>
                )}
                {filteredStudents.length === 0 && pickerQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => onStartLiveLesson?.(pickerQuery.trim())}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-emerald-400/40 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/10"
                  >
                    <Video className="h-4 w-4" />
                    {t3(`"${pickerQuery.trim()}" 학생과 시작`, `Start with "${pickerQuery.trim()}"`, `「${pickerQuery.trim()}」さんと開始`)}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex animate-fade-in justify-start">
              <div className="mr-2 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center">
                <CoachXMarkLive size={18} tone="dark" active />
              </div>
              <div className="rounded-2xl rounded-tl-sm border border-white/8 bg-white/6 px-4 py-3">
                <div className="flex items-center gap-1">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-white/40"
                      style={{ animation: `coachxOrbDrift 1s ease-in-out ${i * 200}ms infinite alternate` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Voice / speaking status */}
      {voiceError && (
        <div className="relative z-10 mx-4 mb-2 flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-900/20 px-3 py-2 text-xs text-red-300">
          <MicOff className="h-3.5 w-3.5 shrink-0" />
          {voiceError}
        </div>
      )}
      {isSpeaking && (
        <div className="relative z-10 mx-auto mb-2 flex w-fit items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-900/25 px-3 py-1.5">
          <div className="flex items-center gap-0.5">
            {[0, 1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="w-0.5 rounded-full bg-emerald-400"
                style={{ height: '12px', animation: `coachxOrbDrift 0.6s ease-in-out ${i * 80}ms infinite alternate` }}
              />
            ))}
          </div>
          <span className="text-xs text-emerald-300">
            {t3('CoachX 말하는 중…', 'CoachX speaking…', 'CoachX 話しています…')}
          </span>
          <button onClick={stopSpeaking} className="text-emerald-400 transition-colors hover:text-emerald-200" aria-label="음성 중지">
            <VolumeX className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Re-entry to the companion once the conversation has moved on */}
      {!showProposal && !showPicker && onStartLiveLesson && (
        <div className="relative z-10 mb-2 flex justify-center">
          <button
            type="button"
            onClick={() => onStartLiveLesson()}
            className="flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-200 backdrop-blur-sm transition-colors hover:bg-emerald-500/20 hover:text-emerald-50"
          >
            <Mic className="h-3 w-3" />
            {t3('동반 레슨 시작', 'Start live lesson', '同伴レッスン開始')}
          </button>
        </div>
      )}

      {/* Input dock — voice-first: mic is the primary affordance, send takes
          over once there is text. The dock owns the home-indicator inset now
          that no tab bar sits below. */}
      <div
        className="relative z-10 border-t border-white/8 bg-base/80 px-4 pt-3 backdrop-blur-md"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)' }}
      >
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
            placeholder={
              isListening
                ? t3('듣는 중…', 'Listening…', '聞いています…')
                : t3('CoachX에게 물어보기', 'Ask CoachX', 'CoachXに聞く')
            }
            className="h-12 flex-1 rounded-full border border-white/10 bg-white/6 px-4 text-sm text-white placeholder-white/25 outline-none backdrop-blur-sm transition-colors focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20"
          />
          {input.trim() ? (
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={isTyping}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md shadow-emerald-900/40 transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label={t3('전송', 'Send', '送信')}
            >
              <Send className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleListening}
              disabled={isTyping}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-md transition-all ${
                isListening
                  ? 'scale-105 bg-red-500 shadow-red-900/40 hover:bg-red-400'
                  : 'bg-emerald-600 shadow-emerald-900/40 hover:bg-emerald-500'
              } text-white disabled:cursor-not-allowed disabled:opacity-35`}
              aria-label={isListening ? t3('음성 인식 중지', 'Stop listening', '音声認識を停止') : t3('음성으로 말하기', 'Speak', '音声で話す')}
            >
              {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
