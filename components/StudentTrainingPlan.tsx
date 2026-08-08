import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  ClientProfile,
  Lesson,
  StudentTrainingPlan as StudentTrainingPlanRecord,
} from '../types';
import { apiService } from '../services/apiService';
import { generateStudentMonthlyTrainingPlan } from '../services/geminiService';
import { Sparkles, Loader2, Trash2, RefreshCw, ArrowLeft } from 'lucide-react';
import { BackButton } from './ui/BackButton';

interface StudentTrainingPlanProps {
  profile: ClientProfile;
  /** Every lesson the student can see (own uploads + coach-shared snapshots). */
  lessons: Lesson[];
  onBack: () => void;
}

const GOAL_OPTIONS = [
  '전반적인 실력 향상',
  '스코어 5타 줄이기',
  '드라이버 비거리 늘리기',
  '아이언 정확도 향상',
  '숏게임 강화',
  '퍼팅 안정화',
] as const;

const FREQUENCY_OPTIONS = [2, 3, 4, 5] as const;
const DURATION_OPTIONS = [30, 45, 60, 90] as const;

const formatDate = (ts?: number) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const StudentTrainingPlan: React.FC<StudentTrainingPlanProps> = ({
  profile,
  lessons,
  onBack,
}) => {
  const [plans, setPlans] = useState<StudentTrainingPlanRecord[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<StudentTrainingPlanRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form config
  const [goal, setGoal] = useState<string>(GOAL_OPTIONS[0]);
  const [frequency, setFrequency] = useState<number>(3);
  const [duration, setDuration] = useState<number>(60);

  const lessonCountForContext = useMemo(() => Math.min(lessons.length, 20), [lessons.length]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await apiService.getStudentTrainingPlans();
      setPlans(list);
      if (list.length > 0 && !selectedPlan) setSelectedPlan(list[0]);
    } catch (e) {
      console.error('[StudentTrainingPlan] getStudentTrainingPlans failed', e);
      setError('기존 계획을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPlan]);

  useEffect(() => {
    refresh();
    // Intentionally run once on mount – refresh is stable enough for this view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const { markdown, usedLessonCount } = await generateStudentMonthlyTrainingPlan({
        profile,
        lessons,
        goal,
        frequencyPerWeek: frequency,
        sessionDurationMinutes: duration,
      });
      const saved = await apiService.saveStudentTrainingPlan({
        horizon: '1M',
        title: `1개월 훈련 계획 · ${goal}`,
        config: {
          goal,
          frequencyPerWeek: frequency,
          sessionDurationMinutes: duration,
        },
        generatedPlan: markdown,
        sourceLessonCount: usedLessonCount,
      });
      setPlans((prev) => [saved, ...prev]);
      setSelectedPlan(saved);
    } catch (e) {
      console.error('[StudentTrainingPlan] generate failed', e);
      setError('계획 생성 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = async (planId: string) => {
    if (!window.confirm('이 계획을 삭제할까요?')) return;
    try {
      await apiService.deleteStudentTrainingPlan(planId);
      setPlans((prev) => prev.filter((p) => p.id !== planId));
      setSelectedPlan((cur) => (cur?.id === planId ? null : cur));
    } catch (e) {
      console.error('[StudentTrainingPlan] delete failed', e);
      setError('삭제 중 오류가 발생했어요.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 overflow-y-auto text-slate-100">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
        <header className="pb-4 border-b border-slate-800 flex items-center gap-3">
          <BackButton
            onClick={onBack}
            tone="dark"
            ariaLabel="뒤로"
            testId="training-plan-back-btn"
          />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-300" />
              AI 훈련 계획
              <span className="text-[10px] font-bold bg-white/20 text-slate-100 px-1.5 py-0.5 rounded">
                BETA
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
              최근 레슨 기록({lessonCountForContext}건)을 근거로 1개월 훈련 프로그램을 자동 생성합니다.
            </p>
          </div>
        </header>

        {/* Generator */}
        <section
          className="bg-slate-900/80 rounded-2xl p-4 sm:p-5 border border-slate-800 space-y-4"
          data-testid="training-plan-generator"
        >
          <h2 className="text-sm font-black text-slate-200 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-amber-300" /> 새 계획 생성
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              목표
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
              >
                {GOAL_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              주간 빈도
              <select
                value={frequency}
                onChange={(e) => setFrequency(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
              >
                {FREQUENCY_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    주 {f}회
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              회당 시간
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}분
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            data-testid="generate-training-plan-btn"
            className="w-full py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-white hover:from-amber-500 hover:via-orange-500 hover:to-rose-500 disabled:opacity-60 transition"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> 계획 생성 중…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" /> AI 1개월 계획 생성하기
              </>
            )}
          </button>

          {lessons.length === 0 && (
            <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              레슨 기록이 아직 없어요. 지금 만들어도 기본 템플릿으로 채워지지만, 레슨 기록이 쌓일수록 계획이 훨씬 구체적으로 나옵니다.
            </p>
          )}
        </section>

        {error && (
          <div className="bg-red-500/10 border border-red-500/40 rounded-lg px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* History + viewer */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <aside className="sm:col-span-1 bg-slate-900/80 rounded-2xl p-3 border border-slate-800 space-y-2 min-h-[120px]">
            <div className="text-xs font-black text-slate-400 px-1 pb-1 flex items-center justify-between">
              <span>내 계획</span>
              <button
                onClick={refresh}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                aria-label="새로고침"
                data-testid="training-plan-refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            {isLoading ? (
              <div className="text-xs text-slate-500 px-1 py-4 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> 불러오는 중…
              </div>
            ) : plans.length === 0 ? (
              <p className="text-xs text-slate-500 px-1 py-4">
                아직 생성된 계획이 없어요.
              </p>
            ) : (
              <ul className="space-y-1">
                {plans.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelectedPlan(p)}
                      className={`w-full text-left px-2 py-2 rounded-lg text-xs font-medium transition ${
                        selectedPlan?.id === p.id
                          ? 'bg-amber-500/20 text-amber-100 border border-amber-500/40'
                          : 'text-slate-300 hover:bg-slate-800/80'
                      }`}
                    >
                      <div className="truncate">{p.title || '1개월 계획'}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {formatDate(p.createdAt)} · 레슨 {p.sourceLessonCount ?? 0}건 반영
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <div
            className="sm:col-span-2 bg-slate-900/80 rounded-2xl p-4 sm:p-5 border border-slate-800 min-h-[240px]"
            data-testid="training-plan-viewer"
          >
            {selectedPlan ? (
              <>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-100">
                      {selectedPlan.title || '1개월 계획'}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      생성일 {formatDate(selectedPlan.createdAt)} · 최근 레슨 {selectedPlan.sourceLessonCount ?? 0}건 반영
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(selectedPlan.id)}
                    className="p-2 rounded-lg text-red-400 hover:bg-red-500/10"
                    aria-label="계획 삭제"
                    data-testid="training-plan-delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{selectedPlan.generatedPlan}</ReactMarkdown>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-500 flex flex-col items-center justify-center h-full py-10 gap-2 text-center">
                <Sparkles className="w-8 h-8 text-slate-600" />
                <p>왼쪽에서 계획을 선택하거나 위에서 새로 생성해 주세요.</p>
              </div>
            )}
          </div>
        </section>

        <footer className="pt-4 mt-4 border-t border-slate-800 text-[11px] text-slate-500 leading-relaxed">
          이 계획은 학생 본인의 최근 레슨 기록을 근거로 AI가 생성한 참고용 프로그램입니다. 몸 상태·부상 이력에 맞춰
          코치와 함께 조정해 주세요.
        </footer>
      </div>
    </div>
  );
};
