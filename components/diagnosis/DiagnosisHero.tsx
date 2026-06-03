import React from 'react';
import { DIAGNOSIS_PROGRAM_OVERVIEW } from '../../constants/diagnosis';

interface DiagnosisHeroProps {
  onStartDiagnosis?: () => void;
  onViewSample?: () => void;
}

export const DiagnosisHero: React.FC<DiagnosisHeroProps> = ({ onStartDiagnosis, onViewSample }) => {
  const overview = DIAGNOSIS_PROGRAM_OVERVIEW;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 border border-emerald-900/40 shadow-2xl shadow-black/40">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-400 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />
      </div>

      <div className="relative z-10 px-6 py-8 md:px-10 md:py-12">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Premium Program
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-bold text-slate-50 mb-2 leading-tight">
          {overview.title}
        </h1>
        <p className="text-base text-emerald-300/90 font-medium mb-4">{overview.subtitle}</p>
        <p className="text-slate-300 text-sm md:text-base leading-relaxed mb-6 max-w-xl">
          {overview.description}
        </p>

        {/* Meta info */}
        <div className="flex flex-wrap gap-4 mb-8">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <span className="text-emerald-400">⏱</span>
            <span>{overview.duration}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <span className="text-emerald-400">💰</span>
            <span className="font-semibold text-slate-100">{overview.price}</span>
          </div>
        </div>

        {/* Includes list */}
        <div className="mb-8">
          <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">포함 내용</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {overview.includesItems.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="text-emerald-400 mt-0.5 shrink-0">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onStartDiagnosis}
            className="flex-1 sm:flex-none px-8 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-900/40 transition-all duration-200 active:scale-[0.98]"
          >
            진단 신청하기
          </button>
          <button
            onClick={onViewSample}
            className="flex-1 sm:flex-none px-8 py-3.5 rounded-xl border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-slate-100 font-semibold text-sm transition-all duration-200 active:scale-[0.98]"
          >
            샘플 결과 보기
          </button>
        </div>
      </div>
    </div>
  );
};
