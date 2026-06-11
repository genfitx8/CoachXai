import React from 'react';
import { DiagnosisFactor } from '../../types/diagnosis';

// SVG layout
const CX = 155;
const CY = 148;
const R = 90;
const SQ3_2 = Math.sqrt(3) / 2; // ≈ 0.866

// 3 axis directions (unit vectors from center): top, bottom-right, bottom-left
const DIRS = [
  { x: 0,     y: -1   }, // top     (body)
  { x: SQ3_2, y: 0.5  }, // BR      (equipment)
  { x: -SQ3_2,y: 0.5  }, // BL      (skill)
];

// Label anchor positions relative to center
const LABEL_OFF = [
  { dx: 0,             dy: -R - 24, anchor: 'middle' as const },
  { dx: R * SQ3_2 + 16, dy: R * 0.5 + 8, anchor: 'start' as const },
  { dx: -(R * SQ3_2 + 16), dy: R * 0.5 + 8, anchor: 'end' as const },
];

const SHORT_LABELS = ['신체', '장비', '기술'];
const FACTOR_COLORS = ['#8b5cf6', '#6366f1', '#06b6d4'];

const GRID_RATIOS = [0.25, 0.5, 0.75, 1.0];

const toXY = (dirIdx: number, ratio: number) => ({
  x: CX + ratio * R * DIRS[dirIdx].x,
  y: CY + ratio * R * DIRS[dirIdx].y,
});

const triPath = (ratio: number) => {
  const pts = [0, 1, 2].map((i) => toXY(i, ratio));
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + 'Z';
};

interface DiagnosisRadarChartProps {
  factors: DiagnosisFactor[];
}

export const DiagnosisRadarChart: React.FC<DiagnosisRadarChartProps> = ({ factors }) => {
  const f3 = factors.slice(0, 3);

  const scorePts = f3.map((factor, i) => toXY(i, factor.score / 100));
  const scorePath = scorePts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + 'Z';

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
      <h3 className="text-lg font-semibold text-slate-100">3개 영역별 점수 분포</h3>
      <div className="flex justify-center mt-4">
        <svg
          viewBox="0 0 310 270"
          className="w-full max-w-xs"
          aria-label="진단 영역별 레이더 차트"
        >
          {/* Grid triangles */}
          {GRID_RATIOS.map((ratio) => (
            <path
              key={ratio}
              d={triPath(ratio)}
              fill="none"
              stroke={ratio === 1.0 ? '#334155' : '#1e293b'}
              strokeWidth={ratio === 1.0 ? 1.5 : 1}
            />
          ))}

          {/* Grid ratio labels */}
          {[0.25, 0.5, 0.75].map((ratio) => (
            <text
              key={ratio}
              x={CX + 4}
              y={CY - ratio * R + 3}
              fill="#334155"
              fontSize="8"
            >
              {ratio * 100}
            </text>
          ))}

          {/* Axis lines */}
          {DIRS.map((_, i) => {
            const end = toXY(i, 1.0);
            return (
              <line
                key={i}
                x1={CX} y1={CY}
                x2={end.x} y2={end.y}
                stroke="#1e293b"
                strokeWidth="1"
              />
            );
          })}

          {/* Score polygon */}
          <path d={scorePath} fill="rgba(139,92,246,0.18)" stroke="#8b5cf6" strokeWidth="2" />

          {/* Score dots */}
          {scorePts.map((pt, i) => (
            <circle key={i} cx={pt.x} cy={pt.y} r="5" fill={FACTOR_COLORS[i] ?? '#8b5cf6'} />
          ))}

          {/* Labels */}
          {f3.map((factor, i) => {
            const off = LABEL_OFF[i];
            return (
              <g key={factor.key}>
                <text
                  x={CX + off.dx}
                  y={CY + off.dy}
                  textAnchor={off.anchor}
                  fill="#94a3b8"
                  fontSize="11"
                >
                  {SHORT_LABELS[i]}
                </text>
                <text
                  x={CX + off.dx}
                  y={CY + off.dy + 15}
                  textAnchor={off.anchor}
                  fill={FACTOR_COLORS[i] ?? '#8b5cf6'}
                  fontSize="15"
                  fontWeight="bold"
                >
                  {factor.score}점
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
};
