
import React, { useState } from 'react';
import { Button } from './Button';
import { paymentService } from '../services/paymentService';
import { pointService } from '../services/pointService';
import { CheckCircle, CreditCard, Lock, Sparkles, Star, CalendarClock, ShieldCheck, Coins } from 'lucide-react';
import { ClientProfile } from '../types';

interface SubscriptionModalProps {
  role: 'COACH' | 'CLIENT';
  userName: string;
  onPaymentSuccess: () => void;
  onLogout: () => void;
  // Added for point redemption
  clientProfile?: ClientProfile; 
  onUpdateProfile?: (profile: ClientProfile) => void;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ role, userName, onPaymentSuccess, onLogout, clientProfile, onUpdateProfile }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [usePoints, setUsePoints] = useState(false);
  const { price, name } = paymentService.getPricing(role);

  const availablePoints = clientProfile?.currentPoints || 0;
  const canUsePoints = role === 'CLIENT' && availablePoints > 0;
  
  // Calculate final price if points are used (1 Point = 1 KRW logic for simplicity)
  const discount = (canUsePoints && usePoints) ? Math.min(availablePoints, price) : 0;
  const finalPrice = Math.max(0, price - discount);

  const handlePayment = async () => {
    setIsLoading(true);
    try {
      // Simulate Payment
      await paymentService.processPayment(role);

      // Handle Point Deduction if used
      if (canUsePoints && usePoints && clientProfile && onUpdateProfile) {
          const updatedProfile = await pointService.addTransaction(
              clientProfile,
              -discount,
              'PURCHASE',
              `멤버십 구독 결제 포인트 사용`
          );
          onUpdateProfile(updatedProfile);
      }

      onPaymentSuccess();
    } catch (e) {
      alert("처리 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const isCoach = role === 'COACH';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/90 backdrop-blur-md p-4 animate-fade-in">
      <div className="bg-bg-raised rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative">
        <div className={`px-8 py-8 text-center text-white relative overflow-hidden ${isCoach ? 'bg-slate-800' : 'bg-emerald-800'}`}>
          <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
          <div className="relative z-10">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner ${isCoach ? 'bg-slate-700' : 'bg-emerald-700'}`}>
                {isCoach ? <Sparkles className="w-8 h-8 text-yellow-300 fill-current" /> : <Star className="w-8 h-8 text-yellow-300 fill-current" />}
            </div>
            <h2 className="text-2xl font-bold mb-1">{isCoach ? '프리미엄 코치 1주일 무료' : '멤버십 구독이 필요합니다'}</h2>
            <p className={`${isCoach ? 'text-ink-muted' : 'text-emerald-100'} text-sm`}>
                {isCoach ? '지금 시작하고 7일간 모든 기능을 무료로 체험하세요.' : 'CoachX AI의 모든 기능을 이용해보세요.'}
            </p>
          </div>
        </div>

        <div className="p-8">
          <div className="text-center mb-6">
            <p className="text-ink-medium text-sm font-medium uppercase tracking-wider mb-2">{isCoach ? 'Coach Premium Plan' : 'Member Plan'}</p>
            <h3 className="text-4xl font-extrabold text-ink-high">
              ₩{finalPrice.toLocaleString()}
              <span className="text-lg text-ink-muted font-normal"> / 월</span>
            </h3>
            {discount > 0 && (
                <p className="text-sm text-emerald-600 font-bold mt-1">
                    {discount.toLocaleString()}P 사용됨
                </p>
            )}
            {isCoach && (
                <div className="mt-2 inline-flex items-center gap-1 bg-bg-overlay text-ink-high px-3 py-1 rounded-full text-xs font-bold border border-line-default">
                    <CalendarClock className="w-3 h-3" /> 첫 7일 무료 체험 (언제든 취소 가능)
                </div>
            )}
          </div>

          {/* Point Usage Toggle */}
          {canUsePoints && (
              <div 
                onClick={() => setUsePoints(!usePoints)}
                className={`mb-6 p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${usePoints ? 'border-emerald-700 bg-primary-500/10' : 'border-line-default hover:border-primary-500/30'}`}
              >
                  <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${usePoints ? 'bg-emerald-700 text-white' : 'bg-bg-inset text-ink-medium'}`}>
                          <Coins className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                          <p className="font-bold text-ink-high text-sm">포인트 사용하기</p>
                          <p className="text-xs text-ink-medium">보유: {availablePoints.toLocaleString()} P</p>
                      </div>
                  </div>
                  <div className={`w-6 h-6 rounded-full border flex items-center justify-center ${usePoints ? 'bg-emerald-700 border-emerald-700' : 'border-line-default bg-bg-raised'}`}>
                      {usePoints && <CheckCircle className="w-4 h-4 text-white" />}
                  </div>
              </div>
          )}

          <div className="space-y-4 mb-8">
            {!isCoach && (
              <div className="rounded-xl border border-line-default overflow-hidden">
                <div className="grid grid-cols-2">
                  <div className="bg-primary-500/10 p-3 border-r border-line-default">
                    <p className="text-xs font-black text-primary-300 mb-1">🟢 FREE</p>
                    <ul className="text-[11px] text-ink-medium space-y-1">
                      <li>기록 10개</li>
                      <li>AI 분석 1회/일</li>
                      <li>기본 피드백</li>
                    </ul>
                  </div>
                  <div className="bg-primary-500/10 p-3">
                    <p className="text-xs font-black text-primary-300 mb-1">🔵 PRO (월 29,000원)</p>
                    <ul className="text-[11px] text-ink-high space-y-1">
                      <li>기록 무제한</li>
                      <li>AI 무제한</li>
                      <li>상세 분석 · 성장 그래프</li>
                      <li>훈련 추천</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
               <div className={`${isCoach ? 'bg-bg-overlay text-ink-medium' : 'bg-primary-500/15 text-emerald-600'} p-1 rounded-full`}><CheckCircle className="w-4 h-4" /></div>
               <span className="text-ink-medium text-sm">무제한 레슨 영상 저장</span>
            </div>
            <div className="flex items-center gap-3">
               <div className={`${isCoach ? 'bg-bg-overlay text-ink-medium' : 'bg-primary-500/15 text-emerald-600'} p-1 rounded-full`}><CheckCircle className="w-4 h-4" /></div>
               <span className="text-ink-medium text-sm">AI 스윙 정밀 분석</span>
            </div>
            {isCoach ? (
                <>
                    <div className="flex items-center gap-3">
                        <div className="bg-bg-overlay text-ink-medium p-1 rounded-full"><CheckCircle className="w-4 h-4" /></div>
                        <span className="text-ink-medium text-sm">회원별 포트폴리오 관리 & 전송</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="bg-bg-overlay text-ink-medium p-1 rounded-full"><CheckCircle className="w-4 h-4" /></div>
                        <span className="text-ink-medium text-sm">회원 앱 연동 기능</span>
                    </div>
                </>
            ) : (
                <div className="flex items-center gap-3">
                   <div className="bg-primary-500/15 p-1 rounded-full"><CheckCircle className="w-4 h-4" /></div>
                   <span className="text-ink-medium text-sm">과거 스윙 비교 (스윙 변천사)</span>
                </div>
            )}
          </div>

          <Button 
            onClick={handlePayment} 
            isLoading={isLoading} 
            className={`w-full py-4 text-lg font-bold shadow-lg mb-3 ${isCoach ? 'bg-slate-700 hover:bg-slate-800 focus:ring-slate-600 shadow-slate-200' : 'bg-emerald-800 hover:bg-emerald-900 focus:ring-emerald-700 shadow-slate-200'}`}
            icon={isCoach ? <Sparkles className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
          >
            {isCoach ? '7일 무료 체험 시작하기' : '지금 결제하고 시작하기'}
          </Button>
          
          <p className="text-center text-xs text-ink-muted mb-4">
            {isCoach ? '7일 후 29,900원이 결제됩니다.' : '매월 자동 결제됩니다.'} 설정에서 언제든지 해지할 수 있습니다.
          </p>
          
          <button 
            onClick={onLogout}
            className="w-full py-2 text-sm text-ink-muted hover:text-ink-medium transition-colors"
          >
            로그아웃
          </button>
        </div>

        <div className="bg-bg-base px-6 py-4 flex items-center justify-center gap-2 text-xs text-ink-muted">
            <ShieldCheck className="w-3 h-3" /> 안전한 결제 시스템으로 보호됩니다.
        </div>
      </div>
    </div>
  );
};
