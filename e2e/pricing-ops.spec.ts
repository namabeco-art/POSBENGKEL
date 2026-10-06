import { expect, test, type Page } from '@playwright/test';
import { mockAccounts, mockBranches, mockCustomers, mockItems, mockSuppliers, mockUsers } from '../store';
import type { AppData, Item } from '../types';

const STORAGE_KEY = 'HGROUP_ENTERPRISE_DATA';
const SESSION_KEY = 'HGROUP_USER_SESSION';

const buildSeed = (extraItems: Item[] = []): AppData => ({
  users: mockUsers.map(user => ({ ...user })),
  items: [...mockItems.map(item => ({ ...item })), ...extraItems],
  customers: mockCustomers.map(customer => ({ ...customer })),
  suppliers: mockSuppliers.map(supplier => ({ ...supplier })),
  accounts: mockAccounts.map(account => ({ ...account })),
  purchaseOrders: [],
  sales: [],
  returns: [],
  inventoryLogs: [],
  inventoryMovements: [],
  auditLogs: [],
  cashSessions: [],
  cashExpenses: [],
  paymentRecords: [],
  promotions: [],
  branches: mockBranches.map(branch => ({ ...branch })),
  aiConsultantHistory: [],
  floatingChatHistory: [],
});

const seed = async (page: Page, data: AppData) => {
  await page.addInitScript(
    ({ storageKey, sessionKey, payload }) => {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      window.localStorage.clear();
      indexedDB.deleteDatabase('POSHULIO_DB');
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
      window.localStorage.removeItem(sessionKey);
    },
    { storageKey: STORAGE_KEY, sessionKey: SESSION_KEY, payload: data },
  );
};

const login = async (page: Page, username: string) => {
  await page.goto('/');
  await page.locator('#login-user').fill(username);
  await page.locator('#login-pass').fill('123');
  await page.getByRole('button', { name: /masuk/i }).click();
  await expect(page.getByRole('button', { name: /keluar/i }).first()).toBeVisible();
};

const readStoredData = (page: Page): Promise<AppData> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), STORAGE_KEY);

const collectDialogs = (page: Page) => {
  const messages: string[] = [];
  page.on('dialog', dialog => { messages.push(dialog.message()); void dialog.accept(); });
  return messages;
};

test('owner menaikkan harga jual kategori Rem 10% dengan pembulatan Rp 500 (modal tidak berubah)', async ({ page }) => {
  collectDialogs(page);
  await seed(page, buildSeed());
  await login(page, 'admin');
  await page.getByRole('button', { name: 'Barang' }).click();
  await page.getByRole('button', { name: /Kelola Harga/ }).click();

  await page.getByRole('button', { name: 'Per Kategori' }).click();
  await page.locator('select').filter({ hasText: '-- Pilih Kategori --' }).selectOption('Rem');
  await page.getByRole('button', { name: /Naik/ }).click();
  await page.getByRole('button', { name: /Persen/ }).click();
  await page.getByPlaceholder('5', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Harga Jual saja' }).click();
  await page.getByRole('button', { name: 'Rp 500' }).click();
  await page.getByRole('button', { name: /Preview Perubahan/ }).click();
  await expect(page.getByText('Preview: 1 item akan berubah')).toBeVisible();
  await page.getByRole('button', { name: /Terapkan 1 Perubahan/ }).click();

  const data = await readStoredData(page);
  const kampas = data.items.find(item => item.id === '2')!;
  expect(kampas.basePrice).toBe(35000);
  expect(kampas.memberPrices).toEqual([49500, 47500, 46500, 44000]);
  expect(kampas.units[0].price).toBe(49500);
  expect(data.priceHistory![0]).toMatchObject({ itemId: '2', source: 'BULK', operatorName: 'Pemilik' });
});

test('import CSV ala Excel Indonesia (titik koma) memperbarui harga barang lama tanpa mengubah stok', async ({ page }) => {
  const dialogs = collectDialogs(page);
  await seed(page, buildSeed());
  await login(page, 'admin');
  await page.getByRole('button', { name: 'Barang' }).click();

  const csv = [
    'Kode;Nama;Kategori;Merk;Harga Dasar;Harga Level 1;Harga Level 2;Harga Level 3;Harga Level 4;Barcode;URL Gambar;Stok',
    'BUS-001;Busi NGK C7HSA;Kelistrikan;NGK;19.000;27.000;;;;8991003001;;999',
    'NEW-001;"Lampu LED H4, 12V";Kelistrikan;Osram;30000;45000;;;;;;12',
  ].join('\r\n');
  await page.locator('input[type="file"][accept=".csv"]').setInputFiles({ name: 'harga-baru.csv', mimeType: 'text/csv', buffer: Buffer.from('﻿' + csv) });
  await expect.poll(() => dialogs.find(message => message.startsWith('Import selesai'))).toContain('1 barang baru, 1 barang diperbarui');

  const data = await readStoredData(page);
  const busi = data.items.find(item => item.code === 'BUS-001')!;
  expect(busi.stock).toBe(50); // stok lama TIDAK tertimpa angka di CSV
  expect(busi.basePrice).toBe(19000);
  expect(busi.memberPrices).toEqual([27000, 23000, 22000, 20000]); // kolom kosong = harga lama
  const lampu = data.items.find(item => item.code === 'NEW-001')!;
  expect(lampu.name).toBe('Lampu LED H4, 12V');
  expect(lampu.stock).toBe(12);
  expect(data.priceHistory!.some(entry => entry.itemId === busi.id && entry.source === 'IMPORT')).toBe(true);
});

test('gudang melakukan opname massal lewat CSV dan kartu stok menampilkan pengurangan', async ({ page }) => {
  collectDialogs(page);
  await seed(page, buildSeed());
  await login(page, 'gudang');
  await page.getByRole('button', { name: 'Stok Opname' }).click();

  const csv = 'Kode Barang,Barcode,Nama Barang,Stok Sistem,Stok Fisik\nBUS-001,8991003001,Busi,50,47\nOLI-001,8991001001,Oli,24,\n';
  await page.locator('input[type="file"][accept=".csv,.txt"]').setInputFiles({ name: 'opname.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect.poll(async () => (await readStoredData(page)).items.find(item => item.code === 'BUS-001')!.stock).toBe(47);

  await page.getByRole('button', { name: 'Mutasi Stok' }).click();
  const row = page.locator('tr', { hasText: 'Busi NGK C7HSA' }).first();
  await expect(row).toContainText('-3');
  const data = await readStoredData(page);
  expect(data.items.find(item => item.code === 'OLI-001')!.stock).toBe(24); // stok fisik kosong = dilewati
});

test('retur tunai yang disetujui di shift ini mengurangi kas seharusnya saat tutup shift', async ({ page }) => {
  const dialogs = collectDialogs(page);
  await seed(page, buildSeed());
  await login(page, 'admin');

  await page.getByRole('button', { name: /buka shift kasir/i }).click();
  await page.locator('input[placeholder="0"]').first().fill('50000');
  await page.getByRole('button', { name: /mulai shift baru/i }).click();

  await page.getByRole('button', { name: 'Kasir', exact: true }).click();
  await page.getByPlaceholder('Cari barang / scan barcode...').fill('Busi');
  await page.getByText('Busi NGK C7HSA').first().click();
  await page.getByText('Busi NGK C7HSA').first().click();
  await page.getByRole('button', { name: /^bayar$/i }).click();
  await page.getByRole('button', { name: /SELESAI & SIMPAN/i }).click();
  await page.getByRole('button', { name: 'PENJUALAN BARU' }).click();

  await page.getByRole('button', { name: 'Retur' }).click();
  await page.locator('tbody tr').first().click();
  const busiRow = page.getByText('Busi NGK C7HSA', { exact: true }).last().locator('xpath=../..');
  await busiRow.locator('button').nth(1).click();
  await page.getByRole('button', { name: /PROSES RETUR/ }).click();
  await expect.poll(async () => (await readStoredData(page)).returns.length).toBe(1);

  await page.getByRole('button', { name: 'Dashboard' }).click();
  await page.getByRole('button', { name: /Tutup Shift/ }).first().click();
  await page.locator('input[placeholder="0"]').first().fill('75000');
  await page.getByRole('button', { name: /TUTUP SHIFT KASIR/ }).click();
  // 50.000 + 2 x 25.000 - 25.000 refund = 75.000
  await expect.poll(() => dialogs.some(message => message.includes('Kas sesuai.'))).toBe(true);
  const data = await readStoredData(page);
  expect(data.returns[0].cashSessionId).toBe(data.cashSessions[0].id);
  expect(data.items.find(item => item.code === 'BUS-001')!.stock).toBe(49);
});

test('kasir tidak bisa menjual barang yang harganya belum diatur', async ({ page }) => {
  const dialogs = collectDialogs(page);
  const unpriced: Item = {
    id: 'NOPRICE', code: 'NP-001', barcode: '8800009999', name: 'Barang Baru Tanpa Harga', category: 'Lainnya', brand: '',
    basePrice: 10000, memberPrices: [0, 0, 0, 0], units: [], stock: 10, warehouseId: 'W1', isActive: true,
  };
  await seed(page, buildSeed([unpriced]));
  await login(page, 'kasir');
  await page.getByRole('button', { name: 'Kasir', exact: true }).click();
  await page.getByPlaceholder('Cari barang / scan barcode...').fill('Tanpa Harga');
  await expect(page.getByText('Harga belum diatur')).toBeVisible();
  await page.getByText('Barang Baru Tanpa Harga').first().click();
  await expect.poll(() => dialogs.some(message => message.includes('belum diatur'))).toBe(true);
  await expect(page.locator('div.w-\\[380px\\]').getByText('Belum ada item')).toBeVisible();
});
