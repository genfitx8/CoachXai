import React from 'react';
import { DiagnosisRecommendation } from '../../types/diagnosis';
import { sortRecommendationsByPriority, getPartTitle } from '../../utils/diagnosis';
import { RECOMMENDATION_CATEGORY_LABELS } from '../../constants/diagnosis';

interface DiagnosisRecommendationListProps {
  recommendations: DiagnosisRecommendation[];
  limit?: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  IMMEDIATE: 'bg-red-500/15 text-red-300 border-red-500/20',
  SHORT_TERM: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
  LONG_TERM: 'bg-sky-500/15 text-sky-300 border-sky-500/20',
  MAINTENANCE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
};

export const DiagnosisRecommendationList: React.FC<DiagnosisRecommendationListProps> = ({
  recommendations,
  limit,
}) => {
  const sorted = sortRecommendationsByPriority(recommendations);
  const displayed = limit ? sorted.slice(0, limit) : sorted;

  return (
    <div className="space-y-3">
      {displayed.map((rec) => (
        <div
          key={rec.id}
          className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 hover:border-slate-700/60 transition-colors"
        >
          <div className="flex flex-wrap items-start gap-2 mb-2">
            {/* Priority badge */}
            <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-black text-slate-300 shrink-0">
              {rec.priority}
            </span>

            {/* Category badge */}
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${CATEGORY_COLORS[rec.category] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}
            >
              {RECOMMENDATION_CATEGORY_LABELS[rec.category]}
            </span>

            {/* Part label */}
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
              {getPartTitle(rec.partType)}
            </span>

            {rec.estimatedWeeks && (
              <span className="ml-auto text-[10px] text-slate-500 shrink-0">
                ~{rec.estimatedWeeks}주
              </span>
            )}
          </div>

          <h4 className="text-sm font-semibold text-slate-100 mb-1">{rec.title}</h4>
          <p className="text-xs text-slate-400 leading-relaxed">{rec.detail}</p>
        </div>
      ))}
    </div>
  );
};
