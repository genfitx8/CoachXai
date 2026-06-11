import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ShortGameDiagnosisData } from '../../types/diagnosis';
import { calculateShortGameDiagnosisScore } from '../../utils/diagnosis';

interface Props {
  data: ShortGameDiagnosisData;
  onChange: (data: ShortGameDiagnosisData) => void;
}

const parseNullable = (raw: string): number | null => {
  if (!raw.trim()) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
};

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-violet-500 text-center';

export const ShortGameDiagnosisSection: React.FC<Props> = ({ data, onChange }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    pitch: true,
    chip: true,
    putting: true,
  });

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  // ── Pitch shot helpers ──────────────────────────────────────
  const updatePitchAttempt = (distIdx: number, attemptIdx: number, raw: string) => {
    const next = data.pitchShots.map((d, di) =>
      di !== distIdx
        ? d
        : {
            ...d,
            attempts: d.attempts.map((a, ai) =>
              ai !== attemptIdx ? a : { proximityToHole: parseNullable(raw) }
            ),
          }
    );
    onChange({ ...data, pitchShots: next });
  };

  // ── Chip shot helpers ───────────────────────────────────────
  const updateChipShot = (idx: number, raw: string) => {
    const next = data.chipShots.map((d, i) =>
      i !== idx ? d : { ...d, proximityToHole: parseNullable(raw) }
    );
    onChange({ ...data, chipShots: next });
  };

  // ── Putting distance feel helpers ───────────────────────────
  const updateDistanceFeel = (idx: number, raw: string) => {
    const next = data.puttingDistanceFeel.map((d, i) =>
      i !== idx ? d : { ...d, proximityToHole: parseNullable(raw) }
    );
    onChange({ ...data, puttingDistanceFeel: next });
  };

  // ── Short putting helpers ───────────────────────────────────
  const updateShortPutt = (idx: number, raw: string) => {
    const parsed = parseNullable(raw);
    const clamped = parsed !== null ? Math.min(12, Math.max(0, parsed)) : null;
    const next = data.shortPutting.map((d, i) =>
      i !== idx ? d : { ...d, madeCount: clamped }
    );
    onChange({ ...data, shortPutting: next });
  };

  const autoScore = calculateShortGameDiagnosisScore(data);

  const sectionHeader = (key: string, title: string, subtitle: string) => (
    <button
      type="button"
      onClick={() => toggle(key)}
      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition-colors"
    >
      <div>
        <p className="text-sm font-semibold text-violet-300 text-left">{title}</p>
        <p className="text-xs text-slate-400 text-left mt-0.5">{subtitle}</p>
      </div>
      {expanded[key] ? (
        <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
      ) : (
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
      )}
    </button>
  );

  return (
    <div className="space-y-4">

      {/* ── 피치샷 ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        {sectionHeader('pitch', '피치샷', '10 · 15 · 20 · 25 · 30m — 각 거리 3회, 홀 근접도(cm) 입력')}
        {expanded.pitch && (
          <div className="px-4 pb-4 space-y-3">
            {data.pitchShots.map((dist, di) => (
              <div key={dist.targetDistance}>
                <p className="text-xs font-semibold text-slate-300 mb-1.5">
                  {dist.targetDistance}m
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {dist.attempts.map((attempt, ai) => (
                    <label key={ai} className="space-y-1">
                      <span className="text-xs text-slate-500">{ai + 1}번째 (cm)</span>
                      <input
                        type="number"
                        min={0}
                        value={attempt.proximityToHole ?? ''}
                        onChange={(e) => updatePitchAttempt(di, ai, e.target.value)}
                        placeholder="—"
                        className={inputCls}
                        data-testid={`pitch-${dist.targetDistance}-${ai}`}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 칩샷/범퍼샷 ────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        {sectionHeader('chip', '칩샷 / 범퍼샷', '10 · 15 · 20m — 홀 근접도 평균(cm) 입력')}
        {expanded.chip && (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-3 gap-3">
              {data.chipShots.map((dist, idx) => (
                <label key={dist.targetDistance} className="space-y-1">
                  <span className="text-xs text-slate-400">{dist.targetDistance}m (cm)</span>
                  <input
                    type="number"
                    min={0}
                    value={dist.proximityToHole ?? ''}
                    onChange={(e) => updateChipShot(idx, e.target.value)}
                    placeholder="—"
                    className={inputCls}
                    data-testid={`chip-${dist.targetDistance}`}
                  />
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 퍼팅 ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        {sectionHeader('putting', '퍼팅', '거리감 테스트(1~10m) + 숏퍼팅 성공률(12개씩)')}
        {expanded.putting && (
          <div className="px-4 pb-4 space-y-5">

            {/* 거리감 테스트 */}
            <div>
              <p className="text-xs font-semibold text-slate-300 mb-2">
                거리감 테스트 — 1m 간격 1회씩, 홀 근접도(cm)
              </p>
              <div className="grid grid-cols-5 gap-2">
                {data.puttingDistanceFeel.map((d, idx) => (
                  <label key={d.targetDistance} className="space-y-1">
                    <span className="text-xs text-slate-500">{d.targetDistance}m</span>
                    <input
                      type="number"
                      min={0}
                      value={d.proximityToHole ?? ''}
                      onChange={(e) => updateDistanceFeel(idx, e.target.value)}
                      placeholder="—"
                      className={inputCls}
                      data-testid={`putting-feel-${d.targetDistance}`}
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* 숏퍼팅 성공률 */}
            <div>
              <p className="text-xs font-semibold text-slate-300 mb-2">
                숏퍼팅 — 각 거리 12개 시도, 성공 횟수 입력
              </p>
              <div className="grid grid-cols-5 gap-2">
                {data.shortPutting.map((d, idx) => {
                  const pct =
                    d.madeCount !== null
                      ? Math.round((d.madeCount / 12) * 100)
                      : null;
                  return (
                    <label key={d.targetDistance} className="space-y-1">
                      <span className="text-xs text-slate-500">{d.targetDistance}m</span>
                      <input
                        type="number"
                        min={0}
                        max={12}
                        value={d.madeCount ?? ''}
                        onChange={(e) => updateShortPutt(idx, e.target.value)}
                        placeholder="—"
                        className={inputCls}
                        data-testid={`short-putt-${d.targetDistance}`}
                      />
                      {pct !== null && (
                        <span className="text-xs text-emerald-400 block text-center">{pct}%</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 자동 계산 점수 ───────────────────────────────────── */}
      {autoScore !== null && (
        <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/30 p-4 flex items-center justify-between">
          <span className="text-sm text-slate-300">숏게임 퍼포먼스 자동 계산 점수</span>
          <span className="text-lg font-bold text-emerald-400">{autoScore}점</span>
        </div>
      )}
    </div>
  );
};
