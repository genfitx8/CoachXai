/**
 * aiCallLogger — Observability layer for every AI call.
 *
 * Sits behind invokeBackendAI and records structured telemetry for each
 * request/response cycle. Writes are fire-and-forget so telemetry never
 * blocks the user or fails the actual AI call.
 *
 * Design constraints:
 *  - PII safety: raw prompts and responses are NEVER persisted. We store a
 *    12-char sha-256 hash of the prompt for dedup analysis, plus character
 *    counts as cheap token proxies.
 *  - Zero cost when disabled: `record()` is the only public surface. If the
 *    storage backend rejects, we swallow the error silently.
 *  - Aggregation lives here (not the UI) so the same numbers can drive an
 *    admin dashboard, a CLI report, or a scheduled alert.
 */

import { AiCallLog } from '../types';
import { storageService } from './storage';
import { firebaseService } from './firebase';
import { createLogger } from '../utils/logger';

const log = createLogger('aiCallLogger');

const MAX_ERROR_LENGTH = 200;
const HASH_LENGTH = 12;

/**
 * Short sha-256 hash of the prompt. First 12 hex chars is enough to detect
 * duplicate prompts (cache-hit analysis) without keeping the raw content.
 * Uses SubtleCrypto when available (browser); falls back to a lightweight
 * FNV-1a hash in test/server environments where SubtleCrypto isn't there.
 */
export const hashPrompt = async (prompt: string): Promise<string> => {
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    try {
      const enc = new TextEncoder().encode(prompt);
      const digest = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(digest))
        .slice(0, HASH_LENGTH / 2)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // fall through to FNV
    }
  }
  // FNV-1a 32-bit fallback — not cryptographic, just for prompt dedup.
  let h = 0x811c9dc5;
  for (let i = 0; i < prompt.length; i++) {
    h ^= prompt.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(HASH_LENGTH, '0').slice(0, HASH_LENGTH);
};

const generateLogId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export interface RecordAiCallInput {
  feature: string;
  coachId?: string;
  prompt: string;
  responseText: string;
  latencyMs: number;
  status: AiCallLog['status'];
  errorMessage?: string;
  hasExemplars?: boolean;
  hasSchema?: boolean;
  /** True when the response was served from aiResponseCache (no Gemini call). */
  cached?: boolean;
}

/**
 * Fire-and-forget record of a single AI call. Never throws — logging failure
 * must not affect the AI response the caller returns to the user.
 */
export const recordAiCall = async (input: RecordAiCallInput): Promise<void> => {
  try {
    const entry: AiCallLog = {
      id: generateLogId(),
      coachId: input.coachId,
      feature: input.feature,
      promptHash: await hashPrompt(input.prompt),
      promptLength: input.prompt.length,
      responseLength: input.responseText.length,
      latencyMs: Math.max(0, Math.round(input.latencyMs)),
      status: input.status,
      errorMessage: input.errorMessage
        ? input.errorMessage.slice(0, MAX_ERROR_LENGTH)
        : undefined,
      hasExemplars: !!input.hasExemplars,
      hasSchema: !!input.hasSchema,
      cached: input.cached ? true : undefined,
      createdAt: Date.now(),
    };

    if (firebaseService.isInitialized()) {
      // Do not await Firestore write — telemetry is fire-and-forget so
      // slow network never delays the AI response to the user.
      firebaseService.saveAiCallLog(entry).catch((e) => {
        log.warn('Firestore AI log write failed', e);
      });
    } else {
      storageService.saveAiCallLog(entry);
    }
  } catch (e) {
    // Swallow anything (encoding, storage quota, etc.) — telemetry is best-effort.
    log.warn('recordAiCall failed', e);
  }
};

// ── Aggregation helpers (used by admin dashboards) ──────────────────────────

export interface FeatureStats {
  feature: string;
  callCount: number;
  successCount: number;
  fallbackCount: number;
  errorCount: number;
  /** Median latency across all calls to this feature. */
  latencyP50Ms: number;
  /** 95th percentile latency — worst-case UX proxy. */
  latencyP95Ms: number;
  /** Median response length (character count, token proxy). */
  responseP50Chars: number;
  /** Median prompt length (character count, token proxy). */
  promptP50Chars: number;
  /** Fraction of calls that fell back to heuristics (0..1). Higher = AI failing. */
  fallbackRate: number;
  /** Fraction of calls that included coach-style exemplars (Phase C signal). */
  exemplarInjectionRate: number;
  /**
   * Fraction of calls served from the local response cache (0..1). Only
   * meaningful for features on aiResponseCache.CACHEABLE_FEATURES;
   * always 0 for non-cacheable features.
   */
  cacheHitRate: number;
  /** Time of the most recent call for this feature. */
  lastCallAt: number;
}

const percentile = (sortedAsc: number[], p: number): number => {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedAsc.length) - 1;
  return sortedAsc[Math.max(0, Math.min(sortedAsc.length - 1, idx))];
};

/**
 * Aggregate per-feature stats from a raw log list. Pure function — the
 * caller supplies the log source (localStorage now, Firestore later).
 */
export const aggregateFeatureStats = (logs: AiCallLog[]): FeatureStats[] => {
  const grouped = new Map<string, AiCallLog[]>();
  for (const l of logs) {
    const arr = grouped.get(l.feature);
    if (arr) arr.push(l);
    else grouped.set(l.feature, [l]);
  }

  const stats: FeatureStats[] = [];
  for (const [feature, entries] of grouped.entries()) {
    const latencies = entries.map((e) => e.latencyMs).sort((a, b) => a - b);
    const promptLens = entries.map((e) => e.promptLength).sort((a, b) => a - b);
    const respLens = entries.map((e) => e.responseLength).sort((a, b) => a - b);
    const successCount = entries.filter((e) => e.status === 'success').length;
    const fallbackCount = entries.filter((e) => e.status === 'fallback').length;
    const errorCount = entries.filter((e) => e.status === 'error').length;
    const exemplarCount = entries.filter((e) => e.hasExemplars).length;
    const cachedCount = entries.filter((e) => e.cached).length;
    stats.push({
      feature,
      callCount: entries.length,
      successCount,
      fallbackCount,
      errorCount,
      latencyP50Ms: percentile(latencies, 50),
      latencyP95Ms: percentile(latencies, 95),
      responseP50Chars: percentile(respLens, 50),
      promptP50Chars: percentile(promptLens, 50),
      fallbackRate: entries.length > 0 ? fallbackCount / entries.length : 0,
      exemplarInjectionRate:
        entries.length > 0 ? exemplarCount / entries.length : 0,
      cacheHitRate: entries.length > 0 ? cachedCount / entries.length : 0,
      lastCallAt: Math.max(...entries.map((e) => e.createdAt)),
    });
  }
  // Sort by call count descending so heaviest features surface first.
  return stats.sort((a, b) => b.callCount - a.callCount);
};

/**
 * Load all logs from the appropriate backend and aggregate per feature.
 */
export const getFeatureStats = async (): Promise<FeatureStats[]> => {
  const logs = firebaseService.isInitialized()
    ? await firebaseService.getAiCallLogs()
    : storageService.getAiCallLogs();
  return aggregateFeatureStats(logs);
};

/**
 * Return the N most recent calls, newest first.
 */
export const getRecentAiCalls = async (limit = 50): Promise<AiCallLog[]> => {
  const logs = firebaseService.isInitialized()
    ? await firebaseService.getAiCallLogs()
    : storageService.getAiCallLogs();
  return [...logs].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
};
