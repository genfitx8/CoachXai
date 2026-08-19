import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useLiveTranscription — 레슨 동반의 실시간 받아쓰기 채널.
 *
 * 온디바이스 음성 인식(Web Speech API)을 연속 모드로 돌려, 코치가 말하는
 * 즉시 잠정 텍스트(interim)를 화면에 흘리고 확정된 발화는 `onFinal` 로
 * 넘긴다. 컴패니언은 확정 발화를 세션의 필기 노트(addSpeechNote)로 넣어
 * 요약·최종 리포트·복구가 전부 같은 재료를 쓰게 한다.
 *
 * 설계 메모:
 *  - 브라우저 인식기는 침묵·내부 타임아웃으로 수시로 `onend` 를 낸다.
 *    active 플래그가 서 있는 동안은 조용히 재시작해 끊김 없이 이어간다.
 *  - 연속으로 (결과 없이) 죽으면 재시작을 포기하고 `degraded` 를 세운다
 *    — 컴패니언은 이때 10초 청크 AI 전사 폴백으로 전환한다.
 *  - MediaRecorder(레슨 오디오 아카이브)와 마이크를 공유한다. Chrome/
 *    Android 에서는 동시 동작이 허용되고, 거부되는 기기는 위의 degraded
 *    경로로 자연 폴백된다.
 */

interface UseLiveTranscriptionOptions {
  lang?: string;
  /** 확정된 발화 한 줄. 호출 시점의 최신 클로저가 쓰이도록 ref 로 보관. */
  onFinal: (text: string) => void;
}

interface UseLiveTranscriptionResult {
  /** 이 브라우저에서 Web Speech API 를 쓸 수 있는가. */
  supported: boolean;
  /** 인식 세션이 살아 있는가 (start~stop/pause 사이). */
  active: boolean;
  /** 말하는 도중의 잠정 텍스트 — 확정되면 onFinal 로 나간다. */
  interim: string;
  /** 연속 실패로 재시작을 포기했는가 — AI 전사 폴백 신호. */
  degraded: boolean;
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any;

const getRecognitionCtor = (): (new () => SR) | undefined => {
  if (typeof window === 'undefined') return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

/** 이 횟수만큼 연속으로 (결과 없이) 죽으면 재시작을 포기한다. */
const MAX_CONSECUTIVE_FAILURES = 4;

export function useLiveTranscription({
  lang = 'ko-KR',
  onFinal,
}: UseLiveTranscriptionOptions): UseLiveTranscriptionResult {
  const [supported] = useState(() => Boolean(getRecognitionCtor()));
  const [active, setActive] = useState(false);
  const [interim, setInterim] = useState('');
  const [degraded, setDegraded] = useState(false);

  const recognitionRef = useRef<SR | null>(null);
  const activeRef = useRef(false);
  const failStreakRef = useRef(0);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const spawn = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || !activeRef.current) return;

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      failStreakRef.current = 0;
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text: string = result[0]?.transcript ?? '';
        if (!text.trim()) continue;
        if (result.isFinal) onFinalRef.current(text.trim());
        else interimText += text;
      }
      setInterim(interimText.trim());
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      // 'no-speech'/'aborted' 는 정상 루프의 일부. 권한/서비스 거부는
      // 재시작해도 소용없으니 즉시 포기한다.
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        failStreakRef.current = MAX_CONSECUTIVE_FAILURES;
      } else if (e?.error !== 'no-speech' && e?.error !== 'aborted') {
        failStreakRef.current += 1;
      }
    };

    rec.onend = () => {
      setInterim('');
      if (!activeRef.current) return;
      if (failStreakRef.current >= MAX_CONSECUTIVE_FAILURES) {
        setDegraded(true);
        setActive(false);
        activeRef.current = false;
        return;
      }
      // 침묵/타임아웃으로 끊긴 것 — 조용히 이어붙인다.
      try {
        spawn();
      } catch {
        setDegraded(true);
        setActive(false);
        activeRef.current = false;
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      failStreakRef.current += 1;
    }
  }, [lang]);

  const start = useCallback(() => {
    if (!supported || activeRef.current) return;
    activeRef.current = true;
    failStreakRef.current = 0;
    setInterim('');
    setDegraded(false);
    setActive(true);
    spawn();
  }, [supported, spawn]);

  const halt = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    setInterim('');
    try {
      recognitionRef.current?.stop();
    } catch {
      // best-effort
    }
    recognitionRef.current = null;
  }, []);

  const resume = useCallback(() => {
    if (!supported || activeRef.current || degraded) return;
    activeRef.current = true;
    failStreakRef.current = 0;
    setActive(true);
    spawn();
  }, [supported, degraded, spawn]);

  useEffect(
    () => () => {
      activeRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch {
        // unmount teardown
      }
    },
    []
  );

  return {
    supported,
    active,
    interim,
    degraded,
    start,
    stop: halt,
    pause: halt,
    resume,
  };
}
