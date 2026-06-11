import React from 'react';
import { DiagnosisFactor, GolferProfile } from '../../types/diagnosis';

interface DiagnosisResultSummaryProps {
  memberName: string;
  overallScore: number;
  grade: string;
  summary: string;
  factors: DiagnosisFactor[];
  golferProfile?: GolferProfile;
  createdAt?: string;
}

const GRADE_CONFIG: Record<string, { ringColor: string; badgeCls: string; textCls: string }> = {
  A: { ringColor: '#10b981', badgeCls: 'bg-emerald-500/20 border-emerald-500/40', textCls: 'text-emerald-300' },
  B: { ringColor: '#3b82f6', badgeCls: 'bg-blue-500/20 border-blue-500/40', textCls: 'text-blue-300' },
  C: { ringColor: '#f59e0b', badgeCls: 'bg-amber-500/20 border-amber-500/40', textCls: 'text-amber-300' },
  D: { ringColor: '#f43f5e', badgeCls: 'bg-rose-500/20 border-rose-500/40', textCls: 'text-rose-300' },
};

const FACTOR_BAR = {
  body:      { bar: 'bg-violet-500', text: 'text-violet-300', short: '신체' },
  equipment: { bar: 'bg-indigo-400', text: 'text-indigo-300', short: '장비' },
  skill:     { bar: 'bg-cyan-500',   text: 'text-cyan-300',   short: '기술' },
};

const ScoreRing: React.FC<{ score: number; grade: string }> = ({ score, grade }) => {
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const cfg = GRADE_CONFIG[grade] ?? GRADE_CONFIG.D;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <svg viewBox="0 0 130 130" className="w-32 h-32" aria-label={`종합 점수 ${score}점`}>
      <circle cx="65" cy="65" r={r} fill="none" stroke="#1e293b" strokeWidth="10" />
      <circle
        cx="65" cy="65" r={r}
        fill="none"
        stroke={cfg.ringColor}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform="rotate(-90 65 65)"
      />
      <text x="65" y="60" textAnchor="middle" fill="white" fontSize="26" fontWeight="bold">{score}</text>
      <text x="65" y="78" textAnchor="middle" fill="#64748b" fontSize="11">/ 100점</text>
    </svg>
  );
};

export const DiagnosisResultSummary: React.FC<DiagnosisResultSummaryProps> = ({
  memberName,
  overallScore,
  grade,
  summary,
  factors,
  golferProfile,
  createdAt,
}) => {
  const cfg = GRADE_CONFIG[grade] ?? GRADE_CONFIG.D;

  return (
    <section
      className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-slate-900 via-slate-800/80 to-slate-900 p-6"
      data-testid="diagnosis-result-summary"
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        {/* Left */}
        <div className="flex-1 space-y-4 min-w-0">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-500">정밀진단 리포트</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-100">{memberName}</h2>
            {createdAt && (
              <p className="mt-0.5 text-xs text-slate-500">
                {new Date(createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            )}
          </div>

          {/* Profile badges */}
          {golferProfile && (
            <div className="flex flex-wrap gap-1.5">
              {golferProfile.handicap !== null && (
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">
                  핸디캡 {golferProfile.handicap}
                </span>
              )}
              {golferProfile.age !== null && (
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">
                  {golferProfile.age}세
                </span>
              )}
              {golferProfile.yearsOfExperience !== null && (
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">
                  구력 {golferProfile.yearsOfExperience}년
                </span>
              )}
              {golferProfile.averageScore !== null && (
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">
                  평균 {golferProfile.averageScore}타
                </span>
              )}
              {golferProfile.dominantHand && (
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">
                  {golferProfile.dominantHand === 'right' ? '우타' : '좌타'}
                </span>
              )}
            </div>
          )}

          <p className="text-sm leading-relaxed text-slate-300">{summary}</p>

          {/* Mini factor bars */}
          <div className="space-y-2">
            {factors.map((factor) => {
              const fb = FACTOR_BAR[factor.key as keyof typeof FACTOR_BAR];
              return (
                <div key={factor.key} className="flex items-center gap-2">
                  <span className="w-7 shrink-0 text-xs text-slate-500">{fb?.short ?? factor.key}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-700/80">
                    <div
                      className={`h-1.5 rounded-full transition-all ${fb?.bar ?? 'bg-violet-500'}`}
                      style={{ width: `${factor.score}%` }}
                    />
                  </div>
                  <span className={`w-7 text-right text-xs font-semibold ${fb?.text ?? 'text-violet-300'}`}>
                    {factor.score}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: ring + grade */}
        <div className="flex shrink-0 flex-col items-center gap-2">
          <ScoreRing score={overallScore} grade={grade} />
          <span className={`rounded-xl border px-4 py-1 text-sm font-bold ${cfg.badgeCls} ${cfg.textCls}`}>
            등급 {grade}
          </span>
        </div>
      </div>
    </section>
  );
};
