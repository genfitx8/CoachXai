import React from 'react';

const STEPS = [
  {
    number: '01',
    title: '신청 & 사전 설문',
    description: '온라인으로 신청하고 골프 이력, 목표, 현재 고민을 간략히 작성합니다.',
    icon: '📋',
  },
  {
    number: '02',
    title: '5영역 정밀 진단',
    description: 'TrackMan 분석, 스윙 영상 촬영, 신체 측정, 장비 피팅 점검을 약 2~3시간에 걸쳐 진행합니다.',
    icon: '🔍',
  },
  {
    number: '03',
    title: '데이터 분석 & 리포트',
    description: '전문 코치가 수집된 데이터를 종합 분석하여 5영역 점수와 맞춤 로드맵을 작성합니다.',
    icon: '📊',
  },
  {
    number: '04',
    title: '1:1 피드백 세션',
    description: '코치와 함께 결과를 리뷰하고 우선 개선 과제와 12주 훈련 계획을 확정합니다.',
    icon: '🎯',
  },
];

export const DiagnosisProcess: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="mb-2">
        <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">진행 과정</p>
        <h2 className="text-xl font-bold text-slate-50">진단 프로세스</h2>
      </div>

      <div className="relative">
        {/* Connector line */}
        <div className="absolute left-6 top-8 bottom-8 w-px bg-slate-700/60 hidden sm:block" />

        <div className="space-y-4">
          {STEPS.map((step) => (
            <div key={step.number} className="flex gap-4 items-start">
              <div className="relative z-10 w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xl shrink-0 shadow-md">
                {step.icon}
              </div>
              <div className="flex-1 bg-slate-900/60 border border-slate-800/70 rounded-xl p-4">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-bold text-emerald-400 font-mono">{step.number}</span>
                  <h3 className="font-semibold text-slate-100 text-sm">{step.title}</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
