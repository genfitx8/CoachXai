import React from 'react';
import { DiagnosisPartResult } from '../../types/diagnosis';

interface DiagnosisPartCardProps {
  part: DiagnosisPartResult;
}

export const DiagnosisPartCard: React.FC<DiagnosisPartCardProps> = ({ part }) => {
  return (
    <article className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <h4 className="font-semibold text-slate-100">{part.title}</h4>
      <p className="mt-1 text-sm text-slate-300">{part.summary}</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-300">
        {part.details.map((detail, index) => (
          <li key={`${part.id}-${detail}-${index}`}>{detail}</li>
        ))}
      </ul>
    </article>
  );
};
