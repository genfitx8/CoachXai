/**
 * modelDownloadManager — downloads and stores the on-device LLM weights.
 *
 * The model (~300MB for Gemma 3 270M int8) is far too large to ship inside
 * the app binary, so the standard mobile pattern applies: the app installs
 * small, then fetches the weights once — ideally on Wi-Fi — and keeps them
 * in the Cache API where they survive restarts and work offline. While the
 * model isn't downloaded yet, chat transparently keeps using the server AI,
 * so the user never waits on this download.
 *
 * Storage: Cache API (`caches`), one entry keyed by the model URL. The
 * Cache API is available in Capacitor's WKWebView/Android WebView and
 * handles multi-hundred-MB bodies, unlike localStorage. A small metadata
 * record in localStorage tracks which model id/URL the cached bytes belong
 * to so a config change invalidates stale weights.
 */

import { createLogger } from '../../utils/logger';
import { getOnDeviceLlmConfig, isOnDeviceLlmEnabled } from './config';

const log = createLogger('onDeviceModelDownload');

const CACHE_NAME = 'coachxai-on-device-llm-v1';
const META_STORAGE_KEY = 'coachxai_on_device_model_meta_v1';

export type ModelStatus =
  | 'disabled' // no VITE_ON_DEVICE_MODEL_URL configured
  | 'unsupported' // browser/WebView can't run the engine (no WebGPU / no Cache API)
  | 'not_downloaded'
  | 'downloading'
  | 'ready'
  | 'error';

export interface ModelDownloadState {
  status: ModelStatus;
  /** 0..1 while downloading; 1 when ready. */
  progress: number;
  /** Bytes received so far (downloading) or total size (ready). */
  receivedBytes: number;
  /** Content-Length when the server reports it, else null. */
  totalBytes: number | null;
  errorMessage?: string;
}

interface ModelMeta {
  modelId: string;
  modelUrl: string;
  sizeBytes: number;
  downloadedAt: number;
}

// ── Environment probes ───────────────────────────────────────────────────────

/** Cache API present — required to store the weights. */
const hasCacheApi = (): boolean => typeof caches !== 'undefined';

/**
 * MediaPipe's web LLM engine runs on WebGPU. Older WebViews (iOS < 26,
 * Android WebView < 121) simply route everything to the server AI.
 */
export const isEngineSupported = (): boolean =>
  hasCacheApi() &&
  typeof navigator !== 'undefined' &&
  'gpu' in navigator;

/**
 * Best-effort "is this connection metered" probe (Network Information API).
 * Returns false when the API is unavailable — callers should treat this as
 * a soft signal for auto-download, never a hard block on manual download.
 */
export const isLikelyMeteredConnection = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as { connection?: { type?: string; saveData?: boolean } }).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  return conn.type === 'cellular';
};

// ── Metadata ────────────────────────────────────────────────────────────────

const readMeta = (): ModelMeta | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ModelMeta;
    if (!parsed?.modelId || !parsed?.modelUrl) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeMeta = (meta: ModelMeta | null): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    if (meta === null) localStorage.removeItem(META_STORAGE_KEY);
    else localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // Best-effort — a failed meta write only means a re-download later.
  }
};

// ── State + subscriptions ───────────────────────────────────────────────────

type Listener = (state: ModelDownloadState) => void;
const listeners = new Set<Listener>();

let state: ModelDownloadState = {
  status: 'not_downloaded',
  progress: 0,
  receivedBytes: 0,
  totalBytes: null,
};

const setState = (next: Partial<ModelDownloadState>): void => {
  state = { ...state, ...next };
  for (const fn of listeners) {
    try {
      fn(state);
    } catch {
      // Listener errors must not break the download loop.
    }
  }
};

export const getModelDownloadState = (): ModelDownloadState => state;

/** Subscribe to state changes. Returns an unsubscribe function. */
export const subscribeModelDownload = (fn: Listener): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// ── Core operations ─────────────────────────────────────────────────────────

/**
 * Resolve the real status from the environment + cache. Call once on app
 * start (and after config changes); it also repairs `state`.
 */
export const refreshModelStatus = async (): Promise<ModelStatus> => {
  if (!isOnDeviceLlmEnabled()) {
    setState({ status: 'disabled', progress: 0 });
    return 'disabled';
  }
  if (!isEngineSupported()) {
    setState({ status: 'unsupported', progress: 0 });
    return 'unsupported';
  }
  if (state.status === 'downloading') return 'downloading';

  const { modelUrl, modelId } = getOnDeviceLlmConfig();
  const meta = readMeta();
  const metaMatches = meta?.modelId === modelId && meta?.modelUrl === modelUrl;

  try {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(modelUrl);
    if (cached && metaMatches) {
      setState({
        status: 'ready',
        progress: 1,
        receivedBytes: meta?.sizeBytes ?? 0,
        totalBytes: meta?.sizeBytes ?? null,
      });
      return 'ready';
    }
    // Stale weights from a previous model id/URL — reclaim the space.
    if (cached && !metaMatches) {
      await cache.delete(modelUrl).catch(() => undefined);
    }
    if (meta && !metaMatches) writeMeta(null);
  } catch (e) {
    log.warn('cache probe failed', e);
  }

  setState({ status: 'not_downloaded', progress: 0, receivedBytes: 0, totalBytes: null });
  return 'not_downloaded';
};

let inflightDownload: Promise<boolean> | null = null;

/**
 * Download the model into the Cache API with progress reporting.
 * Resolves true when the model is ready, false on failure (state carries
 * the error). Concurrent calls share one download.
 */
export const downloadModel = async (): Promise<boolean> => {
  if (inflightDownload) return inflightDownload;
  inflightDownload = doDownload().finally(() => {
    inflightDownload = null;
  });
  return inflightDownload;
};

const doDownload = async (): Promise<boolean> => {
  const status = await refreshModelStatus();
  if (status === 'ready') return true;
  if (status === 'disabled' || status === 'unsupported') return false;

  const { modelUrl, modelId } = getOnDeviceLlmConfig();
  setState({ status: 'downloading', progress: 0, receivedBytes: 0, totalBytes: null, errorMessage: undefined });

  try {
    const response = await fetch(modelUrl);
    if (!response.ok || !response.body) {
      throw new Error(`model fetch failed (HTTP ${response.status})`);
    }

    const lengthHeader = response.headers.get('content-length');
    const totalBytes = lengthHeader ? Number(lengthHeader) : null;
    setState({ totalBytes });

    // Stream to memory chunks so we can surface progress; the Cache API
    // put happens once at the end with the fully assembled body.
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        setState({
          receivedBytes: received,
          progress: totalBytes ? Math.min(0.99, received / totalBytes) : 0,
        });
      }
    }

    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      modelUrl,
      new Response(merged, {
        headers: { 'content-type': contentType, 'content-length': String(received) },
      })
    );

    writeMeta({ modelId, modelUrl, sizeBytes: received, downloadedAt: Date.now() });
    setState({ status: 'ready', progress: 1, receivedBytes: received, totalBytes: received });
    log.info(`on-device model downloaded (${(received / 1024 / 1024).toFixed(1)}MB)`);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error('model download failed', e);
    setState({ status: 'error', errorMessage: msg });
    return false;
  }
};

/** Remove the cached weights and metadata (e.g. to free storage). */
export const deleteModel = async (): Promise<void> => {
  const { modelUrl } = getOnDeviceLlmConfig();
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(modelUrl);
  } catch (e) {
    log.warn('model delete failed', e);
  }
  writeMeta(null);
  setState({ status: 'not_downloaded', progress: 0, receivedBytes: 0, totalBytes: null });
};

/**
 * Open a streaming reader over the cached model bytes. Used by the engine
 * to feed MediaPipe's `modelAssetBuffer` without holding a second full
 * copy in JS memory. Returns null when the model isn't cached.
 */
export const openCachedModelReader = async (): Promise<ReadableStreamDefaultReader<Uint8Array> | null> => {
  if (!hasCacheApi()) return null;
  const { modelUrl } = getOnDeviceLlmConfig();
  try {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(modelUrl);
    if (!cached?.body) return null;
    return cached.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  } catch (e) {
    log.warn('cached model read failed', e);
    return null;
  }
};
