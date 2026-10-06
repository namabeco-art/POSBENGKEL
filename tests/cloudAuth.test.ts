import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCloudAccessToken,
  getCloudSession,
  getSupabaseAuthHeaders,
  isCloudAuthErrorResponse,
  signInCloud,
  signOutCloud,
} from '../services/cloudAuth';

const URL_A = 'https://toko.supabase.co';
const ANON = 'anon-key';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('cloudAuth', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('login menyimpan sesi dan header memakai token perangkat', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json(200, { access_token: 'tok-1', refresh_token: 'ref-1', expires_in: 3600, user: { id: 'u1', email: 'toko@contoh.com' } }));
    vi.stubGlobal('fetch', fetchMock);
    const session = await signInCloud(`${URL_A}/`, ANON, ' toko@contoh.com ', 'rahasia');
    expect(session).toMatchObject({ url: URL_A, accessToken: 'tok-1', email: 'toko@contoh.com' });
    expect(fetchMock.mock.calls[0][0]).toBe(`${URL_A}/auth/v1/token?grant_type=password`);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ email: 'toko@contoh.com', password: 'rahasia' });
    expect(await getSupabaseAuthHeaders(URL_A, ANON, 'text/plain')).toEqual({ apikey: ANON, Authorization: 'Bearer tok-1', 'Content-Type': 'text/plain' });
    // Sesi tidak dipakai untuk project Supabase lain.
    expect(getCloudSession('https://lain.supabase.co')).toBeNull();
  });

  it('pesan jelas saat password salah dan tidak menyimpan sesi', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' })));
    await expect(signInCloud(URL_A, ANON, 'toko@contoh.com', 'salah')).rejects.toThrow('Email atau password cloud salah.');
    expect(getCloudSession()).toBeNull();
    expect(await getSupabaseAuthHeaders(URL_A, ANON)).toEqual({ apikey: ANON, Authorization: `Bearer ${ANON}` });
  });

  it('memperbarui token yang hampir kedaluwarsa (sekali, walau dipanggil bersamaan)', async () => {
    localStorage.setItem('POS_CLOUD_SESSION', JSON.stringify({ url: URL_A, accessToken: 'old', refreshToken: 'ref-1', expiresAt: Date.now() + 10_000, email: 'toko@contoh.com', userId: 'u1' }));
    const fetchMock = vi.fn(async () => json(200, { access_token: 'new', refresh_token: 'ref-2', expires_in: 3600 }));
    vi.stubGlobal('fetch', fetchMock);
    const [a, b] = await Promise.all([getCloudAccessToken(URL_A, ANON), getCloudAccessToken(URL_A, ANON)]);
    expect([a, b]).toEqual(['new', 'new']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCloudSession()).toMatchObject({ accessToken: 'new', refreshToken: 'ref-2', email: 'toko@contoh.com' });
  });

  it('refresh token dicabut → sesi dihapus (perangkat harus login ulang)', async () => {
    localStorage.setItem('POS_CLOUD_SESSION', JSON.stringify({ url: URL_A, accessToken: 'old', refreshToken: 'revoked', expiresAt: Date.now() - 1000, email: 'x', userId: 'u1' }));
    vi.stubGlobal('fetch', vi.fn(async () => json(400, { error: 'invalid_grant' })));
    expect(await getCloudAccessToken(URL_A, ANON)).toBeNull();
    expect(getCloudSession()).toBeNull();
  });

  it('offline saat refresh: token lama tetap dipakai selama belum kedaluwarsa', async () => {
    localStorage.setItem('POS_CLOUD_SESSION', JSON.stringify({ url: URL_A, accessToken: 'still-valid', refreshToken: 'ref', expiresAt: Date.now() + 30_000, email: 'x', userId: 'u1' }));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await getCloudAccessToken(URL_A, ANON)).toBe('still-valid');
  });

  it('mengenali penolakan RLS dari Supabase Storage', async () => {
    expect(await isCloudAuthErrorResponse(json(400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' }))).toBe(true);
    expect(await isCloudAuthErrorResponse(json(403, {}))).toBe(true);
    expect(await isCloudAuthErrorResponse(json(400, { statusCode: '404', error: 'not_found' }))).toBe(false);
    expect(await isCloudAuthErrorResponse(json(500, {}))).toBe(false);
  });

  it('logout menghapus sesi lokal', async () => {
    localStorage.setItem('POS_CLOUD_SESSION', JSON.stringify({ url: URL_A, accessToken: 't', refreshToken: 'r', expiresAt: Date.now() + 3_600_000, email: 'x', userId: 'u1' }));
    vi.stubGlobal('fetch', vi.fn(async () => json(204, {})));
    await signOutCloud(ANON);
    expect(getCloudSession()).toBeNull();
  });
});
