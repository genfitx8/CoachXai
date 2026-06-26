import { useState, useRef, useCallback, useEffect } from 'react';

const TICK_MS = 20;

export function useTypingReveal(durationMs = 2000) {
  const [revealedChars, setRevealedChars] = useState<number | null>(null);
  const revealIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearReveal = useCallback(() => {
    if (revealIntervalRef.current !== null) {
      clearInterval(revealIntervalRef.current);
      revealIntervalRef.current = null;
    }
    setRevealedChars(null);
  }, []);

  const startReveal = useCallback((text: string) => {
    const totalChars = text.length;
    const totalTicks = Math.ceil(durationMs / TICK_MS);
    const charsPerTick = Math.max(1, Math.ceil(totalChars / totalTicks));
    setRevealedChars(0);
    revealIntervalRef.current = setInterval(() => {
      setRevealedChars(prev => {
        if (prev === null) return null;
        const next = prev + charsPerTick;
        if (next >= totalChars) {
          if (revealIntervalRef.current !== null) {
            clearInterval(revealIntervalRef.current);
            revealIntervalRef.current = null;
          }
          return null;
        }
        return next;
      });
    }, TICK_MS);
  }, [durationMs]);

  useEffect(() => () => { clearReveal(); }, [clearReveal]);

  return { revealedChars, startReveal, clearReveal };
}
