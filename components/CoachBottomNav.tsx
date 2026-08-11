import React from 'react';
import { BookOpen, Users, Calendar, Plus } from 'lucide-react';
import { useLanguage } from './LanguageContext';

export type CoachTab = 'LESSON' | 'CLIENTS' | 'RESERVATIONS';

interface CoachBottomNavProps {
  activeTab: CoachTab;
  onTabChange: (tab: CoachTab) => void;
  /** Badge over the reservations tab (e.g. unread notification count). */
  reservationBadge?: number;
  /** Badge over the clients tab. */
  clientsBadge?: number;
  /**
   * Optional primary action shown as a raised center button between clients
   * and reservations. Firing it does NOT change the active tab — it opens the
   * caller's own overlay (e.g. new-lesson form).
   */
  onNewRecord?: () => void;
}

const labelFor = (tab: CoachTab, lang: 'ko' | 'en' | 'ja'): string => {
  const table: Record<CoachTab, Record<'ko' | 'en' | 'ja', string>> = {
    LESSON: { ko: '레슨', en: 'Lessons', ja: 'レッスン' },
    CLIENTS: { ko: '학생', en: 'Students', ja: '生徒' },
    RESERVATIONS: { ko: '예약', en: 'Bookings', ja: '予約' },
  };
  return table[tab][lang];
};

const iconFor = (tab: CoachTab) => {
  switch (tab) {
    case 'LESSON':
      return BookOpen;
    case 'CLIENTS':
      return Users;
    case 'RESERVATIONS':
      return Calendar;
  }
};

const recordLabelFor = (lang: 'ko' | 'en' | 'ja'): string => {
  return lang === 'en' ? 'Record' : lang === 'ja' ? '記録' : '기록';
};

export const CoachBottomNav: React.FC<CoachBottomNavProps> = ({
  activeTab,
  onTabChange,
  reservationBadge,
  clientsBadge,
  onNewRecord,
}) => {
  const { language } = useLanguage();
  const lang = (language as 'ko' | 'en' | 'ja') ?? 'ko';

  const showRecord = typeof onNewRecord === 'function';

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
            ? 'text-indigo-300'
            : 'text-slate-400 hover:text-slate-200'
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
            className="absolute top-0 inset-x-8 h-0.5 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
            aria-hidden
          />
        )}
      </button>
    );
  };

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-[#0A0F1A]/95 border-t border-slate-800 backdrop-blur-xl pb-safe"
      role="navigation"
      aria-label="Coach navigation"
    >
      <div
        className={`max-w-md mx-auto grid ${showRecord ? 'grid-cols-4' : 'grid-cols-3'}`}
      >
        {renderTabButton('LESSON')}
        {renderTabButton('CLIENTS', clientsBadge)}

        {showRecord && (
          <div className="relative flex items-start justify-center">
            <button
              type="button"
              onClick={onNewRecord}
              aria-label={recordLabelFor(lang)}
              className="group -mt-6 flex flex-col items-center gap-1 focus:outline-none"
            >
              <span className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-violet-500 shadow-lg shadow-indigo-950/50 border-4 border-[#0A0F1A] flex items-center justify-center transition-transform group-hover:scale-105 group-active:scale-95">
                <Plus className="w-6 h-6 text-white group-hover:rotate-90 transition-transform duration-300" />
              </span>
              <span className="text-[11px] font-semibold text-indigo-200">
                {recordLabelFor(lang)}
              </span>
            </button>
          </div>
        )}

        {renderTabButton('RESERVATIONS', reservationBadge)}
      </div>
    </nav>
  );
};
