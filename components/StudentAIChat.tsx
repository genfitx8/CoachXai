import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Lesson, ClientProfile, CoachProfile, Homework } from '../types';
import {
  ChevronLeft, Send, Sparkles, Bot, MessageCircle, Target, TrendingUp,
  ListChecks, Dumbbell, HelpCircle, Home, Mic, MicOff, MessageSquare, Volume2, VolumeX,
} from 'lucide-react';
import { CoachXChatMessage } from '../services/coachXService';
import { generateStudentChatResponse } from '../services/geminiService';
import { useLanguage } from './LanguageContext';

type Mode = 'voice' | 'chat';

interface StudentAIChatProps {
  clientProfile: ClientProfile;
  myLessons: Lesson[];
  homeworkList: Homework[];
  coachProfile?: CoachProfile;
  onBack: () => void;
  initialQuery?: string;
}

const SUGGESTED_PROMPTS_KO = [
  { icon: TrendingUp, text: '내 최근 레슨 정리해줘' },
  { icon: Target, text: '오늘 연습 뭐 해야 해?' },
  { icon: Dumbbell, text: '드라이버 거리 늘리는 방법' },
  { icon: ListChecks, text: '코치님 피드백 요약해줘' },
  { icon: TrendingUp, text: '핸디캡 줄이는 방법 알려줘' },
  { icon: HelpCircle, text: '퍼팅 잘하는 팁 알려줘' },
];

const SUGGESTED_PROMPTS_EN = [
  { icon: TrendingUp, text: 'Summarize my recent lessons' },
  { icon: Target, text: "What should I practice today?" },
  { icon: Dumbbell, text: 'How to improve driver distance?' },
  { icon: ListChecks, text: "Summarize my coach's feedback" },
  { icon: TrendingUp, text: 'How to lower my handicap?' },
  { icon: HelpCircle, text: 'Tips for better putting' },
];

const SUGGESTED_PROMPTS_JA = [
  { icon: TrendingUp, text: '最近のレッスンをまとめて' },
  { icon: Target, text: '今日の練習は何をすべき？' },
  { icon: Dumbbell, text: 'ドライバーの飛距離を伸ばす方法' },
  { icon: ListChecks, text: 'コーチのフィードバックをまとめて' },
  { icon: TrendingUp, text: 'ハンディを下げる方法は？' },
  { icon: HelpCircle, text: 'パッティングのコツを教えて' },
];

const TYPING_REVEAL_DURATION_MS = 2000;
const TYPING_TICK_MS = 20;
const INITIAL_QUERY_DELAY_MS = 400;

export const StudentAIChat: React.FC<StudentAIChatProps> = ({
  clientProfile,
  myLessons,
  homeworkList,
  coachProfile,
  onBack,
  initialQuery,
}) => {
  const { language, t } = useLanguage();

  const greeting = language === 'en'
    ? `Hi **${clientProfile.name}**! I'm **CoachX AI**, your personal golf assistant. I've reviewed your **${myLessons.length} lesson records**. What can I help you with today? 🏌️`
    : language === 'ja'
    ? `こんにちは、**${clientProfile.name}**さん！私は**CoachX AI**、あなた専用のゴルフアシスタントです。**${myLessons.length}件のレッスン記録**を確認しました。今日は何でもお気軽にどうぞ！ 🏌️`
    : `안녕하세요, **${clientProfile.name}**님! 저는 **CoachX AI**예요. ${myLessons.length}개의 레슨 기록을 바탕으로 맞춤 조언을 드릴게요. 말씀하시거나 타이핑으로 물어보세요! 🏌️`;

  const [mode, setMode] = useState<Mode>('voice');
  const [messages, setMessages] = useState<CoachXChatMessage[]>([
    { role: 'assistant', content: greeting, timestamp: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [revealedChars, setRevealedChars] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);

  const revealIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestedPrompts =
    language === 'en' ? SUGGESTED_PROMPTS_EN
    : language === 'ja' ? SUGGESTED_PROMPTS_JA
    : SUGGESTED_PROMPTS_KO;

  useEffect(() => {
    synthRef.current = window.speechSynthesis ?? null;
  }, []);

  const clearReveal = useCallback(() => {
    if (revealIntervalRef.current !== null) {
      clearInterval(revealIntervalRef.current);
      revealIntervalRef.current = null;
    }
    setRevealedChars(null);
  }, []);

  useEffect(() => () => {
    clearReveal();
    synthRef.current?.cancel();
    recognitionRef.current?.stop();
  }, [clearReveal]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, revealedChars]);

  useEffect(() => {
    if (!initialQuery) return;
    const timer = setTimeout(() => { void handleSend(initialQuery); }, INITIAL_QUERY_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speak = useCallback((text: string) => {
    if (!synthRef.current || !ttsEnabled) return;
    synthRef.current.cancel();
    const plain = text.replace(/\*\*/g, '').replace(/\n/g, ' ');
    const utter = new SpeechSynthesisUtterance(plain);
    utter.lang = language === 'en' ? 'en-US' : language === 'ja' ? 'ja-JP' : 'ko-KR';
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.onstart = () => setIsSpeaking(true);
    utter.onend = () => setIsSpeaking(false);
    utter.onerror = () => setIsSpeaking(false);
    synthRef.current.speak(utter);
  }, [language, ttsEnabled]);

  const stopSpeaking = useCallback(() => {
    synthRef.current?.cancel();
    setIsSpeaking(false);
  }, []);

  const handleSend = async (text?: string) => {
    const msgText = (text ?? input).trim();
    if (!msgText) return;

    clearReveal();
    stopSpeaking();

    const userMsg: CoachXChatMessage = {
      role: 'user',
      content: msgText,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const lang = (language as 'ko' | 'en' | 'ja') ?? 'ko';
    const reply = await generateStudentChatResponse(msgText, myLessons, clientProfile, homeworkList, lang, coachProfile);
    const assistantMsg: CoachXChatMessage = {
      role: 'assistant',
      content: reply,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, assistantMsg]);
    setIsTyping(false);

    // Speak the response in voice mode
    if (mode === 'voice') {
      speak(reply);
    }

    const totalChars = reply.length;
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
  };

  // ── Voice STT ──────────────────────────────────────────────────────────────

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    setVoiceError(null);
    stopSpeaking();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SRConstructor: (new () => SpeechRecognition) | undefined = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SRConstructor) {
      setVoiceError(
        language === 'en' ? 'This browser does not support speech recognition.'
        : language === 'ja' ? 'このブラウザは音声認識をサポートしていません。'
        : '이 브라우저는 음성 인식을 지원하지 않습니다.'
      );
      return;
    }
    const rec = new SRConstructor();
    rec.lang = language === 'en' ? 'en-US' : language === 'ja' ? 'ja-JP' : 'ko-KR';
    rec.continuous = false;
    rec.interimResults = false;

    rec.onstart = () => setIsListening(true);
    rec.onend = () => setIsListening(false);
    rec.onerror = (e: Event) => {
      setIsListening(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errType = (e as any).error;
      if (errType === 'aborted') return;
      if (errType === 'not-allowed') {
        setVoiceError(
          language === 'en' ? 'Microphone permission denied.'
          : language === 'ja' ? 'マイクのアクセスが拒否されました。'
          : '마이크 권한이 거부되었습니다.'
        );
      } else {
        setVoiceError(
          language === 'en' ? 'Voice recognition error. Please try again.'
          : language === 'ja' ? '音声認識エラーが発生しました。'
          : '음성 인식 중 오류가 발생했어요.'
        );
      }
    };
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0]?.[0]?.transcript ?? '';
      if (transcript) void handleSend(transcript);
    };

    recognitionRef.current = rec;
    rec.start();
  }, [language, stopSpeaking, handleSend]);

  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, stopListening, startListening]);

  const switchMode = useCallback((newMode: Mode) => {
    if (newMode === 'chat') {
      stopListening();
      synthRef.current?.cancel();
      setIsSpeaking(false);
    }
    setMode(newMode);
  }, [stopListening]);

  // ── Render helpers ─────────────────────────────────────────────────────────

  const renderContent = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <p key={i} className={i < lines.length - 1 ? 'mb-1' : ''}>
          {parts.map((part, j) =>
            j % 2 === 1 ? <strong key={j}>{part}</strong> : part
          )}
        </p>
      );
    });
  };

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

  return (
    <div className="flex flex-col bg-gray-950 text-white" style={{ minHeight: '100dvh' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-gray-900/90 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={onBack}
          className="flex items-center gap-1 py-2 px-2.5 rounded-xl hover:bg-white/10 transition-colors min-h-[44px]"
          aria-label={t('back')}
        >
          <ChevronLeft className="w-5 h-5 text-white flex-shrink-0" />
          <span className="text-sm font-semibold text-white">
            {language === 'en' ? 'Home' : language === 'ja' ? 'ホーム' : '대시보드'}
          </span>
        </button>

        <div className="relative w-9 h-9 flex items-center justify-center flex-shrink-0">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 student-ai-pulse" />
          <Sparkles className="relative z-10 w-4 h-4 text-white" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-white">CoachX AI</p>
          <p className="text-xs text-indigo-300 truncate">
            {language === 'en' ? 'Your Personal Golf Assistant'
              : language === 'ja' ? 'パーソナルゴルフアシスタント'
              : '내 전담 골프 AI 어시스턴트'}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-xl p-1 border border-white/10">
          <button
            onClick={() => switchMode('voice')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mode === 'voice' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
            aria-label={language === 'en' ? 'Voice mode' : '음성 모드'}
          >
            <Mic className="w-3.5 h-3.5" />
            {language === 'en' ? 'Voice' : language === 'ja' ? '音声' : '음성'}
          </button>
          <button
            onClick={() => switchMode('chat')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mode === 'chat' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
            aria-label={language === 'en' ? 'Chat mode' : '채팅 모드'}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {language === 'en' ? 'Chat' : language === 'ja' ? 'チャット' : '채팅'}
          </button>
        </div>

        {/* TTS toggle (voice mode only) */}
        {mode === 'voice' && (
          <button
            onClick={() => { setTtsEnabled(p => !p); if (ttsEnabled) stopSpeaking(); }}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label={ttsEnabled ? '음성 출력 끄기' : '음성 출력 켜기'}
          >
            {ttsEnabled
              ? <Volume2 className="w-4 h-4 text-indigo-300" />
              : <VolumeX className="w-4 h-4 text-gray-500" />
            }
          </button>
        )}

        {/* Online indicator */}
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-green-400 font-medium">
            {language === 'en' ? 'Online' : language === 'ja' ? 'オンライン' : '온라인'}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
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
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-gray-800 text-gray-100 rounded-bl-sm'
                }`}
              >
                {renderContent(displayContent)}
                {isRevealing && (
                  <span className="student-ai-cursor inline-block w-0.5 h-3.5 bg-indigo-400 ml-0.5 align-text-bottom" />
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-indigo-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MessageCircle className="w-4 h-4 text-white" />
                </div>
              )}
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

        {/* Suggested prompts — shown only initially */}
        {messages.length <= 1 && (
          <div className="pt-2">
            <p className="text-xs text-gray-500 mb-2">
              {language === 'en' ? 'Try asking...' : language === 'ja' ? 'こんな質問はいかがですか？' : '이런 것도 물어볼 수 있어요'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {suggestedPrompts.map((prompt, i) => {
                const Icon = prompt.icon;
                return (
                  <button
                    key={i}
                    onClick={() => handleSend(prompt.text)}
                    className="flex items-center gap-2 text-xs bg-gray-800 hover:bg-gray-700 border border-white/10 text-gray-300 hover:text-white rounded-xl px-3 py-2.5 transition-colors text-left"
                  >
                    <Icon className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                    <span>{prompt.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Voice error */}
      {voiceError && (
        <div className="mx-4 mb-2 px-3 py-2 bg-red-900/40 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
          <MicOff className="w-3.5 h-3.5 flex-shrink-0" />
          {voiceError}
        </div>
      )}

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
              placeholder={placeholderText}
              className="flex-1 bg-gray-800 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            <button
              onClick={() => void handleSend()}
              disabled={!input.trim() || isTyping || revealedChars !== null}
              aria-label="Send"
              className="w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        ) : (
          /* Voice mode UI */
          <div className="flex flex-col items-center gap-3 py-2">
            {/* Speaking indicator */}
            {isSpeaking && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-900/40 border border-indigo-500/30 rounded-full">
                <div className="flex gap-1 items-center">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div
                      key={i}
                      className="w-1 rounded-full bg-indigo-400"
                      style={{
                        height: '14px',
                        animation: `student-ai-wave 0.6s ease-in-out ${i * 0.08}s infinite alternate`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs text-indigo-300">
                  {language === 'en' ? 'CoachX AI speaking...'
                    : language === 'ja' ? 'CoachX AIが話しています...'
                    : 'CoachX AI 답변 중...'}
                </span>
                <button
                  onClick={stopSpeaking}
                  className="text-indigo-400 hover:text-indigo-200 transition-colors"
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
                  ? 'bg-gray-700 cursor-not-allowed opacity-50'
                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/30 active:scale-95'
              }`}
              aria-label={isListening ? '음성 인식 중지' : '음성 인식 시작'}
            >
              {isListening
                ? <MicOff className="w-8 h-8 text-white" />
                : <Mic className="w-8 h-8 text-white" />
              }
            </button>

            {/* Status text */}
            <p className="text-xs text-gray-400 text-center">
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
                    className="w-1.5 rounded-full bg-indigo-400"
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
      `}</style>
    </div>
  );
};
