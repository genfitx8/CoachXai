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

  it('returns the compiled-in fallback for features not in FEATURE_MODEL_OVERRIDES', () => {
    expect(resolveModel('coachx_chat')).toBe('gemini-2.5-flash');
    expect(resolveModel('shot_analysis')).toBe('gemini-2.5-flash');
    expect(resolveModel('motion_capture_analysis')).toBe('gemini-2.5-flash');
  });

  it('routes OCR / extraction features to flash-lite (cost tier)', () => {
    // These mappings were activated 2026-08-09 based on eval baseline.
    // Regression-guard: if the map changes, this test should force a
    // conscious decision instead of a silent switch.
    expect(resolveModel('extract_golf_data')).toBe('gemini-2.5-flash-lite');
    expect(resolveModel('analyze_trackman_screen')).toBe('gemini-2.5-flash-lite');
    expect(resolveModel('analyze_body_photos')).toBe('gemini-2.5-flash-lite');
    expect(resolveModel('analyze_equipment_photo')).toBe('gemini-2.5-flash-lite');
    expect(resolveModel('swing_phase_timestamps')).toBe('gemini-2.5-flash-lite');
    expect(resolveModel('hole_voice_summary')).toBe('gemini-2.5-flash-lite');
  });

  it('routes lesson summarization features to the pro tier (quality over cost)', () => {
    // Activated 2026-08-19: 레슨 요약은 유료 코치 기능이라 품질 우선.
    // Regression-guard — downgrading these is a product decision, not a tweak.
    expect(resolveModel('lesson_summary')).toBe('gemini-3.1-pro-preview');
    expect(resolveModel('lesson_summary_merge')).toBe('gemini-3.1-pro-preview');
    expect(resolveModel('lesson_live_summary')).toBe('gemini-3.1-pro-preview');
  });

  it('routes live transcription to the latest GA flash, not pro', () => {
    // ~300 calls per lesson on the realtime note path — pro-tier latency
    // and preview rate limits would break the live-notes UX.
    expect(resolveModel('lesson_audio_transcribe')).toBe('gemini-3.6-flash');
  });

  it('respects GEMINI_MODEL env for the default', () => {
    process.env[DEFAULT_MODEL_ENV] = 'gemini-2.5-pro';
    expect(resolveModel('coachx_chat')).toBe('gemini-2.5-pro');
    expect(getDefaultModel()).toBe('gemini-2.5-pro');
  });

  it('env override wins over both the static map and the default', () => {
    // extract_golf_data is in FEATURE_MODEL_OVERRIDES → flash-lite by
    // default. Env override should upgrade it to whatever we set here.
    process.env[OVERRIDES_ENV] = JSON.stringify({
      extract_golf_data: 'gemini-3.5-flash',
    });
    __resetModelRouterCacheForTests();
    expect(resolveModel('extract_golf_data')).toBe('gemini-3.5-flash');
    // Features not touched by env override keep their static-map value.
    expect(resolveModel('analyze_body_photos')).toBe('gemini-2.5-flash-lite');
    // Features not in either still use the default.
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
