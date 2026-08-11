import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractGolfData } from '../services/geminiService';
import { clearCache, getCacheSize } from '../services/aiResponseCache';

/**
 * Regression tests for the OCR extraction cache-poisoning bug.
 *
 * The cache used to key on prompt-text hash alone. Because
 * `extract_golf_data`'s prompt is invariant except for the client name,
 * two uploads of DIFFERENT images for the same client used to collide on
 * the same cache key and the second upload would silently return the
 * first upload's numbers. Same story (worse: no client-name variance) for
 * `analyze_trackman_screen`, `analyze_body_photos`,
 * `analyze_equipment_photo`, `swing_phase_timestamps`.
 *
 * Fix includes the base64 media fingerprint in the cache key. These tests
 * lock that in — a re-upload of the exact same image hits the cache, and
 * a different image is a miss.
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

describe('extractGolfData — cache keyed on image content, not prompt alone', () => {
  const originalFileReader = (globalThis as { FileReader?: unknown }).FileReader;

  beforeEach(() => {
    clearCache();
    (globalThis as { FileReader?: unknown }).FileReader = StubFileReader as unknown;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearCache();
    if (originalFileReader) {
      (globalThis as { FileReader?: unknown }).FileReader = originalFileReader;
    } else {
      delete (globalThis as { FileReader?: unknown }).FileReader;
    }
  });

  const stubBackend = (payload: Record<string, unknown>) => {
    const fetchMock = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: payload }),
      }) as unknown as Response
    );
    vi.spyOn(global, 'fetch').mockImplementation(fetchMock);
    return fetchMock;
  };

  it('two different images for the same client do NOT collide in cache', async () => {
    const imageA = new File(['screen-A-carry-150'], 'a.png', { type: 'image/png' });
    const imageB = new File(['screen-B-carry-220'], 'b.png', { type: 'image/png' });

    // First call — response for image A.
    let fetchMock = stubBackend({
      text: JSON.stringify({
        isScorecard: false,
        score: null,
        metrics: { carryDistance: 150, ballSpeed: 62 },
        comment: 'A',
      }),
      model: 'gemini-2.5-flash-lite',
    });
    const first = await extractGolfData(
      { data: imageA, mimeType: 'image/png' },
      '홍길동'
    );
    expect(first.golfData).toEqual({ carryDistance: 150, ballSpeed: 62 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call — different image, same client name. Must NOT be a cache
    // hit; the backend must be called again.
    fetchMock = stubBackend({
      text: JSON.stringify({
        isScorecard: false,
        score: null,
        metrics: { carryDistance: 220, ballSpeed: 70 },
        comment: 'B',
      }),
      model: 'gemini-2.5-flash-lite',
    });
    const second = await extractGolfData(
      { data: imageB, mimeType: 'image/png' },
      '홍길동'
    );
    expect(second.golfData).toEqual({ carryDistance: 220, ballSpeed: 70 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Cache writes are fire-and-forget (`.then()` chain, not awaited by
    // `invokeBackendAI` so telemetry never adds latency). Poll briefly
    // for both writes to land — one setTimeout(0) turned out to be too
    // tight on some runs when the SubtleCrypto → setCachedResponse chain
    // spanned two microtask ticks.
    for (let i = 0; i < 20 && getCacheSize() < 2; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    // Both images should now be cached — one entry each.
    expect(getCacheSize()).toBe(2);
  });

  it('re-uploading the same image for the same client hits the cache', async () => {
    const image = new File(['identical-screen'], 'same.png', { type: 'image/png' });

    const fetchMock = stubBackend({
      text: JSON.stringify({
        isScorecard: false,
        score: null,
        metrics: { carryDistance: 180 },
        comment: 'first-run',
      }),
      model: 'gemini-2.5-flash-lite',
    });

    const first = await extractGolfData(
      { data: image, mimeType: 'image/png' },
      '홍길동'
    );
    const second = await extractGolfData(
      { data: image, mimeType: 'image/png' },
      '홍길동'
    );

    expect(first.golfData).toEqual({ carryDistance: 180 });
    expect(second.golfData).toEqual({ carryDistance: 180 });
    // Backend should be called only once — the second was served from cache.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('accepts a Trackman/Tracey multi-shot table Average-row response verbatim', async () => {
    // Reproduces the exact shape a coach uploads: 8 individual shots
    // + 평균(Average) row + ±(standard deviation) row. The prompt tells
    // the model to read the 평균 row and ignore the ± row entirely; this
    // test locks in that our parsing accepts that response cleanly.
    const image = new File(['trackman-8-shots-avg'], 'trackman.png', {
      type: 'image/png',
    });

    stubBackend({
      text: JSON.stringify({
        isScorecard: false,
        score: null,
        metrics: {
          clubHeadSpeed: 82.5,
          clubPath: -5.9,
          dynamicLoft: 18.5,
          carryDistance: 148.8,
          totalDistance: 161.7,
          ballSpeed: 115.0,
          spinRate: 5001,
        },
        comment: '6번 아이언 8샷 평균 요약',
      }),
      model: 'gemini-2.5-flash-lite',
    });

    const result = await extractGolfData(
      { data: image, mimeType: 'image/png' },
      'Player 5'
    );

    expect(result.golfData).toEqual({
      clubHeadSpeed: 82.5,
      clubPath: -5.9,
      dynamicLoft: 18.5,
      carryDistance: 148.8,
      totalDistance: 161.7,
      ballSpeed: 115.0,
      spinRate: 5001,
    });
    // 부호(-) 유지 확인 — 클럽 패스가 인-투-아웃 음수인 케이스.
    expect(result.golfData?.clubPath).toBe(-5.9);
    // score 는 시뮬레이터 케이스이므로 undefined 여야 함.
    expect(result.score).toBeUndefined();
  });

  it('parses a shots[] array into a shotSession with samples + max/min/std', async () => {
    const image = new File(['multi-shot'], 'multi.png', { type: 'image/png' });

    stubBackend({
      text: JSON.stringify({
        isScorecard: false,
        score: null,
        metrics: {
          clubHeadSpeed: 82.5,
          carryDistance: 148.8,
          totalDistance: 161.7,
          ballSpeed: 115.0,
          spinRate: 5001,
        },
        shots: [
          { index: 1, clubHeadSpeed: 79.5, carryDistance: 145.7, totalDistance: 165.4, ballSpeed: 112.9, spinRate: 4370 },
          { index: 2, clubHeadSpeed: 80.2, carryDistance: 154.0, totalDistance: 168.7, ballSpeed: 117.5, spinRate: 4700 },
          // Hidden shot — only index, no metrics. Must be dropped.
          { index: 3 },
        ],
        shotCount: 8,
        comment: '8샷 세션',
      }),
      model: 'gemini-2.5-flash-lite',
    });

    const result = await extractGolfData(
      { data: image, mimeType: 'image/png' },
      'Player 5',
      { club: '6 Iron' }
    );

    expect(result.shotSession).toBeDefined();
    const session = result.shotSession!;
    // Hidden shot #3 was dropped; only 2 real samples remain.
    expect(session.samples.length).toBe(2);
    // shotCount came from the image (8), not samples.length (2).
    expect(session.count).toBe(8);
    // Image-reported average wins.
    expect(session.aggregate.average?.carryDistance).toBe(148.8);
    // Max/min derived from samples.
    expect(session.aggregate.max?.carryDistance).toBe(154);
    expect(session.aggregate.min?.carryDistance).toBe(145.7);
    expect(session.aggregateSource).toBe('mixed');
    expect(session.club).toBe('6 Iron');
  });

  it('omits shotSession for a single-shot summary screen (no shots[] returned)', async () => {
    const image = new File(['single-shot'], 'single.png', { type: 'image/png' });

    stubBackend({
      text: JSON.stringify({
        isScorecard: false,
        score: null,
        metrics: { carryDistance: 180 },
        // shots omitted entirely — screen only had one summary block.
        comment: '단일 샷 요약',
      }),
      model: 'gemini-2.5-flash-lite',
    });

    const result = await extractGolfData(
      { data: image, mimeType: 'image/png' },
      'Player 5'
    );
    expect(result.golfData).toEqual({ carryDistance: 180 });
    expect(result.shotSession).toBeUndefined();
  });

  it('strips null metric values that flash-lite emits per schema property', async () => {
    const image = new File(['strip-nulls'], 'nulls.png', { type: 'image/png' });

    stubBackend({
      text: JSON.stringify({
        isScorecard: false,
        score: null,
        // flash-lite fills every schema property, using null for the ones
        // it couldn't read. Those must not land in Lesson.golfData.
        metrics: {
          carryDistance: 180,
          totalDistance: null,
          ballSpeed: 62,
          clubHeadSpeed: null,
          launchAngle: null,
          spinRate: null,
        },
        comment: 'partial read',
      }),
      model: 'gemini-2.5-flash-lite',
    });

    const result = await extractGolfData(
      { data: image, mimeType: 'image/png' },
      '홍길동'
    );

    expect(result.golfData).toEqual({ carryDistance: 180, ballSpeed: 62 });
    // score:null must not surface as `null` on the return shape.
    expect(result.score).toBeUndefined();
  });
});
