import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { ClientProfile } from '../types';

interface MembershipPaymentSuccessProps {
  clientProfile: ClientProfile;
  onBack: () => void;
  onMembershipUpdated: (updatedProfile: ClientProfile) => void;
}

type Status = 'loading' | 'success' | 'error';
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

const addMonths = (baseDate: Date, months: number): Date => {
  const copied = new Date(baseDate);
  copied.setMonth(copied.getMonth() + months);
  return copied;
};

export const MembershipPaymentSuccess: React.FC<MembershipPaymentSuccessProps> = ({
  clientProfile,
  onBack,
  onMembershipUpdated,
}) => {
  const [status, setStatus] = useState<Status>('loading');
  const [planName, setPlanName] = useState('PRO 멤버십');
  const [endDate, setEndDate] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const confirmedRef = useRef(false);

  useEffect(() => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const paymentKey = params.get('paymentKey');
    const orderId = params.get('orderId');
    const amountStr = params.get('amount');

    if (!paymentKey || !orderId || !amountStr) {
      setErrorMsg('결제 정보가 올바르지 않습니다.');
      setStatus('error');
      return;
    }

    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      setErrorMsg('결제 금액이 올바르지 않습니다.');
      setStatus('error');
      return;
    }

    (async () => {
      try {
        const confirmRes = await fetch(`${API_BASE}/api/payments/payapp-membership/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentKey, orderId, amount }),
        });

        const data = (await confirmRes.json()) as {
          success?: boolean;
          requiresClientApply?: boolean;
          applyToken?: string;
          membershipMonths?: number;
          planName?: string;
          error?: string;
        };

        if (!confirmRes.ok || !data.success) {
          throw new Error(data.error ?? '멤버십 결제 확인 실패');
        }

        const months = data.membershipMonths ?? 1;
        const nextDate = addMonths(new Date(), months).toISOString().split('T')[0];

        if (data.requiresClientApply && data.applyToken) {
          const applyRes = await fetch(`${API_BASE}/api/payments/payapp-membership/apply-local-membership`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ applyToken: data.applyToken }),
          });

          if (!applyRes.ok) {
            throw new Error('멤버십 적용 정보를 가져오지 못했습니다.');
          }

          const applyData = (await applyRes.json()) as {
            planName?: string;
            membershipMonths?: number;
          };

          const appliedMonths = applyData.membershipMonths ?? months;
          const appliedEndDate = addMonths(new Date(), appliedMonths)
            .toISOString()
            .split('T')[0];

          const updatedProfile: ClientProfile = {
            ...clientProfile,
            isSubscribed: true,
            subscriptionEndDate: appliedEndDate,
          };

          onMembershipUpdated(updatedProfile);
          setPlanName(applyData.planName ?? data.planName ?? 'PRO 멤버십');
          setEndDate(appliedEndDate);
        } else {
          const updatedProfile: ClientProfile = {
            ...clientProfile,
            isSubscribed: true,
            subscriptionEndDate: nextDate,
          };
          onMembershipUpdated(updatedProfile);
          setPlanName(data.planName ?? 'PRO 멤버십');
          setEndDate(nextDate);
        }

        setStatus('success');
        window.history.replaceState({}, '', window.location.pathname);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : '결제 처리 중 오류가 발생했습니다.');
        setStatus('error');
      }
    })();
  }, [clientProfile, onMembershipUpdated]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 flex flex-col items-center justify-center p-6">
      {status === 'loading' && (
        <div className="text-center space-y-4">
          <Loader2 className="w-16 h-16 text-indigo-700 animate-spin mx-auto" />
          <p className="text-gray-600 font-medium">멤버십 결제를 확인하는 중입니다…</p>
        </div>
      )}

      {status === 'success' && (
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center space-y-5">
          <CheckCircle className="w-20 h-20 text-indigo-700 mx-auto" />
          <div>
            <h2 className="text-2xl font-black text-gray-900">업그레이드 완료!</h2>
            <p className="text-gray-500 mt-1 text-sm">{planName}이 활성화되었습니다</p>
          </div>
          <div className="bg-indigo-50 rounded-2xl p-4 text-sm text-gray-700">
            <div className="font-bold text-indigo-700">멤버십 만료일</div>
            <div className="text-lg font-black text-gray-900 mt-1">{endDate}</div>
          </div>
          <button
            onClick={onBack}
            className="w-full bg-gradient-to-r from-indigo-700 to-blue-600 text-white rounded-2xl py-3 font-bold shadow-lg shadow-slate-200"
          >
            홈으로 돌아가기
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center space-y-5">
          <AlertCircle className="w-20 h-20 text-red-400 mx-auto" />
          <div>
            <h2 className="text-xl font-black text-gray-900">결제 확인 실패</h2>
            <p className="text-red-500 mt-2 text-sm">{errorMsg}</p>
          </div>
          <button
            onClick={onBack}
            className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl py-3 font-bold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            돌아가기
          </button>
        </div>
      )}
    </div>
  );
};

export default MembershipPaymentSuccess;
