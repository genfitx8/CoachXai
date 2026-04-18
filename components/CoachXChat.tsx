import React, { useState, useRef, useEffect } from 'react';
import { Lesson, ClientProfile, CoachProfile } from '../types';
import { ChevronLeft, Send, Sparkles, Bot } from 'lucide-react';
import { generateHeuristicResponse, CoachXChatMessage } from '../services/coachXService';
import { useLanguage } from './LanguageContext';

interface CoachXChatProps {
  coachProfile: CoachProfile;
  allLessons: Lesson[];
  clients: ClientProfile[];
  onBack: () => void;
}

const SUGGESTED_PROMPTS_KO = [
  '다음 레슨 추천해줘',
  '내 레슨 패턴 분석해줘',
  '회원 성장 요약 알려줘',
  '커리큘럼 추천해줘',
  '코치 성장 방법 알려줘',
  '슬라이스 교정 가이드',
];

const SUGGESTED_PROMPTS_EN = [
  'Recommend my next lesson',
  'Analyze my lesson patterns',
  'Summarize member progress',
  'Suggest a curriculum plan',
  'How can I grow as a coach?',
  'Slice correction guide',
];

const SUGGESTED_PROMPTS_JA = [
  '次のレッスンを提案して',
  'レッスンパターンを分析して',
  '会員の成長をまとめて',
  'カリキュラムを提案して',
  'コーチ成長のヒントは？',
  'スライス矯正ガイド',
];

export const CoachXChat: React.FC<CoachXChatProps> = ({
  coachProfile,
  allLessons,
  clients,
  onBack,
}) => {
  const { language, t } = useLanguage();
  const [messages, setMessages] = useState<CoachXChatMessage[]>([
    {
      role: 'assistant',
      content: language === 'en'
        ? `Hello, Coach ${coachProfile.name}! I'm **CoachX**, your AI coaching intelligence. I've analyzed **${allLessons.length} lesson records** and **${new Set(allLessons.map(l => l.clientName + l.clientPhone)).size} members**. What would you like to know? 🏌️`
        : language === 'ja'
        ? `こんにちは、${coachProfile.name}コーチ！私は**CoachX**、AIコーチングアシスタントです。**${allLessons.length}件のレッスン記録**と**${new Set(allLessons.map(l => l.clientName + l.clientPhone)).size}名の会員**データを分析しました。何でも聞いてください！ 🏌️`
        : `안녕하세요, ${coachProfile.name} 코치님! 저는 **CoachX**입니다. 현재 **${allLessons.length}개의 레슨 기록**과 **${new Set(allLessons.map(l => l.clientName + l.clientPhone)).size}명의 회원** 데이터를 분석하고 있습니다. 무엇이든 물어보세요! 🏌️`,
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const suggestedPrompts =
    language === 'en' ? SUGGESTED_PROMPTS_EN
    : language === 'ja' ? SUGGESTED_PROMPTS_JA
    : SUGGESTED_PROMPTS_KO;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async (text?: string) => {
    const msgText = (text ?? input).trim();
    if (!msgText) return;

    const userMsg: CoachXChatMessage = {
      role: 'user',
      content: msgText,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Simulate a short "thinking" delay then produce heuristic response
    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 400));

    const reply = generateHeuristicResponse(msgText, allLessons, clients);
    const assistantMsg: CoachXChatMessage = {
      role: 'assistant',
      content: reply,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, assistantMsg]);
    setIsTyping(false);
  };

  /** Render markdown-like bold (**text**) and line breaks */
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

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white" style={{ minHeight: '100dvh' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-gray-900/90 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={onBack}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
          aria-label={t('back')}
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>

        {/* CoachX icon (mini) */}
        <div className="relative w-9 h-9 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 coachx-pulse" />
          <Sparkles className="relative z-10 w-4 h-4 text-white" />
        </div>

        <div>
          <p className="font-bold text-sm text-white">CoachX</p>
          <p className="text-xs text-violet-300">{t('coachx_subtitle')}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-violet-600 text-white rounded-br-sm'
                  : 'bg-gray-800 text-gray-100 rounded-bl-sm'
              }`}
            >
              {renderContent(msg.content)}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1.5 items-center h-4">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-violet-400"
                    style={{ animation: `coachx-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggested prompts */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2">
          <p className="text-xs text-gray-500 mb-2">{t('coachx_suggested_prompts')}</p>
          <div className="flex flex-wrap gap-2">
            {suggestedPrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSend(prompt)}
                className="text-xs bg-gray-800 hover:bg-gray-700 border border-white/10 text-gray-300 hover:text-white rounded-full px-3 py-1.5 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="px-4 pb-safe pb-4 border-t border-white/10 bg-gray-900/90 backdrop-blur-sm pt-3">
        <div className="flex gap-2 items-end">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={t('coachx_chat_placeholder')}
            className="flex-1 bg-gray-800 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-400 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors resize-none"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isTyping}
            className="w-11 h-11 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Keyframes (injected once) */}
      <style>{`
        @keyframes coachx-bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
        @keyframes coachx-pulse-ring {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        .coachx-pulse::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          background: inherit;
          animation: coachx-pulse-ring 2s ease-out infinite;
        }
      `}</style>
    </div>
  );
};
