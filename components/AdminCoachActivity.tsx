
import React, { useMemo, useState } from 'react';
import { CoachProfile, Lesson, ClientProfile } from '../types';
import { useLanguage } from './LanguageContext';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  Calendar,
  User,
} from 'lucide-react';

interface AdminCoachActivityProps {
  coaches: CoachProfile[];
  lessons: Lesson[];
  clients: ClientProfile[];
}

type ActivityStatus = 'ACTIVE' | 'LOW' | 'INACTIVE';

interface CoachActivityData {
  coach: CoachProfile;
  totalLessons: number;
  lessonsLast7Days: number;
  lessonsLast30Days: number;
  memberCount: number;
  lastActivityDate: string | null;
  daysSinceLastLesson: number | null;
  status: ActivityStatus;
  membersWithNoRecentLesson: number;
}

const NOW = Date.now();
const MS_7D = 7 * 24 * 60 * 60 * 1000;
const MS_30D = 30 * 24 * 60 * 60 * 1000;
const MS_60D = 60 * 24 * 60 * 60 * 1000;

function computeActivityData(
  coach: CoachProfile,
  lessons: Lesson[],
  clients: ClientProfile[]
): CoachActivityData {
  const coachLessons = lessons.filter(
    (l) => l.coachId === coach.id && l.createdBy === 'COACH'
  );

  const totalLessons = coachLessons.length;
  const lessonsLast7Days = coachLessons.filter((l) => NOW - l.createdAt <= MS_7D).length;
  const lessonsLast30Days = coachLessons.filter((l) => NOW - l.createdAt <= MS_30D).length;

  const coachMembers = clients.filter(
    (c) => c.coachId === coach.id || c.designatedCoach === coach.name
  );
  const memberCount = coachMembers.length;

  // Last lesson date
  let lastActivityDate: string | null = null;
  let daysSinceLastLesson: number | null = null;
  if (coachLessons.length > 0) {
    const latest = coachLessons.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
    lastActivityDate = latest.date;
    daysSinceLastLesson = Math.floor((NOW - latest.createdAt) / (24 * 60 * 60 * 1000));
  }

  // Members who haven't had a lesson in the last 30 days
  const activeClientKeys = new Set(
    coachLessons
      .filter((l) => NOW - l.createdAt <= MS_30D)
      .map((l) => `${l.clientName}_${l.clientPhone}`)
  );
  const membersWithNoRecentLesson = coachMembers.filter(
    (c) => !activeClientKeys.has(`${c.name}_${c.phone}`)
  ).length;

  // Activity status heuristic:
  // ACTIVE: had a lesson in the last 14 days
  // LOW: last lesson between 14 and 60 days ago
  // INACTIVE: no lesson in 60+ days, or no lessons at all
  let status: ActivityStatus;
  if (daysSinceLastLesson === null || daysSinceLastLesson > 60) {
    status = 'INACTIVE';
  } else if (daysSinceLastLesson <= 14) {
    status = 'ACTIVE';
  } else {
    status = 'LOW';
  }

  return {
    coach,
    totalLessons,
    lessonsLast7Days,
    lessonsLast30Days,
    memberCount,
    lastActivityDate,
    daysSinceLastLesson,
    status,
    membersWithNoRecentLesson,
  };
}

const StatusBadge: React.FC<{ status: ActivityStatus }> = ({ status }) => {
  const { t } = useLanguage();
  if (status === 'ACTIVE') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-primary-500/15 text-primary-300">
        <CheckCircle className="w-3 h-3" />
        {t('admin_coach_activity_status_active')}
      </span>
    );
  }
  if (status === 'LOW') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300">
        <Minus className="w-3 h-3" />
        {t('admin_coach_activity_status_low')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-400">
      <AlertTriangle className="w-3 h-3" />
      {t('admin_coach_activity_status_inactive')}
    </span>
  );
};

const CoachActivityRow: React.FC<{ data: CoachActivityData }> = ({ data }) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-bg-raised rounded-xl border border-line-default shadow-sm overflow-hidden">
      {/* Main row */}
      <button
        className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-bg-base transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-primary-500/15 text-indigo-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
          {data.coach.name.charAt(0)}
        </div>

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-ink-high text-sm">{data.coach.name}</span>
            <StatusBadge status={data.status} />
            {data.membersWithNoRecentLesson > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700">
                <AlertTriangle className="w-3 h-3" />
                {t('admin_coach_activity_members_no_lesson_badge').replace('{n}', String(data.membersWithNoRecentLesson))}
              </span>
            )}
          </div>
          <p className="text-xs text-ink-muted mt-0.5">{data.coach.email}</p>
        </div>

        {/* Quick stats */}
        <div className="hidden sm:flex items-center gap-6 text-center flex-shrink-0">
          <div>
            <p className="text-[10px] text-ink-muted font-medium">
              {t('admin_coach_activity_lessons_30d')}
            </p>
            <p className="text-lg font-bold text-ink-high">{data.lessonsLast30Days}</p>
          </div>
          <div>
            <p className="text-[10px] text-ink-muted font-medium">
              {t('admin_coach_activity_member_load')}
            </p>
            <p className="text-lg font-bold text-ink-high">{data.memberCount}</p>
          </div>
          <div>
            <p className="text-[10px] text-ink-muted font-medium">
              {t('admin_coach_activity_last_active')}
            </p>
            <p className="text-sm font-bold text-ink-high">
              {data.daysSinceLastLesson === null
                ? t('admin_coach_activity_no_lessons')
                : `${data.daysSinceLastLesson}${t('admin_coach_activity_days_ago')}`}
            </p>
          </div>
        </div>

        {/* Chevron */}
        <div className="flex-shrink-0 text-ink-muted ml-2">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-line-subtle px-5 py-4 bg-bg-base animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-bg-raised rounded-lg p-3 border border-line-default">
              <p className="text-[10px] text-ink-muted font-medium mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {t('admin_coach_activity_total_lessons')}
              </p>
              <p className="text-2xl font-bold text-ink-high">{data.totalLessons}</p>
            </div>
            <div className="bg-bg-raised rounded-lg p-3 border border-line-default">
              <p className="text-[10px] text-ink-muted font-medium mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {t('admin_coach_activity_lessons_7d')}
              </p>
              <p className="text-2xl font-bold text-ink-high">{data.lessonsLast7Days}</p>
            </div>
            <div className="bg-bg-raised rounded-lg p-3 border border-line-default">
              <p className="text-[10px] text-ink-muted font-medium mb-1 flex items-center gap-1">
                <Users className="w-3 h-3" />
                {t('admin_coach_activity_member_load')}
              </p>
              <p className="text-2xl font-bold text-ink-high">{data.memberCount}</p>
            </div>
            <div className="bg-bg-raised rounded-lg p-3 border border-line-default">
              <p className="text-[10px] text-ink-muted font-medium mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {t('admin_coach_activity_last_active')}
              </p>
              <p className="text-sm font-bold text-ink-high">
                {data.lastActivityDate ?? '—'}
              </p>
              {data.daysSinceLastLesson !== null && (
                <p className="text-[10px] text-ink-muted">
                  {data.daysSinceLastLesson}
                  {t('admin_coach_activity_days_ago')}
                </p>
              )}
            </div>
          </div>

          {data.membersWithNoRecentLesson > 0 && (
            <div className="mt-3 flex items-start gap-2 p-3 bg-orange-50 rounded-lg border border-orange-100">
              <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-orange-700">
                {t('admin_coach_activity_needs_attention_detail').replace(
                  '{n}',
                  String(data.membersWithNoRecentLesson)
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const AdminCoachActivity: React.FC<AdminCoachActivityProps> = ({
  coaches,
  lessons,
  clients,
}) => {
  const { t } = useLanguage();

  const activityData = useMemo(
    () => coaches.map((coach) => computeActivityData(coach, lessons, clients)),
    [coaches, lessons, clients]
  );

  const activeCount = activityData.filter((d) => d.status === 'ACTIVE').length;
  const lowCount = activityData.filter((d) => d.status === 'LOW').length;
  const inactiveCount = activityData.filter((d) => d.status === 'INACTIVE').length;
  const needsAttentionCount = activityData.filter(
    (d) => d.status !== 'ACTIVE' || d.membersWithNoRecentLesson > 0
  ).length;

  // Sort: inactive first, then low, then active; within each group by descending lessonsLast30Days
  const sorted = [...activityData].sort((a, b) => {
    const order: Record<ActivityStatus, number> = { INACTIVE: 0, LOW: 1, ACTIVE: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return b.lessonsLast30Days - a.lessonsLast30Days;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink-high flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-600" />
          {t('admin_coach_activity_title')}
        </h2>
        <p className="text-xs text-ink-muted">{t('admin_coach_activity_heuristic_note')}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-bg-raised p-4 rounded-xl border border-line-default shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-500/10 rounded-full flex items-center justify-center text-indigo-600">
            <User className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-ink-muted font-medium">
              {t('admin_coach_activity_total_coaches')}
            </p>
            <p className="text-2xl font-bold text-ink-high">{coaches.length}</p>
          </div>
        </div>

        <div className="bg-bg-raised p-4 rounded-xl border border-emerald-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-500/10 rounded-full flex items-center justify-center text-emerald-600">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-ink-muted font-medium">
              {t('admin_coach_activity_status_active')}
            </p>
            <p className="text-2xl font-bold text-primary-300">{activeCount}</p>
          </div>
        </div>

        <div className="bg-bg-raised p-4 rounded-xl border border-amber-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-600">
            <Minus className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-ink-muted font-medium">
              {t('admin_coach_activity_status_low')}
            </p>
            <p className="text-2xl font-bold text-amber-300">{lowCount}</p>
          </div>
        </div>

        <div className="bg-bg-raised p-4 rounded-xl border border-red-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center text-red-500">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-ink-muted font-medium">
              {t('admin_coach_activity_status_inactive')}
            </p>
            <p className="text-2xl font-bold text-red-400">{inactiveCount}</p>
          </div>
        </div>
      </div>

      {/* Needs-attention banner */}
      {needsAttentionCount > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/10 rounded-xl border border-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-200 font-medium">
            {t('admin_coach_activity_needs_attention_banner').replace(
              '{n}',
              String(needsAttentionCount)
            )}
          </p>
        </div>
      )}

      {/* Coach list */}
      {coaches.length === 0 ? (
        <div className="bg-bg-raised rounded-xl border border-line-default p-10 text-center text-ink-muted text-sm">
          {t('admin_coach_activity_no_coaches')}
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((data) => (
            <CoachActivityRow key={data.coach.id} data={data} />
          ))}
        </div>
      )}
    </div>
  );
};
