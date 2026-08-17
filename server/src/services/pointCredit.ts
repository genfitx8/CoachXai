import crypto from 'crypto';
import pool from './db';
import { applyPointDelta } from './pointBalance';

interface PointCreditResult {
  success: boolean;
  requiresClientApply?: boolean;
  applyToken?: string;
}

// Short-lived single-use tokens for the client-side apply flow
export const pendingApplyTokens = new Map<
  string,
  { userId: string; points: number; orderId: string; expiresAt: number }
>();

export async function creditPoints(
  userId: string,
  points: number,
  orderId: string
): Promise<PointCreditResult> {
  // Record transaction in PostgreSQL for audit purposes
  try {
    await pool.query(
      `INSERT INTO point_transactions (id, client_id, amount, type, description, order_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        crypto.randomUUID(),
        userId,
        points,
        'POINT_TOPUP',
        `포인트 충전 (${orderId})`,
        orderId,
        Date.now(),
      ]
    );
  } catch (err) {
    console.error('[pointCredit] Failed to log transaction:', err);
  }

  // Server-authoritative balance (docs/DATA_ARCHITECTURE.md Phase 1): credit
  // current_points here so API-mode clients only need to refresh their
  // profile. localStorage-mode clients still apply locally via the applyToken
  // flow below — their local store is separate from this DB balance.
  // Best-effort: a balance failure must not fail the payment confirm.
  try {
    const balance = await applyPointDelta(userId, points);
    if (balance === null) {
      console.warn(`[pointCredit] No profile row found for ${userId}; balance not applied`);
    }
  } catch (err) {
    console.error('[pointCredit] Failed to apply balance:', err);
  }

  // Issue a short-lived token; the client exchanges it to update its local data
  const token = crypto.randomUUID();
  pendingApplyTokens.set(token, {
    userId,
    points,
    orderId,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  return { success: true, requiresClientApply: true, applyToken: token };
}
