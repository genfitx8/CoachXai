import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface TodayLessonSummary {
  id: string;
  clientName: string;
  time: string;
  title: string;
  status: 'scheduled' | 'completed';
}

interface WelcomeScreenProps {
  coachName: string;
  todayLessons: TodayLessonSummary[];
  onComplete: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-cyan-400/15 text-cyan-300 border border-cyan-400/25',
  completed: 'bg-emerald-400/15 text-emerald-300 border border-emerald-400/25',
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: '예정',
  completed: '완료',
};

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  coachName,
  todayLessons,
  onComplete,
}) => {
  const [phase, setPhase] = useState<1 | 2 | 3 | 4>(1);
  const [displayedText, setDisplayedText] = useState('');
  const autoAdvanceRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
    if (autoAdvanceRef.current !== null) {
      window.clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
  }, []);

  const handleComplete = useCallback(() => {
    clearAllTimers();
    onComplete();
  }, [clearAllTimers, onComplete]);

  // Auto-advance timer
  useEffect(() => {
    const delay = prefersReducedMotion ? 2000 : 6000;
    autoAdvanceRef.current = window.setTimeout(handleComplete, delay);
    return () => {
      if (autoAdvanceRef.current !== null) window.clearTimeout(autoAdvanceRef.current);
    };
  }, [handleComplete, prefersReducedMotion]);

  // Phase sequencing
  useEffect(() => {
    if (prefersReducedMotion) {
      setPhase(4);
      return;
    }

    const t1 = window.setTimeout(() => setPhase(2), 500);
    const t2 = window.setTimeout(() => setPhase(3), 3500);
    timersRef.current = [t1, t2];

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [prefersReducedMotion]);

  // Typewriter effect for phase 2
  useEffect(() => {
    if (phase !== 2) return;
    const greeting = `안녕하세요, ${coachName}님 👋`;
    let index = 0;
    setDisplayedText('');

    const interval = window.setInterval(() => {
      index++;
      setDisplayedText(greeting.slice(0, index));
      if (index >= greeting.length) {
        window.clearInterval(interval);
        const t = window.setTimeout(() => setPhase(3), 300);
        timersRef.current.push(t);
      }
    }, 55);

    return () => window.clearInterval(interval);
  }, [phase, coachName]);

  return (
    <div className="animate-welcome-fade-in fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#030407] text-white">
      {/* Ambient background orbs */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.07),transparent_55%)]" />
        <div
          className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/15 blur-3xl animate-coachx-orb-drift"
        />
        <div
          className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/10 blur-3xl animate-coachx-orb-drift"
          style={{ animationDelay: '1.2s' }}
        />
        <div
          className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/25 animate-pulse"
          style={{ animationDelay: '0.4s' }}
        />
        <div
          className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-300/20 animate-pulse"
          style={{ animationDelay: '1s' }}
        />
      </div>

      {/* Center content */}
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center px-6 text-center">
        {/* Logo orb */}
        <div
          className="mb-8 flex h-20 w-20 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-500/10 shadow-[0_0_40px_rgba(56,189,248,0.2)]"
          style={{
            opacity: phase >= 1 ? 1 : 0,
            transition: 'opacity 0.6s ease-out',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-9 w-9 text-cyan-300"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
            />
          </svg>
        </div>

        {/* Phase 2–4: Greeting text */}
        <div
          className="min-h-[2.5rem]"
          style={{
            opacity: phase >= 2 ? 1 : 0,
            transition: 'opacity 0.4s ease-out',
          }}
        >
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            {phase >= 3 ? `안녕하세요, ${coachName}님 👋` : displayedText}
            {phase === 2 && (
              <span className="ml-0.5 inline-block animate-pulse opacity-70">|</span>
            )}
          </h1>
        </div>

        {/* Phase 3–4: Secondary text */}
        <div
          className="mt-3"
          style={{
            opacity: phase >= 3 ? 1 : 0,
            transition: 'opacity 0.5s ease-out',
          }}
        >
          {phase === 3 ? (
            <p className="text-sm text-white/50">
              오늘 일정을 확인할게요
              <span className="ml-1 inline-flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="animate-pulse"
                    style={{ animationDelay: `${i * 200}ms` }}
                  >
                    .
                  </span>
                ))}
              </span>
            </p>
          ) : (
            <p className="text-sm text-white/50">
              {todayLessons.length > 0
                ? `오늘 레슨 ${todayLessons.length}건`
                : '오늘 예정된 레슨'}
            </p>
          )}
        </div>

        {/* Phase 4: Lesson cards */}
        {phase >= 4 && (
          <div className="mt-6 w-full space-y-2.5">
            {todayLessons.length === 0 ? (
              <div
                className="glass-dark rounded-xl px-4 py-4 text-center"
                style={{ animation: 'slideInUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}
              >
                <p className="text-sm text-white/40">오늘 예정된 수업이 없습니다</p>
              </div>
            ) : (
              todayLessons.slice(0, 4).map((lesson, index) => (
                <div
                  key={lesson.id}
                  className="glass-dark flex items-center gap-3 rounded-xl px-4 py-3"
                  style={{
                    animation: 'slideInUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
                    animationDelay: `${index * 100}ms`,
                  }}
                >
                  <div className="w-14 shrink-0 font-mono text-xs text-cyan-400">
                    {lesson.time}
                  </div>
                  <div className="h-7 w-px bg-white/10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white/90">
                      {lesson.clientName}
                    </p>
                    <p className="truncate text-xs text-white/40">{lesson.title}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[lesson.status]}`}
                  >
                    {STATUS_LABELS[lesson.status]}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="absolute bottom-10 left-0 right-0 z-10 flex flex-col items-center gap-3 px-6">
        <button
          type="button"
          onClick={handleComplete}
          className="w-full max-w-sm rounded-xl border border-cyan-300/25 bg-cyan-500/10 py-3.5 text-sm font-semibold text-cyan-100 backdrop-blur-sm transition-colors hover:bg-cyan-500/20 hover:border-cyan-300/40"
        >
          대시보드 시작하기 →
        </button>
        <button
          type="button"
          onClick={handleComplete}
          className="text-xs text-white/25 transition-colors hover:text-white/50"
        >
          건너뛰기
        </button>
      </div>
    </div>
  );
};
