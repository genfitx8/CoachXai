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
    // `invokeBackendAI` so telemetry never adds latency). Flush pending
    // microtasks before asserting cache state.
    await new Promise((resolve) => setTimeout(resolve, 0));
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
