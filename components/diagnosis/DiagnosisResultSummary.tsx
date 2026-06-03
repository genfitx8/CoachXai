import React from 'react';
import { DiagnosisSession } from '../../types/diagnosis';
import { getGradeDefinition, getScorePercentage } from '../../utils/diagnosis';

interface DiagnosisResultSummaryProps {
  session: DiagnosisSession;
}

export const DiagnosisResultSummary: React.FC<DiagnosisResultSummaryProps> = ({ session }) => {
  const gradeDef = getGradeDefinition(session.grade);
  const pct = getScorePercentage(session.totalScore, session.maxTotalScore);

  return (
    <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl overflow-hidden">
      {/* Header strip */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-5 border-b border-slate-800/60">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Client info */}
          <div className="flex-1">
            <p className="text-xs text-slate-400 mb-0.5">
              진단일 · {new Date(session.conductedAt).toLocaleDateString('ko-KR')}
            </p>
            <h2 className="text-xl font-bold text-slate-50 mb-0.5">
              {session.clientName}님의 정밀 진단 결과
            </h2>
            <p className="text-xs text-slate-400">
              <span id="coach-label">담당 코치:</span>{' '}
              <span aria-labelledby="coach-label" className="text-slate-200 font-medium">{session.coachName}</span>
            </p>
          </div>

          {/* Grade badge */}
          <div className="flex flex-col items-center gap-1 bg-slate-800/70 border border-slate-700/60 rounded-xl px-6 py-4 shrink-0">
            <span className={`text-5xl font-black ${gradeDef.color}`}>{session.grade}</span>
            <span className="text-xs font-bold text-slate-300">{gradeDef.label}</span>
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div className="px-6 py-5">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm font-semibold text-slate-200">종합 점수</span>
          <span className="text-sm text-slate-300">
            <span className="text-2xl font-black text-slate-50">{session.totalScore}</span>
            <span className="text-slate-500"> / {session.maxTotalScore}</span>
            <span className={`ml-2 text-sm font-bold ${gradeDef.color}`}>({pct}%)</span>
          </span>
        </div>
        <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-1.5">{gradeDef.description}</p>
      </div>

      {/* Overall comment */}
      <div className="px-6 pb-5">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-emerald-400/80 font-semibold uppercase tracking-widest mb-2">종합 소견</p>
          <p className="text-sm text-slate-300 leading-relaxed">{session.overallComment}</p>
        </div>
      </div>
    </div>
  );
};
