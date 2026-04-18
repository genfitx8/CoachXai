/**
 * CoachX Intelligence Service
 *
 * Provides heuristic-driven insights for coaches based on lesson records.
 * Designed to be extensible: when a live AI backend is available, swap
 * `generateHeuristicResponse` for a real LLM call without changing callers.
 */

import { Lesson, ClientProfile, CoachProfile } from '../types';

export type CoachXLanguage = 'ko' | 'en' | 'ja';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CoachXInsight {
  type: 'pattern' | 'attention' | 'curriculum' | 'coach_growth' | 'stagnation';
  title: string;
  body: string;
  icon: string;
}

/**
 * Trend computed from lesson history progression.
 * - improving  : recent topics diversifying; earlier repeated issues no longer dominant
 * - plateau    : same issues recurring with no sign of resolution over several lessons
 * - new        : fewer than 3 recorded lessons — insufficient data
 * - inactive   : more than 45 days since last lesson
 */
export type MemberTrend = 'improving' | 'plateau' | 'new' | 'inactive';

export interface MemberGrowthReport {
  clientName: string;
  clientPhone: string;
  lessonCount: number;
  recentTopics: string[];
  repeatedIssues: string[];
  strengths: string[];
  suggestedNextLesson: string;
  /** 3-session short-term plan (kept for backwards compatibility) */
  curriculumPlan: string[];
  /** Extended 5-session curriculum covering short + medium term */
  curriculumPlan5: string[];
  /** Heuristically derived practice drills matching repeated issues */
  drillSuggestions: string[];
  attentionLevel: 'high' | 'medium' | 'low';
  /** Growth trend derived from lesson progression */
  trendIndicator: MemberTrend;
  /** ISO date string of the most recent lesson, or null if no lessons */
  lastLessonDate: string | null;
  /** Integer days since the most recent lesson (0 = today), or null if no lessons recorded */
  daysSinceLastLesson: number | null;

  // ── PR #108: deeper growth analytics ──────────────────────────────────────

  /**
   * Composite growth score from 0–100.
   * Factors: lesson frequency, trend direction, issue resolution, cadence consistency.
   * Suitable for quick at-a-glance comparison across members.
   */
  growthScore: number;

  /**
   * Fraction (0–1) of early-lesson issues that no longer appear as dominant topics
   * in the most recent lessons.  1.0 = all early issues resolved; 0 = none resolved.
   */
  issueResolutionRate: number;

  /**
   * Average number of days between consecutive lessons, or null when fewer than
   * 2 lessons have been recorded.
   */
  lessonCadence: number | null;

  /**
   * Topic progression comparison between the earliest and most-recent lessons.
   * Useful for showing a coach how a member's focus areas have evolved.
   */
  topicProgressionStages: {
    /** Top topics from the first half of all recorded lessons */
    early: string[];
    /** Top topics from the second (most recent) half of all recorded lessons */
    recent: string[];
  };

  /**
   * Lesson counts for each of the last 8 calendar weeks (oldest → newest).
   * Index 0 = 7 weeks ago, index 7 = current week.
   */
  weeklyActivity: { weekLabel: string; count: number }[];
}

export interface CoachXChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/** One entry in the topic-frequency breakdown for the coach growth profile. */
export interface TopicStat {
  topic: string;
  count: number;
  percentage: number;
}

/**
 * Structured coach growth analytics derived from all lesson records.
 * Used to power the Coach Growth tab in CoachXHub.
 */
export interface CoachGrowthProfile {
  /** Lesson count in the current calendar month */
  lessonsThisMonth: number;
  /** Lesson count in the previous calendar month */
  lessonsLastMonth: number;
  /** Members with at least one lesson in the last 90 days */
  activeMembersCount: number;
  /** Average lessons per active member in the last 90 days (rounded to 1 dp) */
  avgSessionsPerActiveMember: number;
  /** Top lesson topics sorted by frequency, with percentage of total lessons */
  topicBreakdown: TopicStat[];
  /** Topic names the coach teaches most frequently (top 3) */
  teachingStrengths: string[];
  /** Golf areas rarely covered – potential coaching expansion areas */
  growthOpportunities: string[];
  /** Distribution of member growth trends */
  memberTrends: { improving: number; plateau: number; new: number; inactive: number };
  /**
   * Supportive, action-oriented growth suggestions for the coach.
   * Tone: "this could help" rather than "you are lacking".
   */
  recommendedActions: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract recurring keywords from lesson titles / coachNotes / tags */
function extractTopics(lessons: Lesson[]): string[] {
  const keywords = [
    '슬라이스', '훅', '어드레스', '셋업', '그립', '스탠스',
    '백스윙', '다운스윙', '임팩트', '피니쉬', '체중이동',
    '클럽패스', '페이스각', '퍼팅', '어프로치', '드라이버',
    '아이언', '웨지', '쇼트게임', '탑', '리듬',
    'slice', 'hook', 'address', 'grip', 'backswing', 'impact',
    'weight shift', 'driver', 'iron', 'wedge', 'putting',
  ];
  const counts: Record<string, number> = {};
  for (const lesson of lessons) {
    const text = `${lesson.title} ${lesson.coachNotes ?? ''} ${(lesson.tags ?? []).join(' ')}`.toLowerCase();
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) {
        counts[kw] = (counts[kw] ?? 0) + 1;
      }
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([kw]) => kw);
}

/** Days since ISO date string */
function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

/** Label for attention level based on lesson frequency */
function attentionLevel(lessonCount: number, daysSinceLast: number): 'high' | 'medium' | 'low' {
  if (lessonCount >= 3 && daysSinceLast <= 14) return 'high';
  if (lessonCount >= 1 && daysSinceLast <= 30) return 'medium';
  return 'low';
}

/**
 * Derive a member's growth trend by comparing topics from early lessons
 * to the most recent lessons.
 *
 * - inactive : more than 45 days without a lesson
 * - new      : fewer than 3 lessons recorded
 * - plateau  : the dominant issue from early sessions is still the dominant
 *              issue in recent sessions AND accounts for ≥60 % of recent content
 * - improving: none of the above; topic variety is increasing or early issues
 *              are no longer top-of-mind in recent lessons
 */
function deriveTrend(
  sortedLessons: Lesson[], // newest-first
  daysSinceLast: number
): MemberTrend {
  if (daysSinceLast > 45) return 'inactive';
  if (sortedLessons.length < 3) return 'new';

  const recent = sortedLessons.slice(0, Math.ceil(sortedLessons.length / 2));
  const early  = sortedLessons.slice(Math.floor(sortedLessons.length / 2));

  const recentTopics = extractTopics(recent);
  const earlyTopics  = extractTopics(early);

  if (earlyTopics.length === 0 || recentTopics.length === 0) return 'improving';

  // Plateau: the top early issue is still the top recent issue
  const topEarlyIssue  = earlyTopics[0];
  const topRecentIssue = recentTopics[0];
  if (topEarlyIssue === topRecentIssue) {
    // Only flag plateau if this topic dominates recent lessons (≥60 % coverage)
    const topIssueLower = topEarlyIssue.toLowerCase();
    const recentCoverage = recent.filter(l => {
      const text = `${l.title} ${l.coachNotes ?? ''} ${(l.tags ?? []).join(' ')}`.toLowerCase();
      return text.includes(topIssueLower);
    }).length / recent.length;
    if (recentCoverage >= 0.6) return 'plateau';
  }

  return 'improving';
}

/**
 * Map a swing issue keyword to a heuristic drill suggestion.
 * Returns an English-neutral format; callers can localise if needed.
 */
function drillsForIssue(issue: string): string[] {
  const i = issue.toLowerCase();
  if (i === '슬라이스' || i === 'slice')
    return ['Gate drill (in-to-in path)', 'Towel-under-arm drill', 'Slow-motion half-swing'];
  if (i === '훅' || i === 'hook')
    return ['Open-face alignment check', 'Weak-grip adjustment drill', 'Wall drill'];
  if (i.includes('체중') || i.includes('weight'))
    return ['Step-drill (step into impact)', 'Feet-together balance drill', 'Pressure-plate awareness drill'];
  if (i === '어드레스' || i === '셋업' || i === 'address')
    return ['Mirror check (spine angle, ball position)', 'Alignment-stick setup drill', '5-point pre-shot routine'];
  if (i === '그립' || i === 'grip')
    return ['Neutral grip re-check (3 knuckle)', 'Pressure-point awareness (3+4 fingers)', 'Grip-change practice routine'];
  if (i === '임팩트' || i === 'impact')
    return ['Impact-bag drill', 'Pause-at-top slow drill', 'Lead-hand release drill'];
  if (i === '퍼팅' || i === 'putting')
    return ['Gate putting drill', 'Metronome rhythm putting', 'One-handed putting feel drill'];
  if (i === '어프로치' || i === 'approach' || i === 'wedge' || i === '웨지')
    return ['Landing-zone chip drill', 'Spin & stop control drill', 'Uphill/downhill lie practice'];
  if (i === '백스윙' || i === 'backswing')
    return ['One-piece takeaway drill', 'Hip-rotation check drill', 'Pause-at-top tempo drill'];
  if (i === '클럽패스' || i === 'club path' || i === 'clubpath')
    return ['Tee-line path drill', 'Headcover drill (in-to-out path)', 'Impact tape analysis'];
  return ['Slow-motion rehearsal swing', 'Video-feedback session', 'Targeted repetition drill (×50)'];
}

/**
 * Build a 5-session curriculum from topic data and repeated issues.
 * Sessions are framed as supportive teaching opportunities, not prescriptive fixes.
 */
function buildCurriculum5(
  recentTopics: string[],
  repeatedIssues: string[],
  trend: MemberTrend,
  language: CoachXLanguage = 'ko'
): string[] {
  const DEFAULT_TOPICS: Record<CoachXLanguage, [string, string, string]> = {
    ko: ['어드레스 & 셋업', '임팩트 감각', '클럽패스'],
    en: ['Address & Setup', 'Impact Feel', 'Club Path'],
    ja: ['アドレス & セットアップ', 'インパクト感覚', 'クラブパス'],
  };
  const [d0, d1, d2] = DEFAULT_TOPICS[language];
  const t0 = recentTopics[0] ?? d0;
  const t1 = recentTopics[1] ?? d1;
  const t2 = recentTopics[2] ?? d2;
  const issue = repeatedIssues[0] ?? t0;

  if (language === 'ja') {
    if (trend === 'inactive') {
      return [
        `第1回: 再参加 – セットアップとリズムを再確立 (${t0})`,
        `第2回: 基礎パターン復習 – ${issue} チェックイン`,
        `第3回: 再活性化ドリル – ハーフスイング安定化 (${t1})`,
        `第4回: コース転換 – 実践シミュレーション`,
        `第5回: 目標再設定 – 新カリキュラム設計`,
      ];
    }
    if (trend === 'plateau') {
      return [
        `第1回: ${issue} 新アプローチ – 代替ドリルを試す`,
        `第2回: ${t1} 導入 – 繰り返しフォーカスの転換`,
        `第3回: クロストレーニング – ${t2} 探索`,
        `第4回: 統合レッスン – ${issue} 改善とフルスイング連携`,
        `第5回: 測定レッスン – ボールデータで進捗確認`,
      ];
    }
    return [
      `第1回: ${t0} 深化 – ドリルで最近の成果を強化`,
      `第2回: ${t1} 拡張 – 成長モメンタムを維持`,
      `第3回: ${t0} + ${t1} 連携 – 統合動作パターン`,
      `第4回: ${t2} 導入 – 次の発展エリア`,
      `第5回: コース応用 – 実践転換レッスン`,
    ];
  }

  if (language === 'ko') {
    if (trend === 'inactive') {
      return [
        `1회차: 재참여 레슨 – 셋업과 리듬 재정립 (${t0})`,
        `2회차: 기초 패턴 복습 – ${issue} 체크인`,
        `3회차: 재활성화 드릴 – 하프스윙 안정화 (${t1})`,
        `4회차: 필드 전환 – 코스 시뮬레이션`,
        `5회차: 목표 재설정 – 새 커리큘럼 설계`,
      ];
    }
    if (trend === 'plateau') {
      return [
        `1회차: ${issue} 새로운 접근법 – 대안 드릴 시도`,
        `2회차: ${t1} 도입 – 반복 초점 전환`,
        `3회차: 크로스 트레이닝 – ${t2} 탐색`,
        `4회차: 통합 레슨 – ${issue} 개선과 풀스윙 연결`,
        `5회차: 측정 레슨 – 볼 데이터로 진도 확인`,
      ];
    }
    return [
      `1회차: ${t0} 심화 – 최근 성과를 드릴로 강화`,
      `2회차: ${t1} 확장 – 성장 모멘텀 유지`,
      `3회차: ${t0} + ${t1} 연결 – 통합 동작 패턴`,
      `4회차: ${t2} 도입 – 다음 발전 영역`,
      `5회차: 필드 응용 – 실전 전환 레슨`,
    ];
  }

  // English (default)
  if (trend === 'inactive') {
    return [
      `Session 1: Re-introduction – re-establish setup and rhythm (${t0})`,
      `Session 2: Revisit foundational patterns – ${issue} check-in`,
      `Session 3: Reactivation drill – half-swing consistency (${t1})`,
      `Session 4: Course-transfer focus – on-course simulation`,
      `Session 5: Goal-setting & new curriculum design`,
    ];
  }

  if (trend === 'plateau') {
    return [
      `Session 1: Fresh perspective on ${issue} – try alternative drill approach`,
      `Session 2: Introduce ${t1} to break repetitive focus`,
      `Session 3: Cross-training – ${t2} exploration`,
      `Session 4: Integration – combine ${issue} improvement with full swing`,
      `Session 5: Measurement – track ball-flight data to validate progress`,
    ];
  }

  return [
    `Session 1: Deepen ${t0} – reinforce recent gains with targeted drills`,
    `Session 2: Expand to ${t1} – build on momentum`,
    `Session 3: Bridge ${t0} + ${t1} – connected movement patterns`,
    `Session 4: Introduce ${t2} – next development area`,
    `Session 5: On-course application – transfer practice to real play`,
  ];
}

// ─── PR #108 helpers ──────────────────────────────────────────────────────────

/**
 * Compute a composite growth score (0–100) for a member.
 *
 * Scoring breakdown:
 * - Trend direction (40 pts): improving=40, new=25, plateau=10, inactive=0
 * - Lesson frequency (30 pts): ≥8 lessons=30, ≥4=20, ≥2=10, 1=5
 * - Issue resolution (20 pts): 20 × issueResolutionRate
 * - Cadence consistency (10 pts): cadence ≤14 days=10, ≤21=7, ≤30=4, >30=0
 */
function computeGrowthScore(
  trend: MemberTrend,
  lessonCount: number,
  issueResolutionRate: number,
  cadence: number | null
): number {
  const trendPts = trend === 'improving' ? 40 : trend === 'new' ? 25 : trend === 'plateau' ? 10 : 0;
  const freqPts = lessonCount >= 8 ? 30 : lessonCount >= 4 ? 20 : lessonCount >= 2 ? 10 : 5;
  const resolPts = Math.round(20 * issueResolutionRate);
  const cadencePts =
    cadence === null ? 5
    : cadence <= 14 ? 10
    : cadence <= 21 ? 7
    : cadence <= 30 ? 4
    : 0;
  return Math.min(100, trendPts + freqPts + resolPts + cadencePts);
}

/**
 * Compute the fraction of early-lesson issues that are no longer dominant in
 * the most recent lessons (higher = more progress made).
 */
function computeIssueResolutionRate(
  earlyTopics: string[],
  recentTopics: string[]
): number {
  if (earlyTopics.length === 0) return 1; // No early issues → full resolution
  const recentSet = new Set(recentTopics.map(t => t.toLowerCase()));
  const resolved = earlyTopics.filter(t => !recentSet.has(t.toLowerCase())).length;
  return resolved / earlyTopics.length;
}

/**
 * Compute the average interval (in days) between consecutive lessons.
 * Returns null when fewer than 2 lessons are available.
 */
function computeLessonCadence(sortedLessons: Lesson[]): number | null {
  if (sortedLessons.length < 2) return null;
  // sortedLessons is newest-first, so compute gaps between adjacent pairs
  const timestamps = sortedLessons.map(l => new Date(l.date).getTime());
  let totalMs = 0;
  for (let i = 0; i < timestamps.length - 1; i++) {
    totalMs += Math.abs(timestamps[i] - timestamps[i + 1]);
  }
  const avgMs = totalMs / (timestamps.length - 1);
  return Math.round(avgMs / 86_400_000);
}

/**
 * Build weekly activity counts for the last 8 calendar weeks (Mon–Sun).
 * Returns an array of 8 objects, index 0 = oldest week.
 */
function buildWeeklyActivity(
  lessons: Lesson[],
  language: CoachXLanguage = 'ko'
): { weekLabel: string; count: number }[] {
  const now = new Date();
  // Align to start of the current week (Monday)
  const dayOfWeek = (now.getDay() + 6) % 7; // 0=Mon…6=Sun
  const startOfCurrentWeek = new Date(now);
  startOfCurrentWeek.setHours(0, 0, 0, 0);
  startOfCurrentWeek.setDate(now.getDate() - dayOfWeek);

  return Array.from({ length: 8 }, (_, i) => {
    const weekStart = new Date(startOfCurrentWeek);
    weekStart.setDate(startOfCurrentWeek.getDate() - (7 - i) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const count = lessons.filter(l => {
      const d = new Date(l.date).getTime();
      return d >= weekStart.getTime() && d < weekEnd.getTime();
    }).length;

    // Short label: "M/D" style
    const locale = language === 'en' ? 'en-US' : language === 'ja' ? 'ja-JP' : 'ko-KR';
    const weekLabel = weekStart.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' });

    return { weekLabel, count };
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

// ─── Insight i18n helpers ─────────────────────────────────────────────────────

/** Localised insight string templates. */
const INSIGHT_I18N: Record<CoachXLanguage, {
  noData: { title: string; body: string };
  pattern: { title: string; body: (topics: string) => string };
  attention: { title: string; body: (names: string) => string };
  stagnation: { title: string; body: (names: string) => string };
  coachGrowth: {
    title: string;
    slice: string; weight: string; putting: string; address: string; def: string;
  };
  curriculum: {
    title: string;
    body: (t0: string, t1: string) => string;
    empty: string;
  };
}> = {
  ko: {
    noData: {
      title: '아직 레슨 기록이 없습니다',
      body: '첫 레슨을 기록하면 CoachX 인사이트가 활성화됩니다.',
    },
    pattern: {
      title: '반복 레슨 주제',
      body: (topics) =>
        `최근 레슨에서 가장 많이 다룬 주제는 **${topics}** 입니다. 해당 주제 관련 시각 자료나 드릴을 준비하면 레슨 효율이 높아질 수 있습니다.`,
    },
    attention: {
      title: '이번 달 활발한 회원',
      body: (names) =>
        `최근 30일 기준 레슨이 활발한 회원: **${names}**. 지속적인 관심과 맞춤형 커리큘럼으로 성장을 가속화하세요.`,
    },
    stagnation: {
      title: '장기 미레슨 회원',
      body: (names) =>
        `**${names}** 회원이 45일 이상 레슨이 없습니다. 재참여 유도 메시지나 목표 재설정 레슨을 고려해보세요.`,
    },
    coachGrowth: {
      title: '코치 성장 제안',
      slice:   '클럽패스와 페이스각 설명을 시각화하는 드릴 자료 강화를 추천합니다.',
      weight:  '체중이동 감각을 위한 실전 드릴 템플릿 보강을 추천합니다.',
      putting: '쇼트게임 교정 사례 모음 및 그린 스피드 적응 드릴을 강화해보세요.',
      address: '입문자 셋업 템플릿을 정리하면 초급자 레슨 효율이 크게 향상됩니다.',
      def:     '레슨 패턴을 분석해 주기적으로 교육 자료를 업데이트해보세요.',
    },
    curriculum: {
      title: '추천 레슨 커리큘럼',
      body: (t0, t1) =>
        `현재 패턴 기반 추천 3회 커리큘럼: 1) ${t0} 집중 교정 → 2) ${t1} 강화 → 3) 종합 복습 및 필드 적용`,
      empty: '첫 레슨을 기록하면 맞춤형 커리큘럼을 추천해드립니다.',
    },
  },
  en: {
    noData: {
      title: 'No lesson data yet',
      body: 'Start recording lessons to unlock CoachX insights.',
    },
    pattern: {
      title: 'Recurring Lesson Topics',
      body: (topics) =>
        `Most frequently covered topics in recent lessons: **${topics}**. Preparing visuals or targeted drills for these areas can improve lesson efficiency.`,
    },
    attention: {
      title: 'Most Active Members This Month',
      body: (names) =>
        `Members with the most lessons in the last 30 days: **${names}**. Keep the momentum with personalised curriculum plans.`,
    },
    stagnation: {
      title: 'Long-term Inactive Members',
      body: (names) =>
        `**${names}** have had no lessons for 45+ days. Consider sending a re-engagement message or scheduling a goal-reset session.`,
    },
    coachGrowth: {
      title: 'Coach Growth Suggestion',
      slice:   'Consider strengthening your visual drill materials for club path and face angle explanation.',
      weight:  'Adding practical weight-shift drill templates could improve member feel and progress.',
      putting: 'Building a short-game correction library and green-speed adaptation drills would expand your toolkit.',
      address:'Structuring beginner setup templates could significantly improve efficiency for entry-level lessons.',
      def:     'Periodically review your lesson patterns and update your teaching materials to stay current.',
    },
    curriculum: {
      title: 'Recommended Curriculum',
      body: (t0, t1) =>
        `Pattern-based 3-session recommendation: 1) Focus & correct ${t0} → 2) Strengthen ${t1} → 3) Comprehensive review & on-course application`,
      empty: 'Record your first lesson to unlock a personalised curriculum recommendation.',
    },
  },
  ja: {
    noData: {
      title: 'まだレッスン記録がありません',
      body: '最初のレッスンを記録するとCoachXインサイトが有効になります。',
    },
    pattern: {
      title: 'よく扱う指導テーマ',
      body: (topics) =>
        `最近のレッスンで最もよく扱うテーマは **${topics}** です。関連する視覚資料やドリルを準備すると指導効率が向上します。`,
    },
    attention: {
      title: '今月最も活発な会員',
      body: (names) =>
        `直近30日間でレッスンが最も多い会員: **${names}**。継続的なサポートとカスタムカリキュラムでさらなる成長を加速させましょう。`,
    },
    stagnation: {
      title: '長期未レッスン会員',
      body: (names) =>
        `**${names}** が45日以上レッスンを受けていません。再参加メッセージや目標再設定セッションを検討してください。`,
    },
    coachGrowth: {
      title: 'コーチ成長の提案',
      slice:   'クラブパスとフェース角の説明を視覚化するドリル資料の強化をお勧めします。',
      weight:  '体重移動の感覚を養うための実践的なドリルテンプレートの追加をお勧めします。',
      putting: 'ショートゲーム修正事例集とグリーンスピード適応ドリルの充実をお勧めします。',
      address: '初心者向けセットアップテンプレートを整理すると、初級者レッスンの効率が大幅に向上します。',
      def:     'レッスンパターンを分析し、定期的に指導教材を更新することをお勧めします。',
    },
    curriculum: {
      title: '推奨カリキュラム',
      body: (t0, t1) =>
        `現在のパターンに基づく3回推奨カリキュラム: 1) ${t0} 集中矯正 → 2) ${t1} 強化 → 3) 総合復習・コース応用`,
      empty: '最初のレッスンを記録すると、カスタムカリキュラムを提案します。',
    },
  },
};

/**
 * Generate today's coach-level insights from all lesson records.
 * Pass `language` to receive localised insight titles and body text.
 */
export function generateCoachInsights(
  allLessons: Lesson[],
  _coachProfile: CoachProfile,
  language: CoachXLanguage = 'ko'
): CoachXInsight[] {
  const i18n = INSIGHT_I18N[language];
  const insights: CoachXInsight[] = [];

  if (allLessons.length === 0) {
    insights.push({
      type: 'pattern',
      title: i18n.noData.title,
      body: i18n.noData.body,
      icon: '📊',
    });
    return insights;
  }

  // ── 1. Most recurring lesson topics ───────────────────────────────────────
  const topics = extractTopics(allLessons);
  if (topics.length > 0) {
    insights.push({
      type: 'pattern',
      title: i18n.pattern.title,
      body: i18n.pattern.body(topics.slice(0, 3).join(', ')),
      icon: '🔄',
    });
  }

  // ── 2. Members with many recent lessons (attention) ────────────────────────
  const recentCutoff = Date.now() - 30 * 86_400_000; // last 30 days
  const recentLessons = allLessons.filter(l => l.createdAt >= recentCutoff);
  const clientCounts: Record<string, number> = {};
  for (const l of recentLessons) {
    const key = `${l.clientName}_${l.clientPhone}`;
    clientCounts[key] = (clientCounts[key] ?? 0) + 1;
  }
  const SESSION_UNIT: Record<CoachXLanguage, string> = { ko: '회', en: 'sessions', ja: '回' };
  const sessionUnit = SESSION_UNIT[language];
  const activeClients = Object.entries(clientCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, cnt]) => `${key.split('_')[0]}(${cnt}${sessionUnit})`);
  if (activeClients.length > 0) {
    insights.push({
      type: 'attention',
      title: i18n.attention.title,
      body: i18n.attention.body(activeClients.join(', ')),
      icon: '⭐',
    });
  }

  // ── 3. Stagnation watch ────────────────────────────────────────────────────
  const staleCutoff = Date.now() - 45 * 86_400_000; // 45 days
  const clientLastLesson: Record<string, number> = {};
  for (const l of allLessons) {
    const key = `${l.clientName}_${l.clientPhone}`;
    if (!clientLastLesson[key] || l.createdAt > clientLastLesson[key]) {
      clientLastLesson[key] = l.createdAt;
    }
  }
  const staleClients = Object.entries(clientLastLesson)
    .filter(([, lastAt]) => lastAt < staleCutoff)
    .map(([key]) => key.split('_')[0])
    .slice(0, 3);
  if (staleClients.length > 0) {
    insights.push({
      type: 'stagnation',
      title: i18n.stagnation.title,
      body: i18n.stagnation.body(staleClients.join(', ')),
      icon: '⏸️',
    });
  }

  // ── 4. Coach growth suggestion ─────────────────────────────────────────────
  const topicStr = topics.join(' ').toLowerCase();
  let coachGrowthMsg: string = i18n.coachGrowth.def;
  if (topicStr.includes('슬라이스') || topicStr.includes('slice')) {
    coachGrowthMsg = i18n.coachGrowth.slice;
  } else if (topicStr.includes('체중') || topicStr.includes('weight')) {
    coachGrowthMsg = i18n.coachGrowth.weight;
  } else if (topicStr.includes('퍼팅') || topicStr.includes('putting')) {
    coachGrowthMsg = i18n.coachGrowth.putting;
  } else if (topicStr.includes('어드레스') || topicStr.includes('그립')) {
    coachGrowthMsg = i18n.coachGrowth.address;
  }
  insights.push({
    type: 'coach_growth',
    title: i18n.coachGrowth.title,
    body: coachGrowthMsg,
    icon: '📈',
  });

  // ── 5. Curriculum recommendation ──────────────────────────────────────────
  const DEFAULT_TOPICS: Record<CoachXLanguage, [string, string]> = {
    ko: ['셋업 안정화', '임팩트 감각'],
    en: ['Setup Stability', 'Impact Feel'],
    ja: ['セットアップ安定化', 'インパクト感覚'],
  };
  const [d0, d1] = DEFAULT_TOPICS[language];
  insights.push({
    type: 'curriculum',
    title: i18n.curriculum.title,
    body: topics.length > 0
      ? i18n.curriculum.body(topics[0] ?? d0, topics[1] ?? d1)
      : i18n.curriculum.empty,
    icon: '🗓️',
  });

  return insights;
}

/**
 * Build member-level growth reports from lesson data.
 */
export function buildMemberGrowthReports(
  allLessons: Lesson[],
  clients: ClientProfile[],
  language: CoachXLanguage = 'ko'
): MemberGrowthReport[] {
  const clientMap: Record<string, Lesson[]> = {};
  for (const l of allLessons) {
    const key = `${l.clientName}_${l.clientPhone}`;
    if (!clientMap[key]) clientMap[key] = [];
    clientMap[key].push(l);
  }

  return Object.entries(clientMap).map(([key, lessons]) => {
    const sorted = [...lessons].sort((a, b) => b.createdAt - a.createdAt);
    const recent5 = sorted.slice(0, 5);
    const recentTopics = extractTopics(recent5);
    const allTopics = extractTopics(sorted);
    const [name, phone] = key.split('_');

    // Detect repeated issues (topics in >50% of recent lessons)
    const issueCounts: Record<string, number> = {};
    for (const l of recent5) {
      const text = `${l.title} ${l.coachNotes ?? ''} ${(l.tags ?? []).join(' ')}`.toLowerCase();
      for (const topic of allTopics) {
        if (text.includes(topic.toLowerCase())) {
          issueCounts[topic] = (issueCounts[topic] ?? 0) + 1;
        }
      }
    }
    const repeatedIssues = Object.entries(issueCounts)
      .filter(([, cnt]) => cnt >= Math.ceil(recent5.length / 2))
      .map(([topic]) => topic);

    // Simple strength detection (if a topic appears early but not recently)
    const strengths = allTopics.filter(t => !repeatedIssues.includes(t)).slice(0, 2);

    const lastLesson = sorted[0];
    const lastLessonDate = lastLesson?.date ?? null;
    const dsl = lastLessonDate ? daysSince(lastLessonDate) : null;
    const level = attentionLevel(lessons.length, dsl ?? 999);

    // Trend detection
    const trend = deriveTrend(sorted, dsl ?? 999);

    const DEFAULT_BASE_TOPIC: Record<CoachXLanguage, string> = {
      ko: '기본 자세', en: 'Fundamentals', ja: '基本姿勢',
    };
    const nextTopic = repeatedIssues[0] ?? recentTopics[0] ?? DEFAULT_BASE_TOPIC[language];

    const SUGGESTED_NEXT: Record<CoachXLanguage, string> = {
      ko: `${nextTopic} 집중 교정 및 이전 레슨 복습`,
      en: `Focus on ${nextTopic} with review of previous lesson points`,
      ja: `${nextTopic} の集中矯正と前回レッスンの復習`,
    };
    const suggestedNextLesson = SUGGESTED_NEXT[language];

    // 3-session short plan (backwards-compatible)
    const ADDR_FALLBACK: Record<CoachXLanguage, string> = {
      ko: '어드레스 재점검', en: 'Address Review', ja: 'アドレス再確認',
    };
    const IMPACT_FALLBACK: Record<CoachXLanguage, string> = {
      ko: '임팩트 감각', en: 'Impact Feel', ja: 'インパクト感覚',
    };
    const t0short = recentTopics[0] ?? ADDR_FALLBACK[language];
    const t1short = recentTopics[1] ?? IMPACT_FALLBACK[language];
    const CURRICULUM_PLAN: Record<CoachXLanguage, string[]> = {
      ko: [
        `1회차: ${t0short} 심화`,
        `2회차: ${t1short} 드릴 강화`,
        `3회차: 종합 복습 및 필드/라운드 적용`,
      ],
      en: [
        `Session 1: Deepen ${t0short}`,
        `Session 2: Drills – ${t1short}`,
        `Session 3: Comprehensive review & on-course application`,
      ],
      ja: [
        `第1回: ${t0short} 深化`,
        `第2回: ${t1short} ドリル強化`,
        `第3回: 総合復習・コース/ラウンド応用`,
      ],
    };
    const curriculumPlan = CURRICULUM_PLAN[language];

    // Extended 5-session curriculum
    const curriculumPlan5 = buildCurriculum5(recentTopics, repeatedIssues, trend, language);

    // Drill suggestions mapped to top repeated issues
    const drillSuggestions = repeatedIssues.length > 0
      ? drillsForIssue(repeatedIssues[0])
      : drillsForIssue(recentTopics[0] ?? '');

    // Verify client exists (informational – used for future backend integration)
    const clientProfile = clients.find(c => c.name === name && c.phone === phone);
    void clientProfile;

    // ── PR #108: richer growth analytics ────────────────────────────────────

    // Topic progression: split lessons into early half vs. recent half
    const half = Math.ceil(sorted.length / 2);
    const earlyHalf  = sorted.slice(half);  // older lessons (tail of newest-first array)
    const recentHalf = sorted.slice(0, half); // newer lessons (head)
    const earlyTopics  = extractTopics(earlyHalf);
    const recentHalfTopics = extractTopics(recentHalf);
    const topicProgressionStages = {
      early:  earlyTopics.slice(0, 3),
      recent: recentHalfTopics.slice(0, 3),
    };

    // Issue resolution rate
    const issueResolutionRate = computeIssueResolutionRate(earlyTopics, recentHalfTopics);

    // Lesson cadence (avg days between lessons)
    const lessonCadence = computeLessonCadence(sorted);

    // Composite growth score
    const growthScore = computeGrowthScore(trend, lessons.length, issueResolutionRate, lessonCadence);

    // Weekly activity for the last 8 weeks
    const weeklyActivity = buildWeeklyActivity(lessons, language);

    return {
      clientName: name,
      clientPhone: phone,
      lessonCount: lessons.length,
      recentTopics,
      repeatedIssues,
      strengths,
      suggestedNextLesson,
      curriculumPlan,
      curriculumPlan5,
      drillSuggestions,
      attentionLevel: level,
      trendIndicator: trend,
      lastLessonDate,
      daysSinceLastLesson: dsl,
      growthScore,
      issueResolutionRate,
      lessonCadence,
      topicProgressionStages,
      weeklyActivity,
    } satisfies MemberGrowthReport;
  });
}

/**
 * Generate a structured coach growth profile from all lesson records.
 *
 * This powers the Coach Growth tab in CoachXHub and gives coaches a
 * data-driven view of their teaching patterns and growth opportunities.
 * Pass `language` to receive localised recommended-action strings.
 */
export function generateCoachGrowthProfile(
  allLessons: Lesson[],
  clients: ClientProfile[],
  language: CoachXLanguage = 'ko'
): CoachGrowthProfile {
  const now = Date.now();

  // ── Activity metrics ────────────────────────────────────────────────────────
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);

  const lessonsThisMonth = allLessons.filter(l => {
    const d = new Date(l.createdAt);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;

  const lessonsLastMonth = allLessons.filter(l => {
    const d = new Date(l.createdAt);
    return d.getMonth() === lastMonthDate.getMonth() && d.getFullYear() === lastMonthDate.getFullYear();
  }).length;

  // Active members: had at least one lesson in last 90 days
  const cutoff90 = now - 90 * 86_400_000;
  const activeMemberKeys = new Set(
    allLessons
      .filter(l => l.createdAt >= cutoff90)
      .map(l => `${l.clientName}_${l.clientPhone}`)
  );
  const activeMembersCount = activeMemberKeys.size;

  const lessonsLast90 = allLessons.filter(l => l.createdAt >= cutoff90).length;
  const avgSessionsPerActiveMember = activeMembersCount > 0
    ? Math.round((lessonsLast90 / activeMembersCount) * 10) / 10
    : 0;

  // ── Topic breakdown ─────────────────────────────────────────────────────────
  /** Multilingual keyword list used for lesson topic extraction across all supported languages. */
  const TOPIC_KEYWORDS = [
    '슬라이스', '훅', '어드레스', '셋업', '그립', '스탠스',
    '백스윙', '다운스윙', '임팩트', '피니쉬', '체중이동',
    '클럽패스', '페이스각', '퍼팅', '어프로치', '드라이버',
    '아이언', '웨지', '쇼트게임', '탑', '리듬',
    'slice', 'hook', 'address', 'grip', 'backswing', 'impact',
    'weight shift', 'driver', 'iron', 'wedge', 'putting',
  ];
  const topicCounts: Record<string, number> = {};
  for (const lesson of allLessons) {
    const text = `${lesson.title} ${lesson.coachNotes ?? ''} ${(lesson.tags ?? []).join(' ')}`.toLowerCase();
    for (const kw of TOPIC_KEYWORDS) {
      if (text.includes(kw.toLowerCase())) {
        topicCounts[kw] = (topicCounts[kw] ?? 0) + 1;
      }
    }
  }
  const totalTopicMentions = Object.values(topicCounts).reduce((s, c) => s + c, 0) || 1;
  const topicBreakdown: TopicStat[] = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([topic, count]) => ({
      topic,
      count,
      percentage: Math.round((count / totalTopicMentions) * 100),
    }));

  const teachingStrengths = topicBreakdown.slice(0, 3).map(t => t.topic);

  // Growth opportunities: topics in the core vocabulary that the coach rarely/never covers
  const coveredTopics = new Set(Object.keys(topicCounts));
  /** Korean keywords representing core golf coaching areas used to identify growth opportunities. */
  const CORE_GOLF_TOPICS = [
    '퍼팅', '어프로치', '쇼트게임', '벙커', '드라이버',
    '아이언', '웨지', '그립', '어드레스', '리듬',
    '클럽패스', '페이스각', '체중이동', '백스윙', '임팩트',
  ];
  const growthOpportunities = CORE_GOLF_TOPICS
    .filter(t => !coveredTopics.has(t))
    .slice(0, 4);

  // ── Member trends ────────────────────────────────────────────────────────────
  const reports = buildMemberGrowthReports(allLessons, clients, language);
  const memberTrends = {
    improving: reports.filter(r => r.trendIndicator === 'improving').length,
    plateau:   reports.filter(r => r.trendIndicator === 'plateau').length,
    new:       reports.filter(r => r.trendIndicator === 'new').length,
    inactive:  reports.filter(r => r.trendIndicator === 'inactive').length,
  };

  // ── Recommended actions (supportive, data-driven, language-aware) ─────────────
  /** Localised templates for each recommended-action scenario. */
  const ACT: Record<CoachXLanguage, {
    slice: string; address: string; weight: string; impact: string;
    defTopic: (t: string) => string;
    plateau: (n: number) => string;
    inactive: (n: number) => string;
    growthOpp: (t: string) => string;
    recordTip: string;
  }> = {
    ko: {
      slice:   '슬라이스 교정 시각화 자료(클럽패스/페이스각 다이어그램) 보강을 추천합니다.',
      address: '입문자 셋업 체크리스트 템플릿을 정리하면 초급 회원 레슨 효율이 높아집니다.',
      weight:  '체중이동 감각 드릴 영상 자료를 추가하면 회원 이해도를 높일 수 있습니다.',
      impact:  '임팩트 구간 분석 도구(임팩트백/영상 피드백)를 활용해보세요.',
      defTopic: (t) => `${t} 관련 최신 드릴 자료를 보강해보세요.`,
      plateau:  (n) => `정체 구간 회원이 ${n}명 있습니다. 새로운 드릴 접근법이나 주제 전환을 고려해보세요.`,
      inactive: (n) => `장기 미레슨 회원이 ${n}명 있습니다. 재참여 레슨이나 목표 재설정 세션을 권장합니다.`,
      growthOpp: (t) => `${t} 영역 레슨을 늘리면 코칭 역량 다양성이 확대됩니다.`,
      recordTip: '레슨 기록에 태그와 코치 노트를 꾸준히 추가하면 더 정확한 분석이 제공됩니다.',
    },
    en: {
      slice:   'Consider adding visual drill materials (club-path / face-angle diagrams) to reinforce slice correction.',
      address: 'Structuring beginner setup checklists can significantly improve entry-level lesson efficiency.',
      weight:  'Adding weight-shift drill videos can help members internalise the movement more quickly.',
      impact:  'Try incorporating an impact-bag or video-feedback tool to deepen impact-zone awareness.',
      defTopic: (t) => `Consider updating your drill library for ${t} to keep lessons fresh and effective.`,
      plateau:  (n) => { const s = n > 1 ? 's are' : ' is'; return `${n} member${s} in a plateau. Try a fresh drill approach or shift focus to a new topic.`; },
      inactive: (n) => { const s = n > 1 ? 's have' : ' has'; return `${n} member${s} been inactive for 45+ days. A re-engagement or goal-reset session is recommended.`; },
      growthOpp: (t) => `Expanding your ${t} lessons would broaden your coaching range and attract new member types.`,
      recordTip: 'Consistently adding tags and coach notes to lessons unlocks more accurate personalised analysis.',
    },
    ja: {
      slice:   'スライス修正の視覚化ドリル資料（クラブパス/フェース角ダイアグラム）の強化をお勧めします。',
      address: '初心者向けセットアップチェックリストを整理すると、初級レッスンの効率が大幅に向上します。',
      weight:  '体重移動ドリルの動画資料を追加すると、会員の理解度が向上します。',
      impact:  'インパクトバッグや動画フィードバックツールを活用してインパクトゾーンの意識を高めましょう。',
      defTopic: (t) => `${t} に関連する最新ドリル資料を充実させることをお勧めします。`,
      plateau:  (n) => `停滞期の会員が${n}名います。新しいドリルアプローチやテーマ転換を検討してください。`,
      inactive: (n) => `長期未レッスンの会員が${n}名います。再参加レッスンや目標再設定セッションをお勧めします。`,
      growthOpp: (t) => `${t} 分野のレッスンを増やすと、コーチングの多様性が広がります。`,
      recordTip: 'レッスン記録にタグとコーチノートを継続的に追加すると、より正確な分析が提供されます。',
    },
  };
  const act = ACT[language];

  const recommendedActions: string[] = [];
  const topTopic = teachingStrengths[0];
  if (topTopic) {
    recommendedActions.push(
      topTopic.includes('슬라이스') || topTopic === 'slice'
        ? act.slice
        : topTopic.includes('어드레스') || topTopic.includes('셋업') || topTopic === 'address'
          ? act.address
          : topTopic.includes('체중') || topTopic === 'weight shift'
            ? act.weight
            : topTopic.includes('임팩트') || topTopic === 'impact'
              ? act.impact
              : act.defTopic(topTopic)
    );
  }
  if (memberTrends.plateau > 0) {
    recommendedActions.push(act.plateau(memberTrends.plateau));
  }
  if (memberTrends.inactive > 0) {
    recommendedActions.push(act.inactive(memberTrends.inactive));
  }
  if (growthOpportunities.length > 0) {
    recommendedActions.push(act.growthOpp(growthOpportunities[0]));
  }
  if (recommendedActions.length < 2) {
    recommendedActions.push(act.recordTip);
  }

  return {
    lessonsThisMonth,
    lessonsLastMonth,
    activeMembersCount,
    avgSessionsPerActiveMember,
    topicBreakdown,
    teachingStrengths,
    growthOpportunities,
    memberTrends,
    recommendedActions,
  };
}

/**
 * Generate a heuristic CoachX chat response.
 * Pass `language` to receive responses in the coach's app language (ko/en/ja).
 * When a real LLM backend is available, replace this function body with an API call.
 */
export function generateHeuristicResponse(
  userMessage: string,
  allLessons: Lesson[],
  clients: ClientProfile[],
  language: CoachXLanguage = 'ko'
): string {
  const msg = userMessage.toLowerCase();

  // Topic extraction for context-aware replies
  const topics = extractTopics(allLessons);
  const memberCount = new Set(allLessons.map(l => `${l.clientName}_${l.clientPhone}`)).size;

  const DEFAULT_TOPIC: Record<CoachXLanguage, [string, string, string, string]> = {
    ko: ['셋업 안정화', '임팩트 감각', '클럽패스 교정', '어드레스 및 셋업'],
    en: ['Setup Stability', 'Impact Feel', 'Club Path', 'Address & Setup'],
    ja: ['セットアップ安定化', 'インパクト感覚', 'クラブパス矯正', 'アドレス & セットアップ'],
  };
  const [dt0, dt1, dt2, dt3] = DEFAULT_TOPIC[language];
  const topicStr = topics.slice(0, 3).join(', ') || dt0;

  const AI_NOTE: Record<CoachXLanguage, string> = {
    ko: '> *실제 AI 연동 시 더욱 정밀한 개인화 답변이 제공됩니다.*',
    en: '> *Live AI integration will deliver even more precise personalised responses.*',
    ja: '> *実際のAI連携により、さらに精密なパーソナライズ回答が提供されます。*',
  };
  const aiNote = AI_NOTE[language];

  // ── Member-specific query: detect a member name in the message ─────────────
  // Primary: match against registered client profiles
  let matchedClient = clients.find(c => msg.includes(c.name.toLowerCase()));

  // Fallback: match against lesson client names for coaches who recorded
  // lessons before creating a formal ClientProfile entry.
  if (!matchedClient) {
    const seenKeys = new Set<string>();
    const lessonMembers: ClientProfile[] = [];
    for (const l of allLessons) {
      const key = `${l.clientName}_${l.clientPhone}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        lessonMembers.push({ name: l.clientName, phone: l.clientPhone });
      }
    }
    matchedClient = lessonMembers.find(m => msg.includes(m.name.toLowerCase()));
  }

  if (matchedClient) {
    const memberLessons = allLessons.filter(
      l => l.clientName === matchedClient.name && l.clientPhone === matchedClient.phone
    );
    const reports = buildMemberGrowthReports(memberLessons, [matchedClient], language);
    const report = reports[0];
    if (report) {
      const TREND_LABEL: Record<CoachXLanguage, Record<string, string>> = {
        ko: { improving: '📈 성장 중', plateau: '⏸ 정체 구간', inactive: '💤 장기 미레슨', new: '🌱 초기 단계' },
        en: { improving: '📈 Improving', plateau: '⏸ Plateau', inactive: '💤 Inactive', new: '🌱 Getting Started' },
        ja: { improving: '📈 成長中', plateau: '⏸ 停滞期', inactive: '💤 長期未レッスン', new: '🌱 開始段階' },
      };
      const trendLabel = TREND_LABEL[language][report.trendIndicator] ?? '🌱';

      if (language === 'en') {
        return `📊 **${matchedClient.name} – Member Growth Report**\n\n` +
          `Total lessons: **${report.lessonCount}** | Trend: **${trendLabel}**\n` +
          (report.lastLessonDate && report.daysSinceLastLesson !== null ? `Last lesson: ${report.lastLessonDate} (${report.daysSinceLastLesson} days ago)\n` : '') +
          `\n**Recent focus topics:** ${report.recentTopics.join(', ') || 'No data'}` +
          (report.repeatedIssues.length > 0 ? `\n**Recurring correction points:** ${report.repeatedIssues.join(', ')}` : '') +
          (report.strengths.length > 0 ? `\n**Strengthened areas:** ${report.strengths.join(', ')}` : '') +
          `\n\n**Next lesson recommendation:** ${report.suggestedNextLesson}` +
          `\n\n**Suggested drills:**\n${report.drillSuggestions.map(d => `• ${d}`).join('\n')}` +
          `\n\n${aiNote}`;
      }
      if (language === 'ja') {
        return `📊 **${matchedClient.name} 会員成長レポート**\n\n` +
          `総レッスン数: **${report.lessonCount}回** | 成長傾向: **${trendLabel}**\n` +
          (report.lastLessonDate && report.daysSinceLastLesson !== null ? `最後のレッスン: ${report.lastLessonDate} (${report.daysSinceLastLesson}日前)\n` : '') +
          `\n**最近の集中テーマ:** ${report.recentTopics.join(', ') || '記録なし'}` +
          (report.repeatedIssues.length > 0 ? `\n**繰り返し修正ポイント:** ${report.repeatedIssues.join(', ')}` : '') +
          (report.strengths.length > 0 ? `\n**強化されたエリア:** ${report.strengths.join(', ')}` : '') +
          `\n\n**次のレッスン推奨:** ${report.suggestedNextLesson}` +
          `\n\n**推奨ドリル:**\n${report.drillSuggestions.map(d => `• ${d}`).join('\n')}` +
          `\n\n${aiNote}`;
      }
      // Korean (default)
      return `📊 **${matchedClient.name} 회원 성장 리포트**\n\n` +
        `총 레슨: **${report.lessonCount}회** | 성장 추세: **${trendLabel}**\n` +
        (report.lastLessonDate && report.daysSinceLastLesson !== null ? `마지막 레슨: ${report.lastLessonDate} (${report.daysSinceLastLesson}일 전)\n` : '') +
        `\n**최근 집중 주제:** ${report.recentTopics.join(', ') || '기록 없음'}` +
        (report.repeatedIssues.length > 0 ? `\n**반복 교정 포인트:** ${report.repeatedIssues.join(', ')}` : '') +
        (report.strengths.length > 0 ? `\n**강화된 영역:** ${report.strengths.join(', ')}` : '') +
        `\n\n**다음 레슨 추천:** ${report.suggestedNextLesson}` +
        `\n\n**추천 드릴:**\n${report.drillSuggestions.map(d => `• ${d}`).join('\n')}` +
        `\n\n${aiNote}`;
    }
  }

  // ── Pattern-matched responses ──────────────────────────────────────────────

  const isCurriculum = msg.includes('커리큘럼') || msg.includes('curriculum') ||
    msg.includes('레슨 계획') || msg.includes('lesson plan') || msg.includes('カリキュラム');
  if (isCurriculum) {
    if (language === 'en') {
      return `📋 **Recommended Curriculum (Data-Driven)**\n\nBased on your lesson patterns, here is a suggested 5-session plan:\n\n1️⃣ **${topics[0] ?? dt0}** – Re-establish fundamentals\n2️⃣ **${topics[1] ?? dt1}** – Repetition drills\n3️⃣ **${topics[2] ?? dt2}** – Ball-flight stability\n4️⃣ **Comprehensive review** – On-course simulation\n5️⃣ **Measurement session** – Track progress with ball data\n\n${aiNote}`;
    }
    if (language === 'ja') {
      return `📋 **推奨カリキュラム（データ基盤）**\n\nレッスンパターンに基づく5回推奨プランです:\n\n1️⃣ **${topics[0] ?? dt0}** – 基本ポジショニング再確認\n2️⃣ **${topics[1] ?? dt1}** – 反復ドリル中心\n3️⃣ **${topics[2] ?? dt2}** – 弾道/方向安定化\n4️⃣ **総合復習** – コースシミュレーション\n5️⃣ **成果測定** – ボールデータで進捗確認\n\n${aiNote}`;
    }
    return `📋 **추천 커리큘럼 (데이터 기반)**\n\n현재 레슨 패턴 분석 결과, 아래 순서를 추천합니다:\n\n1️⃣ **${topics[0] ?? dt0}** – 기초 포지셔닝 재점검\n2️⃣ **${topics[1] ?? dt1}** – 반복 드릴 중심\n3️⃣ **${topics[2] ?? dt2}** – 탄도/방향 안정화\n4️⃣ **종합 복습** – 필드 응용 시뮬레이션\n5️⃣ **성과 측정** – 볼 데이터 기반 진도 확인\n\n${aiNote}`;
  }

  const isPlateau = msg.includes('정체') || msg.includes('plateau') ||
    msg.includes('stagnation') || msg.includes('stagnating') || msg.includes('停滞');
  if (isPlateau) {
    const reports = buildMemberGrowthReports(allLessons, clients, language);
    const plateauMembers = reports.filter(r => r.trendIndicator === 'plateau').map(r => r.clientName);
    const inactiveMembers = reports.filter(r => r.trendIndicator === 'inactive').map(r => r.clientName);

    if (language === 'en') {
      let response = `⏸ **Plateau & Inactive Member Analysis**\n\n`;
      if (plateauMembers.length > 0) {
        response += `**Members with recurring issues:** ${plateauMembers.join(', ')}\n→ Try a fresh drill approach or shift the lesson focus to break through.\n\n`;
      }
      if (inactiveMembers.length > 0) {
        response += `**Long-term inactive members (45+ days):** ${inactiveMembers.join(', ')}\n→ A re-engagement message or goal-reset session is recommended.\n\n`;
      }
      if (plateauMembers.length === 0 && inactiveMembers.length === 0) {
        response += 'No members are currently in a plateau. Everyone is progressing well! 🎉';
      }
      response += `\n${aiNote}`;
      return response;
    }
    if (language === 'ja') {
      let response = `⏸ **停滞・未活動会員分析**\n\n`;
      if (plateauMembers.length > 0) {
        response += `**同じ課題が繰り返される会員:** ${plateauMembers.join(', ')}\n→ 新しいドリルアプローチや別テーマへの転換を検討してください。\n\n`;
      }
      if (inactiveMembers.length > 0) {
        response += `**長期未レッスン会員（45日以上）:** ${inactiveMembers.join(', ')}\n→ 再参加メッセージや目標再設定セッションをお勧めします。\n\n`;
      }
      if (plateauMembers.length === 0 && inactiveMembers.length === 0) {
        response += '現在停滞期の会員はいません。全員順調に進んでいます！ 🎉';
      }
      response += `\n${aiNote}`;
      return response;
    }
    // Korean
    let response = `⏸ **정체 구간 회원 분석**\n\n`;
    if (plateauMembers.length > 0) {
      response += `**같은 문제가 반복되는 회원:** ${plateauMembers.join(', ')}\n→ 새로운 드릴 접근법이나 다른 주제로 전환을 고려해보세요.\n\n`;
    }
    if (inactiveMembers.length > 0) {
      response += `**장기 미레슨 회원 (45일+):** ${inactiveMembers.join(', ')}\n→ 재참여 메시지나 목표 재설정 레슨을 권장합니다.\n\n`;
    }
    if (plateauMembers.length === 0 && inactiveMembers.length === 0) {
      response += '현재 정체 구간에 있는 회원이 없습니다. 모든 회원이 잘 진행 중입니다! 🎉';
    }
    response += `\n${aiNote}`;
    return response;
  }

  const isProgress = msg.includes('성장') || msg.includes('progress') ||
    msg.includes('회원') || msg.includes('member') || msg.includes('会員') || msg.includes('成長');
  if (isProgress) {
    const reports = buildMemberGrowthReports(allLessons, clients, language);
    const improving = reports.filter(r => r.trendIndicator === 'improving').length;
    const plateau = reports.filter(r => r.trendIndicator === 'plateau').length;
    const clientList = clients.slice(0, 3).map(c => c.name).join(', ');

    if (language === 'en') {
      return `📊 **Member Progress Summary**\n\nAnalysed recent lessons for **${memberCount} member${memberCount !== 1 ? 's' : ''}**.\n\n- 📈 Improving: **${improving}**\n- ⏸ Plateau: **${plateau}**\n\nKey members: **${clientList || 'Recording...'}**\nTop lesson topics: **${topicStr}**\n\nFor detailed reports, visit CoachX Hub → Member Growth.\n\n${aiNote}`;
    }
    if (language === 'ja') {
      return `📊 **会員成長サマリー**\n\n担当会員 **${memberCount}名** の最近のレッスンデータを分析しました。\n\n- 📈 成長中: **${improving}名**\n- ⏸ 停滞期: **${plateau}名**\n\n主要会員: **${clientList || '記録中...'}**\n繰り返しレッスンテーマ: **${topicStr}**\n\n各会員の詳細レポートはCoachXハブ > 会員成長レポートでご確認ください。\n\n${aiNote}`;
    }
    return `📊 **회원 성장 요약**\n\n담당 회원 **${memberCount}명**의 최근 레슨 데이터를 분석했습니다.\n\n- 📈 성장 중: **${improving}명**\n- ⏸ 정체 구간: **${plateau}명**\n\n주요 집중 회원: **${clientList || '기록 중...'}**\n반복 레슨 주제: **${topicStr}**\n\n각 회원의 상세 리포트는 CoachX 허브 > 회원 성장 리포트에서 확인하세요.\n\n${aiNote}`;
  }

  const isPattern = msg.includes('내 레슨') || msg.includes('my lesson') ||
    msg.includes('패턴') || msg.includes('pattern') || msg.includes('パターン') || msg.includes('指導');
  if (isPattern) {
    if (language === 'en') {
      return `🔍 **Lesson Pattern Analysis**\n\nAnalysed **${allLessons.length}** lesson records:\n\n- Most frequent topics: **${topicStr}**\n- Members coached: **${memberCount}**\n\n**Growth suggestions:**\n${topics[0] ? `• Strengthen visual drill materials for ${topics[0]}` : '• Try recording a wider variety of lesson topics'}\n• Use per-member progress checklists to track improvement\n\n${aiNote}`;
    }
    if (language === 'ja') {
      return `🔍 **レッスンパターン分析**\n\n**${allLessons.length}件**のレッスン記録を分析した結果:\n\n- 最も頻繁なテーマ: **${topicStr}**\n- 担当会員数: **${memberCount}名**\n\n**成長提案:**\n${topics[0] ? `• ${topics[0]} 関連の視覚ドリル資料を強化しましょう` : '• さまざまなレッスンテーマを記録してみましょう'}\n• 会員ごとの進捗チェックリストの活用をお勧めします\n\n${aiNote}`;
    }
    return `🔍 **코치 레슨 패턴 분석**\n\n총 **${allLessons.length}개** 레슨 기록을 분석한 결과:\n\n- 가장 자주 다루는 주제: **${topicStr}**\n- 담당 회원 수: **${memberCount}명**\n\n**성장 제안:**\n${topics[0] ? `• ${topics[0]} 관련 시각화 드릴 자료 보강` : '• 다양한 레슨 주제를 기록해보세요'}\n• 회원별 진도 체크리스트 활용 추천\n\n${aiNote}`;
  }

  const isNextLesson = msg.includes('다음 레슨') || msg.includes('next lesson') ||
    msg.includes('추천') || msg.includes('recommend') ||
    msg.includes('次のレッスン') || msg.includes('おすすめ');
  if (isNextLesson) {
    if (language === 'en') {
      return `🗓️ **Next Lesson Recommendation**\n\nBased on lesson data, here is the suggested focus:\n\n- Primary topic: **${topics[0] ?? dt3}**\n- Secondary topic: **${topics[1] ?? dt1}**\n- Goal: Review previous correction points + introduce a new drill\n\n**Pro tip:** Start with a 5-minute warm-up and address check to improve focus and lesson flow.\n\n> Tip: Ask with a specific member name for a personalised recommendation.\n\n${aiNote}`;
    }
    if (language === 'ja') {
      return `🗓️ **次のレッスン推奨**\n\nレッスンデータに基づく提案:\n\n- メインテーマ: **${topics[0] ?? dt3}**\n- サブテーマ: **${topics[1] ?? dt1}**\n- 目標: 前回の修正ポイントの復習 + 新しいドリルの導入\n\n**実践ヒント:** レッスン前の5分ストレッチとアドレス確認で集中力が高まります。\n\n会員名を含めて質問するとカスタム推奨が提供されます。\n\n${aiNote}`;
    }
    return `🗓️ **다음 레슨 추천**\n\n레슨 데이터 기반으로 아래를 추천합니다:\n\n- 집중 주제: **${topics[0] ?? dt3}**\n- 병행 주제: **${topics[1] ?? dt1}**\n- 목표: 이전 레슨 교정 포인트 복습 + 새 드릴 도입\n\n**실전 팁:** 레슨 전 5분 스트레칭과 어드레스 체크로 시작하면 집중도가 높아집니다.\n\n${aiNote}`;
  }

  const isCoachGrowth = (msg.includes('코치') && (msg.includes('성장') || msg.includes('개선') || msg.includes('교육'))) ||
    (msg.includes('coach') && (msg.includes('growth') || msg.includes('improve') || msg.includes('develop'))) ||
    (msg.includes('コーチ') && (msg.includes('成長') || msg.includes('改善') || msg.includes('教育')));
  if (isCoachGrowth) {
    if (language === 'en') {
      return `📈 **Coach Growth Analysis**\n\nBased on your lesson record patterns, here are skill-building recommendations:\n\n1. **${topics[0] ?? 'Swing Correction'} expertise** – Study the latest correction drills in this area\n2. **Visual communication** – Leverage video/image feedback tools\n3. **Outcome-based coaching** – Use ball data (distance/direction) as measurable benchmarks\n4. **Curriculum structure** – Build 4–8 week lesson plan templates\n\n> *Top coaches worldwide maximise member results through data-driven feedback and structured curricula.*`;
    }
    if (language === 'ja') {
      return `📈 **コーチ成長分析**\n\nレッスン記録パターンに基づくスキルアップ推奨:\n\n1. **${topics[0] ?? 'スイング矯正'} 専門性** – この分野の最新矯正ドリルを学習\n2. **視覚化コミュニケーション** – 動画/画像フィードバックツールを活用\n3. **成果ベースのコーチング** – ボールデータ（距離/方向）を測定基準として活用\n4. **カリキュラム構造化** – 4〜8週レッスンプランテンプレートを整備\n\n> *世界のトップコーチはデータ基盤のフィードバックと構造化されたカリキュラムで会員成果を最大化しています。*`;
    }
    return `📈 **코치 성장 분석**\n\n레슨 기록 패턴을 기반으로 다음 역량 강화를 추천합니다:\n\n1. **${topics[0] ?? '스윙 교정'} 전문성** – 해당 분야 최신 교정 드릴 학습\n2. **시각화 설명력 강화** – 영상/이미지 기반 피드백 도구 활용\n3. **결과 기반 코칭** – 볼 데이터(거리/방향)를 측정 기준으로 활용\n4. **커리큘럼 구조화** – 4~8주 레슨 플랜 템플릿 정리\n\n> *글로벌 탑 코치들은 데이터 기반 피드백과 구조화된 커리큘럼으로 회원 성과를 극대화합니다.*`;
  }

  const isSlice = msg.includes('슬라이스') || msg.includes('slice') || msg.includes('スライス');
  if (isSlice) {
    if (language === 'en') {
      return `🎯 **Slice Correction Guide**\n\nCommon causes and correction approach:\n\n**Root causes:**\n• Open club face at impact\n• Out-to-in club path\n• Excessive grip pressure\n\n**Correction drills:**\n1. Gate drill – train an in-to-in path\n2. Grip check – transition from weak to neutral grip\n3. Weight-shift drill – reinforce transfer to lead foot\n\n> *Slice issues are often correctable within 3–5 focused lessons.*`;
    }
    if (language === 'ja') {
      return `🎯 **スライス矯正ガイド**\n\n主な原因と矯正アプローチ:\n\n**根本原因:**\n• インパクト時のオープンフェース\n• アウト-インのクラブパス\n• グリッププレッシャー過多\n\n**矯正ドリル:**\n1. ゲートドリル – イン-インパスのトレーニング\n2. グリップチェック – ウィークグリップ → ニュートラルグリップ\n3. 体重移動練習 – 左足への移動強化\n\n> *スライスは3〜5回の集中レッスンで矯正可能なことが多いです。*`;
    }
    return `🎯 **슬라이스 교정 가이드**\n\n슬라이스의 주요 원인과 교정 방법:\n\n**원인 분석:**\n• 오픈 클럽 페이스 (임팩트 시)\n• 아웃-인 클럽패스\n• 그립 압력 과다\n\n**교정 드릴:**\n1. 게이트 드릴 – 인-인 패스 훈련\n2. 그립 체크 – 약한 그립 → 중립 그립\n3. 체중이동 연습 – 왼발로의 이동 강화\n\n> *슬라이스는 3~5회 집중 레슨으로 교정 가능한 경우가 많습니다.*`;
  }

  // Default response
  const DEFAULT_PROMPTS: Record<CoachXLanguage, string> = {
    ko: `안녕하세요! 저는 **CoachX**입니다. 🏌️\n\n코치님의 레슨 데이터를 기반으로 다양한 인사이트를 제공합니다.\n\n아래 주제로 질문해보세요:\n• "다음 레슨 추천해줘"\n• "회원 성장 분석"\n• "내 레슨 패턴 알려줘"\n• "커리큘럼 추천"\n• "코치 성장 방법"\n• "정체 중인 회원 있어?"\n• "[회원 이름] 회원 분석해줘"\n\n현재 **${allLessons.length}개** 레슨 기록, **${memberCount}명** 회원 데이터를 분석 중입니다.\n\n${aiNote}`,
    en: `Hi! I'm **CoachX**. 🏌️\n\nI provide insights based on your lesson records.\n\nTry asking:\n• "Recommend my next lesson"\n• "Summarise member progress"\n• "Analyse my lesson patterns"\n• "Suggest a curriculum plan"\n• "How can I grow as a coach?"\n• "Any members in a plateau?"\n• "[Member name] progress report"\n\nCurrently analysing **${allLessons.length}** lessons across **${memberCount}** member${memberCount !== 1 ? 's' : ''}.\n\n${aiNote}`,
    ja: `こんにちは！私は **CoachX** です。🏌️\n\nレッスン記録に基づいて様々なインサイトを提供します。\n\n以下のテーマで質問してみてください:\n• "次のレッスンを提案して"\n• "会員の成長をまとめて"\n• "レッスンパターンを分析して"\n• "カリキュラムを提案して"\n• "コーチ成長のヒントは？"\n• "停滞している会員はいる？"\n• "[会員名] の成長分析"\n\n現在 **${allLessons.length}件** のレッスン記録、**${memberCount}名** の会員データを分析中です。\n\n${aiNote}`,
  };

  return DEFAULT_PROMPTS[language];
}
