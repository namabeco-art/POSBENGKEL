/** File media toko (foto price list, faktur) di Cloudflare R2 lewat Worker. */
import { MediaAsset } from '../types';
import { getCloudConfig, hasCloudConfig } from './syncService';
import { buildApiUrl, getCloudAuthHeaders, getCloudSession } from './cloudAuth';

const mediaUrl = (path: string) => {
  const config = getCloudConfig();
  return buildApiUrl(config.apiBaseUrl || '', `stores/${encodeURIComponent(config.storeId)}/${path}`);
};

export const isCloudMediaConfigured = () => hasCloudConfig() && Boolean(getCloudSession(getCloudConfig().storeId));

export const uploadMediaToCloud = async (file: File, uploadedBy: string, meta?: Partial<MediaAsset>): Promise<MediaAsset> => {
  const config = getCloudConfig();
  if (!isCloudMediaConfigured()) throw new Error('CLOUD_MEDIA_NOT_CONFIGURED');
  const response = await fetch(mediaUrl(`media?name=${encodeURIComponent(file.name)}`), {
    method: 'POST',
    headers: getCloudAuthHeaders(config.storeId, file.type || 'application/octet-stream'),
    body: file,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.storagePath) throw new Error(`CLOUD_UPLOAD_FAILED::${response.status} ${data.message || ''}`.trim());

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
    sourceType: 'cloud',
    storagePath: data.storagePath,
    signedUrl: data.signedUrl,
    useAsKnowledge: meta?.useAsKnowledge ?? true,
  };
};

/** URL bertanda tangan baru (berlaku 7 hari). */
export const refreshMediaUrl = async (asset: MediaAsset): Promise<string | undefined> => {
  if (!asset.storagePath || !isCloudMediaConfigured()) return asset.signedUrl;
  const config = getCloudConfig();
  const response = await fetch(mediaUrl('media/sign'), {
    method: 'POST',
    headers: getCloudAuthHeaders(config.storeId, 'application/json'),
    body: JSON.stringify({ storagePath: asset.storagePath }),
  }).catch(() => null);
  const data = response ? await response.json().catch(() => ({})) : {};
  return data?.signedUrl || asset.signedUrl;
};

export const deleteCloudMedia = async (asset: MediaAsset): Promise<void> => {
  if (!asset.storagePath || !isCloudMediaConfigured()) return;
  const config = getCloudConfig();
  await fetch(mediaUrl(`media?path=${encodeURIComponent(asset.storagePath)}`), {
    method: 'DELETE',
    headers: getCloudAuthHeaders(config.storeId),
  }).catch(() => undefined);
};
