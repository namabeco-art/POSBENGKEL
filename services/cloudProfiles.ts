import { getCloudConfig, getSavedDbList } from './syncService';
import { getEnvConfig } from './appConfig';

export type CloudProfile = {
  storeId: string;
  enabled: boolean;
  apiBaseUrl?: string;
  openRouterApiKey?: string;
  aiModel?: string;
  displayName?: string;
  region?: string;
  isFromEnv?: boolean;
};

export const getCloudProfileLabel = (profile: Pick<CloudProfile, 'displayName' | 'storeId'>) =>
  profile.displayName?.trim() || profile.storeId;

export const getCloudProfileRegion = (profile: Pick<CloudProfile, 'region'>) =>
  profile.region?.trim() || 'Cloud';

export const normalizeCloudProfile = <T extends Partial<CloudProfile>>(profile: T) => ({
  ...profile,
  displayName: profile.displayName?.trim() || profile.storeId,
  region: profile.region?.trim() || 'Cloud',
});

/** Daftar toko yang pernah dihubungkan perangkat ini (toko dari env build di urutan pertama). */
export const getCloudProfiles = (): CloudProfile[] => {
  const activeConfig = getCloudConfig();
  const env = getEnvConfig();
  const merged = new Map<string, CloudProfile>();

  if (env.cloudEnabled) {
    merged.set(env.storeId, { storeId: env.storeId, enabled: true, displayName: env.storeName || env.storeId, region: 'Cloud', isFromEnv: true });
  }
  getSavedDbList().forEach(profile => {
    if (!profile?.storeId || !profile?.enabled || merged.has(profile.storeId)) return;
    merged.set(profile.storeId, normalizeCloudProfile(profile));
  });
  if (activeConfig.enabled && activeConfig.storeId && !merged.has(activeConfig.storeId)) {
    merged.set(activeConfig.storeId, normalizeCloudProfile(activeConfig));
  }

  return Array.from(merged.values()).sort((left, right) => {
    if (left.isFromEnv && !right.isFromEnv) return -1;
    if (!left.isFromEnv && right.isFromEnv) return 1;
    return getCloudProfileLabel(left).localeCompare(getCloudProfileLabel(right), 'id-ID');
  });
};
