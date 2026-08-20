import React, { useState, useRef, useEffect } from 'react';
import { Lesson, ClientProfile, CoachProfile } from '../types';
import { CoachXChatMessage } from '../services/coachXService';
import { generateCoachXChatResponseStream } from '../services/geminiService';
import { useLanguage } from './LanguageContext';
import { Send, Mic, MicOff, LayoutDashboard, VolumeX, Volume2, MessageSquare, Target, ClipboardCheck, Menu, PenSquare, ChevronRight } from 'lucide-react';
import { FEATURES } from '../constants/featureFlags';
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
  onNavigateToDashboard: () => void;
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
   * Opens the during-lesson companion (동반 레슨) — the service's core
   * action, surfaced as the hero CTA on the pre-conversation home.
   */
  onStartLiveLesson?: () => void;
  /** Opens the manual lesson-record form (동반 없이 기록만 남길 때). */
  onNewRecord?: () => void;
}

const INITIAL_QUERY_DELAY_MS = 400;

type Mode = 'chat' | 'voice';

const QUICK_CHIPS_KO = ['오늘 일정 알려줘', '주의 학생 있어?', '이번 주 레슨 요약', '코칭 인사이트 보여줘'];
const QUICK_CHIPS_EN = ["Today's schedule", 'Students needing attention', 'Weekly lesson summary', 'Coaching insights'];
const QUICK_CHIPS_JA = ['今日のスケジュール', '注意が必要な生徒は?', '今週のレッスン要約', 'コーチングインサイト'];

export const CoachAIHome: React.FC<CoachAIHomeProps> = ({
  coachProfile,
  allLessons,
  clients,
  todayLessons,
  onNavigateToDashboard,
  onOpenMenu,
  initialQuery,
  onInitialQueryConsumed,
  onStartLiveLesson,
  onNewRecord,
}) => {
  const { language } = useLanguage();

  const buildGreeting = () => {
    const name = coachProfile.name;
    const count = todayLessons.length;
    if (language === 'en') {
      return count > 0
        ? `Hello, **${name}** coach! You have **${count} lesson${count > 1 ? 's' : ''}** scheduled today. What can I help you with? 🏌️`
        : `Hello, **${name}** coach! No lessons scheduled for today. How can I assist you? 🏌️`;
    }
    if (language === 'ja') {
      return count > 0
        ? `こんにちは、**${name}**コーチ！今日は**${count}件**のレッスンがあります。何かお手伝いできることはありますか？ 🏌️`
        : `こんにちは、**${name}**コーチ！今日のレッスンはありません。何かお手伝いできることはありますか？ 🏌️`;
    }
    return count > 0
      ? `안녕하세요, **${name}** 코치님! 오늘 **${count}개**의 레슨이 예정되어 있습니다. 무엇이든 도와드릴게요 🏌️`
      : `안녕하세요, **${name}** 코치님! 오늘 예정된 레슨이 없네요. 무엇이든 물어보세요 🏌️`;
  };

  const [mode, setMode] = useState<Mode>('chat');
  const [messages, setMessages] = useState<CoachXChatMessage[]>(() => [
    { role: 'assistant', content: buildGreeting(), timestamp: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [userHasSent, setUserHasSent] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { revealedChars, startReveal, clearReveal } = useTypingReveal(1800);
  const { isSpeaking, speak, stopSpeaking } = useTextToSpeech(language, ttsEnabled && mode === 'voice');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, revealedChars]);

  const handleSend = async (text?: string) => {
    const msgText = (text ?? input).trim();
    if (!msgText || isTyping) return;

    clearReveal();
    stopSpeaking();
    setUserHasSent(true);

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

    const lang = (language as 'ko' | 'en' | 'ja') ?? 'ko';
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

  const quickChips = language === 'en' ? QUICK_CHIPS_EN : language === 'ja' ? QUICK_CHIPS_JA : QUICK_CHIPS_KO;

  // 8b · Coach's pending-review pile — lessons the coach hasn't approved
  // yet. Legacy pre-8b lessons (approval_status === undefined) don't
  // count as "pending" since they were never routed through the review
  // gate; only explicit 'draft' rows show up.
  const draftCount = allLessons.reduce(
    (n, l) => (l.approvalStatus === 'draft' ? n + 1 : n),
    0
  );

  return (
    <div
      className="fixed inset-x-0 top-0 z-30 flex flex-col bg-base text-white pt-safe"
      // This shell reaches the top of the screen — App.tsx drops its own
      // header on this view — so `pt-safe` is what keeps the row below off
      // the status bar / notch.
      //
      // Stop above the bottom nav so the tab bar remains visible on the coach
      // home. Nav sits at z-50; the home shell stays under it as a
      // defense-in-depth (nav still wins even if this stops flush at bottom-0
      // in some transition). The stop reads the same token the nav sizes
      // itself with — the literal 4rem it used to hard-code missed the bar's
      // own top hairline, leaving the input row's last pixel underneath it.
      style={{
        bottom: 'calc(var(--coach-nav-height) + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {/* Ambient background */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(56,189,248,0.05),transparent_50%)]" />
        <div className="absolute right-0 bottom-0 h-96 w-96 rounded-full bg-emerald-500/8 blur-3xl" />
        <div className="absolute -top-20 left-0 h-80 w-80 rounded-full bg-cyan-500/6 blur-3xl" />
      </div>

      {/* Header. This is the only header on the 대화 tab, so it carries the
          hamburger — the same arrangement the student 대화 tab uses. */}
      <div className="relative z-10 flex items-center gap-2 border-b border-white/8 bg-base/80 px-4 py-3 backdrop-blur-md">
        {onOpenMenu && (
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Open menu"
            className="-ml-2 flex-shrink-0 rounded-lg p-2 text-white transition-colors hover:bg-white/10"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        <div className="flex min-w-0 items-center gap-2.5">
          <CoachXMarkLive size={22} tone="dark" active={isTyping} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">CoachX AI</p>
            <p className="truncate text-[10px] text-white/40">
              {language === 'en' ? 'Your golf assistant' : language === 'ja' ? 'ゴルフアシスタント' : '골프 전용 AI 비서'}
            </p>
          </div>
        </div>

        {/* Actions. The two chips drop their labels on narrow phones so the
            row still fits at 360px now that the hamburger shares it — the
            icon plus the title/aria-label still names each one. */}
        <div className="ml-auto flex flex-shrink-0 items-center gap-2">
          {/* TTS toggle */}
          <button
            type="button"
            onClick={() => { if (ttsEnabled) stopSpeaking(); setTtsEnabled(p => !p); }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-white/40 transition-colors hover:border-white/20 hover:text-white/70"
            title={ttsEnabled ? '음성 읽기 끄기' : '음성 읽기 켜기'}
          >
            {ttsEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>

          {/* Swing analysis quick link — opens the standalone /swing.html
              entry so coaches can jump straight into pose + club metrics
              without going through client selection. Gated off in the
              companion-lesson-first relaunch; 스윙 분석 is reached inside
              동반 레슨 instead. */}
          {FEATURES.swingAnalysisShortcut && (
          <a
            href="/swing.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 backdrop-blur-sm transition-colors hover:border-emerald-300/60 hover:bg-emerald-500/20 hover:text-emerald-50"
            title={
              language === 'en'
                ? 'Analyze a swing video (opens in new tab)'
                : language === 'ja'
                  ? 'スイング動画を解析(新しいタブで開く)'
                  : '스윙 비디오 분석 (새 탭에서 열림)'
            }
          >
            <Target className="h-3.5 w-3.5" />
            <span className="hidden min-[420px]:inline">
              {language === 'en' ? 'Swing' : language === 'ja' ? 'スイング' : '스윙 분석'}
            </span>
          </a>
          )}

          {/* Dashboard button */}
          <button
            type="button"
            onClick={onNavigateToDashboard}
            aria-label={language === 'en' ? 'Dashboard' : language === 'ja' ? 'ダッシュボード' : '대시보드'}
            title={language === 'en' ? 'Dashboard' : language === 'ja' ? 'ダッシュボード' : '대시보드'}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 backdrop-blur-sm transition-colors hover:border-white/30 hover:text-white"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span className="hidden min-[420px]:inline">
              {language === 'en' ? 'Dashboard' : language === 'ja' ? 'ダッシュボード' : '대시보드'}
            </span>
          </button>
        </div>
      </div>

      {/* Today's schedule strip + pending-review chip (only when no user
          messages yet). Both live in the same horizontal band so the
          "start of the day" glance shows scheduled lessons AND the
          approval backlog side-by-side without competing rows. */}
      {!userHasSent && (todayLessons.length > 0 || draftCount > 0) && (
        <div className="relative z-10 flex gap-2 overflow-x-auto border-b border-white/5 bg-white/2 px-4 py-2.5 scrollbar-hide">
          {todayLessons.length > 0 && (
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-white/30 self-center mr-1">
              {language === 'en' ? 'Today' : language === 'ja' ? '今日' : '오늘'}
            </span>
          )}
          {todayLessons.slice(0, 5).map((lesson) => (
            <button
              key={lesson.id}
              type="button"
              onClick={() => void handleSend(
                language === 'en' ? `Tell me about today's lesson with ${lesson.clientName}`
                : language === 'ja' ? `${lesson.clientName}さんの今日のレッスンについて教えて`
                : `${lesson.clientName} 학생 오늘 레슨 어때?`
              )}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60 transition-colors hover:border-cyan-300/30 hover:bg-cyan-500/10 hover:text-cyan-200"
            >
              <span className="font-mono text-[10px] text-cyan-400/70">{lesson.time}</span>
              <span>{lesson.clientName}</span>
            </button>
          ))}
          {draftCount > 0 && (
            <button
              type="button"
              onClick={() => void handleSend(
                language === 'en'
                  ? `Show me my ${draftCount} lesson${draftCount > 1 ? 's' : ''} pending approval.`
                  : language === 'ja'
                    ? `未承認のレッスン${draftCount}件を教えて`
                    : `승인 대기 중인 레슨 ${draftCount}건 알려줘`
              )}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100 transition-colors hover:border-amber-300/60 hover:bg-amber-500/20"
            >
              <ClipboardCheck className="h-3 w-3 text-amber-300" />
              <span>
                {language === 'en'
                  ? `${draftCount} to review`
                  : language === 'ja'
                    ? `未承認 ${draftCount}件`
                    : `미승인 ${draftCount}건`}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-lg space-y-4">
          {/* 동반 레슨 hero — 서비스의 핵심 동작을 대화가 시작되기 전
              첫 화면의 가장 큰 표면으로 둔다. 대화가 시작되면 숨겨져
              채팅에 집중할 수 있게 한다. */}
          {!userHasSent && onStartLiveLesson && (
            <div className="animate-fade-in-up rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent p-5 shadow-lg shadow-emerald-950/30">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-300/25">
                  <Mic className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold tracking-tight text-white">
                    {language === 'en' ? 'Live lesson companion' : language === 'ja' ? '同伴レッスン' : '동반 레슨'}
                  </h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/55">
                    {language === 'en'
                      ? 'CoachX joins your lesson — it listens, captures key moments, and drafts the lesson record for you.'
                      : language === 'ja'
                        ? 'CoachXがレッスンに同伴し、会話を聞き取り、記録の下書きまで作成します。'
                        : 'CoachX가 레슨에 함께합니다 — 대화를 듣고 순간을 캡처해 레슨 기록 초안까지 정리해 드려요.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onStartLiveLesson}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-md shadow-emerald-900/40 transition-colors hover:bg-emerald-500 active:scale-[0.99]"
              >
                <Mic className="h-4 w-4" />
                {language === 'en' ? 'Start a live lesson' : language === 'ja' ? '同伴レッスンを開始' : '동반 레슨 시작'}
              </button>
              {onNewRecord && (
                <button
                  type="button"
                  onClick={onNewRecord}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
                >
                  <PenSquare className="h-3.5 w-3.5" />
                  {language === 'en' ? 'Just write a lesson record' : language === 'ja' ? '記録だけ書く' : '동반 없이 기록만 작성'}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

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
                      ? 'rounded-tr-sm bg-cyan-600/25 text-white border border-cyan-500/20'
                      : 'rounded-tl-sm bg-white/6 text-white/85 border border-white/8'
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

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex animate-fade-in justify-start">
              <div className="mr-2 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center">
                <CoachXMarkLive size={18} tone="dark" active />
              </div>
              <div className="rounded-2xl rounded-tl-sm border border-white/8 bg-white/6 px-4 py-3">
                <div className="flex gap-1 items-center">
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

          {/* Quick chips (only before first user message) */}
          {!userHasSent && !isTyping && (
            <div className="flex flex-wrap gap-2 pt-1 animate-fade-in">
              {quickChips.map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => void handleSend(chip)}
                  className="rounded-full border border-white/12 bg-white/4 px-3.5 py-1.5 text-xs text-white/55 transition-colors hover:border-cyan-300/30 hover:bg-cyan-500/8 hover:text-cyan-200"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Voice error */}
      {voiceError && (
        <div className="relative z-10 mx-4 mb-2 flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-900/20 px-3 py-2 text-xs text-red-300">
          <MicOff className="h-3.5 w-3.5 shrink-0" />
          {voiceError}
        </div>
      )}

      {/* Input area.
          Pairing the safe-area class with a `pb-4` read like "gutter, and more
          on a notched phone" but did the opposite: `.pb-safe` is unlayered CSS
          and outranks Tailwind's layered padding, so the gutter collapsed to
          the raw inset — 0px wherever the platform reports none. No inset is
          wanted here anyway;
          this shell already stops above the nav, and the nav owns the inset. */}
      <div className="relative z-10 border-t border-white/8 bg-base/80 px-4 pb-4 pt-3 backdrop-blur-md">
        {/* Mode toggle */}
        <div className="mb-3 flex justify-center">
          <div className="flex rounded-full border border-white/10 bg-white/4 p-0.5">
            <button
              type="button"
              onClick={() => setMode('chat')}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                mode === 'chat' ? 'bg-white/12 text-white' : 'text-white/35 hover:text-white/60'
              }`}
            >
              <MessageSquare className="h-3 w-3" />
              {language === 'en' ? 'Chat' : language === 'ja' ? 'チャット' : '채팅'}
            </button>
            <button
              type="button"
              onClick={() => setMode('voice')}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                mode === 'voice' ? 'bg-white/12 text-white' : 'text-white/35 hover:text-white/60'
              }`}
            >
              <Mic className="h-3 w-3" />
              {language === 'en' ? 'Voice' : language === 'ja' ? '音声' : '음성'}
            </button>
          </div>
        </div>

        {mode === 'chat' ? (
          <div className="mx-auto flex max-w-lg gap-2 items-end">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
              placeholder={
                language === 'en' ? 'Ask CoachX AI anything...'
                : language === 'ja' ? 'CoachX AIに何でも聞いてください...'
                : 'CoachX AI에게 무엇이든 물어보세요...'
              }
              className="flex-1 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white placeholder-white/25 outline-none backdrop-blur-sm transition-colors focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!input.trim() || isTyping}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="전송"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="mx-auto flex max-w-lg flex-col items-center gap-3 py-1">
            {isSpeaking && (
              <div className="flex items-center gap-2 rounded-full border border-cyan-500/25 bg-cyan-900/20 px-3 py-1.5">
                <div className="flex gap-0.5 items-center">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div
                      key={i}
                      className="w-0.5 rounded-full bg-cyan-400"
                      style={{ height: '12px', animation: `coachxOrbDrift 0.6s ease-in-out ${i * 80}ms infinite alternate` }}
                    />
                  ))}
                </div>
                <span className="text-xs text-cyan-300">
                  {language === 'en' ? 'CoachX AI speaking...' : language === 'ja' ? 'CoachX AI 話しています...' : 'CoachX AI 말하는 중...'}
                </span>
                <button onClick={stopSpeaking} className="text-cyan-400 hover:text-cyan-200 transition-colors" aria-label="음성 중지">
                  <VolumeX className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={toggleListening}
              disabled={isTyping}
              className={`h-20 w-20 rounded-full flex items-center justify-center transition-all shadow-lg ${
                isListening
                  ? 'bg-red-500 shadow-red-500/40 scale-110 hover:bg-red-400'
                  : isTyping
                  ? 'bg-white/8 cursor-not-allowed opacity-50'
                  : 'bg-cyan-600 shadow-cyan-500/30 hover:bg-cyan-500 active:scale-95'
              }`}
              aria-label={isListening ? '음성 인식 중지' : '음성 인식 시작'}
            >
              {isListening ? <MicOff className="h-8 w-8 text-white" /> : <Mic className="h-8 w-8 text-white" />}
            </button>

            <p className="text-xs text-white/30 text-center">
              {isTyping
                ? (language === 'en' ? 'CoachX AI is thinking...' : language === 'ja' ? 'CoachX AIが考えています...' : 'CoachX AI 생각 중...')
                : isListening
                ? (language === 'en' ? 'Listening... tap to stop' : language === 'ja' ? '聴いています... タップで停止' : '듣는 중... 탭해서 중지')
                : (language === 'en' ? 'Tap to speak' : language === 'ja' ? 'タップして話す' : '탭해서 말하기')}
            </p>

            {isListening && (
              <div className="flex gap-1.5 items-center">
                {[0, 1, 2, 3, 4, 5, 6].map(i => (
                  <div
                    key={i}
                    className="w-1 rounded-full bg-cyan-400/60"
                    style={{ height: `${8 + (i % 3) * 7}px`, animation: `coachxOrbDrift 0.5s ease-in-out ${i * 70}ms infinite alternate` }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
