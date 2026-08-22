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
    this.started = true;
  }
  stop() {
    this.started = false;
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
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
