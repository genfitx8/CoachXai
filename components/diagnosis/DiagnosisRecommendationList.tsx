import React from 'react';
import { DiagnosisRecommendation } from '../../types/diagnosis';

interface DiagnosisRecommendationListProps {
  recommendations: DiagnosisRecommendation[];
}

export const DiagnosisRecommendationList: React.FC<DiagnosisRecommendationListProps> = ({ recommendations }) => {
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
      <h3 className="text-lg font-semibold text-slate-100">추천 훈련</h3>
      <ul className="mt-4 space-y-3">
        {recommendations.map((recommendation) => (
          <li key={recommendation.id} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <p className="font-medium text-slate-100">{recommendation.title}</p>
            <p className="mt-1 text-sm text-slate-300">{recommendation.content}</p>
          </li>
        ))}
      </ul>
    </section>
  );
};
