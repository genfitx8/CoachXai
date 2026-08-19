import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * useLiveTranscription — 레슨 동반의 실시간 받아쓰기 채널.
 *
 * 두 엔진을 상황에 맞게 고른다:
 *
 *  1. **네이티브 엔진** (@capacitor-community/speech-recognition) — 코치
 *     앱(Capacitor WebView)에는 브라우저 Web Speech API 가 없으므로
 *     네이티브 인식기(Android SpeechRecognizer / iOS SFSpeechRecognizer)
 *     를 쓴다. partialResults 이벤트가 잠정 텍스트를 흘리고,
 *     listeningState 'stopped'(발화 종료/침묵)마다 확정 후 재시작해
 *     연속 인식처럼 동작시킨다.
 *  2. **웹 엔진** (Web Speech API) — 일반 브라우저용.
 *
 * 어느 쪽이든 실패가 누적되면 `degraded` 를 세우고 멈춘다 — 컴패니언은
 * 이 신호로 10초 청크 AI 전사 폴백(+오디오 녹음)으로 전환한다.
 *
 * 마이크 정책: 인식 엔진이 마이크를 전담한다. 모바일에서 MediaRecorder
 * 와 인식기가 마이크를 동시에 잡으면 인식이 조용히 죽는 기기가 많아
 * (이 기능이 "안 되던" 실제 원인), 컴패니언은 인식이 살아 있는 동안
 * 오디오 녹음을 아예 켜지 않는다.
 *
 * 파셜 누적 처리: 네이티브 인식기(특히 iOS)는 세션 동안 파셜이 누적
 * 성장한다. committedLen 으로 이미 확정한 접두를 잘라내 새 내용만
 * 확정한다 — 같은 문장이 두 번 적히는 것을 막는 핵심.
 */

interface UseLiveTranscriptionOptions {
  lang?: string;
  /** 확정된 발화 한 줄. 호출 시점의 최신 클로저가 쓰이도록 ref 로 보관. */
  onFinal: (text: string) => void;
}

interface UseLiveTranscriptionResult {
  /** 인식 세션이 살아 있는가 (start 성공 ~ stop/pause 사이). */
  active: boolean;
  /** 말하는 도중의 잠정 텍스트 — 확정되면 onFinal 로 나간다. */
  interim: string;
  /** 실패 누적으로 포기했는가 — AI 전사 폴백 신호. */
  degraded: boolean;
  /**
   * 인식 시작 시도. 네이티브 플러그인 → Web Speech 순으로 고르며,
   * 권한 요청까지 끝낸 뒤 실제로 시작됐는지를 돌려준다. false 면
   * 이 기기에서는 실시간 인식이 불가 — 호출부는 AI 폴백으로 가면 된다.
   */
  start: () => Promise<boolean>;
  stop: () => void;
  pause: () => void;
  resume: () => Promise<boolean>;
}

/** 이 횟수만큼 연속으로 (결과 없이) 실패하면 재시작을 포기한다. */
const MAX_CONSECUTIVE_FAILURES = 4;
/** 파셜이 이 시간 동안 변하지 않으면 한 줄로 확정한다(ms). */
const STABLE_FINALIZE_MS = 2200;
/** 네이티브 인식기 재시작 간 딜레이 — 연속 start 로 인한 busy 오류 방지. */
const NATIVE_RESTART_DELAY_MS = 250;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any;

const getWebRecognitionCtor = (): (new () => SR) | undefined => {
  if (typeof window === 'undefined') return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativePlugin = any;

/** 네이티브 플러그인 로드 + 가용성 확인. 네이티브 플랫폼이 아니면 null. */
const loadNativePlugin = async (): Promise<NativePlugin | null> => {
  try {
    if (!Capacitor?.isNativePlatform?.()) return null;
    const mod = await import('@capacitor-community/speech-recognition');
    const plugin = mod.SpeechRecognition;
    const { available } = await plugin.available();
    return available ? plugin : null;
  } catch {
    return null;
  }
};

export function useLiveTranscription({
  lang = 'ko-KR',
  onFinal,
}: UseLiveTranscriptionOptions): UseLiveTranscriptionResult {
  const [active, setActive] = useState(false);
  const [interim, setInterim] = useState('');
  const [degraded, setDegraded] = useState(false);

  const activeRef = useRef(false);
  const failStreakRef = useRef(0);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  // 세션 내 상태 (엔진 공용)
  const engineRef = useRef<'native' | 'web' | null>(null);
  const nativePluginRef = useRef<NativePlugin | null>(null);
  const webRecognitionRef = useRef<SR | null>(null);
  const partialRef = useRef('');
  const committedLenRef = useRef(0);
  const stableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markDegraded = useCallback(() => {
    setDegraded(true);
    setActive(false);
    activeRef.current = false;
    setInterim('');
  }, []);

  /** 아직 확정 안 된 파셜 꼬리를 한 줄로 확정한다. */
  const finalizePending = useCallback((resetSession: boolean) => {
    if (stableTimerRef.current) {
      clearTimeout(stableTimerRef.current);
      stableTimerRef.current = null;
    }
    const full = partialRef.current;
    const fresh = full.slice(committedLenRef.current).trim();
    if (fresh) {
      onFinalRef.current(fresh);
      committedLenRef.current = full.length;
    }
    if (resetSession) {
      partialRef.current = '';
      committedLenRef.current = 0;
    }
    setInterim('');
  }, []);

  /** 파셜 수신 공통 처리 — interim 갱신 + 안정화 타이머 재무장. */
  const onPartialText = useCallback(
    (full: string) => {
      failStreakRef.current = 0;
      partialRef.current = full;
      setInterim(full.slice(committedLenRef.current).trim());
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
      stableTimerRef.current = setTimeout(
        () => finalizePending(false),
        STABLE_FINALIZE_MS
      );
    },
    [finalizePending]
  );

  // ─── 네이티브 엔진 ─────────────────────────────────────────────────────────

  const nativeLoop = useCallback(async () => {
    const plugin = nativePluginRef.current;
    if (!plugin || !activeRef.current) return;
    try {
      // partialResults=true 면 start 는 즉시 반환하고 이벤트로 흘러온다.
      await plugin.start({
        language: lang,
        partialResults: true,
        popup: false,
        maxResults: 1,
      });
    } catch {
      failStreakRef.current += 1;
      if (failStreakRef.current >= MAX_CONSECUTIVE_FAILURES) {
        markDegraded();
        return;
      }
      // busy 등 일시 오류 — 잠시 후 재시도 (listeningState 는 안 올 수 있다)
      setTimeout(() => {
        if (activeRef.current) void nativeLoop();
      }, NATIVE_RESTART_DELAY_MS * 4);
    }
  }, [lang, markDegraded]);

  const startNative = useCallback(async (): Promise<boolean> => {
    const plugin = await loadNativePlugin();
    if (!plugin) return false;
    try {
      const perm = await plugin.requestPermissions();
      if (perm?.speechRecognition !== 'granted') return false;
    } catch {
      return false;
    }

    nativePluginRef.current = plugin;
    engineRef.current = 'native';
    try {
      await plugin.removeAllListeners();
      await plugin.addListener(
        'partialResults',
        (data: { matches?: string[] }) => {
          const text = data?.matches?.[0] ?? '';
          if (text) onPartialText(text);
        }
      );
      await plugin.addListener(
        'listeningState',
        (data: { status?: string }) => {
          if (data?.status !== 'stopped') return;
          // 한 발화 세션 종료 — 남은 파셜을 확정하고 이어서 듣는다.
          finalizePending(true);
          if (activeRef.current) {
            setTimeout(() => {
              if (activeRef.current) void nativeLoop();
            }, NATIVE_RESTART_DELAY_MS);
          }
        }
      );
    } catch {
      return false;
    }

    void nativeLoop();
    return true;
  }, [finalizePending, nativeLoop, onPartialText]);

  // ─── 웹 엔진 ───────────────────────────────────────────────────────────────

  const spawnWeb = useCallback(() => {
    const Ctor = getWebRecognitionCtor();
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
        markDegraded();
        return;
      }
      try {
        spawnWeb();
      } catch {
        markDegraded();
      }
    };

    webRecognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      failStreakRef.current += 1;
    }
  }, [lang, markDegraded]);

  // ─── 공용 컨트롤 ───────────────────────────────────────────────────────────

  const start = useCallback(async (): Promise<boolean> => {
    if (activeRef.current) return true;
    if (degraded) return false;
    activeRef.current = true;
    failStreakRef.current = 0;
    partialRef.current = '';
    committedLenRef.current = 0;
    setInterim('');

    // 네이티브 앱에서는 네이티브 인식기, 브라우저에서는 Web Speech.
    if (await startNative()) {
      setActive(true);
      return true;
    }
    if (getWebRecognitionCtor()) {
      engineRef.current = 'web';
      setActive(true);
      spawnWeb();
      return true;
    }

    activeRef.current = false;
    return false;
  }, [degraded, startNative, spawnWeb]);

  const halt = useCallback(() => {
    // 멈추기 전에 쓰다 만 문장을 버리지 않고 확정한다.
    finalizePending(true);
    activeRef.current = false;
    setActive(false);
    setInterim('');
    if (engineRef.current === 'native') {
      const plugin = nativePluginRef.current;
      try {
        void plugin?.stop();
        void plugin?.removeAllListeners();
      } catch {
        // best-effort
      }
    } else {
      try {
        webRecognitionRef.current?.stop();
      } catch {
        // best-effort
      }
      webRecognitionRef.current = null;
    }
  }, [finalizePending]);

  const resume = useCallback(async (): Promise<boolean> => {
    if (activeRef.current) return true;
    if (degraded) return false;
    return start();
  }, [degraded, start]);

  useEffect(
    () => () => {
      activeRef.current = false;
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
      try {
        void nativePluginRef.current?.stop();
        void nativePluginRef.current?.removeAllListeners();
        webRecognitionRef.current?.stop();
      } catch {
        // unmount teardown
      }
    },
    []
  );

  return { active, interim, degraded, start, stop: halt, pause: halt, resume };
}
