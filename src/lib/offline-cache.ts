// ═══════════════════════════════════════════════════════════════════
//  Offline Cache — IndexedDB wrapper for translation caching
//  Used by the frontend. Caches last 50 translations for offline use.
//
//  Usage (in React):
//    import { offlineCache } from './lib/offline-cache';
//    const cached = await offlineCache.get("hello", "en", "fr");
//    if (cached) { playAudio(cached.audioContent); }
//    else { /* hit the server */ }
// ═══════════════════════════════════════════════════════════════════

import type { CachedTranslation } from "../types/api.js";

const DB_NAME = "linguablob-cache";
const DB_VERSION = 1;
const STORE_NAME = "translations";
const MAX_ENTRIES = 50;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "cacheKey" });
        store.createIndex("cachedAt", "cachedAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generate a deterministic cache key from source text + languages.
 */
function makeCacheKey(
  sourceText: string,
  sourceLanguage: string,
  targetLanguage: string
): string {
  const normalized = sourceText.trim().toLowerCase();
  return `${sourceLanguage}:${targetLanguage}:${normalized}`;
}

/**
 * Get a cached translation. Returns null if not found.
 */
async function get(
  sourceText: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<CachedTranslation | null> {
  try {
    const db = await openDB();
    const key = makeCacheKey(sourceText, sourceLanguage, targetLanguage);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          // Return without the cacheKey (internal field)
          const { cacheKey, ...translation } = result;
          resolve(translation as CachedTranslation);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    // IndexedDB unavailable (SSR, incognito) — fail silently
    return null;
  }
}

/**
 * Save a translation to cache. Evicts oldest entries if over MAX_ENTRIES.
 */
async function save(translation: CachedTranslation): Promise<void> {
  try {
    const db = await openDB();
    const key = makeCacheKey(
      translation.sourceText,
      translation.sourceLanguage,
      translation.targetLanguage
    );

    const record = {
      cacheKey: key,
      ...translation,
      cachedAt: Date.now(),
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      // Put the new record
      store.put(record);

      // Count entries and evict oldest if necessary
      const countReq = store.count();
      countReq.onsuccess = () => {
        if (countReq.result > MAX_ENTRIES) {
          const excess = countReq.result - MAX_ENTRIES;
          const idx = store.index("cachedAt");
          const cursor = idx.openCursor();
          let deleted = 0;

          cursor.onsuccess = () => {
            const c = cursor.result;
            if (c && deleted < excess) {
              c.delete();
              deleted++;
              c.continue();
            }
          };
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fail silently — cache is best-effort
  }
}

/**
 * Clear all cached translations. Exposed for the settings page.
 */
async function clear(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fail silently
  }
}

/**
 * Get count of cached entries. Useful for UI display.
 */
async function count(): Promise<number> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

/**
 * Get all cached entries (for debug/export).
 */
async function getAll(): Promise<CachedTranslation[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        const results = req.result.map(
          ({ cacheKey, ...rest }: any) => rest as CachedTranslation
        );
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export const offlineCache = { get, save, clear, count, getAll };
