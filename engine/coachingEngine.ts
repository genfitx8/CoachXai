import type { DeterministicSwingAnalysis } from './analysisEngine';
import { buildCoachXSystemPrompt } from '../prompts/systemPrompt';
import { buildCoachXCoachingPrompt } from '../prompts/coachingPrompt';

export type CoachXPromptLanguage = 'en' | 'ko' | 'ja' | 'th';

export interface CoachXExplanationModel {
  generate: (input: { systemPrompt: string; userPrompt: string }) => Promise<string>;
}

export interface CoachingFeedbackResult {
  text: string;
  llmUsed: boolean;
}

export interface CoachingFeedbackInput {
  analysis: DeterministicSwingAnalysis;
  language?: CoachXPromptLanguage;
  model?: CoachXExplanationModel;
}

export const buildDeterministicCoachingFallback = (
  analysis: DeterministicSwingAnalysis,
  language: CoachXPromptLanguage = 'en'
): string => {
  const topCause = analysis.rootCauses[0];
  const fallbackEn = [
    '## Ball Flight Diagnosis',
    `- Pattern: ${analysis.classification.pattern}`,
    `- Start line: ${analysis.classification.startDirection}; curvature: ${analysis.classification.curvatureMagnitude} ${analysis.classification.curvatureDirection}`,
    `- Launch window: ${analysis.ballFlight.launchWindow}; distance efficiency: ${analysis.ballFlight.distanceEfficiencyScore}/100`,
    '',
    '## Biomechanical Root Causes',
    topCause
      ? `- Primary: ${topCause.title} (confidence ${topCause.confidence.toFixed(2)})`
      : '- No dominant primary cause. Track strike consistency over more swings.',
    ...analysis.rootCauses.slice(1, 3).map((cause) => `- Secondary: ${cause.title} (confidence ${cause.confidence.toFixed(2)})`),
    '',
    '## Priority Coaching Plan',
    '- Drill 1: Start-line gate (5 balls x 3 sets), pass criterion: 70% through center gate.',
    '- Drill 2: Face-to-path rehearsal (slow-motion to full-speed ladder).',
    '- Drill 3: Attack-angle checkpoint with tee-height / ball-position progression.',
  ].join('\n');

  if (language === 'ko') {
    return [
      '## 탄도 진단',
      `- 패턴: ${analysis.classification.pattern}`,
      `- 출발 방향: ${analysis.classification.startDirection}, 곡률: ${analysis.classification.curvatureMagnitude} ${analysis.classification.curvatureDirection}`,
      `- 발사 창: ${analysis.ballFlight.launchWindow}, 거리 효율: ${analysis.ballFlight.distanceEfficiencyScore}/100`,
      '',
      '## 생체역학 루트 원인',
      topCause
        ? `- 1순위: ${topCause.title} (신뢰도 ${topCause.confidence.toFixed(2)})`
        : '- 지배적인 1순위 원인이 없습니다. 스트라이크 일관성을 추가 추적하세요.',
      ...analysis.rootCauses.slice(1, 3).map((cause) => `- 보조 원인: ${cause.title} (신뢰도 ${cause.confidence.toFixed(2)})`),
      '',
      '## 우선 코칭 플랜',
      '- 드릴 1: 출발선 게이트 드릴 (5구 x 3세트), 기준: 70% 중앙 통과.',
      '- 드릴 2: 페이스-패스 동기화 슬로우모션 래더 드릴.',
      '- 드릴 3: 어택앵글 체크(볼 위치/티 높이 단계화).',
    ].join('\n');
  }

  return fallbackEn;
};

export const generateCoachingFeedback = async ({
  analysis,
  language = 'en',
  model,
}: CoachingFeedbackInput): Promise<CoachingFeedbackResult> => {
  if (!model) {
    return { text: buildDeterministicCoachingFallback(analysis, language), llmUsed: false };
  }

  const systemPrompt = buildCoachXSystemPrompt(language);
  const userPrompt = buildCoachXCoachingPrompt(analysis);

  try {
    const text = await model.generate({ systemPrompt, userPrompt });
    const trimmed = text.trim();
    if (!trimmed) {
      return { text: buildDeterministicCoachingFallback(analysis, language), llmUsed: false };
    }
    return { text: trimmed, llmUsed: true };
  } catch {
    return { text: buildDeterministicCoachingFallback(analysis, language), llmUsed: false };
  }
};
