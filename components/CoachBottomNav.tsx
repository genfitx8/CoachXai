import React from 'react';
import { MessageSquare, Users, Calendar, Plus } from 'lucide-react';
import { useLanguage } from './LanguageContext';

export type CoachTab = 'LESSON' | 'CLIENTS' | 'RESERVATIONS';

interface CoachBottomNavProps {
  activeTab: CoachTab;
  onTabChange: (tab: CoachTab) => void;
  /**
   * Raised center "+" CTA opens the new-lesson record flow, mirroring the
   * student app's record button. Omit to hide the button entirely.
   */
  onNewRecord?: () => void;
  /** Badge over the reservations tab (e.g. unread notification count). */
  reservationBadge?: number;
  /** Badge over the clients tab. */
  clientsBadge?: number;
}

// LESSON keeps its enum name for API compatibility, but the surfaced label
// is now "대화" — the redesign folds the old lesson list into the coach's
// agent conversation.
const labelFor = (tab: CoachTab, lang: 'ko' | 'en' | 'ja'): string => {
  const table: Record<CoachTab, Record<'ko' | 'en' | 'ja', string>> = {
    LESSON: { ko: '대화', en: 'Chat', ja: 'チャット' },
    CLIENTS: { ko: '학생', en: 'Students', ja: '生徒' },
    RESERVATIONS: { ko: '예약', en: 'Bookings', ja: '予約' },
  };
  return table[tab][lang];
};

const recordLabelFor = (lang: 'ko' | 'en' | 'ja'): string => {
  if (lang === 'en') return 'Record';
  if (lang === 'ja') return '記録';
  return '기록';
};

const iconFor = (tab: CoachTab) => {
  switch (tab) {
    case 'LESSON':
      return MessageSquare;
    case 'CLIENTS':
      return Users;
    case 'RESERVATIONS':
      return Calendar;
  }
};

export const CoachBottomNav: React.FC<CoachBottomNavProps> = ({
  activeTab,
  onTabChange,
  onNewRecord,
  reservationBadge,
  clientsBadge,
}) => {
  const { language } = useLanguage();
  const lang = (language as 'ko' | 'en' | 'ja') ?? 'ko';

  const renderTabButton = (key: CoachTab, badge?: number) => {
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
            className="absolute top-0 inset-x-8 h-0.5 bg-gradient-to-r from-emerald-500 to-emerald-500 rounded-full"
            aria-hidden
          />
        )}
      </button>
    );
  };

  // Raised center CTA — mirrors StudentBottomNav so both roles share the
  // "primary action floats above the tabs" pattern. Only rendered when a
  // handler is supplied.
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
      aria-label="Coach navigation"
    >
      <div className="relative max-w-md mx-auto">
        {renderRecordButton()}
        <div className="grid grid-cols-3">
          {renderTabButton('LESSON')}
          {renderTabButton('CLIENTS', clientsBadge)}
          {renderTabButton('RESERVATIONS', reservationBadge)}
        </div>
      </div>
    </nav>
  );
};
