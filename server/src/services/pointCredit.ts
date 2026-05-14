import crypto from 'crypto';
import pool from './db';

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
