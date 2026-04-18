import { getCloudConfig, getSavedDbList } from './syncService';
import { getEnvConfig } from './appConfig';

export type CloudProfile = {
  storeId: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseBucket?: string;
  // legacy aliases
  url?: string;
  token?: string;
  enabled: boolean;
  openRouterApiKey?: string;
  aiModel?: string;
  displayName?: string;
  region?: string;
  isFromEnv?: boolean;
};

const isLegacyCloudProfile = (profile: Partial<CloudProfile>) =>
  Boolean(profile.enabled && (profile.supabaseUrl || profile.url) && (profile.supabaseAnonKey || profile.token));

export const getCloudProfileLabel = (profile: Pick<CloudProfile, 'displayName' | 'storeId'>) =>
  profile.displayName?.trim() || profile.storeId;

export const getCloudProfileRegion = (profile: Pick<CloudProfile, 'region'>) =>
  profile.region?.trim() || 'Cloud';

export const normalizeCloudProfile = <T extends Partial<CloudProfile>>(profile: T) => {
  const legacyDefaults = isLegacyCloudProfile(profile)
    ? {
        displayName: profile.displayName?.trim() || 'PUSAT',
        region: profile.region?.trim() || 'Pusat',
      }
    : {
        displayName: profile.displayName?.trim() || profile.storeId,
        region: profile.region?.trim() || 'Cloud',
      };

  return {
    ...profile,
    ...legacyDefaults,
  };
};

export const getCloudProfiles = (): CloudProfile[] => {
  const activeConfig = getCloudConfig();
  const envConfig = getEnvConfig();
  const merged = new Map<string, CloudProfile>();

  // Use environment stores first (highest priority)
  envConfig.stores.forEach((store, idx) => {
    merged.set(store.storeId, {
      ...store,
      enabled: true,
      isFromEnv: true,
    });
  });

  // Then add saved DB list (only if not already overridden by env)
  getSavedDbList().forEach((profile: any) => {
    if (!profile?.storeId || !profile?.enabled) return;
    if (merged.has(profile.storeId)) return; // Don't override env

    const hasSupabaseCreds = Boolean(profile.supabaseUrl || profile.url) && Boolean(profile.supabaseAnonKey || profile.token);
    if (!hasSupabaseCreds) return;
    merged.set(profile.storeId, normalizeCloudProfile(profile));
  });

  // Ensure active config is in the list
  if (activeConfig.enabled && activeConfig.storeId && !merged.has(activeConfig.storeId)) {
    merged.set(activeConfig.storeId, normalizeCloudProfile(activeConfig));
  }

  // Sort: Env first, then alpha
  return Array.from(merged.values()).sort((left, right) => {
    if (left.isFromEnv && !right.isFromEnv) return -1;
    if (!left.isFromEnv && right.isFromEnv) return 1;
    return getCloudProfileLabel(left).localeCompare(getCloudProfileLabel(right), 'id-ID');
  });
};
