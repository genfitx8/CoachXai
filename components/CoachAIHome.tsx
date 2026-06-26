import React, { useState, useRef, useEffect } from 'react';
import { Lesson, ClientProfile, CoachProfile } from '../types';
import { CoachXChatMessage } from '../services/coachXService';
import { generateCoachXChatResponse } from '../services/geminiService';
import { useLanguage } from './LanguageContext';
import { Send, Mic, MicOff, LayoutDashboard, VolumeX, Volume2, MessageSquare } from 'lucide-react';
import { useTypingReveal } from '../hooks/useTypingReveal';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { renderMarkdown } from '../utils/renderMarkdown';

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
}

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
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const lang = (language as 'ko' | 'en' | 'ja') ?? 'ko';
    const reply = await generateCoachXChatResponse(msgText, allLessons, clients, lang);

    setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: Date.now() }]);
    setIsTyping(false);
    speak(reply);
    startReveal(reply);
  };

  const { isListening, voiceError, toggleListening } = useSpeechRecognition({
    language,
    onResult: handleSend,
  });

  const quickChips = language === 'en' ? QUICK_CHIPS_EN : language === 'ja' ? QUICK_CHIPS_JA : QUICK_CHIPS_KO;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#030407] text-white">
      {/* Ambient background */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(56,189,248,0.05),transparent_50%)]" />
        <div className="absolute right-0 bottom-0 h-96 w-96 rounded-full bg-violet-500/8 blur-3xl" />
        <div className="absolute -top-20 left-0 h-80 w-80 rounded-full bg-cyan-500/6 blur-3xl" />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between border-b border-white/8 bg-[#030407]/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-500/10">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-cyan-300" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">CoachX AI</p>
            <p className="text-[10px] text-white/40">
              {language === 'en' ? 'Your golf assistant' : language === 'ja' ? 'ゴルフアシスタント' : '골프 전용 AI 비서'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* TTS toggle */}
          <button
            type="button"
            onClick={() => { if (ttsEnabled) stopSpeaking(); setTtsEnabled(p => !p); }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-white/40 transition-colors hover:border-white/20 hover:text-white/70"
            title={ttsEnabled ? '음성 읽기 끄기' : '음성 읽기 켜기'}
          >
            {ttsEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>

          {/* Dashboard button */}
          <button
            type="button"
            onClick={onNavigateToDashboard}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 backdrop-blur-sm transition-colors hover:border-white/30 hover:text-white"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span>{language === 'en' ? 'Dashboard' : language === 'ja' ? 'ダッシュボード' : '대시보드'}</span>
          </button>
        </div>
      </div>

      {/* Today's schedule strip (only when no user messages yet) */}
      {!userHasSent && todayLessons.length > 0 && (
        <div className="relative z-10 flex gap-2 overflow-x-auto border-b border-white/5 bg-white/2 px-4 py-2.5 scrollbar-hide">
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-white/30 self-center mr-1">
            {language === 'en' ? 'Today' : language === 'ja' ? '今日' : '오늘'}
          </span>
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
        </div>
      )}

      {/* Messages */}
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
                  <div className="mr-2 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-500/10">
                    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 text-cyan-300" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
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
              <div className="mr-2 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-500/10">
                <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 text-cyan-300" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
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

      {/* Input area */}
      <div className="relative z-10 border-t border-white/8 bg-[#030407]/80 px-4 pb-safe pb-4 pt-3 backdrop-blur-md">
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
