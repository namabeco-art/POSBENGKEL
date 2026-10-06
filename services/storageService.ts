import { AppData } from '../types';

export const STORAGE_KEY = 'HGROUP_ENTERPRISE_DATA';
export const SESSION_KEY = 'HGROUP_USER_SESSION';

let quotaWarningShown = false;

/**
 * Cadangan di localStorage (penyimpanan utama adalah IndexedDB).
 * localStorage dibatasi ~5MB — saat data toko sudah besar, penyimpanan di sini boleh gagal
 * tanpa menggagalkan transaksi yang sedang berjalan.
 */
export const saveAppDataLocal = (data: AppData) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    if (!quotaWarningShown) {
      quotaWarningShown = true;
      console.warn('[Storage] Cadangan localStorage penuh; data tetap tersimpan di IndexedDB.', error);
    }
  }
};

export const loadAppDataLocal = (): Partial<AppData> | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

export const saveSessionLocal = (sessionUser: unknown) => {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
  } catch {
    // Sesi tidak tersimpan (storage penuh) — user perlu login ulang setelah refresh.
  }
};

export const loadSessionLocal = <T>(): T | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as T : null;
  } catch (error) {
    return null;
  }
};

export const clearSessionLocal = () => {
  localStorage.removeItem(SESSION_KEY);
};
