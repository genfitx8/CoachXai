import React from 'react';
import { DiagnosisProcessStep } from '../../types/diagnosis';

interface DiagnosisProcessProps {
  steps: DiagnosisProcessStep[];
}

export const DiagnosisProcess: React.FC<DiagnosisProcessProps> = ({ steps }) => {
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
      <h3 className="text-lg font-semibold text-slate-100">진행 프로세스</h3>
      <ol className="mt-4 space-y-3">
        {steps.map((step, index) => (
          <li key={step.id} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <p className="text-sm font-semibold text-violet-300">STEP {index + 1}</p>
            <p className="mt-1 font-medium text-slate-100">{step.title}</p>
            <p className="mt-1 text-sm text-slate-300">{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
};
