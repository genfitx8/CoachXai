/**
 * YouTube Data API v3 search, server-side.
 *
 * The student app recommends practice videos for whatever the coach flagged
 * last lesson. Two things forced this through the backend rather than the
 * browser:
 *
 *   1. The API key must not ship in a Vite bundle — a leaked key is a leaked
 *      quota, and the same key usually carries other Google APIs.
 *   2. A `search.list` call costs 100 quota units against a 10,000/day
 *      default. Three topics per student per open of the home screen would
 *      burn the day's quota on a few dozen students, so results are cached
 *      here (shared across all students — the queries are curated topics, not
 *      personal data) and hard-capped per day.
 *
 * When the key is missing the module reports `configured: false` instead of
 * throwing; the client then links to a YouTube search page for the same
 * query, which needs no key at all.
 */

const API_BASE = 'https://www.googleapis.com/youtube/v3/search';

const DEFAULT_CACHE_TTL_MINUTES = 720; // 12h — coaching videos are evergreen.
const DEFAULT_DAILY_SEARCH_LIMIT = 80; // 80 × 100 units = 8,000 of 10,000.
const MAX_CACHE_ENTRIES = 500;
const MAX_RESULTS_PER_QUERY = 5;
const UPSTREAM_TIMEOUT_MS = 8000;

export type YouTubeLang = 'ko' | 'en' | 'ja';

export interface YouTubeVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
  url: string;
}

export class YouTubeApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'YouTubeApiError';
    this.status = status;
  }
}

interface CacheEntry {
  videos: YouTubeVideo[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** UTC-day counter — YouTube resets quota at midnight Pacific, close enough. */
let quotaDay = '';
let searchesToday = 0;

const getApiKey = (): string => (process.env.YOUTUBE_API_KEY ?? '').trim();

const numericEnv = (name: string, fallback: number): number => {
  const raw = Number.parseInt((process.env[name] ?? '').trim(), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
};

const cacheTtlMs = (): number =>
  numericEnv('YOUTUBE_CACHE_TTL_MINUTES', DEFAULT_CACHE_TTL_MINUTES) * 60 * 1000;

const dailySearchLimit = (): number =>
  numericEnv('YOUTUBE_DAILY_SEARCH_LIMIT', DEFAULT_DAILY_SEARCH_LIMIT);

export const isYouTubeConfigured = (): boolean => Boolean(getApiKey());

const today = (): string => new Date().toISOString().slice(0, 10);

const rollQuotaDay = (): void => {
  const day = today();
  if (day !== quotaDay) {
    quotaDay = day;
    searchesToday = 0;
  }
};

const REGION_BY_LANG: Record<YouTubeLang, string> = { ko: 'KR', en: 'US', ja: 'JP' };

const cacheKey = (query: string, lang: YouTubeLang, max: number): string =>
  `${lang}::${max}::${query.trim().toLowerCase()}`;

const readCache = (key: string): YouTubeVideo[] | null => {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  // Refresh insertion order so the oldest *unused* entry is evicted first.
  cache.delete(key);
  cache.set(key, hit);
  return hit.videos;
};

const writeCache = (key: string, videos: YouTubeVideo[]): void => {
  cache.set(key, { videos, expiresAt: Date.now() + cacheTtlMs() });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
};

/** YouTube returns snippet text HTML-escaped ("Ben&#39;s drill"). */
const decodeEntities = (text: string): string =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

interface RawSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
}

const toVideo = (item: RawSearchItem): YouTubeVideo | null => {
  const videoId = item.id?.videoId;
  if (!videoId) return null;
  const snippet = item.snippet ?? {};
  const thumb =
    snippet.thumbnails?.medium?.url ??
    snippet.thumbnails?.high?.url ??
    snippet.thumbnails?.default?.url ??
    '';
  return {
    videoId,
    title: decodeEntities(snippet.title ?? ''),
    channelTitle: decodeEntities(snippet.channelTitle ?? ''),
    description: decodeEntities(snippet.description ?? '').slice(0, 200),
    thumbnailUrl: thumb,
    publishedAt: snippet.publishedAt ?? '',
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
};

export interface SearchOptions {
  language?: YouTubeLang;
  maxResults?: number;
}

export interface SearchResult {
  videos: YouTubeVideo[];
  /** True when the response came from the in-process cache (no quota spent). */
  cached: boolean;
}

/**
 * One `search.list` call, cached. Throws `YouTubeApiError` when the key is
 * missing (503), the daily cap is spent (429) or the upstream call fails.
 */
export const searchYouTube = async (
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new YouTubeApiError('YouTube API is not configured. Set YOUTUBE_API_KEY.', 503);
  }

  const trimmed = query.trim();
  if (!trimmed) throw new YouTubeApiError('Query is empty.', 400);

  const language: YouTubeLang = options.language ?? 'ko';
  const maxResults = Math.min(Math.max(options.maxResults ?? 3, 1), MAX_RESULTS_PER_QUERY);
  const key = cacheKey(trimmed, language, maxResults);

  const cached = readCache(key);
  if (cached) return { videos: cached, cached: true };

  rollQuotaDay();
  if (searchesToday >= dailySearchLimit()) {
    throw new YouTubeApiError('YouTube daily search budget is exhausted.', 429);
  }

  const params = new URLSearchParams({
    key: apiKey,
    part: 'snippet',
    type: 'video',
    q: trimmed,
    maxResults: String(maxResults),
    order: 'relevance',
    safeSearch: 'strict',
    // Embeddable + public only: a video the student cannot open is noise.
    videoEmbeddable: 'true',
    videoSyndicated: 'true',
    relevanceLanguage: language,
    regionCode: REGION_BY_LANG[language],
  });

  searchesToday += 1;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}?${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new YouTubeApiError(`YouTube request failed: ${detail}`, 502);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new YouTubeApiError(
      `YouTube API error ${response.status}: ${body.slice(0, 300)}`,
      response.status === 403 ? 429 : 502
    );
  }

  const payload = (await response.json().catch(() => null)) as { items?: RawSearchItem[] } | null;
  const videos = (payload?.items ?? [])
    .map(toVideo)
    .filter((v): v is YouTubeVideo => v !== null);

  writeCache(key, videos);
  return { videos, cached: false };
};

export interface YouTubeStatus {
  configured: boolean;
  cachedQueries: number;
  searchesToday: number;
  dailySearchLimit: number;
}

export const getYouTubeStatus = (): YouTubeStatus => {
  rollQuotaDay();
  return {
    configured: isYouTubeConfigured(),
    cachedQueries: cache.size,
    searchesToday,
    dailySearchLimit: dailySearchLimit(),
  };
};

/** Test seam — drops the cache and the day's counter. */
export const __resetYouTubeCache = (): void => {
  cache.clear();
  quotaDay = '';
  searchesToday = 0;
};
