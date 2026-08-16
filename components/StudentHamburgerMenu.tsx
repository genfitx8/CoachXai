import React, { useEffect } from 'react';
import {
  X, User, ClipboardList, Target, Crown, Briefcase,
  Globe, Sparkles, Video, LogOut, ChevronRight, ScanLine, ShieldCheck,
} from 'lucide-react';
import { ClientProfile } from '../types';
import { useLanguage } from './LanguageContext';

export type HamburgerAction =
  | 'PROFILE'
  | 'GOLF_PASSPORT'
  | 'MY_BAY_RESERVATIONS'
  | 'POINT_PURCHASE'
  | 'MEMBERSHIP_PURCHASE'
  | 'SWING_ANALYSIS'
  | 'AI_TONE'
  | 'LANGUAGE'
  | 'LOGOUT';

interface StudentHamburgerMenuProps {
  open: boolean;
  onClose: () => void;
  clientProfile: ClientProfile;
  onAction: (action: HamburgerAction) => void;
  hideMembership?: boolean;
  hideReservation?: boolean;
}

const labels = {
  ko: {
    profile: '내 정보',
    passport: '골프 여권',
    myBay: '내 예약 내역',
    point: '포인트',
    membership: '멤버십',
    swing: '스윙 영상 분석',
    tone: 'AI 톤 설정',
    language: '언어',
    logout: '로그아웃',
    account: '계정',
    services: '서비스',
    settings: '설정',
  },
  en: {
    profile: 'My profile',
    passport: 'Golf passport',
    myBay: 'My reservations',
    point: 'Points',
    membership: 'Membership',
    swing: 'Swing video analysis',
    tone: 'AI tone',
    language: 'Language',
    logout: 'Log out',
    account: 'Account',
    services: 'Services',
    settings: 'Settings',
  },
  ja: {
    profile: 'マイページ',
    passport: 'ゴルフパスポート',
    myBay: '予約履歴',
    point: 'ポイント',
    membership: 'メンバーシップ',
    swing: 'スイング動画分析',
    tone: 'AIトーン設定',
    language: '言語',
    logout: 'ログアウト',
    account: 'アカウント',
    services: 'サービス',
    settings: '設定',
  },
} as const;

export const StudentHamburgerMenu: React.FC<StudentHamburgerMenuProps> = ({
  open,
  onClose,
  clientProfile,
  onAction,
  hideMembership,
  hideReservation,
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

  const handle = (action: HamburgerAction) => {
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

      {/* Drawer — safe-area padding keeps the profile row clear of the notch
          and the logout button clear of the home indicator / gesture bar. */}
      <aside className="absolute left-0 top-0 h-full w-[86%] max-w-sm bg-base border-r border-line-subtle shadow-2xl flex flex-col animate-slide-in-left pt-safe pb-safe pl-safe">
        {/* Header */}
        <div className="px-5 py-5 border-b border-line-subtle flex items-center gap-3">
          <div className="bg-gradient-to-br from-emerald-500/30 to-emerald-500/20 p-2.5 rounded-full text-emerald-100 border border-emerald-300/20">
            <User className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink-high truncate">{clientProfile.name}</p>
            <p className="text-xs text-ink-muted truncate">
              {clientProfile.designatedCoach ? `Coach · ${clientProfile.designatedCoach}` : clientProfile.phone}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-ink-muted hover:text-ink-high rounded-lg hover:bg-white/[0.08] transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sections */}
        <nav className="flex-1 overflow-y-auto py-4">
          <Section title={L.account}>
            <Row icon={User} label={L.profile} onClick={() => handle('PROFILE')} />
            <Row
              icon={ShieldCheck}
              label={L.passport}
              onClick={() => handle('GOLF_PASSPORT')}
              accent="emerald"
            />
            {!hideReservation && (
              <Row icon={ClipboardList} label={L.myBay} onClick={() => handle('MY_BAY_RESERVATIONS')} />
            )}
            <Row icon={Target} label={L.point} onClick={() => handle('POINT_PURCHASE')} accent="cyan" />
            {!hideMembership && (
              <Row icon={Crown} label={L.membership} onClick={() => handle('MEMBERSHIP_PURCHASE')} accent="amber" />
            )}
          </Section>

          <Section title={L.services}>
            <Row icon={Video} label={L.swing} onClick={() => handle('SWING_ANALYSIS')} accent="emerald" />
          </Section>

          <Section title={L.settings}>
            <Row icon={Sparkles} label={L.tone} onClick={() => handle('AI_TONE')} accent="indigo" />
            <Row icon={Globe} label={L.language} onClick={() => handle('LANGUAGE')} />
          </Section>
        </nav>

        {/* Footer */}
        <div className="border-t border-line-subtle px-3 py-3">
          <button
            onClick={() => handle('LOGOUT')}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-ink-medium hover:text-red-300 hover:bg-red-500/10 transition-colors"
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
    <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-ink-muted mt-3 mb-1.5">
      {title}
    </p>
    <div className="space-y-0.5">{children}</div>
  </div>
);

type Accent = 'indigo' | 'cyan' | 'amber' | 'emerald';

const accentToClasses: Record<Accent, { icon: string; bg: string }> = {
  indigo: { icon: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-300/20' },
  cyan: { icon: 'text-cyan-300', bg: 'bg-cyan-400/10 border-cyan-300/20' },
  amber: { icon: 'text-amber-300', bg: 'bg-amber-400/10 border-amber-300/20' },
  emerald: { icon: 'text-emerald-300', bg: 'bg-emerald-400/10 border-emerald-300/20' },
};

const Row: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  accent?: Accent;
}> = ({ icon: Icon, label, onClick, accent }) => {
  const tones = accent ? accentToClasses[accent] : { icon: 'text-ink-medium', bg: 'bg-white/5 border-line-subtle' };
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors group"
    >
      <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${tones.bg}`}>
        <Icon className={`w-4 h-4 ${tones.icon}`} />
      </div>
      <span className="flex-1 text-left text-sm font-semibold text-ink-high">{label}</span>
      <ChevronRight className="w-4 h-4 text-ink-muted group-hover:text-ink-medium transition-colors" />
    </button>
  );
};
