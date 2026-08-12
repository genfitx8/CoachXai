import React from 'react';
import { ArrowRight, MessageSquare, ShieldCheck, Sparkles } from 'lucide-react';

/**
 * 7b · 초대 수락 첫 화면
 *
 * The redesign is explicit: don't gate a coach's invite on a signup
 * form. The invited student lands here first — a warm, low-friction
 * card that names their coach, explains what happens on the other
 * side of the button in one sentence per row, then hands off to the
 * app's existing Kakao/email login so their first real action is
 * reading the coach's first message.
 *
 * The screen is pre-auth by design and reads its context from the URL
 * (`?invite=<coachId>&coachName=<name>`) rather than fetching — no
 * unauthenticated coach-directory endpoint required to ship the
 * landing. The `?invite=` param is later read by App.tsx after login
 * completes so the fresh student profile gets bound to that coach.
 */

export interface InviteAcceptScreenProps {
  /** Coach's display name from the URL (?coachName=...). */
  coachName: string;
  /** Optional coach avatar URL. Falls back to the coach's initial. */
  coachAvatarUrl?: string;
  /** Optional per-coach greeting override; defaults to the standard copy. */
  greeting?: string;
  /** Opens the existing AuthScreen — student can sign up or log in. */
  onContinue: () => void;
}

const DEFAULT_HIGHLIGHTS = [
  {
    icon: MessageSquare,
    title: '코치와 나누는 대화',
    body: '레슨 요약과 다음에 할 일이 매번 카드로 도착해요.',
  },
  {
    icon: Sparkles,
    title: '내 스윙 · 진단 · 스코어',
    body: '기록이 쌓이면 성장을 한눈에 볼 수 있어요.',
  },
  {
    icon: ShieldCheck,
    title: '내 데이터는 내 것',
    body: '코치가 바뀌어도 영상과 이력은 그대로 남아요.',
  },
];

export const InviteAcceptScreen: React.FC<InviteAcceptScreenProps> = ({
  coachName,
  coachAvatarUrl,
  greeting,
  onContinue,
}) => {
  const displayName = coachName.trim() || '코치';
  const initial = displayName.slice(0, 1);
  const greetingText =
    greeting ?? `${displayName} 코치의 학생이 되어 첫 대화를 시작해봐요.`;

  return (
    <div className="min-h-screen bg-base text-ink-high flex flex-col">
      <main className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm mx-auto space-y-6">
          {/* Invite card */}
          <section className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.10] via-emerald-500/[0.05] to-transparent p-5">
            <div className="flex items-center gap-3 mb-3">
              {coachAvatarUrl ? (
                <img
                  src={coachAvatarUrl}
                  alt={`${displayName} 코치 아바타`}
                  className="w-11 h-11 rounded-full object-cover border border-emerald-400/40"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-100 font-bold text-lg">
                  {initial}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-200">
                  코치 초대
                </div>
                <div className="text-[15px] font-bold text-ink-high truncate mt-0.5">
                  {displayName} 코치가 초대했어요
                </div>
              </div>
            </div>
            <p className="text-[13px] leading-relaxed text-ink-medium">
              {greetingText}
            </p>
          </section>

          {/* Highlights */}
          <section>
            <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted mb-3">
              여기서 하게 될 일
            </div>
            <ul className="space-y-3">
              {DEFAULT_HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-line-subtle flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-emerald-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold text-ink-high">
                      {title}
                    </div>
                    <div className="text-[11.5px] leading-relaxed text-ink-muted mt-0.5">
                      {body}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Continue CTA */}
          <button
            type="button"
            onClick={onContinue}
            className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-[#04150e] text-[15px] font-bold flex items-center justify-center gap-2 transition-colors"
          >
            시작하기 <ArrowRight className="w-4 h-4" />
          </button>

          <p className="text-[11px] text-ink-muted text-center leading-relaxed">
            첫 프로필 입력이나 앱 다운로드가 필요 없어요. 로그인 한 번으로
            {' '}{displayName} 코치의 첫 메시지를 바로 볼 수 있어요.
          </p>
        </div>
      </main>
    </div>
  );
};
