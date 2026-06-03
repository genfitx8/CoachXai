import React from 'react';
import { DiagnosisSession } from '../../types/diagnosis';
import { DiagnosisResultSummary } from './DiagnosisResultSummary';
import { DiagnosisRadarChart } from './DiagnosisRadarChart';
import { DiagnosisPartCard } from './DiagnosisPartCard';
import { DiagnosisRecommendationList } from './DiagnosisRecommendationList';
import { toRadarChartData, getPartTitle } from '../../utils/diagnosis';
import { DIAGNOSIS_PARTS } from '../../constants/diagnosis';

interface DiagnosisResultSectionProps {
  session: DiagnosisSession;
  onBack?: () => void;
}

export const DiagnosisResultSection: React.FC<DiagnosisResultSectionProps> = ({
  session,
  onBack,
}) => {
  const radarData = toRadarChartData(session);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back nav */}
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-slate-100 transition-colors px-3 py-2 rounded-xl hover:bg-slate-800/80 border border-transparent hover:border-slate-700"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          진단 소개로 돌아가기
        </button>
      )}

      {/* Summary header */}
      <DiagnosisResultSummary session={session} />

      {/* Radar chart */}
      <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-6">
        <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">5영역 분석</p>
        <h3 className="text-lg font-bold text-slate-50 mb-5">레이더 차트</h3>
        <div className="flex justify-center">
          <DiagnosisRadarChart data={radarData} />
        </div>
      </div>

      {/* Part cards */}
      <div>
        <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">영역별 상세</p>
        <h3 className="text-lg font-bold text-slate-50 mb-4">5영역 상세 결과</h3>
        <div className="space-y-3">
          {DIAGNOSIS_PARTS.map((part) => {
            const ps = session.partScores.find((p) => p.partType === part.type);
            if (!ps) return null;
            return <DiagnosisPartCard key={part.type} partScore={ps} />;
          })}
        </div>
      </div>

      {/* Recommendations */}
      <div>
        <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">개선 방향</p>
        <h3 className="text-lg font-bold text-slate-50 mb-4">맞춤 추천 과제</h3>
        <DiagnosisRecommendationList recommendations={session.recommendations} />
      </div>

      {/* Follow-up plan */}
      <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-6">
        <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">이후 계획</p>
        <h3 className="text-lg font-bold text-slate-50 mb-2">팔로우업 플랜</h3>
        {session.followUpPlan.coachNote && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 mb-4">
            <p className="text-xs text-emerald-300/80 font-semibold mb-1">코치 메모</p>
            <p className="text-sm text-slate-300">{session.followUpPlan.coachNote}</p>
          </div>
        )}
        <div className="space-y-3">
          {session.followUpPlan.items.map((item) => (
            <div key={item.weekOffset} className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                <span className="text-xs font-black text-emerald-400">{item.weekOffset}W</span>
              </div>
              <div className="flex-1 bg-slate-800/40 border border-slate-700/50 rounded-xl p-3">
                <h4 className="text-sm font-semibold text-slate-100 mb-0.5">{item.title}</h4>
                <p className="text-xs text-slate-400 mb-1.5">{item.description}</p>
                <div className="flex flex-wrap gap-1">
                  {item.partTypes.map((pt) => (
                    <span
                      key={pt}
                      className="px-2 py-0.5 rounded-full bg-slate-700 text-[10px] text-slate-300 border border-slate-600"
                    >
                      {getPartTitle(pt)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Assets */}
      {session.assets.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">진단 자료</p>
          <h3 className="text-lg font-bold text-slate-50 mb-4">첨부 자료</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {session.assets.map((asset) => (
              <div
                key={asset.id}
                className="bg-slate-900/70 border border-slate-800/80 rounded-xl overflow-hidden"
              >
                <img
                  src={asset.url}
                  alt={`${asset.label} - 진단 자료`}
                  className="w-full h-40 object-cover bg-slate-800"
                  loading="lazy"
                />
                <div className="px-4 py-3">
                  <p className="text-sm font-medium text-slate-200">{asset.label}</p>
                  {asset.note && (
                    <p className="text-xs text-slate-500 mt-0.5">{asset.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
