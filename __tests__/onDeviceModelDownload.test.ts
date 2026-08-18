/**
 * Tests for the on-device model download manager — Cache API storage,
 * status transitions, config invalidation, and deletion.
 *
 * jsdom has no Cache API, so a minimal in-memory CacheStorage is installed
 * for the duration of the suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MODEL_URL = 'https://models.example.com/gemma3-270m-it-q8.task';

// ── In-memory Cache API stub ────────────────────────────────────────────────

class MemoryCache {
  private store = new Map<string, Response>();

  async match(url: string): Promise<Response | undefined> {
    const hit = this.store.get(url);
    return hit ? hit.clone() : undefined;
  }

  async put(url: string, response: Response): Promise<void> {
    this.store.set(url, response);
  }

  async delete(url: string): Promise<boolean> {
    return this.store.delete(url);
  }
}

const memoryCaches = new Map<string, MemoryCache>();
const cachesStub = {
  open: async (name: string): Promise<MemoryCache> => {
    if (!memoryCaches.has(name)) memoryCaches.set(name, new MemoryCache());
    return memoryCaches.get(name)!;
  },
};

const installEnvironment = () => {
  vi.stubGlobal('caches', cachesStub);
  // isEngineSupported requires WebGPU — jsdom's navigator has no `gpu`.
  Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
};

const modelBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

// A fresh Uint8Array per call — Response bodies are single-use streams.
const okModelResponse = (): Response =>
  new Response(modelBytes.slice(), {
    status: 200,
    headers: { 'content-length': String(modelBytes.byteLength) },
  });

describe('modelDownloadManager', () => {
  beforeEach(() => {
    vi.resetModules();
    memoryCaches.clear();
    localStorage.clear();
    installEnvironment();
    vi.stubEnv('VITE_ON_DEVICE_MODEL_URL', MODEL_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).gpu;
  });

  const loadManager = () => import('../services/onDeviceLlm/modelDownloadManager');

  it('reports disabled when no model URL is configured', async () => {
    vi.stubEnv('VITE_ON_DEVICE_MODEL_URL', '');
    const mgr = await loadManager();
    expect(await mgr.refreshModelStatus()).toBe('disabled');
  });

  it('reports unsupported without WebGPU', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).gpu;
    const mgr = await loadManager();
    expect(await mgr.refreshModelStatus()).toBe('unsupported');
  });

  it('reports not_downloaded before any download', async () => {
    const mgr = await loadManager();
    expect(await mgr.refreshModelStatus()).toBe('not_downloaded');
  });

  it('downloads the model into the cache and reports ready', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okModelResponse()));
    const mgr = await loadManager();

    const ok = await mgr.downloadModel();
    expect(ok).toBe(true);
    expect(mgr.getModelDownloadState().status).toBe('ready');
    expect(mgr.getModelDownloadState().receivedBytes).toBe(modelBytes.byteLength);

    // Survives a status refresh (cache + meta both present).
    expect(await mgr.refreshModelStatus()).toBe('ready');

    // Bytes really live in the cache.
    const reader = await mgr.openCachedModelReader();
    expect(reader).not.toBeNull();
  });

  it('reports error when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    const mgr = await loadManager();

    const ok = await mgr.downloadModel();
    expect(ok).toBe(false);
    expect(mgr.getModelDownloadState().status).toBe('error');
    expect(mgr.getModelDownloadState().errorMessage).toContain('404');
  });

  it('invalidates cached weights when the model URL changes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okModelResponse()));
    const mgr = await loadManager();
    await mgr.downloadModel();
    expect(await mgr.refreshModelStatus()).toBe('ready');

    vi.stubEnv('VITE_ON_DEVICE_MODEL_URL', 'https://models.example.com/gemma3-1b-it-q8.task');
    expect(await mgr.refreshModelStatus()).toBe('not_downloaded');
  });

  it('deleteModel clears cache and returns to not_downloaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okModelResponse()));
    const mgr = await loadManager();
    await mgr.downloadModel();

    await mgr.deleteModel();
    expect(mgr.getModelDownloadState().status).toBe('not_downloaded');
    expect(await mgr.openCachedModelReader()).toBeNull();
    expect(await mgr.refreshModelStatus()).toBe('not_downloaded');
  });

  it('notifies subscribers about status transitions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okModelResponse()));
    const mgr = await loadManager();

    const seen: string[] = [];
    const unsubscribe = mgr.subscribeModelDownload((s) => seen.push(s.status));
    await mgr.downloadModel();
    unsubscribe();

    expect(seen).toContain('downloading');
    expect(seen[seen.length - 1]).toBe('ready');
  });
});
