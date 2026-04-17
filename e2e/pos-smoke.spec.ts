import { expect, test, type Page } from '@playwright/test';
import { mockAccounts, mockBranches, mockCustomers, mockItems, mockPromotions, mockSuppliers, mockUsers } from '../store';
import type { AppData, User } from '../types';

const STORAGE_KEY = 'HGROUP_ENTERPRISE_DATA';
const SESSION_KEY = 'HGROUP_USER_SESSION';

const buildSeedData = (users: User[]): AppData => ({
  users,
  items: mockItems.map(item => ({ ...item })),
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
  paymentRecords: [],
  promotions: mockPromotions.map(promo => ({ ...promo })),
  branches: mockBranches.map(branch => ({ ...branch })),
  aiConsultantHistory: [],
  floatingChatHistory: [],
  openRouterApiKey: '',
  aiModel: 'openrouter/auto',
});

const seedLocalAppData = async (page: Page, data: AppData) => {
  await page.addInitScript(
    ({ storageKey, sessionKey, payload }) => {
      window.localStorage.clear();
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
      window.localStorage.removeItem(sessionKey);
    },
    { storageKey: STORAGE_KEY, sessionKey: SESSION_KEY, payload: data },
  );
};

const login = async (page: Page, username: string, password = '123') => {
  await page.goto('/');
  await expect(page.getByPlaceholder('ID AKUN')).toBeVisible({ timeout: 60_000 });
  await page.getByPlaceholder('ID AKUN').fill(username);
  await page.locator('form input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /masuk dashboard/i }).click();
};

test('admin can access protected modules and operate cashier shift', async ({ page }) => {
  await login(page, 'admin');

  await expect(page.getByText('Dashboard Hulio Group')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pengaturan API' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manajemen User' })).toBeVisible();

  const openingCashInput = page.getByPlaceholder('Modal awal');
  await openingCashInput.fill('150000');
  await page.getByRole('button', { name: 'Buka Shift' }).click();

  await expect(page.getByText(/Shift aktif sejak/i)).toBeVisible();
  await expect(page.getByText(/Modal awal Rp/i)).toBeVisible();
  await expect(page.getByPlaceholder('Kas akhir')).toBeVisible();

  await page.getByRole('button', { name: 'Pembelian' }).click();
  await expect(page.getByPlaceholder(/Cari nomor faktur atau supplier/i)).toBeVisible();

  await page.getByRole('button', { name: 'Pengaturan API' }).click();
  await expect(page.getByText(/Pengaturan API & Cloud/i)).toBeVisible();
});

test('kasir can login, complete sale, and open linked return flow without admin access', async ({ page }) => {
  const relaxedUsers = mockUsers.map(user =>
    user.username === 'kasir'
      ? { ...user, schedule: { ...user.schedule, enabled: false } }
      : { ...user },
  );

  await seedLocalAppData(page, buildSeedData(relaxedUsers));
  await login(page, 'kasir');

  await expect(page.getByText('Dashboard Hulio Group')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Point of Sale (Kasir)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Daftar Penjualan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retur Penjualan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pengaturan API' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Manajemen User' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pembelian' })).toHaveCount(0);

  await page.getByRole('button', { name: /point of sale \(kasir\)/i }).click();
  await expect(page.getByText('TRANSAKSI BARU')).toBeVisible();

  await page.getByPlaceholder('Cari barang / barcode...').fill('Indomie');
  await page.getByText('Indomie Goreng Original').first().click();
  await expect(page.locator('text=1 ITEMS')).toBeVisible();

  await page.getByRole('button', { name: /^BAYAR$/ }).click();
  await expect(page.getByText('PEMBAYARAN')).toBeVisible();
  await page.getByRole('button', { name: /\+50K/i }).click();
  await page.getByRole('button', { name: /SELESAI & SIMPAN/i }).click();

  await expect(page.getByText('TRANSAKSI BERHASIL')).toBeVisible();
  await page.getByRole('button', { name: 'PENJUALAN BARU' }).click();

  await page.getByRole('button', { name: 'Daftar Penjualan' }).click();
  await expect(page.getByText('Umum / Retail')).toBeVisible();

  const invoiceNumber = await page.locator('tbody tr button').first().textContent();
  await page.locator('tbody tr').first().getByRole('button').last().click();

  await expect(page.getByRole('heading', { name: 'Manajemen Retur' })).toBeVisible();
  if (invoiceNumber) {
    await expect(page.getByPlaceholder('Contoh: INV-123456...')).toHaveValue(invoiceNumber.trim());
  }
  await expect(page.getByText('Daftar Barang Faktur')).toBeVisible();
  await expect(page.getByText('Indomie Goreng Original')).toBeVisible();
});

test('owner dashboard hides ERP Control Tower entry from sidebar', async ({ page }) => {
  await login(page, 'admin');
  await expect(page.getByRole('button', { name: 'ERP Control Tower' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Laporan (Report)' })).toBeVisible();
});
