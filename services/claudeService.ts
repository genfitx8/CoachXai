import Anthropic from '@anthropic-ai/sdk';
import {
  ClientProfile,
  Lesson,
  TrainingProgramConfig,
  QuickLogEntry,
  WeeklyInsight,
  CoachProfile,
} from '../types';
import {
  CoachXLanguage,
  CoachXInsight,
  CoachGrowthProfile,
  generateHeuristicResponse,
  generateCoachInsights,
  generateCoachGrowthProfile,
} from './coachXService';
import { promptService } from './promptService';
import { firebaseService } from './firebase';
import { createLogger } from '../utils/logger';

const log = createLogger('claude');

const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

if (!apiKey) {
  log.warn('Anthropic API key is not set. AI features will use fallback responses.');
}

const claude = apiKey
  ? new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  : null;

const MODEL = 'claude-opus-4-7';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!claude) throw new Error('Anthropic API key is not configured.');

  const response = await claude.messages.create({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text' || !textBlock.text.trim()) {
    throw new Error('Empty response from Claude');
  }
  return textBlock.text;
}

async function callClaudeJSON<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  const text = await callClaude(systemPrompt, userPrompt);
  const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON in Claude response');
  return JSON.parse(jsonMatch[0]) as T;
}

// ─── Language constants ───────────────────────────────────────────────────────

const LANG_INSTRUCTION: Record<CoachXLanguage, string> = {
  ko: '반드시 한국어로 답변하세요.',
  en: 'Respond entirely in English.',
  ja: '必ず日本語で回答してください。',
  th: 'Respond entirely in English.',
};

const MOOD_LABELS: Record<string, string> = {
  GREAT: '매우 좋음',
  GOOD: '좋음',
  OKAY: '보통',
  BAD: '나쁨',
  TERRIBLE: '매우 나쁨',
};

const AREA_LABELS: Record<string, string> = {
  DRIVER: '드라이버',
  IRON: '아이언',
  SHORT_GAME: '숏게임',
  PUTTING: '퍼팅',
  ROUND: '라운드',
  OTHER: '기타',
};

const COACHX_TOPIC_KEYWORDS = [
  '슬라이스', '훅', '어드레스', '그립', '백스윙', '임팩트', '체중이동', '퍼팅', '어프로치', '드라이버', '아이언',
  'slice', 'hook', 'address', 'grip', 'backswing', 'impact', 'putting', 'driver',
];

const COACHX_VALID_INSIGHT_TYPES = new Set(['pattern', 'attention', 'curriculum', 'coach_growth', 'stagnation']);

const COACHX_INSIGHT_ICON_MAP: Record<string, string> = {
  pattern: '🔄',
  attention: '⭐',
  curriculum: '🗓️',
  coach_growth: '📈',
  stagnation: '⏸️',
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates personalized daily mission suggestions using Claude.
 */
export const generateGolfMissions = async (
  profile: ClientProfile,
  recentLessons: Lesson[]
): Promise<string[]> => {
  if (!claude) {
    return [
      '빈 스윙 50회 하며 리듬 익히기',
      '퍼팅 스트로크 연습 10분',
      '스트레칭 5분으로 유연성 기르기',
    ];
  }

  try {
    const handicapInfo = profile.handicap ? `핸디캡: ${profile.handicap}` : '핸디캡 정보 없음 (초보자 가정)';
    const goalInfo = profile.memo ? `사용자 목표: ${profile.memo}` : '특별한 목표 없음 (기본기 향상)';
    const bestScoreInfo = profile.bestScore ? `라베: ${profile.bestScore}` : '';

    const recentContext = recentLessons
      .slice(0, 3)
      .map((l, i) => `레슨 ${i + 1} (${l.date}): 코치메모-[${l.coachNotes}], AI분석-[${l.aiAnalysis || '없음'}]`)
      .join('\n');

    const userPrompt = `
회원 정보:
- ${handicapInfo}
${bestScoreInfo ? `- ${bestScoreInfo}` : ''}
- ${goalInfo}

최근 레슨 및 연습 기록:
${recentContext || '최근 기록이 없습니다. 일반적인 기초 연습을 추천해주세요.'}

오늘 수행하면 좋을 맞춤형 연습 과제(미션) 3가지를 추천해주세요.
각 미션은 "드라이버 빈스윙 20회", "퍼팅 거리감 연습 10분" 처럼 명확하고 20자 내외의 행동 지침이어야 합니다.
JSON 배열 형태로만 출력해주세요. 예: ["미션1", "미션2", "미션3"]
`.trim();

    return await callClaudeJSON<string[]>(
      '당신은 회원의 골프 실력 향상을 돕는 AI 전담 코치입니다.',
      userPrompt
    );
  } catch (error) {
    log.error('Generate Missions Error:', error);
    return ['빈 스윙 50회 하며 리듬 익히기', '퍼팅 스트로크 연습 10분', '스트레칭 5분으로 유연성 기르기'];
  }
};

/**
 * Generates a structured training program using Claude.
 */
export const generateTrainingProgram = async (
  profile: ClientProfile,
  lessons: Lesson[],
  config: TrainingProgramConfig
): Promise<string> => {
  const fallbackPlan = (goal: string) => `## 훈련 프로그램 (기본 플랜)

> AI 서비스가 일시적으로 사용 불가능하여 기본 플랜을 제공합니다.

### 목표: ${goal}

**1주차** – 기초 점검
- 어드레스·그립·스탠스 교정
- 빈스윙 50회 (리듬·템포 확인)
- 퍼팅 직선 스트로크 20분

**2주차** – 반복 훈련
- 7번 아이언 50볼 집중 연습
- 숏게임 칩샷 30분
- 피니시 자세 유지 연습

**3주차** – 응용 훈련
- 필드 또는 스크린 라운드 1회
- 부족한 클럽 집중 연습 30분
- 멘탈·루틴 점검

**4주차** – 점검 및 정리
- 전체 스윙 영상 셀프 촬영 후 비교
- 코치 피드백 반영 교정 집중
- 목표 재설정
`;

  if (!claude) return fallbackPlan(config.performanceGoal);

  try {
    const handicapInfo = profile.handicap ? `핸디캡: ${profile.handicap}` : '핸디캡 정보 없음 (초보자 가정)';
    const bestScoreInfo = profile.bestScore ? `라베: ${profile.bestScore}` : '';
    const goalInfo = profile.memo ? `사용자 메모/목표: ${profile.memo}` : '';

    const lessonContext = lessons.length === 0
      ? '레슨 기록 없음 (기본기 중심으로 구성해 주세요)'
      : lessons.slice(0, 10).map((l, i) => {
          const parts = [`레슨 ${i + 1} (${l.date}, ${l.title})`];
          if (l.coachNotes) parts.push(`코치메모: ${l.coachNotes}`);
          if (l.aiAnalysis) parts.push(`AI분석: ${l.aiAnalysis}`);
          if (l.golfData?.carryDistance) parts.push(`캐리거리: ${l.golfData.carryDistance}m`);
          if (l.tags?.length) parts.push(`태그: ${l.tags.join(', ')}`);
          return parts.join(' | ');
        }).join('\n');

    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const start = new Date(config.startDate).getTime();
    const end = new Date(config.endDate).getTime();
    const weeks = Math.max(1, Math.round((end - start) / msPerWeek));

    const userPrompt = `
회원 정보:
- 이름: ${profile.name}
- ${handicapInfo}
${bestScoreInfo ? `- ${bestScoreInfo}` : ''}
${goalInfo ? `- ${goalInfo}` : ''}

프로그램 설정:
- 기간: ${config.startDate} ~ ${config.endDate} (약 ${weeks}주)
- 주간 훈련 빈도: 주 ${config.frequencyPerWeek}회
- 회당 훈련 시간: ${config.sessionDurationMinutes}분
- 향상 목표: ${config.performanceGoal}

최근 레슨 기록 요약:
${lessonContext}

위 정보를 바탕으로 주차별 맞춤형 훈련 프로그램을 마크다운 형식으로 한국어로 작성해주세요.
`.trim();

    return await callClaude('당신은 전문 골프 코치 AI입니다. 맞춤형 훈련 프로그램을 작성해주세요.', userPrompt);
  } catch (error) {
    log.error('Generate Training Program Error:', error);
    return fallbackPlan(config.performanceGoal);
  }
};

/**
 * Generates a weekly AI insight summary using Claude.
 */
export const generateWeeklyInsight = async (
  logs: QuickLogEntry[],
  recentLessons: Lesson[] = [],
  clientProfile?: ClientProfile
): Promise<Pick<WeeklyInsight, 'summary' | 'keyPatterns' | 'recommendedFocus'>> => {
  const fallback = (): Pick<WeeklyInsight, 'summary' | 'keyPatterns' | 'recommendedFocus'> => {
    const goodPoints = logs.map((l) => l.goodPoint).filter(Boolean);
    const problems = logs.map((l) => l.problemPoint).filter(Boolean);
    return {
      summary: `이번 주 ${logs.length}건의 기록을 바탕으로 분석한 결과입니다.`,
      keyPatterns: [
        goodPoints.length > 0 ? `잘된 점: ${goodPoints[0]}` : '',
        problems.length > 0 ? `개선 필요: ${problems[0]}` : '',
      ].filter(Boolean),
      recommendedFocus: problems.length > 0
        ? `${problems[0]} 개선에 집중하세요.`
        : '꾸준한 기록과 연습을 이어가세요.',
    };
  };

  if (!claude || logs.length === 0) return fallback();

  try {
    const logSummaries = logs.map((l, i) => {
      const parts = [
        `기록 ${i + 1} (${l.logDate})`,
        `컨디션: ${MOOD_LABELS[l.mood] ?? l.mood}`,
        `잘된 점: ${l.goodPoint}`,
        `문제점: ${l.problemPoint}`,
      ];
      if (l.practiceArea) parts.push(`연습 영역: ${AREA_LABELS[l.practiceArea] ?? l.practiceArea}`);
      if (l.notes) parts.push(`메모: ${l.notes}`);
      return parts.join(' | ');
    }).join('\n');

    const lessonContext = recentLessons.length === 0
      ? ''
      : '\n\n최근 레슨 기록 (참고용):\n' + recentLessons.slice(0, 5).map((l, i) => {
          const parts = [`레슨 ${i + 1} (${l.date}): ${l.title}`];
          if (l.coachNotes) parts.push(`코치노트: ${l.coachNotes}`);
          return parts.join(' | ');
        }).join('\n');

    const profileContext = clientProfile
      ? `\n회원: ${clientProfile.name}${clientProfile.handicap ? `, 핸디캡 ${clientProfile.handicap}` : ''}`
      : '';

    const userPrompt = `${profileContext ? profileContext + '\n' : ''}
이번 주 빠른 기록 ${logs.length}건:
${logSummaries}${lessonContext}

반드시 아래 JSON 형식으로만 응답하세요:
{
  "summary": "이번 주 전반적인 흐름 2~3문장 요약",
  "keyPatterns": ["패턴1", "패턴2"],
  "recommendedFocus": "다음 주 핵심 집중 포인트 제안"
}`.trim();

    const result = await callClaudeJSON<{
      summary: string;
      keyPatterns: string[];
      recommendedFocus: string;
    }>('당신은 전문 골프 코치 AI입니다. 회원의 주간 연습 기록을 분석해 인사이트를 제공합니다.', userPrompt);

    if (!result.summary || !Array.isArray(result.keyPatterns) || !result.recommendedFocus) {
      throw new Error('Invalid JSON structure');
    }
    return result;
  } catch (error) {
    log.error('Generate Weekly Insight Error:', error);
    return fallback();
  }
};

/**
 * Generates a Claude-backed CoachX chat response.
 */
export const generateCoachXChatResponse = async (
  userMessage: string,
  allLessons: Lesson[],
  clients: ClientProfile[],
  language: CoachXLanguage = 'ko'
): Promise<string> => {
  const fallback = () => generateHeuristicResponse(userMessage, allLessons, clients, language);

  if (!claude) return fallback();

  try {
    const memberCount = new Set(allLessons.map((l) => `${l.clientName}_${l.clientPhone}`)).size;

    const recentLessons = [...allLessons]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 15);

    const lessonContext = recentLessons.length > 0
      ? recentLessons.map((l) => {
          const parts = [`[${l.date}] ${l.title}`];
          if (l.clientName) parts.push(`Member: ${l.clientName}`);
          if (l.coachNotes) parts.push(`Note: ${l.coachNotes}`);
          if (l.tags?.length) parts.push(`Tags: ${l.tags.join(', ')}`);
          return parts.join(' | ');
        }).join('\n')
      : 'No lesson records yet.';

    const clientContext = clients.length > 0
      ? clients.slice(0, 15).map((c) => {
          const parts = [c.name];
          if (c.handicap) parts.push(`handicap ${c.handicap}`);
          return parts.join(', ');
        }).join('; ')
      : 'No registered clients.';

    const isFirebaseMode = firebaseService.isInitialized();
    const systemPrompt = await promptService.getActiveSystemPrompt('coachx_chat', isFirebaseMode);

    const userPrompt = `
Coach context:
- Total lesson records: ${allLessons.length}
- Total members: ${memberCount}
- Registered clients: ${clientContext}

Recent lesson history (up to 15 most recent):
${lessonContext}

Coach's question: "${userMessage}"

Language instruction: ${LANG_INSTRUCTION[language]}`.trim();

    return await callClaude(systemPrompt, userPrompt);
  } catch (error) {
    log.error('CoachX Claude chat error:', error);
    return fallback();
  }
};

/**
 * Generates Claude-backed CoachX insights for the coach dashboard.
 */
export const generateCoachXInsights = async (
  allLessons: Lesson[],
  coachProfile: CoachProfile,
  language: CoachXLanguage = 'ko'
): Promise<CoachXInsight[]> => {
  const fallback = () => generateCoachInsights(allLessons, coachProfile, language);

  if (!claude || allLessons.length === 0) return fallback();

  try {
    const memberCount = new Set(allLessons.map((l) => `${l.clientName}_${l.clientPhone}`)).size;

    const topicCounts: Record<string, number> = {};
    for (const l of allLessons) {
      const text = `${l.title} ${l.coachNotes ?? ''} ${(l.tags ?? []).join(' ')}`.toLowerCase();
      for (const kw of COACHX_TOPIC_KEYWORDS) {
        if (text.includes(kw)) topicCounts[kw] = (topicCounts[kw] ?? 0) + 1;
      }
    }
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k}(${v})`)
      .join(', ');

    const cutoff30 = Date.now() - 30 * 86_400_000;
    const recentCount = allLessons.filter((l) => l.createdAt >= cutoff30).length;

    const clientLastLesson: Record<string, number> = {};
    for (const l of allLessons) {
      const key = `${l.clientName}_${l.clientPhone}`;
      if (!clientLastLesson[key] || l.createdAt > clientLastLesson[key]) {
        clientLastLesson[key] = l.createdAt;
      }
    }
    const staleCutoff = Date.now() - 45 * 86_400_000;
    const staleMembers = Object.entries(clientLastLesson)
      .filter(([, t]) => t < staleCutoff)
      .map(([k]) => k.split('_')[0]);

    const isFirebaseMode = firebaseService.isInitialized();
    const systemPrompt = await promptService.getActiveSystemPrompt('coachx_insights', isFirebaseMode);

    const userPrompt = `
Coach: ${coachProfile.name}
Total lessons: ${allLessons.length} | Members: ${memberCount}
Lessons last 30 days: ${recentCount}
Most frequent lesson topics: ${topTopics || 'none recorded'}
Members inactive 45+ days: ${staleMembers.length > 0 ? staleMembers.slice(0, 5).join(', ') : 'none'}

Language instruction: ${LANG_INSTRUCTION[language]}

Respond with a JSON array of insights. Example:
[
  {"type":"pattern","title":"슬라이스 교정 집중 구간","body":"..."},
  {"type":"attention","title":"High activity members this month","body":"..."}
]`.trim();

    const parsed = await callClaudeJSON<CoachXInsight[]>(systemPrompt, userPrompt);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty insight array');

    return parsed
      .filter((i) => i.title && i.body && COACHX_VALID_INSIGHT_TYPES.has(i.type))
      .map((i) => ({ ...i, icon: COACHX_INSIGHT_ICON_MAP[i.type] ?? '💡' }));
  } catch (error) {
    log.error('CoachX Claude insights error:', error);
    return fallback();
  }
};

/**
 * Generates a Claude-backed CoachX coach growth profile.
 */
export const generateCoachXGrowthProfile = async (
  allLessons: Lesson[],
  clients: ClientProfile[],
  coachProfile: CoachProfile,
  language: CoachXLanguage = 'ko'
): Promise<CoachGrowthProfile> => {
  const fallback = () => generateCoachGrowthProfile(allLessons, clients, language);

  if (!claude || allLessons.length === 0) return fallback();

  const heuristicProfile = generateCoachGrowthProfile(allLessons, clients, language);

  try {
    const memberCount = new Set(allLessons.map((l) => `${l.clientName}_${l.clientPhone}`)).size;

    const topTopics = heuristicProfile.topicBreakdown
      .slice(0, 5)
      .map((t) => `${t.topic}(${t.count})`)
      .join(', ');

    const growthOpp = heuristicProfile.growthOpportunities.join(', ') || 'none identified';

    const { memberTrends } = heuristicProfile;
    const trendSummary = `improving:${memberTrends.improving}, plateau:${memberTrends.plateau}, new:${memberTrends.new}, inactive:${memberTrends.inactive}`;

    const userPrompt = `
Coach: ${coachProfile.name}
Total lessons recorded: ${allLessons.length} | Total members: ${memberCount}
Lessons this month: ${heuristicProfile.lessonsThisMonth} | Last month: ${heuristicProfile.lessonsLastMonth}
Active members (last 90 days): ${heuristicProfile.activeMembersCount}
Avg sessions per active member: ${heuristicProfile.avgSessionsPerActiveMember}
Top lesson topics (with frequency): ${topTopics || 'none recorded'}
Potential coaching expansion areas: ${growthOpp}
Member growth trends: ${trendSummary}

${LANG_INSTRUCTION[language]}

Return ONLY a valid JSON object:
{
  "recommendedActions": ["Action 1...", "Action 2...", "Action 3..."],
  "geminiSummary": "Your coaching practice this month..."
}`.trim();

    const parsed = await callClaudeJSON<{ recommendedActions?: string[]; geminiSummary?: string }>(
      'You are CoachX, an AI coaching intelligence assistant for golf coaches.',
      userPrompt
    );

    const actions =
      Array.isArray(parsed.recommendedActions) && parsed.recommendedActions.length > 0
        ? parsed.recommendedActions.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
        : heuristicProfile.recommendedActions;

    const summary =
      typeof parsed.geminiSummary === 'string' && parsed.geminiSummary.trim().length > 0
        ? parsed.geminiSummary.trim()
        : undefined;

    return { ...heuristicProfile, recommendedActions: actions, geminiSummary: summary };
  } catch (error) {
    log.error('CoachX Claude growth profile error:', error);
    return fallback();
  }
};
