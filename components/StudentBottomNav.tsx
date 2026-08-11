import React from 'react';
import { MessageCircle, Calendar, TrendingUp } from 'lucide-react';
import { useLanguage } from './LanguageContext';

export type StudentTab = 'HOME' | 'RESERVATION' | 'GROWTH';

interface StudentBottomNavProps {
  activeTab: StudentTab;
  onTabChange: (tab: StudentTab) => void;
  /** When set, badges appear over the tab. */
  reservationBadge?: number;
  growthBadge?: number;
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

export const StudentBottomNav: React.FC<StudentBottomNavProps> = ({
  activeTab,
  onTabChange,
  reservationBadge,
  growthBadge,
}) => {
  const { language } = useLanguage();
  const lang = (language as 'ko' | 'en' | 'ja') ?? 'ko';

  const tabs: { key: StudentTab; badge?: number }[] = [
    { key: 'HOME' },
    { key: 'RESERVATION', badge: reservationBadge },
    { key: 'GROWTH', badge: growthBadge },
  ];

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-[#0A0F1A]/95 border-t border-slate-800 backdrop-blur-xl pb-safe"
      role="navigation"
      aria-label="Student navigation"
    >
      <div className="max-w-md mx-auto grid grid-cols-3">
        {tabs.map(({ key, badge }) => {
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
        })}
      </div>
    </nav>
  );
};
