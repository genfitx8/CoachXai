/**
 * On-device AI — public entry point.
 *
 * Hybrid routing: simple, data-free queries are answered locally by a tiny
 * Gemma model (zero API cost, works offline, ~instant first token); every
 * other query — and every failure along the local path — falls through to
 * the existing server AI. Callers only need `tryAnswerOnDevice`: a null
 * return always means "use the server path as before".
 */

import { createLogger } from '../../utils/logger';
import { recordAiCall } from '../aiCallLogger';
import { isOnDeviceLlmEnabled, ON_DEVICE_MODEL_LABEL } from './config';
import {
  getModelDownloadState,
  refreshModelStatus,
} from './modelDownloadManager';
import {
  generateOnDevice,
  initOnDeviceEngine,
  isEngineReady,
} from './onDeviceLlmService';
import { routeChatQuery } from './queryRouter';

const log = createLogger('onDeviceLlmRouter');

export interface TryOnDeviceInput {
  userMessage: string;
  language: string;
  /** Registered client names — used by the router to detect member references. */
  clientNames?: string[];
  onChunk?: (delta: string, accumulated: string) => void;
  coachId?: string;
}

/**
 * Attempt to answer a chat query on-device.
 *
 * Returns the generated text when the local path fully succeeded, or null
 * when the query should go to the server instead (feature disabled, router
 * said server, model not ready, or generation failed). Never throws.
 */
export const tryAnswerOnDevice = async (
  input: TryOnDeviceInput
): Promise<string | null> => {
  if (!isOnDeviceLlmEnabled()) return null;

  const decision = routeChatQuery(input.userMessage, { clientNames: input.clientNames });
  if (decision.target !== 'on-device') return null;

  // Model not downloaded yet (or engine unsupported) — server handles it.
  // The engine is initialised lazily on the first eligible query after the
  // weights are present.
  if (!isEngineReady()) {
    const ready = await initOnDeviceEngine();
    if (!ready) return null;
  }

  const startedAt = Date.now();
  try {
    const text = await generateOnDevice(input.userMessage, input.language, {
      onChunk: input.onChunk,
    });
    void recordAiCall({
      feature: 'coachx_chat',
      coachId: input.coachId,
      prompt: input.userMessage,
      responseText: text,
      latencyMs: Date.now() - startedAt,
      status: 'success',
      model: ON_DEVICE_MODEL_LABEL,
    });
    log.info(`answered on-device (${decision.reason}, ${Date.now() - startedAt}ms)`);
    return text;
  } catch (e) {
    log.warn('on-device generation failed — falling back to server', e);
    void recordAiCall({
      feature: 'coachx_chat',
      coachId: input.coachId,
      prompt: input.userMessage,
      responseText: '',
      latencyMs: Date.now() - startedAt,
      status: 'error',
      errorMessage: e instanceof Error ? e.message : String(e),
      model: ON_DEVICE_MODEL_LABEL,
    });
    return null;
  }
};

/**
 * Kick off a background model download when appropriate — call once after
 * app start. No-op when disabled/unsupported/already downloaded. The
 * OnDeviceModelManager UI drives explicit downloads; this only resumes an
 * interrupted one silently.
 */
export const resumeModelDownloadIfNeeded = async (): Promise<void> => {
  if (!isOnDeviceLlmEnabled()) return;
  await refreshModelStatus();
  // Deliberately no auto-download here: the ~300MB fetch should stay a
  // user-visible choice (Wi-Fi, storage). Kept as an extension point.
  void getModelDownloadState;
};

export { routeChatQuery } from './queryRouter';
export type { RouteDecision, RouteTarget } from './queryRouter';
export {
  downloadModel,
  deleteModel,
  refreshModelStatus,
  getModelDownloadState,
  subscribeModelDownload,
  isEngineSupported,
  isLikelyMeteredConnection,
} from './modelDownloadManager';
export type { ModelDownloadState, ModelStatus } from './modelDownloadManager';
export { isOnDeviceLlmEnabled } from './config';
export { disposeOnDeviceEngine } from './onDeviceLlmService';
