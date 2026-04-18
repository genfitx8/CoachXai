import React, { useState } from 'react';
import { ChevronLeft, CreditCard, Zap, Star, Crown, Loader2 } from 'lucide-react';
import { ClientProfile } from '../types';

interface PointPackage {
  points: number;
  amount: number; // KRW
  label: string;
  icon: React.ReactNode;
  popular?: boolean;
}

const POINT_PACKAGES: PointPackage[] = [
  {
    points: 10000,
    amount: 10000,
    label: '스타터',
    icon: <Zap className="w-5 h-5" />,
  },
  {
    points: 30000,
    amount: 30000,
    label: '레귤러',
    icon: <Star className="w-5 h-5" />,
    popular: true,
  },
  {
    points: 50000,
    amount: 50000,
    label: '프리미엄',
    icon: <Crown className="w-5 h-5" />,
  },
];

interface PointPurchaseProps {
  clientProfile: ClientProfile;
  onBack: () => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY ?? '';

export const PointPurchase: React.FC<PointPurchaseProps> = ({
  clientProfile,
  onBack,
}) => {
  const [selected, setSelected] = useState<PointPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = `${clientProfile.name}_${clientProfile.phone}`;

  const handlePurchase = async () => {
    if (!selected) return;
    if (!TOSS_CLIENT_KEY) {
      setError('결제 키가 설정되지 않았습니다. 관리자에게 문의하세요.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Create server-side order
      const orderRes = await fetch(`${API_BASE}/api/payments/toss/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          amount: selected.amount,
          points: selected.points,
        }),
      });

      if (!orderRes.ok) {
        const data = await orderRes.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? '주문 생성 실패');
      }

      const order = (await orderRes.json()) as {
        orderId: string;
        amount: number;
        orderName: string;
        successUrl: string;
        failUrl: string;
      };

      // 2. Load Toss Payments SDK dynamically and request payment
      const { loadTossPayments, ANONYMOUS } = await import('@tosspayments/tosspayments-sdk');
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);

      // Use ANONYMOUS for guest checkout; replace with customerKey when user auth is available
      const payment = tossPayments.payment({ customerKey: ANONYMOUS });

      await payment.requestPayment({
        method: 'CARD',
        amount: { currency: 'KRW', value: order.amount },
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: order.successUrl,
        failUrl: order.failUrl,
        customerName: clientProfile.name,
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        // Toss SDK throws when user cancels
        if (err.message?.includes('취소')) {
          setError(null);
        } else {
          setError(err.message);
        }
      } else {
        setError('결제 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={onBack}
          className="p-2 rounded-full hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900">포인트 구매</h1>
          <p className="text-xs text-gray-500">
            현재 보유: {(clientProfile.currentPoints ?? 0).toLocaleString()}P
          </p>
        </div>
      </div>

      <div className="p-4 max-w-md mx-auto space-y-4 pt-6">
        {/* Package cards */}
        <div className="space-y-3">
          {POINT_PACKAGES.map((pkg) => (
            <button
              key={pkg.points}
              onClick={() => setSelected(pkg)}
              className={`w-full relative rounded-2xl p-4 border-2 transition-all text-left flex items-center justify-between ${
                selected?.points === pkg.points
                  ? 'border-emerald-700 bg-emerald-50 shadow-md shadow-emerald-100'
                  : 'border-gray-200 bg-white hover:border-emerald-300'
              }`}
            >
              {pkg.popular && (
                <span className="absolute -top-2.5 left-4 bg-emerald-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  인기
                </span>
              )}
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl ${
                    selected?.points === pkg.points
                      ? 'bg-emerald-700 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {pkg.icon}
                </div>
                <div>
                  <div className="font-bold text-gray-900">{pkg.label}</div>
                  <div className="text-sm text-emerald-600 font-semibold">
                    {pkg.points.toLocaleString()}P
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-gray-900">
                  ₩{pkg.amount.toLocaleString()}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handlePurchase}
          disabled={!selected || loading}
          className="w-full bg-gradient-to-r from-emerald-700 to-teal-600 disabled:from-gray-300 disabled:to-gray-400 text-white rounded-2xl py-4 font-bold text-base shadow-lg shadow-slate-200 disabled:shadow-none transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              처리 중...
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              {selected
                ? `${selected.points.toLocaleString()}P 구매 (₩${selected.amount.toLocaleString()})`
                : '패키지를 선택하세요'}
            </>
          )}
        </button>

        <p className="text-center text-xs text-gray-400 pb-4">
          토스페이먼츠로 안전하게 결제됩니다
        </p>
      </div>
    </div>
  );
};

export default PointPurchase;
