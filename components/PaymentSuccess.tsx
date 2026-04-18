import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { ClientProfile, PointTransaction } from '../types';
import { pointService } from '../services/pointService';
import { storageService } from '../services/storage';
import { firebaseService } from '../services/firebase';

interface PaymentSuccessProps {
  clientProfile: ClientProfile;
  onBack: () => void;
  onPointsUpdated: (updatedProfile: ClientProfile) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

type Status = 'loading' | 'success' | 'error';

export const PaymentSuccess: React.FC<PaymentSuccessProps> = ({
  clientProfile,
  onBack,
  onPointsUpdated,
}) => {
  const [status, setStatus] = useState<Status>('loading');
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [updatedBalance, setUpdatedBalance] = useState(clientProfile.currentPoints ?? 0);
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
        const confirmRes = await fetch(`${API_BASE}/api/payments/toss/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentKey, orderId, amount }),
        });

        const data = (await confirmRes.json()) as {
          success?: boolean;
          points?: number;
          requiresClientApply?: boolean;
          applyToken?: string;
          error?: string;
        };

        if (!confirmRes.ok || !data.success) {
          throw new Error(data.error ?? '결제 확인 실패');
        }

        const creditedPoints = data.points ?? 0;

        // If server could not credit directly (local fallback), apply client-side
        if (data.requiresClientApply && data.applyToken) {
          const applyRes = await fetch(`${API_BASE}/api/payments/toss/apply-local-points`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ applyToken: data.applyToken }),
          });

          if (!applyRes.ok) {
            throw new Error('포인트 적립 정보를 가져오지 못했습니다.');
          }

          const applyData = (await applyRes.json()) as {
            userId: string;
            points: number;
            orderId: string;
            type: PointTransaction['type'];
            description: string;
          };

          // Apply credit via existing pointService (localStorage path)
          const updated = await pointService.addTransaction(
            clientProfile,
            applyData.points,
            applyData.type,
            applyData.description
          );

          setEarnedPoints(applyData.points);
          setUpdatedBalance(updated.currentPoints ?? 0);
          onPointsUpdated(updated);
        } else {
          // Firebase credited server-side; refresh balance from storage
          setEarnedPoints(creditedPoints);
          let refreshedBalance = (clientProfile.currentPoints ?? 0) + creditedPoints;

          if (firebaseService.isInitialized()) {
            const clients = await firebaseService.loadClients();
            const found = clients.find(
              (c) =>
                c.name === clientProfile.name && c.phone === clientProfile.phone
            );
            if (found) {
              refreshedBalance = found.currentPoints ?? refreshedBalance;
              onPointsUpdated(found);
            }
          } else {
            const clients = storageService.getClients();
            const found = clients.find(
              (c) =>
                c.name === clientProfile.name && c.phone === clientProfile.phone
            );
            if (found) {
              refreshedBalance = found.currentPoints ?? refreshedBalance;
              onPointsUpdated(found);
            }
          }

          setUpdatedBalance(refreshedBalance);
        }

        setStatus('success');

        // Clean query params from URL
        window.history.replaceState({}, '', window.location.pathname);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : '결제 처리 중 오류가 발생했습니다.');
        setStatus('error');
      }
    })();
  }, [clientProfile, onPointsUpdated]); // API_BASE is a module-level constant and intentionally omitted

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex flex-col items-center justify-center p-6">
      {status === 'loading' && (
        <div className="text-center space-y-4">
          <Loader2 className="w-16 h-16 text-emerald-700 animate-spin mx-auto" />
          <p className="text-gray-600 font-medium">결제를 확인하는 중입니다…</p>
        </div>
      )}

      {status === 'success' && (
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center space-y-5">
          <CheckCircle className="w-20 h-20 text-emerald-700 mx-auto" />
          <div>
            <h2 className="text-2xl font-black text-gray-900">결제 완료!</h2>
            <p className="text-gray-500 mt-1 text-sm">포인트가 충전되었습니다</p>
          </div>
          <div className="bg-emerald-50 rounded-2xl p-4">
            <div className="text-3xl font-black text-emerald-600">
              +{earnedPoints.toLocaleString()}P
            </div>
            <div className="text-sm text-gray-500 mt-1">
              잔여 포인트:{' '}
              <span className="font-bold text-gray-900">
                {updatedBalance.toLocaleString()}P
              </span>
            </div>
          </div>
          <button
            onClick={onBack}
            className="w-full bg-gradient-to-r from-emerald-700 to-teal-600 text-white rounded-2xl py-3 font-bold shadow-lg shadow-slate-200"
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

export default PaymentSuccess;
