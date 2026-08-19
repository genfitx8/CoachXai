import crypto from 'crypto';
import pool from './db';
import { hasConsent } from './consents';
import { scrubPii } from './pii';

/**
 * Server-side AI telemetry (docs/DATA_ARCHITECTURE.md §5.5) — every
 * /api/ai/invoke(-stream) call lands one row in ai_interactions.
 *
 * 기본 저장분은 짧은 프롬프트 해시와 글자수뿐이다. 프롬프트/응답 **원문**은
 * `consents.purpose='ai_training'` 동의가 유효한 사용자에 한해 저장한다
 * (§8.2 게이트). 원문은 저장 직전에 PII 스크럽을 거친다(§6.3).
 *
 * 소급 동의는 불가능하다 — 동의 없이 지나간 호출의 원문은 영원히 없다.
 * 그래서 게이트는 "언젠가" 가 아니라 지금 열려 있어야 한다.
 */

/** 한 행이 삼킬 수 있는 원문 상한. 초과분은 잘라 저장한다. */
const MAX_STORED_TEXT_CHARS = 100_000;

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
  /** 프롬프트 원문 — ai_training 동의가 있을 때만 실제로 저장된다. */
  promptText?: string | null;
  /** 응답 원문 — 같은 게이트를 통과할 때만 저장된다. */
  responseText?: string | null;
}

/** 12-char sha-256 prefix — enough to correlate identical prompts, useless to reverse. */
export function hashPrompt(text: string | undefined): string | null {
  if (!text) return null;
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
}

const prepareStoredText = (text: string | null | undefined): string | null => {
  const scrubbed = scrubPii(text);
  if (!scrubbed) return null;
  return scrubbed.length > MAX_STORED_TEXT_CHARS
    ? scrubbed.slice(0, MAX_STORED_TEXT_CHARS)
    : scrubbed;
};

/**
 * Fire-and-forget: AI responses must never fail or wait on telemetry.
 * Loss is logged, not thrown.
 */
export function logAiInteraction(entry: AiInteractionEntry): void {
  void (async () => {
    let promptText: string | null = null;
    let responseText: string | null = null;
    if (entry.promptText || entry.responseText) {
      const consented = await hasConsent(entry.userId, 'ai_training');
      if (consented) {
        promptText = prepareStoredText(entry.promptText);
        responseText = prepareStoredText(entry.responseText);
      }
    }

    await pool.query(
      `INSERT INTO ai_interactions (
         user_id, user_role, feature, model, runtime,
         prompt_hash, prompt_chars, response_chars,
         latency_ms, status, error_message,
         streamed, has_schema, media_part_count,
         prompt_text, response_text
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
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
        promptText,
        responseText,
      ]
    );
  })().catch((err) => {
    console.warn('[ai] failed to log interaction:', err);
  });
}
