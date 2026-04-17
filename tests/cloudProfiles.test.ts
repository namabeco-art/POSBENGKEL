import { describe, expect, it } from 'vitest';
import { getCloudProfileLabel, getCloudProfileRegion, normalizeCloudProfile } from '../services/cloudProfiles';

describe('cloudProfiles', () => {
  it('uses display name when available', () => {
    expect(getCloudProfileLabel({ displayName: 'Bekasi Barat', storeId: 'bekasi_barat' })).toBe('Bekasi Barat');
  });

  it('falls back to store id and default region', () => {
    expect(getCloudProfileLabel({ storeId: 'sumatra_hub' })).toBe('sumatra_hub');
    expect(getCloudProfileRegion({})).toBe('Cloud');
  });

  it('maps legacy cloud configs to PUSAT automatically', () => {
    const normalized = normalizeCloudProfile({
      storeId: 'demo_store',
      url: 'https://example.upstash.io',
      token: 'secret',
      enabled: true,
    });

    expect(normalized.displayName).toBe('PUSAT');
    expect(normalized.region).toBe('Pusat');
  });
});
