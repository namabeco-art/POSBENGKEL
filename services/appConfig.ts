export interface EnvAppConfig {
  openRouterApiKey: string;
  openRouterModel: string;
  storeId: string;
  cloudEnabled: boolean;
  allowRuntimeSettings: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseBucket: string;
}

const normalizeBoolean = (value?: string, defaultValue = false) => {
  if (!value) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

export const getEnvConfig = (): EnvAppConfig => ({
  openRouterApiKey: (import.meta.env.VITE_OPENROUTER_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '').trim(),
  openRouterModel: (import.meta.env.VITE_OPENROUTER_MODEL || 'openrouter/auto').trim(),
  storeId: (import.meta.env.VITE_STORE_ID || '').trim(),
  cloudEnabled: normalizeBoolean(import.meta.env.VITE_CLOUD_ENABLED, false),
  allowRuntimeSettings: normalizeBoolean(import.meta.env.VITE_ALLOW_RUNTIME_SETTINGS, true),
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL || '').trim(),
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim(),
  supabaseBucket: (import.meta.env.VITE_SUPABASE_BUCKET || 'erp-media').trim(),
});

export const hasEnvCloudConfig = () => {
  const env = getEnvConfig();
  return Boolean(env.cloudEnabled && env.supabaseUrl && env.supabaseAnonKey && env.storeId);
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
