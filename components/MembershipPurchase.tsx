import React, { useState } from 'react';
import { ChevronLeft, Crown, CreditCard, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import { ClientProfile } from '../types';
import { paymentService } from '../services/paymentService';

interface MembershipPurchaseProps {
  clientProfile: ClientProfile;
  onBack: () => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export const MembershipPurchase: React.FC<MembershipPurchaseProps> = ({
  clientProfile,
  onBack,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { price } = paymentService.getPricing('CLIENT');
  const userId = `${clientProfile.name}_${clientProfile.phone}`;

  const handleUpgrade = async () => {
    setLoading(true);
    setError(null);

    try {
      const orderRes = await fetch(`${API_BASE}/api/payments/payapp-membership/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          amount: price,
          role: 'CLIENT',
        }),
      });

      if (!orderRes.ok) {
        const data = await orderRes.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? '멤버십 주문 생성 실패');
      }

      const order = (await orderRes.json()) as { paymentUrl: string };
      window.location.href = order.paymentUrl;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '결제 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50">
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900">PRO 멤버십 결제</h1>
          <p className="text-xs text-gray-500">1분 안에 업그레이드 가능</p>
        </div>
      </div>

      <div className="p-4 max-w-md mx-auto space-y-4 pt-6">
        <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-indigo-100 font-semibold">추천 플랜</p>
              <h2 className="text-2xl font-black mt-1">🔵 PRO 멤버십</h2>
            </div>
            <div className="bg-white/20 p-3 rounded-xl">
              <Crown className="w-6 h-6" />
            </div>
          </div>
          <p className="text-3xl font-black mt-4">₩{price.toLocaleString()}<span className="text-base font-medium"> / 월</span></p>
        </div>

        <div className="bg-white rounded-2xl border border-indigo-100 p-4 space-y-3">
          {['기록 무제한', 'AI 분석 무제한', '성장 그래프 · 훈련 추천', '상세 분석 리포트'].map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm text-gray-700">
              <CheckCircle2 className="w-4 h-4 text-indigo-600" />
              <span>{item}</span>
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="w-full bg-gradient-to-r from-indigo-700 to-blue-600 disabled:from-gray-300 disabled:to-gray-400 text-white rounded-2xl py-4 font-bold text-base shadow-lg shadow-slate-200 disabled:shadow-none transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              결제창 이동 중...
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              PRO 시작하기
            </>
          )}
        </button>

        <p className="text-center text-xs text-gray-400 pb-4 flex items-center justify-center gap-1">
          <Sparkles className="w-3 h-3" /> PayApp으로 안전하게 결제됩니다
        </p>
      </div>
    </div>
  );
};

export default MembershipPurchase;
