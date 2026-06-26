import { useState, useRef, useEffect, useCallback } from 'react';

export function useTextToSpeech(language: string, enabled = true) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const enabledRef = useRef(enabled);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { synthRef.current = window.speechSynthesis ?? null; }, []);
  useEffect(() => () => { synthRef.current?.cancel(); }, []);

  const speak = useCallback((text: string) => {
    if (!synthRef.current || !enabledRef.current) return;
    synthRef.current.cancel();
    const plain = text.replace(/\*\*/g, '').replace(/\n/g, ' ');
    const utter = new SpeechSynthesisUtterance(plain);
    utter.lang = language === 'en' ? 'en-US' : language === 'ja' ? 'ja-JP' : 'ko-KR';
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.onstart = () => setIsSpeaking(true);
    utter.onend = () => setIsSpeaking(false);
    utter.onerror = () => setIsSpeaking(false);
    synthRef.current.speak(utter);
  }, [language]);

  const stopSpeaking = useCallback(() => {
    synthRef.current?.cancel();
    setIsSpeaking(false);
  }, []);

  return { isSpeaking, speak, stopSpeaking, synthRef };
}
