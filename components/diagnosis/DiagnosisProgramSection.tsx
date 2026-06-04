import React from 'react';
import { DiagnosisProgram } from '../../types/diagnosis';
import { DiagnosisHero } from './DiagnosisHero';
import { DiagnosisFiveFactors } from './DiagnosisFiveFactors';
import { DiagnosisProcess } from './DiagnosisProcess';
import { Button } from '../Button';

interface DiagnosisProgramSectionProps {
  program: DiagnosisProgram;
  onBack: () => void;
  onViewResult: () => void;
}

export const DiagnosisProgramSection: React.FC<DiagnosisProgramSectionProps> = ({
  program,
  onBack,
  onViewResult,
}) => {
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

      <div className="flex justify-end">
        <Button onClick={onViewResult} data-testid="diagnosis-view-result-btn">
          샘플 결과 보기
        </Button>
      </div>
    </div>
  );
};
