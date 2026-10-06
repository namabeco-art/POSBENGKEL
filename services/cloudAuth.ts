/**
 * Login perangkat ke cloud toko (Supabase Auth) — tanpa dependency tambahan, memakai REST API GoTrue.
 *
 * Model keamanan: data toko di Supabase Storage hanya bisa dibaca/ditulis oleh akun yang terdaftar
 * sebagai anggota workspace (lihat supabase/setup.sql). Owner membuat satu akun cloud (email + password)
 * untuk toko, lalu tiap perangkat login sekali. Login staf (admin/kasir/gudang) tetap seperti biasa.
 */

const SESSION_KEY = 'POS_CLOUD_SESSION';
/** Token diperbarui jika sisa masa berlakunya kurang dari ini. */
const REFRESH_MARGIN_MS = 60_000;
const AUTH_TIMEOUT_MS = 15_000;

export interface CloudSession {
  /** URL project Supabase pemilik sesi — sesi tidak dipakai untuk project lain. */
  url: string;
  accessToken: string;
  refreshToken: string;
  /** Epoch ms saat access token kedaluwarsa. */
  expiresAt: number;
  email: string;
  userId: string;
}

const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '');

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
  listeners.forEach(listener => listener(session));
};

const listeners = new Set<(session: CloudSession | null) => void>();

/** Dipanggil saat sesi berubah (login, logout, sesi kedaluwarsa). */
export const onCloudSessionChange = (listener: (session: CloudSession | null) => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** Sesi aktif untuk project Supabase tertentu (atau null). */
export const getCloudSession = (url?: string): CloudSession | null => {
  const session = readSession();
  if (!session) return null;
  if (url && normalizeUrl(url) !== session.url) return null;
  return session;
};

const authRequest = async (baseUrl: string, anonKey: string, path: string, body: unknown, accessToken?: string) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    const response = await fetch(`${normalizeUrl(baseUrl)}/auth/v1/${path}`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
};

const toSession = (url: string, data: any): CloudSession => ({
  url: normalizeUrl(url),
  accessToken: data.access_token,
  refreshToken: data.refresh_token,
  expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  email: data.user?.email || '',
  userId: data.user?.id || '',
});

/** Login perangkat ke cloud toko dengan email & password akun Supabase. */
export const signInCloud = async (url: string, anonKey: string, email: string, password: string): Promise<CloudSession> => {
  if (!url || !anonKey) throw new Error('Isi URL & anon key Supabase dulu di Pengaturan.');
  let result;
  try {
    result = await authRequest(url, anonKey, 'token?grant_type=password', { email: email.trim(), password });
  } catch {
    throw new Error('Tidak bisa menghubungi server cloud. Periksa koneksi internet.');
  }
  const { response, data } = result;
  if (!response.ok || !data?.access_token) {
    const message = String(data?.error_description || data?.msg || data?.message || '');
    if (/invalid login credentials/i.test(message)) throw new Error('Email atau password cloud salah.');
    if (/email not confirmed/i.test(message)) throw new Error('Email akun cloud belum dikonfirmasi di Supabase.');
    throw new Error(`Login cloud gagal${message ? `: ${message}` : ` (HTTP ${response.status})`}.`);
  }
  const session = toSession(url, data);
  writeSession(session);
  return session;
};

export const signOutCloud = async (anonKey?: string) => {
  const session = readSession();
  writeSession(null);
  if (session && anonKey) {
    await authRequest(session.url, anonKey, 'logout', {}, session.accessToken).catch(() => undefined);
  }
};

let refreshing: Promise<string | null> | null = null;

/**
 * Access token yang masih berlaku untuk project ini, diperbarui otomatis bila hampir kedaluwarsa.
 * Mengembalikan null bila perangkat belum login (request memakai anon key dan akan ditolak RLS).
 */
export const getCloudAccessToken = async (url: string, anonKey: string): Promise<string | null> => {
  const session = getCloudSession(url);
  if (!session) return null;
  if (session.expiresAt - Date.now() > REFRESH_MARGIN_MS) return session.accessToken;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const { response, data } = await authRequest(url, anonKey, 'token?grant_type=refresh_token', { refresh_token: session.refreshToken });
        if (!response.ok || !data?.access_token) {
          // Refresh token dicabut/kedaluwarsa: perangkat harus login ulang.
          if (response.status >= 400 && response.status < 500) writeSession(null);
          return null;
        }
        const next = toSession(url, { ...data, user: data.user || { email: session.email, id: session.userId } });
        writeSession(next);
        return next.accessToken;
      } catch {
        // Offline: pakai token lama selagi belum benar-benar kedaluwarsa.
        return session.expiresAt > Date.now() ? session.accessToken : null;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
};

/** Header Supabase: token login perangkat bila ada, kalau tidak anon key (akses publik/legacy). */
export const getSupabaseAuthHeaders = async (url: string, anonKey: string, contentType?: string): Promise<Record<string, string>> => {
  const token = await getCloudAccessToken(url, anonKey);
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${token || anonKey}`,
  };
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
};

export const CLOUD_AUTH_REQUIRED = 'CLOUD_AUTH_REQUIRED';

/** Respons yang menandakan akses ditolak RLS / perangkat belum login. */
export const isCloudAuthErrorResponse = async (response: Response): Promise<boolean> => {
  if (response.status === 401 || response.status === 403) return true;
  if (response.status !== 400) return false;
  const body = await response.clone().text().catch(() => '');
  return /row-level security|unauthorized|"statusCode"\s*:\s*"?40[13]|jwt expired|invalid jwt/i.test(body);
};

export const isCloudAuthError = (error: unknown) => String((error as any)?.message || '').startsWith(CLOUD_AUTH_REQUIRED);
