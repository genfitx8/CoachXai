import React from 'react';
import { MessageSquare, Users, Calendar, PenSquare, Mic } from 'lucide-react';
import { useLanguage } from './LanguageContext';

export type CoachTab = 'LESSON' | 'CLIENTS' | 'RECORD' | 'LIVE' | 'RESERVATIONS';

interface CoachBottomNavProps {
  activeTab: CoachTab;
  onTabChange: (tab: CoachTab) => void;
  /** Badge over the reservations tab (e.g. unread notification count). */
  reservationBadge?: number;
  /** Badge over the clients tab. */
  clientsBadge?: number;
}

// LESSON keeps its enum name for API compatibility, but the surfaced label
// is now "대화" — the redesign folds the old chat list into the coach's
// agent conversation. RECORD opens the new-lesson flow; LIVE opens the
// during-lesson companion ("레슨 중 동반"), which used to be buried behind
// the lesson list's client filter. The historical lesson list ("레슨 기록")
// no longer has its own tab; it stays reachable from the hamburger menu.
const labelFor = (tab: CoachTab, lang: 'ko' | 'en' | 'ja'): string => {
  const table: Record<CoachTab, Record<'ko' | 'en' | 'ja', string>> = {
    LESSON: { ko: '대화', en: 'Chat', ja: 'チャット' },
    CLIENTS: { ko: '학생', en: 'Students', ja: '生徒' },
    RECORD: { ko: '기록', en: 'Record', ja: '記録' },
    LIVE: { ko: '동반', en: 'Live', ja: '同伴' },
    RESERVATIONS: { ko: '예약', en: 'Bookings', ja: '予約' },
  };
  return table[tab][lang];
};

const iconFor = (tab: CoachTab) => {
  switch (tab) {
    case 'LESSON':
      return MessageSquare;
    case 'CLIENTS':
      return Users;
    case 'RECORD':
      return PenSquare;
    case 'LIVE':
      return Mic;
    case 'RESERVATIONS':
      return Calendar;
  }
};

export const CoachBottomNav: React.FC<CoachBottomNavProps> = ({
  activeTab,
  onTabChange,
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

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 bg-base border-t border-line-subtle backdrop-blur-xl pb-safe"
      role="navigation"
      aria-label="Coach navigation"
    >
      <div className="max-w-md mx-auto grid grid-cols-5">
        {renderTabButton('LESSON')}
        {renderTabButton('CLIENTS', clientsBadge)}
        {renderTabButton('RECORD')}
        {renderTabButton('LIVE')}
        {renderTabButton('RESERVATIONS', reservationBadge)}
      </div>
    </nav>
  );
};
