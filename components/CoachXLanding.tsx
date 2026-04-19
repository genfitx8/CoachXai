import React, { useEffect } from 'react';

interface CoachXLandingProps {
  onLogin: () => void;
  onSignup: () => void;
}

const GREETING_DELAY_MS = 450;
const GREETING_SPEECH_RATE = 0.92;

export const CoachXLanding: React.FC<CoachXLandingProps> = ({
  onLogin,
  onSignup,
}) => {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.sessionStorage.getItem('coachx.voiceGreetingAttempted') === '1') return;

    window.sessionStorage.setItem('coachx.voiceGreetingAttempted', '1');

    const speechSynthesisApi = window.speechSynthesis;
    const SpeechSynthesisUtteranceApi = window.SpeechSynthesisUtterance;
    if (!speechSynthesisApi || !SpeechSynthesisUtteranceApi) return;

    const greetingTimer = window.setTimeout(() => {
      try {
        const utterance = new SpeechSynthesisUtteranceApi('Hello, coach.');
        utterance.lang = 'en-US';
        utterance.rate = GREETING_SPEECH_RATE;
        utterance.pitch = 1;
        utterance.volume = 0.8;

        speechSynthesisApi.cancel();
        speechSynthesisApi.speak(utterance);
      } catch {
        // Graceful fallback: ignore blocked/unsupported autoplay audio.
      }
    }, GREETING_DELAY_MS);

    return () => {
      window.clearTimeout(greetingTimer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#030407] text-white flex flex-col items-center justify-center relative overflow-hidden px-6">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.06),transparent_55%)]" />
        <div
          data-testid="coachx-ai-orb"
          className="absolute left-1/2 top-1/2 w-80 h-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/15 blur-3xl animate-coachx-orb-drift"
        />
        <div
          className="absolute left-1/2 top-1/2 w-64 h-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/10 blur-3xl animate-coachx-orb-drift"
          style={{ animationDelay: '1.2s' }}
        />
        <div
          className="absolute left-1/2 top-1/2 w-60 h-60 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/35 animate-pulse"
          style={{ animationDelay: '0.4s' }}
        />
        <div
          className="absolute left-1/2 top-1/2 w-52 h-52 -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-300/30 animate-pulse"
          style={{ animationDelay: '1s' }}
        />
      </div>

      <div className="relative z-10 text-center">
        <h1 className="text-4xl md:text-5xl tracking-wide font-semibold">CoachX AI</h1>
        <p className="mt-4 text-white/70 text-base md:text-lg">Hello, coach.</p>
      </div>

      <div className="absolute bottom-8 left-0 right-0 z-10 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onLogin}
          className="px-4 py-1.5 rounded-full border border-white/15 bg-white/5 backdrop-blur-sm text-white/75 text-xs uppercase tracking-wider hover:text-white hover:border-white/30 transition-colors"
        >
          Log in
        </button>
        <button
          type="button"
          onClick={onSignup}
          className="px-4 py-1.5 rounded-full border border-white/15 bg-white/5 backdrop-blur-sm text-white/75 text-xs uppercase tracking-wider hover:text-white hover:border-white/30 transition-colors"
        >
          Sign up
        </button>
      </div>
    </div>
  );
};
