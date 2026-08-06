/**
 * Tests for aiResponseCache — LRU/TTL localStorage cache with feature allowlist.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CACHEABLE_FEATURES,
  buildCacheKey,
  clearCache,
  getCacheSize,
  getCachedResponse,
  setCachedResponse,
} from '../services/aiResponseCache';

// Use one feature from the allowlist and one that isn't in it.
const CACHEABLE = 'extract_golf_data';
const NON_CACHEABLE = 'coachx_chat';

describe('aiResponseCache', () => {
  beforeEach(() => {
    clearCache();
  });

  afterEach(() => {
    clearCache();
  });

  it('CACHEABLE_FEATURES excludes chat/growth features', () => {
    expect(CACHEABLE_FEATURES.has('coachx_chat')).toBe(false);
    expect(CACHEABLE_FEATURES.has('student_chat')).toBe(false);
    expect(CACHEABLE_FEATURES.has('coachx_growth_profile')).toBe(false);
  });

  it('miss returns null when nothing stored', () => {
    expect(getCachedResponse(CACHEABLE, 'abc123')).toBeNull();
  });

  it('set + get returns the stored response', () => {
    setCachedResponse(CACHEABLE, 'abc123', 'the response');
    expect(getCachedResponse(CACHEABLE, 'abc123')).toBe('the response');
  });

  it('does not cache non-allowlisted features', () => {
    setCachedResponse(NON_CACHEABLE, 'abc123', 'nope');
    expect(getCachedResponse(NON_CACHEABLE, 'abc123')).toBeNull();
    expect(getCacheSize()).toBe(0);
  });

  it('does not cache empty response', () => {
    setCachedResponse(CACHEABLE, 'abc123', '');
    expect(getCachedResponse(CACHEABLE, 'abc123')).toBeNull();
  });

  it('respects TTL — expired entry returns null', () => {
    const now = 1_000_000;
    setCachedResponse(CACHEABLE, 'abc123', 'expires soon', {
      ttlMs: 100,
      now,
    });
    // Just after storing, hit.
    expect(getCachedResponse(CACHEABLE, 'abc123', now + 50)).toBe(
      'expires soon'
    );
    // After TTL — miss.
    expect(getCachedResponse(CACHEABLE, 'abc123', now + 200)).toBeNull();
    // Expired entry is pruned.
    expect(getCacheSize()).toBe(0);
  });

  it('key isolates feature — same hash under two features does not collide', () => {
    setCachedResponse(CACHEABLE, 'hashXYZ', 'A');
    // A second cacheable feature with the same hash.
    setCachedResponse('analyze_body_photos', 'hashXYZ', 'B');
    expect(getCachedResponse(CACHEABLE, 'hashXYZ')).toBe('A');
    expect(getCachedResponse('analyze_body_photos', 'hashXYZ')).toBe('B');
    expect(buildCacheKey(CACHEABLE, 'hashXYZ')).not.toBe(
      buildCacheKey('analyze_body_photos', 'hashXYZ')
    );
  });

  it('clearCache empties everything', () => {
    setCachedResponse(CACHEABLE, 'h1', 'x');
    setCachedResponse(CACHEABLE, 'h2', 'y');
    expect(getCacheSize()).toBe(2);
    clearCache();
    expect(getCacheSize()).toBe(0);
  });

  it('LRU eviction — bumping past MAX_ENTRIES drops the oldest', () => {
    // MAX_ENTRIES is 200. Fill past capacity and verify count returns to cap.
    const MAX = 200;
    for (let i = 0; i < MAX + 5; i++) {
      // Each key differs so no in-place overwrites.
      setCachedResponse(CACHEABLE, `h${i}`, `resp${i}`);
    }
    expect(getCacheSize()).toBe(MAX);
    // The first 5 (oldest) should be gone.
    expect(getCachedResponse(CACHEABLE, 'h0')).toBeNull();
    expect(getCachedResponse(CACHEABLE, 'h4')).toBeNull();
    // The most recent should still be there.
    expect(getCachedResponse(CACHEABLE, `h${MAX + 4}`)).toBe(
      `resp${MAX + 4}`
    );
  });
});
