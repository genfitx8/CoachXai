import React from 'react';

interface DiagnosisHeroProps {
  title: string;
  subtitle: string;
  description: string;
}

export const DiagnosisHero: React.FC<DiagnosisHeroProps> = ({ title, subtitle, description }) => {
  return (
    <section className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-slate-900 to-slate-800 p-6">
      <p className="text-sm font-semibold text-violet-300">Diagnosis MVP</p>
      <h2 className="mt-2 text-2xl font-bold text-slate-100">{title}</h2>
      <p className="mt-1 text-sm text-slate-300">{subtitle}</p>
      <p className="mt-4 text-sm leading-relaxed text-slate-300">{description}</p>
    </section>
  );
};
