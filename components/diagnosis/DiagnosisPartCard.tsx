import React, { useState } from 'react';
import { PartScore } from '../../types/diagnosis';
import { getPartDefinition, getScorePercentage } from '../../utils/diagnosis';

interface DiagnosisPartCardProps {
  partScore: PartScore;
}

export const DiagnosisPartCard: React.FC<DiagnosisPartCardProps> = ({ partScore }) => {
  const [expanded, setExpanded] = useState(false);
  const def = getPartDefinition(partScore.partType);
  const pct = getScorePercentage(partScore.score, partScore.maxScore);

  const barColor =
    pct >= 75
      ? 'from-emerald-500 to-emerald-400'
      : pct >= 55
      ? 'from-sky-500 to-sky-400'
      : pct >= 35
      ? 'from-orange-500 to-orange-400'
      : 'from-red-500 to-red-400';

  return (
    <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-slate-800/30 transition-colors"
        aria-expanded={expanded}
      >
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl shrink-0">
          {def.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <h3 className="font-bold text-slate-100 text-sm">{def.title}</h3>
            <span className="text-xs font-bold text-slate-300 shrink-0">
              {partScore.score}
              <span className="text-slate-600">/{partScore.maxScore}</span>
            </span>
          </div>

          {/* Score bar */}
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full bg-gradient-to-r ${barColor} rounded-full`}
              style={{ width: `${pct}%` }}
            />
          </div>

          <p className="text-xs text-slate-400 leading-snug line-clamp-2">{partScore.summary}</p>
        </div>

        <div className={`text-slate-500 transition-transform duration-200 shrink-0 mt-1 ${expanded ? 'rotate-180' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 11L2 5h12L8 11z" />
          </svg>
        </div>
      </button>

      {/* Expanded: metric details */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-800/60">
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-4 mb-3">세부 지표</p>
          <div className="space-y-3">
            {partScore.metrics.map((metric) => {
              const metricDef = def.metrics.find((m) => m.id === metric.metricId);
              const mPct = metricDef ? getScorePercentage(metric.score, metricDef.maxScore) : 0;
              return (
                <div key={metric.metricId}>
                  <div className="flex items-baseline justify-between text-xs mb-1">
                    <span className="text-slate-300 font-medium">
                      {metricDef?.label ?? metric.metricId}
                    </span>
                    <span className="text-slate-400">
                      {metric.score}
                      <span className="text-slate-600">/{metricDef?.maxScore ?? '?'}</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-1">
                    <div
                      className={`h-full bg-gradient-to-r ${barColor} rounded-full`}
                      style={{ width: `${mPct}%` }}
                    />
                  </div>
                  {metric.comment && (
                    <p className="text-xs text-slate-500 leading-snug">{metric.comment}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
