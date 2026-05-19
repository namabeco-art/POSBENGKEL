/**
 * IndexedDB Storage Service
 * 
 * Replaces localStorage for large data storage.
 * localStorage has a 5-10MB limit which is insufficient for stores
 * with 10,000+ SKUs and thousands of transactions.
 * 
 * IndexedDB supports hundreds of MB and is async-friendly.
 * Falls back to localStorage if IndexedDB is unavailable.
 */

import { AppData } from '../types';

const DB_NAME = 'POSHULIO_DB';
const DB_VERSION = 1;
const STORE_NAME = 'app_data';
const DATA_KEY = 'main_state';

let dbInstance: IDBDatabase | null = null;

const openDatabase = (): Promise<IDBDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };
  });
};

/**
 * Save app data to IndexedDB.
 * Falls back to localStorage if IndexedDB fails.
 */
export const saveAppDataIndexedDB = async (data: AppData): Promise<void> => {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(data, DATA_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Fallback to localStorage
    try {
      localStorage.setItem('HGROUP_ENTERPRISE_DATA', JSON.stringify(data));
    } catch {
      console.warn('[IndexedDB] Both IndexedDB and localStorage save failed');
    }
  }
};

/**
 * Load app data from IndexedDB.
 * Falls back to localStorage if IndexedDB fails or has no data.
 */
export const loadAppDataIndexedDB = async (): Promise<Partial<AppData> | null> => {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(DATA_KEY);
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result as Partial<AppData>);
        } else {
          // Try localStorage fallback (migration from old storage)
          try {
            const raw = localStorage.getItem('HGROUP_ENTERPRISE_DATA');
            const data = raw ? JSON.parse(raw) : null;
            if (data) {
              // Migrate to IndexedDB
              saveAppDataIndexedDB(data as AppData).catch(() => {});
            }
            resolve(data);
          } catch {
            resolve(null);
          }
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Fallback to localStorage
    try {
      const raw = localStorage.getItem('HGROUP_ENTERPRISE_DATA');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
};

/**
 * Clear all app data from IndexedDB.
 */
export const clearAppDataIndexedDB = async (): Promise<void> => {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(DATA_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    localStorage.removeItem('HGROUP_ENTERPRISE_DATA');
  }
};

/**
 * Get approximate storage usage in bytes.
 */
export const getStorageEstimate = async (): Promise<{ usage: number; quota: number } | null> => {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
    };
  }
  return null;
};
