import { getEnvConfig, getResolvedOpenRouterApiKey, getResolvedOpenRouterModel, getResolvedSupabaseAnonKey, getResolvedSupabaseBucket, getResolvedSupabaseUrl, hasEnvCloudConfig } from './appConfig';
import { normalizeCloudProfile } from './cloudProfiles';

const STORAGE_CONFIG_KEY = 'HGROUP_CLOUD_CONFIG';
const STORAGE_DB_LIST_KEY = 'HGROUP_SAVED_DB_LIST';

type CloudConfig = {
  storeId: string;
  enabled: boolean;
  openRouterApiKey?: string;
  aiModel?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseBucket?: string;
  displayName?: string;
  region?: string;
  // legacy aliases kept for backward compatibility in existing app flow
  url?: string;
  token?: string;
};

const sanitizeSupabaseUrl = (url: string) => {
  if (!url) return '';
  let cleanUrl = url.trim().replace(/\/+$/, '');
  if (!cleanUrl.startsWith('http')) cleanUrl = `https://${cleanUrl}`;
  return cleanUrl;
};

const withLegacyAliases = (config: CloudConfig): CloudConfig => ({
  ...config,
  url: config.supabaseUrl || config.url || '',
  token: config.supabaseAnonKey || config.token || '',
});

const buildStorageObjectPath = (storeId: string, name: string) => `state/${storeId || 'default'}/${name}`;

const buildStorageObjectUrl = (baseUrl: string, bucket: string, path: string) => {
  const safePath = path.split('/').map(part => encodeURIComponent(part)).join('/');
  return `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${safePath}`;
};

const getSupabaseHeaders = (anonKey: string, contentType?: string) => {
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  };
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getCloudConfig = (): CloudConfig => {
  const envConfig = getEnvConfig();
  const firstEnvStore = envConfig.stores[0];

  try {
    const saved = localStorage.getItem(STORAGE_CONFIG_KEY);
    const runtimeConfig = saved ? JSON.parse(saved) : {};

    const localConfig: CloudConfig = {
      storeId: runtimeConfig.storeId || '',
      enabled: Boolean(runtimeConfig.enabled),
      openRouterApiKey: runtimeConfig.openRouterApiKey || runtimeConfig.geminiApiKey || '',
      aiModel: runtimeConfig.aiModel || '',
      supabaseUrl: runtimeConfig.supabaseUrl || runtimeConfig.url || '',
      supabaseAnonKey: runtimeConfig.supabaseAnonKey || runtimeConfig.token || '',
      supabaseBucket: runtimeConfig.supabaseBucket || '',
      displayName: runtimeConfig.displayName || '',
      region: runtimeConfig.region || '',
    };

    // If environment configuration is present
    if (hasEnvCloudConfig()) {
      // If we have a runtime selection, check if it matches an env store for overriding credentials
      const matchingEnv = envConfig.stores.find(s => s.storeId === localConfig.storeId);
      
      const base = matchingEnv || firstEnvStore;

      return withLegacyAliases(normalizeCloudProfile({
        storeId: localConfig.storeId || base.storeId,
        enabled: localConfig.enabled || true, // env-driven usually means enabled
        openRouterApiKey: getResolvedOpenRouterApiKey(localConfig.openRouterApiKey),
        aiModel: getResolvedOpenRouterModel(localConfig.aiModel),
        supabaseUrl: sanitizeSupabaseUrl(matchingEnv?.supabaseUrl || getResolvedSupabaseUrl(localConfig.supabaseUrl)),
        supabaseAnonKey: matchingEnv?.supabaseAnonKey || getResolvedSupabaseAnonKey(localConfig.supabaseAnonKey),
        supabaseBucket: matchingEnv?.supabaseBucket || getResolvedSupabaseBucket(localConfig.supabaseBucket),
        displayName: localConfig.displayName || matchingEnv?.displayName || base.displayName,
        region: localConfig.region || matchingEnv?.region || base.region,
      }));
    }

    return withLegacyAliases(normalizeCloudProfile({
      ...localConfig,
      openRouterApiKey: getResolvedOpenRouterApiKey(localConfig.openRouterApiKey),
      aiModel: getResolvedOpenRouterModel(localConfig.aiModel),
      supabaseUrl: sanitizeSupabaseUrl(getResolvedSupabaseUrl(localConfig.supabaseUrl)),
      supabaseAnonKey: getResolvedSupabaseAnonKey(localConfig.supabaseAnonKey),
      supabaseBucket: getResolvedSupabaseBucket(localConfig.supabaseBucket),
    }));
  } catch {
    const base = firstEnvStore || {
      storeId: envConfig.storeId,
      supabaseUrl: envConfig.supabaseUrl,
      supabaseAnonKey: envConfig.supabaseAnonKey,
      supabaseBucket: envConfig.supabaseBucket,
      displayName: '',
      region: '',
    };

    return withLegacyAliases(normalizeCloudProfile({
      storeId: base.storeId,
      enabled: envConfig.cloudEnabled || Boolean(firstEnvStore),
      openRouterApiKey: envConfig.openRouterApiKey,
      aiModel: envConfig.openRouterModel,
      supabaseUrl: sanitizeSupabaseUrl(base.supabaseUrl),
      supabaseAnonKey: base.supabaseAnonKey,
      supabaseBucket: base.supabaseBucket,
      displayName: base.displayName || '',
      region: base.region || '',
    }));
  }
};

export const hasCloudConfig = (): boolean => {
  const config = getCloudConfig();
  return Boolean(config.enabled && config.storeId && config.supabaseUrl && config.supabaseAnonKey);
};

export const saveCloudConfig = (config: any) => {
  const envConfig = getEnvConfig();
  if (!envConfig.allowRuntimeSettings && hasEnvCloudConfig()) return;

  const previousConfig = getCloudConfig();
  const finalConfig = withLegacyAliases(normalizeCloudProfile({
    ...config,
    enabled: Boolean(config.enabled),
    supabaseUrl: sanitizeSupabaseUrl(config.supabaseUrl || config.url || ''),
    supabaseAnonKey: config.supabaseAnonKey || config.token || '',
    supabaseBucket: config.supabaseBucket || 'erp-media',
  }));

  if (!finalConfig.enabled && previousConfig.enabled && previousConfig.storeId) {
    saveToDbList(previousConfig);
  }

  localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(finalConfig));
  if (finalConfig.enabled) saveToDbList(finalConfig);
};

export const getSavedDbList = (): CloudConfig[] => {
  try {
    const saved = localStorage.getItem(STORAGE_DB_LIST_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

export const saveToDbList = (config: CloudConfig) => {
  const envConfig = getEnvConfig();
  if (!envConfig.allowRuntimeSettings && hasEnvCloudConfig()) return;
  if (!config.storeId) return;

  const normalized = withLegacyAliases(normalizeCloudProfile({
    ...config,
    supabaseUrl: sanitizeSupabaseUrl(config.supabaseUrl || config.url || ''),
    supabaseAnonKey: config.supabaseAnonKey || config.token || '',
    supabaseBucket: config.supabaseBucket || 'erp-media',
  }));

  const list = getSavedDbList();
  const index = list.findIndex(item => item.storeId === normalized.storeId);
  if (index >= 0) list[index] = normalized;
  else list.push(normalized);
  localStorage.setItem(STORAGE_DB_LIST_KEY, JSON.stringify(list));
};

export const deleteFromDbList = (storeId: string) => {
  const envConfig = getEnvConfig();
  if (!envConfig.allowRuntimeSettings && hasEnvCloudConfig()) return;
  const list = getSavedDbList().filter(item => item.storeId !== storeId);
  localStorage.setItem(STORAGE_DB_LIST_KEY, JSON.stringify(list));
};

export const pushConfigToCloud = async (config: CloudConfig) => {
  const baseUrl = sanitizeSupabaseUrl(config.supabaseUrl || config.url || '');
  const anonKey = config.supabaseAnonKey || config.token || '';
  const bucket = config.supabaseBucket || 'erp-media';
  if (!baseUrl || !anonKey || !config.storeId) return null;

  const path = buildStorageObjectPath(config.storeId, 'config-ai.json');
  const payload = JSON.stringify({
    openRouterApiKey: config.openRouterApiKey || '',
    aiModel: config.aiModel || 'openrouter/auto',
    supabaseUrl: baseUrl,
    supabaseAnonKey: anonKey,
    supabaseBucket: bucket,
    updatedAt: new Date().toISOString(),
  });

  const response = await fetch(buildStorageObjectUrl(baseUrl, bucket, path), {
    method: 'POST',
    headers: {
      ...getSupabaseHeaders(anonKey, 'application/json'),
      'x-upsert': 'true',
    },
    body: payload,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Gagal menyimpan konfigurasi Supabase Cloud. ${detail}`);
  }

  return response.json().catch(() => ({ success: true }));
};

export const applyActivationCode = (code: string): boolean => {
  try {
    const decoded = JSON.parse(atob(code));
    const supabaseUrl = decoded.su || decoded.u || '';
    const supabaseAnonKey = decoded.sk || decoded.t || '';
    if (supabaseUrl && supabaseAnonKey && decoded.s) {
      saveCloudConfig({
        storeId: decoded.s,
        enabled: true,
        openRouterApiKey: decoded.or || decoded.g || '',
        aiModel: decoded.m || 'openrouter/auto',
        supabaseUrl,
        supabaseAnonKey,
        supabaseBucket: decoded.sb || 'erp-media',
        displayName: decoded.n || '',
        region: decoded.r || '',
      });
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

export const generateActivationCode = (): string => {
  const config = getCloudConfig();
  return generateActivationCodeForConfig(config);
};

export const generateActivationCodeForConfig = (config: CloudConfig): string => {
  const supabaseUrl = config.supabaseUrl || config.url || '';
  const supabaseAnonKey = config.supabaseAnonKey || config.token || '';
  if (!supabaseUrl || !supabaseAnonKey) return '';
  const payload = {
    su: supabaseUrl,
    sk: supabaseAnonKey,
    sb: config.supabaseBucket || 'erp-media',
    s: config.storeId,
    or: config.openRouterApiKey,
    m: config.aiModel,
    n: config.displayName || config.storeId,
    r: config.region || 'Cloud',
  };
  return btoa(JSON.stringify(payload));
};

const secureEncode = (data: any) => {
  const str = JSON.stringify(data);
  return btoa(unescape(encodeURIComponent(str)));
};

const secureDecode = (base64: string) => {
  try {
    const str = decodeURIComponent(escape(atob(base64)));
    return JSON.parse(str);
  } catch {
    return null;
  }
};

export const sanitizeUrl = sanitizeSupabaseUrl;

export const smartTestConnection = async (
  inputUrl: string,
  inputToken: string,
): Promise<{
  success: boolean;
  message: string;
  diagCode: 'OK' | 'CORS_ERROR' | 'AUTH_ERROR' | 'NOT_FOUND' | 'GENERIC_ERROR';
  finalUrl: string;
  finalToken: string;
}> => {
  const url = sanitizeSupabaseUrl(inputUrl);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${url}/auth/v1/health`, {
      headers: getSupabaseHeaders(inputToken),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return {
        success: true,
        message: 'Koneksi Supabase berhasil.',
        diagCode: 'OK',
        finalUrl: url,
        finalToken: inputToken,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        message: 'Anon key Supabase tidak valid.',
        diagCode: 'AUTH_ERROR',
        finalUrl: url,
        finalToken: inputToken,
      };
    }

    if (response.status === 404) {
      return {
        success: false,
        message: 'Endpoint Supabase tidak ditemukan. Cek project URL.',
        diagCode: 'NOT_FOUND',
        finalUrl: url,
        finalToken: inputToken,
      };
    }

    return {
      success: false,
      message: `HTTP Error ${response.status}`,
      diagCode: 'GENERIC_ERROR',
      finalUrl: url,
      finalToken: inputToken,
    };
  } catch {
    return {
      success: false,
      message: 'CORS/Network Error.',
      diagCode: 'CORS_ERROR',
      finalUrl: url,
      finalToken: inputToken,
    };
  }
};

export const withCloudInventoryLock = async <T>(
  task: () => Promise<T>,
  options?: { maxRetries?: number; retryMs?: number; lockTtlMs?: number },
): Promise<T> => {
  const config = getCloudConfig();
  const baseUrl = sanitizeSupabaseUrl(config.supabaseUrl || config.url || '');
  const anonKey = config.supabaseAnonKey || config.token || '';
  const bucket = config.supabaseBucket || 'erp-media';
  const storeId = config.storeId || 'default';

  if (!config.enabled || !baseUrl || !anonKey) {
    return task();
  }

  const maxRetries = options?.maxRetries ?? 20;
  const retryMs = options?.retryMs ?? 300;
  const lockTtlMs = options?.lockTtlMs ?? 15000;
  const lockPath = buildStorageObjectPath(storeId, 'locks/inventory.lock.json');
  const lockUrl = buildStorageObjectUrl(baseUrl, bucket, lockPath);
  const owner = `client-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
  let acquired = false;

  for (let i = 0; i < maxRetries; i += 1) {
    const payload = JSON.stringify({
      owner,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + lockTtlMs).toISOString(),
    });

    const createRes = await fetch(lockUrl, {
      method: 'POST',
      headers: {
        ...getSupabaseHeaders(anonKey, 'application/json'),
        'x-upsert': 'false',
      },
      body: payload,
    });

    if (createRes.ok) {
      acquired = true;
      break;
    }

    const lockDataRes = await fetch(lockUrl, {
      headers: getSupabaseHeaders(anonKey),
    });
    if (lockDataRes.ok) {
      const lockRaw = await lockDataRes.text().catch(() => '');
      try {
        const lockData = JSON.parse(lockRaw);
        const expiresAt = new Date(lockData?.expiresAt || 0).getTime();
        if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt < Date.now()) {
          await fetch(lockUrl, {
            method: 'DELETE',
            headers: getSupabaseHeaders(anonKey),
          }).catch(() => undefined);
        }
      } catch {
        // ignore parse error and continue retry.
      }
    }

    await sleep(retryMs);
  }

  if (!acquired) {
    throw new Error('STOCK_LOCK_TIMEOUT::Sistem sedang dipakai kasir lain. Coba lagi beberapa detik.');
  }

  try {
    return await task();
  } finally {
    await fetch(lockUrl, {
      method: 'DELETE',
      headers: getSupabaseHeaders(anonKey),
    }).catch(() => undefined);
  }
};

export const pushToCloud = async (data: any) => {
  const config = getCloudConfig();
  const baseUrl = sanitizeSupabaseUrl(config.supabaseUrl || config.url || '');
  const anonKey = config.supabaseAnonKey || config.token || '';
  const bucket = config.supabaseBucket || 'erp-media';
  if (!config.enabled || !baseUrl || !anonKey || !config.storeId) return null;

  const path = buildStorageObjectPath(config.storeId, 'app-data.txt');
  const encodedData = secureEncode(data);

  const response = await fetch(buildStorageObjectUrl(baseUrl, bucket, path), {
    method: 'POST',
    headers: {
      ...getSupabaseHeaders(anonKey, 'text/plain'),
      'x-upsert': 'true',
    },
    body: encodedData,
  });

  if (!response.ok) throw new Error(`SUPABASE_PUSH_FAILED_${response.status}`);
  return response.json().catch(() => ({ success: true }));
};

export const pullFromCloud = async () => {
  const config = getCloudConfig();
  const baseUrl = sanitizeSupabaseUrl(config.supabaseUrl || config.url || '');
  const anonKey = config.supabaseAnonKey || config.token || '';
  const bucket = config.supabaseBucket || 'erp-media';
  if (!config.enabled || !baseUrl || !anonKey || !config.storeId) return null;

  const path = buildStorageObjectPath(config.storeId, 'app-data.txt');
  const response = await fetch(buildStorageObjectUrl(baseUrl, bucket, path), {
    headers: getSupabaseHeaders(anonKey),
  });
  if (!response.ok) return null;
  const encodedData = await response.text().catch(() => '');
  if (!encodedData) return null;
  return secureDecode(encodedData);
};
