import React, { useEffect } from 'react';
import {
  X, User, Sparkles, Dumbbell, BookOpen, Film,
  Target, ClipboardList, Globe, LogOut, ChevronRight,
} from 'lucide-react';
import { CoachProfile } from '../types';
import { useLanguage } from './LanguageContext';

export type CoachHamburgerAction =
  | 'PROFILE'
  | 'COACHX_ASSISTANT'
  | 'DIAGNOSIS_PROGRAM'
  | 'CURRICULUM'
  | 'LESSON_UPLOAD'
  | 'BAY_RESERVATION'
  | 'MY_BAY_RESERVATIONS'
  | 'LANGUAGE'
  | 'LOGOUT';

interface CoachHamburgerMenuProps {
  open: boolean;
  onClose: () => void;
  coachProfile: CoachProfile;
  onAction: (action: CoachHamburgerAction) => void;
  /** Show the automated video editing entry (build-flag gated in the caller). */
  showAutomatedVideoEditing?: boolean;
}

const labels = {
  ko: {
    profile: '내 프로필',
    coachxAssistant: 'CoachX AI',
    diagnosis: '정밀진단 프로그램',
    curriculum: '교육 커리큘럼',
    lessonUpload: '자동 영상 편집',
    bayReservation: '타석 예약',
    myBay: '내 타석 예약',
    language: '언어',
    logout: '로그아웃',
    ai: 'AI · 진단',
    services: '서비스',
    settings: '설정',
  },
  en: {
    profile: 'My profile',
    coachxAssistant: 'CoachX AI',
    diagnosis: 'Precision diagnosis',
    curriculum: 'Curriculum',
    lessonUpload: 'Automated video editing',
    bayReservation: 'Book a bay',
    myBay: 'My bay reservations',
    language: 'Language',
    logout: 'Log out',
    ai: 'AI · Diagnosis',
    services: 'Services',
    settings: 'Settings',
  },
  ja: {
    profile: 'マイプロフィール',
    coachxAssistant: 'CoachX AI',
    diagnosis: '精密診断プログラム',
    curriculum: 'カリキュラム管理',
    lessonUpload: '動画自動編集',
    bayReservation: '打席予約',
    myBay: '打席予約履歴',
    language: '言語',
    logout: 'ログアウト',
    ai: 'AI・診断',
    services: 'サービス',
    settings: '設定',
  },
} as const;

export const CoachHamburgerMenu: React.FC<CoachHamburgerMenuProps> = ({
  open,
  onClose,
  coachProfile,
  onAction,
  showAutomatedVideoEditing,
}) => {
  const { language } = useLanguage();
  const lang = (language as 'ko' | 'en' | 'ja') ?? 'ko';
  const L = labels[lang];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handle = (action: CoachHamburgerAction) => {
    onAction(action);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Menu">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside className="absolute left-0 top-0 h-full w-[86%] max-w-sm bg-[#0A0F1A] border-r border-slate-800 shadow-2xl flex flex-col animate-slide-in-left">
        {/* Header */}
        <div className="px-5 py-5 border-b border-slate-800 flex items-center gap-3">
          <div className="bg-gradient-to-br from-emerald-500/30 to-emerald-500/20 p-2.5 rounded-full text-emerald-100 border border-emerald-300/20">
            <User className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-100 truncate">{coachProfile.name}</p>
            <p className="text-xs text-slate-400 truncate">
              {coachProfile.email ?? coachProfile.phone ?? ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sections */}
        <nav className="flex-1 overflow-y-auto py-4">
          <Section title={L.ai}>
            <Row icon={Sparkles} label={L.coachxAssistant} onClick={() => handle('COACHX_ASSISTANT')} accent="violet" />
            <Row icon={Dumbbell} label={L.diagnosis} onClick={() => handle('DIAGNOSIS_PROGRAM')} accent="indigo" />
          </Section>

          <Section title={L.services}>
            <Row icon={BookOpen} label={L.curriculum} onClick={() => handle('CURRICULUM')} accent="amber" />
            {showAutomatedVideoEditing && (
              <Row icon={Film} label={L.lessonUpload} onClick={() => handle('LESSON_UPLOAD')} accent="violet" />
            )}
            <Row icon={Target} label={L.bayReservation} onClick={() => handle('BAY_RESERVATION')} accent="emerald" />
            <Row icon={ClipboardList} label={L.myBay} onClick={() => handle('MY_BAY_RESERVATIONS')} accent="emerald" />
          </Section>

          <Section title={L.settings}>
            <Row icon={User} label={L.profile} onClick={() => handle('PROFILE')} />
            <Row icon={Globe} label={L.language} onClick={() => handle('LANGUAGE')} />
          </Section>
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-800 px-3 py-3">
          <button
            onClick={() => handle('LOGOUT')}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-slate-300 hover:text-red-300 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-semibold">{L.logout}</span>
          </button>
        </div>
      </aside>

      <style>{`
        @keyframes drawer-slide-in-left {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-left {
          animation: drawer-slide-in-left 220ms ease-out;
        }
      `}</style>
    </div>
  );
};

// ── Internal presentational bits ────────────────────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-2 px-2">
    <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-3 mb-1.5">
      {title}
    </p>
    <div className="space-y-0.5">{children}</div>
  </div>
);

type Accent = 'indigo' | 'violet' | 'amber' | 'emerald';

const accentToClasses: Record<Accent, { icon: string; bg: string }> = {
  indigo: { icon: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-300/20' },
  violet: { icon: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-300/20' },
  amber: { icon: 'text-amber-300', bg: 'bg-amber-400/10 border-amber-300/20' },
  emerald: { icon: 'text-emerald-300', bg: 'bg-emerald-400/10 border-emerald-300/20' },
};

const Row: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  accent?: Accent;
}> = ({ icon: Icon, label, onClick, accent }) => {
  const tones = accent ? accentToClasses[accent] : { icon: 'text-slate-300', bg: 'bg-slate-800 border-slate-700' };
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-800/70 transition-colors group"
    >
      <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${tones.bg}`}>
        <Icon className={`w-4 h-4 ${tones.icon}`} />
      </div>
      <span className="flex-1 text-left text-sm font-semibold text-slate-100">{label}</span>
      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
    </button>
  );
};
