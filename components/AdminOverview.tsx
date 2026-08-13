import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  Award,
  FileText,
  Building2,
  CreditCard,
  Activity,
  Sparkles,
  ArrowRight,
  Cloud,
  HardDrive,
} from 'lucide-react';
import type { ClientProfile, CoachProfile, Lesson, Branch } from '../types';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';

/**
 * 7d · 관리자 웹 콘솔 개요
 *
 * The redesign asks admins to land on a numbers-first overview instead
 * of the 12-tab wall. This screen turns the existing data (already
 * loaded by the parent AdminDashboard) into a scan-once summary and
 * a grid of jump-to-tab cards. Every card is a keyboard-focusable
 * button so the admin never has to hunt for the right tab.
 *
 * The overview is read-only. Edits stay in each area's dedicated tab.
 */

export type AdminJumpTarget =
  | 'CLIENTS'
  | 'COACH_ACTIVITY'
  | 'LESSONS'
  | 'BRANCHES'
  | 'BRANCH_STAFF'
  | 'AI_OBSERVABILITY'
  | 'AI_PROMPTS'
  | 'MESSAGES'
  | 'SYSTEM';

export interface AdminOverviewProps {
  clients: ClientProfile[];
  coaches: CoachProfile[];
  lessons: Lesson[];
  isFbConnected: boolean;
  onJump: (target: AdminJumpTarget) => void;
}

const fmt = (n: number) => n.toLocaleString('ko-KR');

const ratio = (num: number, den: number): string => {
  if (den <= 0) return '0%';
  return `${Math.round((num / den) * 100)}%`;
};

export const AdminOverview: React.FC<AdminOverviewProps> = ({
  clients,
  coaches,
  lessons,
  isFbConnected,
  onJump,
}) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBranchesLoading(true);
    const load = firebaseService.isInitialized()
      ? firebaseService.getBranches()
      : Promise.resolve(storageService.getBranches());
    load
      .then((rows) => {
        if (!cancelled) setBranches(rows);
      })
      .catch((e) => {
        console.warn('[AdminOverview] branches load failed', e);
      })
      .finally(() => {
        if (!cancelled) setBranchesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const paidClients = clients.filter(
      (c) => c.isSubscribed || c.subscriptionPlan === 'PRO'
    ).length;
    const paidCoaches = coaches.filter(
      (c) => c.isSubscribed || c.subscriptionPlan === 'PRO'
    ).length;

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const recentLessons = lessons.filter((l) => {
      const ts =
        typeof l.date === 'string'
          ? new Date(l.date).getTime()
          : (l.date as unknown as number);
      return typeof ts === 'number' && !Number.isNaN(ts) && ts >= thirtyDaysAgo;
    });

    const activeCoachIds = new Set(
      recentLessons.map((l) => l.coachId).filter(Boolean)
    );
    const approvedRecent = recentLessons.filter(
      (l) => l.approvalStatus === 'approved'
    ).length;

    const assignedClients = clients.filter(
      (c) => !!c.designatedCoach || !!c.coachId
    ).length;

    return {
      totalClients: clients.length,
      totalCoaches: coaches.length,
      totalLessons: lessons.length,
      recentLessonCount: recentLessons.length,
      approvedRecent,
      activeCoachCount: activeCoachIds.size,
      paidClients,
      paidCoaches,
      assignedClients,
    };
  }, [clients, coaches, lessons]);

  return (
    <div className="space-y-6">
      {/* Top KPI strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Users}
          label="일반 회원"
          primary={fmt(stats.totalClients)}
          secondary={`담당 코치 배정 ${ratio(stats.assignedClients, stats.totalClients)}`}
          accent="slate"
        />
        <KpiCard
          icon={Award}
          label="코치"
          primary={fmt(stats.totalCoaches)}
          secondary={`최근 30일 활동 ${fmt(stats.activeCoachCount)}명`}
          accent="emerald"
        />
        <KpiCard
          icon={FileText}
          label="최근 30일 레슨"
          primary={fmt(stats.recentLessonCount)}
          secondary={`승인 완료 ${ratio(stats.approvedRecent, stats.recentLessonCount)}`}
          accent="sky"
        />
        <KpiCard
          icon={Building2}
          label="지점"
          primary={branchesLoading ? '…' : fmt(branches.length)}
          secondary={
            branchesLoading
              ? '불러오는 중'
              : branches.length === 0
              ? '등록된 지점 없음'
              : `활성 지점 · 아래 카드에서 편집`
          }
          accent="amber"
        />
      </section>

      {/* Subscription snapshot */}
      <section className="rounded-2xl border border-line-subtle bg-white/[0.04] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-ink-high flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-600" /> 구독 현황
          </h3>
          <span className="text-xs text-ink-muted">
            숫자만 확인 · 개별 조정은 각 관리 화면에서
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SubscriptionRow
            label="일반 회원 유료 전환"
            paid={stats.paidClients}
            total={stats.totalClients}
          />
          <SubscriptionRow
            label="코치 유료 전환"
            paid={stats.paidCoaches}
            total={stats.totalCoaches}
          />
        </div>
      </section>

      {/* Jump grid */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-ink-high">빠른 진입</h3>
          <span className="text-xs text-ink-muted">
            {isFbConnected ? (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <Cloud className="w-3 h-3" /> Firebase 연결됨
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-ink-muted">
                <HardDrive className="w-3 h-3" /> 로컬 저장소 모드
              </span>
            )}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <JumpCard
            icon={Users}
            title="회원 · 코치 관리"
            body="가입자 · 담당 코치 배정 · 구독 전환"
            onClick={() => onJump('CLIENTS')}
          />
          <JumpCard
            icon={Activity}
            title="코치 활동"
            body="레슨 승인률 · AI 사용률 · 근거 인용"
            onClick={() => onJump('COACH_ACTIVITY')}
            accent="emerald"
          />
          <JumpCard
            icon={FileText}
            title="레슨 관리"
            body="원본 · 요약 · 승인 상태 확인"
            onClick={() => onJump('LESSONS')}
          />
          <JumpCard
            icon={Building2}
            title="지점 관리"
            body="지점 · 운영시간 · 요금 · 스태프"
            onClick={() => onJump('BRANCHES')}
          />
          <JumpCard
            icon={Sparkles}
            title="AI 프롬프트"
            body="시스템 프롬프트 · 롤아웃 · 백업"
            onClick={() => onJump('AI_PROMPTS')}
            accent="emerald"
          />
          <JumpCard
            icon={Activity}
            title="AI 관측성"
            body="호출 로그 · 근거 개수 · 신뢰도 분포"
            onClick={() => onJump('AI_OBSERVABILITY')}
            accent="emerald"
          />
        </div>
      </section>
    </div>
  );
};

// ─── subcomponents ───────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  primary: string;
  secondary: string;
  accent: 'slate' | 'emerald' | 'sky' | 'amber';
}

const ACCENT_TINT: Record<KpiCardProps['accent'], string> = {
  slate: 'bg-white/[0.06] text-ink-medium',
  emerald: 'bg-emerald-100 text-emerald-600',
  sky: 'bg-sky-100 text-sky-600',
  amber: 'bg-amber-100 text-amber-600',
};

const KpiCard: React.FC<KpiCardProps> = ({
  icon: Icon,
  label,
  primary,
  secondary,
  accent,
}) => (
  <div className="rounded-2xl border border-line-subtle bg-white/[0.04] p-4 flex items-center gap-3">
    <div
      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${ACCENT_TINT[accent]}`}
    >
      <Icon className="w-5 h-5" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-[11px] font-medium text-ink-muted truncate">
        {label}
      </div>
      <div className="text-xl font-bold text-ink-high leading-tight">
        {primary}
      </div>
      <div className="text-[11px] text-ink-muted truncate">{secondary}</div>
    </div>
  </div>
);

interface SubscriptionRowProps {
  label: string;
  paid: number;
  total: number;
}

const SubscriptionRow: React.FC<SubscriptionRowProps> = ({
  label,
  paid,
  total,
}) => {
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-line-subtle bg-white/[0.03] p-3">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-medium text-ink-medium">{label}</span>
        <span className="text-ink-muted">
          {fmt(paid)} / {fmt(total)} · {pct}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.10] overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

interface JumpCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  onClick: () => void;
  accent?: 'emerald';
}

const JumpCard: React.FC<JumpCardProps> = ({
  icon: Icon,
  title,
  body,
  onClick,
  accent,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-left rounded-2xl border p-4 transition-all group hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-400 ${
      accent === 'emerald'
        ? 'border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50'
        : 'border-line-subtle bg-white/[0.04] hover:bg-white/[0.03]'
    }`}
  >
    <div className="flex items-start gap-3">
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
          accent === 'emerald'
            ? 'bg-emerald-100 text-emerald-600'
            : 'bg-white/[0.06] text-ink-medium'
        }`}
      >
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h4 className="text-sm font-bold text-ink-high">{title}</h4>
          <ArrowRight className="w-3.5 h-3.5 text-ink-muted group-hover:translate-x-0.5 transition-transform" />
        </div>
        <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">{body}</p>
      </div>
    </div>
  </button>
);
