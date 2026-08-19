import pool from './db';
import { scrubPii } from './pii';

/**
 * AI 피드백 이벤트 기록 (docs/DATA_ARCHITECTURE.md §5.5, §6.2).
 *
 * 라벨은 두 경로로 들어온다:
 *  - 클라이언트가 명시적으로 보내는 행동(별표·반려·재생성·승인 취소)
 *  - 서버가 상태 전이에서 스스로 알아채는 것(초안≠최종본인 채로 승인됨)
 *
 * 후자가 있어야 구버전 클라이언트에서도 가치 1위 학습쌍이 새지 않는다.
 */

export type AiFeedbackKind =
  | 'starred'
  | 'edited'
  | 'dissent'
  | 'regenerated'
  | 'approval_undo'
  | 'thumbs_up'
  | 'thumbs_down';

/** 한 행이 삼킬 수 있는 원문 상한. */
export const MAX_FEEDBACK_TEXT_CHARS = 20_000;

export interface AiFeedbackInput {
  userId: string;
  userRole: string;
  kind: AiFeedbackKind;
  target?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  originalOutput?: string | null;
  finalOutput?: string | null;
  tier?: number | null;
  note?: string | null;
  interactionId?: string | null;
}

export const clampFeedbackText = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.length === 0) return null;
  const scrubbed = scrubPii(value);
  if (!scrubbed) return null;
  return scrubbed.length > MAX_FEEDBACK_TEXT_CHARS
    ? scrubbed.slice(0, MAX_FEEDBACK_TEXT_CHARS)
    : scrubbed;
};

const clampShort = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.length > 0 ? value.slice(0, max) : null;

export async function recordAiFeedback(input: AiFeedbackInput): Promise<string> {
  const result = await pool.query(
    `INSERT INTO ai_feedback_events (
       interaction_id, user_id, user_role, kind, target,
       entity_type, entity_id, original_output, final_output, tier, note
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      input.interactionId ?? null,
      input.userId,
      input.userRole,
      input.kind,
      clampShort(input.target, 60),
      clampShort(input.entityType, 40),
      clampShort(input.entityId, 200),
      clampFeedbackText(input.originalOutput),
      clampFeedbackText(input.finalOutput),
      typeof input.tier === 'number' && input.tier >= 1 && input.tier <= 3
        ? Math.trunc(input.tier)
        : null,
      clampFeedbackText(input.note),
    ]
  );
  return result.rows[0].id as string;
}

/** 라벨 수집이 본래 작업을 막아서는 안 된다 — 실패는 로그로만 남긴다. */
export function recordAiFeedbackSafe(input: AiFeedbackInput): void {
  void recordAiFeedback(input).catch((err) => {
    console.warn('[ai-feedback] failed to record:', err);
  });
}
