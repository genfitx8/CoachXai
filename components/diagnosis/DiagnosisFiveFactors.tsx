import React from 'react';
import { DIAGNOSIS_PARTS } from '../../constants/diagnosis';

export const DiagnosisFiveFactors: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="mb-2">
        <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">진단 영역</p>
        <h2 className="text-xl font-bold text-slate-50">5대 핵심 요인</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {DIAGNOSIS_PARTS.map((part, index) => (
          <div
            key={part.type}
            className="group bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 hover:border-emerald-700/50 hover:bg-slate-800/60 transition-all duration-200"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-lg shrink-0">
                {part.icon}
              </div>
              <div>
                <span className="text-xs text-emerald-400/80 font-medium">Factor {index + 1}</span>
                <h3 className="font-bold text-slate-100 text-sm leading-tight">{part.title}</h3>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">{part.description}</p>
            <div className="space-y-1">
              {part.metrics.slice(0, 3).map((metric) => (
                <div key={metric.id} className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="w-1 h-1 rounded-full bg-emerald-500/50 shrink-0" />
                  {metric.label}
                </div>
              ))}
              {part.metrics.length > 3 && (
                <div className="text-xs text-slate-600">+{part.metrics.length - 3}개 더</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
