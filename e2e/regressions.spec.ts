import { expect, test, type Page } from '@playwright/test';
import { mockAccounts, mockBranches, mockCustomers, mockItems, mockPromotions, mockSuppliers, mockUsers } from '../store';
import type { AppData, Item, Sale } from '../types';

const STORAGE_KEY = 'HGROUP_ENTERPRISE_DATA';
const SESSION_KEY = 'HGROUP_USER_SESSION';

// Barang yang hanya diisi Harga Level 1 (default form: Level 2-4 = 0).
const onlyL1Item: Item = {
  id: 'L1ONLY',
  code: 'KOP-ABC-001',
  barcode: '8800000001',
  name: 'Kopi Sachet Spesial',
  category: 'Minuman',
  brand: 'ABC',
  basePrice: 15000,
  memberPrices: [20000, 0, 0, 0],
  units: [{ name: 'Pcs', conversion: 1, price: 20000 }],
  stock: 30,
  warehouseId: 'W1',
  isActive: true,
};

const seededSale: Sale = {
  id: 'SALE-SEED-1',
  invoiceNo: 'INV-SEED-0001',
  date: new Date().toLocaleDateString('id-ID') + ' 10.00.00',
  createdAt: new Date().toISOString(),
  customerId: 'UMUM',
  customerName: 'Umum',
  items: [
    { itemId: '1', name: 'Oli Mesin 1L SAE 10W-40', qty: 2, price: 55000, costPrice: 45000, total: 110000 },
    { itemId: '3', name: 'Busi NGK C7HSA', qty: 1, price: 25000, costPrice: 18000, total: 25000 },
  ],
  subtotal: 135000,
  tax: 0,
  total: 135000,
  paymentType: 'TUNAI',
  paymentMethod: 'TUNAI',
  amountReceived: 135000,
  changeAmount: 0,
  operatorName: 'Pemilik',
  status: 'COMPLETED',
};

const buildSeed = (overrides: Partial<AppData> = {}): AppData => ({
  users: mockUsers.map(user => ({ ...user })),
  items: [...mockItems.map(item => ({ ...item })), { ...onlyL1Item }],
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
  promotions: mockPromotions.map(promo => ({ ...promo })),
  branches: mockBranches.map(branch => ({ ...branch })),
  aiConsultantHistory: [],
  floatingChatHistory: [],
  ...overrides,
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

const login = async (page: Page, username: string, password = '123') => {
  await page.goto('/');
  await expect(page.locator('#login-user')).toBeVisible({ timeout: 60_000 });
  await page.locator('#login-user').fill(username);
  await page.locator('#login-pass').fill(password);
  await page.getByRole('button', { name: /masuk/i }).click();
};

const readStoredData = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), STORAGE_KEY);

test('POS: pelanggan level 2 tidak boleh mendapat harga Rp 0 untuk barang yang hanya punya harga Level 1', async ({ page }) => {
  await seed(page, buildSeed());
  await login(page, 'kasir');
  await page.getByRole('button', { name: 'Kasir', exact: true }).click();

  // Pilih pelanggan level 2
  await page.getByRole('button', { name: /Pelanggan/ }).first().click();
  await page.getByRole('button', { name: /Bengkel Jaya Motor/ }).first().click();

  await page.getByPlaceholder('Cari barang / scan barcode...').fill('Kopi Sachet');
  await page.getByText('Kopi Sachet Spesial').first().click();

  const cart = page.locator('div.w-\\[380px\\]');
  await expect(cart.getByText('Kopi Sachet Spesial')).toBeVisible();
  // Total keranjang harus mengikuti harga Level 1 (Rp 20.000), bukan Rp 0
  await expect(cart.getByText(/^Rp 20[.,]000$/).last()).toBeVisible();
});

test('Retur: mengisi alasan pada barang dengan qty 0 tidak boleh merusak stok', async ({ page }) => {
  await seed(page, buildSeed({ sales: [seededSale] }));
  await login(page, 'admin');
  await page.getByRole('button', { name: 'Retur' }).click();
  await page.getByText('INV-SEED-0001').first().click();
  await expect(page.getByText('Daftar Barang Faktur')).toBeVisible();

  // Retur 1 Oli, lalu ketik alasan di baris Busi (qty retur tetap 0)
  const oliRow = page.getByText('Oli Mesin 1L SAE 10W-40', { exact: true }).last().locator('xpath=../..');
  await oliRow.locator('button').nth(1).click();
  const busiRow = page.getByText('Busi NGK C7HSA', { exact: true }).last().locator('xpath=../..');
  await busiRow.locator('input[placeholder="Alasan..."]').fill('cek saja');

  const submit = page.getByRole('button', { name: /proses retur/i });
  if (await submit.isEnabled()) {
    await submit.click();
    await page.waitForTimeout(500);
  }
  const data = await readStoredData(page);
  const busi = data.items.find((item: Item) => item.id === '3');
  expect(Number.isFinite(busi.stock)).toBe(true);
  expect(busi.stock).toBe(50);
  for (const account of data.accounts) expect(Number.isFinite(account.balance)).toBe(true);
});

test('Gudang dengan izin stock.opname bisa membuka form opname', async ({ page }) => {
  await seed(page, buildSeed());
  await login(page, 'gudang');
  await page.getByRole('button', { name: 'Stok Opname' }).click();
  await expect(page.getByRole('button', { name: /opname baru/i })).toBeVisible();
});
