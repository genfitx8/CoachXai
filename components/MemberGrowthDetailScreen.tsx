/**
 * MemberGrowthDetailScreen
 *
 * Full-screen, coach-facing member growth report introduced in PR #108.
 * Surfaces richer analytics from `MemberGrowthReport`:
 *   • Growth score gauge
 *   • Weekly activity sparkline (last 8 weeks)
 *   • Topic progression: early vs. recent lesson focus areas
 *   • Issue resolution tracker
 *   • Lesson cadence stats
 *   • Coaching action recommendations
 *
 * This component is opened from CoachXHub's Members tab when the coach
 * taps "Full Report" on a MemberReportCard.
 */

import React, { useMemo } from 'react';
import {
  ChevronLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Clock,
  Pause,
  Sprout,
  BarChart3,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Sparkles,
  MessageSquare,
  Dumbbell,
  AlertCircle,
  Star,
  Zap,
} from 'lucide-react';
import { MemberGrowthReport, MemberTrend } from '../services/coachXService';
import { useLanguage } from './LanguageContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MemberGrowthDetailScreenProps {
  report: MemberGrowthReport;
  onBack: () => void;
  onAskCoachX: (memberName: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Score colour ramp */
function scoreColor(score: number): { ring: string; text: string; label: string } {
  if (score >= 70) return { ring: 'stroke-emerald-500', text: 'text-emerald-600', label: 'text-emerald-700' };
  if (score >= 45) return { ring: 'stroke-amber-400',  text: 'text-amber-600',   label: 'text-amber-700'   };
  return             { ring: 'stroke-red-400',    text: 'text-red-600',     label: 'text-red-700'     };
}

/** Map trend to icon + colour */
function trendConfig(trend: MemberTrend, t: (k: string) => string) {
  switch (trend) {
    case 'improving': return { icon: <TrendingUp  className="w-4 h-4 text-emerald-500" />, label: t('coachx_trend_improving'), bg: 'bg-emerald-50',  border: 'border-emerald-200', text: 'text-emerald-700' };
    case 'plateau':   return { icon: <Pause       className="w-4 h-4 text-amber-500"   />, label: t('coachx_trend_plateau'),   bg: 'bg-amber-50',    border: 'border-amber-200',   text: 'text-amber-700'   };
    case 'new':       return { icon: <Sprout      className="w-4 h-4 text-sky-500"     />, label: t('coachx_trend_new'),       bg: 'bg-sky-50',      border: 'border-sky-200',     text: 'text-sky-700'     };
    case 'inactive':  return { icon: <Clock       className="w-4 h-4 text-red-500"     />, label: t('coachx_trend_inactive'),  bg: 'bg-red-50',      border: 'border-red-200',     text: 'text-red-700'     };
  }
}

// ─── Growth Score Gauge ───────────────────────────────────────────────────────

const GrowthScoreGauge: React.FC<{ score: number }> = ({ score }) => {
  const { t } = useLanguage();
  const { ring, text } = scoreColor(score);

  // SVG arc parameters
  const r = 42;
  const cx = 54;
  const cy = 54;
  const circumference = 2 * Math.PI * r;
  // Full arc = 240° (from 150° to 390°). strokeDashoffset maps score to arc length.
  const fullArc = circumference * (240 / 360);
  const arcFraction = (score / 100) * (240 / 360);
  // Offset = fullArc minus the filled portion, so we shift the dash to reveal [score]% of the arc.
  const dashOffset = fullArc - circumference * arcFraction;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 108 108" className="w-full h-full -rotate-[150deg]">
          {/* Background arc */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="10"
            strokeDasharray={`${fullArc} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Score arc */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            className={ring}
            strokeWidth="10"
            strokeDasharray={`${fullArc} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        {/* Score label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-extrabold leading-none ${text}`}>{score}</span>
          <span className="text-[10px] text-gray-400 mt-0.5">{t('coachx_growth_score_label')}</span>
        </div>
      </div>
    </div>
  );
};

// ─── Weekly Activity Sparkline ────────────────────────────────────────────────

/** Maximum bar height in pixels for the weekly activity chart. */
const SPARKLINE_MAX_HEIGHT_PX = 40;
/** Minimum bar height in pixels for a week with at least one lesson. */
const SPARKLINE_MIN_VISIBLE_PX = 6;
/** Bar height in pixels for an empty week. */
const SPARKLINE_EMPTY_PX = 3;

const WeeklySparkline: React.FC<{ data: { weekLabel: string; count: number }[] }> = ({ data }) => {
  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="flex items-end gap-1">
      {data.map((d, i) => {
        const height = d.count > 0
          ? Math.max(Math.round((d.count / maxCount) * SPARKLINE_MAX_HEIGHT_PX), SPARKLINE_MIN_VISIBLE_PX)
          : SPARKLINE_EMPTY_PX;
        const isLatest = i === data.length - 1;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            {d.count > 0 && (
              <span className="text-[9px] text-violet-600 font-semibold leading-none">{d.count}</span>
            )}
            <div
              className={`w-full rounded-t-sm transition-all ${isLatest ? 'bg-violet-500' : 'bg-violet-200'}`}
              style={{ height: `${height}px` }}
            />
            <span className="text-[8px] text-gray-400 leading-none">{d.weekLabel}</span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Topic Progression Panel ──────────────────────────────────────────────────

const TopicProgressionPanel: React.FC<{
  early: string[];
  recent: string[];
}> = ({ early, recent }) => {
  const { t } = useLanguage();

  // Items only in early = resolved; items only in recent = newly added; in both = ongoing
  const earlySet  = new Set(early.map(s => s.toLowerCase()));
  const recentSet = new Set(recent.map(s => s.toLowerCase()));
  const resolved = early.filter(t => !recentSet.has(t.toLowerCase()));
  const ongoing  = early.filter(t =>  recentSet.has(t.toLowerCase()));
  const newFocus = recent.filter(t => !earlySet.has(t.toLowerCase()));

  if (early.length === 0 && recent.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic">{t('coachx_topic_progression_empty')}</p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Comparison arrow view */}
      <div className="flex items-start gap-2">
        {/* Early column */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            {t('coachx_topic_early')}
          </p>
          {early.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {early.map((topic, i) => (
                <span
                  key={i}
                  className={`text-xs rounded-full px-2 py-0.5 border ${
                    recentSet.has(topic.toLowerCase())
                      ? 'bg-amber-50 text-amber-700 border-amber-200'  // ongoing
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'  // resolved
                  }`}
                >
                  {topic}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">{t('coachx_topic_no_data')}</p>
          )}
        </div>

        <ArrowRight className="w-4 h-4 text-gray-300 mt-5 flex-shrink-0" />

        {/* Recent column */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            {t('coachx_topic_recent')}
          </p>
          {recent.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {recent.map((topic, i) => (
                <span
                  key={i}
                  className={`text-xs rounded-full px-2 py-0.5 border ${
                    earlySet.has(topic.toLowerCase())
                      ? 'bg-amber-50 text-amber-700 border-amber-200'   // ongoing
                      : 'bg-violet-50 text-violet-700 border-violet-200' // new
                  }`}
                >
                  {topic}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">{t('coachx_topic_no_data')}</p>
          )}
        </div>
      </div>

      {/* Legend */}
      {(resolved.length > 0 || ongoing.length > 0 || newFocus.length > 0) && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-50">
          {resolved.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-600">
              <CheckCircle2 className="w-3 h-3" />{t('coachx_topic_resolved')}: {resolved.join(', ')}
            </span>
          )}
          {ongoing.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-amber-600">
              <Minus className="w-3 h-3" />{t('coachx_topic_ongoing')}: {ongoing.join(', ')}
            </span>
          )}
          {newFocus.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-violet-600">
              <Zap className="w-3 h-3" />{t('coachx_topic_new_focus')}: {newFocus.join(', ')}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Issue Resolution Bar ─────────────────────────────────────────────────────

const IssueResolutionBar: React.FC<{ rate: number }> = ({ rate }) => {
  const { t } = useLanguage();
  const pct = Math.round(rate * 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400';
  const textColor = pct >= 70 ? 'text-emerald-700' : pct >= 40 ? 'text-amber-700' : 'text-red-700';

  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-semibold text-gray-600">{t('coachx_issue_resolution_rate')}</span>
        <span className={`text-xs font-bold ${textColor}`}>{pct}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-2.5 rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-gray-400 mt-1">{t('coachx_issue_resolution_desc')}</p>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const MemberGrowthDetailScreen: React.FC<MemberGrowthDetailScreenProps> = ({
  report,
  onBack,
  onAskCoachX,
}) => {
  const { t } = useLanguage();
  const tc = trendConfig(report.trendIndicator, t);
  const { text: scoreText, label: scoreLabel } = scoreColor(report.growthScore);

  // Label for lesson cadence
  const cadenceLabel = useMemo(() => {
    if (report.lessonCadence === null) return t('coachx_cadence_insufficient_data');
    if (report.lessonCadence <= 7)  return t('coachx_cadence_excellent');
    if (report.lessonCadence <= 14) return t('coachx_cadence_good');
    if (report.lessonCadence <= 21) return t('coachx_cadence_moderate');
    return t('coachx_cadence_low');
  }, [report.lessonCadence, t]);

  const cadenceColor = useMemo(() => {
    if (report.lessonCadence === null) return 'text-gray-500';
    if (report.lessonCadence <= 14)  return 'text-emerald-600';
    if (report.lessonCadence <= 21)  return 'text-amber-600';
    return 'text-red-500';
  }, [report.lessonCadence]);

  // Coaching summary paragraphs
  const trendSummary = useMemo(() => {
    switch (report.trendIndicator) {
      case 'improving': return t('coachx_detail_summary_improving');
      case 'plateau':   return t('coachx_detail_summary_plateau');
      case 'inactive':  return t('coachx_detail_summary_inactive');
      case 'new':       return t('coachx_detail_summary_new');
    }
  }, [report.trendIndicator, t]);

  // Derive key action recommendations
  const actions = useMemo(() => {
    const list: string[] = [];
    if (report.trendIndicator === 'inactive') {
      list.push(t('coachx_detail_action_reengage'));
    }
    if (report.trendIndicator === 'plateau') {
      list.push(t('coachx_detail_action_fresh_approach'));
    }
    if (report.lessonCadence !== null && report.lessonCadence > 21) {
      list.push(t('coachx_detail_action_increase_cadence'));
    }
    if (report.issueResolutionRate < 0.4 && report.lessonCount >= 4) {
      list.push(t('coachx_detail_action_resolve_issues'));
    }
    if (report.topicProgressionStages.recent.length > 0) {
      list.push(
        t('coachx_detail_action_next_focus').replace(
          '{topic}', report.topicProgressionStages.recent[0]
        )
      );
    }
    if (list.length === 0) {
      list.push(t('coachx_detail_action_keep_momentum'));
    }
    return list.slice(0, 3);
  }, [report, t]);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 animate-fade-in">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-gray-900 via-violet-950 to-indigo-950 px-4 pt-6 pb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />

        <button
          onClick={onBack}
          className="relative z-10 flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors mb-5"
        >
          <ChevronLeft className="w-4 h-4" />
          {t('back')}
        </button>

        {/* Member identity row */}
        <div className="relative z-10 flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center text-2xl font-extrabold text-white flex-shrink-0">
            {report.clientName.charAt(0) || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-white truncate">{report.clientName}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full border ${tc.bg} ${tc.border} ${tc.text}`}>
                {tc.icon} {tc.label}
              </span>
              <span className={`text-sm font-bold ${scoreText}`}>
                {t('coachx_growth_score_label')} {report.growthScore}
              </span>
            </div>
          </div>
          <GrowthScoreGauge score={report.growthScore} />
        </div>

        {/* Quick stats strip */}
        <div className="relative z-10 grid grid-cols-3 gap-2">
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-white">{report.lessonCount}</p>
            <p className="text-[10px] text-white/60">{t('coachx_stat_lessons')}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-white">
              {report.lessonCadence !== null ? `${report.lessonCadence}d` : '—'}
            </p>
            <p className="text-[10px] text-white/60">{t('coachx_cadence_avg_days')}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-white">
              {report.daysSinceLastLesson !== null ? `${report.daysSinceLastLesson}d` : '—'}
            </p>
            <p className="text-[10px] text-white/60">{t('coachx_days_ago_label')}</p>
          </div>
        </div>
      </div>

      {/* ── Ask CoachX CTA ───────────────────────────────────────────────── */}
      <div className="px-4 -mt-4 relative z-10">
        <button
          onClick={() => onAskCoachX(report.clientName)}
          className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-2xl p-3.5 flex items-center gap-3 shadow-lg shadow-violet-900/30 transition-all"
        >
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-bold text-sm">{t('coachx_ask_about_member').replace('{name}', report.clientName)}</p>
            <p className="text-xs text-white/70">{t('coachx_ask_desc')}</p>
          </div>
          <Sparkles className="w-4 h-4 text-white/60 flex-shrink-0" />
        </button>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 px-4 py-4 space-y-4 pb-8">

        {/* ── Coaching Summary ──────────────────────────────────────────── */}
        <div className={`rounded-xl border p-4 ${tc.bg} ${tc.border}`}>
          <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${tc.text} flex items-center gap-1.5`}>
            {tc.icon} {t('coachx_detail_summary_title')}
          </p>
          <p className={`text-sm leading-relaxed ${tc.text}`}>{trendSummary}</p>
        </div>

        {/* ── Weekly Activity Sparkline ─────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-3">
            <BarChart3 className="w-3.5 h-3.5 text-violet-500" />
            {t('coachx_weekly_activity_title')}
          </p>
          <WeeklySparkline data={report.weeklyActivity} />
        </div>

        {/* ── Growth Metrics ────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-violet-500" />
            {t('coachx_growth_metrics_title')}
          </p>

          {/* Issue resolution */}
          <IssueResolutionBar rate={report.issueResolutionRate} />

          {/* Lesson cadence */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-semibold text-gray-600">{t('coachx_lesson_cadence_title')}</span>
              <span className={`text-xs font-bold ${cadenceColor}`}>{cadenceLabel}</span>
            </div>
            <p className="text-[10px] text-gray-400">
              {report.lessonCadence !== null
                ? t('coachx_cadence_value').replace('{n}', String(report.lessonCadence))
                : t('coachx_cadence_insufficient_data')}
            </p>
          </div>

          {/* Growth score breakdown */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs font-semibold text-gray-600">{t('coachx_growth_score_breakdown')}</span>
              <span className={`text-sm font-extrabold ${scoreText}`}>{report.growthScore}/100</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ${
                  report.growthScore >= 70 ? 'bg-emerald-500' :
                  report.growthScore >= 45 ? 'bg-amber-400' : 'bg-red-400'
                }`}
                style={{ width: `${report.growthScore}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">{t('coachx_growth_score_desc')}</p>
          </div>
        </div>

        {/* ── Topic Progression ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-3">
            <Activity className="w-3.5 h-3.5 text-violet-500" />
            {t('coachx_topic_progression_title')}
          </p>
          <TopicProgressionPanel
            early={report.topicProgressionStages.early}
            recent={report.topicProgressionStages.recent}
          />
        </div>

        {/* ── Repeated Issues ──────────────────────────────────────────── */}
        {report.repeatedIssues.length > 0 && (
          <div className="bg-amber-50 rounded-xl border border-amber-100 p-4">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1.5 mb-2.5">
              <AlertCircle className="w-3.5 h-3.5" />
              {t('coachx_repeated_issues')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {report.repeatedIssues.map((issue, i) => (
                <span key={i} className="text-xs bg-white text-amber-700 border border-amber-200 rounded-full px-2.5 py-1 font-medium flex items-center gap-1">
                  <XCircle className="w-3 h-3 opacity-60" /> {issue}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Strengths ────────────────────────────────────────────────── */}
        {report.strengths.length > 0 && (
          <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4">
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5 mb-2.5">
              <Star className="w-3.5 h-3.5" />
              {t('coachx_strengths')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {report.strengths.map((s, i) => (
                <span key={i} className="text-xs bg-white text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-1 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 opacity-70" /> {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Recommended Coaching Actions ─────────────────────────────── */}
        <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-xl border border-violet-100 p-4">
          <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide flex items-center gap-1.5 mb-3">
            <Zap className="w-3.5 h-3.5" />
            {t('coachx_detail_actions_title')}
          </p>
          <ul className="space-y-2">
            {actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-700 leading-relaxed">{action}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Next Lesson Suggestion ────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-2.5">
            <Dumbbell className="w-3.5 h-3.5 text-violet-500" />
            {t('coachx_suggested_focus')}
          </p>
          <p className="text-sm text-gray-800 bg-violet-50 rounded-lg px-3 py-2.5 leading-relaxed font-medium">
            {report.suggestedNextLesson}
          </p>
          {report.drillSuggestions.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-50">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {t('coachx_suggested_drills_short')}
              </p>
              <ul className="space-y-1.5">
                {report.drillSuggestions.map((drill, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-violet-400 font-bold text-xs flex-shrink-0 mt-0.5">▸</span>
                    <p className="text-xs text-gray-700">{drill}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default MemberGrowthDetailScreen;
