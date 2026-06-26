import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Lesson, ClientProfile, CoachProfile } from '../types';
import { ChevronLeft, Send, Sparkles, Bot, Mic, MicOff, Volume2 } from 'lucide-react';
import { CoachXChatMessage } from '../services/coachXService';
import { generateCoachXChatResponse } from '../services/geminiService';
import { useLanguage } from './LanguageContext';
import { useTypingReveal } from '../hooks/useTypingReveal';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { renderMarkdown } from '../utils/renderMarkdown';

interface CoachXChatProps {
  coachProfile: CoachProfile;
  allLessons: Lesson[];
  clients: ClientProfile[];
  onBack: () => void;
  /** When provided, this query is auto-sent as the first user message on mount. */
  initialQuery?: string;
}

const SUGGESTED_PROMPTS_KO = [
  '다음 레슨 추천해줘',
  '내 레슨 패턴 분석해줘',
  '회원 성장 요약 알려줘',
  '정체 중인 회원 있어?',
  '커리큘럼 추천해줘',
  '코치 성장 방법 알려줘',
];

const SUGGESTED_PROMPTS_EN = [
  'Recommend my next lesson',
  'Analyze my lesson patterns',
  'Summarize member progress',
  'Any members in a plateau?',
  'Suggest a curriculum plan',
  'How can I grow as a coach?',
];

const SUGGESTED_PROMPTS_JA = [
  '次のレッスンを提案して',
  'レッスンパターンを分析して',
  '会員の成長をまとめて',
  '停滞している会員はいる？',
  'カリキュラムを提案して',
  'コーチ成長のヒントは？',
];

const INITIAL_QUERY_DELAY_MS = 400;

export const CoachXChat: React.FC<CoachXChatProps> = ({
  coachProfile,
  allLessons,
  clients,
  onBack,
  initialQuery,
}) => {
  const { language, t } = useLanguage();
  const [messages, setMessages] = useState<CoachXChatMessage[]>([
    {
      role: 'assistant',
      content: language === 'en'
        ? `Hello, Coach ${coachProfile.name}! I'm **Coachx**, your AI coaching intelligence. I've analyzed **${allLessons.length} lesson records** and **${new Set(allLessons.map(l => l.clientName + l.clientPhone)).size} members**. What would you like to know? 🏌️`
        : language === 'ja'
        ? `こんにちは、${coachProfile.name}コーチ！私は**Coachx**、AIコーチングアシスタントです。**${allLessons.length}件のレッスン記録**と**${new Set(allLessons.map(l => l.clientName + l.clientPhone)).size}名の会員**データを分析しました。何でも聞いてください！ 🏌️`
        : `안녕하세요, ${coachProfile.name} 코치님! 저는 **Coachx**입니다. 현재 **${allLessons.length}개의 레슨 기록**과 **${new Set(allLessons.map(l => l.clientName + l.clientPhone)).size}명의 회원** 데이터를 분석하고 있습니다. 무엇이든 물어보세요! 🏌️`,
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  const { revealedChars, startReveal, clearReveal } = useTypingReveal(2500);
  const { isSpeaking, speak, stopSpeaking } = useTextToSpeech(language, voiceMode);

  const suggestedPrompts =
    language === 'en' ? SUGGESTED_PROMPTS_EN
    : language === 'ja' ? SUGGESTED_PROMPTS_JA
    : SUGGESTED_PROMPTS_KO;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, revealedChars]);

  const handleSend = useCallback(async (text?: string) => {
    const msgText = (text ?? input).trim();
    if (!msgText) return;

    clearReveal();
    stopSpeaking();

    const userMsg: CoachXChatMessage = { role: 'user', content: msgText, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const historyForAI = [...messages, userMsg].slice(0, -1).map(m => ({ role: m.role, content: m.content }));
    const reply = await generateCoachXChatResponse(msgText, allLessons, clients, language, historyForAI);

    setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: Date.now() }]);
    setIsTyping(false);
    speak(reply);
    startReveal(reply);
  }, [input, messages, allLessons, clients, language, clearReveal, stopSpeaking, speak, startReveal]);

  const { isListening, stopListening, toggleListening } = useSpeechRecognition({
    language,
    onResult: handleSend,
  });

  useEffect(() => {
    if (!initialQuery) return;
    const timer = setTimeout(() => { void handleSend(initialQuery); }, INITIAL_QUERY_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleVoiceMode = (toVoice: boolean) => {
    setVoiceMode(toVoice);
    if (!toVoice) {
      stopListening();
      stopSpeaking();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white" style={{ minHeight: '100dvh' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-gray-900/90 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={onBack}
          className="p-3 rounded-full hover:bg-white/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label={t('back')}
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>

        <div className="relative w-9 h-9 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 coachx-pulse" />
          <Sparkles className="relative z-10 w-4 h-4 text-white" />
        </div>

        <div className="flex-1">
          <p className="font-bold text-sm text-white">Coachx</p>
          <p className="text-xs text-violet-300">{t('coachx_subtitle')}</p>
        </div>

        {/* Chat / Voice toggle */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-full p-0.5">
          <button
            type="button"
            onClick={() => handleToggleVoiceMode(false)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              !voiceMode ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {language === 'en' ? 'Chat' : language === 'ja' ? 'チャット' : '채팅'}
          </button>
          <button
            type="button"
            onClick={() => handleToggleVoiceMode(true)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              voiceMode ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {language === 'en' ? 'Voice' : language === 'ja' ? '音声' : '음성'}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, idx) => {
          const isLastAssistant = msg.role === 'assistant' && idx === messages.length - 1;
          const isRevealing = isLastAssistant && revealedChars !== null;
          const displayContent = isRevealing
            ? msg.content.slice(0, revealedChars)
            : msg.content;

          return (
            <div
              key={idx}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-slate-700 text-white rounded-br-sm'
                    : 'bg-gray-800 text-gray-100 rounded-bl-sm'
                }`}
              >
                {renderMarkdown(displayContent)}
                {isRevealing && (
                  <span className="coachx-cursor inline-block w-0.5 h-3.5 bg-violet-400 ml-0.5 align-text-bottom" />
                )}
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center flex-shrink-0">
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

      {/* Suggested prompts (text mode only) */}
      {!voiceMode && messages.length <= 1 && (
        <div className="px-4 pb-2">
          <p className="text-xs text-gray-500 mb-2">{t('coachx_suggested_prompts')}</p>
          <div className="flex flex-wrap gap-2">
            {suggestedPrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => void handleSend(prompt)}
                className="text-xs bg-gray-800 hover:bg-gray-700 border border-white/10 text-gray-300 hover:text-white rounded-full px-3 py-1.5 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      {voiceMode ? (
        /* Voice mode — mic button */
        <div className="px-4 pb-safe pb-8 pt-4 flex flex-col items-center gap-3 border-t border-white/10 bg-gray-900/90 backdrop-blur-sm">
          {isSpeaking && (
            <div className="flex items-center gap-2 text-xs text-violet-300">
              <Volume2 className="w-3.5 h-3.5" />
              {language === 'en' ? 'Speaking…' : language === 'ja' ? '読み上げ中…' : '응답 중…'}
            </div>
          )}
          <button
            type="button"
            onPointerDown={toggleListening}
            disabled={isTyping}
            className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all disabled:opacity-40 ${
              isListening
                ? 'bg-red-500/80 shadow-lg shadow-red-500/30'
                : 'bg-violet-600/80 hover:bg-violet-500/80 shadow-lg shadow-violet-500/20'
            }`}
            aria-label={isListening ? 'Stop' : 'Speak'}
          >
            {isListening && (
              <span className="absolute inset-0 rounded-full border-2 border-red-400 animate-ping opacity-60" />
            )}
            {isListening
              ? <MicOff className="w-8 h-8 text-white" />
              : <Mic className="w-8 h-8 text-white" />
            }
          </button>
          <p className="text-xs text-gray-500">
            {isListening
              ? (language === 'en' ? 'Listening… tap to stop' : language === 'ja' ? '聞いています…タップで停止' : '듣는 중… 탭해서 중지')
              : (language === 'en' ? 'Tap to speak' : language === 'ja' ? 'タップして話す' : '탭해서 말하기')}
          </p>
        </div>
      ) : (
        /* Text mode — input bar */
        <div className="px-4 pb-safe pb-4 border-t border-white/10 bg-gray-900/90 backdrop-blur-sm pt-3">
          <div className="flex gap-2 items-end">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
              placeholder={t('coachx_chat_placeholder')}
              className="flex-1 bg-gray-800 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-400 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors resize-none"
            />
            <button
              onClick={() => void handleSend()}
              disabled={!input.trim() || isTyping || revealedChars !== null}
              aria-label="Send"
              className="w-11 h-11 rounded-full bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes coachx-bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
        @keyframes coachx-cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .coachx-cursor {
          animation: coachx-cursor-blink 0.7s ease-in-out infinite;
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
