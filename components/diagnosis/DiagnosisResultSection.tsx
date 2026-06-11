import React from 'react';
import { DiagnosisFactor, DiagnosisResult, GolferProfile, SkillShotData } from '../../types/diagnosis';
import { DiagnosisResultSummary } from './DiagnosisResultSummary';
import { DiagnosisRadarChart } from './DiagnosisRadarChart';
import { DiagnosisRecommendationList } from './DiagnosisRecommendationList';
import { Button } from '../Button';

// ─── Factor theme ────────────────────────────────────────────────────────────
const FACTOR_THEME: Record<string, { border: string; bg: string; text: string; label: string; gaugeColor: string }> = {
  body:      { border: 'border-violet-500/40', bg: 'bg-violet-500/10', text: 'text-violet-300', label: '신체',  gaugeColor: '#8b5cf6' },
  equipment: { border: 'border-indigo-400/40', bg: 'bg-indigo-400/10', text: 'text-indigo-300', label: '장비',  gaugeColor: '#6366f1' },
  skill:     { border: 'border-cyan-500/40',   bg: 'bg-cyan-500/10',   text: 'text-cyan-300',   label: '기술',  gaugeColor: '#06b6d4' },
};

// ─── Small circular score gauge ───────────────────────────────────────────────
const ScoreGauge: React.FC<{ score: number; color: string }> = ({ score, color }) => {
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <svg viewBox="0 0 64 64" className="w-16 h-16 shrink-0" aria-label={`점수 ${score}`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="#1e293b" strokeWidth="7" />
      <circle
        cx="32" cy="32" r={r}
        fill="none" stroke={color} strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="37" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">{score}</text>
    </svg>
  );
};

// ─── Skill shot data table ────────────────────────────────────────────────────
const SkillShotTable: React.FC<{ shots: SkillShotData[]; title: string }> = ({ shots, title }) => {
  const withData = shots.filter(
    (s) => s.carryDistance != null || s.totalDistance != null || s.dispersion != null
  );
  if (!withData.length) return null;

  const fmt = (v: number | null, suffix = '') => (v != null ? `${v}${suffix}` : '—');

  return (
    <div>
      <h5 className="mb-2 text-sm font-semibold text-slate-300">{title}</h5>
      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/60">
              {['목표(m)', '캐리', '토탈', '탄착군', '발사각', '최고점', '스핀'].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium text-slate-400 first:text-slate-300 last:text-right">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shots.map((shot) => {
              const deviationPct =
                shot.carryDistance != null
                  ? Math.abs(shot.carryDistance - shot.targetDistance) / shot.targetDistance
                  : null;
              const rowAccent =
                deviationPct != null && deviationPct > 0.12
                  ? 'bg-rose-950/20'
                  : deviationPct != null && deviationPct <= 0.05
                  ? 'bg-emerald-950/20'
                  : '';

              return (
                <tr key={shot.targetDistance} className={`border-b border-slate-800 last:border-0 ${rowAccent}`}>
                  <td className="px-3 py-1.5 font-semibold text-slate-200">{shot.targetDistance}</td>
                  <td className="px-3 py-1.5 text-slate-300">{fmt(shot.carryDistance)}</td>
                  <td className="px-3 py-1.5 text-slate-300">{fmt(shot.totalDistance)}</td>
                  <td className="px-3 py-1.5 text-slate-300">{fmt(shot.dispersion)}</td>
                  <td className="px-3 py-1.5 text-slate-300">{fmt(shot.launchAngle, '°')}</td>
                  <td className="px-3 py-1.5 text-slate-300">{fmt(shot.apexHeight)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-300">{fmt(shot.spinRate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Course/mental display ────────────────────────────────────────────────────
const CourseMentalDisplay: React.FC<{ profile: GolferProfile }> = ({ profile }) => {
  const data = profile.courseMentalData;
  if (!data) return null;

  const allItems = [...data.courseManagement, ...data.mental];
  const hasRatings = allItems.some((i) => i.rating !== null);
  if (!hasRatings && !data.courseNote && !data.mentalNote) return null;

  const RATING_LABEL = ['', '매우 부족', '부족', '보통', '양호', '우수'];
  const RATING_COLOR = ['', 'text-rose-400', 'text-orange-400', 'text-amber-400', 'text-emerald-400', 'text-emerald-300'];

  const renderGroup = (
    items: typeof data.courseManagement,
    title: string,
    note: string
  ) => {
    const rated = items.filter((i) => i.rating !== null);
    if (!rated.length && !note) return null;
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-violet-300">{title}</h4>
        {rated.map((item) => (
          <div key={item.key} className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-xs text-slate-400">{item.label}</span>
            <div className="flex flex-1 gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <div
                  key={n}
                  className={`h-2 flex-1 rounded-full ${n <= (item.rating ?? 0) ? 'bg-violet-500' : 'bg-slate-700'}`}
                />
              ))}
            </div>
            <span className={`w-16 text-right text-xs font-medium ${RATING_COLOR[item.rating ?? 0]}`}>
              {RATING_LABEL[item.rating ?? 0]}
            </span>
          </div>
        ))}
        {note && (
          <p className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-400">
            {note}
          </p>
        )}
      </div>
    );
  };

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 space-y-5">
      <h3 className="text-lg font-semibold text-slate-100">코스메니지먼트 &amp; 멘탈</h3>
      {renderGroup(data.courseManagement, '코스 메니지먼트', data.courseNote)}
      {renderGroup(data.mental, '멘탈', data.mentalNote)}
    </section>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
interface DiagnosisResultSectionProps {
  result: DiagnosisResult;
  onBack: () => void;
  onBackToProgram: () => void;
  createdAt?: string;
}

export const DiagnosisResultSection: React.FC<DiagnosisResultSectionProps> = ({
  result,
  onBack,
  onBackToProgram,
  createdAt,
}) => {
  const profile = result.golferProfile;

  return (
    <div className="space-y-6 animate-fade-in" data-testid="diagnosis-result-section">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-100">통합 데이터 분석 리포트</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onBackToProgram} data-testid="diagnosis-back-to-program-btn">
            프로그램으로
          </Button>
          <Button variant="ghost" onClick={onBack}>
            대시보드
          </Button>
        </div>
      </div>

      {/* 1. Summary + score ring */}
      <DiagnosisResultSummary
        memberName={result.memberName}
        overallScore={result.overallScore}
        grade={result.grade}
        summary={result.summary}
        factors={result.factors}
        golferProfile={profile}
        createdAt={createdAt}
      />

      {/* 2. 3-factor gauge cards */}
      <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
        <h3 className="mb-4 text-lg font-semibold text-slate-100">3개 핵심 영역 진단</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {result.factors.map((factor) => {
            const th = FACTOR_THEME[factor.key] ?? { border: 'border-slate-700', bg: 'bg-slate-800/50', text: 'text-slate-300', label: factor.key, gaugeColor: '#8b5cf6' };
            return (
              <div key={factor.key} className={`rounded-xl border p-4 space-y-3 ${th.border} ${th.bg}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className={`text-sm font-bold ${th.text}`}>{th.label}</p>
                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{factor.label}</p>
                  </div>
                  <ScoreGauge score={factor.score} color={th.gaugeColor} />
                </div>
                <p className="text-xs leading-relaxed text-slate-400">{factor.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Radar chart */}
      <DiagnosisRadarChart factors={result.factors} />

      {/* 4. Skill shot data table */}
      {profile?.skillDiagnosisData && (
        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 space-y-5">
          <h3 className="text-lg font-semibold text-slate-100">기술 진단 상세 데이터</h3>
          <SkillShotTable
            shots={profile.skillDiagnosisData.fullShots}
            title="풀샷 (130m~210m)"
          />
          <SkillShotTable
            shots={profile.skillDiagnosisData.shortGameShots}
            title="숏게임 (30m~100m)"
          />
          {!profile.skillDiagnosisData.fullShots.some((s) => s.carryDistance != null) &&
           !profile.skillDiagnosisData.shortGameShots.some((s) => s.carryDistance != null) && (
            <p className="text-sm text-slate-500">기술 진단 데이터가 입력되지 않았습니다.</p>
          )}
          <p className="text-xs text-slate-500">
            * 초록 행: 캐리 오차 ≤5% / 빨간 행: 캐리 오차 &gt;12%
          </p>
        </section>
      )}

      {/* 5. Course/Mental */}
      {profile && <CourseMentalDisplay profile={profile} />}

      {/* 6. Part results */}
      <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
        <h3 className="mb-4 text-lg font-semibold text-slate-100">통합 분석 결과</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {result.partResults.map((part) => (
            <article key={part.id} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <h4 className="font-semibold text-slate-100">{part.title}</h4>
              <p className="mt-1 text-sm text-slate-300">{part.summary}</p>
              <ul className="mt-3 space-y-1.5 pl-4 text-sm text-slate-300">
                {part.details.map((detail, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* 7. Recommendations */}
      <DiagnosisRecommendationList recommendations={result.recommendations} />
    </div>
  );
};
