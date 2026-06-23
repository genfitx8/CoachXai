import React, { useEffect, useState } from 'react';

interface CoachXLandingProps {
  onLogin: () => void;
}

type InstallChoiceOutcome = 'accepted' | 'dismissed';
type InstallChoice = { outcome: InstallChoiceOutcome; platform: string };
type DeferredInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

const GREETING_DELAY_MS = 450;
const GREETING_SPEECH_RATE = 0.92;

export const CoachXLanding: React.FC<CoachXLandingProps> = ({
  onLogin,
}) => {
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<DeferredInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installHintMessage, setInstallHintMessage] = useState('');
  const [isGreeting, setIsGreeting] = useState(false);

  const userAgent =
    typeof window === 'undefined' ? '' : window.navigator.userAgent.toLowerCase();
  const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
  const supportsInstallPrompt =
    typeof window !== 'undefined' && 'onbeforeinstallprompt' in window;

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
        utterance.onstart = () => setIsGreeting(true);
        utterance.onend = () => setIsGreeting(false);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hasMatchMedia = typeof window.matchMedia === 'function';
    const isStandaloneApp =
      (hasMatchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
      document.referrer.startsWith('android-app://');

    if (isStandaloneApp) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as DeferredInstallPromptEvent;
      installEvent.preventDefault();
      setDeferredInstallPrompt(installEvent);
      setInstallHintMessage('');
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredInstallPrompt(null);
      setInstallHintMessage('');
    };

    const mediaQuery = hasMatchMedia
      ? window.matchMedia('(display-mode: standalone)')
      : null;
    const handleDisplayModeChange = () => {
      if (mediaQuery?.matches) {
        handleAppInstalled();
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    if (mediaQuery) {
      if ('addEventListener' in mediaQuery) {
        mediaQuery.addEventListener('change', handleDisplayModeChange);
      } else {
        mediaQuery.addListener(handleDisplayModeChange);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (mediaQuery) {
        if ('removeEventListener' in mediaQuery) {
          mediaQuery.removeEventListener('change', handleDisplayModeChange);
        } else {
          mediaQuery.removeListener(handleDisplayModeChange);
        }
      }
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredInstallPrompt) {
      setInstallHintMessage(
        isIosDevice
          ? 'On iPhone/iPad, tap Share and then “Add to Home Screen”.'
          : 'Install is not available in this browser. Use the browser menu to add CoachX to your home screen.'
      );
      return;
    }

    try {
      await deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      setDeferredInstallPrompt(null);

      if (choice.outcome === 'accepted') {
        setInstallHintMessage('CoachX is being installed.');
        setIsInstalled(true);
        return;
      }

      setInstallHintMessage('Install dismissed. You can install CoachX anytime from the browser menu.');
    } catch {
      setInstallHintMessage('Install prompt could not open. Use your browser menu to add CoachX.');
    }
  };

  const shouldShowInstallButton = !isInstalled && Boolean(deferredInstallPrompt);
  const shouldShowFallbackHelp = !isInstalled && !deferredInstallPrompt && !supportsInstallPrompt;

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
        {isGreeting && (
          <div
            className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/50 animate-ping"
            style={{ animationDuration: '1.5s' }}
          />
        )}
      </div>

      <div className="relative z-10 text-center">
        <h1
          className="text-4xl md:text-5xl tracking-wide font-semibold"
          style={{
            textShadow: '0 0 40px rgba(56,189,248,0.35), 0 0 80px rgba(56,189,248,0.15)',
          }}
        >
          CoachX AI
        </h1>
        <p className="mt-4 text-white/70 text-base md:text-lg">Hello, coach.</p>
      </div>

      <div className="absolute bottom-8 left-0 right-0 z-10 flex flex-col items-center justify-center gap-4">
        {(shouldShowInstallButton || shouldShowFallbackHelp || installHintMessage) && (
          <div className="max-w-xs px-4 py-3 rounded-2xl border border-cyan-300/20 bg-slate-950/60 backdrop-blur-md shadow-xl shadow-cyan-950/20 text-center">
            <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-200/75">CoachX App</p>
            {shouldShowInstallButton ? (
              <button
                type="button"
                onClick={handleInstallClick}
                className="mt-2 w-full px-3 py-2 rounded-full border border-cyan-200/35 bg-cyan-400/10 text-cyan-100 text-xs font-semibold tracking-wide hover:bg-cyan-400/20 hover:border-cyan-200/60 transition-colors"
              >
                Install CoachX
              </button>
            ) : (
              <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                {isIosDevice
                  ? 'Install CoachX: tap Share, then choose “Add to Home Screen”.'
                  : 'Install prompt is unavailable here. Use your browser menu to add CoachX to your home screen.'}
              </p>
            )}
            {installHintMessage && (
              <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">{installHintMessage}</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onLogin}
            className="px-4 py-1.5 rounded-full border border-white/15 bg-white/5 backdrop-blur-sm text-white/75 text-xs uppercase tracking-wider hover:text-white hover:border-white/30 transition-colors"
          >
            Log in
          </button>
        </div>
      </div>
    </div>
  );
};
