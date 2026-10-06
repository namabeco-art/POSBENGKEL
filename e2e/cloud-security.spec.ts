import { expect, test, type BrowserContext, type Route } from '@playwright/test';
import { mockAccounts, mockBranches, mockCustomers, mockUsers } from '../store';
import type { AppData, Item, User } from '../types';

/**
 * Supabase palsu yang menegakkan RLS seperti supabase/setup.sql:
 * hanya request dengan token akun toko yang boleh membaca/menulis; selain itu bucket "kosong" dan tulis ditolak.
 */

const SUPABASE = 'https://secure-store.supabase.co';
const BASE_URL = 'http://127.0.0.1:4173';
const DATA_PATH = 'erp-media/state/toko1/app-data.txt';
const ACCOUNT = { email: 'toko1@contoh.com', password: 'Rahasia#2026', token: 'tok-toko1' };

const encode = (data: unknown) => Buffer.from(JSON.stringify(data), 'utf8').toString('base64');
const decode = (raw: string) => JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));

const storeItems: Item[] = [
  { id: 'G1', code: 'GUL-001', barcode: '7771', name: 'Gula Pasir 1kg', category: 'Sembako', brand: 'Gulaku', basePrice: 15000, memberPrices: [17500, 0, 0, 0], units: [{ name: 'Pcs', conversion: 1, price: 17500 }], stock: 40, warehouseId: 'W1' },
  { id: 'M1', code: 'MYK-001', barcode: '7772', name: 'Minyak Goreng 2L', category: 'Sembako', brand: 'Bimoli', basePrice: 34000, memberPrices: [38000, 0, 0, 0], units: [{ name: 'Pcs', conversion: 1, price: 38000 }], stock: 20, warehouseId: 'W1' },
];

const sari: User = { ...mockUsers[1], id: 'U-SARI', name: 'Sari', username: 'sari' }; // password 123

const storeData = (): AppData => ({
  users: [mockUsers[0], sari],
  items: storeItems.map(item => ({ ...item })),
  customers: mockCustomers.map(customer => ({ ...customer })),
  suppliers: [],
  accounts: mockAccounts.map(account => ({ ...account })),
  purchaseOrders: [], sales: [], returns: [], inventoryLogs: [], inventoryMovements: [], auditLogs: [],
  cashSessions: [], cashExpenses: [], paymentRecords: [], promotions: [],
  branches: mockBranches.map(branch => ({ ...branch })), aiConsultantHistory: [], floatingChatHistory: [],
});

const createSecureCloud = () => {
  const objects = new Map<string, string>([[DATA_PATH, encode(storeData())]]);
  const deniedWrites: string[] = [];
  const handler = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/auth/v1/token') {
      const body = JSON.parse(request.postData() || '{}');
      if (url.searchParams.get('grant_type') === 'password' && body.email === ACCOUNT.email && body.password === ACCOUNT.password) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: ACCOUNT.token, refresh_token: 'ref', expires_in: 3600, user: { id: 'auth-user-1', email: ACCOUNT.email } }) });
      }
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }) });
    }
    if (url.pathname.startsWith('/auth/v1/')) return route.fulfill({ status: 200, body: '{}' });

    const authorized = request.headers()['authorization'] === `Bearer ${ACCOUNT.token}`;
    const key = decodeURIComponent(url.pathname.replace('/storage/v1/object/', ''));
    const method = request.method();
    const notFound = () => route.fulfill({ status: 400, contentType: 'application/json', body: '{"statusCode":"404","error":"not_found","message":"Object not found"}' });
    if (method === 'GET') {
      if (!authorized || !objects.has(key)) return notFound(); // private bucket menyembunyikan objek
      return route.fulfill({ status: 200, contentType: 'text/plain', body: objects.get(key)! });
    }
    if (method === 'POST') {
      if (!authorized) {
        deniedWrites.push(key);
        return route.fulfill({ status: 400, contentType: 'application/json', body: '{"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy"}' });
      }
      const upsert = (request.headers()['x-upsert'] || '').toLowerCase() === 'true';
      if (!upsert && objects.has(key)) return route.fulfill({ status: 400, contentType: 'application/json', body: '{"statusCode":"409","error":"Duplicate"}' });
      objects.set(key, request.postData() || '');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: key }) });
    }
    if (method === 'DELETE') {
      if (!authorized) return notFound();
      objects.delete(key);
      return route.fulfill({ status: 200, body: '{}' });
    }
    return route.fulfill({ status: 200, body: '{}' });
  };
  return {
    objects,
    deniedWrites,
    read: (): AppData => decode(objects.get(DATA_PATH)!),
    attach: (context: BrowserContext) => context.route(`${SUPABASE}/**`, handler),
  };
};

const newDevice = async (browser: import('@playwright/test').Browser, cloud: ReturnType<typeof createSecureCloud>) => {
  const context = await browser.newContext({ baseURL: BASE_URL });
  await cloud.attach(context);
  await context.addInitScript(({ supabase }) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    indexedDB.deleteDatabase('POSHULIO_DB');
    localStorage.setItem('HGROUP_CLOUD_CONFIG', JSON.stringify({
      storeId: 'toko1', enabled: true, supabaseUrl: supabase, supabaseAnonKey: 'public-anon-key', supabaseBucket: 'erp-media', displayName: 'Toko Sembako 1',
    }));
  }, { supabase: SUPABASE });
  const page = await context.newPage();
  const dialogs: string[] = [];
  page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.accept(); });
  await page.goto('/');
  await expect(page.locator('#login-user')).toBeVisible({ timeout: 60_000 });
  return { context, page, dialogs };
};

const login = async (page: import('@playwright/test').Page, username: string) => {
  await page.locator('#login-user').fill(username);
  await page.locator('#login-pass').fill('123');
  await page.getByRole('button', { name: /masuk/i }).click();
};

test('perangkat baru harus login cloud toko; data toko dipakai utuh tanpa data contoh', async ({ browser }) => {
  test.setTimeout(120_000);
  const cloud = createSecureCloud();
  const { page, context } = await newDevice(browser, cloud);

  // Belum terhubung: user toko (sari) belum ada di perangkat ini.
  await login(page, 'sari');
  await expect(page.getByText('Username atau Password salah!')).toBeVisible();

  await page.getByRole('button', { name: /Hubungkan perangkat ke cloud toko Toko Sembako 1/ }).click();
  await page.getByLabel('Email akun cloud toko').fill(ACCOUNT.email);
  await page.getByLabel('Password akun cloud toko').fill('salah');
  await page.getByRole('button', { name: /Hubungkan ke Cloud/ }).click();
  await expect(page.getByText('Email atau password cloud salah.')).toBeVisible();

  await page.getByLabel('Password akun cloud toko').fill(ACCOUNT.password);
  await page.getByRole('button', { name: /Hubungkan ke Cloud/ }).click();
  await expect(page.getByText(`terhubung sebagai ${ACCOUNT.email}`)).toBeVisible();

  await login(page, 'sari');
  await page.getByRole('button', { name: 'Kasir', exact: true }).click();
  await page.getByPlaceholder('Cari barang / scan barcode...').fill('Oli');
  await expect(page.getByText('Oops! Produk Tidak Ada')).toBeVisible(); // barang contoh tidak ikut masuk
  await page.getByPlaceholder('Cari barang / scan barcode...').fill('Gula');
  await page.getByText('Gula Pasir 1kg').first().click();
  await page.getByRole('button', { name: /^bayar$/i }).click();
  await page.getByRole('button', { name: /SELESAI & SIMPAN/i }).click();
  await expect(page.getByText('TRANSAKSI BERHASIL')).toBeVisible();

  const data = cloud.read();
  expect(data.sales).toHaveLength(1);
  expect(data.items.find(item => item.id === 'G1')!.stock).toBe(39);
  expect(data.items.map(item => item.id).sort()).toEqual(['G1', 'M1']);
  expect(data.users.map(user => user.username).sort()).toEqual(['admin', 'sari']);
  expect(cloud.deniedWrites).toEqual([]);
  await context.close();
});

test('perangkat tanpa login cloud tidak bisa menimpa data toko dan diberi peringatan', async ({ browser }) => {
  test.setTimeout(120_000);
  const cloud = createSecureCloud();
  const before = cloud.objects.get(DATA_PATH);
  const { page, context } = await newDevice(browser, cloud);

  // Login dengan user bawaan lokal, lalu ubah data → push ke cloud ditolak RLS.
  await login(page, 'admin');
  await page.getByRole('button', { name: 'Barang' }).click();
  await page.locator('tr', { hasText: 'Busi NGK C7HSA' }).locator('button').nth(1).click();
  await page.getByText('Harga Level 1').locator('xpath=following-sibling::input').fill('26000');
  await page.getByRole('button', { name: /Update Master Barang/i }).click();

  await expect(page.getByText(/belum terkirim ke cloud/)).toBeVisible({ timeout: 20_000 });
  expect(cloud.deniedWrites.length).toBeGreaterThan(0);
  expect(cloud.objects.get(DATA_PATH)).toBe(before); // data toko tidak tersentuh

  // Hubungkan lewat banner → Pengaturan, peringatan hilang dan data toko masuk.
  await page.getByRole('button', { name: 'Hubungkan di Pengaturan' }).click();
  await page.getByLabel('Email akun cloud toko').fill(ACCOUNT.email);
  await page.getByLabel('Password akun cloud toko').fill(ACCOUNT.password);
  await page.getByRole('button', { name: /Hubungkan ke Cloud/ }).click();
  await expect(page.getByText(`terhubung sebagai ${ACCOUNT.email}`)).toBeVisible();
  await expect(page.getByText(/belum terkirim ke cloud/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Barang' }).click();
  await expect(page.getByText('Gula Pasir 1kg')).toBeVisible();
  await expect(page.getByText('Busi NGK C7HSA')).toHaveCount(0);
  await context.close();
});
