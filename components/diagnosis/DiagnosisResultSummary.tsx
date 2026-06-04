import React from 'react';

interface DiagnosisResultSummaryProps {
  memberName: string;
  overallScore: number;
  grade: string;
  summary: string;
}

export const DiagnosisResultSummary: React.FC<DiagnosisResultSummaryProps> = ({
  memberName,
  overallScore,
  grade,
  summary,
}) => {
  return (
    <section className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-slate-900 to-slate-800 p-6">
      <p className="text-sm text-slate-300">대상 회원</p>
      <h2 className="mt-1 text-2xl font-bold text-slate-100">{memberName} 진단 요약</h2>
      <div className="mt-4 flex items-center gap-3">
        <div className="rounded-xl bg-violet-500/20 px-4 py-2 text-sm font-semibold text-violet-200">종합 등급 {grade}</div>
        <div className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200">점수 {overallScore}</div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-slate-300">{summary}</p>
    </section>
  );
};
