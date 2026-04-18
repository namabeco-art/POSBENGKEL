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
  
  // Explicitly list variables for Vite static analysis
  const configs = [
    {
      id: import.meta.env.VITE_STORE_1_ID,
      name: import.meta.env.VITE_STORE_1_NAME,
      url: import.meta.env.VITE_STORE_1_URL,
      key: import.meta.env.VITE_STORE_1_ANON_KEY,
      region: import.meta.env.VITE_STORE_1_REGION,
      bucket: import.meta.env.VITE_STORE_1_BUCKET
    },
    {
      id: import.meta.env.VITE_STORE_2_ID,
      name: import.meta.env.VITE_STORE_2_NAME,
      url: import.meta.env.VITE_STORE_2_URL,
      key: import.meta.env.VITE_STORE_2_ANON_KEY,
      region: import.meta.env.VITE_STORE_2_REGION,
      bucket: import.meta.env.VITE_STORE_2_BUCKET
    },
    {
      id: import.meta.env.VITE_STORE_3_ID,
      name: import.meta.env.VITE_STORE_3_NAME,
      url: import.meta.env.VITE_STORE_3_URL,
      key: import.meta.env.VITE_STORE_3_ANON_KEY,
      region: import.meta.env.VITE_STORE_3_REGION,
      bucket: import.meta.env.VITE_STORE_3_BUCKET
    },
    {
      id: import.meta.env.VITE_STORE_4_ID,
      name: import.meta.env.VITE_STORE_4_NAME,
      url: import.meta.env.VITE_STORE_4_URL,
      key: import.meta.env.VITE_STORE_4_ANON_KEY,
      region: import.meta.env.VITE_STORE_4_REGION,
      bucket: import.meta.env.VITE_STORE_4_BUCKET
    },
    {
      id: import.meta.env.VITE_STORE_5_ID,
      name: import.meta.env.VITE_STORE_5_NAME,
      url: import.meta.env.VITE_STORE_5_URL,
      key: import.meta.env.VITE_STORE_5_ANON_KEY,
      region: import.meta.env.VITE_STORE_5_REGION,
      bucket: import.meta.env.VITE_STORE_5_BUCKET
    }
  ];

  configs.forEach((c, i) => {
    if (c.id && c.url && c.key) {
      stores.push({
        storeId: c.id.trim(),
        displayName: (c.name || (i === 0 ? 'PUSAT' : c.id)).trim(),
        region: (c.region || (i === 0 ? 'Pusat' : 'Cloud')).trim(),
        supabaseUrl: c.url.trim(),
        supabaseAnonKey: c.key.trim(),
        supabaseBucket: (c.bucket || 'erp-media').trim(),
      });
    }
  });

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
