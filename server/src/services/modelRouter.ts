/**
 * modelRouter — Per-feature Gemini model selection with env-driven overrides.
 *
 * Why route
 * ---------
 * All features currently use `gemini-2.5-flash`. That's a fine baseline, but:
 *  - OCR / structured extraction (a launch-monitor screenshot, a body photo)
 *    is deterministic and cheap on a smaller model — flash-lite would work.
 *  - Long-form analytical reports (shot_analysis, motion_capture_analysis)
 *    benefit from stronger reasoning — pro is worth the cost.
 *  - Chat should stay on flash for the balanced latency/quality/cost ratio.
 *
 * This module concentrates that policy so the route handler never has to
 * think about model names. It also emits `model` on every response so
 * observability can compare per-model latency / fallback rates.
 *
 * Rollout discipline
 * ------------------
 * Default map is **empty** — every feature resolves to the environment
 * default (currently gemini-2.5-flash). Enable a route by adding a
 * feature to FEATURE_MODEL_OVERRIDES here or via the
 * `MODEL_ROUTING_OVERRIDES` env var (JSON `{feature: model}`) — nothing
 * changes until a mapping is added, so wiring is safe to land ahead of
 * any real routing.
 */

const DEFAULT_MODEL_ENV = 'GEMINI_MODEL';
const OVERRIDES_ENV = 'MODEL_ROUTING_OVERRIDES';
const FALLBACK_DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * Static feature → model map. Env-var `MODEL_ROUTING_OVERRIDES` wins over
 * this map at runtime so you can A/B without a redeploy.
 *
 * Activation record — 2026-08-09
 *   Deterministic OCR / structured-extraction features are routed to
 *   `gemini-2.5-flash-lite`. That tier is materially cheaper and faster
 *   than plain flash, and its downside (slightly weaker long-form
 *   reasoning) doesn't apply to jobs that just read numbers off a screen
 *   or classify a body shape. All other features stay on the process
 *   default (`gemini-2.5-flash`) because the eval baseline was
 *   established there; changing the router is a quality-affecting
 *   change and needs eval:real to sign off.
 *
 *   shot_analysis was tested against `gemini-3.5-flash` (newer generation)
 *   and `gemini-2.5-pro` (deprecated to new users, 404s). 3.5-flash was
 *   slower AND produced shorter output with no observable quality lift
 *   over 2.5-flash. Keeping shot_analysis on 2.5-flash — the eval baseline
 *   model — until either 3.5-flash improves or 3.1-pro-preview stabilises.
 */
const FEATURE_MODEL_OVERRIDES: Record<string, string> = {
  // OCR / structured extraction — deterministic, benefits from cheap+fast.
  extract_golf_data: 'gemini-2.5-flash-lite',
  analyze_trackman_screen: 'gemini-2.5-flash-lite',
  analyze_body_photos: 'gemini-2.5-flash-lite',
  analyze_equipment_photo: 'gemini-2.5-flash-lite',
  swing_phase_timestamps: 'gemini-2.5-flash-lite',
  hole_voice_summary: 'gemini-2.5-flash-lite',
};

interface CachedOverrides {
  raw: string;
  parsed: Record<string, string>;
}

let cachedEnvOverrides: CachedOverrides | null = null;

const parseEnvOverrides = (raw: string): Record<string, string> => {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    // Malformed override JSON: log-once behaviour would be nice but the
    // caller doesn't own the console. Silently ignore — the route still
    // works with the static map + default.
    return {};
  }
};

const getEnvOverrides = (): Record<string, string> => {
  const raw = process.env[OVERRIDES_ENV] ?? '';
  if (cachedEnvOverrides?.raw === raw) return cachedEnvOverrides.parsed;
  const parsed = parseEnvOverrides(raw);
  cachedEnvOverrides = { raw, parsed };
  return parsed;
};

export const getDefaultModel = (): string =>
  (process.env[DEFAULT_MODEL_ENV] ?? '').trim() || FALLBACK_DEFAULT_MODEL;

export interface ResolveModelOptions {
  /** Explicit model from the caller — always wins if provided. */
  explicit?: string;
}

/**
 * Decide which Gemini model should serve a given feature. Precedence:
 *   1. `options.explicit` (a per-request override — rarely used)
 *   2. env `MODEL_ROUTING_OVERRIDES[feature]`
 *   3. static FEATURE_MODEL_OVERRIDES[feature]
 *   4. env `GEMINI_MODEL` or the compiled-in fallback
 */
export const resolveModel = (
  feature: string,
  options: ResolveModelOptions = {}
): string => {
  if (options.explicit && options.explicit.trim()) return options.explicit.trim();
  const envOverrides = getEnvOverrides();
  if (envOverrides[feature]) return envOverrides[feature];
  if (FEATURE_MODEL_OVERRIDES[feature]) return FEATURE_MODEL_OVERRIDES[feature];
  return getDefaultModel();
};

/**
 * Test hook — resets the env-override cache. Production code never needs
 * this; tests use it so `process.env` mutations take effect between cases.
 */
export const __resetModelRouterCacheForTests = (): void => {
  cachedEnvOverrides = null;
};
