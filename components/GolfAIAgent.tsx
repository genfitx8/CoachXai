import React, { useState } from 'react';
import { ClientProfile, Homework, Lesson } from '../types';
import { Sparkles, ChevronLeft, Bot, Zap, RefreshCw, CheckCircle } from 'lucide-react';
import { Button } from './Button';
import { generateGolfMissions } from '../services/geminiService';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { lessonBelongsToClient } from '../utils/clientMatch';

interface GolfAIAgentProps {
  clientProfile: ClientProfile;
  allLessons: Lesson[];
  clientId: string;
  isFirebaseMode: boolean;
  onBack: () => void;
  onMissionSaved: () => void;
}

const getLocalISODate = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const GolfAIAgent: React.FC<GolfAIAgentProps> = ({
  clientProfile,
  allLessons,
  clientId,
  isFirebaseMode,
  onBack,
  onMissionSaved,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [missions, setMissions] = useState<string[]>([]);
  const [savedMissions, setSavedMissions] = useState<Set<number>>(new Set());
  const [errorMsg, setErrorMsg] = useState('');

  const handleGenerate = async () => {
    setIsGenerating(true);
    setMissions([]);
    setSavedMissions(new Set());
    setErrorMsg('');
    try {
      const recentLessons = allLessons
        .filter((l) => lessonBelongsToClient(l, clientProfile))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5);

      const suggestions = await generateGolfMissions(clientProfile, recentLessons);
      setMissions(suggestions);
    } catch (e) {
      console.error(e);
      setErrorMsg('AI 미션 생성 중 문제가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveMission = async (mission: string, idx: number) => {
    const today = getLocalISODate();
    const newHomework: Homework = {
      id: crypto.randomUUID(),
      clientId,
      title: mission.trim(),
      isCompleted: false,
      date: today,
      createdAt: Date.now(),
    };

    if (isFirebaseMode) {
      await firebaseService.saveHomework(newHomework);
    } else {
      const all = storageService.getHomework();
      storageService.saveHomework([...all, newHomework]);
    }

    setSavedMissions((prev) => new Set(prev).add(idx));
    onMissionSaved();
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2">
        <button
          onClick={onBack}
          className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="뒤로가기"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="w-1 h-6 bg-gradient-to-b from-slate-500 to-slate-600 rounded-full" />
        <h2 className="text-xl font-black text-gray-900">Golf AI 에이전트</h2>
      </div>

      {/* Hero Banner */}
      <div className="bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 rounded-2xl p-6 text-white text-center shadow-xl">
        <div className="bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
          <Bot className="w-9 h-9 text-white" />
        </div>
        <h3 className="text-lg font-black mb-1">AI 골프 코치</h3>
        <p className="text-indigo-100 text-sm leading-relaxed">
          최근 레슨 기록을 분석해 맞춤형 연습 미션을 추천해드립니다.
        </p>
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="w-full bg-gradient-to-r from-slate-500 to-slate-600 hover:from-slate-600 hover:to-slate-700 disabled:opacity-60 text-white rounded-2xl px-6 py-4 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 font-bold text-base"
      >
        {isGenerating ? (
          <>
            <RefreshCw className="w-5 h-5 animate-spin" />
            AI 분석 중...
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5 text-yellow-300" />
            {missions.length > 0 ? '미션 다시 생성하기' : 'AI 미션 추천받기'}
          </>
        )}
      </button>

      {/* Error */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-medium">
          {errorMsg}
        </div>
      )}

      {/* Mission Cards */}
      {missions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-500" />
            <h4 className="font-bold text-gray-800 text-sm">추천 미션</h4>
            <span className="text-xs text-gray-400">클릭하여 미션으로 등록</span>
          </div>
          {missions.map((mission, idx) => {
            const isSaved = savedMissions.has(idx);
            return (
              <button
                key={idx}
                onClick={() => !isSaved && handleSaveMission(mission, idx)}
                disabled={isSaved}
                className={`w-full text-left p-4 rounded-xl border transition-all group ${
                  isSaved
                    ? 'bg-emerald-50 border-emerald-200 cursor-default'
                    : 'bg-white hover:bg-indigo-50 border-gray-100 hover:border-indigo-200 shadow-sm hover:shadow-md'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-full shadow-sm font-bold text-xs border flex-shrink-0 ${
                      isSaved
                        ? 'bg-emerald-700 border-emerald-700 text-white'
                        : 'bg-white border-gray-100 text-indigo-500'
                    }`}
                  >
                    {isSaved ? (
                      <CheckCircle className="w-3.5 h-3.5" />
                    ) : (
                      <span>{idx + 1}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <p
                      className={`font-bold text-sm ${
                        isSaved
                          ? 'text-emerald-700'
                          : 'text-gray-800 group-hover:text-indigo-700'
                      }`}
                    >
                      {mission}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {isSaved ? '✓ 미션 등록 완료' : '클릭하여 내 미션으로 등록'}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!isGenerating && missions.length === 0 && !errorMsg && (
        <div className="text-center py-10 bg-gradient-to-br from-gray-50 to-indigo-50/30 rounded-2xl border border-indigo-100">
          <Sparkles className="w-10 h-10 text-indigo-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium">
            버튼을 눌러 AI 맞춤 미션을 추천받으세요
          </p>
        </div>
      )}
    </div>
  );
};
