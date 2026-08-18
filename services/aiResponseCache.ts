/**
 * aiResponseCache — Prompt-keyed response cache for deterministic AI features.
 *
 * Why
 * ---
 * Repeat prompts (same image re-uploaded, same launch-monitor screenshot,
 * same interview) burn tokens and latency for identical outputs. The
 * observability logger already computes prompt hashes; this cache re-uses
 * the same idea to serve identical requests from localStorage.
 *
 * Scope discipline
 * ----------------
 * Only features on `CACHEABLE_FEATURES` can hit the cache — chat, evolving
 * personalisation, and anything that depends on running history is
 * excluded on purpose. When in doubt, keep a feature OUT of the allowlist
 * and add it later once we've verified determinism.
 *
 * Storage
 * -------
 * localStorage-backed with a bounded LRU (max entries) and per-entry TTL.
 * A single JSON blob under one key — cheap to read, atomic to write.
 * Firestore is deliberately NOT used: cache is device-local, and hitting
 * the network for a cache read would defeat the purpose.
 */

const CACHE_STORAGE_KEY = 'coachxai_ai_response_cache_v1';
const MAX_ENTRIES = 200;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Features safe to cache — same input → same output, no evolving state.
 * Chat, growth profile, and coach-scoped exemplars are intentionally omitted.
 */
export const CACHEABLE_FEATURES: ReadonlySet<string> = new Set([
  'extract_golf_data',
  'analyze_body_photos',
  'analyze_equipment_photo',
  'analyze_trackman_screen',
  'swing_phase_timestamps',
  'generate_system_prompt',
  'generate_interview_question',
]);

/**
 * Per-feature "did the model actually read anything?" checks. OCR features
 * sometimes come back with every field null (the cheap tier satisfies the
 * response schema without reading the screen). Caching that response would
 * pin the failure to the image for the whole TTL — every retry of the same
 * photo would be served the empty read from cache. So empty extractions are
 * rejected at write time AND evicted at read time (covers entries written
 * before this guard existed).
 *
 * Features without a validator are always cacheable.
 */
const toFiniteNumber = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

const RESPONSE_VALIDATORS: Record<string, (responseText: string) => boolean> = {
  // Usable iff the scorecard score OR at least one metric was read.
  extract_golf_data: (text) => {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (toFiniteNumber(parsed.score) !== null) return true;
    const metrics = parsed.metrics;
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return false;
    return Object.values(metrics).some((v) => toFiniteNumber(v) !== null);
  },
  // Usable iff at least one field carries a positive reading (mirrors
  // parseTrackmanScreenResponse, which drops non-positive values).
  analyze_trackman_screen: (text) => {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return Object.values(parsed).some((v) => {
      const n = toFiniteNumber(v);
      return n !== null && n > 0;
    });
  },
};

/**
 * Whether a response is worth caching for a feature. Unparseable text for a
 * validated feature is treated as not cacheable.
 */
export const isCacheableResponse = (feature: string, responseText: string): boolean => {
  const validate = RESPONSE_VALIDATORS[feature];
  if (!validate) return true;
  try {
    return validate(responseText);
  } catch {
    return false;
  }
};

interface CacheEntry {
  /** The response text stored verbatim. */
  response: string;
  /** ms since epoch — used for TTL check and LRU tie-break. */
  storedAt: number;
  /** Bumped on every hit — cheap LRU signal. */
  lastAccessAt: number;
  /** ms since epoch — when this entry expires. */
  expiresAt: number;
}

interface CacheBlob {
  version: 1;
  entries: Record<string, CacheEntry>;
}

const emptyBlob = (): CacheBlob => ({ version: 1, entries: {} });

const readBlob = (): CacheBlob => {
  if (typeof localStorage === 'undefined') return emptyBlob();
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return emptyBlob();
    const parsed = JSON.parse(raw) as CacheBlob;
    if (!parsed || parsed.version !== 1 || !parsed.entries) return emptyBlob();
    return parsed;
  } catch {
    return emptyBlob();
  }
};

const writeBlob = (blob: CacheBlob): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(blob));
  } catch {
    // Quota exceeded or storage disabled — silently drop. Cache is best-effort.
  }
};

/**
 * Cache key = feature + promptHash. Feature is included so two different
 * features with an accidentally-matching prompt hash never cross-pollute.
 */
export const buildCacheKey = (feature: string, promptHash: string): string =>
  `${feature}:${promptHash}`;

/**
 * Look up a cached response. Returns null on miss or on expired entry
 * (expired entries are pruned as a side effect of the lookup).
 */
export const getCachedResponse = (
  feature: string,
  promptHash: string,
  now: number = Date.now()
): string | null => {
  if (!CACHEABLE_FEATURES.has(feature)) return null;
  const key = buildCacheKey(feature, promptHash);
  const blob = readBlob();
  const entry = blob.entries[key];
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    // Expired — evict and miss.
    delete blob.entries[key];
    writeBlob(blob);
    return null;
  }
  if (!isCacheableResponse(feature, entry.response)) {
    // Poisoned entry (empty extraction cached before the write guard) —
    // evict so the caller re-runs the real request.
    delete blob.entries[key];
    writeBlob(blob);
    return null;
  }
  entry.lastAccessAt = now;
  blob.entries[key] = entry;
  writeBlob(blob);
  return entry.response;
};

/**
 * Store a response. No-op for features not in CACHEABLE_FEATURES.
 * Evicts the oldest-accessed entry when at capacity.
 */
export const setCachedResponse = (
  feature: string,
  promptHash: string,
  response: string,
  opts: { ttlMs?: number; now?: number } = {}
): void => {
  if (!CACHEABLE_FEATURES.has(feature)) return;
  if (!response) return;
  if (!isCacheableResponse(feature, response)) return;
  const now = opts.now ?? Date.now();
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const blob = readBlob();
  const key = buildCacheKey(feature, promptHash);

  blob.entries[key] = {
    response,
    storedAt: now,
    lastAccessAt: now,
    expiresAt: now + ttlMs,
  };

  // Evict oldest by lastAccessAt if we're over capacity.
  const keys = Object.keys(blob.entries);
  if (keys.length > MAX_ENTRIES) {
    const sorted = keys
      .map((k) => ({ k, a: blob.entries[k].lastAccessAt }))
      .sort((x, y) => x.a - y.a);
    const toDrop = sorted.slice(0, keys.length - MAX_ENTRIES);
    for (const { k } of toDrop) delete blob.entries[k];
  }

  writeBlob(blob);
};

/**
 * For observability and tests — how many entries live in the cache right now.
 */
export const getCacheSize = (): number => Object.keys(readBlob().entries).length;

/**
 * Wipe the cache. Exposed for testing and for a "clear cache" admin action.
 */
export const clearCache = (): void => writeBlob(emptyBlob());
