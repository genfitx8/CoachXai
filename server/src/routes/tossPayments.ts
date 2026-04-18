import { Router, Request, Response } from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { orderStorage } from '../services/orderStorage';
import { creditPoints, pendingApplyTokens } from '../services/pointCredit';

const router = Router();

const APP_BASE_URL = (() => {
  const raw = process.env.APP_BASE_URL || 'http://localhost:3000';
  // Validate: only allow http/https URLs to prevent open-redirect
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Invalid protocol');
    }
    // Strip trailing slash for consistency
    return raw.replace(/\/$/, '');
  } catch {
    console.warn('[swingnote-server] Invalid APP_BASE_URL, falling back to http://localhost:3000');
    return 'http://localhost:3000';
  }
})();

// Toss Payments REST API base
const TOSS_API_BASE = 'https://api.tosspayments.com/v1/payments';

// ── 1. Create Order ─────────────────────────────────────────────────────────
router.post('/create-order', async (req: Request, res: Response) => {
  const { userId, amount, points } = req.body as {
    userId?: string;
    amount?: number;
    points?: number;
  };

  if (!userId || typeof amount !== 'number' || typeof points !== 'number') {
    res.status(400).json({ error: '잘못된 요청입니다.' });
    return;
  }

  if (amount <= 0 || points <= 0) {
    res.status(400).json({ error: 'amount와 points는 양수여야 합니다.' });
    return;
  }

  const orderId = `sn-${uuidv4()}`;
  const now = Date.now();

  await orderStorage.create({
    orderId,
    userId,
    amount,
    points,
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
  });

  res.json({
    orderId,
    amount,
    orderName: `스윙노트 ${points.toLocaleString()}P 충전`,
    successUrl: `${APP_BASE_URL}/payment/success`,
    failUrl: `${APP_BASE_URL}/payment/fail`,
  });
});

// ── 2. Confirm Payment ──────────────────────────────────────────────────────
router.post('/confirm', async (req: Request, res: Response) => {
  const { paymentKey, orderId, amount } = req.body as {
    paymentKey?: string;
    orderId?: string;
    amount?: number;
  };

  if (!paymentKey || !orderId || typeof amount !== 'number') {
    res.status(400).json({ error: '잘못된 요청입니다.' });
    return;
  }

  // Look up the pending order
  const order = await orderStorage.findById(orderId);
  if (!order) {
    res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
    return;
  }

  // Idempotency: already confirmed
  if (order.status === 'PAID') {
    res.json({ success: true, alreadyConfirmed: true, points: order.points });
    return;
  }

  if (order.status === 'FAILED') {
    res.status(400).json({ error: '이미 실패 처리된 주문입니다.' });
    return;
  }

  // Validate amount
  if (order.amount !== amount) {
    res.status(400).json({ error: '결제 금액이 주문 금액과 일치하지 않습니다.' });
    return;
  }

  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    res.status(500).json({ error: '서버 설정 오류: TOSS_SECRET_KEY가 없습니다.' });
    return;
  }

  // Call Toss Payments confirm API
  const credentials = Buffer.from(`${secretKey}:`).toString('base64');
  try {
    const tossResponse = await axios.post(
      `${TOSS_API_BASE}/confirm`,
      { paymentKey, orderId, amount },
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Mark order as PAID
    await orderStorage.update(orderId, {
      status: 'PAID',
      paymentKey,
      updatedAt: Date.now(),
    });

    // Credit points
    const creditResult = await creditPoints(order.userId, order.points, orderId);

    res.json({
      success: true,
      points: order.points,
      tossStatus: tossResponse.data?.status,
      requiresClientApply: creditResult.requiresClientApply ?? false,
      applyToken: creditResult.applyToken ?? null,
    });
  } catch (err: unknown) {
    // Mark order as failed if Toss rejects it
    if (axios.isAxiosError(err) && err.response) {
      await orderStorage.update(orderId, {
        status: 'FAILED',
        updatedAt: Date.now(),
      });
      res.status(err.response.status).json({
        error: '토스페이먼츠 결제 승인 실패',
        detail: err.response.data,
      });
    } else {
      res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
  }
});

// ── 3. Webhook ──────────────────────────────────────────────────────────────
router.post('/webhook', async (req: Request, res: Response) => {
  // Toss sends events like PAYMENT_STATUS_CHANGED
  const { paymentKey, orderId, status } = req.body as {
    paymentKey?: string;
    orderId?: string;
    status?: string;
  };

  if (!orderId) {
    res.status(400).json({ error: 'orderId missing' });
    return;
  }

  const order = await orderStorage.findById(orderId);
  if (!order) {
    // Unknown order – acknowledge to prevent retries
    res.json({ received: true });
    return;
  }

  // Idempotency: only process once
  if (order.status !== 'PENDING') {
    res.json({ received: true, skipped: true });
    return;
  }

  if (status === 'DONE') {
    await orderStorage.update(orderId, {
      status: 'PAID',
      paymentKey: paymentKey ?? order.paymentKey,
      updatedAt: Date.now(),
    });
    await creditPoints(order.userId, order.points, orderId);
  } else if (status === 'ABORTED' || status === 'CANCELED') {
    await orderStorage.update(orderId, {
      status: 'FAILED',
      updatedAt: Date.now(),
    });
  }

  res.json({ received: true });
});

// ── 4. Apply Local Points (local-dev fallback) ──────────────────────────────
// Client exchanges the applyToken to record the point credit in localStorage.
// This endpoint only issues the "what to apply" payload; the client does the write.
// In production with Firebase, this endpoint is never needed.
router.post('/apply-local-points', (req: Request, res: Response) => {
  const { applyToken } = req.body as { applyToken?: string };
  if (!applyToken) {
    res.status(400).json({ error: 'applyToken이 필요합니다.' });
    return;
  }

  const entry = pendingApplyTokens.get(applyToken);
  if (!entry) {
    res.status(404).json({ error: '유효하지 않거나 만료된 토큰입니다.' });
    return;
  }

  if (Date.now() > entry.expiresAt) {
    pendingApplyTokens.delete(applyToken);
    res.status(410).json({ error: '토큰이 만료되었습니다.' });
    return;
  }

  // Single-use: remove immediately
  pendingApplyTokens.delete(applyToken);

  res.json({
    userId: entry.userId,
    points: entry.points,
    orderId: entry.orderId,
    type: 'POINT_TOPUP_TOSS',
    description: `토스페이먼츠 포인트 충전 (${entry.orderId})`,
  });
});

export default router;
