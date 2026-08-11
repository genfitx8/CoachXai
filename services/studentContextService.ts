/**
 * studentContextService
 * ──────────────────────
 * Reads and writes the per-student memory slice used by AI features (home
 * greeting, chat replies, swing analysis, round debrief). Prefers Firestore
 * (`student_contexts/{clientId}`) when Firebase is initialized and falls back
 * to localStorage otherwise.
 *
 * Phase 1 scope (this file):
 *   - get / upsert
 *   - one heuristic greeting builder used by the AI Home
 *
 * Later phases will add per-source update helpers (video analysis result,
 * round save, practice-data OCR, emotion log) that write into the same
 * document without callers having to know its shape.
 */

import { ClientProfile, Homework, Lesson, StudentContext } from '../types';
import { firebaseService } from './firebase';
import { storageService } from './storage';
import { createLogger } from '../utils/logger';

const log = createLogger('studentContext');

const inMemoryCache = new Map<string, StudentContext>();

const emptyContext = (clientId: string): StudentContext => ({
  clientId,
  clubProfiles: [],
  recentRounds: [],
  swingFaultHistory: [],
  emotionLog: [],
  coachFeedbackDigest: [],
  goals: [],
  updatedAt: Date.now(),
});

/**
 * Fetch the student's context. Cached in-memory for the session so repeat
 * reads from the AI home don't hit Firestore on every render.
 */
export const getStudentContext = async (clientId: string): Promise<StudentContext> => {
  if (!clientId) return emptyContext('');

  const cached = inMemoryCache.get(clientId);
  if (cached) return cached;

  let ctx: StudentContext | null = null;
  if (firebaseService.isInitialized()) {
    try {
      ctx = await firebaseService.getStudentContext(clientId);
    } catch (e) {
      log.error('Firestore student context read failed, falling back to local', e);
    }
  }

  if (!ctx) {
    // Storage mocks in tests may omit this method — guard defensively so a
    // missing helper doesn't crash the render, just returns an empty context.
    try {
      ctx = typeof storageService.getStudentContext === 'function'
        ? storageService.getStudentContext(clientId)
        : null;
    } catch (e) {
      log.error('Local student context read failed', e);
      ctx = null;
    }
  }

  const resolved = ctx ?? emptyContext(clientId);
  inMemoryCache.set(clientId, resolved);
  return resolved;
};

/**
 * Upsert the student's context. Writes to Firestore when available and always
 * mirrors to localStorage so the next cold start has offline data.
 */
export const saveStudentContext = async (ctx: StudentContext): Promise<void> => {
  const stamped: StudentContext = { ...ctx, updatedAt: Date.now() };
  inMemoryCache.set(stamped.clientId, stamped);

  if (typeof storageService.saveStudentContext === 'function') {
    try {
      storageService.saveStudentContext(stamped);
    } catch (e) {
      log.error('Local student context write failed', e);
    }
  }

  if (firebaseService.isInitialized()) {
    try {
      await firebaseService.saveStudentContext(stamped);
    } catch (e) {
      log.error('Firestore student context write failed (local cache kept)', e);
    }
  }
};

/**
 * Merge a partial update into the stored context. Callers pass only the
 * fields they know about; missing fields are preserved.
 */
export const updateStudentContext = async (
  clientId: string,
  patch: Partial<StudentContext>
): Promise<StudentContext> => {
  const current = await getStudentContext(clientId);
  const next: StudentContext = { ...current, ...patch, clientId, updatedAt: Date.now() };
  await saveStudentContext(next);
  return next;
};

/**
 * Invalidate the in-memory cache for a given client. Useful when the caller
 * knows a background writer just updated Firestore.
 */
export const invalidateStudentContext = (clientId: string): void => {
  inMemoryCache.delete(clientId);
};

// ── Greeting builder ────────────────────────────────────────────────────────

type Language = 'ko' | 'en' | 'ja';

interface GreetingInputs {
  profile: ClientProfile;
  ctx: StudentContext;
  recentLessons: Lesson[];        // sorted newest-first, this client only
  homeworkList: Homework[];       // any status
  language: Language;
}

const isoToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const daysBetween = (isoA: string, isoB: string): number => {
  const a = new Date(isoA + 'T00:00:00').getTime();
  const b = new Date(isoB + 'T00:00:00').getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
};

/**
 * Build the AI home's opening line.
 *
 * Priority order (first match wins):
 *   1. Round played today or yesterday → ask about it.
 *   2. Fresh swing video uploaded within 3 days without a follow-up → ask.
 *   3. Recent lesson within 7 days → nudge on the last coach note.
 *   4. Homework due today → nudge on the pending task.
 *   5. Fallback opener.
 *
 * Kept intentionally rule-based (no LLM call) so the home renders instantly.
 * Later phases can escalate to an LLM greeting when the context is richer.
 */
export const buildContextAwareGreeting = ({
  profile,
  ctx,
  recentLessons,
  homeworkList,
  language,
}: GreetingInputs): string => {
  const name = profile.name || (language === 'ko' ? '학생' : language === 'ja' ? '学生' : 'there');
  const today = isoToday();

  // 1. Round yesterday/today
  const lastRound = ctx.recentRounds?.[0];
  if (lastRound && daysBetween(lastRound.date, today) <= 1) {
    const course = lastRound.courseName;
    if (language === 'en') {
      return `Hey **${name}**! How did ${course ? `**${course}**` : 'the round'} go? Anything from the round you want to unpack?`;
    }
    if (language === 'ja') {
      return `${name}さん、${course ? `**${course}**での` : '昨日の'}ラウンドはどうでしたか？気になったホールがあれば話しましょう。`;
    }
    return `${name}님, ${course ? `**${course}** ` : '어제 '}라운드 어땠어요? 아쉬웠던 홀이 있다면 얘기 나눠볼까요?`;
  }

  // 2. Fresh swing video without follow-up
  const recentSwing = recentLessons.find(l => {
    if (l.mediaType !== 'video') return false;
    return daysBetween(l.date, today) <= 3;
  });
  if (recentSwing) {
    const club = recentSwing.club;
    if (language === 'en') {
      return `Hi **${name}** — you uploaded ${club ? `a **${club}**` : 'a swing'} recently. Want me to walk through it with you?`;
    }
    if (language === 'ja') {
      return `${name}さん、最近${club ? `**${club}**の` : ''}スイング動画が入っていましたね。一緒に振り返りましょうか？`;
    }
    return `${name}님, 최근에 올린 ${club ? `**${club}** ` : ''}스윙 영상 같이 살펴볼까요?`;
  }

  // 3. Recent lesson within 7 days
  const recentLesson = recentLessons.find(l => daysBetween(l.date, today) <= 7);
  const lastCoachDigest = ctx.coachFeedbackDigest?.[0];
  if (recentLesson && lastCoachDigest) {
    if (language === 'en') {
      return `Hi **${name}**! Last lesson focus: _${lastCoachDigest}_. How's that going?`;
    }
    if (language === 'ja') {
      return `${name}さん、前回のレッスンのポイントは「${lastCoachDigest}」でしたね。進み具合はどうですか？`;
    }
    return `${name}님, 저번 레슨 포인트가 "${lastCoachDigest}"였죠. 잘 되고 있어요?`;
  }

  // 4. Homework due today
  const pending = homeworkList.filter(h => h.date === today && !h.isCompleted);
  if (pending.length > 0) {
    if (language === 'en') {
      return `Hey **${name}**! You have **${pending.length}** task${pending.length > 1 ? 's' : ''} left for today. Want to knock them out?`;
    }
    if (language === 'ja') {
      return `${name}さん、今日のミッションが**${pending.length}件**残っています。一緒に片付けましょう。`;
    }
    return `${name}님, 오늘 남은 미션이 **${pending.length}개** 있어요. 지금 해볼까요?`;
  }

  // 5. Fallback
  if (language === 'en') {
    return `Hi **${name}**! I'm **CoachX AI**. What golf topic do you want to dig into today?`;
  }
  if (language === 'ja') {
    return `${name}さん、こんにちは！**CoachX AI**です。今日はゴルフの何を掘り下げますか？`;
  }
  return `${name}님, 안녕하세요! 저는 **CoachX AI**예요. 오늘은 골프에서 뭐가 궁금해요?`;
};
