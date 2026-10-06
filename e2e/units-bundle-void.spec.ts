import { expect, test, type Page } from '@playwright/test';
import { mockAccounts, mockBranches, mockCustomers, mockItems, mockSuppliers, mockUsers } from '../store';
import type { AppData, Item } from '../types';

const STORAGE_KEY = 'HGROUP_ENTERPRISE_DATA';

const paket: Item = {
  id: 'PKT', code: 'PKT-001', barcode: '8800001111', name: 'Paket Ganti Oli + Busi', category: 'Paket', brand: '',
  basePrice: 63000, memberPrices: [75000, 0, 0, 0], units: [{ name: 'Paket', conversion: 1, price: 75000 }], stock: 0, warehouseId: 'W1',
  isBundle: true, isActive: true,
  components: [{ itemId: '1', name: 'Oli Mesin 1L SAE 10W-40', qty: 1, basePrice: 45000 }, { itemId: '3', name: 'Busi NGK C7HSA', qty: 1, basePrice: 18000 }],
};

const seedData = (): AppData => ({
  users: mockUsers.map(user => ({ ...user })),
  items: [...mockItems.map(item => ({ ...item })), { ...paket }],
  customers: mockCustomers.map(customer => ({ ...customer })),
  suppliers: mockSuppliers.map(supplier => ({ ...supplier })),
  accounts: mockAccounts.map(account => ({ ...account })),
  purchaseOrders: [], sales: [], returns: [], inventoryLogs: [], inventoryMovements: [], auditLogs: [],
  cashSessions: [], cashExpenses: [], paymentRecords: [], promotions: [],
  branches: mockBranches.map(branch => ({ ...branch })), aiConsultantHistory: [], floatingChatHistory: [],
});

const start = async (page: Page, username = 'admin') => {
  const dialogs: string[] = [];
  page.on('dialog', dialog => {
    dialogs.push(dialog.message());
    if (dialog.type() === 'prompt') void dialog.accept('Salah input qty');
    else void dialog.accept();
  });
  await page.addInitScript(({ key, payload }) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    indexedDB.deleteDatabase('POSHULIO_DB');
    localStorage.setItem(key, JSON.stringify(payload));
  }, { key: STORAGE_KEY, payload: seedData() });
  await page.goto('/');
  await page.locator('#login-user').fill(username);
  await page.locator('#login-pass').fill('123');
  await page.getByRole('button', { name: /masuk/i }).click();
  await expect(page.getByRole('button', { name: /keluar/i }).first()).toBeVisible();
  return dialogs;
};

const stored = (page: Page): Promise<AppData> => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), STORAGE_KEY);
const stockOf = async (page: Page, id: string) => (await stored(page)).items.find(item => item.id === id)!.stock;
const cart = (page: Page) => page.locator('div.w-\\[380px\\]');

const pay = async (page: Page) => {
  await page.getByRole('button', { name: /^bayar$/i }).click();
  await page.getByRole('button', { name: /SELESAI & SIMPAN/i }).click();
  await expect(page.getByText('TRANSAKSI BERHASIL')).toBeVisible();
  await page.getByRole('button', { name: 'PENJUALAN BARU' }).click();
};

test('kasir menjual oli per Dus (12) lalu owner membatalkan (void) transaksinya', async ({ page }) => {
  const dialogs = await start(page);
  await page.getByRole('button', { name: 'Kasir', exact: true }).click();
  await page.getByPlaceholder('Cari barang / scan barcode...').fill('Oli Mesin');
  await expect(page.getByText('Dus (12): Rp 600.000')).toBeVisible();
  await page.getByText('Oli Mesin 1L SAE 10W-40').first().click();
  await cart(page).getByLabel('Satuan Oli Mesin 1L SAE 10W-40').selectOption('Dus (12)');
  await expect(cart(page).getByText('Rp 600.000', { exact: true }).first()).toBeVisible();

  // Stok 24 botol = 2 dus; dus ke-3 harus ditolak.
  await cart(page).getByRole('button').filter({ has: page.locator('svg.lucide-plus') }).first().click();
  await cart(page).getByRole('button').filter({ has: page.locator('svg.lucide-plus') }).first().click();
  await expect.poll(() => dialogs.some(message => message.includes('tidak mencukupi (butuh 36, tersedia 24)'))).toBe(true);
  await pay(page);

  let data = await stored(page);
  expect(data.items.find(item => item.id === '1')!.stock).toBe(0);
  expect(data.sales[0].items[0]).toMatchObject({ qty: 24, unitName: 'Dus (12)', unitQty: 2, unitPrice: 600000, total: 1_200_000 });
  expect(data.accounts.find(account => account.code === '1-1000')!.balance).toBe(5_000_000 + 1_200_000);

  await page.getByRole('button', { name: 'Penjualan' }).click();
  await page.locator('tbody tr').first().getByRole('button').first().click();
  await expect(page.getByText('2 Dus (12) x Rp 600.000')).toBeVisible();
  await page.getByRole('button', { name: 'VOID' }).click();
  await expect.poll(async () => (await stored(page)).sales[0].status).toBe('VOID');

  data = await stored(page);
  expect(data.items.find(item => item.id === '1')!.stock).toBe(24);
  expect(data.sales[0].voidReason).toBe('Salah input qty');
  expect(data.accounts.find(account => account.code === '1-1000')!.balance).toBe(5_000_000);
  expect(data.accounts.find(account => account.code === '4-1100')!.balance).toBe(0);
  await expect(page.locator('tbody tr').first()).toContainText('Void');

  // Omzet dashboard tidak menghitung transaksi void.
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await expect(page.getByText('0 Transaksi')).toBeVisible();
});

test('menjual paket mengurangi stok komponen; stok paket mengikuti komponen', async ({ page }) => {
  await start(page, 'kasir');
  await page.getByRole('button', { name: 'Kasir', exact: true }).click();
  await page.getByPlaceholder('Cari barang / scan barcode...').fill('Paket Ganti');
  const card = page.getByRole('button', { name: /Paket Ganti Oli \+ Busi/ }).first();
  await expect(card).toContainText('24'); // dibatasi oli (24) & busi (50)
  await card.click();
  await card.click();
  await pay(page);

  expect(await stockOf(page, '1')).toBe(22);
  expect(await stockOf(page, '3')).toBe(48);
  expect(await stockOf(page, 'PKT')).toBe(0);
  const data = await stored(page);
  expect(data.sales[0].items[0].components).toEqual([
    { itemId: '1', name: 'Oli Mesin 1L SAE 10W-40', qty: 2 },
    { itemId: '3', name: 'Busi NGK C7HSA', qty: 2 },
  ]);
  // Modal paket = modal komponen saat transaksi.
  expect(data.sales[0].items[0].costPrice).toBe(63000);
});

test('owner menambah satuan "Pak (4)" untuk busi dan kasir bisa menjualnya', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Barang' }).click();
  await page.locator('tr', { hasText: 'Busi NGK C7HSA' }).locator('button').nth(1).click();
  await page.getByRole('button', { name: /Tambah satuan/ }).click();
  await page.getByLabel('Nama satuan', { exact: true }).fill('Pak (4)');
  await page.getByLabel('Isi satuan').fill('4');
  await page.getByLabel('Harga satuan').fill('90000');
  await expect(page.getByText('≈ Rp 22.500/Pcs')).toBeVisible();
  await page.getByRole('button', { name: /Update Master Barang/i }).click();

  const busi = (await stored(page)).items.find(item => item.id === '3')!;
  expect(busi.units).toEqual([{ name: 'Pcs', conversion: 1, price: 25000 }, { name: 'Pak (4)', conversion: 4, price: 90000 }]);
  expect(busi.stock).toBe(50);

  await page.getByRole('button', { name: 'Kasir', exact: true }).click();
  await page.getByPlaceholder('Cari barang / scan barcode...').fill('Busi');
  await page.getByText('Busi NGK C7HSA').first().click();
  await cart(page).getByLabel('Satuan Busi NGK C7HSA').selectOption('Pak (4)');
  await pay(page);
  expect(await stockOf(page, '3')).toBe(46);
});
