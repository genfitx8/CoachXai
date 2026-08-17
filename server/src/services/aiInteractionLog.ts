import crypto from 'crypto';
import pool from './db';

/**
 * Server-side AI telemetry (docs/DATA_ARCHITECTURE.md §5.5) — every
 * /api/ai/invoke(-stream) call lands one row in ai_interactions.
 *
 * Privacy posture mirrors the client-side AiCallLog: only a short prompt
 * hash and character counts are stored. Raw prompt/response text stays out
 * until the Phase 4 consent gate (consents.purpose='ai_training') exists.
 */

export interface AiInteractionEntry {
  userId?: string | null;
  userRole?: string | null;
  feature: string;
  model?: string | null;
  runtime: 'gemini_api' | 'agent_platform' | 'agent_legacy';
  promptChars: number;
  promptHash: string | null;
  responseChars?: number | null;
  latencyMs: number;
  status: 'success' | 'fallback' | 'error';
  errorMessage?: string | null;
  streamed?: boolean;
  hasSchema?: boolean;
  mediaPartCount?: number;
}

/** 12-char sha-256 prefix — enough to correlate identical prompts, useless to reverse. */
export function hashPrompt(text: string | undefined): string | null {
  if (!text) return null;
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
}

/**
 * Fire-and-forget: AI responses must never fail or wait on telemetry.
 * Loss is logged, not thrown.
 */
export function logAiInteraction(entry: AiInteractionEntry): void {
  void pool
    .query(
      `INSERT INTO ai_interactions (
         user_id, user_role, feature, model, runtime,
         prompt_hash, prompt_chars, response_chars,
         latency_ms, status, error_message,
         streamed, has_schema, media_part_count
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        entry.userId ?? null,
        entry.userRole ?? null,
        entry.feature,
        entry.model ?? null,
        entry.runtime,
        entry.promptHash,
        entry.promptChars,
        entry.responseChars ?? null,
        entry.latencyMs,
        entry.status,
        entry.errorMessage ?? null,
        entry.streamed ?? false,
        entry.hasSchema ?? false,
        entry.mediaPartCount ?? 0,
      ]
    )
    .catch((err) => {
      console.warn('[ai] failed to log interaction:', err);
    });
}
