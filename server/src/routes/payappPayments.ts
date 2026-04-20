import { Router, Request, Response } from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { orderStorage } from '../services/orderStorage';
import { creditPoints, pendingApplyTokens } from '../services/pointCredit';
import { buildPayappPaymentUrl, getAppBaseUrl } from '../payments/config';
import {
  parseApplyTokenRequest,
  parseConfirmRequest,
  parseCreatePointOrderRequest,
  parseWebhookRequest,
} from '../payments/validation';

const router = Router();

const APP_BASE_URL = getAppBaseUrl();
const PAYAPP_API_BASE = process.env.PAYAPP_API_BASE || 'https://api.payapp.kr/v1/payments';
const PAYAPP_CHECKOUT_URL = process.env.PAYAPP_CHECKOUT_URL || '';

router.post('/create-order', async (req: Request, res: Response) => {
  const parsed = parseCreatePointOrderRequest(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const { userId, amount, points } = parsed.data;

  const orderId = `sn-${uuidv4()}`;
  const now = Date.now();

  await orderStorage.create({
    orderId,
    userId,
    amount,
    points,
    status: 'PENDING',
    orderType: 'POINT_TOPUP',
    createdAt: now,
    updatedAt: now,
  });

  const orderName = `스윙노트 ${points.toLocaleString()}P 충전`;
  const successUrl = `${APP_BASE_URL}/payment/success`;
  const failUrl = `${APP_BASE_URL}/payment/fail`;
  const fallbackPaymentUrl =
    `${successUrl}?` +
    new URLSearchParams({
      paymentKey: `payapp-${orderId}`,
      orderId,
      amount: String(amount),
    }).toString();

  const paymentUrl = buildPayappPaymentUrl({
    checkoutBaseUrl: PAYAPP_CHECKOUT_URL,
    fallbackPaymentUrl,
    orderId,
    amount,
    orderName,
    successUrl,
    failUrl,
  });

  res.json({
    orderId,
    amount,
    orderName,
    successUrl,
    failUrl,
    paymentUrl,
  });
});

router.post('/confirm', async (req: Request, res: Response) => {
  const parsed = parseConfirmRequest(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const { paymentKey, orderId, amount } = parsed.data;
  const order = await orderStorage.findById(orderId);
  if (!order) {
    res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
    return;
  }

  if (order.status === 'PAID') {
    res.json({ success: true, alreadyConfirmed: true, points: order.points });
    return;
  }

  if (order.status === 'FAILED') {
    res.status(400).json({ error: '이미 실패 처리된 주문입니다.' });
    return;
  }

  if (order.amount !== amount) {
    res.status(400).json({ error: '결제 금액이 주문 금액과 일치하지 않습니다.' });
    return;
  }

  const finalizeSuccess = async (payappStatus: string, mockMode = false) => {
    await orderStorage.update(orderId, {
      status: 'PAID',
      paymentKey,
      updatedAt: Date.now(),
    });

    const creditResult = await creditPoints(order.userId, order.points, orderId);

    res.json({
      success: true,
      points: order.points,
      payappStatus,
      mockMode,
      requiresClientApply: creditResult.requiresClientApply ?? false,
      applyToken: creditResult.applyToken ?? null,
    });
  };

  const secretKey = process.env.PAYAPP_SECRET_KEY;
  if (!secretKey) {
    await finalizeSuccess('MOCK_CONFIRMED', true);
    return;
  }

  try {
    const payappResponse = await axios.post(
      `${PAYAPP_API_BASE}/confirm`,
      { paymentKey, orderId, amount },
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    await finalizeSuccess(payappResponse.data?.status ?? 'CONFIRMED');
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response) {
      await orderStorage.update(orderId, {
        status: 'FAILED',
        updatedAt: Date.now(),
      });
      res.status(err.response.status).json({
        error: 'PayApp 결제 승인 실패',
        detail: err.response.data,
      });
    } else {
      res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
  }
});

router.post('/webhook', async (req: Request, res: Response) => {
  const parsed = parseWebhookRequest(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const { paymentKey, orderId, status } = parsed.data;
  const order = await orderStorage.findById(orderId);
  if (!order) {
    res.json({ received: true });
    return;
  }

  if (order.status !== 'PENDING') {
    res.json({ received: true, skipped: true });
    return;
  }

  if (status === 'DONE' || status === 'PAID' || status === 'SUCCESS') {
    await orderStorage.update(orderId, {
      status: 'PAID',
      paymentKey: paymentKey ?? order.paymentKey,
      updatedAt: Date.now(),
    });
    await creditPoints(order.userId, order.points, orderId);
  } else if (status === 'ABORTED' || status === 'CANCELED' || status === 'FAILED') {
    await orderStorage.update(orderId, {
      status: 'FAILED',
      updatedAt: Date.now(),
    });
  }

  res.json({ received: true });
});

router.post('/apply-local-points', (req: Request, res: Response) => {
  const parsed = parseApplyTokenRequest(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const { applyToken } = parsed.data;
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

  pendingApplyTokens.delete(applyToken);

  res.json({
    userId: entry.userId,
    points: entry.points,
    orderId: entry.orderId,
    type: 'POINT_TOPUP_PAYAPP',
    description: `PayApp 포인트 충전 (${entry.orderId})`,
  });
});

export default router;
