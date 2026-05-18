const DB_NAME = 'coachxai_video_store';
const DB_VERSION = 1;
const STORE_NAME = 'videos';

export const IDB_PREFIX = 'idb://';

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
   * Given an idb:// URL, retrieve the blob from IndexedDB and create a fresh
   * object URL. Returns null if not found. Non-idb:// URLs are returned as-is.
   */
  async resolve(url: string): Promise<string | null> {
    if (!url.startsWith(IDB_PREFIX)) return url;
    const key = url.slice(IDB_PREFIX.length);
    try {
      const db = await openDB();
      const blob = await new Promise<Blob | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result as Blob | undefined);
        req.onerror = () => reject(req.error);
      });
      if (!blob) return null;
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  },

  async delete(key: string): Promise<void> {
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
