import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useLiveTranscription — 장시간 레슨용 실시간 음성 필기 훅.
 *
 * 기존 `useSpeechRecognition` 은 검색창 스타일의 단발 입력용이다
 * (continuous=false, interim 없음). 레슨 동반 화면의 "실시간 필기"는
 * 30–50분 내내 돌아야 하므로 요구가 다르다:
 *
 *  - continuous + interimResults: 말하는 도중의 잠정 텍스트까지 화면에
 *    흘려보낸다.
 *  - 자동 재시작: 브라우저 음성 인식은 침묵·내부 타임아웃으로 수시로
 *    `onend` 를 낸다. active 플래그가 서 있는 동안은 조용히 재시작해
 *    끊김 없는 필기처럼 보이게 한다.
 *  - 미지원/실패 감내: Web Speech API 가 없는 WebView(일부 iOS 버전,
 *    임베디드 브라우저)에서는 `supported=false` 로 빠지고, 호출부는
 *    세그먼트 AI 전사(약간 지연)로 폴백한다. 온디바이스 인식은 화면
 *    표시용 보조 채널일 뿐 — 저장·요약의 원본은 항상 lessonAudioPipeline
 *    의 세그먼트 분석이다.
 *
 * MediaRecorder 와 마이크를 공유하는 문제: SpeechRecognition 은 자체
 * 캡처를 쓰지만 Chrome/Android 에서는 getUserMedia 녹음과 동시 동작이
 * 허용된다. 동시 사용이 거부되는 기기에서는 onerror 로 떨어지고, 몇 번
 * 연속 실패하면 재시작을 포기해 배터리를 태우지 않는다.
 */

export interface LiveTranscriptLine {
  id: number;
  /** 필기 시작 기준 오프셋(초). */
  atSec: number;
  text: string;
}

interface UseLiveTranscriptionResult {
  /** 이 브라우저에서 Web Speech API 를 쓸 수 있는가. */
  supported: boolean;
  /** 현재 인식 세션이 살아 있는가 (start~stop 사이). */
  active: boolean;
  /** 확정된 필기 라인 (오래된 것부터). */
  lines: LiveTranscriptLine[];
  /** 말하는 도중의 잠정 텍스트 — 확정되면 lines 로 넘어간다. */
  interim: string;
  start: () => void;
  stop: () => void;
  /** 레코딩 일시정지에 맞춰 인식만 멈춘다 — 확정 라인은 유지된다. */
  pause: () => void;
  resume: () => void;
  /** 연속 오류로 재시작을 포기했는가 — UI가 폴백 안내를 띄울 때 사용. */
  degraded: boolean;
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
/** 유지할 최대 확정 라인 수 — 50분 레슨에서도 메모리·렌더를 일정하게. */
const MAX_LINES = 200;

export function useLiveTranscription(lang = 'ko-KR'): UseLiveTranscriptionResult {
  const [supported] = useState(() => Boolean(getRecognitionCtor()));
  const [active, setActive] = useState(false);
  const [lines, setLines] = useState<LiveTranscriptLine[]>([]);
  const [interim, setInterim] = useState('');
  const [degraded, setDegraded] = useState(false);

  const recognitionRef = useRef<SR | null>(null);
  const activeRef = useRef(false);
  const startedAtRef = useRef(0);
  const nextIdRef = useRef(0);
  const failStreakRef = useRef(0);

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
      const finals: string[] = [];
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text: string = result[0]?.transcript ?? '';
        if (!text.trim()) continue;
        if (result.isFinal) finals.push(text.trim());
        else interimText += text;
      }
      if (finals.length > 0) {
        const atSec = Math.round((Date.now() - startedAtRef.current) / 1000);
        setLines((prev) => {
          const appended = [
            ...prev,
            ...finals.map((text) => ({ id: nextIdRef.current++, atSec, text })),
          ];
          return appended.length > MAX_LINES
            ? appended.slice(appended.length - MAX_LINES)
            : appended;
        });
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
      // 브라우저가 침묵/타임아웃으로 끊은 것 — 조용히 이어붙인다.
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
      // 드물게 이전 인스턴스 정리 전에 start 가 던진다 — 다음 onend 루프가 수습.
      failStreakRef.current += 1;
    }
  }, [lang]);

  const start = useCallback(() => {
    if (!supported || activeRef.current) return;
    activeRef.current = true;
    failStreakRef.current = 0;
    startedAtRef.current = Date.now();
    nextIdRef.current = 0;
    setLines([]);
    setInterim('');
    setDegraded(false);
    setActive(true);
    spawn();
  }, [supported, spawn]);

  const stop = useCallback(() => {
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

  // 일시정지: stop 과 같지만 라인/카운터를 보존하고, resume 이 이어서 켠다.
  const pause = useCallback(() => {
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

  useEffect(() => () => {
    activeRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      // unmount teardown
    }
  }, []);

  return { supported, active, lines, interim, start, stop, pause, resume, degraded };
}
