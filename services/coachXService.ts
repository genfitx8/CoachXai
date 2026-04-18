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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate today's coach-level insights from all lesson records.
 */
export function generateCoachInsights(
  allLessons: Lesson[],
  _coachProfile: CoachProfile
): CoachXInsight[] {
  const insights: CoachXInsight[] = [];

  if (allLessons.length === 0) {
    insights.push({
      type: 'pattern',
      title: 'No lesson data yet',
      body: 'Start recording lessons to unlock CoachX insights.',
      icon: '📊',
    });
    return insights;
  }

  // ── 1. Most recurring lesson topics ───────────────────────────────────────
  const topics = extractTopics(allLessons);
  if (topics.length > 0) {
    insights.push({
      type: 'pattern',
      title: '반복 레슨 주제',
      body: `최근 레슨에서 가장 많이 다룬 주제는 **${topics.slice(0, 3).join(', ')}** 입니다. 해당 주제 관련 시각 자료나 드릴을 준비하면 레슨 효율이 높아질 수 있습니다.`,
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
  const activeClients = Object.entries(clientCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, cnt]) => `${key.split('_')[0]}(${cnt}회)`);
  if (activeClients.length > 0) {
    insights.push({
      type: 'attention',
      title: '이번 달 활발한 회원',
      body: `최근 30일 기준 레슨이 활발한 회원: **${activeClients.join(', ')}**. 지속적인 관심과 맞춤형 커리큘럼으로 성장을 가속화하세요.`,
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
      title: '장기 미레슨 회원',
      body: `**${staleClients.join(', ')}** 회원이 45일 이상 레슨이 없습니다. 재참여 유도 메시지나 목표 재설정 레슨을 고려해보세요.`,
      icon: '⏸️',
    });
  }

  // ── 4. Coach growth suggestion ─────────────────────────────────────────────
  const topicStr = topics.join(' ').toLowerCase();
  let coachGrowthMsg = '';
  if (topicStr.includes('슬라이스') || topicStr.includes('slice')) {
    coachGrowthMsg = '클럽패스와 페이스각 설명을 시각화하는 드릴 자료 강화를 추천합니다.';
  } else if (topicStr.includes('체중') || topicStr.includes('weight')) {
    coachGrowthMsg = '체중이동 감각을 위한 실전 드릴 템플릿 보강을 추천합니다.';
  } else if (topicStr.includes('퍼팅') || topicStr.includes('putting')) {
    coachGrowthMsg = '쇼트게임 교정 사례 모음 및 그린 스피드 적응 드릴을 강화해보세요.';
  } else if (topicStr.includes('어드레스') || topicStr.includes('그립')) {
    coachGrowthMsg = '입문자 셋업 템플릿을 정리하면 초급자 레슨 효율이 크게 향상됩니다.';
  } else {
    coachGrowthMsg = '레슨 패턴을 분석해 주기적으로 교육 자료를 업데이트해보세요.';
  }
  insights.push({
    type: 'coach_growth',
    title: '코치 성장 제안',
    body: coachGrowthMsg,
    icon: '📈',
  });

  // ── 5. Curriculum recommendation ──────────────────────────────────────────
  insights.push({
    type: 'curriculum',
    title: '추천 레슨 커리큘럼',
    body: topics.length > 0
      ? `현재 패턴 기반 추천 3회 커리큘럼: 1) ${topics[0] ?? '셋업 안정화'} 집중 교정 → 2) ${topics[1] ?? '임팩트 감각'} 강화 → 3) 종합 복습 및 필드 적용`
      : '첫 레슨을 기록하면 맞춤형 커리큘럼을 추천해드립니다.',
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

    const nextTopic = repeatedIssues[0] ?? recentTopics[0] ?? '기본 자세';
    const suggestedNextLesson = `${nextTopic} 집중 교정 및 이전 레슨 복습`;

    // 3-session short plan (backwards-compatible)
    const curriculumPlan = [
      `1회차: ${recentTopics[0] ?? '어드레스 재점검'} 심화`,
      `2회차: ${recentTopics[1] ?? '임팩트 감각'} 드릴 강화`,
      `3회차: 종합 복습 및 필드/라운드 적용`,
    ];

    // Extended 5-session curriculum
    const curriculumPlan5 = buildCurriculum5(recentTopics, repeatedIssues, trend, language);

    // Drill suggestions mapped to top repeated issues
    const drillSuggestions = repeatedIssues.length > 0
      ? drillsForIssue(repeatedIssues[0])
      : drillsForIssue(recentTopics[0] ?? '');

    // Verify client exists (informational – used for future backend integration)
    const clientProfile = clients.find(c => c.name === name && c.phone === phone);
    void clientProfile;

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
    } satisfies MemberGrowthReport;
  });
}

/**
 * Generate a structured coach growth profile from all lesson records.
 *
 * This powers the Coach Growth tab in CoachXHub and gives coaches a
 * data-driven view of their teaching patterns and growth opportunities.
 */
export function generateCoachGrowthProfile(
  allLessons: Lesson[],
  clients: ClientProfile[]
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
  const reports = buildMemberGrowthReports(allLessons, clients);
  const memberTrends = {
    improving: reports.filter(r => r.trendIndicator === 'improving').length,
    plateau:   reports.filter(r => r.trendIndicator === 'plateau').length,
    new:       reports.filter(r => r.trendIndicator === 'new').length,
    inactive:  reports.filter(r => r.trendIndicator === 'inactive').length,
  };

  // ── Recommended actions (supportive, data-driven) ────────────────────────────
  const recommendedActions: string[] = [];
  const topTopic = teachingStrengths[0];
  if (topTopic) {
    recommendedActions.push(
      topTopic.includes('슬라이스') || topTopic === 'slice'
        ? '슬라이스 교정 시각화 자료(클럽패스/페이스각 다이어그램) 보강을 추천합니다.'
        : topTopic.includes('어드레스') || topTopic.includes('셋업') || topTopic === 'address'
          ? '입문자 셋업 체크리스트 템플릿을 정리하면 초급 회원 레슨 효율이 높아집니다.'
          : topTopic.includes('체중') || topTopic === 'weight shift'
            ? '체중이동 감각 드릴 영상 자료를 추가하면 회원 이해도를 높일 수 있습니다.'
            : topTopic.includes('임팩트') || topTopic === 'impact'
              ? '임팩트 구간 분석 도구(임팩트백/영상 피드백)를 활용해보세요.'
              : `${topTopic} 관련 최신 드릴 자료를 보강해보세요.`
    );
  }
  if (memberTrends.plateau > 0) {
    recommendedActions.push(`정체 구간 회원이 ${memberTrends.plateau}명 있습니다. 새로운 드릴 접근법이나 주제 전환을 고려해보세요.`);
  }
  if (memberTrends.inactive > 0) {
    recommendedActions.push(`장기 미레슨 회원이 ${memberTrends.inactive}명 있습니다. 재참여 레슨이나 목표 재설정 세션을 권장합니다.`);
  }
  if (growthOpportunities.length > 0) {
    recommendedActions.push(`${growthOpportunities[0]} 영역 레슨을 늘리면 코칭 역량 다양성이 확대됩니다.`);
  }
  if (recommendedActions.length < 2) {
    recommendedActions.push('레슨 기록에 태그와 코치 노트를 꾸준히 추가하면 더 정확한 분석이 제공됩니다.');
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
 * When a real LLM backend is available, replace this function body with an API call.
 */
export function generateHeuristicResponse(
  userMessage: string,
  allLessons: Lesson[],
  clients: ClientProfile[]
): string {
  const msg = userMessage.toLowerCase();

  // Topic extraction for context-aware replies
  const topics = extractTopics(allLessons);
  const topicStr = topics.slice(0, 3).join(', ') || '다양한 주제';
  const memberCount = new Set(allLessons.map(l => `${l.clientName}_${l.clientPhone}`)).size;

  // ── Member-specific query: detect a member name in the message ─────────────
  const matchedClient = clients.find(c => msg.includes(c.name.toLowerCase()));
  if (matchedClient) {
    const memberLessons = allLessons.filter(
      l => l.clientName === matchedClient.name && l.clientPhone === matchedClient.phone
    );
    const reports = buildMemberGrowthReports(memberLessons, [matchedClient]);
    const report = reports[0];
    if (report) {
      const trendLabel =
        report.trendIndicator === 'improving' ? '📈 성장 중' :
        report.trendIndicator === 'plateau'   ? '⏸ 정체 구간' :
        report.trendIndicator === 'inactive'  ? '💤 장기 미레슨' : '🌱 초기 단계';

      return `📊 **${matchedClient.name} 회원 성장 리포트**\n\n` +
        `총 레슨: **${report.lessonCount}회** | 성장 추세: **${trendLabel}**\n` +
        (report.lastLessonDate && report.daysSinceLastLesson !== null ? `마지막 레슨: ${report.lastLessonDate} (${report.daysSinceLastLesson}일 전)\n` : '') +
        `\n**최근 집중 주제:** ${report.recentTopics.join(', ') || '기록 없음'}` +
        (report.repeatedIssues.length > 0 ? `\n**반복 교정 포인트:** ${report.repeatedIssues.join(', ')}` : '') +
        (report.strengths.length > 0 ? `\n**강화된 영역:** ${report.strengths.join(', ')}` : '') +
        `\n\n**다음 레슨 추천:** ${report.suggestedNextLesson}` +
        `\n\n**추천 드릴:**\n${report.drillSuggestions.map(d => `• ${d}`).join('\n')}` +
        `\n\n> *실제 AI 연동 시 더욱 정밀한 개인화 분석이 제공됩니다.*`;
    }
  }

  // ── Pattern-matched responses ──────────────────────────────────────────────

  if (msg.includes('커리큘럼') || msg.includes('curriculum') || msg.includes('레슨 계획') || msg.includes('lesson plan')) {
    return `📋 **추천 커리큘럼 (데이터 기반)**\n\n현재 레슨 패턴 분석 결과, 아래 순서를 추천합니다:\n\n1️⃣ **${topics[0] ?? '셋업 안정화'}** – 기초 포지셔닝 재점검\n2️⃣ **${topics[1] ?? '임팩트 감각'}** – 반복 드릴 중심\n3️⃣ **${topics[2] ?? '클럽패스 교정'}** – 탄도/방향 안정화\n4️⃣ **종합 복습** – 필드 응용 시뮬레이션\n5️⃣ **성과 측정** – 볼 데이터 기반 진도 확인\n\n> *실제 AI 연동 시 회원별 맞춤 커리큘럼이 자동 생성됩니다.*`;
  }

  if (msg.includes('정체') || msg.includes('plateau') || msg.includes('stagnation') || msg.includes('stagnating')) {
    const reports = buildMemberGrowthReports(allLessons, clients);
    const plateauMembers = reports.filter(r => r.trendIndicator === 'plateau').map(r => r.clientName);
    const inactiveMembers = reports.filter(r => r.trendIndicator === 'inactive').map(r => r.clientName);
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
    response += '\n> *더 많은 레슨 기록이 쌓일수록 분석 정확도가 높아집니다.*';
    return response;
  }

  if (msg.includes('성장') || msg.includes('progress') || msg.includes('회원') || msg.includes('member')) {
    const reports = buildMemberGrowthReports(allLessons, clients);
    const improving = reports.filter(r => r.trendIndicator === 'improving').length;
    const plateau = reports.filter(r => r.trendIndicator === 'plateau').length;
    const clientList = clients.slice(0, 3).map(c => c.name).join(', ');
    return `📊 **회원 성장 요약**\n\n담당 회원 **${memberCount}명**의 최근 레슨 데이터를 분석했습니다.\n\n- 📈 성장 중: **${improving}명**\n- ⏸ 정체 구간: **${plateau}명**\n\n주요 집중 회원: **${clientList || '기록 중...'}**\n반복 레슨 주제: **${topicStr}**\n\n각 회원의 상세 리포트는 CoachX 허브 > 회원 성장 리포트에서 확인하세요.\n\n> *더 많은 레슨 기록이 쌓일수록 분석 정확도가 높아집니다.*`;
  }

  if (msg.includes('내 레슨') || msg.includes('my lesson') || msg.includes('패턴') || msg.includes('pattern')) {
    return `🔍 **코치 레슨 패턴 분석**\n\n총 **${allLessons.length}개** 레슨 기록을 분석한 결과:\n\n- 가장 자주 다루는 주제: **${topicStr}**\n- 담당 회원 수: **${memberCount}명**\n\n**성장 제안:**\n${topics[0] ? `• ${topics[0]} 관련 시각화 드릴 자료 보강` : '• 다양한 레슨 주제를 기록해보세요'}\n• 회원별 진도 체크리스트 활용 추천\n\n> *실제 AI 연동 시 더 정밀한 패턴 분석이 제공됩니다.*`;
  }

  if (msg.includes('다음 레슨') || msg.includes('next lesson') || msg.includes('추천') || msg.includes('recommend')) {
    return `🗓️ **다음 레슨 추천**\n\n레슨 데이터 기반으로 아래를 추천합니다:\n\n- 집중 주제: **${topics[0] ?? '어드레스 및 셋업'}**\n- 병행 주제: **${topics[1] ?? '체중이동 감각'}**\n- 목표: 이전 레슨 교정 포인트 복습 + 새 드릴 도입\n\n**실전 팁:** 레슨 전 5분 스트레칭과 어드레스 체크로 시작하면 집중도가 높아집니다.\n\n> *특정 회원 이름을 포함해 질문하면 맞춤 추천이 제공됩니다.*`;
  }

  if (msg.includes('코치') && (msg.includes('성장') || msg.includes('개선') || msg.includes('교육'))) {
    return `📈 **코치 성장 분석**\n\n레슨 기록 패턴을 기반으로 다음 역량 강화를 추천합니다:\n\n1. **${topics[0] ?? '스윙 교정'} 전문성** – 해당 분야 최신 교정 드릴 학습\n2. **시각화 설명력 강화** – 영상/이미지 기반 피드백 도구 활용\n3. **결과 기반 코칭** – 볼 데이터(거리/방향)를 측정 기준으로 활용\n4. **커리큘럼 구조화** – 4~8주 레슨 플랜 템플릿 정리\n\n> *글로벌 탑 코치들은 데이터 기반 피드백과 구조화된 커리큘럼으로 회원 성과를 극대화합니다.*`;
  }

  if (msg.includes('슬라이스') || msg.includes('slice')) {
    return `🎯 **슬라이스 교정 가이드**\n\n슬라이스의 주요 원인과 교정 방법:\n\n**원인 분석:**\n• 오픈 클럽 페이스 (임팩트 시)\n• 아웃-인 클럽패스\n• 그립 압력 과다\n\n**교정 드릴:**\n1. 게이트 드릴 – 인-인 패스 훈련\n2. 그립 체크 – 약한 그립 → 중립 그립\n3. 체중이동 연습 – 왼발로의 이동 강화\n\n> *슬라이스는 3~5회 집중 레슨으로 교정 가능한 경우가 많습니다.*`;
  }

  // Default response
  return `안녕하세요! 저는 **CoachX**입니다. 🏌️\n\n코치님의 레슨 데이터를 기반으로 다양한 인사이트를 제공합니다.\n\n아래 주제로 질문해보세요:\n• "다음 레슨 추천해줘"\n• "회원 성장 분석"\n• "내 레슨 패턴 알려줘"\n• "커리큘럼 추천"\n• "코치 성장 방법"\n• "정체 중인 회원 있어?"\n• "[회원 이름] 회원 분석해줘"\n\n현재 **${allLessons.length}개** 레슨 기록, **${memberCount}명** 회원 데이터를 분석 중입니다.\n\n> *실제 AI 연동 시 더욱 정밀한 개인화 답변이 제공됩니다.*`;
}
