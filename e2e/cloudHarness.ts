/**
 * Harness e2e untuk backend Cloudflare ASLI yang berjalan lokal (Worker + Durable Object + R2 di workerd,
 * dijalankan `npm run dev` lewat @cloudflare/vite-plugin). Tiap tes memakai Store ID acak sehingga
 * datanya terisolasi di Durable Object sendiri.
 */
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { AppData } from '../types';

export const BASE_URL = 'http://127.0.0.1:4173';
/** Sama dengan .dev.vars.example (dibuat otomatis oleh scripts/ensure-dev-vars.mjs). */
export const SETUP_KEY = 'dev-setup-key';

export const encode = (data: unknown) => Buffer.from(JSON.stringify(data), 'utf8').toString('base64');
export const decode = (raw: string) => JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));

export interface TestStore {
  storeId: string;
  email: string;
  password: string;
  /** Token perangkat "server" milik tes, untuk membaca data cloud. */
  token: string;
}

const api = (path: string) => `${BASE_URL}/api/${path}`;

/** Daftarkan toko baru di cloud lokal dan (opsional) isi data awal. */
export const createTestStore = async (seed?: AppData, prefix = 'e2e'): Promise<TestStore> => {
  const storeId = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `${storeId}@toko.test`;
  const password = 'Rahasia#2026';
  const response = await fetch(api(`stores/${storeId}/register`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Setup-Key': SETUP_KEY },
    body: JSON.stringify({ email, password, label: 'e2e' }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Gagal mendaftarkan toko uji: ${JSON.stringify(body)}`);
  const store = { storeId, email, password, token: body.token as string };
  if (seed) {
    const put = await fetch(api(`stores/${storeId}/state`), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${store.token}`, 'If-Match': '0', 'Content-Type': 'text/plain' },
      body: encode(seed),
    });
    if (!put.ok) throw new Error(`Gagal mengisi data awal: ${put.status}`);
  }
  return store;
};

/** Token perangkat baru (seperti login dari layar Pengaturan). */
export const loginDevice = async (store: TestStore) => {
  const response = await fetch(api(`stores/${store.storeId}/login`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: store.email, password: store.password, label: 'e2e device' }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Login perangkat gagal: ${JSON.stringify(body)}`);
  return body.token as string;
};

/** Data toko di cloud saat ini (versi + isi). */
export const readCloud = async (store: TestStore): Promise<AppData & { __version: number }> => {
  const response = await fetch(api(`stores/${store.storeId}/state`), { headers: { Authorization: `Bearer ${store.token}` } });
  const version = Number(response.headers.get('X-State-Version') || '0');
  if (response.status === 204) return { __version: version } as any;
  return { ...decode(await response.text()), __version: version };
};

export const cloudVersion = async (store: TestStore) => (await readCloud(store)).__version;

/**
 * Buka perangkat (browser context terpisah) yang terhubung ke toko uji.
 * `connected: false` = perangkat belum login cloud (seperti perangkat baru).
 */
export const openDevice = async (
  browser: Browser,
  store: TestStore,
  options: { username?: string; connected?: boolean; displayName?: string } = {},
) => {
  const context = await browser.newContext({ baseURL: BASE_URL });
  let offline = false;
  // Simulasi putus internet: semua request API ke cloud gagal seperti jaringan terputus.
  await context.route('**/api/**', route => (offline ? route.abort('internetdisconnected') : route.continue()));
  const token = options.connected === false ? null : await loginDevice(store);
  await context.addInitScript(({ storeId, displayName, token: deviceToken, email }) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    indexedDB.deleteDatabase('POSHULIO_DB');
    localStorage.setItem('HGROUP_CLOUD_CONFIG', JSON.stringify({ storeId, enabled: true, displayName }));
    if (deviceToken) localStorage.setItem('POS_CLOUD_SESSION_CF', JSON.stringify({ storeId, token: deviceToken, email, connectedAt: new Date().toISOString() }));
  }, { storeId: store.storeId, displayName: options.displayName || store.storeId, token, email: store.email });
  const page = await context.newPage();
  const dialogs: string[] = [];
  page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.accept(); });
  await page.goto('/');
  await expect(page.locator('#login-user')).toBeVisible({ timeout: 60_000 });
  if (options.username) await loginUser(page, options.username);
  return {
    context,
    page,
    dialogs,
    setOffline: (value: boolean) => { offline = value; },
  };
};

export const loginUser = async (page: Page, username: string, password = '123') => {
  await page.locator('#login-user').fill(username);
  await page.locator('#login-pass').fill(password);
  await page.getByRole('button', { name: /masuk/i }).click();
  await expect(page.getByRole('button', { name: /keluar/i }).first()).toBeVisible();
};

export const readLocal = (page: Page): Promise<AppData> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('HGROUP_ENTERPRISE_DATA') || '{}'));

export type Device = Awaited<ReturnType<typeof openDevice>> & { context: BrowserContext };
