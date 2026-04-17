import { AppData } from '../types';

export const STORAGE_KEY = 'HGROUP_ENTERPRISE_DATA';
export const SESSION_KEY = 'HGROUP_USER_SESSION';

export const saveAppDataLocal = (data: AppData) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
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
