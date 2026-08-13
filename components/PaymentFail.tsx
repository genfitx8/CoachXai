import React from 'react';
import { XCircle, ArrowLeft } from 'lucide-react';
import { BackButton } from './ui/BackButton';

interface PaymentFailProps {
  onBack: () => void;
}

export const PaymentFail: React.FC<PaymentFailProps> = ({ onBack }) => {
  const params = new URLSearchParams(window.location.search);
  const message = params.get('message') ?? '결제가 취소되었거나 오류가 발생했습니다.';
  const code = params.get('code');

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex flex-col">
      <div className="bg-white/[0.08] backdrop-blur-sm border-b border-line-subtle px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <BackButton onClick={onBack} tone="light" />
        <h1 className="text-lg font-bold text-ink-high">결제 실패</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="bg-white/[0.04] rounded-3xl shadow-xl p-6 sm:p-8 max-w-sm w-full text-center space-y-5">
          <XCircle className="w-20 h-20 text-red-400 mx-auto" />
          <div>
            <h2 className="text-xl font-black text-ink-high">결제 실패</h2>
            <p className="text-ink-muted mt-2 text-sm">{message}</p>
            {code && (
              <p className="text-xs text-ink-muted mt-1">오류 코드: {code}</p>
            )}
          </div>
          <button
            onClick={onBack}
            className="w-full flex items-center justify-center gap-2 bg-white/[0.06] hover:bg-white/[0.10] text-ink-medium rounded-2xl py-3 font-bold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            돌아가기
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentFail;
