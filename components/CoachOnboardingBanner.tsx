import React from 'react';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import type { ClientProfile, CoachProfile, Lesson } from '../types';

/**
 * 6c · 6e Coach onboarding banner.
 *
 * Renders above the CoachAIHome briefing while the coach is still in
 * their first-week state — anything that hasn't been done yet. Once
 * every item is complete the banner unmounts, so the veteran coach
 * doesn't keep seeing a done-list.
 *
 * The redesign picks "학생 3명 초대" as the activation success
 * condition (6e): without students the app has nothing to brief on,
 * and the first-day emphasis (6c) is a specialised version of the
 * same checklist where item #1 is bumped to a hero CTA.
 *
 * Every item is derived from data the coach already has — no new
 * onboarding_state schema. That means a coach who did any of these
 * before this feature landed sees them auto-checked without a
 * migration.
 */

export interface CoachOnboardingBannerProps {
  coachProfile: CoachProfile;
  clients: ClientProfile[];
  lessons: Lesson[];
  onInviteStudents: () => void;
  onRecordFirstLesson: () => void;
  onOpenProfile: () => void;
  onOpenSchedule?: () => void;
  /** Dismiss the banner even when items remain — coach's choice. */
  onDismiss?: () => void;
}

interface ChecklistItem {
  key: 'invite' | 'record' | 'approve' | 'profile' | 'schedule';
  label: string;
  hint: string;
  done: boolean;
  isHero: boolean;
  action?: () => void;
}

export const CoachOnboardingBanner: React.FC<CoachOnboardingBannerProps> = ({
  coachProfile,
  clients,
  lessons,
  onInviteStudents,
  onRecordFirstLesson,
  onOpenProfile,
  onOpenSchedule,
  onDismiss,
}) => {
  const myClients = clients.filter((c) => c.coachId === coachProfile.id);
  const activationDone = myClients.length >= 3;
  const isFirstDay = myClients.length === 0;

  const items: ChecklistItem[] = [
    {
      key: 'invite',
      label: '학생 3명 초대',
      hint:
        myClients.length === 0
          ? '아직 학생이 없습니다. 초대 링크로 첫 학생을 추가해 주세요.'
          : `${myClients.length} / 3명 초대됨`,
      done: activationDone,
      isHero: true,
      action: onInviteStudents,
    },
    {
      key: 'record',
      label: '첫 레슨 기록하기',
      hint: '한 번만 해두면 이후 AI가 자동으로 초안을 잡습니다',
      done: lessons.length > 0,
      isHero: false,
      action: onRecordFirstLesson,
    },
    {
      key: 'approve',
      label: '첫 리뷰 승인해 학생에게 전달',
      hint: '검토 → 승인 → 학생 앱에 카드로 도착',
      done: lessons.some((l) => l.approvalStatus === 'approved'),
      isHero: false,
    },
    {
      key: 'profile',
      label: '프로필 확인',
      hint: '연락처 · 소개가 학생 초대 화면에 노출됩니다',
      done: Boolean(coachProfile.phone),
      isHero: false,
      action: onOpenProfile,
    },
    {
      key: 'schedule',
      label: '운영 시간 설정',
      hint: '주간 예약 가능 시간을 잡아두세요',
      done: Boolean(coachProfile.workingSchedule),
      isHero: false,
      action: onOpenSchedule,
    },
  ];

  const remaining = items.filter((i) => !i.done);
  if (remaining.length === 0) return null;

  const doneCount = items.length - remaining.length;
  const heroItem = isFirstDay ? items[0] : null;

  return (
    <div className="relative z-10 mx-4 mt-3 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.08] via-emerald-500/[0.04] to-transparent p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-emerald-300" />
        <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-200">
          {isFirstDay ? '첫날 · 시작하기' : '첫 주 체크리스트'}
        </span>
        <span className="ml-auto text-[11px] font-mono text-emerald-200/70">
          {doneCount} / {items.length}
        </span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="ml-2 text-[11px] font-bold text-ink-muted hover:text-ink-medium"
          >
            나중에
          </button>
        )}
      </div>

      {heroItem ? (
        <HeroItem item={heroItem} />
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <ChecklistRow key={it.key} item={it} />
          ))}
        </ul>
      )}

      {isFirstDay && (
        <p className="mt-3 text-[11px] text-emerald-100/80 leading-relaxed">
          첫 학생을 초대하면 오늘 브리핑에 그 학생 카드가 자동으로 도착합니다.
          기존 노트를 옮길 필요 없이 이름만 있어도 시작할 수 있어요.
        </p>
      )}
    </div>
  );
};

const HeroItem: React.FC<{ item: ChecklistItem }> = ({ item }) => (
  <div className="rounded-xl bg-white/[0.03] border border-emerald-500/20 px-4 py-3">
    <div className="text-[15px] font-bold text-ink-high leading-tight">
      {item.label}
    </div>
    <div className="text-[12px] text-ink-medium mt-1 leading-relaxed">
      {item.hint}
    </div>
    {item.action && (
      <button
        type="button"
        onClick={item.action}
        className="mt-3 w-full h-11 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-[#04150e] text-[14px] font-bold flex items-center justify-center gap-1.5 transition-colors"
      >
        지금 초대하기 <ArrowRight className="w-4 h-4" />
      </button>
    )}
  </div>
);

const ChecklistRow: React.FC<{ item: ChecklistItem }> = ({ item }) => {
  const clickable = !!item.action && !item.done;
  const Row = (
    <div
      className={`flex items-start gap-2.5 py-1.5 ${
        clickable ? 'hover:bg-white/[0.03] rounded-lg -mx-1 px-1' : ''
      }`}
    >
      <div
        className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
          item.done
            ? 'bg-emerald-500 text-[#04150e]'
            : 'border border-line-default'
        }`}
      >
        {item.done && <Check className="w-3 h-3" strokeWidth={3} />}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`text-[13.5px] font-bold leading-tight ${
            item.done ? 'text-ink-faint line-through' : 'text-ink-high'
          }`}
        >
          {item.label}
          {item.isHero && !item.done && (
            <span className="ml-1.5 text-[10px] font-mono uppercase tracking-wider text-emerald-300">
              activation
            </span>
          )}
        </div>
        {!item.done && (
          <div className="text-[11.5px] text-ink-muted mt-0.5 leading-relaxed">
            {item.hint}
          </div>
        )}
      </div>
      {clickable && (
        <ArrowRight className="w-3.5 h-3.5 text-ink-muted flex-shrink-0 mt-1" />
      )}
    </div>
  );

  return clickable ? (
    <li>
      <button type="button" onClick={item.action} className="w-full text-left">
        {Row}
      </button>
    </li>
  ) : (
    <li>{Row}</li>
  );
};
