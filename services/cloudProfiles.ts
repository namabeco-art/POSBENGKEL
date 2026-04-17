import { getCloudConfig, getSavedDbList } from './syncService';

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
  const merged = new Map<string, CloudProfile>();

  getSavedDbList().forEach((profile: any) => {
    if (!profile?.storeId || !profile?.enabled) return;
    const hasSupabaseCreds = Boolean(profile.supabaseUrl || profile.url) && Boolean(profile.supabaseAnonKey || profile.token);
    if (!hasSupabaseCreds) return;
    merged.set(profile.storeId, normalizeCloudProfile(profile));
  });

  if (activeConfig.enabled && activeConfig.storeId) {
    merged.set(activeConfig.storeId, normalizeCloudProfile(activeConfig));
  }

  return Array.from(merged.values()).sort((left, right) =>
    getCloudProfileLabel(left).localeCompare(getCloudProfileLabel(right), 'id-ID'),
  );
};
