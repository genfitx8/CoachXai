import React from 'react';
import { RadarChartPoint } from '../../types/diagnosis';

interface DiagnosisRadarChartProps {
  data: RadarChartPoint[];
  size?: number;
}

/**
 * Lightweight SVG-based radar chart for five diagnosis factors.
 * No external charting library required.
 */
export const DiagnosisRadarChart: React.FC<DiagnosisRadarChartProps> = ({ data, size = 260 }) => {
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size / 2) * 0.72;
  const levels = 4;
  const count = data.length;
  const angleStep = (Math.PI * 2) / count;

  const getPoint = (index: number, r: number): [number, number] => {
    const angle = index * angleStep - Math.PI / 2;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };

  // Build grid polygons
  const gridPolygons = Array.from({ length: levels }, (_, i) => {
    const r = (radius * (i + 1)) / levels;
    const points = Array.from({ length: count }, (__, j) => getPoint(j, r));
    return points.map((p) => p.join(',')).join(' ');
  });

  // Build data polygon
  const dataPoints = data.map((d, i) => {
    const r = (d.value / 100) * radius;
    return getPoint(i, r);
  });
  const dataPolygon = dataPoints.map((p) => p.join(',')).join(' ');

  return (
    <div className="flex flex-col items-center gap-4">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-label="진단 레이더 차트"
        className="overflow-visible"
      >
        {/* Grid polygons */}
        {gridPolygons.map((pts, i) => (
          <polygon
            key={i}
            points={pts}
            fill="none"
            stroke="rgba(148,163,184,0.15)"
            strokeWidth="1"
          />
        ))}

        {/* Axis lines */}
        {Array.from({ length: count }, (_, i) => {
          const [x, y] = getPoint(i, radius);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="rgba(148,163,184,0.12)"
              strokeWidth="1"
            />
          );
        })}

        {/* Data fill */}
        <polygon
          points={dataPolygon}
          fill="rgba(16,185,129,0.15)"
          stroke="rgba(16,185,129,0.7)"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {dataPoints.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={4} fill="#10b981" stroke="#065f46" strokeWidth="1.5" />
        ))}

        {/* Labels */}
        {data.map((d, i) => {
          const labelRadius = radius + 22;
          const [x, y] = getPoint(i, labelRadius);
          return (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="11"
              fontWeight="600"
              fill="#cbd5e1"
            >
              {d.label}
            </text>
          );
        })}

        {/* Value labels */}
        {data.map((d, i) => {
          const r = (d.value / 100) * radius;
          const [x, y] = getPoint(i, r);
          return (
            <text
              key={`val_${i}`}
              x={x}
              y={y - 7}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill="#34d399"
            >
              {d.value}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {data.map((d) => (
          <div key={d.partType} className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span>{d.label}</span>
            <span className="font-bold text-emerald-300">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
