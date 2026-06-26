import { useState, useRef, useCallback, useEffect } from 'react';

interface UseSpeechRecognitionOptions {
  language: string;
  onResult: (transcript: string) => void;
}

export function useSpeechRecognition({ language, onResult }: UseSpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onResultRef = useRef(onResult);

  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    setVoiceError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SRCtor: (new () => SpeechRecognition) | undefined = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SRCtor) {
      setVoiceError(
        language === 'en' ? 'This browser does not support speech recognition.'
        : language === 'ja' ? 'このブラウザは音声認識をサポートしていません。'
        : '이 브라우저는 음성 인식을 지원하지 않습니다.'
      );
      return;
    }
    const rec = new SRCtor();
    rec.lang = language === 'en' ? 'en-US' : language === 'ja' ? 'ja-JP' : 'ko-KR';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onstart = () => setIsListening(true);
    rec.onend = () => setIsListening(false);
    rec.onerror = (e: Event) => {
      setIsListening(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errType = (e as any).error;
      if (errType === 'aborted') return;
      setVoiceError(
        errType === 'not-allowed'
          ? (language === 'en' ? 'Microphone permission denied.'
            : language === 'ja' ? 'マイクのアクセスが拒否されました。'
            : '마이크 권한이 거부되었습니다.')
          : (language === 'en' ? 'Voice recognition error. Please try again.'
            : language === 'ja' ? '音声認識エラーが発生しました。'
            : '음성 인식 중 오류가 발생했어요.')
      );
    };
    rec.onresult = (e: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transcript: string = (e as any).results?.[0]?.[0]?.transcript ?? '';
      if (transcript) onResultRef.current(transcript);
    };
    recognitionRef.current = rec;
    rec.start();
  }, [language]);

  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, stopListening, startListening]);

  return { isListening, voiceError, startListening, stopListening, toggleListening, recognitionRef };
}
