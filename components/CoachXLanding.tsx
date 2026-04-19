import React from 'react';

interface CoachXLandingProps {
  onLogin: () => void;
  onSignup: () => void;
}

export const CoachXLanding: React.FC<CoachXLandingProps> = ({
  onLogin,
  onSignup,
}) => {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center relative overflow-hidden px-6">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-1/2 w-72 h-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/20 blur-3xl animate-pulse" />
        <div
          className="absolute left-1/2 top-1/2 w-64 h-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/35 animate-pulse"
          style={{ animationDelay: '0.6s' }}
        />
        <div
          className="absolute left-1/2 top-1/2 w-56 h-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-300/30 animate-pulse"
          style={{ animationDelay: '1.2s' }}
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
          className="px-4 py-1.5 rounded-full border border-white/20 text-white/75 text-xs uppercase tracking-wider hover:text-white hover:border-white/35 transition-colors"
        >
          Log in
        </button>
        <button
          type="button"
          onClick={onSignup}
          className="px-4 py-1.5 rounded-full border border-white/20 text-white/75 text-xs uppercase tracking-wider hover:text-white hover:border-white/35 transition-colors"
        >
          Sign up
        </button>
      </div>
    </div>
  );
};
