import React, { useEffect, useMemo, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const isStandaloneMode = () => {
  if (typeof window === 'undefined') return false;
  return (
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
    (typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
};

const isiOSSafariInstallable = () => {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isSafari = ua.includes('safari') && !ua.includes('crios') && !ua.includes('fxios');
  return isIOS && isSafari && !isStandaloneMode();
};

export const AppInstallEntry: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  const canShowIOSFlow = useMemo(() => isiOSSafariInstallable(), []);

  useEffect(() => {
    setIsInstalled(isStandaloneMode());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowIosHint(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
      return;
    }

    if (canShowIOSFlow) {
      setShowIosHint((current) => !current);
    }
  };

  if (!deferredPrompt && !canShowIOSFlow) {
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleInstallClick}
        className="px-4 py-1.5 rounded-full border border-cyan-300/30 bg-cyan-400/10 text-cyan-100 text-[11px] uppercase tracking-[0.18em] hover:bg-cyan-300/15 transition-colors"
      >
        Install App
      </button>
      {showIosHint && (
        <p className="text-[11px] text-slate-400 text-center">
          On iPhone/iPad Safari, use Share → Add to Home Screen.
        </p>
      )}
    </div>
  );
};
