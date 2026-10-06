import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { mockAccounts, mockBranches, mockCustomers, mockItems, mockSuppliers, mockUsers } from '../store';
import type { AppData, Item } from '../types';

/**
 * Simulasi 2 perangkat (PC owner + tablet kasir) yang tersinkron lewat Supabase Storage palsu (in-memory).
 * Membuktikan: perubahan harga owner tidak hilang saat kasir berjualan bersamaan, stok tetap benar,
 * dan barang yang dihapus tidak muncul lagi.
 */

const SUPABASE = 'https://fake-project.supabase.co';
const BASE_URL = 'http://127.0.0.1:4173';
const DATA_PATH = 'erp-media/state/toko1/app-data.txt';

const encode = (data: unknown) => Buffer.from(JSON.stringify(data), 'utf8').toString('base64');
const decode = (raw: string) => JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));

const seedData = (): AppData => ({
  users: mockUsers.map(user => ({ ...user })),
  items: mockItems.map(item => ({ ...item })),
  customers: mockCustomers.map(customer => ({ ...customer })),
  suppliers: mockSuppliers.map(supplier => ({ ...supplier })),
  accounts: mockAccounts.map(account => ({ ...account })),
  purchaseOrders: [], sales: [], returns: [], inventoryLogs: [], inventoryMovements: [], auditLogs: [],
  cashSessions: [], cashExpenses: [], paymentRecords: [], promotions: [],
  branches: mockBranches.map(branch => ({ ...branch })),
  aiConsultantHistory: [], floatingChatHistory: [],
});

/** Server Supabase Storage palsu yang dipakai bersama oleh semua perangkat. */
const createFakeCloud = () => {
  const objects = new Map<string, string>();
  const offlineContexts = new Set<BrowserContext>();
  const handler = (context: BrowserContext) => async (route: Route) => {
    if (offlineContexts.has(context)) return route.abort('internetdisconnected');
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith('/auth/v1/health')) return route.fulfill({ status: 200, body: '{}' });
    const key = decodeURIComponent(url.pathname.replace('/storage/v1/object/', ''));
    const method = request.method();
    if (method === 'GET') {
      if (!objects.has(key)) return route.fulfill({ status: 400, contentType: 'application/json', body: '{"statusCode":"404","error":"not_found","message":"Object not found"}' });
      return route.fulfill({ status: 200, contentType: 'text/plain', body: objects.get(key)! });
    }
    if (method === 'DELETE') {
      objects.delete(key);
      return route.fulfill({ status: 200, body: '{}' });
    }
    if (method === 'POST') {
      const upsert = (request.headers()['x-upsert'] || '').toLowerCase() === 'true';
      if (!upsert && objects.has(key)) return route.fulfill({ status: 400, contentType: 'application/json', body: '{"statusCode":"409","error":"Duplicate"}' });
      objects.set(key, request.postData() || '');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: key }) });
    }
    return route.fulfill({ status: 200, body: '{}' });
  };
  return {
    objects,
    read: (): AppData => decode(objects.get(DATA_PATH)!),
    attach: (context: BrowserContext) => context.route(`${SUPABASE}/**`, handler(context)),
    setOffline: (context: BrowserContext, offline: boolean) => {
      if (offline) offlineContexts.add(context); else offlineContexts.delete(context);
    },
  };
};

const openDevice = async (browser: import('@playwright/test').Browser, cloud: ReturnType<typeof createFakeCloud>, username: string) => {
  const context = await browser.newContext({ baseURL: BASE_URL });
  await cloud.attach(context);
  await context.addInitScript(({ supabase }) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    indexedDB.deleteDatabase('POSHULIO_DB');
    localStorage.setItem('HGROUP_CLOUD_CONFIG', JSON.stringify({
      storeId: 'toko1', enabled: true, supabaseUrl: supabase, supabaseAnonKey: 'anon-key', supabaseBucket: 'erp-media', displayName: 'Toko 1',
    }));
  }, { supabase: SUPABASE });
  const page = await context.newPage();
  page.on('dialog', dialog => void dialog.accept());
  await page.goto('/');
  await page.locator('#login-user').fill(username);
  await page.locator('#login-pass').fill('123');
  await page.getByRole('button', { name: /masuk/i }).click();
  await expect(page.getByRole('button', { name: /keluar/i }).first()).toBeVisible();
  return { context, page };
};

const cloudItem = (cloud: ReturnType<typeof createFakeCloud>, id: string): Item | undefined => cloud.read().items.find(item => item.id === id);

const sellOneOli = async (kasir: Page, qty = 1) => {
  await kasir.getByRole('button', { name: 'Kasir', exact: true }).click();
  await kasir.getByPlaceholder('Cari barang / scan barcode...').fill('Oli Mesin');
  for (let i = 0; i < qty; i += 1) await kasir.getByText('Oli Mesin 1L SAE 10W-40').first().click();
  await kasir.getByRole('button', { name: /^bayar$/i }).click();
  await kasir.getByRole('button', { name: /SELESAI & SIMPAN/i }).click();
  await expect(kasir.getByText('TRANSAKSI BERHASIL')).toBeVisible();
  await kasir.getByRole('button', { name: 'PENJUALAN BARU' }).click();
};

test('harga baru owner & penjualan kasir yang terjadi bersamaan sama-sama tersimpan di cloud', async ({ browser }) => {
  test.setTimeout(180_000);
  const cloud = createFakeCloud();
  cloud.objects.set(DATA_PATH, encode(seedData()));

  const owner = await openDevice(browser, cloud, 'admin');
  const kasir = await openDevice(browser, cloud, 'kasir');

  // Owner mengubah harga Oli 55.000 → 60.000 (belum terkirim: push menunggu jeda beberapa detik).
  await owner.page.getByRole('button', { name: 'Barang' }).click();
  await owner.page.locator('tr', { hasText: 'Oli Mesin 1L SAE 10W-40' }).locator('button').nth(1).click();
  await owner.page.getByText('Harga Level 1').locator('xpath=following-sibling::input').fill('60000');
  await owner.page.getByRole('button', { name: /Update Master Barang/i }).click();

  // Kasir menjual 1 Oli di perangkat lain pada saat yang sama (transaksi terkunci, langsung ke cloud).
  await sellOneOli(kasir.page);
  await expect.poll(() => cloud.read().sales.length).toBe(1);
  expect(cloudItem(cloud, '1')!.stock).toBe(23);

  // Setelah owner sinkron, cloud harus punya harga baru DAN stok hasil penjualan kasir.
  await expect.poll(() => cloudItem(cloud, '1')!.memberPrices[0], { timeout: 30_000 }).toBe(60000);
  expect(cloudItem(cloud, '1')!.stock).toBe(23);
  expect(cloud.read().sales).toHaveLength(1);

  // Harga di perangkat owner tidak "kembali" ke harga lama setelah auto-pull.
  const ownerLocal = await owner.page.evaluate(() => JSON.parse(localStorage.getItem('HGROUP_ENTERPRISE_DATA') || '{}'));
  expect(ownerLocal.items.find((item: Item) => item.id === '1').memberPrices[0]).toBe(60000);
  expect(ownerLocal.items.find((item: Item) => item.id === '1').stock).toBe(23);

  // Kasir menarik data terbaru: harga baru terlihat, penjualan berikutnya memakai harga baru.
  await kasir.page.getByRole('button', { name: 'Sync' }).click();
  await sellOneOli(kasir.page);
  await expect.poll(() => cloud.read().sales.length).toBe(2);
  const newest = cloud.read().sales.find(sale => sale.items[0].price === 60000);
  expect(newest, 'penjualan kedua harus memakai harga 60.000').toBeTruthy();
  expect(cloudItem(cloud, '1')!.stock).toBe(22);

  await owner.context.close();
  await kasir.context.close();
});

test('barang yang dihapus owner tidak muncul lagi dari salinan perangkat kasir', async ({ browser }) => {
  test.setTimeout(180_000);
  const cloud = createFakeCloud();
  cloud.objects.set(DATA_PATH, encode(seedData()));

  const owner = await openDevice(browser, cloud, 'admin');
  const kasir = await openDevice(browser, cloud, 'kasir');

  await owner.page.getByRole('button', { name: 'Barang' }).click();
  await owner.page.locator('tr', { hasText: 'Rantai Motor 428H' }).locator('button').last().click();
  await expect.poll(() => cloud.read().items.some(item => item.id === '5'), { timeout: 30_000 }).toBe(false);

  // Kasir masih punya salinan lama berisi Rantai Motor, lalu bertransaksi (push dari perangkat kasir).
  await sellOneOli(kasir.page);
  await expect.poll(() => cloud.read().sales.length).toBe(1);
  await kasir.page.getByRole('button', { name: 'Sync' }).click();

  expect(cloud.read().items.some(item => item.id === '5')).toBe(false);
  const kasirLocal = await kasir.page.evaluate(() => JSON.parse(localStorage.getItem('HGROUP_ENTERPRISE_DATA') || '{}'));
  expect(kasirLocal.items.some((item: Item) => item.id === '5')).toBe(false);

  await owner.context.close();
  await kasir.context.close();
});

test('dua kasir: satu offline menjual 2, satu online menjual 1 → stok akhir 21 di semua perangkat', async ({ browser }) => {
  test.setTimeout(180_000);
  const cloud = createFakeCloud();
  cloud.objects.set(DATA_PATH, encode(seedData()));

  const kasirA = await openDevice(browser, cloud, 'kasir');
  const kasirB = await openDevice(browser, cloud, 'admin');

  cloud.setOffline(kasirA.context, true);
  await sellOneOli(kasirA.page, 2); // tersimpan lokal karena cloud tidak terjangkau
  await sellOneOli(kasirB.page, 1);
  await expect.poll(() => cloudItem(cloud, '1')!.stock).toBe(23);

  cloud.setOffline(kasirA.context, false);
  await kasirA.page.getByRole('button', { name: 'Sync' }).click();
  // Push ulang otomatis setelah koneksi kembali membawa penjualan offline ke cloud.
  await expect.poll(() => cloud.read().sales.length, { timeout: 40_000 }).toBe(2);
  expect(cloudItem(cloud, '1')!.stock).toBe(21);

  await kasirB.page.getByRole('button', { name: 'Sync' }).click();
  for (const device of [kasirA, kasirB]) {
    const local = await device.page.evaluate(() => JSON.parse(localStorage.getItem('HGROUP_ENTERPRISE_DATA') || '{}'));
    expect(local.items.find((item: Item) => item.id === '1').stock).toBe(21);
  }

  await kasirA.context.close();
  await kasirB.context.close();
});
