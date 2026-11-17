import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCloudAuthHeaders,
  getCloudSession,
  isCloudAuthError,
  isCloudAuthErrorResponse,
  registerCloudStore,
  signInCloud,
  signOutCloud,
} from '../services/cloudAuth';
import { applyActivationCode, generateActivationCode, getCloudConfig, saveCloudConfig, syncWithCloud, withCloudInventoryLock } from '../services/syncService';
import { CLOUD_AI_PROXY_KEY, getResolvedOpenRouterApiKey } from '../services/appConfig';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const encode = (data: unknown) => btoa(unescape(encodeURIComponent(JSON.stringify(data))));
const decode = (text: string) => JSON.parse(decodeURIComponent(escape(atob(text))));

describe('cloudAuth (Cloudflare)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('login menyimpan sesi per toko dan header memakai token perangkat', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => (String(input).endsWith('/api/health') ? json(200, { ok: true, ai: true }) : json(200, { token: 'tok-1', email: 'toko@contoh.com' })));
    vi.stubGlobal('fetch', fetchMock);
    const session = await signInCloud('', ' Bengkel_Jaya ', ' toko@contoh.com ', 'rahasia123');
    expect(session).toMatchObject({ storeId: 'bengkel_jaya', token: 'tok-1', email: 'toko@contoh.com' });
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/stores/bengkel_jaya/login');
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({ email: 'toko@contoh.com', password: 'rahasia123' });
    expect(getCloudAuthHeaders('bengkel_jaya', 'text/plain')).toEqual({ Authorization: 'Bearer tok-1', 'Content-Type': 'text/plain' });
    expect(getCloudSession('toko_lain')).toBeNull();
    // Proxy AI server terdeteksi lewat /api/health → AI bisa dipakai tanpa kunci di browser.
    await vi.waitFor(() => expect(getResolvedOpenRouterApiKey('')).toBe(CLOUD_AI_PROXY_KEY));
  });

  it('pesan error server diteruskan; Store ID tidak valid ditolak sebelum request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { error: 'INVALID_CREDENTIALS', message: 'Email atau password cloud salah.' })));
    await expect(signInCloud('', 'toko1', 'a@b.co', 'salah')).rejects.toThrow('Email atau password cloud salah.');
    await expect(signInCloud('', 'x', 'a@b.co', 'salah')).rejects.toThrow(/Store ID/);
    expect(getCloudSession()).toBeNull();
  });

  it('pendaftaran toko mengirim kode pendaftaran di header', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json(201, { token: 'tok-new', email: 'owner@toko.id' }));
    vi.stubGlobal('fetch', fetchMock);
    await registerCloudStore('https://pos.example.workers.dev/', 'toko1', 'owner@toko.id', 'password123', ' kode-rahasia ');
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://pos.example.workers.dev/api/stores/toko1/register');
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'X-Setup-Key': 'kode-rahasia' });
    expect(getCloudSession('toko1')?.token).toBe('tok-new');
  });

  it('logout menghapus sesi lokal walau server tidak terjangkau', async () => {
    localStorage.setItem('POS_CLOUD_SESSION_CF', JSON.stringify({ storeId: 'toko1', token: 't', email: 'e', connectedAt: '' }));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await signOutCloud('');
    expect(getCloudSession()).toBeNull();
  });

  it('hanya 401 yang dianggap perangkat belum login', () => {
    expect(isCloudAuthErrorResponse(new Response('', { status: 401 }))).toBe(true);
    expect(isCloudAuthErrorResponse(new Response('', { status: 500 }))).toBe(false);
  });
});

describe('syncService (Cloudflare)', () => {
  beforeEach(() => {
    localStorage.clear();
    saveCloudConfig({ storeId: 'toko1', enabled: true });
    localStorage.setItem('POS_CLOUD_SESSION_CF', JSON.stringify({ storeId: 'toko1', token: 'tok', email: 'e', connectedAt: '' }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('kode aktivasi hanya berisi Store ID & alamat API (tanpa rahasia)', () => {
    const code = generateActivationCode();
    expect(JSON.parse(atob(code))).toEqual({ s: 'toko1', n: 'toko1', r: 'Cloud', a: '' });
    localStorage.clear();
    expect(applyActivationCode(code)).toBe(true);
    expect(getCloudConfig()).toMatchObject({ storeId: 'toko1', enabled: true });
    expect(applyActivationCode(btoa(JSON.stringify({ s: '!' })))).toBe(false);
  });

  it('simpan memakai compare-and-swap dan mengulang saat perangkat lain menyimpan duluan', async () => {
    // Server palsu: versi 3 di awal, perangkat lain menyimpan sekali di antara tarik & simpan pertama.
    let version = 3;
    let stored = encode({ sales: [{ id: 'A' }] });
    let interfere = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') return new Response(stored, { status: 200, headers: { 'X-State-Version': String(version) } });
      const ifMatch = Number((init.headers as Record<string, string>)['If-Match']);
      if (interfere) {
        interfere = false;
        version += 1;
        stored = encode({ sales: [{ id: 'A' }, { id: 'B' }] });
      }
      if (ifMatch !== version) return json(409, { error: 'VERSION_CONFLICT' }, { 'X-State-Version': String(version) });
      version += 1;
      stored = String(init.body);
      return json(200, { ok: true, version }, { 'X-State-Version': String(version) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const compose = vi.fn((remote: any) => ({ sales: [...(remote?.sales || []), { id: 'LOCAL' }] }));
    const result = await syncWithCloud(compose);
    expect(compose).toHaveBeenCalledTimes(2);
    expect(result.version).toBe(5); // 3 → 4 (perangkat lain) → 5 (simpan ulang setelah digabung)
    expect(decode(stored).sales.map((sale: any) => sale.id)).toEqual(['A', 'B', 'LOCAL']);
  });

  it('401 dari server menghapus sesi dan ditandai CLOUD_AUTH_REQUIRED', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { error: 'CLOUD_AUTH_REQUIRED' })));
    const error = await syncWithCloud(remote => remote).catch(caught => caught);
    expect(isCloudAuthError(error)).toBe(true);
    expect(getCloudSession()).toBeNull();
  });

  it('lock: menunggu saat dipegang terminal lain, offline → error agar disimpan lokal', async () => {
    let attempts = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') return json(200, { ok: true });
      attempts += 1;
      return attempts < 3 ? json(423, { acquired: false }) : json(200, { acquired: true });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(withCloudInventoryLock(async () => 'selesai', { retryMs: 1 })).resolves.toBe('selesai');
    expect(fetchMock.mock.calls.at(-1)?.[1]?.method).toBe('DELETE');

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await expect(withCloudInventoryLock(async () => 'x')).rejects.toThrow(/offline/);
  });
});
