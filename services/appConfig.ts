/**
 * Konfigurasi dari env build (Vite). Backend cloud = Cloudflare Worker di domain yang sama
 * (`/api/*`), jadi tidak ada URL/kunci rahasia yang perlu ditanam di aplikasi.
 */
export interface EnvAppConfig {
  openRouterApiKey: string;
  openRouterModel: string;
  allowRuntimeSettings: boolean;
  /** Store ID bawaan (opsional) — perangkat baru langsung memakai toko ini. */
  storeId: string;
  storeName: string;
  /** Kosong = API di domain yang sama (normal di Cloudflare). Isi hanya jika API di domain lain. */
  cloudApiUrl: string;
  cloudEnabled: boolean;
}

const normalizeBoolean = (value?: string, defaultValue = false) => {
  if (!value) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

export const getEnvConfig = (): EnvAppConfig => {
  const storeId = (import.meta.env.VITE_STORE_ID || '').trim().toLowerCase();
  return {
    openRouterApiKey: (import.meta.env.VITE_OPENROUTER_API_KEY || '').trim(),
    openRouterModel: (import.meta.env.VITE_OPENROUTER_MODEL || 'openrouter/auto').trim(),
    allowRuntimeSettings: normalizeBoolean(import.meta.env.VITE_ALLOW_RUNTIME_SETTINGS, true),
    storeId,
    storeName: (import.meta.env.VITE_STORE_NAME || '').trim(),
    cloudApiUrl: (import.meta.env.VITE_CLOUD_API_URL || '').trim().replace(/\/+$/, ''),
    cloudEnabled: Boolean(storeId) && normalizeBoolean(import.meta.env.VITE_CLOUD_ENABLED, true),
  };
};

/** Toko ditetapkan lewat env build (perangkat tidak perlu mengisi Store ID). */
export const hasEnvCloudConfig = () => getEnvConfig().cloudEnabled;

export const isRuntimeSettingsAllowed = () => getEnvConfig().allowRuntimeSettings;

/** Penanda kunci AI saat AI memakai proxy server (kunci OpenRouter tersimpan aman sebagai secret Worker). */
export const CLOUD_AI_PROXY_KEY = 'cloudflare-ai-proxy';
const CLOUD_AI_FLAG = 'POS_CLOUD_AI_AVAILABLE';

export const setCloudAiAvailable = (available: boolean) => {
  try {
    if (available) localStorage.setItem(CLOUD_AI_FLAG, '1');
    else localStorage.removeItem(CLOUD_AI_FLAG);
  } catch { /* storage diblokir */ }
};

const isCloudAiAvailable = () => {
  try { return localStorage.getItem(CLOUD_AI_FLAG) === '1'; } catch { return false; }
};

/**
 * Kunci OpenRouter: dari pengaturan perangkat, lalu env build, lalu proxy AI server
 * (bila server punya OPENROUTER_API_KEY dan perangkat sudah login cloud).
 */
export const getResolvedOpenRouterApiKey = (runtimeValue?: string) => {
  if (runtimeValue && runtimeValue.trim()) return runtimeValue.trim();
  const envKey = getEnvConfig().openRouterApiKey;
  if (envKey) return envKey;
  return isCloudAiAvailable() ? CLOUD_AI_PROXY_KEY : '';
};

export const getResolvedOpenRouterModel = (runtimeValue?: string) => {
  if (runtimeValue && runtimeValue.trim()) return runtimeValue.trim();
  return getEnvConfig().openRouterModel || 'openrouter/auto';
};
