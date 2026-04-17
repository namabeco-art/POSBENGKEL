import { MediaAsset } from '../types';
import { getResolvedSupabaseAnonKey, getResolvedSupabaseBucket, getResolvedSupabaseUrl } from './appConfig';
import { getCloudConfig } from './syncService';

const sanitizeBaseUrl = (url: string) => url.replace(/\/+$/, '');

const buildHeaders = (anonKey: string, contentType?: string) => {
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  };
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
};

const createStoragePath = (storeId: string, fileName: string) => {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${storeId || 'default'}/${stamp}-${safeName}`;
};

export const isSupabaseMediaConfigured = () => {
  const config = getCloudConfig();
  const baseUrl = getResolvedSupabaseUrl((config as any).supabaseUrl);
  const anonKey = getResolvedSupabaseAnonKey((config as any).supabaseAnonKey);
  const bucket = getResolvedSupabaseBucket((config as any).supabaseBucket);
  return Boolean(baseUrl && anonKey && bucket);
};

export const uploadMediaToSupabase = async (
  file: File,
  uploadedBy: string,
  meta?: Partial<MediaAsset>,
): Promise<MediaAsset> => {
  const config = getCloudConfig();
  const baseUrl = sanitizeBaseUrl(getResolvedSupabaseUrl((config as any).supabaseUrl));
  const anonKey = getResolvedSupabaseAnonKey((config as any).supabaseAnonKey);
  const bucket = getResolvedSupabaseBucket((config as any).supabaseBucket);
  const storeId = config.storeId || 'default';

  if (!baseUrl || !anonKey || !bucket) {
    throw new Error('SUPABASE_MEDIA_NOT_CONFIGURED');
  }

  const storagePath = createStoragePath(storeId, file.name);
  const uploadUrl = `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${storagePath}`;
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      ...buildHeaders(anonKey, file.type || 'application/octet-stream'),
      'x-upsert': 'false',
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => '');
    throw new Error(`SUPABASE_UPLOAD_FAILED::${uploadResponse.status} ${detail}`);
  }

  const signedResponse = await fetch(`${baseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${storagePath}`, {
    method: 'POST',
    headers: buildHeaders(anonKey, 'application/json'),
    body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 7 }),
  });
  const signedData = await signedResponse.json().catch(() => ({}));
  const signedUrl = signedData?.signedURL ? `${baseUrl}/storage/v1${signedData.signedURL}` : undefined;

  return {
    id: `MEDIA-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
    supplierName: meta?.supplierName,
    effectiveDate: meta?.effectiveDate,
    category: meta?.category || 'OTHER',
    notes: meta?.notes || '',
    extractedText: meta?.extractedText,
    sourceType: 'supabase',
    storagePath,
    signedUrl,
    useAsKnowledge: meta?.useAsKnowledge ?? true,
  };
};

export const refreshSupabaseSignedUrl = async (asset: MediaAsset): Promise<string | undefined> => {
  if (!asset.storagePath) return asset.signedUrl;
  const config = getCloudConfig();
  const baseUrl = sanitizeBaseUrl(getResolvedSupabaseUrl((config as any).supabaseUrl));
  const anonKey = getResolvedSupabaseAnonKey((config as any).supabaseAnonKey);
  const bucket = getResolvedSupabaseBucket((config as any).supabaseBucket);
  if (!baseUrl || !anonKey || !bucket) return asset.signedUrl;

  const signedResponse = await fetch(`${baseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${asset.storagePath}`, {
    method: 'POST',
    headers: buildHeaders(anonKey, 'application/json'),
    body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 7 }),
  });
  const signedData = await signedResponse.json().catch(() => ({}));
  if (signedData?.signedURL) return `${baseUrl}/storage/v1${signedData.signedURL}`;
  return asset.signedUrl;
};

export const deleteSupabaseMedia = async (asset: MediaAsset): Promise<void> => {
  if (!asset.storagePath) return;
  const config = getCloudConfig();
  const baseUrl = sanitizeBaseUrl(getResolvedSupabaseUrl((config as any).supabaseUrl));
  const anonKey = getResolvedSupabaseAnonKey((config as any).supabaseAnonKey);
  const bucket = getResolvedSupabaseBucket((config as any).supabaseBucket);
  if (!baseUrl || !anonKey || !bucket) return;
  await fetch(`${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${asset.storagePath}`, {
    method: 'DELETE',
    headers: buildHeaders(anonKey),
  }).catch(() => undefined);
};
