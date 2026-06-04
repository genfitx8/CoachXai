import React from 'react';
import { DiagnosisFactor } from '../../types/diagnosis';
import { getRadarChartPoints } from '../../utils/diagnosis';

interface DiagnosisRadarChartProps {
  factors: DiagnosisFactor[];
}

export const DiagnosisRadarChart: React.FC<DiagnosisRadarChartProps> = ({ factors }) => {
  const points = getRadarChartPoints(factors);

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
      <h3 className="text-lg font-semibold text-slate-100">3개 영역 점수 분포</h3>
      <div className="mt-4 space-y-3">
        {points.map((point) => (
          <div key={point.label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-slate-300">{point.label}</span>
              <span className="text-violet-300">{point.score}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-700">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-400"
                style={{ width: `${Math.max(0, Math.min(100, point.score))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
