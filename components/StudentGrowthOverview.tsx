import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowUpRight, BarChart3, Ruler, TrendingDown, TrendingUp } from 'lucide-react';
import type { ClientProfile, Lesson } from '../types';
import type { DiagnosisFactor, DiagnosisFactorKey } from '../types/diagnosis';
import { diagnosisService } from '../services/diagnosisService';
import { useLanguage } from './LanguageContext';

/**
 * 5b · Student "성장" tab top banner — pulls together the three
 * headline signals the redesign wants above the existing 기록함:
 *
 *  1. "지금 상태" — the latest 진단 3-score set (body / equipment /
 *     skill), each showing the delta against the previous session.
 *  2. 샷 / 스코어 / 몸 — three quick-summary chips derived from lessons
 *     the student's already logged, with an inline CTA into the deeper
 *     ClientStats view when the coach wants full charts.
 *
 * The banner is intentionally read-only: mutations still live in the
 * diagnosis flow and lesson recorder. When the underlying data is
 * empty, the block renders a lightweight empty state instead of
 * hollow cards.
 */

export interface StudentGrowthOverviewProps {
  clientProfile: ClientProfile;
  lessons: Lesson[];
  /** CTA below the chart tabs — opens the existing ClientStats screen. */
  onOpenDetailedStats: () => void;
  /** Optional CTA into the diagnosis flow when the student has none. */
  onStartDiagnosis?: () => void;
}

type ChartTab = 'shot' | 'score' | 'body';

const FACTOR_LABEL: Record<DiagnosisFactorKey, string> = {
  body: '몸',
  equipment: '장비',
  skill: '기술',
};

export const StudentGrowthOverview: React.FC<StudentGrowthOverviewProps> = ({
  clientProfile,
  lessons,
  onOpenDetailedStats,
  onStartDiagnosis,
}) => {
  useLanguage();
  const [factors, setFactors] = useState<DiagnosisFactor[] | null>(null);
  const [prevFactors, setPrevFactors] = useState<DiagnosisFactor[] | null>(null);
  const [tab, setTab] = useState<ChartTab>('shot');

  useEffect(() => {
    // diagnosisService reads from localStorage; only run in the browser.
    if (typeof window === 'undefined') return;
    const sessions = diagnosisService.getSessions();
    const latest = sessions[0];
    const prev = sessions[1];
    setFactors(latest?.result.factors ?? null);
    setPrevFactors(prev?.result.factors ?? null);
  }, []);

  const shotSummary = useMemo(() => summariseShot(lessons), [lessons]);
  const scoreSummary = useMemo(() => summariseScore(lessons), [lessons]);
  const bodySummary = useMemo(() => summariseBody(lessons, clientProfile), [lessons, clientProfile]);

  return (
    <section className="space-y-4 mb-4">
      <NowStatusCard
        factors={factors}
        prevFactors={prevFactors}
        onStartDiagnosis={onStartDiagnosis}
      />
      <ChartTabsCard
        tab={tab}
        onTabChange={setTab}
        shot={shotSummary}
        score={scoreSummary}
        body={bodySummary}
        onOpenDetailedStats={onOpenDetailedStats}
      />
    </section>
  );
};

// ─── 지금 상태 ────────────────────────────────────────────────────────────

const NowStatusCard: React.FC<{
  factors: DiagnosisFactor[] | null;
  prevFactors: DiagnosisFactor[] | null;
  onStartDiagnosis?: () => void;
}> = ({ factors, prevFactors, onStartDiagnosis }) => {
  const hasData = !!factors && factors.length > 0;

  return (
    <div className="rounded-2xl border border-line-subtle bg-white/[0.02] p-4">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
          지금 상태
        </span>
        {hasData && (
          <span className="ml-auto text-[11px] font-mono text-ink-muted">
            최근 진단 기준
          </span>
        )}
      </div>

      {hasData ? (
        <div className="grid grid-cols-3 gap-2">
          {factors!.map((f) => {
            const prev = prevFactors?.find((p) => p.key === f.key);
            const delta = prev ? f.score - prev.score : null;
            return (
              <ScoreTile
                key={f.key}
                label={FACTOR_LABEL[f.key as DiagnosisFactorKey] ?? f.label}
                score={f.score}
                maxScore={f.maxScore}
                delta={delta}
              />
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-line-default px-4 py-6 text-center">
          <div className="text-[13px] text-ink-medium mb-2">
            아직 진단 기록이 없습니다.
          </div>
          {onStartDiagnosis && (
            <button
              type="button"
              onClick={onStartDiagnosis}
              className="inline-flex items-center gap-1 text-[12px] font-bold text-emerald-300 hover:text-emerald-200"
            >
              진단 시작하기 <ArrowUpRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const ScoreTile: React.FC<{
  label: string;
  score: number;
  maxScore: number;
  delta: number | null;
}> = ({ label, score, maxScore, delta }) => {
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  return (
    <div className="rounded-xl border border-line-subtle bg-white/[0.02] px-3 py-3">
      <div className="text-[10px] font-mono uppercase tracking-wider text-ink-muted">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[22px] font-bold font-mono text-ink-high tabular-nums">
          {score}
        </span>
        <span className="text-[11px] font-mono text-ink-muted">/ {maxScore}</span>
      </div>
      <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full bg-emerald-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      {delta !== null && delta !== 0 && (
        <div
          className={`mt-1.5 text-[10px] font-mono flex items-center gap-0.5 ${
            delta > 0 ? 'text-emerald-300' : 'text-amber-300'
          }`}
        >
          {delta > 0 ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          {delta > 0 ? '+' : ''}
          {delta}
        </div>
      )}
    </div>
  );
};

// ─── 샷 / 스코어 / 몸 tabs ─────────────────────────────────────────────────

const ChartTabsCard: React.FC<{
  tab: ChartTab;
  onTabChange: (t: ChartTab) => void;
  shot: ShotSummary;
  score: ScoreSummary;
  body: BodySummary;
  onOpenDetailedStats: () => void;
}> = ({ tab, onTabChange, shot, score, body, onOpenDetailedStats }) => (
  <div className="rounded-2xl border border-line-subtle bg-white/[0.02] p-4">
    <div className="flex items-center gap-1 mb-3">
      {(['shot', 'score', 'body'] as ChartTab[]).map((k) => {
        const active = k === tab;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onTabChange(k)}
            aria-current={active ? 'page' : undefined}
            className={`relative px-3 py-1.5 text-[12.5px] font-bold rounded-lg transition-colors ${
              active
                ? 'text-emerald-300 bg-emerald-500/10'
                : 'text-ink-muted hover:text-ink-medium hover:bg-white/5'
            }`}
          >
            {k === 'shot' ? '샷' : k === 'score' ? '스코어' : '몸'}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onOpenDetailedStats}
        className="ml-auto text-[11px] font-bold text-emerald-300 hover:text-emerald-200 flex items-center gap-1"
      >
        <BarChart3 className="w-3 h-3" /> 자세히
      </button>
    </div>

    {tab === 'shot' && <ShotPanel data={shot} />}
    {tab === 'score' && <ScorePanel data={score} />}
    {tab === 'body' && <BodyPanel data={body} />}
  </div>
);

const ShotPanel: React.FC<{ data: ShotSummary }> = ({ data }) => {
  if (data.sampleCount === 0) {
    return <EmptyPanel icon={Activity} label="아직 기록된 샷 데이터가 없습니다." />;
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      <MetricCell label="평균 캐리" value={data.avgCarry ? `${data.avgCarry}m` : '—'} />
      <MetricCell label="최장 캐리" value={data.maxCarry ? `${data.maxCarry}m` : '—'} />
      <MetricCell label="샘플" value={`${data.sampleCount}회`} />
    </div>
  );
};

const ScorePanel: React.FC<{ data: ScoreSummary }> = ({ data }) => {
  if (data.rounds === 0) {
    return <EmptyPanel icon={BarChart3} label="아직 라운드 기록이 없습니다." />;
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      <MetricCell label="최근 평균" value={data.avgRecent != null ? String(data.avgRecent) : '—'} />
      <MetricCell label="베스트" value={data.best != null ? String(data.best) : '—'} />
      <MetricCell label="라운드" value={`${data.rounds}회`} />
    </div>
  );
};

const BodyPanel: React.FC<{ data: BodySummary }> = ({ data }) => {
  if (!data.hasProfile) {
    return <EmptyPanel icon={Ruler} label="체형 분석이 아직 없습니다." />;
  }
  return (
    <div className="space-y-2">
      {data.bodyType && (
        <div className="text-[13px] text-ink-high">
          체형 · <span className="font-bold">{data.bodyType}</span>
        </div>
      )}
      {data.swingType && (
        <div className="text-[13px] text-ink-medium">
          스윙 · {data.swingType}
        </div>
      )}
      {data.lastAnalyzedAt && (
        <div className="text-[11px] font-mono text-ink-muted">
          {new Date(data.lastAnalyzedAt).toLocaleDateString('ko-KR')} 갱신
        </div>
      )}
    </div>
  );
};

const MetricCell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-line-subtle bg-white/[0.02] px-2.5 py-2.5 text-center">
    <div className="text-[10px] font-mono uppercase tracking-wider text-ink-muted mb-1">
      {label}
    </div>
    <div className="text-[15px] font-bold font-mono text-ink-high tabular-nums">
      {value}
    </div>
  </div>
);

const EmptyPanel: React.FC<{ icon: React.ElementType; label: string }> = ({ icon: Icon, label }) => (
  <div className="rounded-xl border border-dashed border-line-default px-4 py-6 text-center">
    <Icon className="w-4 h-4 text-ink-muted mx-auto mb-1.5" />
    <div className="text-[12px] text-ink-muted">{label}</div>
  </div>
);

// ─── Summaries ────────────────────────────────────────────────────────────

interface ShotSummary {
  sampleCount: number;
  avgCarry: number | null;
  maxCarry: number | null;
}
interface ScoreSummary {
  rounds: number;
  avgRecent: number | null;
  best: number | null;
}
interface BodySummary {
  hasProfile: boolean;
  bodyType?: string;
  swingType?: string;
  lastAnalyzedAt?: number;
}

function summariseShot(lessons: Lesson[]): ShotSummary {
  const carries: number[] = [];
  for (const l of lessons) {
    const g = l.golfData;
    if (g && typeof g.carryDistance === 'number' && g.carryDistance > 0) {
      carries.push(g.carryDistance);
    }
  }
  if (carries.length === 0) return { sampleCount: 0, avgCarry: null, maxCarry: null };
  const avg = Math.round(carries.reduce((a, b) => a + b, 0) / carries.length);
  const max = Math.round(Math.max(...carries));
  return { sampleCount: carries.length, avgCarry: avg, maxCarry: max };
}

function summariseScore(lessons: Lesson[]): ScoreSummary {
  const scored = lessons
    .filter((l) => l.recordType === 'SCORE' && typeof l.score === 'number')
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  if (scored.length === 0) return { rounds: 0, avgRecent: null, best: null };
  const recent = scored.slice(0, 5).map((l) => l.score as number);
  const best = Math.min(...scored.map((l) => l.score as number));
  const avg = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
  return { rounds: scored.length, avgRecent: avg, best };
}

function summariseBody(lessons: Lesson[], clientProfile: ClientProfile): BodySummary {
  // Newest lesson-attached body analysis wins; falls back to any profile-level
  // signal we might have stashed. This block stays defensive because the
  // shape is optional throughout the code.
  const withBody = lessons
    .filter((l) => l.memberBodyAnalysis && (l.memberBodyAnalysis.bodyType || l.memberBodyAnalysis.swingType))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const src = withBody[0]?.memberBodyAnalysis;
  const profileBody = (clientProfile as unknown as { memberBodyAnalysis?: { bodyType?: string; swingType?: string; analyzedAt?: number } })
    .memberBodyAnalysis;
  if (!src && !profileBody) return { hasProfile: false };
  return {
    hasProfile: true,
    bodyType: src?.bodyType ?? profileBody?.bodyType,
    swingType: src?.swingType ?? profileBody?.swingType,
    lastAnalyzedAt: withBody[0]?.createdAt ?? profileBody?.analyzedAt,
  };
}

