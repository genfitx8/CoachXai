/**
 * AdminAiObservability — Dashboard for the aiCallLogger telemetry.
 *
 * Renders per-feature stats (call count, P50/P95 latency, fallback rate,
 * exemplar injection rate) and the most recent AI calls. Data source is
 * localStorage when Firebase is not initialised, Firestore otherwise —
 * the aiCallLogger's getFeatureStats / getRecentAiCalls handle the switch.
 *
 * This is a read-only dashboard; no mutations happen here.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import type { AiCallLog } from '../types';
import {
  FeatureStats,
  getFeatureStats,
  getRecentAiCalls,
} from '../services/aiCallLogger';

const FEATURE_LABELS: Record<string, string> = {
  lesson_summary: '레슨 요약',
  compare_swings: '스윙 비교',
  motion_capture_analysis: '모션 분석',
  training_program: '훈련 프로그램',
  coachx_chat: 'CoachX 채팅',
  coachx_insights: 'CoachX 인사이트',
  coachx_growth_profile: '성장 프로필',
  shot_analysis: '샷 종합 분석',
  student_chat: '회원 채팅',
  weekly_insight: '주간 인사이트',
  extract_golf_data: '이미지 → 골프 데이터',
  hole_voice_summary: '홀 음성 요약',
  analyze_body_photos: '신체 사진 분석',
  analyze_equipment_photo: '장비 사진 분석',
  swing_phase_timestamps: '스윙 단계 추출',
  golf_missions: '골프 미션',
  analyze_trackman_screen: 'Trackman 화면 추출',
  generate_system_prompt: '시스템 프롬프트 생성',
  generate_interview_question: '인터뷰 질문 생성',
};

const featureLabel = (feature: string): string =>
  FEATURE_LABELS[feature] ?? feature;

const formatMs = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const formatPercent = (frac: number): string =>
  `${(frac * 100).toFixed(1)}%`;

const formatTimestamp = (ms: number): string => {
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const statusPill = (status: AiCallLog['status']): React.ReactNode => {
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-semibold">
        <CheckCircle className="w-3 h-3" /> 성공
      </span>
    );
  }
  if (status === 'fallback') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
        <AlertTriangle className="w-3 h-3" /> 폴백
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-semibold">
      <AlertTriangle className="w-3 h-3" /> 에러
    </span>
  );
};

/** P95 above this = degraded UX (5s). Copy-paste from the roadmap doc. */
const P95_WARNING_MS = 5000;
/** Fallback rate above this = AI likely failing consistently. */
const FALLBACK_WARNING = 0.1;

interface OverallSummary {
  totalCalls: number;
  successCount: number;
  fallbackCount: number;
  errorCount: number;
  overallFallbackRate: number;
  worstP95: { feature: string; p95: number } | null;
  /** Total calls where the promptSafety scan fired. */
  injectionAttempts: number;
}

const buildOverallSummary = (stats: FeatureStats[]): OverallSummary => {
  const totalCalls = stats.reduce((s, x) => s + x.callCount, 0);
  const successCount = stats.reduce((s, x) => s + x.successCount, 0);
  const fallbackCount = stats.reduce((s, x) => s + x.fallbackCount, 0);
  const errorCount = stats.reduce((s, x) => s + x.errorCount, 0);
  const worstP95 = stats.reduce<{ feature: string; p95: number } | null>(
    (worst, x) =>
      worst == null || x.latencyP95Ms > worst.p95
        ? { feature: x.feature, p95: x.latencyP95Ms }
        : worst,
    null
  );
  const injectionAttempts = stats.reduce(
    (s, x) => s + Math.round(x.callCount * x.injectionAttemptRate),
    0
  );
  return {
    totalCalls,
    successCount,
    fallbackCount,
    errorCount,
    overallFallbackRate: totalCalls > 0 ? fallbackCount / totalCalls : 0,
    worstP95,
    injectionAttempts,
  };
};

export const AdminAiObservability: React.FC = () => {
  const [stats, setStats] = useState<FeatureStats[]>([]);
  const [recent, setRecent] = useState<AiCallLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        getFeatureStats(),
        getRecentAiCalls(50),
      ]);
      setStats(s);
      setRecent(r);
      setLoadedAt(Date.now());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => buildOverallSummary(stats), [stats]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <Activity className="w-5 h-5" /> AI 호출 관측성
        </h2>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {loadedAt && <span>로드: {formatTimestamp(loadedAt)}</span>}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>
      </div>

      {/* Overall summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5" /> 총 호출
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {summary.totalCalls.toLocaleString()}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            성공 {summary.successCount.toLocaleString()} · 폴백{' '}
            {summary.fallbackCount.toLocaleString()} · 에러{' '}
            {summary.errorCount.toLocaleString()}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> 전체 폴백률
          </div>
          <div
            className={`text-2xl font-bold mt-1 ${
              summary.overallFallbackRate > FALLBACK_WARNING
                ? 'text-red-600'
                : 'text-gray-900'
            }`}
          >
            {formatPercent(summary.overallFallbackRate)}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            임계값 {formatPercent(FALLBACK_WARNING)} 초과 시 위험
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> 최악 P95
          </div>
          <div
            className={`text-2xl font-bold mt-1 ${
              summary.worstP95 && summary.worstP95.p95 > P95_WARNING_MS
                ? 'text-red-600'
                : 'text-gray-900'
            }`}
          >
            {summary.worstP95 ? formatMs(summary.worstP95.p95) : '-'}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {summary.worstP95
              ? featureLabel(summary.worstP95.feature)
              : '데이터 없음'}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" /> 관찰 대상 기능
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {stats.length}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            호출량 순 정렬
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 col-span-2 md:col-span-4">
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" /> 프롬프트 injection 의심 요청
          </div>
          <div
            className={`text-2xl font-bold mt-1 ${
              summary.injectionAttempts > 0 ? 'text-amber-600' : 'text-gray-900'
            }`}
          >
            {summary.injectionAttempts.toLocaleString()}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            사용자 입력에서 injection 패턴이 매칭된 호출 (현재는 측정만, 차단 안 함)
          </div>
        </div>
      </div>

      {/* Per-feature stats table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="text-sm font-bold text-gray-800">기능별 통계</h3>
        </div>
        {stats.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            {loading ? '로딩 중…' : '아직 기록된 호출이 없습니다.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">기능</th>
                  <th className="px-4 py-2 text-right font-semibold">호출</th>
                  <th className="px-4 py-2 text-right font-semibold">성공/폴백/에러</th>
                  <th className="px-4 py-2 text-right font-semibold">P50</th>
                  <th className="px-4 py-2 text-right font-semibold">P95</th>
                  <th className="px-4 py-2 text-right font-semibold">폴백률</th>
                  <th className="px-4 py-2 text-right font-semibold">Cache</th>
                  <th className="px-4 py-2 text-right font-semibold">Exemplar</th>
                  <th className="px-4 py-2 text-right font-semibold">최근</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.map((s) => (
                  <tr key={s.feature} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-semibold text-gray-800">
                      {featureLabel(s.feature)}
                      <div className="text-xs text-gray-400 font-normal">
                        {s.feature}
                      </div>
                      {Object.keys(s.modelBreakdown).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {Object.entries(s.modelBreakdown)
                            .sort((a, b) => b[1] - a[1])
                            .map(([model, count]) => (
                              <span
                                key={model}
                                className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-mono"
                              >
                                {model}·{count}
                              </span>
                            ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-700">
                      {s.callCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-gray-500">
                      {s.successCount} / {s.fallbackCount} / {s.errorCount}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-700">
                      {formatMs(s.latencyP50Ms)}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-semibold ${
                        s.latencyP95Ms > P95_WARNING_MS
                          ? 'text-red-600'
                          : 'text-gray-700'
                      }`}
                    >
                      {formatMs(s.latencyP95Ms)}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-semibold ${
                        s.fallbackRate > FALLBACK_WARNING
                          ? 'text-red-600'
                          : 'text-gray-700'
                      }`}
                    >
                      {formatPercent(s.fallbackRate)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-700">
                      {formatPercent(s.cacheHitRate)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-700">
                      {formatPercent(s.exemplarInjectionRate)}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-gray-400">
                      {formatTimestamp(s.lastCallAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent calls */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="text-sm font-bold text-gray-800">
            최근 호출 (최대 50건)
          </h3>
        </div>
        {recent.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            {loading ? '로딩 중…' : '기록 없음'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">시각</th>
                  <th className="px-4 py-2 text-left font-semibold">기능</th>
                  <th className="px-4 py-2 text-left font-semibold">상태</th>
                  <th className="px-4 py-2 text-right font-semibold">latency</th>
                  <th className="px-4 py-2 text-right font-semibold">prompt / resp (자)</th>
                  <th className="px-4 py-2 text-left font-semibold">모델</th>
                  <th className="px-4 py-2 text-left font-semibold">플래그</th>
                  <th className="px-4 py-2 text-left font-semibold">해시</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recent.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {formatTimestamp(r.createdAt)}
                    </td>
                    <td className="px-4 py-2 text-gray-800 font-medium">
                      {featureLabel(r.feature)}
                    </td>
                    <td className="px-4 py-2">{statusPill(r.status)}</td>
                    <td className="px-4 py-2 text-right text-gray-700">
                      {formatMs(r.latencyMs)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500 text-xs">
                      {r.promptLength.toLocaleString()} /{' '}
                      {r.responseLength.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {r.model ?? <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {r.injectionSuspected && (
                        <span
                          className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 mr-1"
                          title={
                            r.injectionMatches
                              ? `patterns: ${r.injectionMatches}`
                              : undefined
                          }
                        >
                          injection?
                        </span>
                      )}
                      {r.cached && (
                        <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 mr-1">
                          cached
                        </span>
                      )}
                      {r.hasExemplars && (
                        <span className="inline-block px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 mr-1">
                          few-shot
                        </span>
                      )}
                      {r.hasSchema && (
                        <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                          schema
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-400">
                      {r.promptHash}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
