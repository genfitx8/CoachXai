export type MembershipRole = 'CLIENT' | 'COACH';

type ValidationSuccess<T> = { ok: true; data: T };
type ValidationFailure = { ok: false; error: string };
type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

interface CreatePointOrderRequest {
  userId: string;
  amount: number;
  points: number;
}

interface CreateMembershipOrderRequest {
  userId: string;
  amount: number;
  role: MembershipRole;
}

interface ConfirmRequest {
  paymentKey: string;
  orderId: string;
  amount: number;
}

interface ApplyTokenRequest {
  applyToken: string;
}

interface WebhookRequest {
  orderId: string;
  paymentKey?: string;
  status?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readTrimmedString = (
  source: Record<string, unknown>,
  key: string,
  maxLength = 256
): string | null => {
  const value = source[key];
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    return null;
  }
  return trimmed;
};

const readPositiveNumber = (source: Record<string, unknown>, key: string): number | null => {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
};

const asError = <T>(error: string): ValidationResult<T> => ({ ok: false, error });

export const parseCreatePointOrderRequest = (body: unknown): ValidationResult<CreatePointOrderRequest> => {
  if (!isRecord(body)) {
    return asError('요청 본문이 올바르지 않습니다.');
  }

  const userId = readTrimmedString(body, 'userId');
  const amount = readPositiveNumber(body, 'amount');
  const points = readPositiveNumber(body, 'points');

  if (!userId || amount === null || points === null) {
    return asError('userId, amount, points를 올바르게 입력해주세요.');
  }

  return { ok: true, data: { userId, amount, points } };
};

export const parseCreateMembershipOrderRequest = (
  body: unknown
): ValidationResult<CreateMembershipOrderRequest> => {
  if (!isRecord(body)) {
    return asError('요청 본문이 올바르지 않습니다.');
  }

  const userId = readTrimmedString(body, 'userId');
  const amount = readPositiveNumber(body, 'amount');
  const role = readTrimmedString(body, 'role', 16);
  const isValidRole = role === 'CLIENT' || role === 'COACH';

  if (!userId || amount === null || !isValidRole) {
    return asError('userId, amount, role을 올바르게 입력해주세요.');
  }

  return { ok: true, data: { userId, amount, role } };
};

export const parseConfirmRequest = (body: unknown): ValidationResult<ConfirmRequest> => {
  if (!isRecord(body)) {
    return asError('요청 본문이 올바르지 않습니다.');
  }

  const paymentKey = readTrimmedString(body, 'paymentKey');
  const orderId = readTrimmedString(body, 'orderId');
  const amount = readPositiveNumber(body, 'amount');

  if (!paymentKey || !orderId || amount === null) {
    return asError('paymentKey, orderId, amount를 올바르게 입력해주세요.');
  }

  return { ok: true, data: { paymentKey, orderId, amount } };
};

export const parseApplyTokenRequest = (body: unknown): ValidationResult<ApplyTokenRequest> => {
  if (!isRecord(body)) {
    return asError('요청 본문이 올바르지 않습니다.');
  }

  const applyToken = readTrimmedString(body, 'applyToken');
  if (!applyToken) {
    return asError('applyToken이 필요합니다.');
  }

  return { ok: true, data: { applyToken } };
};

export const parseWebhookRequest = (body: unknown): ValidationResult<WebhookRequest> => {
  if (!isRecord(body)) {
    return asError('요청 본문이 올바르지 않습니다.');
  }

  const orderId = readTrimmedString(body, 'orderId');
  if (!orderId) {
    return asError('orderId missing');
  }

  const paymentKey = readTrimmedString(body, 'paymentKey');
  const status = readTrimmedString(body, 'status', 64);
  return { ok: true, data: { orderId, paymentKey: paymentKey ?? undefined, status: status ?? undefined } };
};

