import React, { useState } from 'react';
import { Button } from './Button';
import { Modal } from './ui/Modal';
import { paymentService } from '../services/paymentService';
import { pointService } from '../services/pointService';
import {
  CalendarClock,
  CheckCircle,
  Coins,
  CreditCard,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react';
import { ClientProfile } from '../types';

interface SubscriptionModalProps {
  role: 'COACH' | 'CLIENT';
  userName: string;
  onPaymentSuccess: () => void;
  onLogout: () => void;
  clientProfile?: ClientProfile;
  onUpdateProfile?: (profile: ClientProfile) => void;
}

const FeatureRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex items-center gap-3 text-sm text-ink-medium">
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500/15 text-primary-300">
      <CheckCircle className="h-3.5 w-3.5" />
    </span>
    {children}
  </li>
);

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  role,
  userName,
  onPaymentSuccess,
  onLogout,
  clientProfile,
  onUpdateProfile,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [usePoints, setUsePoints] = useState(false);
  const { price } = paymentService.getPricing(role);

  const availablePoints = clientProfile?.currentPoints || 0;
  const canUsePoints = role === 'CLIENT' && availablePoints > 0;

  const discount = canUsePoints && usePoints ? Math.min(availablePoints, price) : 0;
  const finalPrice = Math.max(0, price - discount);

  const isCoach = role === 'COACH';

  const handlePayment = async () => {
    setIsLoading(true);
    try {
      await paymentService.processPayment(role);

      if (canUsePoints && usePoints && clientProfile && onUpdateProfile) {
        const updatedProfile = await pointService.addTransaction(
          clientProfile,
          -discount,
          'PURCHASE',
          '멤버십 구독 결제 포인트 사용',
        );
        onUpdateProfile(updatedProfile);
      }

      onPaymentSuccess();
    } catch {
      alert('처리 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const title = (
    <span className="flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-glow">
        {isCoach ? <Sparkles className="h-5 w-5" /> : <Star className="h-5 w-5" />}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-2xs font-semibold uppercase tracking-[0.16em] text-primary-300/90">
          {isCoach ? 'Coach Premium' : 'Member Plan'}
        </span>
        <span className="text-base font-semibold text-ink-high">
          {isCoach ? '프리미엄 코치 1주일 무료' : '멤버십 구독이 필요합니다'}
        </span>
      </span>
    </span>
  );

  const description = isCoach
    ? `${userName} 코치님, 지금 시작하고 7일간 모든 기능을 무료로 체험하세요.`
    : 'CoachX AI의 모든 기능을 이용해보세요.';

  return (
    <Modal
      open
      onClose={onLogout}
      title={title}
      description={description}
      size="md"
      dismissOnBackdrop={false}
    >
      <div className="space-y-5">
        {/* Pricing block */}
        <div className="rounded-2xl border border-line-default bg-bg-base p-5 text-center">
          <h3 className="text-display-sm font-semibold text-ink-high">
            ₩{finalPrice.toLocaleString()}
            <span className="text-lg font-normal text-ink-muted"> / 월</span>
          </h3>
          {discount > 0 && (
            <p className="mt-1 text-sm font-semibold text-primary-300">
              {discount.toLocaleString()}P 사용됨
            </p>
          )}
          {isCoach && (
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary-500/30 bg-primary-500/10 px-3 py-1 text-xs font-medium text-primary-200">
              <CalendarClock className="h-3 w-3" /> 첫 7일 무료 체험 · 언제든 취소 가능
            </span>
          )}
        </div>

        {/* Point usage toggle */}
        {canUsePoints && (
          <button
            type="button"
            onClick={() => setUsePoints(!usePoints)}
            aria-pressed={usePoints}
            className={`flex w-full items-center justify-between rounded-xl border p-4 transition-all ${
              usePoints
                ? 'border-primary-500/40 bg-primary-500/10'
                : 'border-line-default bg-bg-base hover:border-line-strong'
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  usePoints ? 'bg-primary-500 text-white' : 'bg-bg-overlay text-ink-medium'
                }`}
              >
                <Coins className="h-4 w-4" />
              </span>
              <div className="text-left">
                <p className="text-sm font-semibold text-ink-high">포인트 사용하기</p>
                <p className="text-xs text-ink-muted">보유: {availablePoints.toLocaleString()} P</p>
              </div>
            </div>
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                usePoints
                  ? 'border-primary-500 bg-primary-500 text-white'
                  : 'border-line-default bg-bg-overlay'
              }`}
            >
              {usePoints && <CheckCircle className="h-3 w-3" />}
            </span>
          </button>
        )}

        {/* Plan comparison (member only) */}
        {!isCoach && (
          <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-line-default">
            <div className="border-r border-line-default bg-bg-base p-3">
              <p className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
                Free
              </p>
              <ul className="mt-2 space-y-1 text-2xs text-ink-medium">
                <li>· 기록 10개</li>
                <li>· AI 분석 1회/일</li>
                <li>· 기본 피드백</li>
              </ul>
            </div>
            <div className="bg-primary-500/10 p-3">
              <p className="text-2xs font-semibold uppercase tracking-wide text-primary-300">
                Pro · ₩29,000/월
              </p>
              <ul className="mt-2 space-y-1 text-2xs text-ink-high">
                <li>· 기록 무제한</li>
                <li>· AI 무제한 · 상세 분석</li>
                <li>· 성장 그래프 · 훈련 추천</li>
              </ul>
            </div>
          </div>
        )}

        {/* Features list */}
        <ul className="space-y-3">
          <FeatureRow>무제한 레슨 영상 저장</FeatureRow>
          <FeatureRow>AI 스윙 정밀 분석</FeatureRow>
          {isCoach ? (
            <>
              <FeatureRow>회원별 포트폴리오 관리 & 전송</FeatureRow>
              <FeatureRow>회원 앱 연동 기능</FeatureRow>
            </>
          ) : (
            <FeatureRow>과거 스윙 비교 (스윙 변천사)</FeatureRow>
          )}
        </ul>

        {/* Primary CTA */}
        <Button
          onClick={handlePayment}
          isLoading={isLoading}
          fullWidth
          size="lg"
          icon={isCoach ? <Sparkles className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
        >
          {isCoach ? '7일 무료 체험 시작하기' : '지금 결제하고 시작하기'}
        </Button>

        <p className="text-center text-xs text-ink-muted">
          {isCoach ? '7일 후 29,900원이 결제됩니다.' : '매월 자동 결제됩니다.'}
          {' '}설정에서 언제든지 해지할 수 있습니다.
        </p>

        <button
          type="button"
          onClick={onLogout}
          className="block w-full py-1 text-center text-sm text-ink-muted transition-colors hover:text-ink-medium"
        >
          로그아웃
        </button>

        <div className="-mx-6 -mb-4 flex items-center justify-center gap-2 border-t border-line-subtle bg-bg-base/60 px-6 py-3 text-xs text-ink-muted">
          <ShieldCheck className="h-3 w-3" /> 안전한 결제 시스템으로 보호됩니다.
        </div>
      </div>
    </Modal>
  );
};
