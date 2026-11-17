/**
 * Sinkronisasi data toko ke Cloudflare (Worker + Durable Object per toko).
 *
 * - Data toko disimpan sebagai satu snapshot terenkode dengan nomor versi.
 * - Setiap penyimpanan membawa versi yang dibaca (compare-and-swap). Jika perangkat lain menyimpan
 *   di antaranya, server membalas 409 dan `syncWithCloud` menarik ulang, menggabungkan, lalu mencoba lagi —
 *   jadi tidak ada perubahan yang tertimpa diam-diam.
 * - Lock singkat (Durable Object) menjaga transaksi stok dari dua kasir tidak saling mendahului.
 */
import { getEnvConfig, hasEnvCloudConfig } from './appConfig';
import { normalizeCloudProfile } from './cloudProfiles';
import { buildApiUrl, CLOUD_AUTH_REQUIRED, clearCloudSession, getCloudAuthHeaders, isValidStoreId, normalizeStoreId } from './cloudAuth';

const STORAGE_CONFIG_KEY = 'HGROUP_CLOUD_CONFIG';
const STORAGE_DB_LIST_KEY = 'HGROUP_SAVED_DB_LIST';

export type CloudConfig = {
  storeId: string;
  enabled: boolean;
  displayName?: string;
  region?: string;
  /** Kosong = API di domain yang sama dengan aplikasi (normal di Cloudflare). */
  apiBaseUrl?: string;
  openRouterApiKey?: string;
  aiModel?: string;
};

export const CLOUD_REQUEST_TIMEOUT_MS = 15000;
const CONFLICT = 'CLOUD_VERSION_CONFLICT';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** fetch dengan batas waktu — agar kasir tidak tertahan "MENYIMPAN..." saat jaringan menggantung. */
const fetchWithTimeout = async (input: string, init: RequestInit = {}, timeoutMs = CLOUD_REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const normalizeConfig = (raw: Partial<CloudConfig>): CloudConfig => normalizeCloudProfile({
  storeId: normalizeStoreId(raw.storeId || ''),
  enabled: Boolean(raw.enabled),
  displayName: raw.displayName || '',
  region: raw.region || '',
  apiBaseUrl: (raw.apiBaseUrl || '').trim().replace(/\/+$/, ''),
  // Simpan nilai mentah; pemakai memanggil getResolvedOpenRouterApiKey() (yang juga mengenali proxy AI server).
  openRouterApiKey: (raw.openRouterApiKey || '').trim(),
  aiModel: (raw.aiModel || '').trim(),
}) as CloudConfig;

export const getCloudConfig = (): CloudConfig => {
  const env = getEnvConfig();
  let saved: Partial<CloudConfig> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_CONFIG_KEY) || '{}');
  } catch { /* konfigurasi rusak diabaikan */ }
  if (hasEnvCloudConfig()) {
    return normalizeConfig({
      ...saved,
      storeId: env.storeId,
      enabled: true,
      displayName: saved.displayName || env.storeName,
      apiBaseUrl: env.cloudApiUrl,
    });
  }
  return normalizeConfig({ ...saved, apiBaseUrl: saved.apiBaseUrl || env.cloudApiUrl });
};

export const getCloudApiBase = () => getCloudConfig().apiBaseUrl || '';

export const hasCloudConfig = (): boolean => {
  const config = getCloudConfig();
  return Boolean(config.enabled && isValidStoreId(config.storeId));
};

export const saveCloudConfig = (config: Partial<CloudConfig>) => {
  const env = getEnvConfig();
  if (!env.allowRuntimeSettings && hasEnvCloudConfig()) return;
  const previous = getCloudConfig();
  const next = normalizeConfig({ ...config, enabled: Boolean(config.enabled) });
  if (!next.enabled && previous.enabled && previous.storeId) saveToDbList(previous);
  localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(next));
  if (next.enabled) saveToDbList(next);
};

export const getSavedDbList = (): CloudConfig[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_DB_LIST_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

export const saveToDbList = (config: CloudConfig) => {
  if (!config.storeId) return;
  const list = getSavedDbList();
  const entry = normalizeConfig(config);
  const index = list.findIndex(item => item.storeId === entry.storeId);
  if (index >= 0) list[index] = entry;
  else list.push(entry);
  localStorage.setItem(STORAGE_DB_LIST_KEY, JSON.stringify(list));
};

export const deleteFromDbList = (storeId: string) => {
  localStorage.setItem(STORAGE_DB_LIST_KEY, JSON.stringify(getSavedDbList().filter(item => item.storeId !== storeId)));
};

/** Kode aktivasi untuk menyiapkan perangkat lain (Store ID + alamat API). Tidak berisi rahasia. */
export const generateActivationCodeForConfig = (config: CloudConfig): string => {
  if (!config.storeId) return '';
  return btoa(JSON.stringify({ s: config.storeId, n: config.displayName || config.storeId, r: config.region || 'Cloud', a: config.apiBaseUrl || '' }));
};

export const generateActivationCode = () => generateActivationCodeForConfig(getCloudConfig());

export const applyActivationCode = (code: string): boolean => {
  try {
    const decoded = JSON.parse(atob(code));
    if (!decoded?.s || !isValidStoreId(normalizeStoreId(decoded.s))) return false;
    saveCloudConfig({ storeId: decoded.s, enabled: true, displayName: decoded.n || '', region: decoded.r || '', apiBaseUrl: decoded.a || '' });
    return true;
  } catch {
    return false;
  }
};

const secureEncode = (data: unknown) => btoa(unescape(encodeURIComponent(JSON.stringify(data))));

const secureDecode = (base64: string) => {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(base64))));
  } catch {
    return null;
  }
};

const activeStore = () => {
  const config = getCloudConfig();
  if (!config.enabled || !isValidStoreId(config.storeId)) return null;
  return { storeId: config.storeId, apiBase: config.apiBaseUrl || '' };
};

const storeUrl = (apiBase: string, storeId: string, path: string) => buildApiUrl(apiBase, `stores/${encodeURIComponent(storeId)}/${path}`);

/** Tolak dengan penanda CLOUD_AUTH_REQUIRED dan hapus sesi lokal yang sudah dicabut server. */
const authFailure = (detail: string) => {
  clearCloudSession();
  return new Error(`${CLOUD_AUTH_REQUIRED}::${detail}`);
};

export interface CloudState {
  data: any | null;
  version: number;
}

/** Ambil snapshot data toko beserta versinya. data = null bila toko belum punya data. */
export const pullStateFromCloud = async (): Promise<CloudState | null> => {
  const store = activeStore();
  if (!store) return null;
  const response = await fetchWithTimeout(storeUrl(store.apiBase, store.storeId, 'state'), { headers: getCloudAuthHeaders(store.storeId) });
  if (response.status === 401) throw authFailure('Perangkat belum login ke cloud toko.');
  // Jangan anggap error server sebagai "cloud kosong" — pemanggil bisa menimpa data cloud.
  if (!response.ok) throw new Error(`CLOUD_PULL_FAILED_${response.status}`);
  const version = Number(response.headers.get('X-State-Version') || '0');
  if (response.status === 204) return { data: null, version };
  const text = await response.text();
  return { data: text ? secureDecode(text) : null, version };
};

/** Data toko dari cloud (tanpa versi). */
export const pullFromCloud = async () => (await pullStateFromCloud())?.data ?? null;

/** Simpan snapshot hanya jika versi cloud masih `baseVersion` (compare-and-swap). */
export const pushStateToCloud = async (data: unknown, baseVersion: number): Promise<number> => {
  const store = activeStore();
  if (!store) throw new Error('Cloud belum diaktifkan.');
  const response = await fetchWithTimeout(storeUrl(store.apiBase, store.storeId, 'state'), {
    method: 'PUT',
    headers: { ...getCloudAuthHeaders(store.storeId, 'text/plain'), 'If-Match': String(baseVersion) },
    body: secureEncode(data),
  }, 30_000);
  if (response.status === 401) throw authFailure('Perangkat belum login ke cloud toko.');
  if (response.status === 409) throw new Error(`${CONFLICT}::Data cloud berubah saat menyimpan.`);
  if (!response.ok) throw new Error(`CLOUD_PUSH_FAILED_${response.status}`);
  return Number(response.headers.get('X-State-Version') || baseVersion + 1);
};

const isConflict = (error: unknown) => String((error as any)?.message || '').startsWith(CONFLICT);

/**
 * Tarik → susun data baru dari data cloud terbaru → simpan dengan compare-and-swap.
 * Jika perangkat lain menyimpan di antaranya, diulang dengan data cloud terbaru (maks. `attempts`).
 * `compose` harus murni (boleh dipanggil berulang). Error dari `compose` diteruskan apa adanya.
 */
export const syncWithCloud = async <T,>(compose: (remote: any | null) => T, attempts = 4): Promise<{ remote: any | null; data: T; version: number }> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const state = await pullStateFromCloud();
    if (!state) throw new Error('Cloud belum diaktifkan.');
    const data = compose(state.data);
    try {
      const version = await pushStateToCloud(data, state.version);
      return { remote: state.data, data, version };
    } catch (error) {
      if (!isConflict(error)) throw error;
      lastError = error;
      await sleep(150 * (attempt + 1));
    }
  }
  throw lastError || new Error('Gagal menyimpan ke cloud: data terus berubah. Coba lagi.');
};

/** Cek koneksi ke server cloud (dipakai di Pengaturan). */
export const testCloudConnection = async (apiBase = getCloudApiBase()) => {
  try {
    const response = await fetchWithTimeout(buildApiUrl(apiBase, 'health'), {}, 10_000);
    const data = await response.json().catch(() => ({}));
    if (response.ok && data?.ok) return { success: true, message: 'Server cloud Cloudflare terhubung.', ai: Boolean(data.ai) };
    return { success: false, message: `Server menjawab HTTP ${response.status}. Periksa alamat API.`, ai: false };
  } catch {
    return { success: false, message: 'Server cloud tidak terjangkau (offline atau alamat salah).', ai: false };
  }
};

/**
 * Jalankan tugas dengan lock toko (Durable Object). Tanpa cloud → langsung dijalankan.
 * Offline/ditolak → melempar error agar pemanggil menyimpan lokal dan sinkron belakangan.
 */
export const withCloudInventoryLock = async <T,>(
  task: () => Promise<T>,
  options?: { maxRetries?: number; retryMs?: number; lockTtlMs?: number },
): Promise<T> => {
  const store = activeStore();
  if (!store) return task();
  const owner = `client-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
  const maxRetries = options?.maxRetries ?? 8;
  const retryMs = options?.retryMs ?? 400;
  const lockUrl = storeUrl(store.apiBase, store.storeId, 'lock');
  let acquired = false;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    let response: Response;
    try {
      response = await fetchWithTimeout(lockUrl, {
        method: 'POST',
        headers: getCloudAuthHeaders(store.storeId, 'application/json'),
        body: JSON.stringify({ owner, ttlMs: options?.lockTtlMs ?? 15_000 }),
      });
    } catch {
      throw new Error('Cloud tidak terjangkau (offline). Transaksi disimpan lokal.');
    }
    if (response.status === 401) throw authFailure('Perangkat belum login ke cloud toko. Transaksi disimpan lokal.');
    if (response.ok) { acquired = true; break; }
    if (response.status !== 423) throw new Error(`Lock cloud gagal (HTTP ${response.status}). Transaksi disimpan lokal.`);
    await sleep(retryMs);
  }
  if (!acquired) throw new Error('Cloud sedang dipakai terminal lain. Transaksi akan disimpan lokal.');
  try {
    return await task();
  } finally {
    await fetchWithTimeout(`${lockUrl}?owner=${encodeURIComponent(owner)}`, { method: 'DELETE', headers: getCloudAuthHeaders(store.storeId) }).catch(() => undefined);
  }
};
