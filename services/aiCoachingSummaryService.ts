/**
 * AI coaching report — cross-references on-video swing metrics with the
 * student's historical shot / practice data.
 *
 * This is the piece that separates us from every other smartphone swing
 * analyzer: they read pose in isolation ("your X-Factor is 45°"), we read
 * pose against context ("your X-Factor dropped 5° while your carry
 * distance is down 8m over the last 3 lessons — likely the same root
 * cause"). Every insight is required to cite at least one datapoint, so
 * the model can't drift into generic prose.
 */

import { createLogger } from '../utils/logger';
import type { Lesson } from '../types';
import type { SwingAnalysis, SwingEventName } from '../types/swingAnalysis';
import type { SwingFault } from '../types/swingFault';
import type { AICoachingReport } from '../types/aiCoachingReport';
import { formatLessonEntry } from './lessonContext';
import { invokeBackendAI, getResponseText } from './geminiService';

const log = createLogger('aiCoachingSummaryService');

const EVENT_LABELS: Record<SwingEventName, string> = {
  address: '어드레스',
  takeaway: '백스윙 시작',
  half_backswing: '하프 백스윙',
  top: '백스윙 톱',
  mid_downswing: '다운스윙 중간',
  impact: '임팩트',
  follow_through: '팔로우 스루',
  finish: '피니시',
};

const round = (v: number | undefined, digits = 1): string =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—';

/**
 * Compact, prompt-friendly summary of the pose analysis. Human-readable so
 * the model can quote numbers back verbatim in the report.
 */
export function formatSwingAnalysisForPrompt(analysis: SwingAnalysis): string {
  const { summary, events, warnings, sampledFps, nativeFps } = analysis;
  const lines: string[] = [];
  lines.push(
    `[스윙 지표]`,
    `- 촬영 각도: ${
      summary.cameraView === 'face_on' ? '정면' :
      summary.cameraView === 'down_the_line' ? '측면' : '불명확'
    }${summary.cameraViewDetected ? ` (자동감지 ${summary.cameraViewDetected} 와 상이)` : ''}`,
    `- 핸디드니스: ${summary.handedness ?? '알 수 없음'}`,
    `- 샘플링: ${round(sampledFps, 0)}fps${nativeFps ? ` (원본 ${nativeFps}fps)` : ''}`,
    `- 백스윙/다운스윙: ${summary.backswingMs ?? '—'}ms / ${summary.downswingMs ?? '—'}ms (템포비 ${round(summary.tempoRatio, 2)})`,
  );
  if (summary.swingPlaneAngleCorrected != null || summary.swingPlaneAngle != null) {
    const plane = summary.swingPlaneAngleCorrected ?? summary.swingPlaneAngle;
    lines.push(`- 스윙 플레인 각도: ${round(plane, 1)}° ${summary.gravityAligned ? '(중력 정렬)' : ''}`);
  }
  if (summary.attackAngle != null) {
    lines.push(`- 어택 앵글: ${round(summary.attackAngle, 1)}°`);
  }

  // Kinetic sequence — the pro-level bit. Include peak ordering when
  // available so the model can call out reverse / simultaneous firing.
  const ks = summary.kineticSequence;
  if (ks) {
    lines.push(`- 키네틱 시퀀스 순서: ${ks.order}${ks.peakSpanMs != null ? ` (span ${ks.peakSpanMs}ms)` : ''}`);
    if (ks.pelvis) lines.push(`  · 골반 피크 ${round(ks.pelvis.peakValue, 0)}deg/s @ Top${round(ks.pelvis.msFromTop, 0)}ms`);
    if (ks.torso) lines.push(`  · 상체 피크 ${round(ks.torso.peakValue, 0)}deg/s @ Top${round(ks.torso.msFromTop, 0)}ms`);
    if (ks.leadArm) lines.push(`  · 리드 암 피크 ${round(ks.leadArm.peakValue, 0)}deg/s @ Top${round(ks.leadArm.msFromTop, 0)}ms`);
    if (ks.hands) lines.push(`  · 손/클럽 피크 ${round(ks.hands.peakValue, 2)} @ Top${round(ks.hands.msFromTop, 0)}ms`);
  }

  // Per-pose rotation from address + key impact diagnostics.
  lines.push('', '[7단계 포즈 지표]');
  const order: SwingEventName[] = [
    'address', 'half_backswing', 'top', 'mid_downswing',
    'impact', 'follow_through', 'finish',
  ];
  for (const name of order) {
    const evt = events[name];
    if (!evt) continue;
    const m = evt.metrics;
    const bits: string[] = [`${EVENT_LABELS[name]} (t=${evt.t.toFixed(2)}s)`];
    if (typeof m.shoulderRotationFromAddress === 'number') {
      bits.push(`어깨회전 ${round(m.shoulderRotationFromAddress, 0)}°`);
    }
    if (typeof m.pelvisRotationFromAddress === 'number') {
      bits.push(`골반회전 ${round(m.pelvisRotationFromAddress, 0)}°`);
    }
    if (typeof m.hipShoulderSeparationFromAddress === 'number') {
      bits.push(`X-Factor ${round(m.hipShoulderSeparationFromAddress, 0)}°`);
    }
    if (name === 'address') {
      if (typeof m.spineTiltCorrected === 'number' || typeof m.spineTilt3D === 'number') {
        bits.push(`척추 ${round(m.spineTiltCorrected ?? m.spineTilt3D, 1)}°`);
      }
      if (typeof m.kneeFlex === 'number') {
        bits.push(`무릎 ${round(m.kneeFlex, 0)}°`);
      }
    }
    if (name === 'impact') {
      if (typeof m.headSwayMm === 'number') bits.push(`머리스웨이 ${round(m.headSwayMm, 0)}mm`);
      if (typeof m.earlyExtensionMm === 'number') bits.push(`얼리익스텐션 ${round(m.earlyExtensionMm, 0)}mm`);
      if (typeof m.spineTiltDelta === 'number') bits.push(`척추Δ ${round(m.spineTiltDelta, 1)}°`);
    }
    lines.push(`- ${bits.join(' | ')}`);
  }

  if (warnings.length) {
    lines.push('', '[분석 경고]', ...warnings.map((w) => `- ${w}`));
  }
  return lines.join('\n');
}

/**
 * Faults from the deterministic rule engine. The AI treats these as
 * anchors — it has to acknowledge each detected fault (agree, refine, or
 * explicitly override with reasoning) rather than silently ignoring them.
 */
function formatFaultsForPrompt(faults: SwingFault[]): string {
  if (faults.length === 0) return '[결점 감지]\n- (감지된 결점 없음)';
  const lines: string[] = ['[결점 감지]'];
  for (const f of faults) {
    const sev = f.severity === 'major' ? '⚠️ 심각' : f.severity === 'minor' ? '주의' : '참고';
    const ev = f.evidence.length > 0 ? ` · ${f.evidence.join(' | ')}` : '';
    lines.push(`- ${f.title} [${sev}]${ev} — ${f.description}`);
  }
  return lines.join('\n');
}

/**
 * Format the last N lessons via the shared formatter so the coach chat
 * and this feature stay in lockstep on what "context" looks like.
 */
function formatLessonHistoryForPrompt(lessons: Lesson[], limit = 6): string {
  const recent = [...lessons]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
  if (recent.length === 0) return '';
  const blocks = recent.map((l) => formatLessonEntry(l));
  return `[학생 최근 이력 (최근순, ${recent.length}건)]\n${blocks.join('\n\n')}`;
}

/**
 * Trend hint from recent shot data — carry / launch / spin drift. Purely
 * mechanical (no AI): if the model needs a trend, we compute it and hand
 * it over so the report can cite it directly.
 */
function computeShotTrend(lessons: Lesson[]): string {
  const withCarry = lessons
    .filter((l) => l.golfData?.carryDistance != null)
    .sort((a, b) => a.createdAt - b.createdAt);
  if (withCarry.length < 3) return '';
  const midpoint = Math.floor(withCarry.length / 2);
  const early = withCarry.slice(0, midpoint);
  const late = withCarry.slice(-midpoint);
  const mean = (arr: Lesson[]): number =>
    arr.reduce((s, l) => s + (l.golfData!.carryDistance ?? 0), 0) / arr.length;
  const delta = mean(late) - mean(early);
  if (Math.abs(delta) < 3) return '';
  const dir = delta > 0 ? '증가' : '감소';
  return `[샷 트렌드]\n- 캐리 거리 ${Math.round(Math.abs(delta))}m ${dir} (초반 ${early.length}건 평균 vs 최근 ${late.length}건 평균)`;
}

/** JSON schema hint for the model to follow. Kept compact for token cost. */
const RESPONSE_SCHEMA_HINT = `
반드시 아래 JSON 스키마로만 응답하라. 다른 텍스트 금지.

{
  "headline": "코치가 레슨 시작할 때 말할 한 줄 요약",
  "trend": "improving" | "steady" | "regressing" | "insufficient_data",
  "insights": [
    {
      "title": "짧은 제목",
      "observation": "코치용 한 문장 관찰",
      "swingEvidence": ["지표 근거 (숫자 인용)", "..."],
      "historyEvidence": ["이력 근거 (숫자 인용)", "..."],
      "correlationConfidence": "strong" | "plausible" | "speculative",
      "recommendation": "선택 - 드릴/큐"
    }
  ],
  "nextLessonFocus": ["다음 레슨 우선순위 1", "2", "3"],
  "caveats": ["신뢰도가 낮은 지점", "..."]
}

규칙:
- insights 는 최대 5개. 우선순위(코치가 즉시 다뤄야 할 것) 순.
- 각 insight 의 swingEvidence 는 반드시 1개 이상, 실제 숫자를 그대로 인용 (예: "임팩트 얼리익스텐션 62mm").
- historyEvidence 는 학생 이력에 근거가 있을 때만 채운다. 없으면 [] 로 둔다.
- 이력 데이터가 없거나 스윙 지표만으로는 부족하면 caveats 에 명시.
- 결점이 감지됐다면 반드시 대응하는 insight 를 만든다 (동의/보정/기각).
- 추측하지 마라. 근거가 없으면 "insufficient_data" trend + 관련 caveat.
`.trim();

export interface GenerateSwingCoachingReportOptions {
  /** Recent lessons of the same student, most-recent-first order preferred but not required. */
  lessons?: Lesson[];
  /** Deterministic fault-engine output to anchor the AI on. */
  faults?: SwingFault[];
  /** Coach's own note captured with this analysis, if any. */
  coachNote?: string;
  /** Coach id — used to select the correct system prompt. */
  coachId?: string;
}

/**
 * Parse the model output into our typed shape. Falls back to a
 * best-effort skeleton when JSON is malformed so the UI can still render
 * *something* rather than a blank error.
 */
function parseCoachingReport(raw: string, usedHistory: boolean): AICoachingReport {
  const now = new Date().toISOString();
  let parsed: Partial<AICoachingReport> | null = null;
  // Strip common preambles ("Here is your report:", ``` fences, etc.).
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract the first {...} block.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    return {
      headline: 'AI 리포트 생성에 실패했습니다. 원본 스윙 지표를 참고해 주세요.',
      insights: [],
      nextLessonFocus: [],
      caveats: ['모델 응답을 파싱할 수 없어 기본 리포트로 대체됨.'],
      generatedAt: now,
      usedHistory,
    };
  }
  return {
    headline: typeof parsed.headline === 'string' ? parsed.headline : '리포트 요약이 비어 있습니다.',
    trend: parsed.trend as AICoachingReport['trend'],
    insights: Array.isArray(parsed.insights)
      ? parsed.insights.map((i) => ({
          title: String(i.title ?? ''),
          observation: String(i.observation ?? ''),
          swingEvidence: Array.isArray(i.swingEvidence) ? i.swingEvidence.map(String) : [],
          historyEvidence: Array.isArray(i.historyEvidence) ? i.historyEvidence.map(String) : [],
          correlationConfidence:
            i.correlationConfidence === 'strong' ||
            i.correlationConfidence === 'plausible' ||
            i.correlationConfidence === 'speculative'
              ? i.correlationConfidence
              : 'speculative',
          recommendation: typeof i.recommendation === 'string' ? i.recommendation : undefined,
        }))
      : [],
    nextLessonFocus: Array.isArray(parsed.nextLessonFocus) ? parsed.nextLessonFocus.map(String) : [],
    caveats: Array.isArray(parsed.caveats) ? parsed.caveats.map(String) : [],
    generatedAt: now,
    usedHistory,
  };
}

/**
 * Main entry point. Composes the swing analysis, deterministic faults,
 * and student history into a single prompt and returns a typed report.
 * Falls through cleanly when there's no history — the report just won't
 * cite historyEvidence.
 */
export async function generateSwingCoachingReport(
  analysis: SwingAnalysis,
  options: GenerateSwingCoachingReportOptions = {},
): Promise<AICoachingReport> {
  const { lessons = [], faults = [], coachNote, coachId } = options;
  const usedHistory = lessons.length > 0;

  const promptSections: string[] = [
    formatSwingAnalysisForPrompt(analysis),
    formatFaultsForPrompt(faults),
  ];
  const trendLine = computeShotTrend(lessons);
  if (trendLine) promptSections.push(trendLine);
  const history = formatLessonHistoryForPrompt(lessons);
  if (history) promptSections.push(history);
  if (coachNote) promptSections.push(`[코치 즉석 메모]\n${coachNote}`);
  promptSections.push(RESPONSE_SCHEMA_HINT);

  const prompt = promptSections.join('\n\n');

  const systemInstruction =
    '당신은 한국어 골프 코치입니다. 스윙 자세 분석 지표와 학생의 최근 샷/레슨 데이터를 ' +
    '함께 참고해서 짧고 근거 있는 코칭 리포트를 만듭니다. 반드시 숫자를 인용하고, ' +
    '근거가 없으면 speculative 로 표시하거나 caveats 에 넣으세요. 절대 지어내지 마세요.';

  try {
    const result = await invokeBackendAI<unknown>('swing_coaching_report', {
      prompt,
      systemInstruction,
      // Force JSON output — the parser is strict and this saves us from
      // stripping markdown fences 90% of the time.
      responseMimeType: 'application/json',
      coachId,
    });
    const text = getResponseText(result);
    if (!text) throw new Error('AI 응답이 비어 있습니다.');
    return parseCoachingReport(text, usedHistory);
  } catch (error) {
    log.error('AI coaching report failed', error);
    return {
      headline: 'AI 코칭 리포트를 생성하지 못했습니다.',
      insights: [],
      nextLessonFocus: [],
      caveats: [
        error instanceof Error
          ? `백엔드 호출 실패: ${error.message}`
          : '백엔드 호출 실패.',
      ],
      generatedAt: new Date().toISOString(),
      usedHistory,
    };
  }
}

/** Testing helpers. */
export const __testing__ = {
  formatSwingAnalysisForPrompt,
  formatFaultsForPrompt,
  formatLessonHistoryForPrompt,
  computeShotTrend,
  parseCoachingReport,
};
