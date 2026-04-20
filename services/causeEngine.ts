export type CauseEngineLanguage = 'ko' | 'en' | 'ja' | 'th';

export interface CauseAnalysis {
  title: string;
  intro: string;
  causeHeading: string;
  causes: string[];
  drillHeading: string;
  drills: string[];
  footnote: string;
}

const SLICE_ANALYSIS: Record<'ko' | 'en' | 'ja', CauseAnalysis> = {
  en: {
    title: 'Slice Correction Guide',
    intro: 'Common causes and correction approach:',
    causeHeading: 'Root causes',
    causes: [
      'Open club face at impact',
      'Out-to-in club path',
      'Excessive grip pressure',
    ],
    drillHeading: 'Correction drills',
    drills: [
      'Gate drill – train an in-to-in path',
      'Grip check – transition from weak to neutral grip',
      'Weight-shift drill – reinforce transfer to lead foot',
    ],
    footnote: '*Slice issues are often correctable within 3–5 focused lessons.*',
  },
  ja: {
    title: 'スライス矯正ガイド',
    intro: '主な原因と矯正アプローチ:',
    causeHeading: '根本原因',
    causes: [
      'インパクト時のオープンフェース',
      'アウト-インのクラブパス',
      'グリッププレッシャー過多',
    ],
    drillHeading: '矯正ドリル',
    drills: [
      'ゲートドリル – イン-インパスのトレーニング',
      'グリップチェック – ウィークグリップ → ニュートラルグリップ',
      '体重移動練習 – 左足への移動強化',
    ],
    footnote: '*スライスは3〜5回の集中レッスンで矯正可能なことが多いです。*',
  },
  ko: {
    title: '슬라이스 교정 가이드',
    intro: '슬라이스의 주요 원인과 교정 방법:',
    causeHeading: '원인 분석',
    causes: [
      '오픈 클럽 페이스 (임팩트 시)',
      '아웃-인 클럽패스',
      '그립 압력 과다',
    ],
    drillHeading: '교정 드릴',
    drills: [
      '게이트 드릴 – 인-인 패스 훈련',
      '그립 체크 – 약한 그립 → 중립 그립',
      '체중이동 연습 – 왼발로의 이동 강화',
    ],
    footnote: '*슬라이스는 3~5회 집중 레슨으로 교정 가능한 경우가 많습니다.*',
  },
};

function getSliceLanguage(language: CauseEngineLanguage): 'ko' | 'en' | 'ja' {
  if (language === 'en') return 'en';
  if (language === 'ja') return 'ja';
  // Preserve existing behaviour: unsupported language variants fall back to Korean.
  return 'ko';
}

export function deriveCause(
  userMessage: string,
  language: CauseEngineLanguage = 'ko'
): CauseAnalysis | null {
  const msg = userMessage.toLowerCase();
  const isSlice = msg.includes('슬라이스') || msg.includes('slice') || msg.includes('スライス');
  if (!isSlice) return null;
  return SLICE_ANALYSIS[getSliceLanguage(language)];
}

export function formatCauseGuide(analysis: CauseAnalysis): string {
  return `🎯 **${analysis.title}**\n\n${analysis.intro}\n\n**${analysis.causeHeading}:**\n` +
    analysis.causes.map(cause => `• ${cause}`).join('\n') +
    `\n\n**${analysis.drillHeading}:**\n` +
    analysis.drills.map((drill, i) => `${i + 1}. ${drill}`).join('\n') +
    `\n\n> ${analysis.footnote}`;
}
