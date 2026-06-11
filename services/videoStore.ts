const DB_NAME = 'coachxai_video_store';
const DB_VERSION = 1;
const STORE_NAME = 'videos';

export const IDB_PREFIX = 'idb://';

// Session-level blob cache: populated on save() so resolve() is instant
// for blobs written during the current page session (no IDB round-trip needed).
const sessionCache = new Map<string, Blob>();

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const videoStore = {
  /** Save a blob to IndexedDB and return an idb:// sentinel URL */
  async save(key: string, blob: Blob): Promise<string> {
    // Cache immediately so resolve() can return synchronously this session
    sessionCache.set(key, blob);

    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put(blob, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    return `${IDB_PREFIX}${key}`;
  },

  /**
   * Given an idb:// URL, retrieve the blob and return a fresh object URL.
   * Hits the in-memory session cache first (O(1), no async IDB round-trip)
   * so newly saved blobs resolve instantly. Falls back to IDB for blobs
   * saved in a previous session. Returns null if not found.
   * Non-idb:// URLs are returned as-is.
   */
  async resolve(url: string): Promise<string | null> {
    if (!url.startsWith(IDB_PREFIX)) return url;
    const key = url.slice(IDB_PREFIX.length);

    // Fast path: session cache hit
    const cached = sessionCache.get(key);
    if (cached) return URL.createObjectURL(cached);

    // Slow path: IDB lookup (cross-session / page-reload case)
    try {
      const db = await openDB();
      const blob = await new Promise<Blob | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result as Blob | undefined);
        req.onerror = () => reject(req.error);
      });
      if (!blob) return null;
      // Back-fill cache so subsequent resolves within the session are fast
      sessionCache.set(key, blob);
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  },

  async delete(key: string): Promise<void> {
    sessionCache.delete(key);
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // ignore – best effort cleanup
    }
  },
};
