import React, { useMemo, useState } from 'react';
import { DiagnosisFactorKey, DiagnosisInput, DiagnosisProgram } from '../../types/diagnosis';
import { DiagnosisHero } from './DiagnosisHero';
import { Button } from '../Button';
import { clampDiagnosisScore } from '../../utils/diagnosis';

interface DiagnosisProgramSectionProps {
  program: DiagnosisProgram;
  onBack: () => void;
  onCreateResult: (input: DiagnosisInput) => void;
  onViewResult: () => void;
  canViewResult: boolean;
  initialMemberName?: string;
}

export const DiagnosisProgramSection: React.FC<DiagnosisProgramSectionProps> = ({
  program,
  onBack,
  onCreateResult,
  onViewResult,
  canViewResult,
  initialMemberName,
}) => {
  const [memberName, setMemberName] = useState(initialMemberName ?? '');
  const [factorScores, setFactorScores] = useState<Record<DiagnosisFactorKey, number>>(() =>
    program.factors.reduce(
      (acc, factor) => ({ ...acc, [factor.key]: factor.score }),
      {} as Record<DiagnosisFactorKey, number>
    )
  );
  const [courseMentalNote, setCourseMentalNote] = useState('');
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  const scoreEntries = useMemo(
    () => program.factors.map((factor) => ({ key: factor.key, label: factor.label, score: factorScores[factor.key] ?? 0 })),
    [factorScores, program.factors]
  );

  const handleScoreChange = (key: DiagnosisFactorKey, value: string) => {
    const parsed = Number(value);
    const normalizedScore = Number.isNaN(parsed) ? 0 : parsed;
    setFactorScores((prev) => ({ ...prev, [key]: clampDiagnosisScore(normalizedScore) }));
  };

  const handleCreateResult = () => {
    onCreateResult({
      memberName,
      factorScores,
    });
  };

  const currentStep = program.steps[activeStepIndex];
  const isFirstStep = activeStepIndex === 0;
  const isFinalStep = activeStepIndex === program.steps.length - 1;

  const renderStepInput = () => {
    if (!currentStep) return null;

    if (currentStep.id === 'golfer-profile') {
      return (
        <label className="block space-y-2">
          <span className="text-sm text-slate-300">회원명</span>
          <input
            value={memberName}
            onChange={(event) => setMemberName(event.target.value)}
            placeholder="회원명을 입력하세요"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
            data-testid="diagnosis-member-name-input"
          />
        </label>
      );
    }

    if (currentStep.id === 'body-diagnosis' || currentStep.id === 'equipment-diagnosis' || currentStep.id === 'skill-diagnosis') {
      const stepFactorMap: Record<'body-diagnosis' | 'equipment-diagnosis' | 'skill-diagnosis', DiagnosisFactorKey> = {
        'body-diagnosis': 'body',
        'equipment-diagnosis': 'equipment',
        'skill-diagnosis': 'skill',
      };
      const factorKey = stepFactorMap[currentStep.id];
      const factor = program.factors.find((item) => item.key === factorKey);
      if (!factor) return null;

      return (
        <label className="block space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3">
          <span className="text-sm text-slate-300">{factor.label} 점수</span>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={factorScores[factorKey] ?? 0}
            onChange={(event) => handleScoreChange(factorKey, event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
            data-testid={`diagnosis-score-input-${factorKey}`}
          />
          <p className="text-xs text-slate-400">점수는 0~100 범위로 자동 보정됩니다.</p>
        </label>
      );
    }

    if (currentStep.id === 'course-mental') {
      return (
        <label className="block space-y-2">
          <span className="text-sm text-slate-300">코스메니지먼트 & 멘탈 진단 메모</span>
          <textarea
            value={courseMentalNote}
            onChange={(event) => setCourseMentalNote(event.target.value)}
            placeholder="코스 운영 판단, 루틴, 멘탈 상태를 입력하세요."
            rows={5}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
            data-testid="diagnosis-course-mental-input"
          />
        </label>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-300">입력된 진단 항목을 확인한 뒤 통합 리포트를 생성하세요.</p>
        <ul className="space-y-2 text-sm text-slate-300">
          <li>회원명: {memberName || '-'}</li>
          {scoreEntries.map((entry) => (
            <li key={entry.key}>
              {entry.label}: {entry.score}점
            </li>
          ))}
          <li>코스메니지먼트 & 멘탈 메모: {courseMentalNote.trim() || '-'}</li>
        </ul>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="diagnosis-program-section">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-100">coachxai 정밀진단 프로그램</h1>
        <Button variant="ghost" onClick={onBack}>
          대시보드로 돌아가기
        </Button>
      </div>

      <DiagnosisHero title={program.title} subtitle={program.subtitle} description={program.description} />

      <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
        <h3 className="text-lg font-semibold text-slate-100">진단 입력</h3>
        <div className="mt-4 space-y-4" data-testid="diagnosis-step-panel">
          <div>
            <nav aria-label="진단 진행 상태">
              <ol className="flex flex-wrap gap-2 text-xs font-semibold text-slate-300">
                {program.steps.map((step, index) => (
                  <li
                    key={step.id}
                    aria-current={index === activeStepIndex ? 'step' : undefined}
                    className={`rounded-full border px-2 py-1 ${
                      index === activeStepIndex
                        ? 'border-violet-500 bg-violet-500/20 text-violet-200'
                        : 'border-slate-700 bg-slate-900 text-slate-400'
                    }`}
                  >
                    {index + 1}
                  </li>
                ))}
              </ol>
            </nav>
            <p className="mt-2 text-sm font-semibold text-violet-300">프로세스 {activeStepIndex + 1} / {program.steps.length}</p>
            <p className="mt-1 font-medium text-slate-100">{currentStep?.title}</p>
            <p className="mt-1 text-sm text-slate-300">{currentStep?.description}</p>
          </div>
          {renderStepInput()}
          {!isFinalStep && (
            <p id="diagnosis-generate-hint" className="text-xs text-slate-400">
              진단 결과 생성은 마지막 프로세스에서 가능합니다.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setActiveStepIndex((prev) => Math.max(prev - 1, 0))}
              disabled={isFirstStep}
              data-testid="diagnosis-prev-step-btn"
            >
              이전 프로세스
            </Button>
            {!isFinalStep && (
              <Button onClick={() => setActiveStepIndex((prev) => Math.min(prev + 1, program.steps.length - 1))} data-testid="diagnosis-next-step-btn">
                다음 프로세스
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          onClick={handleCreateResult}
          data-testid="diagnosis-view-result-btn"
          disabled={!isFinalStep}
          aria-describedby={!isFinalStep ? 'diagnosis-generate-hint' : undefined}
        >
          진단 결과 생성
        </Button>
        <Button variant="ghost" onClick={onViewResult} disabled={!canViewResult} data-testid="diagnosis-view-latest-result-btn">
          최근 결과 보기
        </Button>
      </div>
    </div>
  );
};
