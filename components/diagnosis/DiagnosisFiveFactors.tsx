import React from 'react';
import { DiagnosisFactor } from '../../types/diagnosis';

interface DiagnosisFiveFactorsProps {
  factors: DiagnosisFactor[];
}

export const DiagnosisFiveFactors: React.FC<DiagnosisFiveFactorsProps> = ({ factors }) => {
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
      <h3 className="text-lg font-semibold text-slate-100">5개 핵심 진단 영역</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {factors.map((factor) => (
          <article key={factor.key} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium text-slate-100">{factor.label}</p>
              <p className="text-sm text-violet-300">{factor.score}/{factor.maxScore}</p>
            </div>
            <p className="mt-2 text-sm text-slate-300">{factor.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
};
