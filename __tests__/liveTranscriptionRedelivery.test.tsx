/**
 * useLiveTranscription (웹 엔진) — "대화하지 않은 내용이 필기에 들어온다"
 * 회귀 방지.
 *
 * 실제 증상(모바일 브라우저): 코치가 하지 않은 말이 받아쓰기에 나타난다.
 * 원인은 두 갈래였다.
 *  1. continuous 인식의 `results` 는 세션 내내 누적되는데, 모바일
 *     브라우저가 이미 확정된 결과까지 되짚는 resultIndex 로 이벤트를 다시
 *     흘려 아까 한 말이 또 확정됐다.
 *  2. stop/pause 뒤에 도착한 결과 이벤트를 그대로 받아 적어, 멈춘 동안의
 *     말이 필기에 남았다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

import { useLiveTranscription } from '../hooks/useLiveTranscription';

/** true 면 인식기의 start() 가 던진다 — 마이크 경합·busy 상태 흉내. */
let throwOnStart = false;

/** Web Speech API 흉내 — 결과 목록을 테스트가 직접 밀어 넣는다. */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  started = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onresult: ((e: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onerror: ((e: any) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    if (throwOnStart) throw new Error('InvalidStateError');
    this.started = true;
  }
  stop() {
    this.started = false;
  }
  /** 브라우저처럼 세션이 끝났음을 알린다. */
  end() {
    this.started = false;
    this.onend?.();
  }
  /** 브라우저처럼 누적 results 목록과 시작 인덱스를 함께 보낸다. */
  emit(results: { text: string; isFinal: boolean }[], resultIndex: number) {
    this.onresult?.({
      resultIndex,
      results: results.map((r) => ({
        0: { transcript: r.text },
        isFinal: r.isFinal,
      })),
    });
  }
}

describe('useLiveTranscription — 웹 엔진 결과 재전달', () => {
  beforeEach(() => {
    FakeRecognition.instances = [];
    throwOnStart = false;
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * 새로 뜨는 인스턴스마다 결과 없이 곧바로 끝내기를 반복한다 — 엔진이
   * 마이크를 잡지 못하고 헛도는 상태. 재시작 간격이 실패마다 벌어지므로
   * 시간은 잘게 흘린다.
   */
  const killDeadInstances = async () => {
    for (let i = 0; i < 30; i++) {
      const rec = FakeRecognition.instances.at(-1);
      if (rec?.started) act(() => rec.end());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
    }
  };

  const setup = async () => {
    const finals: string[] = [];
    const hook = renderHook(() =>
      useLiveTranscription({ onFinal: (t) => finals.push(t) })
    );
    await act(async () => {
      await hook.result.current.start();
    });
    const rec = FakeRecognition.instances[0];
    expect(rec).toBeTruthy();
    return { finals, hook, rec };
  };

  it('이미 확정한 결과를 다시 보내도 한 번만 받아 적는다', async () => {
    const { finals, rec } = await setup();

    act(() => {
      rec.emit([{ text: '어깨를 조금만 더 돌려보세요', isFinal: true }], 0);
    });
    // 같은 확정 결과 + 새 확정 결과를, 인덱스를 0 으로 되짚어 다시 보낸다.
    act(() => {
      rec.emit(
        [
          { text: '어깨를 조금만 더 돌려보세요', isFinal: true },
          { text: '체중은 왼발에 두시고요', isFinal: true },
        ],
        0
      );
    });

    expect(finals).toEqual([
      '어깨를 조금만 더 돌려보세요',
      '체중은 왼발에 두시고요',
    ]);
  });

  it('잠정 결과는 확정으로 새지 않는다', async () => {
    const { finals, hook, rec } = await setup();

    act(() => {
      rec.emit([{ text: '체중은', isFinal: false }], 0);
    });
    expect(finals).toEqual([]);
    expect(hook.result.current.interim).toBe('체중은');
  });

  it('같은 자리라도 문장이 다르면 새 필기로 받아 적는다', async () => {
    const { finals, rec } = await setup();

    // 확정 자리를 재사용하는 엔진이 있다 — 자리만 보고 자르면 필기가 빠진다.
    act(() => {
      rec.emit([{ text: '어깨를 조금만 더 돌려보세요', isFinal: true }], 0);
    });
    act(() => {
      rec.emit([{ text: '체중은 왼발에 두시고요', isFinal: true }], 0);
    });

    expect(finals).toEqual([
      '어깨를 조금만 더 돌려보세요',
      '체중은 왼발에 두시고요',
    ]);
  });

  it('start 가 던져도 조용히 멈추지 않고 다시 잡는다', async () => {
    vi.useFakeTimers();
    try {
      const finals: string[] = [];
      const hook = renderHook(() =>
        useLiveTranscription({ onFinal: (t) => finals.push(t) })
      );
      throwOnStart = true;
      await act(async () => {
        await hook.result.current.start();
      });
      expect(FakeRecognition.instances).toHaveLength(1);

      // 마이크가 풀리면 다음 시도는 성공한다.
      throwOnStart = false;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(FakeRecognition.instances.length).toBeGreaterThan(1);
      expect(FakeRecognition.instances.at(-1)?.started).toBe(true);
      expect(hook.result.current.degraded).toBe(false);
    } finally {
      throwOnStart = false;
      vi.useRealTimers();
    }
  });

  it('결과 없이 곧바로 끝나는 인스턴스가 반복되면 AI 폴백으로 넘긴다', async () => {
    vi.useFakeTimers();
    try {
      const hook = renderHook(() =>
        useLiveTranscription({ onFinal: () => {} })
      );
      await act(async () => {
        await hook.result.current.start();
      });

      // 엔진이 듣지 못한 채 즉시 끝나기를 반복 — 예전에는 재시작만 돌며
      // 화면에는 '실시간 인식'이 켜진 채 필기가 조용히 멈췄다.
      await killDeadInstances();

      expect(hook.result.current.degraded).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('포기한 뒤에도 새 레슨의 start 는 다시 시도한다', async () => {
    vi.useFakeTimers();
    try {
      const hook = renderHook(() =>
        useLiveTranscription({ onFinal: () => {} })
      );
      await act(async () => {
        await hook.result.current.start();
      });
      await killDeadInstances();
      expect(hook.result.current.degraded).toBe(true);

      const before = FakeRecognition.instances.length;
      let started = false;
      await act(async () => {
        started = await hook.result.current.start();
      });
      expect(started).toBe(true);
      expect(hook.result.current.degraded).toBe(false);
      expect(FakeRecognition.instances.length).toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('멈춘 뒤 도착한 결과는 받아 적지 않는다', async () => {
    const { finals, hook, rec } = await setup();

    act(() => {
      hook.result.current.pause();
    });
    // 브라우저는 stop() 뒤에도 대기 중이던 결과를 한 번 더 흘린다.
    act(() => {
      rec.emit([{ text: '다음 손님 몇 시에 오세요', isFinal: true }], 0);
    });

    expect(finals).toEqual([]);
  });
});
