import React, { useMemo, useState } from 'react';
import {
  Lesson,
  ClientProfile,
  CoachProfile,
} from '../types';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  BookOpen,
  Star,
  AlertCircle,
  Lightbulb,
  BarChart3,
  Dumbbell,
  Clock,
  Pause,
  Activity,
  Sprout,
  GraduationCap,
  Zap,
  Target,
  CheckCircle2,
} from 'lucide-react';
import {
  generateCoachInsights,
  buildMemberGrowthReports,
  generateCoachGrowthProfile,
  CoachXInsight,
  MemberGrowthReport,
  MemberTrend,
  CoachGrowthProfile,
} from '../services/coachXService';
import { useLanguage } from './LanguageContext';

interface CoachXHubProps {
  coachProfile: CoachProfile;
  allLessons: Lesson[];
  clients: ClientProfile[];
  onBack: () => void;
  onOpenChat: () => void;
}

// ─── Trend Badge ──────────────────────────────────────────────────────────────
const TrendBadge: React.FC<{ trend: MemberTrend }> = ({ trend }) => {
  const { t } = useLanguage();
  const configs: Record<MemberTrend, { label: string; icon: React.ReactNode; className: string }> = {
    improving: {
      label: t('coachx_trend_improving'),
      icon: <TrendingUp className="w-3 h-3" />,
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    plateau: {
      label: t('coachx_trend_plateau'),
      icon: <Pause className="w-3 h-3" />,
      className: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    new: {
      label: t('coachx_trend_new'),
      icon: <Sprout className="w-3 h-3" />,
      className: 'bg-sky-50 text-sky-700 border-sky-200',
    },
    inactive: {
      label: t('coachx_trend_inactive'),
      icon: <Clock className="w-3 h-3" />,
      className: 'bg-red-50 text-red-600 border-red-200',
    },
  };
  const { label, icon, className } = configs[trend];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${className}`}>
      {icon} {label}
    </span>
  );
};

// ─── Insight Card ─────────────────────────────────────────────────────────────
const InsightCard: React.FC<{ insight: CoachXInsight }> = ({ insight }) => {
  const colorMap: Record<CoachXInsight['type'], string> = {
    pattern: 'from-violet-600 to-indigo-700',
    attention: 'from-amber-500 to-orange-600',
    curriculum: 'from-emerald-500 to-teal-600',
    coach_growth: 'from-sky-500 to-blue-600',
    stagnation: 'from-red-500 to-rose-600',
  };
  const bgMap: Record<CoachXInsight['type'], string> = {
    pattern: 'bg-violet-50 border-violet-100',
    attention: 'bg-amber-50 border-amber-100',
    curriculum: 'bg-emerald-50 border-emerald-100',
    coach_growth: 'bg-sky-50 border-sky-100',
    stagnation: 'bg-red-50 border-red-100',
  };
  const textMap: Record<CoachXInsight['type'], string> = {
    pattern: 'text-violet-700',
    attention: 'text-amber-700',
    curriculum: 'text-emerald-700',
    coach_growth: 'text-sky-700',
    stagnation: 'text-red-700',
  };

  /** Render **bold** markdown within a string */
  const renderBold = (text: string) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1 ? <strong key={i}>{part}</strong> : part
    );
  };

  return (
    <div className={`rounded-xl border p-4 ${bgMap[insight.type]}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${colorMap[insight.type]} flex items-center justify-center text-base flex-shrink-0`}>
          {insight.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold mb-1 ${textMap[insight.type]}`}>{insight.title}</p>
          <p className="text-xs text-gray-600 leading-relaxed">{renderBold(insight.body)}</p>
        </div>
      </div>
    </div>
  );
};

// ─── Member Report Card ───────────────────────────────────────────────────────
const MemberReportCard: React.FC<{ report: MemberGrowthReport }> = ({ report }) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState<'report' | 'curriculum' | 'drills'>('report');

  const levelColors = {
    high: 'bg-red-100 text-red-700 border-red-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-gray-100 text-gray-500 border-gray-200',
  };
  const levelLabels = {
    high: t('coachx_attention_high'),
    medium: t('coachx_attention_medium'),
    low: t('coachx_attention_low'),
  };

  const trendIcon =
    report.trendIndicator === 'improving' ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> :
    report.trendIndicator === 'plateau'   ? <Minus className="w-3.5 h-3.5 text-amber-500" /> :
    report.trendIndicator === 'inactive'  ? <TrendingDown className="w-3.5 h-3.5 text-red-500" /> :
    <Activity className="w-3.5 h-3.5 text-sky-500" />;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-10 h-10 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
          {report.clientName.charAt(0) || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="font-bold text-gray-900 text-sm truncate">{report.clientName}</p>
            {trendIcon}
          </div>
          <p className="text-xs text-gray-500">
            {t('coachx_lesson_count').replace('{n}', String(report.lessonCount))}
            {report.lastLessonDate && report.daysSinceLastLesson !== null && (
              <span className="ml-1.5 text-gray-400">· {t('coachx_days_ago').replace('{n}', String(report.daysSinceLastLesson))}</span>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <TrendBadge trend={report.trendIndicator} />
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${levelColors[report.attentionLevel]}`}>
            {levelLabels[report.attentionLevel]}
          </span>
        </div>
        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ml-1 ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* Section tabs */}
          <div className="flex border-b border-gray-100">
            {(['report', 'curriculum', 'drills'] as const).map(section => (
              <button
                key={section}
                onClick={() => setActiveSection(section)}
                className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                  activeSection === section
                    ? 'text-violet-700 border-b-2 border-violet-600'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {section === 'report'     ? t('coachx_section_report') :
                 section === 'curriculum' ? t('coachx_section_curriculum') :
                                            t('coachx_section_drills')}
              </button>
            ))}
          </div>

          {/* Report section */}
          {activeSection === 'report' && (
            <div className="px-4 pb-4 pt-3 space-y-3">
              {report.repeatedIssues.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 text-amber-500" /> {t('coachx_repeated_issues')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {report.repeatedIssues.map((issue, i) => (
                      <span key={i} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">{issue}</span>
                    ))}
                  </div>
                </div>
              )}

              {report.strengths.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <Star className="w-3 h-3 text-emerald-500" /> {t('coachx_strengths')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {report.strengths.map((s, i) => (
                      <span key={i} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Lightbulb className="w-3 h-3 text-violet-500" /> {t('coachx_suggested_focus')}
                </p>
                <p className="text-xs text-gray-700 bg-violet-50 rounded-lg px-3 py-2 leading-relaxed">{report.suggestedNextLesson}</p>
              </div>

              {report.trendIndicator === 'plateau' && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                  <Pause className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 leading-relaxed">{t('coachx_plateau_tip')}</p>
                </div>
              )}

              {report.trendIndicator === 'inactive' && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 leading-relaxed">{t('coachx_inactive_tip')}</p>
                </div>
              )}
            </div>
          )}

          {/* Curriculum section */}
          {activeSection === 'curriculum' && (
            <div className="px-4 pb-4 pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1">
                <BookOpen className="w-3 h-3 text-indigo-500" /> {t('coachx_curriculum_5_sessions')}
              </p>
              <ol className="space-y-2">
                {report.curriculumPlan5.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-xs text-gray-700 leading-relaxed flex-1">{item}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Drills section */}
          {activeSection === 'drills' && (
            <div className="px-4 pb-4 pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1">
                <Dumbbell className="w-3 h-3 text-violet-500" /> {t('coachx_drill_suggestions')}
              </p>
              <ul className="space-y-2">
                {report.drillSuggestions.map((drill, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-violet-400 font-bold flex-shrink-0 text-xs mt-0.5">▸</span>
                    <p className="text-xs text-gray-700 leading-relaxed">{drill}</p>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-400 mt-3 italic">{t('coachx_drills_note')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Curriculum Plan Card (Curriculum tab) ────────────────────────────────────
const CurriculumPlanCard: React.FC<{ report: MemberGrowthReport }> = ({ report }) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
          {report.clientName.charAt(0) || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900">{report.clientName}</p>
          <p className="text-xs text-gray-500 truncate">{report.curriculumPlan5[0]}</p>
        </div>
        <TrendBadge trend={report.trendIndicator} />
        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ml-1 ${expanded ? 'rotate-90' : ''}`} />
      </button>
      {expanded && (
        <div className="border-t border-gray-50 px-4 pb-4 pt-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">
            {t('coachx_curriculum_5_sessions')}
          </p>
          <ol className="space-y-2">
            {report.curriculumPlan5.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-xs text-gray-700 leading-relaxed">{item}</p>
              </li>
            ))}
          </ol>
          {report.drillSuggestions.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-50">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Dumbbell className="w-3 h-3 text-violet-500" /> {t('coachx_suggested_drills_short')}
              </p>
              <ul className="space-y-1">
                {report.drillSuggestions.slice(0, 2).map((drill, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                    <span className="text-violet-400 font-bold flex-shrink-0">·</span>
                    {drill}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Sort priority for member trend (worst first so actionable items appear at top) ─
const TREND_SORT_ORDER: Record<MemberTrend, number> = {
  inactive: 0,
  plateau: 1,
  new: 2,
  improving: 3,
};

// ─── Coach Growth Tab ─────────────────────────────────────────────────────────
const CoachGrowthTab: React.FC<{ profile: CoachGrowthProfile }> = ({ profile }) => {
  const { t } = useLanguage();

  const maxTopicCount = profile.topicBreakdown[0]?.count ?? 1;

  const trendRows: Array<{
    key: keyof CoachGrowthProfile['memberTrends'];
    labelKey: string;
    color: string;
    barColor: string;
    icon: React.ReactNode;
  }> = [
    { key: 'improving', labelKey: 'coachx_growth_trend_improving', color: 'text-emerald-700', barColor: 'bg-emerald-400', icon: <TrendingUp className="w-3 h-3 text-emerald-500" /> },
    { key: 'plateau',   labelKey: 'coachx_growth_trend_plateau',   color: 'text-amber-700',   barColor: 'bg-amber-400',   icon: <Pause       className="w-3 h-3 text-amber-500" /> },
    { key: 'new',       labelKey: 'coachx_growth_trend_new',       color: 'text-sky-700',     barColor: 'bg-sky-400',     icon: <Sprout      className="w-3 h-3 text-sky-500" /> },
    { key: 'inactive',  labelKey: 'coachx_growth_trend_inactive',  color: 'text-red-600',     barColor: 'bg-red-400',     icon: <Clock       className="w-3 h-3 text-red-500" /> },
  ];
  const totalMembers = Object.values(profile.memberTrends).reduce((s, n) => s + n, 0) || 1;

  return (
    <div className="space-y-4">

      {/* ── Teaching Activity ──────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
          <Activity className="w-3.5 h-3.5" />
          {t('coachx_growth_activity_title')}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            {
              value: profile.lessonsThisMonth,
              label: t('coachx_growth_this_month'),
              unit: t('coachx_growth_lessons_unit'),
              color: 'text-violet-600',
              bg: 'bg-violet-50',
              delta: profile.lessonsLastMonth > 0
                ? Math.round(((profile.lessonsThisMonth - profile.lessonsLastMonth) / profile.lessonsLastMonth) * 100)
                : null,
            },
            {
              value: profile.lessonsLastMonth,
              label: t('coachx_growth_last_month'),
              unit: t('coachx_growth_lessons_unit'),
              color: 'text-gray-600',
              bg: 'bg-gray-50',
              delta: null,
            },
            {
              value: profile.activeMembersCount,
              label: t('coachx_growth_active_members'),
              unit: '',
              color: 'text-emerald-600',
              bg: 'bg-emerald-50',
              delta: null,
            },
            {
              value: profile.avgSessionsPerActiveMember,
              label: t('coachx_growth_avg_sessions'),
              unit: t('coachx_growth_sessions_unit'),
              color: 'text-indigo-600',
              bg: 'bg-indigo-50',
              delta: null,
            },
          ].map((stat, i) => (
            <div key={i} className={`${stat.bg} rounded-xl p-3 text-center`}>
              <p className={`text-xl font-extrabold ${stat.color} leading-none`}>
                {stat.value}
                {stat.unit && <span className="text-xs font-normal ml-0.5">{stat.unit}</span>}
              </p>
              <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
              {stat.delta !== null && (
                <p className={`text-xs font-semibold mt-0.5 ${stat.delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {stat.delta >= 0 ? '+' : ''}{stat.delta}% {t('coachx_growth_vs_prev')}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Topic Breakdown ────────────────────────────────────────────────── */}
      {profile.topicBreakdown.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-3">
            <BarChart3 className="w-3.5 h-3.5 text-violet-500" />
            {t('coachx_growth_topic_breakdown')}
          </p>
          <div className="space-y-2.5">
            {profile.topicBreakdown.map((stat, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-16 text-xs text-gray-700 font-medium truncate flex-shrink-0">{stat.topic}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
                    style={{ width: `${Math.round((stat.count / maxTopicCount) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 w-14 text-right flex-shrink-0">
                  {t('coachx_growth_topic_count')
                    .replace('{n}', String(stat.count))
                    .replace('{pct}', String(stat.percentage))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Teaching Strengths & Growth Opportunities ──────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Strengths */}
        <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4">
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5 mb-2.5">
            <Star className="w-3.5 h-3.5" />
            {t('coachx_growth_teaching_strengths')}
          </p>
          {profile.teachingStrengths.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {profile.teachingStrengths.map((s, i) => (
                <span key={i} className="text-xs bg-white text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-1 font-medium">
                  {s}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-emerald-600 italic">{t('coachx_growth_no_data')}</p>
          )}
        </div>

        {/* Opportunities */}
        <div className="bg-sky-50 rounded-xl border border-sky-100 p-4">
          <p className="text-xs font-semibold text-sky-700 uppercase tracking-wide flex items-center gap-1.5 mb-2.5">
            <Target className="w-3.5 h-3.5" />
            {t('coachx_growth_opportunities')}
          </p>
          {profile.growthOpportunities.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {profile.growthOpportunities.map((o, i) => (
                <span key={i} className="text-xs bg-white text-sky-700 border border-sky-200 rounded-full px-2.5 py-1 font-medium">
                  {o}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-sky-600 italic">{t('coachx_growth_opportunities_all_covered')}</p>
          )}
        </div>
      </div>

      {/* ── Member Progress Snapshot ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-3">
          <Users className="w-3.5 h-3.5 text-violet-500" />
          {t('coachx_growth_member_snapshot')}
        </p>
        <div className="space-y-2">
          {trendRows.map(row => {
            const count = profile.memberTrends[row.key];
            const pct = Math.round((count / totalMembers) * 100);
            return (
              <div key={row.key} className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5 w-24 flex-shrink-0">
                  {row.icon}
                  <span className={`text-xs font-medium ${row.color}`}>{t(row.labelKey)}</span>
                </div>
                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full ${row.barColor} transition-all duration-500`}
                    style={{ width: count > 0 ? `${pct}%` : '0%' }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-6 text-right flex-shrink-0">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Recommended Actions ────────────────────────────────────────────── */}
      {profile.recommendedActions.length > 0 && (
        <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-xl border border-violet-100 p-4">
          <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide flex items-center gap-1.5 mb-3">
            <Zap className="w-3.5 h-3.5" />
            {t('coachx_growth_recommended_actions')}
          </p>
          <ul className="space-y-2">
            {profile.recommendedActions.map((action, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-700 leading-relaxed">{action}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const CoachXHub: React.FC<CoachXHubProps> = ({
  coachProfile,
  allLessons,
  clients,
  onBack,
  onOpenChat,
}) => {
  const { language, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'insights' | 'members' | 'curriculum' | 'coach_growth'>('insights');

  const insights = useMemo(
    () => generateCoachInsights(allLessons, coachProfile),
    [allLessons, coachProfile]
  );

  const memberReports = useMemo(
    () => buildMemberGrowthReports(allLessons, clients, language),
    [allLessons, clients, language]
  );

  const coachGrowthProfile = useMemo(
    () => generateCoachGrowthProfile(allLessons, clients),
    [allLessons, clients]
  );

  const attentionMembers = memberReports.filter(r => r.attentionLevel === 'high');
  const stagnatingMembers = memberReports.filter(
    r => r.trendIndicator === 'plateau' || r.trendIndicator === 'inactive'
  );

  const tabs = [
    { id: 'insights'     as const, label: t('coachx_tab_insights'),     icon: <Sparkles       className="w-3.5 h-3.5" /> },
    { id: 'members'      as const, label: t('coachx_tab_members'),      icon: <Users          className="w-3.5 h-3.5" /> },
    { id: 'curriculum'   as const, label: t('coachx_tab_curriculum'),   icon: <BookOpen       className="w-3.5 h-3.5" /> },
    { id: 'coach_growth' as const, label: t('coachx_tab_coach_growth'), icon: <GraduationCap  className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 animate-fade-in">
      {/* ── Hero Header ──────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-gray-900 via-violet-950 to-indigo-950 px-4 pt-6 pb-8 relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

        <button
          onClick={onBack}
          className="relative z-10 flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors mb-5"
          aria-label={t('back')}
        >
          <ChevronLeft className="w-4 h-4" />
          {t('back')}
        </button>

        {/* CoachX animated icon */}
        <div className="relative z-10 flex flex-col items-center mb-5">
          <div className="relative w-20 h-20 mb-3">
            {/* Pulse rings */}
            <div className="absolute inset-0 rounded-full bg-violet-500/30 coachx-ring-1" />
            <div className="absolute inset-0 rounded-full bg-violet-500/20 coachx-ring-2" />
            <div className="absolute inset-2 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 coachx-core flex items-center justify-center shadow-2xl">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">CoachX</h1>
          <p className="text-sm text-violet-300 mt-0.5">{t('coachx_subtitle')}</p>
        </div>

        {/* Quick stats */}
        <div className="relative z-10 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-white">{allLessons.length}</p>
            <p className="text-xs text-white/60">{t('coachx_stat_lessons')}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-white">{memberReports.length}</p>
            <p className="text-xs text-white/60">{t('coachx_stat_members')}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-emerald-300">
              {memberReports.filter(r => r.trendIndicator === 'improving').length}
            </p>
            <p className="text-xs text-white/60">{t('coachx_stat_improving')}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-amber-300">{stagnatingMembers.length}</p>
            <p className="text-xs text-white/60">{t('coachx_stat_attention')}</p>
          </div>
        </div>
      </div>

      {/* ── Ask CoachX CTA ───────────────────────────────────────────────── */}
      <div className="px-4 -mt-4 relative z-10">
        <button
          onClick={onOpenChat}
          className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-2xl p-4 flex items-center gap-3 shadow-lg shadow-violet-900/30 transition-all"
        >
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-bold text-sm">{t('coachx_ask_title')}</p>
            <p className="text-xs text-white/70">{t('coachx_ask_desc')}</p>
          </div>
          <ChevronRight className="w-5 h-5 text-white/60 flex-shrink-0" />
        </button>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="px-4 mt-5">
        <div className="flex bg-white rounded-xl shadow-sm border border-gray-100 p-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-violet-600'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────────── */}
      <div className="flex-1 px-4 py-4 space-y-3 pb-8">

        {/* Insights Tab */}
        {activeTab === 'insights' && (
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              {t('coachx_insights_section')}
            </p>
            {insights.map((insight, i) => (
              <InsightCard key={i} insight={insight} />
            ))}
          </>
        )}

        {/* Members Tab */}
        {activeTab === 'members' && (
          <>
            {stagnatingMembers.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2.5 mb-1">
                <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-700">{t('coachx_stagnation_watch')}</p>
                  <p className="text-xs text-amber-600 mt-0.5">{stagnatingMembers.map(r => r.clientName).join(', ')}</p>
                </div>
              </div>
            )}
            {attentionMembers.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-2.5 mb-1">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-red-700">{t('coachx_attention_label')}</p>
                  <p className="text-xs text-red-600 mt-0.5">{attentionMembers.map(r => r.clientName).join(', ')}</p>
                </div>
              </div>
            )}
            {memberReports.length === 0 ? (
              <div className="text-center py-12">
                <BarChart3 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">{t('coachx_no_members')}</p>
              </div>
            ) : (
              memberReports
                .sort((a, b) => {
                  const trendDiff = TREND_SORT_ORDER[a.trendIndicator] - TREND_SORT_ORDER[b.trendIndicator];
                  if (trendDiff !== 0) return trendDiff;
                  const attnOrder = { high: 0, medium: 1, low: 2 };
                  return attnOrder[a.attentionLevel] - attnOrder[b.attentionLevel];
                })
                .map((report, i) => (
                  <MemberReportCard key={i} report={report} />
                ))
            )}
          </>
        )}

        {/* Curriculum Tab */}
        {activeTab === 'curriculum' && (
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              {t('coachx_curriculum_section')}
            </p>
            {insights
              .filter(i => i.type === 'curriculum' || i.type === 'coach_growth')
              .map((insight, i) => (
                <InsightCard key={i} insight={insight} />
              ))}

            {/* Per-member curriculum plans */}
            {memberReports.length > 0 && (
              <>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 pt-2">
                  <Users className="w-3.5 h-3.5 text-violet-500" />
                  {t('coachx_per_member_curriculum')}
                </p>
                {memberReports
                  .filter(r => r.lessonCount >= 1)
                  .sort((a, b) => {
                    return TREND_SORT_ORDER[a.trendIndicator] - TREND_SORT_ORDER[b.trendIndicator];
                  })
                  .map((report, i) => (
                    <CurriculumPlanCard key={i} report={report} />
                  ))}
              </>
            )}
          </>
        )}

        {/* Coach Growth Tab */}
        {activeTab === 'coach_growth' && (
          <>
            {allLessons.length === 0 ? (
              <div className="text-center py-12">
                <GraduationCap className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">{t('coachx_growth_no_data')}</p>
              </div>
            ) : (
              <CoachGrowthTab profile={coachGrowthProfile} />
            )}
          </>
        )}
      </div>

      {/* CoachX animation styles */}
      <style>{`
        @keyframes coachx-ring-pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.15); opacity: 0.2; }
        }
        @keyframes coachx-ring-pulse-delayed {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.25); opacity: 0.1; }
        }
        @keyframes coachx-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        .coachx-ring-1 {
          animation: coachx-ring-pulse 2.5s ease-in-out infinite;
        }
        .coachx-ring-2 {
          animation: coachx-ring-pulse-delayed 2.5s ease-in-out 0.8s infinite;
        }
        .coachx-core {
          animation: coachx-breathe 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};
