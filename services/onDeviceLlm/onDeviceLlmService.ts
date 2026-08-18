/**
 * onDeviceLlmService — thin wrapper around MediaPipe's LLM Inference task
 * running Gemma fully on the user's device (WebGPU inside the Capacitor
 * WebView).
 *
 * The heavy import (`@mediapipe/tasks-genai`) is loaded dynamically so the
 * main bundle stays unaffected for the vast majority of sessions where the
 * feature is disabled or the model isn't downloaded.
 *
 * Concurrency: MediaPipe's engine handles one generation at a time, so
 * calls are serialised through a single in-flight promise chain.
 */

import { createLogger } from '../../utils/logger';
import { getOnDeviceLlmConfig } from './config';
import {
  isEngineSupported,
  openCachedModelReader,
  refreshModelStatus,
} from './modelDownloadManager';

const log = createLogger('onDeviceLlm');

// Minimal structural type for the engine — keeps @mediapipe/tasks-genai out
// of the static import graph.
interface LlmEngine {
  generateResponse(
    query: string,
    progressListener?: (partial: string, done: boolean) => unknown
  ): Promise<string>;
  close(): void;
}

let engine: LlmEngine | null = null;
let engineInit: Promise<LlmEngine | null> | null = null;
let generationChain: Promise<unknown> = Promise.resolve();

/** True once the engine is loaded and can serve a prompt immediately. */
export const isEngineReady = (): boolean => engine !== null;

/**
 * Load the wasm runtime + model weights into an inference engine.
 * Idempotent; concurrent callers share one initialisation. Resolves null
 * (never throws) when the engine can't be created — callers fall back to
 * the server path.
 */
export const initOnDeviceEngine = async (): Promise<boolean> => {
  if (engine) return true;
  if (!engineInit) {
    engineInit = doInit().finally(() => {
      engineInit = null;
    });
  }
  return (await engineInit) !== null;
};

const doInit = async (): Promise<LlmEngine | null> => {
  try {
    if (!isEngineSupported()) return null;
    const status = await refreshModelStatus();
    if (status !== 'ready') return null;

    const modelReader = await openCachedModelReader();
    if (!modelReader) return null;

    const config = getOnDeviceLlmConfig();
    const startedAt = Date.now();
    const { FilesetResolver, LlmInference } = await import('@mediapipe/tasks-genai');
    const fileset = await FilesetResolver.forGenAiTasks(config.wasmBasePath);
    const created = await LlmInference.createFromOptions(fileset, {
      baseOptions: {
        modelAssetBuffer: modelReader,
      },
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      topK: config.topK,
    });
    engine = created as unknown as LlmEngine;
    log.info(`on-device engine ready in ${Date.now() - startedAt}ms`);
    return engine;
  } catch (e) {
    log.error('on-device engine init failed', e);
    engine = null;
    return null;
  }
};

/** Release the engine (e.g. after the model file is deleted). */
export const disposeOnDeviceEngine = (): void => {
  try {
    engine?.close();
  } catch {
    // Engine teardown errors are inconsequential.
  }
  engine = null;
};

/**
 * System framing for the tiny model. Deliberately short: small models
 * follow short instructions better, and every token here eats into the
 * shared input/output budget.
 */
const SYSTEM_PREAMBLE: Record<string, string> = {
  ko: '당신은 골프 코칭 앱의 AI 어시스턴트입니다. 골프 질문에 정확하고 간결하게 한국어로 답하세요. 모르는 내용은 모른다고 답하세요.',
  en: 'You are the AI assistant of a golf coaching app. Answer golf questions accurately and concisely in English. If unsure, say you are not sure.',
  ja: 'あなたはゴルフコーチングアプリのAIアシスタントです。ゴルフの質問に日本語で簡潔かつ正確に答えてください。不明な場合はその旨を伝えてください。',
};

/**
 * Gemma instruction-tuned chat template. The LiteRT conversions expect the
 * turn markers in the raw prompt string.
 */
const buildGemmaPrompt = (userMessage: string, language: string): string => {
  const system = SYSTEM_PREAMBLE[language] ?? SYSTEM_PREAMBLE.ko;
  return `<start_of_turn>user\n${system}\n\n${userMessage}<end_of_turn>\n<start_of_turn>model\n`;
};

export interface OnDeviceGenerateOptions {
  onChunk?: (delta: string, accumulated: string) => void;
  /** Hard cap on generation wall-time. Default 30s. */
  timeoutMs?: number;
}

/**
 * Generate a response on-device. Throws when the engine isn't ready or the
 * generation fails/times out — callers treat any throw as "fall back to
 * server".
 */
export const generateOnDevice = async (
  userMessage: string,
  language: string,
  options: OnDeviceGenerateOptions = {}
): Promise<string> => {
  if (!engine) throw new Error('on-device engine not initialised');
  const activeEngine = engine;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const prompt = buildGemmaPrompt(userMessage, language);

  const run = async (): Promise<string> => {
    let accumulated = '';
    const generation = activeEngine.generateResponse(prompt, (partial, _done) => {
      if (partial) {
        accumulated += partial;
        options.onChunk?.(partial, accumulated);
      }
    });
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`on-device generation timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    const text = await Promise.race([generation, timeout]);
    const finalText = (typeof text === 'string' && text.trim()) ? text : accumulated;
    if (!finalText.trim()) throw new Error('on-device generation returned empty text');
    return finalText.trim();
  };

  // Serialise generations — chain onto the previous one regardless of its outcome.
  const result = generationChain.then(run, run);
  generationChain = result.catch(() => undefined);
  return result;
};
