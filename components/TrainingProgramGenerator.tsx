import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Sparkles,
  Save,
  Trash2,
  Calendar,
  Clock,
  BarChart2,
  Target,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ClientProfile, Lesson, TrainingProgram, TrainingProgramConfig } from '../types';
import { Button } from './Button';
import { generateTrainingProgram } from '../services/geminiService';

interface TrainingProgramGeneratorProps {
  client: ClientProfile;
  lessons: Lesson[];
  coachId: string;
  programs: TrainingProgram[];
  onBack: () => void;
  onSaveProgram: (program: TrainingProgram) => void;
  onDeleteProgram: (programId: string) => void;
}

const PERFORMANCE_GOALS = [
  '드라이버 정확도 향상',
  '아이언 거리 일관성 향상',
  '숏게임(어프로치) 기술 향상',
  '퍼팅 정확도 향상',
  '전반적인 스코어 향상',
  '스윙 자세 교정',
  '비거리 증가',
  '기타',
];

const getToday = (): string => {
  const d = new Date();
  return d.toISOString().split('T')[0];
};

const addWeeks = (dateStr: string, weeks: number): string => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().split('T')[0];
};

export const TrainingProgramGenerator: React.FC<TrainingProgramGeneratorProps> = ({
  client,
  lessons,
  coachId,
  programs,
  onBack,
  onSaveProgram,
  onDeleteProgram,
}) => {
  const clientId = `${client.name}_${client.phone}`;

  // ── Config form state ────────────────────────────────────────────────────────
  const today = getToday();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addWeeks(today, 4));
  const [frequencyPerWeek, setFrequencyPerWeek] = useState(3);
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(60);
  const [performanceGoal, setPerformanceGoal] = useState('');
  const [customGoal, setCustomGoal] = useState('');
  const [formError, setFormError] = useState('');

  // ── Generation state ─────────────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState('');

  // ── Saved programs list ──────────────────────────────────────────────────────
  const [expandedProgramId, setExpandedProgramId] = useState<string | null>(null);

  // Client's lessons (sorted newest first)
  const clientLessons = useMemo(
    () =>
      lessons
        .filter(
          (l) => l.clientName === client.name && l.clientPhone === client.phone
        )
        .sort((a, b) => b.createdAt - a.createdAt),
    [lessons, client]
  );

  // Programs for this client (sorted newest first)
  const clientPrograms = useMemo(
    () =>
      programs
        .filter((p) => p.clientId === clientId)
        .sort((a, b) => b.createdAt - a.createdAt),
    [programs, clientId]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const validateForm = (): boolean => {
    if (!startDate) {
      setFormError('시작 날짜를 입력해주세요.');
      return false;
    }
    if (!endDate) {
      setFormError('종료 날짜를 입력해주세요.');
      return false;
    }
    if (endDate <= startDate) {
      setFormError('종료 날짜는 시작 날짜보다 이후여야 합니다.');
      return false;
    }
    if (frequencyPerWeek < 1 || frequencyPerWeek > 7) {
      setFormError('주간 빈도는 1~7회 사이여야 합니다.');
      return false;
    }
    if (sessionDurationMinutes < 10 || sessionDurationMinutes > 360) {
      setFormError('훈련 시간은 10~360분 사이여야 합니다.');
      return false;
    }
    const goal = performanceGoal === '기타' ? customGoal.trim() : performanceGoal;
    if (!goal) {
      setFormError('향상하고 싶은 경기력을 선택하거나 입력해주세요.');
      return false;
    }
    setFormError('');
    return true;
  };

  const handleGenerate = async () => {
    if (!validateForm()) return;

    const goal = performanceGoal === '기타' ? customGoal.trim() : performanceGoal;
    const config: TrainingProgramConfig = {
      startDate,
      endDate,
      frequencyPerWeek,
      sessionDurationMinutes,
      performanceGoal: goal,
    };

    setIsGenerating(true);
    setGeneratedPlan('');
    try {
      const plan = await generateTrainingProgram(client, clientLessons, config);
      setGeneratedPlan(plan);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    if (!generatedPlan) return;
    const goal = performanceGoal === '기타' ? customGoal.trim() : performanceGoal;
    const config: TrainingProgramConfig = {
      startDate,
      endDate,
      frequencyPerWeek,
      sessionDurationMinutes,
      performanceGoal: goal,
    };
    const now = Date.now();
    const program: TrainingProgram = {
      id: `tp_${coachId}_${clientId}_${now}`,
      coachId,
      clientId,
      clientName: client.name,
      clientPhone: client.phone,
      config,
      generatedPlan,
      createdAt: now,
      updatedAt: now,
    };
    onSaveProgram(program);
    setGeneratedPlan('');
  };

  const handleDeleteProgram = (programId: string) => {
    if (window.confirm('이 훈련 프로그램을 삭제하시겠습니까?')) {
      onDeleteProgram(programId);
      if (expandedProgramId === programId) setExpandedProgramId(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-bg-base pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-bg-raised border-b border-line-default px-4 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-xl hover:bg-bg-overlay transition-colors"
          aria-label="뒤로가기"
        >
          <ArrowLeft className="w-5 h-5 text-ink-medium" />
        </button>
        <div>
          <h1 className="font-bold text-ink-high text-base leading-tight">
            훈련 프로그램 생성
          </h1>
          <p className="text-xs text-ink-medium">{client.name} 회원</p>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-lg mx-auto">

        {/* Lesson context info */}
        <div className="bg-primary-500/10 rounded-xl p-3 flex items-center gap-3 text-sm">
          <BarChart2 className="w-5 h-5 text-indigo-500 flex-shrink-0" />
          <span className="text-primary-300">
            {clientLessons.length > 0
              ? `${clientLessons.length}개 레슨 기록 기반으로 프로그램을 생성합니다.`
              : '레슨 기록이 없습니다. 기본 플랜으로 생성됩니다.'}
          </span>
        </div>

        {/* Config form */}
        <div className="bg-bg-raised rounded-2xl shadow-sm border border-line-subtle p-5 space-y-4">
          <h2 className="font-bold text-ink-high text-sm flex items-center gap-2">
            <Target className="w-4 h-4 text-indigo-500" />
            프로그램 설정
          </h2>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-ink-medium mb-1">
                <Calendar className="w-3 h-3 inline mr-1" />
                시작 날짜 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setFormError('');
                }}
                className="w-full px-3 py-2 border border-line-default rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-ink-medium mb-1">
                <Calendar className="w-3 h-3 inline mr-1" />
                종료 날짜 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setFormError('');
                }}
                className="w-full px-3 py-2 border border-line-default rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-xs font-bold text-ink-medium mb-1">
              빈도 설정 (주당 훈련 횟수) <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={7}
                value={frequencyPerWeek}
                onChange={(e) => {
                  setFrequencyPerWeek(Number(e.target.value));
                  setFormError('');
                }}
                className="flex-1"
              />
              <span className="text-sm font-bold text-indigo-600 w-12 text-center">
                주 {frequencyPerWeek}회
              </span>
            </div>
          </div>

          {/* Session duration */}
          <div>
            <label className="block text-xs font-bold text-ink-medium mb-1">
              <Clock className="w-3 h-3 inline mr-1" />
              훈련 시간 설정 (분) <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2 flex-wrap" role="group" aria-label="훈련 시간 선택">
              {[30, 45, 60, 90, 120].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  aria-label={`${mins}분 선택`}
                  aria-pressed={sessionDurationMinutes === mins}
                  onClick={() => {
                    setSessionDurationMinutes(mins);
                    setFormError('');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    sessionDurationMinutes === mins
                      ? 'bg-slate-700 text-white border-slate-700'
                      : 'bg-bg-raised text-ink-medium border-line-default hover:border-indigo-400'
                  }`}
                >
                  {mins}분
                </button>
              ))}
              <input
                type="number"
                min={10}
                max={360}
                value={sessionDurationMinutes}
                onChange={(e) => {
                  setSessionDurationMinutes(Number(e.target.value));
                  setFormError('');
                }}
                className="w-20 px-2 py-1 border border-line-default rounded-lg text-sm text-center focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="직접입력"
                aria-label="훈련 시간 직접 입력 (분)"
              />
            </div>
          </div>

          {/* Performance goal */}
          <div>
            <label className="block text-xs font-bold text-ink-medium mb-1">
              향상하고 싶은 경기력 <span className="text-red-500">*</span>
            </label>
            <div
              className="flex flex-wrap gap-2 mb-2"
              role="radiogroup"
              aria-label="경기력 향상 목표 선택"
            >
              {PERFORMANCE_GOALS.map((goal) => (
                <button
                  key={goal}
                  type="button"
                  role="radio"
                  aria-checked={performanceGoal === goal}
                  onClick={() => {
                    setPerformanceGoal(goal);
                    setFormError('');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    performanceGoal === goal
                      ? 'bg-slate-700 text-white border-slate-700'
                      : 'bg-bg-raised text-ink-medium border-line-default hover:border-indigo-400'
                  }`}
                >
                  {goal}
                </button>
              ))}
            </div>
            {performanceGoal === '기타' && (
              <input
                type="text"
                value={customGoal}
                onChange={(e) => {
                  setCustomGoal(e.target.value);
                  setFormError('');
                }}
                className="w-full px-3 py-2 border border-line-default rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="목표를 직접 입력해주세요"
              />
            )}
          </div>

          {formError && (
            <p className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
              {formError}
            </p>
          )}

          <Button
            onClick={handleGenerate}
            isLoading={isGenerating}
            className="w-full bg-slate-700 hover:bg-slate-800"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {isGenerating ? 'AI 분석 중...' : '훈련 프로그램 생성'}
          </Button>
        </div>

        {/* Generated plan */}
        {generatedPlan && (
          <div className="bg-bg-raised rounded-2xl shadow-sm border border-line-subtle overflow-hidden">
            <div className="bg-slate-800 px-5 py-4 flex justify-between items-center">
              <h2 className="font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                생성된 훈련 프로그램
              </h2>
              <button
                onClick={() => setGeneratedPlan('')}
                className="text-white/70 hover:text-white"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              {/* Render markdown-ish content */}
              <div className="prose prose-sm max-w-none text-ink-high whitespace-pre-wrap text-sm leading-relaxed">
                {generatedPlan}
              </div>
              <div className="mt-4 pt-4 border-t border-line-subtle">
                <Button
                  onClick={handleSave}
                  className="w-full bg-emerald-800 hover:bg-emerald-900"
                >
                  <Save className="w-4 h-4 mr-2" />
                  저장하기
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Saved programs */}
        {clientPrograms.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-bold text-ink-high text-sm px-1">저장된 프로그램</h2>
            {clientPrograms.map((program) => {
              const isExpanded = expandedProgramId === program.id;
              return (
                <div
                  key={program.id}
                  className="bg-bg-raised rounded-2xl shadow-sm border border-line-subtle overflow-hidden"
                >
                  <button
                    className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-bg-base transition-colors"
                    onClick={() =>
                      setExpandedProgramId(isExpanded ? null : program.id)
                    }
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink-high text-sm truncate">
                        {program.config.performanceGoal}
                      </p>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {program.config.startDate} ~ {program.config.endDate} ·{' '}
                        주 {program.config.frequencyPerWeek}회 ·{' '}
                        {program.config.sessionDurationMinutes}분
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProgram(program.id);
                        }}
                        className="p-1.5 text-red-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        aria-label="삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-ink-muted" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-ink-muted" />
                      )}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-line-subtle pt-4">
                      <div className="prose prose-sm max-w-none text-ink-high whitespace-pre-wrap text-sm leading-relaxed">
                        {program.generatedPlan}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
