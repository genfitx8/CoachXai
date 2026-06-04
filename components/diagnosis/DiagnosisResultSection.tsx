import React from 'react';
import { DiagnosisResult } from '../../types/diagnosis';
import { DiagnosisResultSummary } from './DiagnosisResultSummary';
import { DiagnosisRadarChart } from './DiagnosisRadarChart';
import { DiagnosisPartCard } from './DiagnosisPartCard';
import { DiagnosisRecommendationList } from './DiagnosisRecommendationList';
import { Button } from '../Button';

interface DiagnosisResultSectionProps {
  result: DiagnosisResult;
  onBack: () => void;
  onBackToProgram: () => void;
}

export const DiagnosisResultSection: React.FC<DiagnosisResultSectionProps> = ({
  result,
  onBack,
  onBackToProgram,
}) => {
  return (
    <div className="space-y-6 animate-fade-in" data-testid="diagnosis-result-section">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-100">정밀진단 결과</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onBackToProgram} data-testid="diagnosis-back-to-program-btn">
            프로그램 소개로
          </Button>
          <Button variant="ghost" onClick={onBack}>
            대시보드로 돌아가기
          </Button>
        </div>
      </div>

      <DiagnosisResultSummary
        memberName={result.memberName}
        overallScore={result.overallScore}
        grade={result.grade}
        summary={result.summary}
      />

      <DiagnosisRadarChart factors={result.factors} />

      <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
        <h3 className="text-lg font-semibold text-slate-100">파트별 분석</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {result.partResults.map((part) => (
            <DiagnosisPartCard key={part.id} part={part} />
          ))}
        </div>
      </section>

      <DiagnosisRecommendationList recommendations={result.recommendations} />
    </div>
  );
};
