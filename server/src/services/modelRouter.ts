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
 *
 * Activation record — 2026-08-19 (레슨 컴패니언 품질 우선 라우팅)
 *   레슨 컴패니언(실시간 필기 + 요약)은 유료 코치 전용 기능이라 비용보다
 *   품질을 우선한다는 제품 결정에 따라:
 *    - lesson_summary / lesson_summary_merge / lesson_live_summary 는
 *      현행 최상위 추론 모델 `gemini-3.1-pro-preview` 로 라우팅한다.
 *      레슨 요약은 잡담·레슨 무관 대화가 섞인 전체 필기를 다 읽고
 *      레슨 내용만 골라내는 장문 맥락 추론 작업이라 pro 티어의 이득이
 *      가장 큰 경로다. (2.5-pro 는 신규 키에서 404, 3-pro-preview 는
 *      2026-03 퇴역 → 3.1-pro-preview 가 현행 pro 티어.)
 *    - lesson_audio_transcribe 는 GA 인 `gemini-3.6-flash` 로 올린다.
 *      pro 를 쓰지 않는 이유: 10초 받아쓰기는 추론이 아니라 청취 정확도
 *      문제이고, 레슨당 ~300회 호출되는 실시간 경로라 pro 급의 지연과
 *      preview rate limit 이 "옆에서 받아 적는" UX 자체를 깨뜨린다.
 *    - preview 모델은 예고 후 퇴역(404)될 수 있고 rate limit 도 더
 *      빡빡하다 — routes/ai.ts 가 404/429 시 기본 모델로 1회 폴백해
 *      유료 레슨 도중 요약이 통째로 죽는 일을 막는다.
 */
const FEATURE_MODEL_OVERRIDES: Record<string, string> = {
  // OCR / structured extraction — deterministic, benefits from cheap+fast.
  extract_golf_data: 'gemini-2.5-flash-lite',
  analyze_trackman_screen: 'gemini-2.5-flash-lite',
  analyze_body_photos: 'gemini-2.5-flash-lite',
  analyze_equipment_photo: 'gemini-2.5-flash-lite',
  swing_phase_timestamps: 'gemini-2.5-flash-lite',
  hole_voice_summary: 'gemini-2.5-flash-lite',

  // 레슨 요약 3경로 — 노이즈 섞인 전체 필기에서 레슨 내용만 추출하는
  // 맥락 추론이 품질을 좌우한다. 유료 기능이므로 pro 티어(2026-08-19).
  lesson_summary: 'gemini-3.1-pro-preview',
  lesson_summary_merge: 'gemini-3.1-pro-preview',
  lesson_live_summary: 'gemini-3.1-pro-preview',

  // ~10초 구간 받아쓰기 — 레슨당 수백 회 호출되는 실시간 필기 경로.
  // 품질은 최신 GA flash 로 올리되, 지연·rate limit 때문에 pro 는 쓰지
  // 않는다(위 activation record 참고).
  lesson_audio_transcribe: 'gemini-3.6-flash',
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
