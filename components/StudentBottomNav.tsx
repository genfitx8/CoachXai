import React from 'react';
import { MessageCircle, Calendar, TrendingUp, Plus } from 'lucide-react';
import { useLanguage } from './LanguageContext';

export type StudentTab = 'HOME' | 'RESERVATION' | 'GROWTH';

interface StudentBottomNavProps {
  activeTab: StudentTab;
  onTabChange: (tab: StudentTab) => void;
  /** When set, badges appear over the tab. */
  reservationBadge?: number;
  growthBadge?: number;
  /**
   * Optional primary action shown as a raised center button between the
   * reservation and growth tabs. Firing it does NOT change the active tab —
   * it opens the caller's own overlay (e.g. new-lesson form).
   */
  onNewRecord?: () => void;
}

const labelFor = (tab: StudentTab, lang: 'ko' | 'en' | 'ja'): string => {
  const table: Record<StudentTab, Record<'ko' | 'en' | 'ja', string>> = {
    HOME: { ko: '홈', en: 'Home', ja: 'ホーム' },
    RESERVATION: { ko: '예약', en: 'Book', ja: '予約' },
    GROWTH: { ko: '성장', en: 'Growth', ja: '成長' },
  };
  return table[tab][lang];
};

const iconFor = (tab: StudentTab) => {
  switch (tab) {
    case 'HOME':
      return MessageCircle;
    case 'RESERVATION':
      return Calendar;
    case 'GROWTH':
      return TrendingUp;
  }
};

const recordLabelFor = (lang: 'ko' | 'en' | 'ja'): string => {
  return lang === 'en' ? 'Record' : lang === 'ja' ? '記録' : '기록';
};

export const StudentBottomNav: React.FC<StudentBottomNavProps> = ({
  activeTab,
  onTabChange,
  reservationBadge,
  growthBadge,
  onNewRecord,
}) => {
  const { language } = useLanguage();
  const lang = (language as 'ko' | 'en' | 'ja') ?? 'ko';

  // Layout with the record action lives in a 4-column grid so that the raised
  // primary button sits between reservation and growth. Without it we fall back
  // to a 3-column layout of the three tab switchers.
  const showRecord = typeof onNewRecord === 'function';

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
            className="absolute top-0 inset-x-8 h-0.5 bg-gradient-to-r from-emerald-500 to-emerald-500 rounded-full"
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
      aria-label="Student navigation"
    >
      <div
        className={`max-w-md mx-auto grid ${showRecord ? 'grid-cols-4' : 'grid-cols-3'}`}
      >
        {renderTabButton('HOME')}
        {renderTabButton('RESERVATION', reservationBadge)}

        {showRecord && (
          <div className="relative flex items-start justify-center">
            <button
              type="button"
              onClick={onNewRecord}
              aria-label={recordLabelFor(lang)}
              className="group -mt-6 flex flex-col items-center gap-1 focus:outline-none"
            >
              <span className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-500 shadow-lg shadow-emerald-950/50 border-4 border-[#0A0F1A] flex items-center justify-center transition-transform group-hover:scale-105 group-active:scale-95">
                <Plus className="w-6 h-6 text-white group-hover:rotate-90 transition-transform duration-300" />
              </span>
              <span className="text-[11px] font-semibold text-emerald-200">
                {recordLabelFor(lang)}
              </span>
            </button>
          </div>
        )}

        {renderTabButton('GROWTH', growthBadge)}
      </div>
    </nav>
  );
};
