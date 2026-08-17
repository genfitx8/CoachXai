import React from 'react';
import { MessageSquare, Calendar, TrendingUp, ClipboardList } from 'lucide-react';
import { useLanguage } from './LanguageContext';

export type StudentTab = 'HOME' | 'RESERVATION' | 'GROWTH';

interface StudentBottomNavProps {
  activeTab: StudentTab;
  onTabChange: (tab: StudentTab) => void;
  /**
   * Tapping the "기록" tab opens the new-lesson record form. Kept as an
   * action (not a StudentTab) because records live as a full-screen
   * sub-view over whichever tab the student was on. Omit to hide the
   * tab entirely (e.g. when the caller has no save handler wired up).
   */
  onNewRecord?: () => void;
  /** When set, badges appear over the tab. */
  reservationBadge?: number;
  growthBadge?: number;
}

// HOME keeps its enum name for API compatibility, but the surfaced label is
// now "대화" — student home is the coach's messages, not a dashboard.
const labelFor = (tab: StudentTab, lang: 'ko' | 'en' | 'ja'): string => {
  const table: Record<StudentTab, Record<'ko' | 'en' | 'ja', string>> = {
    HOME: { ko: '대화', en: 'Chat', ja: 'チャット' },
    RESERVATION: { ko: '예약', en: 'Book', ja: '予約' },
    GROWTH: { ko: '성장', en: 'Growth', ja: '成長' },
  };
  return table[tab][lang];
};

const recordLabelFor = (lang: 'ko' | 'en' | 'ja'): string => {
  if (lang === 'en') return 'Record';
  if (lang === 'ja') return '記録';
  return '기록';
};

const iconFor = (tab: StudentTab) => {
  switch (tab) {
    case 'HOME':
      return MessageSquare;
    case 'RESERVATION':
      return Calendar;
    case 'GROWTH':
      return TrendingUp;
  }
};

export const StudentBottomNav: React.FC<StudentBottomNavProps> = ({
  activeTab,
  onTabChange,
  onNewRecord,
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

  // "기록" — action tab, not a StudentTab. Fires the record CTA but never
  // shows an active/current state because it opens a sub-view over the
  // current tab rather than switching tabs.
  const renderRecordTab = () => (
    <button
      type="button"
      onClick={onNewRecord}
      aria-label={recordLabelFor(lang)}
      className="relative flex flex-col items-center justify-center gap-1 py-3 text-ink-muted hover:text-ink-medium transition-colors"
    >
      <ClipboardList className="w-5 h-5" />
      <span className="text-[11px] font-semibold">{recordLabelFor(lang)}</span>
    </button>
  );

  const showRecordTab = !!onNewRecord;
  const gridColsClass = showRecordTab ? 'grid-cols-4' : 'grid-cols-3';

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
        className={`max-w-md mx-auto grid ${gridColsClass} h-[var(--student-nav-row-height)]`}
      >
        {renderTabButton('HOME')}
        {renderTabButton('RESERVATION', reservationBadge)}
        {showRecordTab && renderRecordTab()}
        {renderTabButton('GROWTH', growthBadge)}
      </div>
    </nav>
  );
};
