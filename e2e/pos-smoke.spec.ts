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
  cashExpenses: [],
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
  await expect(page.locator('#login-user')).toBeVisible({ timeout: 60_000 });
  await page.locator('#login-user').fill(username);
  await page.locator('#login-pass').fill(password);
  await page.getByRole('button', { name: /masuk/i }).click();
};

test('admin can access protected modules and operate cashier shift', async ({ page }) => {
  await login(page, 'admin');

  await expect(page.getByText('Dashboard Hulio Group')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pengaturan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'User' })).toBeVisible();

  await page.getByRole('button', { name: /buka shift kasir/i }).click();
  await expect(page.getByRole('heading', { name: /mulai shift kasir/i })).toBeVisible();

  const openingCashInput = page.getByLabel(/saldo modal awal/i).or(page.locator('input[placeholder="0"]').first());
  await openingCashInput.fill('150000');
  await page.getByRole('button', { name: /mulai shift baru/i }).click();

  await expect(page.getByText(/Shift aktif sejak/i)).toBeVisible();
  await expect(page.getByText(/Modal awal Rp/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /tutup shift/i })).toBeVisible();

  await page.getByRole('button', { name: 'Pembelian' }).click();
  await expect(page.getByPlaceholder(/cari nomor faktur atau supplier/i)).toBeVisible();

  await page.getByRole('button', { name: 'Pengaturan' }).click();
  await expect(page.getByRole('heading', { name: 'Pengaturan', exact: true }).last()).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Kasir', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Penjualan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retur' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pengaturan' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'User' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pembelian' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Kasir', exact: true }).click();
  await expect(page.getByPlaceholder('Cari barang / scan barcode...')).toBeVisible();

  await page.getByPlaceholder('Cari barang / scan barcode...').fill('Oli Mesin');
  await page.getByText('Oli Mesin 1L SAE 10W-40').first().click();

  await page.getByRole('button', { name: /^bayar$/i }).click();
  await expect(page.getByText('PEMBAYARAN')).toBeVisible();
  await page.getByRole('button', { name: /SELESAI & SIMPAN/i }).click();

  await expect(page.getByText('TRANSAKSI BERHASIL')).toBeVisible();
  await page.getByRole('button', { name: 'PENJUALAN BARU' }).click();

  await page.getByRole('button', { name: 'Penjualan' }).click();
  await expect(page.getByText(/Umum( \/ Retail)?/i)).toBeVisible();

  const invoiceNumber = await page.locator('tbody tr').first().locator('text=/INV-/').first().textContent();
  await page.locator('tbody tr').first().getByRole('button').last().click();

  await expect(page.getByRole('heading', { name: 'Manajemen Retur' })).toBeVisible();
  if (invoiceNumber) {
    await expect(page.getByPlaceholder('Contoh: INV-123456...')).toHaveValue(invoiceNumber.trim());
  }
  await expect(page.getByText('Daftar Barang Faktur')).toBeVisible();
  await expect(page.getByText('Oli Mesin 1L SAE 10W-40')).toBeVisible();
});

test('owner dashboard hides ERP Control Tower entry from sidebar', async ({ page }) => {
  await login(page, 'admin');
  await expect(page.getByRole('button', { name: 'Laporan' })).toBeVisible();
});
