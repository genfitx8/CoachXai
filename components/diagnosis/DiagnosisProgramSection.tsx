import React from 'react';
import { DiagnosisHero } from './DiagnosisHero';
import { DiagnosisFiveFactors } from './DiagnosisFiveFactors';
import { DiagnosisProcess } from './DiagnosisProcess';

interface DiagnosisProgramSectionProps {
  onStartDiagnosis?: () => void;
  onViewSample?: () => void;
  onBack?: () => void;
}

export const DiagnosisProgramSection: React.FC<DiagnosisProgramSectionProps> = ({
  onStartDiagnosis,
  onViewSample,
  onBack,
}) => {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back nav */}
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-slate-100 transition-colors px-3 py-2 rounded-xl hover:bg-slate-800/80 border border-transparent hover:border-slate-700"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          대시보드로 돌아가기
        </button>
      )}

      <DiagnosisHero onStartDiagnosis={onStartDiagnosis} onViewSample={onViewSample} />
      <DiagnosisFiveFactors />
      <DiagnosisProcess />

      {/* Bottom CTA */}
      <div className="bg-slate-900/70 border border-emerald-900/30 rounded-2xl p-6 text-center">
        <p className="text-slate-300 text-sm mb-4">
          지금 바로 정밀 진단을 신청하고, 당신의 골프를 다음 레벨로 끌어올리세요.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={onStartDiagnosis}
            className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-900/40 transition-all duration-200"
          >
            정밀 진단 신청하기
          </button>
          <button
            onClick={onViewSample}
            className="px-8 py-3.5 rounded-xl border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-slate-100 font-semibold text-sm transition-all duration-200"
          >
            샘플 결과 보기
          </button>
        </div>
      </div>
    </div>
  );
};
