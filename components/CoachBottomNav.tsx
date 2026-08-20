import React from 'react';
import { Users, Mic } from 'lucide-react';
import { useLanguage } from './LanguageContext';
import { CoachXMark } from './ui/CoachXLogo';

// Companion-lesson-first relaunch: the coach app runs on three surfaces.
// LESSON is the agent home (브리핑 + 대화), LIVE is the during-lesson
// companion — the product's core action, rendered as the raised center
// button — and CLIENTS is the student roster/history. RECORD and
// RESERVATIONS lost their tabs: recording now originates from the agent
// home, the companion's finish flow, or the hamburger; reservation
// management is gated off entirely (see constants/featureFlags.ts).
export type CoachTab = 'LESSON' | 'CLIENTS' | 'LIVE';

interface CoachBottomNavProps {
  activeTab: CoachTab;
  onTabChange: (tab: CoachTab) => void;
  /** Badge over the clients tab. */
  clientsBadge?: number;
}

const labelFor = (tab: CoachTab, lang: 'ko' | 'en' | 'ja'): string => {
  const table: Record<CoachTab, Record<'ko' | 'en' | 'ja', string>> = {
    LESSON: { ko: '홈', en: 'Home', ja: 'ホーム' },
    LIVE: { ko: '동반 레슨', en: 'Live lesson', ja: '同伴レッスン' },
    CLIENTS: { ko: '학생', en: 'Students', ja: '生徒' },
  };
  return table[tab][lang];
};

// 홈 탭은 범용 아이콘이 아니라 코치의 AI 에이전트로 들어가는 입구라서
// 브랜드 교차 마크를 씁니다. ink 획은 currentColor 를 따라 다른 탭과 똑같이
// 활성/비활성 상태를 반영하고, 에메랄드 획은 항상 살아 있어 "여기가 AI" 라는
// 신호를 줍니다. 20px 은 마크 단독 최소 크기(24px) 아래라 stroke 가 자동으로
// 굵어지는 구간 — CoachXMark 가 알아서 보정합니다.
const CoachXTabIcon: React.FC<{ className?: string }> = ({ className }) => (
  <CoachXMark
    size={20}
    tone="mono"
    className={className}
    role={undefined}
    aria-label={undefined}
    aria-hidden
  />
);

export const CoachBottomNav: React.FC<CoachBottomNavProps> = ({
  activeTab,
  onTabChange,
  clientsBadge,
}) => {
  const { language } = useLanguage();
  const lang = (language as 'ko' | 'en' | 'ja') ?? 'ko';

  const renderSideTab = (
    key: Exclude<CoachTab, 'LIVE'>,
    Icon: React.FC<{ className?: string }>,
    badge?: number
  ) => {
    const isActive = key === activeTab;
    return (
      <button
        key={key}
        type="button"
        onClick={() => onTabChange(key)}
        aria-current={isActive ? 'page' : undefined}
        className={`relative flex flex-col items-center justify-center gap-1 py-3 transition-colors ${
          isActive ? 'text-emerald-300' : 'text-ink-muted hover:text-ink-medium'
        }`}
      >
        <div className="relative">
          <Icon className="w-5 h-5" />
          {typeof badge === 'number' && badge > 0 && (
            <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </div>
        <span className="text-[11px] font-semibold whitespace-nowrap">{labelFor(key, lang)}</span>
        {isActive && (
          <span
            className="absolute top-0 inset-x-8 h-0.5 bg-gradient-to-r from-emerald-500 to-emerald-500 rounded-full"
            aria-hidden
          />
        )}
      </button>
    );
  };

  const liveActive = activeTab === 'LIVE';

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 bg-base border-t border-line-subtle backdrop-blur-xl pb-safe"
      role="navigation"
      aria-label="Coach navigation"
    >
      {/* Pinned to --coach-nav-row-height rather than left to add up from the
          icon + label + py-3 stack. Everything above the nav reserves
          --coach-nav-height (this row plus the border-t above); if the row's
          real height drifts from the token the reservation silently stops
          matching and content slides back under the bar. */}
      <div className="max-w-md mx-auto grid grid-cols-3 h-[var(--coach-nav-row-height)]">
        {renderSideTab('LESSON', CoachXTabIcon)}

        {/* 동반 레슨 — 서비스의 중심 동작이라 가운데에서 살짝 떠 있는
            원형 버튼으로 강조한다. 버튼 자체는 행 높이 안에 그려지되
            원판이 바 위로 8px 솟아 있어 "여기서 레슨을 시작한다"는
            신호를 준다. */}
        <button
          type="button"
          onClick={() => onTabChange('LIVE')}
          aria-current={liveActive ? 'page' : undefined}
          className="relative flex flex-col items-center justify-end pb-2"
        >
          <span
            className={`absolute -top-4 flex h-12 w-12 items-center justify-center rounded-full border transition-all ${
              liveActive
                ? 'bg-emerald-500 border-emerald-300/60 text-white shadow-lg shadow-emerald-900/50 scale-105'
                : 'bg-emerald-600/90 border-emerald-400/40 text-white shadow-md shadow-emerald-900/40 hover:bg-emerald-500'
            }`}
            aria-hidden
          >
            <Mic className="w-5 h-5" />
          </span>
          <span
            className={`text-[11px] font-semibold whitespace-nowrap ${
              liveActive ? 'text-emerald-300' : 'text-ink-muted'
            }`}
          >
            {labelFor('LIVE', lang)}
          </span>
        </button>

        {renderSideTab('CLIENTS', Users, clientsBadge)}
      </div>
    </nav>
  );
};
