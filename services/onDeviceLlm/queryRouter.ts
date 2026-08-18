/**
 * queryRouter — decides whether a chat message can be answered by the
 * on-device model or must go to the server AI.
 *
 * Philosophy: the 270M-class on-device model is only trusted with queries
 * that need NO app data and NO deep reasoning — greetings, golf glossary
 * questions, short generic golf tips. Everything else (member references,
 * schedules, summaries, curriculum, stats…) routes to the server, which has
 * the lesson context and a far stronger model. When in doubt: server.
 * A misroute to the server only costs tokens; a misroute to the tiny model
 * costs answer quality, so every default falls server-side.
 */

export type RouteTarget = 'on-device' | 'server';

export interface RouteDecision {
  target: RouteTarget;
  /** Machine-readable reason, logged for observability/tuning. */
  reason:
    | 'long_query'
    | 'member_reference'
    | 'app_data_required'
    | 'greeting'
    | 'glossary'
    | 'general_golf'
    | 'default_server';
}

export interface RouteOptions {
  /** Registered client names — any mention forces the server (needs lesson data). */
  clientNames?: string[];
}

/** Beyond this length the query almost certainly needs real reasoning. */
const MAX_ON_DEVICE_QUERY_CHARS = 160;

/**
 * Keywords that mean the answer must be grounded in app data the on-device
 * model cannot see (lessons, members, reservations, analytics…).
 */
const APP_DATA_KEYWORDS = [
  // Korean
  '회원', '학생', '수강생', '레슨 기록', '지난 레슨', '일정', '스케줄', '예약',
  '요약', '인사이트', '커리큘럼', '통계', '데이터', '분석해', '분석 결과',
  '숙제', '과제', '진도', '성장', '결제', '포인트', '리포트', '보고서',
  '이번 주', '이번 달', '오늘', '내일', '어제', '최근',
  // English
  'member', 'student', 'client', 'lesson record', 'schedule', 'reservation',
  'booking', 'summary', 'summarize', 'insight', 'curriculum', 'stats',
  'statistics', 'homework', 'progress', 'payment', 'report',
  'this week', 'this month', 'today', 'tomorrow', 'yesterday', 'recent',
  // Japanese
  '会員', '生徒', 'レッスン記録', 'スケジュール', '予約', '要約',
  'インサイト', 'カリキュラム', '統計', '宿題', '進度', '決済', 'レポート',
  '今週', '今月', '今日', '明日', '昨日', '最近',
];

const GREETING_PATTERNS = [
  /^(안녕|하이|반가워|고마워|감사|잘\s*지냈|좋은\s*(아침|하루|저녁))/,
  /^(hi|hello|hey|thanks|thank you|good\s*(morning|afternoon|evening))\b/i,
  /^(こんにちは|こんばんは|おはよう|ありがとう|やあ)/,
];

/** "X가 뭐야?"-style definition/glossary questions. */
const GLOSSARY_PATTERNS = [
  /(뭐야|뭐예요|뭔가요|무엇|뜻이|의미가|용어)/,
  /\b(what\s+is|what's|meaning\s+of|definition\s+of)\b/i,
  /(とは|意味|って何)/,
];

/**
 * Generic golf vocabulary — presence + short length + question form makes a
 * query eligible for a quick on-device answer.
 */
const GOLF_KEYWORDS = [
  '슬라이스', '훅', '그립', '스탠스', '어드레스', '백스윙', '다운스윙',
  '임팩트', '피니쉬', '퍼팅', '어프로치', '드라이버', '아이언', '웨지',
  '벙커', '티샷', '스윙', '탄도', '비거리', '체중이동', '클럽', '캐디',
  '핸디캡', '파', '버디', '보기', '이글', '멀리건', '오비', '해저드',
  'slice', 'hook', 'grip', 'stance', 'address', 'backswing', 'downswing',
  'impact', 'finish', 'putting', 'approach', 'driver', 'iron', 'wedge',
  'bunker', 'tee', 'swing', 'launch', 'distance', 'weight shift', 'club',
  'handicap', 'par', 'birdie', 'bogey', 'eagle', 'mulligan',
  'スライス', 'フック', 'グリップ', 'スイング', 'パター', 'ドライバー',
  'アイアン', 'バンカー', 'ハンディキャップ',
];

const containsAny = (haystack: string, needles: string[]): boolean =>
  needles.some((n) => haystack.includes(n));

/**
 * Decide where a chat query should run. Pure and synchronous so it is
 * trivially testable and adds zero latency to the chat path.
 */
export const routeChatQuery = (
  userMessage: string,
  opts: RouteOptions = {}
): RouteDecision => {
  const msg = userMessage.trim();
  const lower = msg.toLowerCase();

  if (msg.length > MAX_ON_DEVICE_QUERY_CHARS) {
    return { target: 'server', reason: 'long_query' };
  }

  // Any mention of a registered member needs their lesson history.
  const clientNames = (opts.clientNames ?? []).filter((n) => n && n.length >= 2);
  if (clientNames.some((name) => msg.includes(name))) {
    return { target: 'server', reason: 'member_reference' };
  }

  if (containsAny(lower, APP_DATA_KEYWORDS.map((k) => k.toLowerCase()))) {
    return { target: 'server', reason: 'app_data_required' };
  }

  if (GREETING_PATTERNS.some((p) => p.test(msg))) {
    return { target: 'on-device', reason: 'greeting' };
  }

  if (GLOSSARY_PATTERNS.some((p) => p.test(msg))) {
    return { target: 'on-device', reason: 'glossary' };
  }

  // Short generic golf question ("슬라이스 어떻게 고쳐?", "how to fix my hook?")
  const looksLikeQuestion =
    /[?？]/.test(msg) ||
    /(어떻게|어떡|방법|알려줘|왜|how|why|tip|どう|なぜ|教えて)/i.test(msg);
  if (looksLikeQuestion && containsAny(lower, GOLF_KEYWORDS.map((k) => k.toLowerCase()))) {
    return { target: 'on-device', reason: 'general_golf' };
  }

  return { target: 'server', reason: 'default_server' };
};
