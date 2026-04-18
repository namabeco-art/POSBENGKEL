export interface EnvStoreConfig {
  storeId: string;
  displayName: string;
  region: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseBucket: string;
}

export interface EnvAppConfig {
  openRouterApiKey: string;
  openRouterModel: string;
  stores: EnvStoreConfig[];
  allowRuntimeSettings: boolean;
  // Legacy support for single store
  storeId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseBucket: string;
  cloudEnabled: boolean;
}

const normalizeBoolean = (value?: string, defaultValue = false) => {
  if (!value) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const getEnvStores = (): EnvStoreConfig[] => {
  const stores: EnvStoreConfig[] = [];
  
  // Look for VITE_STORE_n format
  for (let i = 1; i <= 10; i++) {
    const id = import.meta.env[`VITE_STORE_${i}_ID`];
    const url = import.meta.env[`VITE_STORE_${i}_URL`];
    const key = import.meta.env[`VITE_STORE_${i}_ANON_KEY`];
    
    if (id && url && key) {
      stores.push({
        storeId: id.trim(),
        displayName: (import.meta.env[`VITE_STORE_${i}_NAME`] || (i === 1 ? 'PUSAT' : id)).trim(),
        region: (import.meta.env[`VITE_STORE_${i}_REGION`] || (i === 1 ? 'Pusat' : 'Cloud')).trim(),
        supabaseUrl: url.trim(),
        supabaseAnonKey: key.trim(),
        supabaseBucket: (import.meta.env[`VITE_STORE_${i}_BUCKET`] || 'erp-media').trim(),
      });
    }
  }

  // Fallback to legacy single store variables if not already in list
  const legacyId = import.meta.env.VITE_STORE_ID;
  const legacyUrl = import.meta.env.VITE_SUPABASE_URL;
  const legacyKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  
  if (legacyId && legacyUrl && legacyKey && !stores.find(s => s.storeId === legacyId)) {
    stores.push({
      storeId: legacyId.trim(),
      displayName: 'Env Default',
      region: 'Static',
      supabaseUrl: legacyUrl.trim(),
      supabaseAnonKey: legacyKey.trim(),
      supabaseBucket: (import.meta.env.VITE_SUPABASE_BUCKET || 'erp-media').trim(),
    });
  }

  return stores;
};

export const getEnvConfig = (): EnvAppConfig => {
  const stores = getEnvStores();
  const firstStore = stores[0];

  return {
    openRouterApiKey: (import.meta.env.VITE_OPENROUTER_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '').trim(),
    openRouterModel: (import.meta.env.VITE_OPENROUTER_MODEL || 'openrouter/auto').trim(),
    stores,
    allowRuntimeSettings: normalizeBoolean(import.meta.env.VITE_ALLOW_RUNTIME_SETTINGS, true),
    // Fallback/Legacy
    storeId: firstStore?.storeId || (import.meta.env.VITE_STORE_ID || '').trim(),
    supabaseUrl: firstStore?.supabaseUrl || (import.meta.env.VITE_SUPABASE_URL || '').trim(),
    supabaseAnonKey: firstStore?.supabaseAnonKey || (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim(),
    supabaseBucket: firstStore?.supabaseBucket || (import.meta.env.VITE_SUPABASE_BUCKET || 'erp-media').trim(),
    cloudEnabled: Boolean(firstStore) || normalizeBoolean(import.meta.env.VITE_CLOUD_ENABLED, false),
  };
};

export const hasEnvCloudConfig = () => {
  const env = getEnvConfig();
  return env.stores.length > 0;
};

export const isRuntimeSettingsAllowed = () => getEnvConfig().allowRuntimeSettings;

export const getResolvedOpenRouterApiKey = (runtimeValue?: string) => {
  if (runtimeValue && runtimeValue.trim()) return runtimeValue.trim();
  return getEnvConfig().openRouterApiKey;
};

export const getResolvedOpenRouterModel = (runtimeValue?: string) => {
  if (runtimeValue && runtimeValue.trim()) return runtimeValue.trim();
  return getEnvConfig().openRouterModel || 'openrouter/auto';
};

export const getResolvedSupabaseUrl = (runtimeValue?: string) => {
  if (runtimeValue && runtimeValue.trim()) return runtimeValue.trim();
  return getEnvConfig().supabaseUrl;
};

export const getResolvedSupabaseAnonKey = (runtimeValue?: string) => {
  if (runtimeValue && runtimeValue.trim()) return runtimeValue.trim();
  return getEnvConfig().supabaseAnonKey;
};

export const getResolvedSupabaseBucket = (runtimeValue?: string) => {
  if (runtimeValue && runtimeValue.trim()) return runtimeValue.trim();
  return getEnvConfig().supabaseBucket || 'erp-media';
};
