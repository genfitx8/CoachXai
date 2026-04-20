import { Router, Request, Response } from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { orderStorage } from '../services/orderStorage';
import { creditMembership, pendingMembershipApplyTokens } from '../services/membershipCredit';
import { buildPayappPaymentUrl, getAppBaseUrl } from '../payments/config';
import {
  parseApplyTokenRequest,
  parseConfirmRequest,
  parseCreateMembershipOrderRequest,
} from '../payments/validation';

const router = Router();

const APP_BASE_URL = getAppBaseUrl();
const PAYAPP_API_BASE = process.env.PAYAPP_API_BASE || 'https://api.payapp.kr/v1/payments';
const PAYAPP_CHECKOUT_URL = process.env.PAYAPP_CHECKOUT_URL || '';

router.post('/create-order', async (req: Request, res: Response) => {
  const parsed = parseCreateMembershipOrderRequest(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const { userId, amount, role } = parsed.data;

  const orderId = `snm-${uuidv4()}`;
  const now = Date.now();
  const membershipMonths = 1;
  const planName = role === 'COACH' ? '코치 프로 멤버십' : '회원 PRO 멤버십';

  await orderStorage.create({
    orderId,
    userId,
    amount,
    points: 0,
    status: 'PENDING',
    orderType: 'MEMBERSHIP',
    role,
    planName,
    membershipMonths,
    createdAt: now,
    updatedAt: now,
  });

  const orderName = `스윙노트 ${planName}`;
  const successUrl = `${APP_BASE_URL}/payment/success?purchase=membership`;
  const failUrl = `${APP_BASE_URL}/payment/fail?purchase=membership`;
  const fallbackPaymentUrl =
    `${successUrl}&` +
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
  if (!order || order.orderType !== 'MEMBERSHIP') {
    res.status(404).json({ error: '멤버십 주문을 찾을 수 없습니다.' });
    return;
  }

  if (order.status === 'PAID') {
    res.json({
      success: true,
      alreadyConfirmed: true,
      planName: order.planName,
      role: order.role,
      membershipMonths: order.membershipMonths,
    });
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

    const membershipResult = await creditMembership(
      order.userId,
      order.role ?? 'CLIENT',
      order.planName ?? '회원 PRO 멤버십',
      order.membershipMonths ?? 1,
      order.orderId
    );

    res.json({
      success: true,
      payappStatus,
      mockMode,
      role: order.role,
      planName: order.planName,
      membershipMonths: order.membershipMonths,
      requiresClientApply: membershipResult.requiresClientApply,
      applyToken: membershipResult.applyToken,
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
        error: 'PayApp 멤버십 결제 승인 실패',
        detail: err.response.data,
      });
    } else {
      res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
  }
});

router.post('/apply-local-membership', (req: Request, res: Response) => {
  const parsed = parseApplyTokenRequest(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const { applyToken } = parsed.data;
  const entry = pendingMembershipApplyTokens.get(applyToken);
  if (!entry) {
    res.status(404).json({ error: '유효하지 않거나 만료된 토큰입니다.' });
    return;
  }

  if (Date.now() > entry.expiresAt) {
    pendingMembershipApplyTokens.delete(applyToken);
    res.status(410).json({ error: '토큰이 만료되었습니다.' });
    return;
  }

  pendingMembershipApplyTokens.delete(applyToken);

  res.json({
    userId: entry.userId,
    role: entry.role,
    planName: entry.planName,
    membershipMonths: entry.membershipMonths,
    orderId: entry.orderId,
  });
});

export default router;
