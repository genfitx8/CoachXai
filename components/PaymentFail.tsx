import React from 'react';
import { XCircle, ArrowLeft } from 'lucide-react';

interface PaymentFailProps {
  onBack: () => void;
}

export const PaymentFail: React.FC<PaymentFailProps> = ({ onBack }) => {
  const params = new URLSearchParams(window.location.search);
  const message = params.get('message') ?? '결제가 취소되었거나 오류가 발생했습니다.';
  const code = params.get('code');

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center space-y-5">
        <XCircle className="w-20 h-20 text-red-400 mx-auto" />
        <div>
          <h2 className="text-xl font-black text-gray-900">결제 실패</h2>
          <p className="text-gray-500 mt-2 text-sm">{message}</p>
          {code && (
            <p className="text-xs text-gray-400 mt-1">오류 코드: {code}</p>
          )}
        </div>
        <button
          onClick={onBack}
          className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl py-3 font-bold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          돌아가기
        </button>
      </div>
    </div>
  );
};

export default PaymentFail;
