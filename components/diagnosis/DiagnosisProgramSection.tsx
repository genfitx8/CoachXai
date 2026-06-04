import React, { useMemo, useState } from 'react';
import { DiagnosisFactorKey, DiagnosisInput, DiagnosisProgram } from '../../types/diagnosis';
import { DiagnosisHero } from './DiagnosisHero';
import { DiagnosisFiveFactors } from './DiagnosisFiveFactors';
import { DiagnosisProcess } from './DiagnosisProcess';
import { Button } from '../Button';

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

  const scoreEntries = useMemo(
    () => program.factors.map((factor) => ({ key: factor.key, label: factor.label, score: factorScores[factor.key] ?? 0 })),
    [factorScores, program.factors]
  );

  const handleScoreChange = (key: DiagnosisFactorKey, value: string) => {
    const parsed = Number(value);
    const normalizedScore = Number.isNaN(parsed) ? 0 : parsed;
    setFactorScores((prev) => ({ ...prev, [key]: Math.max(0, Math.min(100, normalizedScore)) }));
  };

  const handleCreateResult = () => {
    onCreateResult({
      memberName,
      factorScores,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="diagnosis-program-section">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-100">정밀진단 프로그램</h1>
        <Button variant="ghost" onClick={onBack}>
          대시보드로 돌아가기
        </Button>
      </div>

      <DiagnosisHero title={program.title} subtitle={program.subtitle} description={program.description} />
      <DiagnosisFiveFactors factors={program.factors} />
      <DiagnosisProcess steps={program.steps} />

      <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
        <h3 className="text-lg font-semibold text-slate-100">진단 입력</h3>
        <div className="mt-4 space-y-4">
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
          <div className="grid gap-3 md:grid-cols-2">
            {scoreEntries.map((entry) => (
              <label key={entry.key} className="block space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3">
                <span className="text-sm text-slate-300">{entry.label} 점수</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={entry.score}
                  onChange={(event) => handleScoreChange(entry.key, event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid={`diagnosis-score-input-${entry.key}`}
                />
              </label>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={handleCreateResult} data-testid="diagnosis-view-result-btn">
          진단 결과 생성
        </Button>
        <Button variant="ghost" onClick={onViewResult} disabled={!canViewResult} data-testid="diagnosis-view-latest-result-btn">
          최근 결과 보기
        </Button>
      </div>
    </div>
  );
};
