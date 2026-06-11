import React from 'react';
import { DiagnosisRecommendation } from '../../types/diagnosis';

interface DiagnosisRecommendationListProps {
  recommendations: DiagnosisRecommendation[];
}

const PRIORITY = [
  {
    label: '최우선',
    cardCls: 'border-rose-500/30 bg-rose-500/10',
    badgeCls: 'bg-rose-500/20 text-rose-300',
    titleCls: 'text-rose-200',
    numCls: 'text-rose-400',
  },
  {
    label: '2순위',
    cardCls: 'border-amber-500/30 bg-amber-500/10',
    badgeCls: 'bg-amber-500/20 text-amber-300',
    titleCls: 'text-amber-200',
    numCls: 'text-amber-400',
  },
  {
    label: '3순위',
    cardCls: 'border-slate-700 bg-slate-900',
    badgeCls: 'bg-slate-700 text-slate-400',
    titleCls: 'text-slate-200',
    numCls: 'text-slate-500',
  },
];

export const DiagnosisRecommendationList: React.FC<DiagnosisRecommendationListProps> = ({ recommendations }) => {
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
      <h3 className="text-lg font-semibold text-slate-100">맞춤형 개선 로드맵</h3>
      <ul className="mt-4 space-y-3">
        {recommendations.map((rec, idx) => {
          const p = PRIORITY[idx] ?? PRIORITY[2];
          return (
            <li key={rec.id} className={`rounded-xl border p-4 ${p.cardCls}`}>
              <div className="flex items-start gap-3">
                <span className={`text-2xl font-black leading-none mt-0.5 ${p.numCls}`}>
                  {idx + 1}
                </span>
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${p.badgeCls}`}>
                      {p.label}
                    </span>
                    <p className={`text-sm font-semibold ${p.titleCls}`}>{rec.title}</p>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-300">{rec.content}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
