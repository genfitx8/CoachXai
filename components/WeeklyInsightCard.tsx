import React, { useState } from 'react';
import { WeeklyInsight, QuickLogEntry, Lesson, ClientProfile, CoachStyleExemplar } from '../types';
import { Sparkles, ChevronLeft, RefreshCw, TrendingUp, Target, List, Info } from 'lucide-react';
import { generateWeeklyInsight } from '../services/geminiService';
import { insightService } from '../services/insightService';
import { storageService } from '../services/storage';
import { EvidenceDetailModal } from './EvidenceDetailModal';
import { coachStyleService, tierForSource } from '../services/coachStyleService';

interface WeeklyInsightCardProps {
  clientId: string;
  coachId?: string;
  clientProfile?: ClientProfile;
  recentLogs: QuickLogEntry[];
  recentLessons: Lesson[];
  onBack: () => void;
  isFirebaseMode: boolean;
}

const getMondayOfCurrentWeek = (): string => {
  const today = new Date();
  const day = today.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday.toISOString().split('T')[0];
};

const getSundayOfCurrentWeek = (): string => {
  const monday = getMondayOfCurrentWeek();
  const sun = new Date(monday);
  sun.setDate(sun.getDate() + 6);
  return sun.toISOString().split('T')[0];
};

const formatWeekRange = (start: string, end: string): string => {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.getMonth() + 1}월 ${s.getDate()}일 ~ ${e.getMonth() + 1}월 ${e.getDate()}일`;
};

const CONFIDENCE_STYLE: Record<
  'strong' | 'plausible' | 'speculative',
  { label: string; cls: string }
> = {
  strong: { label: '확신도 높음', cls: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30' },
  plausible: { label: '확신도 보통', cls: 'bg-white/[0.06] text-ink-medium border-line-subtle' },
  speculative: { label: '추정', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
};

const ConfidenceChip: React.FC<{ level: 'strong' | 'plausible' | 'speculative' }> = ({ level }) => {
  const { label, cls } = CONFIDENCE_STYLE[level];
  return (
    <span
      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}
      title={`AI 확신도: ${label}`}
    >
      {label}
    </span>
  );
};

const EvidenceBlock: React.FC<{ swing?: string[]; history?: string[] }> = ({ swing, history }) => (
  <div className="rounded-xl border border-line-subtle bg-white/[0.04] p-3 space-y-2">
    <div className="text-[10px] font-mono uppercase tracking-wider text-ink-muted">근거</div>
    {swing?.length ? (
      <ul className="space-y-1 text-xs text-ink-medium leading-relaxed">
        {swing.map((e, i) => (
          <li key={`s-${i}`} className="flex items-start gap-2">
            <span className="mt-1 w-1 h-1 rounded-full bg-emerald-500 flex-shrink-0" />
            <span>{e}</span>
          </li>
        ))}
      </ul>
    ) : null}
    {history?.length ? (
      <ul className="space-y-1 text-xs text-ink-medium leading-relaxed border-t border-line-subtle pt-2">
        {history.map((e, i) => (
          <li key={`h-${i}`} className="flex items-start gap-2">
            <span className="mt-1 w-1 h-1 rounded-full bg-ink-muted flex-shrink-0" />
            <span>이력 · {e}</span>
          </li>
        ))}
      </ul>
    ) : null}
  </div>
);

export const WeeklyInsightCard: React.FC<WeeklyInsightCardProps> = ({
  clientId,
  coachId,
  clientProfile,
  recentLogs,
  recentLessons,
  onBack,
  isFirebaseMode,
}) => {
  const [insights, setInsights] = useState<WeeklyInsight[]>(() => {
    if (isFirebaseMode) return [];
    return storageService.getWeeklyInsightsByClient(clientId);
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadedFromFirebase, setLoadedFromFirebase] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  /** Which insight is currently showing the 6a evidence sheet, if any. */
  const [evidenceFor, setEvidenceFor] = useState<WeeklyInsight | null>(null);

  const persistExemplar = async (
    insight: WeeklyInsight,
    source: 'starred' | 'dissent',
    output: string
  ) => {
    if (!coachId) return;
    const exemplar: CoachStyleExemplar = {
      id: crypto.randomUUID(),
      coachId,
      target: 'weekly_insight',
      // Input snapshot: what the model saw. Keep short to fit few-shot budget.
      input: `Weekly insight for ${clientProfile?.name ?? clientId} · week ${insight.weekStart}`,
      output,
      source,
      tier: tierForSource(source),
      reason:
        source === 'dissent'
          ? '코치가 6a 화면에서 다르게 판단'
          : '코치가 6a 화면에서 승인',
      createdAt: Date.now(),
    };
    await coachStyleService.save(exemplar, isFirebaseMode);
  };

  // Load from the active backend on mount (server API → Firebase → local).
  React.useEffect(() => {
    if (loadedFromFirebase) return;
    insightService.getWeeklyInsightsByClient(clientId).then((data) => {
      if (data.length > 0) setInsights(data);
      setLoadedFromFirebase(true);
    });
  }, [clientId, loadedFromFirebase]);

  const latestInsight = insights[0] ?? null;

  const handleGenerate = async () => {
    if (recentLogs.length === 0) return;
    setIsGenerating(true);
    try {
      const weekStart = getMondayOfCurrentWeek();
      const weekEnd = getSundayOfCurrentWeek();

      // Use logs from current week if possible, fall back to all recent logs
      const weekLogs = recentLogs.filter((l) => l.logDate >= weekStart && l.logDate <= weekEnd);
      const logsToUse = weekLogs.length > 0 ? weekLogs : recentLogs.slice(0, 7);

      const partial = await generateWeeklyInsight(logsToUse, recentLessons, clientProfile);
      const now = Date.now();
      const insight: WeeklyInsight = {
        id: crypto.randomUUID(),
        clientId,
        ...(coachId ? { coachId } : {}),
        weekStart,
        weekEnd,
        summary: partial.summary,
        keyPatterns: partial.keyPatterns,
        recommendedFocus: partial.recommendedFocus,
        // Envelope fields — persisted only when the model filled them (schema
        // makes them optional so we don't clutter the store with empty arrays).
        ...(partial.swingEvidence?.length ? { swingEvidence: partial.swingEvidence } : {}),
        ...(partial.historyEvidence?.length ? { historyEvidence: partial.historyEvidence } : {}),
        ...(partial.confidence ? { confidence: partial.confidence } : {}),
        ...(partial.caveats?.length ? { caveats: partial.caveats } : {}),
        generatedAt: now,
      };

      await insightService.saveWeeklyInsight(insight);
      setInsights((prev) => [insight, ...prev]);
    } catch (err) {
      console.error('Failed to generate weekly insight:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.08] text-ink-medium transition-colors"
          aria-label="뒤로"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="w-1 h-6 bg-gradient-to-b from-slate-600 to-slate-700 rounded-full" />
        <h2 className="text-xl font-black text-ink-high flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-500" />
          주간 AI 인사이트
        </h2>
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={isGenerating || recentLogs.length === 0}
        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl px-6 py-4 shadow-lg font-bold text-sm transition-all transform hover:scale-[1.02] active:scale-[0.98]"
      >
        {isGenerating ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            AI 분석 중...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            {latestInsight ? '이번 주 인사이트 재생성' : '이번 주 인사이트 생성'}
          </>
        )}
      </button>

      {recentLogs.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 text-center">
          💡 빠른 기록을 먼저 작성하면 AI가 주간 인사이트를 생성해줍니다!
        </div>
      )}

      {/* Latest Insight */}
      {latestInsight && (
        <div className="bg-base rounded-2xl p-5 border border-line-subtle shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full">
                {formatWeekRange(latestInsight.weekStart, latestInsight.weekEnd)}
              </span>
              {/* Confidence chip — anything below plausible reads as 추정
                  per the redesign's "확신 낮음" rule. */}
              {latestInsight.confidence && (
                <ConfidenceChip level={latestInsight.confidence} />
              )}
              {/* "왜 이 제안?" — opens the 6a evidence detail modal so
                  the coach can inspect the full envelope and either
                  endorse or dissent. Only shown when the coach can
                  actually act (coachId known) and the response carries
                  an envelope worth showing. */}
              {coachId && (latestInsight.swingEvidence?.length ||
                latestInsight.historyEvidence?.length ||
                latestInsight.confidence ||
                latestInsight.caveats?.length) ? (
                <button
                  type="button"
                  onClick={() => setEvidenceFor(latestInsight)}
                  className="text-[10px] font-bold text-emerald-200 hover:text-emerald-800 flex items-center gap-1 px-1 py-0.5"
                >
                  <Info className="w-3 h-3" /> 왜 이 제안?
                </button>
              ) : null}
            </div>
            <span className="text-[10px] text-ink-muted">
              {new Date(latestInsight.generatedAt).toLocaleDateString('ko-KR')} 생성
            </span>
          </div>

          {/* Summary */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-bold text-emerald-200">이번 주 요약</span>
            </div>
            <p className="text-sm text-ink-medium leading-relaxed">{latestInsight.summary}</p>
          </div>

          {/* Evidence — grounds the summary in specific numbers from the
              week's logs so the coach can trace each claim back to a rep. */}
          {(latestInsight.swingEvidence?.length || latestInsight.historyEvidence?.length) ? (
            <EvidenceBlock
              swing={latestInsight.swingEvidence}
              history={latestInsight.historyEvidence}
            />
          ) : null}

          {/* Key Patterns */}
          {latestInsight.keyPatterns.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <List className="w-4 h-4 text-purple-500" />
                <span className="text-xs font-bold text-purple-700">주요 패턴</span>
              </div>
              <ul className="space-y-1.5">
                {latestInsight.keyPatterns.map((pattern, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-ink-medium">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                    {pattern}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommended Focus */}
          <div className="bg-white/[0.04] rounded-xl p-3 border border-emerald-500/20">
            <div className="flex items-center gap-1.5 mb-1">
              <Target className="w-4 h-4 text-emerald-300" />
              <span className="text-xs font-bold text-emerald-200">다음 주 추천 포커스</span>
            </div>
            <p className="text-sm text-ink-medium leading-relaxed">{latestInsight.recommendedFocus}</p>
          </div>

          {/* Caveats — surfaced last so the coach reads them after the
              recommendation but before acting on it. */}
          {latestInsight.caveats?.length ? (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
              {latestInsight.caveats.map((c, i) => (
                <div key={i}>· {c}</div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* History Toggle */}
      {insights.length > 1 && (
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-emerald-300 font-bold hover:underline"
          >
            {showHistory ? '이전 인사이트 숨기기 ▲' : `이전 인사이트 보기 (${insights.length - 1}건) ▼`}
          </button>
          {showHistory && (
            <div className="mt-3 space-y-3">
              {insights.slice(1).map((insight) => (
                <div
                  key={insight.id}
                  className="bg-white/[0.04] rounded-xl p-4 border border-line-subtle shadow-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-ink-medium">
                      {formatWeekRange(insight.weekStart, insight.weekEnd)}
                    </span>
                    <span className="text-[10px] text-ink-muted">
                      {new Date(insight.generatedAt).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                  <p className="text-xs text-ink-medium leading-relaxed">{insight.summary}</p>
                  {insight.recommendedFocus && (
                    <p className="text-xs text-emerald-300 mt-2 font-medium">
                      → {insight.recommendedFocus}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {evidenceFor && (
        <EvidenceDetailModal
          claim={evidenceFor.summary}
          envelope={{
            swingEvidence: evidenceFor.swingEvidence,
            historyEvidence: evidenceFor.historyEvidence,
            confidence: evidenceFor.confidence,
            caveats: evidenceFor.caveats,
          }}
          target="weekly_insight"
          subjectLabel={
            clientProfile?.name
              ? `${clientProfile.name} · ${formatWeekRange(evidenceFor.weekStart, evidenceFor.weekEnd)}`
              : formatWeekRange(evidenceFor.weekStart, evidenceFor.weekEnd)
          }
          onAccept={() => {
            // Endorsement flows into the few-shot pool at tier 1 so future
            // weekly insights lean toward the coach's approved framing.
            void persistExemplar(evidenceFor, 'starred', evidenceFor.summary);
          }}
          onDissent={async (correction) => {
            // Store the coach's counter-take as tier-1 negative example.
            // The output field carries the correction verbatim so future
            // prompts can reference it directly.
            await persistExemplar(evidenceFor, 'dissent', correction);
          }}
          onClose={() => setEvidenceFor(null)}
        />
      )}
    </div>
  );
};
