const DEFAULT_APP_BASE_URL = 'http://localhost:3000';

const ensureHttpUrl = (value: string): URL | null => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const getAppBaseUrl = (): string => {
  const raw = process.env.APP_BASE_URL || DEFAULT_APP_BASE_URL;
  const parsed = ensureHttpUrl(raw);
  if (!parsed) {
    console.warn('[swingnote-server] Invalid APP_BASE_URL, falling back to http://localhost:3000');
    return DEFAULT_APP_BASE_URL;
  }
  return raw.replace(/\/$/, '');
};

export const buildPayappPaymentUrl = ({
  checkoutBaseUrl,
  fallbackPaymentUrl,
  orderId,
  amount,
  orderName,
  successUrl,
  failUrl,
}: {
  checkoutBaseUrl: string;
  fallbackPaymentUrl: string;
  orderId: string;
  amount: number;
  orderName: string;
  successUrl: string;
  failUrl: string;
}): string => {
  if (!checkoutBaseUrl) {
    return fallbackPaymentUrl;
  }

  const checkoutUrl = ensureHttpUrl(checkoutBaseUrl);
  if (!checkoutUrl) {
    return fallbackPaymentUrl;
  }

  checkoutUrl.searchParams.set('orderId', orderId);
  checkoutUrl.searchParams.set('amount', String(amount));
  checkoutUrl.searchParams.set('orderName', orderName);
  checkoutUrl.searchParams.set('successUrl', successUrl);
  checkoutUrl.searchParams.set('failUrl', failUrl);
  return checkoutUrl.toString();
};

