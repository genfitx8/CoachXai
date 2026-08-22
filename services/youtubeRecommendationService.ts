import {
  DEFAULT_TOPIC_IDS,
  TOPIC_BY_ID,
  YOUTUBE_TOPICS,
  type MissPattern,
  type TopicLang,
  type YouTubeTopic,
} from '../constants/youtubeTopics';
import type { Homework, Lesson, StudentContext } from '../types';
import type { FaultId } from '../types/swingFault';
import { apiService } from './apiService';
import { createLogger } from '../utils/logger';

const log = createLogger('youtubeRecommendations');

/**
 * "어떤 영상이 이 학생에게 필요한가" — picked from the student's own records.
 *
 * Two deliberate constraints:
 *
 *  1. **The topic is chosen deterministically, not by an LLM.** The signal is
 *     already written down — the coach's next-actions, this week's homework,
 *     the recorded fault history, the club miss pattern — so keyword matching
 *     against the curated catalog is both cheaper and auditable ("왜 이 영상이
 *     떴나"를 카드에 그대로 적을 수 있다).
 *  2. **Video links always come from a real YouTube search**, resolved by the
 *     backend (`/api/youtube/recommendations`). When the backend has no API
 *     key, is unreachable, or has spent its daily quota, the card still shows
 *     the same topics and links to the YouTube search page for the query.
 *     We never synthesise a `watch?v=` id — a wrong one is a dead end for the
 *     student.
 */

export interface RecommendationSignals {
  /** Server-side student memory: fault history, club profiles, goals. */
  ctx?: StudentContext | null;
  /** Lessons visible to the student (any order — freshest is picked here). */
  lessons?: Lesson[];
  /** Homework rows for this student. */
  homework?: Homework[];
  /** Deterministic fault ids from a just-analysed swing, when available. */
  faults?: FaultId[];
  language?: TopicLang;
}

export interface RankedTopic {
  topic: YouTubeTopic;
  score: number;
  /** Localized "why you're seeing this", quoting the record it came from. */
  reason: string;
}

export interface RecommendedVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  url: string;
  publishedAt: string;
}

export interface VideoRecommendation {
  topicId: string;
  /** Localized topic headline. */
  label: string;
  /** Localized one-liner on what the topic fixes. */
  blurb: string;
  reason: string;
  query: string;
  /** Always present — opens a YouTube search for the topic. */
  searchUrl: string;
  /** Empty when the backend could not serve live results. */
  videos: RecommendedVideo[];
}

const CACHE_KEY = 'coachxai_youtube_reco_v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Topic ranking ──────────────────────────────────────────────────────────

/**
 * Lowercase and drop whitespace/punctuation so "체중 이동!" and "체중이동"
 * are the same string. Korean carries the meaning in the syllables, not the
 * spacing, and coaches type both ways.
 */
const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[.,!?·…"'`()[\]{}\-–—:;/\\|~]/g, '');

interface Fragment {
  text: string;
  weight: number;
  reason: string;
}

const REASON_PREFIX: Record<TopicLang, Record<string, string>> = {
  ko: {
    fault: '반복된 약점',
    nextAction: '지난 레슨 다음 액션',
    feedback: '지난 레슨 피드백',
    homework: '이번 주 드릴',
    miss: '샷 미스 패턴',
    goal: '내 목표',
    swing: '스윙 분석 결과',
    fallback: '기본 훈련 추천',
  },
  en: {
    fault: 'Recurring weakness',
    nextAction: 'Last lesson next action',
    feedback: 'Last lesson feedback',
    homework: "This week's drill",
    miss: 'Shot miss pattern',
    goal: 'Your goal',
    swing: 'Swing analysis',
    fallback: 'Fundamentals',
  },
  ja: {
    fault: '繰り返す弱点',
    nextAction: '前回レッスンの次のアクション',
    feedback: '前回レッスンのフィードバック',
    homework: '今週のドリル',
    miss: 'ミスの傾向',
    goal: '目標',
    swing: 'スイング分析',
    fallback: '基本トレーニング',
  },
};

const quote = (lang: TopicLang, kind: string, detail: string): string => {
  const prefix = REASON_PREFIX[lang][kind] ?? REASON_PREFIX[lang].fallback;
  const trimmed = detail.trim().replace(/\s+/g, ' ');
  if (!trimmed) return prefix;
  const clipped = trimmed.length > 42 ? `${trimmed.slice(0, 42)}…` : trimmed;
  return `${prefix} · ${clipped}`;
};

const daysSince = (isoDate: string, now: number): number => {
  const parsed = new Date(isoDate).getTime();
  if (Number.isNaN(parsed)) return Infinity;
  return Math.floor((now - parsed) / DAY_MS);
};

const daysUntil = (isoDate: string, now: number): number => {
  const parsed = new Date(isoDate).getTime();
  if (Number.isNaN(parsed)) return Infinity;
  return Math.round((parsed - now) / DAY_MS);
};

/** Text fragments the student's records offer, each with how much it matters. */
const collectFragments = (signals: RecommendationSignals, now: number): Fragment[] => {
  const lang = signals.language ?? 'ko';
  const fragments: Fragment[] = [];

  // 1. Recorded fault history — the strongest signal: it survived more than
  //    one lesson and the coach kept writing it down.
  for (const entry of signals.ctx?.swingFaultHistory ?? []) {
    if (!entry?.fault || entry.status === 'resolved') continue;
    const staleness = daysSince(entry.lastSeen ?? '', now);
    if (staleness > 120) continue;
    const base = entry.status === 'active' ? 6 : 3;
    const repetition = Math.min(entry.occurrences ?? 1, 4) * 0.5;
    fragments.push({
      text: entry.fault,
      weight: base + repetition,
      reason: quote(lang, 'fault', entry.fault),
    });
  }

  // 2. Newest lesson that carries next-actions — what the coach asked for.
  const lessons = [...(signals.lessons ?? [])].sort(
    (a, b) => (b.approvedAt ?? b.createdAt ?? 0) - (a.approvedAt ?? a.createdAt ?? 0)
  );
  const focus = lessons.find((l) => (l.reviewSections?.nextActions?.length ?? 0) > 0);
  focus?.reviewSections?.nextActions?.slice(0, 3).forEach((action, index) => {
    if (!action?.trim()) return;
    fragments.push({
      text: action,
      weight: 5 - index * 0.5,
      reason: quote(lang, 'nextAction', action),
    });
  });
  const feedback = focus?.reviewSections?.feedback ?? lessons[0]?.reviewSections?.feedback ?? '';
  if (feedback.trim()) {
    fragments.push({ text: feedback, weight: 2.5, reason: quote(lang, 'feedback', feedback) });
  }

  // 3. Open homework due within a fortnight — what the student is on the hook
  //    for right now.
  for (const hw of signals.homework ?? []) {
    if (!hw || hw.isCompleted) continue;
    const due = daysUntil(hw.date ?? '', now);
    if (due > 14) continue;
    fragments.push({
      text: `${hw.title ?? ''} ${hw.description ?? ''}`,
      weight: 4,
      reason: quote(lang, 'homework', hw.title ?? ''),
    });
  }

  // 4. Goals the student wrote for themselves.
  for (const goal of signals.ctx?.goals ?? []) {
    if (!goal?.trim()) continue;
    fragments.push({ text: goal, weight: 2, reason: quote(lang, 'goal', goal) });
  }

  return fragments;
};

const matchesFragment = (topic: YouTubeTopic, normalized: string): boolean =>
  topic.keywords.some((keyword) => normalized.includes(normalize(keyword)));

/**
 * Score every topic against the student's records and return the best ones.
 * Deterministic: same records in, same order out.
 */
export const rankTopics = (
  signals: RecommendationSignals,
  limit = 3,
  now: number = Date.now()
): RankedTopic[] => {
  const lang = signals.language ?? 'ko';
  const scores = new Map<string, { score: number; reason: string; reasonWeight: number }>();

  const bump = (topicId: string, weight: number, reason: string) => {
    const current = scores.get(topicId);
    if (!current) {
      scores.set(topicId, { score: weight, reason, reasonWeight: weight });
      return;
    }
    current.score += weight;
    if (weight > current.reasonWeight) {
      current.reason = reason;
      current.reasonWeight = weight;
    }
  };

  // Deterministic fault ids beat any prose that mentions the same thing.
  for (const faultId of signals.faults ?? []) {
    for (const topic of YOUTUBE_TOPICS) {
      if (topic.faults?.includes(faultId)) {
        bump(topic.id, 6, quote(lang, 'swing', topic.label[lang]));
      }
    }
  }

  // Club miss patterns come from measured shot data, not text.
  for (const club of signals.ctx?.clubProfiles ?? []) {
    const miss = club?.missPattern as MissPattern | null | undefined;
    if (!miss) continue;
    const confidence = Math.min(club.sampleCount ?? 0, 10) * 0.1;
    for (const topic of YOUTUBE_TOPICS) {
      if (topic.missPatterns?.includes(miss)) {
        bump(topic.id, 3 + confidence, quote(lang, 'miss', `${club.club ?? ''} ${miss}`));
      }
    }
  }

  for (const fragment of collectFragments(signals, now)) {
    const normalized = normalize(fragment.text);
    if (!normalized) continue;
    for (const topic of YOUTUBE_TOPICS) {
      if (matchesFragment(topic, normalized)) {
        bump(topic.id, fragment.weight, fragment.reason);
      }
    }
  }

  // Catalog order is the tie-breaker so equal scores stay stable between
  // renders instead of shuffling the card on every mount.
  const order = new Map(YOUTUBE_TOPICS.map((t, i) => [t.id, i]));
  return [...scores.entries()]
    .map(([topicId, value]) => ({ topic: TOPIC_BY_ID[topicId], ...value }))
    .filter((entry) => Boolean(entry.topic))
    .sort((a, b) => b.score - a.score || (order.get(a.topic.id)! - order.get(b.topic.id)!))
    .slice(0, Math.max(limit, 0))
    .map(({ topic, score, reason }) => ({ topic, score, reason }));
};

/** True when the student has anything at all we could reason from. */
export const hasRecommendationSignals = (signals: RecommendationSignals): boolean =>
  (signals.lessons?.length ?? 0) > 0 ||
  (signals.homework?.length ?? 0) > 0 ||
  (signals.faults?.length ?? 0) > 0 ||
  (signals.ctx?.swingFaultHistory?.length ?? 0) > 0 ||
  (signals.ctx?.clubProfiles?.length ?? 0) > 0 ||
  (signals.ctx?.goals?.length ?? 0) > 0;

const fallbackTopics = (lang: TopicLang): RankedTopic[] =>
  DEFAULT_TOPIC_IDS.map((id) => TOPIC_BY_ID[id])
    .filter(Boolean)
    .map((topic) => ({
      topic,
      score: 0,
      reason: REASON_PREFIX[lang].fallback,
    }));

// ─── Video resolution ───────────────────────────────────────────────────────

export const buildSearchUrl = (query: string): string =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

interface CachedPayload {
  savedAt: number;
  key: string;
  recommendations: VideoRecommendation[];
}

const readCache = (key: string): VideoRecommendation[] | null => {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPayload;
    if (!parsed || parsed.key !== key) return null;
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return Array.isArray(parsed.recommendations) ? parsed.recommendations : null;
  } catch {
    // A poisoned entry must never break the home screen — drop it and refetch.
    try { window.localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
    return null;
  }
};

const writeCache = (key: string, recommendations: VideoRecommendation[]): void => {
  try {
    const payload: CachedPayload = { savedAt: Date.now(), key, recommendations };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode — the feature just refetches next time */
  }
};

export const clearRecommendationCache = (): void => {
  try { window.localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
};

export interface RecommendationOptions {
  /** How many topics to surface (default 3). */
  limit?: number;
  /** Videos per topic (default 3). */
  maxPerTopic?: number;
  /** Skip the 6h local cache — used by the card's refresh button. */
  force?: boolean;
}

/**
 * Topics for this student, each filled with live videos when the backend can
 * serve them. Never rejects: a backend failure degrades to search links.
 */
export const getVideoRecommendations = async (
  signals: RecommendationSignals,
  options: RecommendationOptions = {}
): Promise<VideoRecommendation[]> => {
  const lang = signals.language ?? 'ko';
  const limit = options.limit ?? 3;
  const maxPerTopic = options.maxPerTopic ?? 3;

  if (!hasRecommendationSignals(signals)) return [];

  const ranked = rankTopics(signals, limit);
  const topics = ranked.length > 0 ? ranked : fallbackTopics(lang).slice(0, limit);
  if (topics.length === 0) return [];

  const base: VideoRecommendation[] = topics.map(({ topic, reason }) => ({
    topicId: topic.id,
    label: topic.label[lang],
    blurb: topic.blurb[lang],
    reason,
    query: topic.query[lang],
    searchUrl: buildSearchUrl(topic.query[lang]),
    videos: [],
  }));

  const cacheKey = `${lang}|${maxPerTopic}|${base.map((b) => b.topicId).join(',')}`;
  if (!options.force) {
    const cached = readCache(cacheKey);
    // Reasons are recomputed from today's records, so only the videos are
    // reused — a cached card never shows a stale "왜 추천했는지".
    if (cached) {
      return base.map((entry) => ({
        ...entry,
        videos: cached.find((c) => c.topicId === entry.topicId)?.videos ?? [],
      }));
    }
  }

  if (!apiService.isAvailable() || !apiService.getToken()) return base;

  try {
    const response = await apiService.getYouTubeRecommendations(
      base.map((b) => b.query),
      lang,
      maxPerTopic
    );
    if (!response?.configured) return base;

    const byQuery = new Map(
      (response.results ?? []).map((r) => [r.query, r.videos ?? []])
    );
    const filled = base.map((entry) => ({
      ...entry,
      videos: (byQuery.get(entry.query) ?? []).map((v) => ({
        videoId: v.videoId,
        title: v.title,
        channelTitle: v.channelTitle,
        thumbnailUrl: v.thumbnailUrl,
        url: v.url,
        publishedAt: v.publishedAt,
      })),
    }));
    if (filled.some((entry) => entry.videos.length > 0)) writeCache(cacheKey, filled);
    return filled;
  } catch (error) {
    log.warn('YouTube recommendations unavailable; falling back to search links', error);
    return base;
  }
};
