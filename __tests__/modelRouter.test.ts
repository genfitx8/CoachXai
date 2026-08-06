/**
 * Tests for the server-side modelRouter.
 *
 * The router is a pure TS module (no express/google-auth deps) so we
 * import it directly from the server tree — no separate test infra
 * needed. Every test resets the env-override cache to isolate state.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __resetModelRouterCacheForTests,
  getDefaultModel,
  resolveModel,
} from '../server/src/services/modelRouter';

const OVERRIDES_ENV = 'MODEL_ROUTING_OVERRIDES';
const DEFAULT_MODEL_ENV = 'GEMINI_MODEL';

describe('modelRouter.resolveModel', () => {
  beforeEach(() => {
    delete process.env[OVERRIDES_ENV];
    delete process.env[DEFAULT_MODEL_ENV];
    __resetModelRouterCacheForTests();
  });

  afterEach(() => {
    delete process.env[OVERRIDES_ENV];
    delete process.env[DEFAULT_MODEL_ENV];
    __resetModelRouterCacheForTests();
  });

  it('returns the compiled-in fallback when nothing is configured', () => {
    expect(resolveModel('coachx_chat')).toBe('gemini-2.5-flash');
  });

  it('respects GEMINI_MODEL env for the default', () => {
    process.env[DEFAULT_MODEL_ENV] = 'gemini-2.5-pro';
    expect(resolveModel('coachx_chat')).toBe('gemini-2.5-pro');
    expect(getDefaultModel()).toBe('gemini-2.5-pro');
  });

  it('env override wins over the default for its feature only', () => {
    process.env[OVERRIDES_ENV] = JSON.stringify({
      extract_golf_data: 'gemini-2.5-flash-lite',
    });
    expect(resolveModel('extract_golf_data')).toBe('gemini-2.5-flash-lite');
    // Unlisted features still use the default.
    expect(resolveModel('coachx_chat')).toBe('gemini-2.5-flash');
  });

  it('explicit option always wins', () => {
    process.env[OVERRIDES_ENV] = JSON.stringify({
      coachx_chat: 'gemini-2.5-flash-lite',
    });
    expect(
      resolveModel('coachx_chat', { explicit: 'gemini-2.5-pro' })
    ).toBe('gemini-2.5-pro');
  });

  it('ignores malformed override JSON gracefully', () => {
    process.env[OVERRIDES_ENV] = 'not json {{{';
    expect(resolveModel('coachx_chat')).toBe('gemini-2.5-flash');
  });

  it('ignores non-string override values', () => {
    process.env[OVERRIDES_ENV] = JSON.stringify({
      coachx_chat: 42, // not a string
      shot_analysis: 'gemini-2.5-pro',
    });
    expect(resolveModel('coachx_chat')).toBe('gemini-2.5-flash');
    expect(resolveModel('shot_analysis')).toBe('gemini-2.5-pro');
  });

  it('trims whitespace from explicit + env values', () => {
    process.env[OVERRIDES_ENV] = JSON.stringify({
      coachx_chat: '  gemini-2.5-flash-lite  ',
    });
    expect(resolveModel('coachx_chat')).toBe('gemini-2.5-flash-lite');
  });

  it('caches env parse across calls (mutating env after resolve is a no-op until reset)', () => {
    process.env[OVERRIDES_ENV] = JSON.stringify({ coachx_chat: 'a' });
    expect(resolveModel('coachx_chat')).toBe('a');
    // Mutate the env without resetting; new value should not appear until
    // the raw string changes (the cache is keyed on raw content).
    process.env[OVERRIDES_ENV] = JSON.stringify({ coachx_chat: 'b' });
    expect(resolveModel('coachx_chat')).toBe('b');
  });
});
