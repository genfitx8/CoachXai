/**
 * Shared lesson-context formatters for AI prompts.
 *
 * Both the coach's CoachX chat and the student's chat need to feed rich
 * per-lesson data (golf metrics, motion capture, scorecard, notes) into
 * their prompts. Previously the coach chat had a much thinner projection
 * (title + coach note + tags only) than the student chat, so the model
 * had to answer coach questions with less to ground on.
 *
 * This module centralises the formatting so both surfaces share the same
 * detail level, and adds a coach-side member activity overview.
 */

import { ClientProfile, Lesson } from '../types';

const RECORD_TYPE_LABELS: Record<string, string> = {
  SCORE: '라운드',
  PRACTICE: '연습',
  LESSON: '레슨',
  LIVE_LESSON: '레슨 동반',
};

export interface FormatLessonEntryOptions {
  /** Include the client's name in the header (needed for coach-side chat). */
  includeClientName?: boolean;
  /** Cap for coachNotes / aiAnalysis excerpts. Defaults to 300. */
  maxNoteLength?: number;
}

/**
 * Format a single lesson entry as a multi-line block including any
 * available golf metrics, motion capture highlights, scorecard summary,
 * and coach/AI notes. Empty when there's nothing to say.
 */
export const formatLessonEntry = (
  lesson: Lesson,
  options: FormatLessonEntryOptions = {}
): string => {
  const { includeClientName = false, maxNoteLength = 300 } = options;
  const typeLabel = RECORD_TYPE_LABELS[lesson.recordType ?? 'LESSON'] ?? '레슨';

  const headerBits = [`[${lesson.date}] ${lesson.title}`];
  if (includeClientName && lesson.clientName) {
    headerBits.push(`· ${lesson.clientName}`);
  }
  headerBits.push(`(${typeLabel}${lesson.club ? ` · ${lesson.club}` : ''})`);
  const parts: string[] = [headerBits.join(' ')];

  if (lesson.coachNotes) {
    parts.push(`  코치 노트: ${lesson.coachNotes.substring(0, maxNoteLength)}`);
  }
  if (lesson.aiAnalysis) {
    parts.push(`  AI 분석: ${lesson.aiAnalysis.substring(0, maxNoteLength)}`);
  }

  // 레슨 동반 기록: 필기(레슨 내용 텍스트) 발췌를 함께 실어 코칭 멘트
  // 원문까지 모델이 그라운딩할 수 있게 한다.
  if (lesson.liveLessonDetail?.transcript?.length) {
    const detail = lesson.liveLessonDetail;
    const joined = detail.transcript.map((entry) => entry.text).join(' ');
    parts.push(
      `  레슨 동반 필기(${detail.transcript.length}줄): ${joined.substring(0, maxNoteLength)}`
    );
    if (detail.keyPoints?.length) {
      parts.push(`  교정 포인트: ${detail.keyPoints.slice(0, 6).join(', ')}`);
    }
    if (detail.drills?.length) {
      parts.push(`  드릴: ${detail.drills.slice(0, 6).join(', ')}`);
    }
  }

  if (lesson.golfData) {
    const gd = lesson.golfData;
    const nums: string[] = [];
    if (gd.ballSpeed != null) nums.push(`볼속도 ${gd.ballSpeed}km/h`);
    if (gd.clubHeadSpeed != null) nums.push(`헤드속도 ${gd.clubHeadSpeed}km/h`);
    if (gd.carryDistance != null) nums.push(`캐리 ${gd.carryDistance}m`);
    if (gd.totalDistance != null) nums.push(`총거리 ${gd.totalDistance}m`);
    if (gd.launchAngle != null) nums.push(`런치앵글 ${gd.launchAngle}°`);
    if (gd.backSpin != null) nums.push(`백스핀 ${gd.backSpin}rpm`);
    if (gd.sideSpin != null) nums.push(`사이드스핀 ${gd.sideSpin}rpm`);
    if (gd.smashFactor != null) nums.push(`스매시팩터 ${gd.smashFactor}`);
    if (gd.clubPath != null) nums.push(`클럽패스 ${gd.clubPath}°`);
    if (gd.faceAngle != null) nums.push(`페이스앵글 ${gd.faceAngle}°`);
    if (nums.length) parts.push(`  구질 데이터: ${nums.join(' | ')}`);
  }

  if (lesson.motionCaptureData?.measurements?.length) {
    const mc = lesson.motionCaptureData;
    const nums: string[] = [];
    mc.measurements.forEach((m) => {
      const p = m.swingPhase ? `[${m.swingPhase}] ` : '';
      if (m.headLift != null && m.headLift !== 0) nums.push(`${p}머리들림 ${m.headLift}cm`);
      if (m.hipSlide != null && m.hipSlide !== 0) nums.push(`${p}힙슬라이드 ${m.hipSlide}cm`);
      if (m.upperBodyPush != null && m.upperBodyPush !== 0)
        nums.push(`${p}상체밀림 ${m.upperBodyPush}cm`);
      if (m.headLateralSway != null && m.headLateralSway !== 0)
        nums.push(`${p}머리흔들림 ${m.headLateralSway}cm`);
      if (m.upperBodyLift != null && m.upperBodyLift !== 0)
        nums.push(`${p}상체들림 ${m.upperBodyLift}cm`);
    });
    if (nums.length) parts.push(`  모션캡처: ${nums.slice(0, 6).join(' | ')}`);
    if (mc.aiAnalysis) parts.push(`  모션 분석: ${mc.aiAnalysis.substring(0, 200)}`);
  }

  if (lesson.scorecardDetail) {
    const sc = lesson.scorecardDetail;
    parts.push(`  스코어카드: ${sc.courseName} | ${sc.totalScore}타 | 퍼팅 ${sc.totalPutts}개`);
    const badHoles = sc.holes
      .filter((h) => h.score > h.par + 2)
      .map((h) => `홀${h.holeNumber}(${h.score}타·${h.putts}퍼팅)`);
    if (badHoles.length) parts.push(`  어려웠던 홀: ${badHoles.slice(0, 6).join(', ')}`);
    const gir = sc.holes.filter((h) => h.score <= h.par).length;
    parts.push(`  파온: ${gir}홀/${sc.holes.length}홀`);
  }

  if (lesson.tags?.length) parts.push(`  태그: ${lesson.tags.join(', ')}`);

  return parts.join('\n');
};

const TOPIC_KEYWORDS = [
  '슬라이스', '훅', '어드레스', '셋업', '그립', '스탠스', '백스윙', '다운스윙',
  '임팩트', '피니쉬', '체중이동', '클럽패스', '페이스각', '퍼팅', '어프로치',
  '드라이버', '아이언', '웨지', '쇼트게임', '탑', '리듬',
];

const topLessonTopics = (lessons: Lesson[], limit = 3): string[] => {
  const counts: Record<string, number> = {};
  for (const l of lessons) {
    const text = `${l.title} ${l.coachNotes ?? ''} ${(l.tags ?? []).join(' ')}`.toLowerCase();
    for (const kw of TOPIC_KEYWORDS) {
      if (text.includes(kw.toLowerCase())) counts[kw] = (counts[kw] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([kw]) => kw);
};

const latestCarryDistance = (lessons: Lesson[]): number | null => {
  for (const l of lessons) {
    if (l.golfData?.carryDistance != null) return l.golfData.carryDistance;
  }
  return null;
};

const latestScore = (lessons: Lesson[]): number | null => {
  for (const l of lessons) {
    if (l.score != null) return l.score;
    if (l.scorecardDetail?.totalScore != null) return l.scorecardDetail.totalScore;
  }
  return null;
};

export interface BuildMemberActivityOverviewOptions {
  /** Maximum number of members to include. Defaults to 10. */
  limit?: number;
  /** Only include members active within this many days. Defaults to 45. */
  recentDays?: number;
}

/**
 * Build a coach-side aggregated snapshot of the most-active members.
 *
 * Answers questions like "who should I focus on?" or "what has X been
 * working on recently?" by giving the model a compact per-member view
 * without dumping every lesson.
 */
export const buildMemberActivityOverview = (
  allLessons: Lesson[],
  clients: ClientProfile[],
  options: BuildMemberActivityOverviewOptions = {}
): string => {
  const { limit = 10, recentDays = 45 } = options;
  if (allLessons.length === 0) return '';

  const cutoff = Date.now() - recentDays * 86_400_000;
  const activeLessons = allLessons.filter((l) => l.createdAt >= cutoff);
  if (activeLessons.length === 0) return '';

  const byMember = new Map<string, Lesson[]>();
  for (const l of activeLessons) {
    const key = `${l.clientName}_${l.clientPhone}`;
    const existing = byMember.get(key);
    if (existing) existing.push(l);
    else byMember.set(key, [l]);
  }

  const clientByKey = new Map(clients.map((c) => [`${c.name}_${c.phone}`, c]));

  const entries = Array.from(byMember.entries())
    .map(([key, lessons]) => {
      const sorted = [...lessons].sort((a, b) => b.createdAt - a.createdAt);
      const client = clientByKey.get(key);
      const name = sorted[0].clientName || client?.name || '이름 없음';
      const topics = topLessonTopics(sorted);
      const carry = latestCarryDistance(sorted);
      const score = latestScore(sorted);
      const bits = [
        `${name}${client?.handicap != null ? `(핸디캡 ${client.handicap})` : ''}`,
        `최근 ${sorted.length}건`,
        `마지막 ${sorted[0].date}`,
      ];
      if (topics.length) bits.push(`토픽: ${topics.join(', ')}`);
      if (carry != null) bits.push(`최근 캐리 ${carry}m`);
      if (score != null) bits.push(`최근 스코어 ${score}타`);
      return { key, latest: sorted[0].createdAt, line: `• ${bits.join(' · ')}` };
    })
    .sort((a, b) => b.latest - a.latest)
    .slice(0, limit)
    .map((e) => e.line);

  if (entries.length === 0) return '';

  return `[활동 회원 요약 — 최근 ${recentDays}일, 활동순 상위 ${entries.length}명]\n${entries.join('\n')}`;
};
