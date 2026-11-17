/**
 * Login perangkat ke cloud toko (Cloudflare Worker + Durable Object).
 *
 * Model keamanan: data toko hanya bisa dibaca/ditulis perangkat yang login dengan akun cloud toko
 * (email + password, di-hash PBKDF2 di server). Owner mendaftarkan toko sekali memakai kode pendaftaran
 * (SETUP_KEY milik server), lalu tiap perangkat login sekali. Login staf (admin/kasir/gudang) tetap sama.
 */
import { setCloudAiAvailable } from './appConfig';

const SESSION_KEY = 'POS_CLOUD_SESSION_CF';
const REQUEST_TIMEOUT_MS = 15_000;

export interface CloudSession {
  storeId: string;
  token: string;
  email: string;
  connectedAt: string;
}

export const CLOUD_AUTH_REQUIRED = 'CLOUD_AUTH_REQUIRED';

const listeners = new Set<(session: CloudSession | null) => void>();

const readSession = (): CloudSession | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as CloudSession : null;
  } catch {
    return null;
  }
};

const writeSession = (session: CloudSession | null) => {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* storage diblokir */ }
  if (!session) setCloudAiAvailable(false);
  listeners.forEach(listener => listener(session));
};

/** Dipanggil saat sesi berubah (login, logout, sesi ditolak server). */
export const onCloudSessionChange = (listener: (session: CloudSession | null) => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** Sesi aktif untuk toko tertentu (atau null). */
export const getCloudSession = (storeId?: string): CloudSession | null => {
  const session = readSession();
  if (!session) return null;
  if (storeId && storeId.trim().toLowerCase() !== session.storeId) return null;
  return session;
};

/**
 * Hapus sesi lokal (mis. server membalas 401 — token dicabut karena password diganti).
 * Perangkat yang memang belum pernah login tidak memicu peringatan "sesi dicabut".
 */
export const clearCloudSession = () => {
  if (readSession()) writeSession(null);
};

export const normalizeStoreId = (storeId: string) => storeId.trim().toLowerCase().replace(/\s+/g, '_');

export const isValidStoreId = (storeId: string) => /^[a-z0-9][a-z0-9_-]{2,63}$/.test(storeId);

export const buildApiUrl = (apiBase: string, path: string) => `${(apiBase || '').replace(/\/+$/, '')}/api/${path.replace(/^\/+/, '')}`;

const deviceLabel = () => {
  const agent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const platform = /Android/i.test(agent) ? 'Android' : /iPhone|iPad/i.test(agent) ? 'iOS' : /Windows/i.test(agent) ? 'Windows' : /Mac/i.test(agent) ? 'Mac' : 'Perangkat';
  return `${platform} • ${new Date().toLocaleDateString('id-ID')}`;
};

const request = async (url: string, init: RequestInit) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { response, data: data as Record<string, any> };
  } catch {
    throw new Error('Tidak bisa menghubungi server cloud. Periksa koneksi internet.');
  } finally {
    clearTimeout(timer);
  }
};

/** Cek server & apakah proxy AI tersedia. */
export const checkCloudHealth = async (apiBase: string) => {
  const { response, data } = await request(buildApiUrl(apiBase, 'health'), { method: 'GET' });
  if (!response.ok || data.ok !== true) throw new Error(`Server cloud tidak merespons dengan benar (HTTP ${response.status}).`);
  return { ai: Boolean(data.ai) };
};

const refreshAiAvailability = async (apiBase: string) => {
  try {
    setCloudAiAvailable((await checkCloudHealth(apiBase)).ai);
  } catch { /* abaikan — AI opsional */ }
};

const finishLogin = (storeId: string, data: Record<string, any>, apiBase: string) => {
  const session: CloudSession = { storeId, token: String(data.token), email: String(data.email || ''), connectedAt: new Date().toISOString() };
  writeSession(session);
  void refreshAiAvailability(apiBase);
  return session;
};

const failure = (data: Record<string, any>, status: number, fallback: string) =>
  new Error(String(data.message || '') || `${fallback} (HTTP ${status}).`);

/** Login perangkat ke cloud toko. */
export const signInCloud = async (apiBase: string, storeIdRaw: string, email: string, password: string): Promise<CloudSession> => {
  const storeId = normalizeStoreId(storeIdRaw);
  if (!isValidStoreId(storeId)) throw new Error('Store ID belum diisi dengan benar di Pengaturan → Cloud Sync.');
  const { response, data } = await request(buildApiUrl(apiBase, `stores/${encodeURIComponent(storeId)}/login`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password, label: deviceLabel() }),
  });
  if (!response.ok || !data.token) throw failure(data, response.status, 'Login cloud gagal');
  return finishLogin(storeId, data, apiBase);
};

/** Daftarkan toko baru di cloud (sekali, oleh owner) memakai kode pendaftaran server. */
export const registerCloudStore = async (apiBase: string, storeIdRaw: string, email: string, password: string, setupKey: string): Promise<CloudSession> => {
  const storeId = normalizeStoreId(storeIdRaw);
  if (!isValidStoreId(storeId)) throw new Error('Store ID hanya huruf kecil, angka, - atau _ (3–64 karakter).');
  const { response, data } = await request(buildApiUrl(apiBase, `stores/${encodeURIComponent(storeId)}/register`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Setup-Key': setupKey.trim() },
    body: JSON.stringify({ email: email.trim(), password, label: deviceLabel() }),
  });
  if (!response.ok || !data.token) throw failure(data, response.status, 'Pendaftaran toko gagal');
  return finishLogin(storeId, data, apiBase);
};

export const signOutCloud = async (apiBase: string) => {
  const session = readSession();
  writeSession(null);
  if (session) {
    await request(buildApiUrl(apiBase, `stores/${encodeURIComponent(session.storeId)}/logout`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}` },
    }).catch(() => undefined);
  }
};

/** Ganti password akun cloud. Semua perangkat lain keluar; perangkat ini tetap login. */
export const changeCloudPassword = async (apiBase: string, currentPassword: string, newPassword: string) => {
  const session = readSession();
  if (!session) throw new Error('Perangkat belum login cloud.');
  const { response, data } = await request(buildApiUrl(apiBase, `stores/${encodeURIComponent(session.storeId)}/password`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!response.ok || !data.token) throw failure(data, response.status, 'Ganti password gagal');
  writeSession({ ...session, token: String(data.token) });
};

/** Header otorisasi untuk toko aktif (kosong bila belum login). */
export const getCloudAuthHeaders = (storeId: string, contentType?: string): Record<string, string> => {
  const session = getCloudSession(storeId);
  const headers: Record<string, string> = {};
  if (session) headers.Authorization = `Bearer ${session.token}`;
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
};

/** Respons yang menandakan perangkat belum login / sesinya dicabut. */
export const isCloudAuthErrorResponse = (response: Response) => response.status === 401;

export const isCloudAuthError = (error: unknown) => String((error as any)?.message || '').startsWith(CLOUD_AUTH_REQUIRED);
