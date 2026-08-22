import { Router, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth';
import {
  YouTubeApiError,
  YouTubeLang,
  YouTubeVideo,
  getYouTubeStatus,
  isYouTubeConfigured,
  searchYouTube,
} from '../services/youtube';

/**
 * YouTube practice-video recommendations for the student app.
 *
 * The client sends the curated search queries it derived from the student's
 * own records (`constants/youtubeTopics.ts`) — never free text typed by a
 * user — and gets back real videos. Everything about quota and caching lives
 * in `services/youtube.ts`; this route only validates input, caps the fan-out
 * and keeps a failed upstream from becoming a failed screen: a request that
 * cannot be served answers 200 with `configured: false` / fewer results, and
 * the client falls back to YouTube search links.
 */

const router = Router();

const recommendationsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(authMiddleware);

/** Upper bound on searches one request may trigger (quota protection). */
const MAX_QUERIES_PER_REQUEST = 4;
const MAX_QUERY_LENGTH = 120;

const parseLanguage = (raw: unknown): YouTubeLang =>
  raw === 'en' || raw === 'ja' ? raw : 'ko';

interface TopicResult {
  query: string;
  videos: YouTubeVideo[];
  cached: boolean;
}

// POST /api/youtube/recommendations  { queries, language?, maxPerQuery? }
router.post('/recommendations', recommendationsLimiter, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as {
    queries?: unknown;
    language?: unknown;
    maxPerQuery?: unknown;
  };

  const queries = Array.isArray(body.queries)
    ? body.queries
        .filter((q): q is string => typeof q === 'string')
        .map((q) => q.trim().slice(0, MAX_QUERY_LENGTH))
        .filter((q) => q.length > 0)
        .slice(0, MAX_QUERIES_PER_REQUEST)
    : [];

  if (queries.length === 0) {
    res.status(400).json({ error: 'queries must be a non-empty string array' });
    return;
  }

  if (!isYouTubeConfigured()) {
    // Not an error: the student app renders search links for these queries.
    res.json({ configured: false, results: [], degraded: true });
    return;
  }

  const language = parseLanguage(body.language);
  const maxPerQuery =
    typeof body.maxPerQuery === 'number' && Number.isFinite(body.maxPerQuery)
      ? Math.min(Math.max(Math.trunc(body.maxPerQuery), 1), 5)
      : 3;

  const results: TopicResult[] = [];
  let degraded = false;

  // Sequential on purpose: each miss spends 100 quota units, and a 429 from
  // the first query means the rest would fail too — stop instead of burning
  // the retry budget.
  for (const query of queries) {
    try {
      const { videos, cached } = await searchYouTube(query, { language, maxResults: maxPerQuery });
      results.push({ query, videos, cached });
    } catch (err) {
      degraded = true;
      const status = err instanceof YouTubeApiError ? err.status : 500;
      console.warn(`[youtube] search failed (${status}) for "${query}":`, (err as Error)?.message);
      if (status === 429 || status === 503) break;
    }
  }

  res.json({ configured: true, results, degraded });
});

// GET /api/youtube/status — is the feature wired up, and how much budget is left?
router.get('/status', (_req: Request, res: Response) => {
  res.json(getYouTubeStatus());
});

export default router;
