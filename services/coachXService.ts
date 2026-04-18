/**
 * CoachX Intelligence Service
 *
 * Provides heuristic-driven insights for coaches based on lesson records.
 * Designed to be extensible: when a live AI backend is available, swap
 * `generateCoachXResponse` for a real LLM call without changing callers.
 */

import { Lesson, ClientProfile, CoachProfile } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CoachXInsight {
  type: 'pattern' | 'attention' | 'curriculum' | 'coach_growth';
  title: string;
  body: string;
  icon: string;
}

export interface MemberGrowthReport {
  clientName: string;
  clientPhone: string;
  lessonCount: number;
  recentTopics: string[];
  repeatedIssues: string[];
  strengths: string[];
  suggestedNextLesson: string;
  curriculumPlan: string[];
  attentionLevel: 'high' | 'medium' | 'low';
}

export interface CoachXChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
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

  // ── 3. Coach growth suggestion ─────────────────────────────────────────────
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

  // ── 4. Curriculum recommendation ──────────────────────────────────────────
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
  clients: ClientProfile[]
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
    const dsl = lastLesson ? daysSince(lastLesson.date) : 999;
    const level = attentionLevel(lessons.length, dsl);

    const nextTopic = repeatedIssues[0] ?? recentTopics[0] ?? '기본 자세';
    const suggestedNextLesson = `${nextTopic} 집중 교정 및 이전 레슨 복습`;

    const curriculumPlan = [
      `1회차: ${recentTopics[0] ?? '어드레스 재점검'} 심화`,
      `2회차: ${recentTopics[1] ?? '임팩트 감각'} 드릴 강화`,
      `3회차: 종합 복습 및 필드/라운드 적용`,
    ];

    // Verify client exists
    const clientProfile = clients.find(c => c.name === name && c.phone === phone);
    void clientProfile; // informational – used for future backend integration

    return {
      clientName: name,
      clientPhone: phone,
      lessonCount: lessons.length,
      recentTopics,
      repeatedIssues,
      strengths,
      suggestedNextLesson,
      curriculumPlan,
      attentionLevel: level,
    } satisfies MemberGrowthReport;
  });
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

  // Pattern-matched responses
  if (msg.includes('커리큘럼') || msg.includes('curriculum') || msg.includes('레슨 계획') || msg.includes('lesson plan')) {
    return `📋 **추천 커리큘럼 (데이터 기반)**\n\n현재 레슨 패턴 분석 결과, 아래 순서를 추천합니다:\n\n1️⃣ **${topics[0] ?? '셋업 안정화'}** – 기초 포지셔닝 재점검\n2️⃣ **${topics[1] ?? '임팩트 감각'}** – 반복 드릴 중심\n3️⃣ **${topics[2] ?? '클럽패스 교정'}** – 탄도/방향 안정화\n4️⃣ **종합 복습** – 필드 응용 시뮬레이션\n\n> *실제 AI 연동 시 회원별 맞춤 커리큘럼이 자동 생성됩니다.*`;
  }

  if (msg.includes('성장') || msg.includes('progress') || msg.includes('회원') || msg.includes('member')) {
    const clientList = clients.slice(0, 3).map(c => c.name).join(', ');
    return `📊 **회원 성장 요약**\n\n담당 회원 **${memberCount}명**의 최근 레슨 데이터를 분석했습니다.\n\n주요 집중 회원: **${clientList || '기록 중...'}**\n반복 레슨 주제: **${topicStr}**\n\n각 회원의 상세 리포트는 CoachX 허브 > 회원 성장 리포트에서 확인하세요.\n\n> *더 많은 레슨 기록이 쌓일수록 분석 정확도가 높아집니다.*`;
  }

  if (msg.includes('내 레슨') || msg.includes('my lesson') || msg.includes('패턴') || msg.includes('pattern')) {
    return `🔍 **코치 레슨 패턴 분석**\n\n총 **${allLessons.length}개** 레슨 기록을 분석한 결과:\n\n- 가장 자주 다루는 주제: **${topicStr}**\n- 담당 회원 수: **${memberCount}명**\n\n**성장 제안:**\n${topics[0] ? `• ${topics[0]} 관련 시각화 드릴 자료 보강` : '• 다양한 레슨 주제를 기록해보세요'}\n• 회원별 진도 체크리스트 활용 추천\n\n> *실제 AI 연동 시 더 정밀한 패턴 분석이 제공됩니다.*`;
  }

  if (msg.includes('다음 레슨') || msg.includes('next lesson') || msg.includes('추천') || msg.includes('recommend')) {
    return `🗓️ **다음 레슨 추천**\n\n레슨 데이터 기반으로 아래를 추천합니다:\n\n- 집중 주제: **${topics[0] ?? '어드레스 및 셋업'}**\n- 병행 주제: **${topics[1] ?? '체중이동 감각'}**\n- 목표: 이전 레슨 교정 포인트 복습 + 새 드릴 도입\n\n**실전 팁:** 레슨 전 5분 스트레칭과 어드레스 체크로 시작하면 집중도가 높아집니다.\n\n> *특정 회원을 선택하면 맞춤 추천이 제공됩니다.*`;
  }

  if (msg.includes('코치') && (msg.includes('성장') || msg.includes('개선') || msg.includes('교육'))) {
    return `📈 **코치 성장 분석**\n\n레슨 기록 패턴을 기반으로 다음 역량 강화를 추천합니다:\n\n1. **${topics[0] ?? '스윙 교정'} 전문성** – 해당 분야 최신 교정 드릴 학습\n2. **시각화 설명력 강화** – 영상/이미지 기반 피드백 도구 활용\n3. **결과 기반 코칭** – 볼 데이터(거리/방향)를 측정 기준으로 활용\n4. **커리큘럼 구조화** – 4~8주 레슨 플랜 템플릿 정리\n\n> *글로벌 탑 코치들은 데이터 기반 피드백과 구조화된 커리큘럼으로 회원 성과를 극대화합니다.*`;
  }

  if (msg.includes('슬라이스') || msg.includes('slice')) {
    return `🎯 **슬라이스 교정 가이드**\n\n슬라이스의 주요 원인과 교정 방법:\n\n**원인 분석:**\n• 오픈 클럽 페이스 (임팩트 시)\n• 아웃-인 클럽패스\n• 그립 압력 과다\n\n**교정 드릴:**\n1. 게이트 드릴 – 인-인 패스 훈련\n2. 그립 체크 – 약한 그립 → 중립 그립\n3. 체중이동 연습 – 왼발로의 이동 강화\n\n> *슬라이스는 3~5회 집중 레슨으로 교정 가능한 경우가 많습니다.*`;
  }

  // Default response
  return `안녕하세요! 저는 **CoachX**입니다. 🏌️\n\n코치님의 레슨 데이터를 기반으로 다양한 인사이트를 제공합니다.\n\n아래 주제로 질문해보세요:\n• "다음 레슨 추천해줘"\n• "회원 성장 분석"\n• "내 레슨 패턴 알려줘"\n• "커리큘럼 추천"\n• "코치 성장 방법"\n\n현재 **${allLessons.length}개** 레슨 기록, **${memberCount}명** 회원 데이터를 분석 중입니다.\n\n> *실제 AI 연동 시 더욱 정밀한 개인화 답변이 제공됩니다.*`;
}
