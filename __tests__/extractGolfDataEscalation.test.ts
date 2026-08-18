import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeTrackmanScreen, extractGolfData } from '../services/geminiService';
import {
  clearCache,
  getCachedResponse,
  getCacheSize,
  isCacheableResponse,
} from '../services/aiResponseCache';

/**
 * Regression tests for the "basic launch-monitor screenshot extracts
 * nothing" bug.
 *
 * `extract_golf_data` / `analyze_trackman_screen` route to
 * gemini-2.5-flash-lite, which sometimes satisfies the response schema with
 * every field null instead of reading the screen. Two compounding failures:
 *
 *  1. The empty read was returned to the user as "no data in this photo".
 *     Fix: escalate once to the baseline model (gemini-2.5-flash) via the
 *     per-request `model` override before giving up.
 *  2. The empty response was cached for 24h keyed on the image, so every
 *     retry of the same photo silently replayed the failure. Fix: empty
 *     extraction responses are never cached, and stale poisoned entries are
 *     evicted at read time.
 */

// FileReader used by fileToGenerativePart — stub it to deterministically
// map "file contents" → its base64 form without touching the DOM impl.
class StubFileReader {
  public onloadend: (() => void) | null = null;
  public result: string | ArrayBuffer | null = null;
  readAsDataURL(blob: Blob) {
    void (async () => {
      const text = await blob.text();
      this.result = `data:${blob.type};base64,${Buffer.from(text).toString('base64')}`;
      this.onloadend?.();
    })();
  }
}

const emptyExtractionText = JSON.stringify({
  isScorecard: false,
  score: null,
  metrics: {
    carryDistance: null,
    totalDistance: null,
    ballSpeed: null,
    clubHeadSpeed: null,
    spinRate: null,
  },
  comment: '데이터를 찾지 못했습니다.',
});

const goodExtractionText = JSON.stringify({
  isScorecard: false,
  score: null,
  metrics: {
    carryDistance: 255.8,
    totalDistance: 277.2,
    ballSpeed: 159.4,
    clubHeadSpeed: 107.7,
    smashFactor: 1.48,
    attackAngle: 0.9,
    spinRate: 2957,
    clubPath: 3.5,
    dynamicLoft: 12.5,
    spinLoft: 11.6,
    faceAngle: 2.8,
    sideTotal: 3.4,
  },
  comment: '트랙맨 데이터입니다.',
});

/** Extract {feature, payload} from a fetch mock invocation. */
const requestBodyOf = (call: unknown[]): { feature: string; payload: Record<string, unknown> } =>
  JSON.parse((call[1] as RequestInit).body as string);

describe('OCR extraction escalation + empty-response cache guard', () => {
  const originalFileReader = (globalThis as { FileReader?: unknown }).FileReader;

  // Cache writes are fire-and-forget (`.then()` chain) — flush them before
  // clearing so a pending write from the previous test can't land after the
  // next test's clearCache() and pollute its cache-size assertions.
  const flushPendingWrites = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(async () => {
    await flushPendingWrites();
    clearCache();
    (globalThis as { FileReader?: unknown }).FileReader = StubFileReader as unknown;
  });

  afterEach(async () => {
    await flushPendingWrites();
    vi.restoreAllMocks();
    clearCache();
    if (originalFileReader) {
      (globalThis as { FileReader?: unknown }).FileReader = originalFileReader;
    } else {
      delete (globalThis as { FileReader?: unknown }).FileReader;
    }
  });

  const stubBackendSequence = (texts: string[], models: string[]) => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      const idx = Math.min(call, texts.length - 1);
      call += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: { text: texts[idx], model: models[idx] ?? 'gemini-2.5-flash-lite' },
        }),
      } as unknown as Response;
    });
    vi.spyOn(global, 'fetch').mockImplementation(fetchMock);
    return fetchMock;
  };

  it('retries on the baseline model when flash-lite reads nothing', async () => {
    const image = new File(['trackman-numeric-tiles'], 'tm.png', { type: 'image/png' });
    const fetchMock = stubBackendSequence(
      [emptyExtractionText, goodExtractionText],
      ['gemini-2.5-flash-lite', 'gemini-2.5-flash']
    );

    const result = await extractGolfData({ data: image, mimeType: 'image/png' }, '홍길동');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // First pass carries no explicit model (router default applies)…
    expect(requestBodyOf(fetchMock.mock.calls[0]).payload.model).toBeUndefined();
    // …second pass escalates explicitly.
    expect(requestBodyOf(fetchMock.mock.calls[1]).payload.model).toBe('gemini-2.5-flash');
    expect(result.golfData).toMatchObject({
      carryDistance: 255.8,
      totalDistance: 277.2,
      ballSpeed: 159.4,
      clubHeadSpeed: 107.7,
      attackAngle: 0.9,
      spinRate: 2957,
    });
  });

  it('does not escalate when the first pass reads metrics', async () => {
    const image = new File(['good-first-pass'], 'ok.png', { type: 'image/png' });
    const fetchMock = stubBackendSequence([goodExtractionText], ['gemini-2.5-flash-lite']);

    const result = await extractGolfData({ data: image, mimeType: 'image/png' }, '홍길동');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.golfData).not.toBeNull();
  });

  it('a scorecard score counts as a successful read — no escalation', async () => {
    const image = new File(['scorecard'], 'score.png', { type: 'image/png' });
    const fetchMock = stubBackendSequence(
      [
        JSON.stringify({
          isScorecard: true,
          score: 85,
          metrics: null,
          comment: '홍길동님의 기록은 85타입니다.',
        }),
      ],
      ['gemini-2.5-flash-lite']
    );

    const result = await extractGolfData({ data: image, mimeType: 'image/png' }, '홍길동');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.score).toBe(85);
  });

  it('never caches an empty extraction; caches the escalated good read', async () => {
    const image = new File(['cache-guard'], 'cg.png', { type: 'image/png' });
    const fetchMock = stubBackendSequence(
      [emptyExtractionText, goodExtractionText],
      ['gemini-2.5-flash-lite', 'gemini-2.5-flash']
    );

    await extractGolfData({ data: image, mimeType: 'image/png' }, '홍길동');
    // Cache writes are fire-and-forget — flush microtasks before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Only the good (escalated) response may be cached.
    expect(getCacheSize()).toBe(1);

    // Re-upload of the same image is now served from the good cache entry —
    // no further backend calls.
    const again = await extractGolfData({ data: image, mimeType: 'image/png' }, '홍길동');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(again.golfData).toMatchObject({ carryDistance: 255.8 });
  });

  it('returns "no data" only after both passes come back empty', async () => {
    const image = new File(['truly-empty'], 'e.png', { type: 'image/png' });
    const fetchMock = stubBackendSequence(
      [emptyExtractionText, emptyExtractionText],
      ['gemini-2.5-flash-lite', 'gemini-2.5-flash']
    );

    const result = await extractGolfData({ data: image, mimeType: 'image/png' }, '홍길동');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.golfData).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getCacheSize()).toBe(0);
  });

  it('escalates when the first pass throws (e.g. backend 500)', async () => {
    const image = new File(['first-pass-error'], 'err.png', { type: 'image/png' });
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ ok: false, error: 'boom' }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: { text: goodExtractionText, model: 'gemini-2.5-flash' },
        }),
      } as unknown as Response;
    });
    vi.spyOn(global, 'fetch').mockImplementation(fetchMock);

    const result = await extractGolfData({ data: image, mimeType: 'image/png' }, '홍길동');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBodyOf(fetchMock.mock.calls[1]).payload.model).toBe('gemini-2.5-flash');
    expect(result.golfData).not.toBeNull();
  });

  it('analyzeTrackmanScreen escalates on an all-null first pass', async () => {
    const image = new File(['tm-screen'], 'tm2.png', { type: 'image/png' });
    const fetchMock = stubBackendSequence(
      [
        JSON.stringify({
          clubSpeed: null,
          ballSpeed: null,
          smashFactor: null,
          launchAngle: null,
          spinRate: null,
          carryDistance: null,
          totalDistance: null,
        }),
        JSON.stringify({
          clubSpeed: 107.7,
          ballSpeed: 159.4,
          smashFactor: 1.48,
          launchAngle: 10.6,
          spinRate: 2957,
          carryDistance: 255.8,
          totalDistance: 277.2,
        }),
      ],
      ['gemini-2.5-flash-lite', 'gemini-2.5-flash']
    );

    const result = await analyzeTrackmanScreen({ data: image, mimeType: 'image/png' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBodyOf(fetchMock.mock.calls[1]).payload.model).toBe('gemini-2.5-flash');
    expect(result).toEqual({
      clubSpeed: 107.7,
      ballSpeed: 159.4,
      smashFactor: 1.48,
      launchAngle: 10.6,
      spinRate: 2957,
      carryDistance: 255.8,
      totalDistance: 277.2,
    });
  });

  it('evicts a pre-existing poisoned (empty) cache entry at read time', () => {
    // Simulate an empty extraction cached before the write guard existed.
    const now = Date.now();
    localStorage.setItem(
      'coachxai_ai_response_cache_v1',
      JSON.stringify({
        version: 1,
        entries: {
          'extract_golf_data:deadbeef1234': {
            response: emptyExtractionText,
            storedAt: now,
            lastAccessAt: now,
            expiresAt: now + 60_000,
          },
        },
      })
    );

    expect(getCachedResponse('extract_golf_data', 'deadbeef1234')).toBeNull();
    expect(getCacheSize()).toBe(0);
  });

  it('isCacheableResponse validates per feature', () => {
    expect(isCacheableResponse('extract_golf_data', emptyExtractionText)).toBe(false);
    expect(isCacheableResponse('extract_golf_data', goodExtractionText)).toBe(true);
    expect(isCacheableResponse('extract_golf_data', 'not-json')).toBe(false);
    expect(
      isCacheableResponse('analyze_trackman_screen', JSON.stringify({ ballSpeed: null }))
    ).toBe(false);
    expect(
      isCacheableResponse('analyze_trackman_screen', JSON.stringify({ ballSpeed: 159.4 }))
    ).toBe(true);
    // Features without a validator are always cacheable.
    expect(isCacheableResponse('generate_system_prompt', 'free text')).toBe(true);
  });
});
