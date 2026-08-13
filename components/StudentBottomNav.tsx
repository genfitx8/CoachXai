import React from 'react';
import { MessageSquare, Calendar, TrendingUp, Plus } from 'lucide-react';
import { useLanguage } from './LanguageContext';

export type StudentTab = 'HOME' | 'RESERVATION' | 'GROWTH';

interface StudentBottomNavProps {
  activeTab: StudentTab;
  onTabChange: (tab: StudentTab) => void;
  /**
   * Raised center "+" CTA opens the new-lesson record form. Omit to hide the
   * button entirely (e.g. when the caller has no save handler wired up).
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

  // The raised center CTA. Rendered as a floating button that overlaps the
  // top edge of the nav so it reads as the primary action, not a tab.
  const renderRecordButton = () => {
    if (!onNewRecord) return null;
    return (
      <div className="pointer-events-none absolute left-1/2 -top-6 -translate-x-1/2 flex flex-col items-center">
        <button
          type="button"
          onClick={onNewRecord}
          aria-label={recordLabelFor(lang)}
          className="pointer-events-auto w-14 h-14 rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 ring-4 ring-base flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </button>
        <span className="pointer-events-none mt-0.5 text-[10px] font-semibold text-ink-medium">
          {recordLabelFor(lang)}
        </span>
      </div>
    );
  };

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-base border-t border-line-subtle backdrop-blur-xl pb-safe"
      role="navigation"
      aria-label="Student navigation"
    >
      <div className="relative max-w-md mx-auto">
        {renderRecordButton()}
        <div className="grid grid-cols-3">
          {renderTabButton('HOME')}
          {renderTabButton('RESERVATION', reservationBadge)}
          {renderTabButton('GROWTH', growthBadge)}
        </div>
      </div>
    </nav>
  );
};
