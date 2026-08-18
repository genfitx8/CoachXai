/**
 * On-device LLM configuration.
 *
 * The feature is entirely opt-in: it stays dormant unless
 * `VITE_ON_DEVICE_MODEL_URL` points at a hosted Gemma LiteRT bundle.
 * Gemma's license requires acceptance before download, so the model file
 * must be re-hosted on infrastructure we control (e.g. the existing R2
 * bucket or a CDN) rather than hot-linked from HuggingFace/Kaggle.
 *
 * Expected model: Gemma 3 270M instruction-tuned, int8 LiteRT (~300MB),
 * e.g. the `gemma3-270m-it-q8.task` conversion from litert-community.
 * Larger variants (Gemma 3 1B) work with the same code — just point the
 * URL at a different file and bump ON_DEVICE_MODEL_ID so existing caches
 * invalidate.
 */

export interface OnDeviceLlmConfig {
  /** Absolute URL of the .task/.litertlm model file. Empty = feature off. */
  modelUrl: string;
  /** Base path for the MediaPipe GenAI wasm fileset. */
  wasmBasePath: string;
  /** Cache-busting identity for the model file. */
  modelId: string;
  /** Combined input+output token budget for the on-device engine. */
  maxTokens: number;
  temperature: number;
  topK: number;
}

/**
 * Pinned to the installed @mediapipe/tasks-genai version — `@latest` would
 * risk wasm/JS API skew between the npm bundle and the CDN fileset.
 */
const DEFAULT_WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29/wasm';

export const ON_DEVICE_MODEL_ID = 'gemma-3-270m-it-q8-v1';

/** Reported in AI-call telemetry so the observability dashboard can split local vs server traffic. */
export const ON_DEVICE_MODEL_LABEL = 'on-device/gemma-3-270m';

export const getOnDeviceLlmConfig = (): OnDeviceLlmConfig => ({
  modelUrl: (import.meta.env.VITE_ON_DEVICE_MODEL_URL as string | undefined) ?? '',
  wasmBasePath:
    (import.meta.env.VITE_ON_DEVICE_WASM_BASE as string | undefined) ??
    DEFAULT_WASM_BASE,
  modelId: ON_DEVICE_MODEL_ID,
  maxTokens: 1024,
  temperature: 0.6,
  topK: 40,
});

/** Whether the deployment has on-device AI configured at all. */
export const isOnDeviceLlmEnabled = (): boolean =>
  Boolean(getOnDeviceLlmConfig().modelUrl);
