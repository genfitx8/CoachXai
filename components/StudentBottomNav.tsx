import React from 'react';
import { MessageSquare, Calendar, ClipboardList } from 'lucide-react';
import { useLanguage } from './LanguageContext';

export type StudentTab = 'HOME' | 'RESERVATION' | 'GROWTH';

interface StudentBottomNavProps {
  activeTab: StudentTab;
  onTabChange: (tab: StudentTab) => void;
  /** When set, badges appear over the tab. */
  reservationBadge?: number;
  growthBadge?: number;
}

// Both HOME and GROWTH keep their enum names for API compatibility while the
// surfaced labels have moved on: home is "대화" (the AI thread, not a
// dashboard) and growth is "기록" — the one place a student's records live.
//
// The separate record-composer tab is gone. Students now file records by
// attaching the file in chat, and the growth tab absorbed the "기록" name, so
// keeping a fourth tab meant two different things called 기록 side by side.
// Writing a record by hand still exists, one tap into the 기록 tab.
const labelFor = (tab: StudentTab, lang: 'ko' | 'en' | 'ja'): string => {
  const table: Record<StudentTab, Record<'ko' | 'en' | 'ja', string>> = {
    HOME: { ko: '대화', en: 'Chat', ja: 'チャット' },
    RESERVATION: { ko: '예약', en: 'Book', ja: '予約' },
    GROWTH: { ko: '기록', en: 'Records', ja: '記録' },
  };
  return table[tab][lang];
};

const iconFor = (tab: StudentTab) => {
  switch (tab) {
    case 'HOME':
      return MessageSquare;
    case 'RESERVATION':
      return Calendar;
    case 'GROWTH':
      return ClipboardList;
  }
};

export const StudentBottomNav: React.FC<StudentBottomNavProps> = ({
  activeTab,
  onTabChange,
  reservationBadge,
  growthBadge,
}) => {
  const { language } = useLanguage();
  const lang = (language as 'ko' | 'en' | 'ja') ?? 'ko';

  const renderTabButton = (key: StudentTab, badge?: number) => {
    const Icon = iconFor(key);
    const isActive = key === activeTab;
    return (
      <button
        key={key}
        type="button"
        onClick={() => onTabChange(key)}
        aria-current={isActive ? 'page' : undefined}
        className={`relative flex flex-col items-center justify-center gap-1 py-3 transition-colors ${
          isActive
            ? 'text-emerald-300'
            : 'text-ink-muted hover:text-ink-medium'
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
        <span className="text-[11px] font-semibold">{labelFor(key, lang)}</span>
        {isActive && (
          <span
            className="absolute top-0 inset-x-8 h-0.5 bg-emerald-500 rounded-full"
            aria-hidden
          />
        )}
      </button>
    );
  };

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-base border-t border-line-subtle backdrop-blur-xl pb-safe"
      role="navigation"
      aria-label="Student navigation"
    >
      {/* Pinned to --student-nav-row-height rather than left to add up from
          the icon + label + py-3 stack. Everything above the nav reserves
          --student-nav-height (this row plus the border-t above); if the
          row's real height drifts from the token (a font swap, one more line
          of label) the reservation silently stops matching and content slides
          back under the bar. */}
      <div
        className="max-w-md mx-auto grid grid-cols-3 h-[var(--student-nav-row-height)]"
      >
        {renderTabButton('HOME')}
        {renderTabButton('RESERVATION', reservationBadge)}
        {renderTabButton('GROWTH', growthBadge)}
      </div>
    </nav>
  );
};
