/**
 * POSHULIO di Cloudflare Workers.
 * - Aset statis (SPA) dilayani langsung oleh Workers Static Assets.
 * - /api/* masuk ke Worker ini:
 *     GET  /api/health
 *     POST /api/stores/:id/register        (butuh SETUP_KEY) — daftarkan toko + akun cloud
 *     POST /api/stores/:id/login | logout | password
 *     GET|PUT /api/stores/:id/state         — data toko (versi + compare-and-swap)
 *     POST|DELETE /api/stores/:id/lock      — kunci singkat transaksi stok
 *     POST /api/stores/:id/media?name=      — unggah file ke R2
 *     POST /api/stores/:id/media/sign       — URL bertanda tangan untuk file
 *     DELETE /api/stores/:id/media?path=
 *     GET  /api/media?path=&exp=&sig=       — unduh file lewat URL bertanda tangan
 *     POST /api/stores/:id/ai               — proxy OpenRouter (kunci API di server)
 * Data per toko dikelola Durable Object StoreObject; Worker hanya meneruskan agar CPU Worker tetap kecil.
 */
import { StoreObject, type Env } from './storeObject';
import { hmacSign, timingSafeEqual } from './crypto';

export { StoreObject };

const STORE_ID = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const MEDIA_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const error = (status: number, code: string, message: string) => json({ error: code, message }, status);

const securityHeaders = (response: Response) => {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'same-origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

const storeStub = (env: Env, storeId: string) => env.STORE.get(env.STORE.idFromName(storeId));

const bearer = (request: Request) => (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();

const signMediaPath = async (env: Env, path: string, expires: number) => hmacSign(env.MEDIA_SIGNING_SECRET!, `${path}:${expires}`);

const signedMediaUrl = async (env: Env, origin: string, path: string) => {
  const expires = Math.floor(Date.now() / 1000) + MEDIA_URL_TTL_SECONDS;
  const sig = await signMediaPath(env, path, expires);
  return `${origin}/api/media?path=${encodeURIComponent(path)}&exp=${expires}&sig=${sig}`;
};

const handleMedia = async (request: Request, env: Env, storeId: string, rest: string, url: URL) => {
  if (!env.MEDIA_SIGNING_SECRET) return error(501, 'MEDIA_NOT_CONFIGURED', 'MEDIA_SIGNING_SECRET belum diatur di server.');
  if (!(await storeStub(env, storeId).verify(bearer(request)))) return error(401, 'CLOUD_AUTH_REQUIRED', 'Perangkat belum login ke cloud toko.');

  if (rest === 'media' && request.method === 'POST') {
    const length = Number(request.headers.get('Content-Length') || '0');
    if (length > MAX_MEDIA_BYTES) return error(413, 'FILE_TOO_LARGE', 'Ukuran file maksimal 15 MB.');
    const name = (url.searchParams.get('name') || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const path = `${storeId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${name}`;
    await env.MEDIA.put(path, request.body, { httpMetadata: { contentType: request.headers.get('Content-Type') || 'application/octet-stream' } });
    return json({ storagePath: path, signedUrl: await signedMediaUrl(env, url.origin, path) }, 201);
  }
  if (rest === 'media/sign' && request.method === 'POST') {
    const body = await request.json().catch(() => ({})) as { storagePath?: string };
    const path = String(body.storagePath || '');
    if (!path.startsWith(`${storeId}/`)) return error(403, 'FORBIDDEN', 'File bukan milik toko ini.');
    return json({ signedUrl: await signedMediaUrl(env, url.origin, path) });
  }
  if (rest === 'media' && request.method === 'DELETE') {
    const path = url.searchParams.get('path') || '';
    if (!path.startsWith(`${storeId}/`)) return error(403, 'FORBIDDEN', 'File bukan milik toko ini.');
    await env.MEDIA.delete(path);
    return json({ ok: true });
  }
  return error(404, 'NOT_FOUND', 'Endpoint media tidak dikenal.');
};

const serveSignedMedia = async (env: Env, url: URL) => {
  if (!env.MEDIA_SIGNING_SECRET) return error(501, 'MEDIA_NOT_CONFIGURED', 'Media belum diatur.');
  const path = url.searchParams.get('path') || '';
  const expires = Number(url.searchParams.get('exp') || '0');
  const sig = url.searchParams.get('sig') || '';
  if (!path || !expires || expires < Date.now() / 1000) return error(403, 'URL_EXPIRED', 'Tautan file sudah kedaluwarsa.');
  if (!timingSafeEqual(sig, await signMediaPath(env, path, expires))) return error(403, 'BAD_SIGNATURE', 'Tautan file tidak valid.');
  const object = await env.MEDIA.get(path);
  if (!object) return error(404, 'NOT_FOUND', 'File tidak ditemukan.');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'private, max-age=3600');
  return new Response(object.body, { headers });
};

const handleAi = async (request: Request, env: Env, storeId: string) => {
  if (!env.OPENROUTER_API_KEY) return error(501, 'AI_NOT_CONFIGURED', 'OPENROUTER_API_KEY belum diatur di server.');
  if (!(await storeStub(env, storeId).verify(bearer(request)))) return error(401, 'CLOUD_AUTH_REQUIRED', 'Perangkat belum login ke cloud toko.');
  const body = await request.json().catch(() => null) as { model?: string; messages?: unknown[]; temperature?: number } | null;
  if (!body || !Array.isArray(body.messages)) return error(400, 'INVALID_BODY', 'messages wajib berupa array.');
  const upstream = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': new URL(request.url).origin,
      'X-Title': 'POSHULIO',
    },
    body: JSON.stringify({
      model: body.model || env.OPENROUTER_MODEL || 'openrouter/auto',
      messages: body.messages,
      temperature: typeof body.temperature === 'number' ? body.temperature : 0.4,
    }),
  });
  return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
};

const handleApi = async (request: Request, env: Env, url: URL): Promise<Response> => {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  if (parts[1] === 'health') return json({ ok: true, service: 'poshulio', backend: 'cloudflare', ai: Boolean(env.OPENROUTER_API_KEY) });
  if (parts[1] === 'media' && request.method === 'GET') return serveSignedMedia(env, url);
  if (parts[1] !== 'stores' || !parts[2]) return error(404, 'NOT_FOUND', 'Endpoint tidak dikenal.');

  const storeId = decodeURIComponent(parts[2]).toLowerCase();
  if (!STORE_ID.test(storeId)) return error(400, 'INVALID_STORE_ID', 'Store ID hanya huruf kecil, angka, - atau _ (3–64 karakter).');
  const rest = parts.slice(3).join('/');

  if (rest === 'register') {
    if (!env.SETUP_KEY) return error(501, 'SETUP_DISABLED', 'Pendaftaran toko belum diaktifkan di server (SETUP_KEY).');
    if (!timingSafeEqual(request.headers.get('X-Setup-Key') || '', env.SETUP_KEY)) return error(403, 'INVALID_SETUP_KEY', 'Kode pendaftaran toko salah.');
  }
  if (rest.startsWith('media')) return handleMedia(request, env, storeId, rest, url);
  if (rest === 'ai' && request.method === 'POST') return handleAi(request, env, storeId);

  // Sisanya ditangani Durable Object toko (body diteruskan tanpa diproses Worker).
  const internalUrl = new URL(`https://store.internal/${storeId}/${rest}${url.search}`);
  return storeStub(env, storeId).fetch(new Request(internalUrl, request));
};

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return securityHeaders(await handleApi(request, env, url));
      } catch (caught) {
        console.error('[api]', url.pathname, caught);
        return error(500, 'INTERNAL', 'Terjadi kesalahan di server.');
      }
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
