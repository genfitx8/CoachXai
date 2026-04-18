import React, { useState } from 'react';
import { WeeklyInsight, QuickLogEntry, Lesson, ClientProfile } from '../types';
import { Sparkles, ChevronLeft, RefreshCw, TrendingUp, Target, List } from 'lucide-react';
import { generateWeeklyInsight } from '../services/geminiService';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';

interface WeeklyInsightCardProps {
  clientId: string;
  coachId?: string;
  clientProfile?: ClientProfile;
  recentLogs: QuickLogEntry[];
  recentLessons: Lesson[];
  onBack: () => void;
  isFirebaseMode: boolean;
}

const getMondayOfCurrentWeek = (): string => {
  const today = new Date();
  const day = today.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday.toISOString().split('T')[0];
};

const getSundayOfCurrentWeek = (): string => {
  const monday = getMondayOfCurrentWeek();
  const sun = new Date(monday);
  sun.setDate(sun.getDate() + 6);
  return sun.toISOString().split('T')[0];
};

const formatWeekRange = (start: string, end: string): string => {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.getMonth() + 1}월 ${s.getDate()}일 ~ ${e.getMonth() + 1}월 ${e.getDate()}일`;
};

export const WeeklyInsightCard: React.FC<WeeklyInsightCardProps> = ({
  clientId,
  coachId,
  clientProfile,
  recentLogs,
  recentLessons,
  onBack,
  isFirebaseMode,
}) => {
  const [insights, setInsights] = useState<WeeklyInsight[]>(() => {
    if (isFirebaseMode) return [];
    return storageService.getWeeklyInsightsByClient(clientId);
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadedFromFirebase, setLoadedFromFirebase] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Load from Firebase on mount
  React.useEffect(() => {
    if (isFirebaseMode && !loadedFromFirebase) {
      firebaseService.getWeeklyInsightsByClient(clientId).then((data) => {
        setInsights(data);
        setLoadedFromFirebase(true);
      });
    }
  }, [clientId, isFirebaseMode, loadedFromFirebase]);

  const latestInsight = insights[0] ?? null;

  const handleGenerate = async () => {
    if (recentLogs.length === 0) return;
    setIsGenerating(true);
    try {
      const weekStart = getMondayOfCurrentWeek();
      const weekEnd = getSundayOfCurrentWeek();

      // Use logs from current week if possible, fall back to all recent logs
      const weekLogs = recentLogs.filter((l) => l.logDate >= weekStart && l.logDate <= weekEnd);
      const logsToUse = weekLogs.length > 0 ? weekLogs : recentLogs.slice(0, 7);

      const partial = await generateWeeklyInsight(logsToUse, recentLessons, clientProfile);
      const now = Date.now();
      const insight: WeeklyInsight = {
        id: crypto.randomUUID(),
        clientId,
        ...(coachId ? { coachId } : {}),
        weekStart,
        weekEnd,
        summary: partial.summary,
        keyPatterns: partial.keyPatterns,
        recommendedFocus: partial.recommendedFocus,
        generatedAt: now,
      };

      if (isFirebaseMode) {
        await firebaseService.saveWeeklyInsight(insight);
      } else {
        storageService.saveWeeklyInsight(insight);
      }
      setInsights((prev) => [insight, ...prev]);
    } catch (err) {
      console.error('Failed to generate weekly insight:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
          aria-label="뒤로"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="w-1 h-6 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full" />
        <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-500" />
          주간 AI 인사이트
        </h2>
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={isGenerating || recentLogs.length === 0}
        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl px-6 py-4 shadow-lg font-bold text-sm transition-all transform hover:scale-[1.02] active:scale-[0.98]"
      >
        {isGenerating ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            AI 분석 중...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            {latestInsight ? '이번 주 인사이트 재생성' : '이번 주 인사이트 생성'}
          </>
        )}
      </button>

      {recentLogs.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 text-center">
          💡 빠른 기록을 먼저 작성하면 AI가 주간 인사이트를 생성해줍니다!
        </div>
      )}

      {/* Latest Insight */}
      {latestInsight && (
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-5 border border-indigo-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
              {formatWeekRange(latestInsight.weekStart, latestInsight.weekEnd)}
            </span>
            <span className="text-[10px] text-gray-400">
              {new Date(latestInsight.generatedAt).toLocaleDateString('ko-KR')} 생성
            </span>
          </div>

          {/* Summary */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingUp className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-bold text-indigo-700">이번 주 요약</span>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{latestInsight.summary}</p>
          </div>

          {/* Key Patterns */}
          {latestInsight.keyPatterns.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <List className="w-4 h-4 text-purple-500" />
                <span className="text-xs font-bold text-purple-700">주요 패턴</span>
              </div>
              <ul className="space-y-1.5">
                {latestInsight.keyPatterns.map((pattern, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                    {pattern}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommended Focus */}
          <div className="bg-white/70 rounded-xl p-3 border border-indigo-100">
            <div className="flex items-center gap-1.5 mb-1">
              <Target className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-emerald-700">다음 주 추천 포커스</span>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{latestInsight.recommendedFocus}</p>
          </div>
        </div>
      )}

      {/* History Toggle */}
      {insights.length > 1 && (
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-indigo-600 font-bold hover:underline"
          >
            {showHistory ? '이전 인사이트 숨기기 ▲' : `이전 인사이트 보기 (${insights.length - 1}건) ▼`}
          </button>
          {showHistory && (
            <div className="mt-3 space-y-3">
              {insights.slice(1).map((insight) => (
                <div
                  key={insight.id}
                  className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-600">
                      {formatWeekRange(insight.weekStart, insight.weekEnd)}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {new Date(insight.generatedAt).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{insight.summary}</p>
                  {insight.recommendedFocus && (
                    <p className="text-xs text-indigo-600 mt-2 font-medium">
                      → {insight.recommendedFocus}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
