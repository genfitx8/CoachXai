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
  Users,
  BookOpen,
  Star,
  AlertCircle,
  Lightbulb,
  BarChart3,
} from 'lucide-react';
import {
  generateCoachInsights,
  buildMemberGrowthReports,
  CoachXInsight,
  MemberGrowthReport,
} from '../services/coachXService';
import { useLanguage } from './LanguageContext';

interface CoachXHubProps {
  coachProfile: CoachProfile;
  allLessons: Lesson[];
  clients: ClientProfile[];
  onBack: () => void;
  onOpenChat: () => void;
}

// ─── Insight Card ─────────────────────────────────────────────────────────────
const InsightCard: React.FC<{ insight: CoachXInsight }> = ({ insight }) => {
  const colorMap: Record<CoachXInsight['type'], string> = {
    pattern: 'from-violet-600 to-indigo-700',
    attention: 'from-amber-500 to-orange-600',
    curriculum: 'from-emerald-500 to-teal-600',
    coach_growth: 'from-sky-500 to-blue-600',
  };
  const bgMap: Record<CoachXInsight['type'], string> = {
    pattern: 'bg-violet-50 border-violet-100',
    attention: 'bg-amber-50 border-amber-100',
    curriculum: 'bg-emerald-50 border-emerald-100',
    coach_growth: 'bg-sky-50 border-sky-100',
  };
  const textMap: Record<CoachXInsight['type'], string> = {
    pattern: 'text-violet-700',
    attention: 'text-amber-700',
    curriculum: 'text-emerald-700',
    coach_growth: 'text-sky-700',
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
  const [expanded, setExpanded] = useState(false);

  const levelColors = {
    high: 'bg-red-100 text-red-700 border-red-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-gray-100 text-gray-500 border-gray-200',
  };
  const levelLabels = { high: '집중 케어 필요', medium: '진행 중', low: '안정적' };

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
          <p className="font-bold text-gray-900 text-sm truncate">{report.clientName}</p>
          <p className="text-xs text-gray-500">레슨 {report.lessonCount}회 · {report.recentTopics.slice(0, 2).join(', ') || '기록 없음'}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${levelColors[report.attentionLevel]}`}>
            {levelLabels[report.attentionLevel]}
          </span>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-50 px-4 pb-4 pt-3 space-y-3">
          {report.repeatedIssues.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-amber-500" /> 반복 교정 포인트
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
                <Star className="w-3 h-3 text-emerald-500" /> 강점
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
              <Lightbulb className="w-3 h-3 text-violet-500" /> 다음 레슨 추천
            </p>
            <p className="text-xs text-gray-700 bg-violet-50 rounded-lg px-3 py-2">{report.suggestedNextLesson}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <BookOpen className="w-3 h-3 text-indigo-500" /> 추천 커리큘럼 (3회)
            </p>
            <ul className="space-y-1">
              {report.curriculumPlan.map((item, i) => (
                <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                  <span className="text-indigo-400 font-bold flex-shrink-0">·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
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
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'insights' | 'members' | 'curriculum'>('insights');

  const insights = useMemo(
    () => generateCoachInsights(allLessons, coachProfile),
    [allLessons, coachProfile]
  );

  const memberReports = useMemo(
    () => buildMemberGrowthReports(allLessons, clients),
    [allLessons, clients]
  );

  const attentionMembers = memberReports.filter(r => r.attentionLevel === 'high');

  const tabs = [
    { id: 'insights' as const, label: t('coachx_tab_insights'), icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'members' as const, label: t('coachx_tab_members'), icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'curriculum' as const, label: t('coachx_tab_curriculum'), icon: <BookOpen className="w-3.5 h-3.5" /> },
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
        <div className="relative z-10 grid grid-cols-3 gap-3">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-white">{allLessons.length}</p>
            <p className="text-xs text-white/60">{t('coachx_stat_lessons')}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-white">{memberReports.length}</p>
            <p className="text-xs text-white/60">{t('coachx_stat_members')}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-white">{attentionMembers.length}</p>
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
                  const order = { high: 0, medium: 1, low: 2 };
                  return order[a.attentionLevel] - order[b.attentionLevel];
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

            {/* Per-member curriculum preview */}
            {memberReports.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-violet-500" />
                  {t('coachx_per_member_curriculum')}
                </p>
                <ul className="space-y-3">
                  {memberReports
                    .filter(r => r.lessonCount >= 1)
                    .slice(0, 5)
                    .map((report, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                          {report.clientName.charAt(0) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{report.clientName}</p>
                          <p className="text-xs text-gray-500 truncate">{report.curriculumPlan[0]}</p>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
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
