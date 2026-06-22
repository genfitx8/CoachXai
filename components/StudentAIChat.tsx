import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Lesson, ClientProfile, CoachProfile, Homework } from '../types';
import { ChevronLeft, Send, Sparkles, Bot, MessageCircle, Target, TrendingUp, ListChecks, Dumbbell, HelpCircle } from 'lucide-react';
import { CoachXChatMessage } from '../services/coachXService';
import { generateStudentChatResponse } from '../services/geminiService';
import { useLanguage } from './LanguageContext';

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
    : `안녕하세요, **${clientProfile.name}**님! 저는 **CoachX AI**예요. ${myLessons.length}개의 레슨 기록을 바탕으로 맞춤 조언을 드릴게요. 무엇이든 물어보세요! 🏌️`;

  const [messages, setMessages] = useState<CoachXChatMessage[]>([
    { role: 'assistant', content: greeting, timestamp: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [revealedChars, setRevealedChars] = useState<number | null>(null);
  const revealIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestedPrompts =
    language === 'en' ? SUGGESTED_PROMPTS_EN
    : language === 'ja' ? SUGGESTED_PROMPTS_JA
    : SUGGESTED_PROMPTS_KO;

  const clearReveal = useCallback(() => {
    if (revealIntervalRef.current !== null) {
      clearInterval(revealIntervalRef.current);
      revealIntervalRef.current = null;
    }
    setRevealedChars(null);
  }, []);

  useEffect(() => () => { clearReveal(); }, [clearReveal]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, revealedChars]);

  useEffect(() => {
    if (!initialQuery) return;
    const timer = setTimeout(() => { void handleSend(initialQuery); }, INITIAL_QUERY_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async (text?: string) => {
    const msgText = (text ?? input).trim();
    if (!msgText) return;

    clearReveal();

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
          className="p-3 rounded-full hover:bg-white/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label={t('back')}
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>

        <div className="relative w-9 h-9 flex items-center justify-center flex-shrink-0">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 student-ai-pulse" />
          <Sparkles className="relative z-10 w-4 h-4 text-white" />
        </div>

        <div className="min-w-0">
          <p className="font-bold text-sm text-white">CoachX AI</p>
          <p className="text-xs text-indigo-300 truncate">
            {language === 'en' ? 'Your Personal Golf Assistant'
              : language === 'ja' ? 'パーソナルゴルフアシスタント'
              : '내 전담 골프 AI 어시스턴트'}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
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

        <div ref={bottomRef} />
      </div>

      {/* Suggested prompts - shown only initially */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2">
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

      {/* Input bar */}
      <div className="px-4 pb-safe pb-4 border-t border-white/10 bg-gray-900/90 backdrop-blur-sm pt-3">
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
      `}</style>
    </div>
  );
};
