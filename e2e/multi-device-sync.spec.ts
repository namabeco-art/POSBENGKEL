import { expect, test, type Page } from '@playwright/test';
import { mockAccounts, mockBranches, mockCustomers, mockItems, mockSuppliers, mockUsers } from '../store';
import type { AppData, Item } from '../types';
import { createTestStore, openDevice, readCloud, readLocal, type TestStore } from './cloudHarness';

/**
 * Simulasi 2 perangkat (PC owner + tablet kasir) yang tersinkron lewat backend Cloudflare asli (lokal).
 * Membuktikan: perubahan harga owner tidak hilang saat kasir berjualan bersamaan, stok tetap benar,
 * dan barang yang dihapus tidak muncul lagi.
 */

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

const cloudItem = async (store: TestStore, id: string): Promise<Item | undefined> => (await readCloud(store)).items?.find(item => item.id === id);

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
  const store = await createTestStore(seedData(), 'sync');
  const owner = await openDevice(browser, store, { username: 'admin' });
  const kasir = await openDevice(browser, store, { username: 'kasir' });

  // Owner mengubah harga Oli 55.000 → 60.000 (belum terkirim: push menunggu jeda beberapa detik).
  await owner.page.getByRole('button', { name: 'Barang' }).click();
  await owner.page.locator('tr', { hasText: 'Oli Mesin 1L SAE 10W-40' }).locator('button').nth(1).click();
  await owner.page.getByText('Harga Level 1').locator('xpath=following-sibling::input').fill('60000');
  await owner.page.getByRole('button', { name: /Update Master Barang/i }).click();

  // Kasir menjual 1 Oli di perangkat lain pada saat yang sama (transaksi terkunci, langsung ke cloud).
  await sellOneOli(kasir.page);
  await expect.poll(async () => (await readCloud(store)).sales?.length ?? 0, { timeout: 20_000 }).toBe(1);
  expect((await cloudItem(store, '1'))!.stock).toBe(23);

  // Setelah owner sinkron, cloud harus punya harga baru DAN stok hasil penjualan kasir.
  await expect.poll(async () => (await cloudItem(store, '1'))!.memberPrices[0], { timeout: 30_000 }).toBe(60000);
  expect((await cloudItem(store, '1'))!.stock).toBe(23);
  expect((await readCloud(store)).sales).toHaveLength(1);

  // Harga di perangkat owner tidak "kembali" ke harga lama setelah auto-pull.
  const ownerLocal = await readLocal(owner.page);
  expect(ownerLocal.items.find(item => item.id === '1')!.memberPrices[0]).toBe(60000);
  expect(ownerLocal.items.find(item => item.id === '1')!.stock).toBe(23);

  // Kasir menarik data terbaru: harga baru terlihat, penjualan berikutnya memakai harga baru.
  await kasir.page.getByRole('button', { name: 'Sync' }).click();
  await sellOneOli(kasir.page);
  await expect.poll(async () => (await readCloud(store)).sales?.length ?? 0, { timeout: 20_000 }).toBe(2);
  const newest = (await readCloud(store)).sales.find(sale => sale.items[0].price === 60000);
  expect(newest, 'penjualan kedua harus memakai harga 60.000').toBeTruthy();
  expect((await cloudItem(store, '1'))!.stock).toBe(22);

  await owner.context.close();
  await kasir.context.close();
});

test('barang yang dihapus owner tidak muncul lagi dari salinan perangkat kasir', async ({ browser }) => {
  test.setTimeout(180_000);
  const store = await createTestStore(seedData(), 'sync');
  const owner = await openDevice(browser, store, { username: 'admin' });
  const kasir = await openDevice(browser, store, { username: 'kasir' });

  await owner.page.getByRole('button', { name: 'Barang' }).click();
  await owner.page.locator('tr', { hasText: 'Rantai Motor 428H' }).locator('button').last().click();
  await expect.poll(async () => (await readCloud(store)).items.some(item => item.id === '5'), { timeout: 30_000 }).toBe(false);

  // Kasir masih punya salinan lama berisi Rantai Motor, lalu bertransaksi (push dari perangkat kasir).
  await sellOneOli(kasir.page);
  await expect.poll(async () => (await readCloud(store)).sales?.length ?? 0, { timeout: 20_000 }).toBe(1);
  await kasir.page.getByRole('button', { name: 'Sync' }).click();

  expect((await readCloud(store)).items.some(item => item.id === '5')).toBe(false);
  await expect.poll(async () => (await readLocal(kasir.page)).items.some(item => item.id === '5')).toBe(false);

  await owner.context.close();
  await kasir.context.close();
});

test('dua kasir: satu offline menjual 2, satu online menjual 1 → stok akhir 21 di semua perangkat', async ({ browser }) => {
  test.setTimeout(180_000);
  const store = await createTestStore(seedData(), 'sync');
  const kasirA = await openDevice(browser, store, { username: 'kasir' });
  const kasirB = await openDevice(browser, store, { username: 'admin' });

  kasirA.setOffline(true);
  await sellOneOli(kasirA.page, 2); // tersimpan lokal karena cloud tidak terjangkau
  await sellOneOli(kasirB.page, 1);
  await expect.poll(async () => (await cloudItem(store, '1'))!.stock, { timeout: 20_000 }).toBe(23);

  kasirA.setOffline(false);
  await kasirA.page.getByRole('button', { name: 'Sync' }).click();
  // Push ulang otomatis setelah koneksi kembali membawa penjualan offline ke cloud.
  await expect.poll(async () => (await readCloud(store)).sales?.length ?? 0, { timeout: 40_000 }).toBe(2);
  expect((await cloudItem(store, '1'))!.stock).toBe(21);

  await kasirB.page.getByRole('button', { name: 'Sync' }).click();
  for (const device of [kasirA, kasirB]) {
    await expect.poll(async () => (await readLocal(device.page)).items.find(item => item.id === '1')!.stock).toBe(21);
  }

  await kasirA.context.close();
  await kasirB.context.close();
});
