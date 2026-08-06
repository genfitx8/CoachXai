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
 * Static feature → model map. Kept empty by default; add entries here
 * once observability shows a feature would benefit from a different tier.
 * Env-var overrides win over this map at runtime so we can A/B without
 * a redeploy.
 */
const FEATURE_MODEL_OVERRIDES: Record<string, string> = {
  // Example (commented — enable after eval baseline confirms parity):
  // extract_golf_data: 'gemini-2.5-flash-lite',
  // analyze_body_photos: 'gemini-2.5-flash-lite',
  // shot_analysis: 'gemini-2.5-pro',
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
