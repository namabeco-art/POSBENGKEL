import { expect, test, type Page } from '@playwright/test';
import { mockAccounts, mockBranches, mockCustomers, mockItems, mockPromotions, mockSuppliers, mockUsers } from '../store';
import type { AppData, Item } from '../types';
import { buildJournals, computeAccountBalances } from '../services/ledger';

/**
 * Simulasi satu hari operasional toko:
 * buka shift → jual tunai → jual kredit → pelunasan piutang → PO dengan harga modal naik →
 * tinjau & sesuaikan harga jual → cek riwayat harga → tutup shift dan cocokkan kas.
 */

const STORAGE_KEY = 'HGROUP_ENTERPRISE_DATA';
const SESSION_KEY = 'HGROUP_USER_SESSION';

const buildSeed = (): AppData => ({
  users: mockUsers.map(user => ({ ...user })),
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
  promotions: [], // tanpa promo otomatis agar angka mudah diverifikasi
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

const readStoredData = (page: Page): Promise<AppData> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), STORAGE_KEY);

const sellInPos = async (page: Page, query: string, itemName: string, times = 1) => {
  await page.getByPlaceholder('Cari barang / scan barcode...').fill(query);
  for (let i = 0; i < times; i += 1) await page.getByText(itemName).first().click();
};

test('simulasi satu hari operasional toko', async ({ page }) => {
  test.setTimeout(180_000);
  const dialogs: string[] = [];
  page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.accept(); });
  void mockPromotions;

  await seed(page, buildSeed());
  await page.goto('/');
  await page.locator('#login-user').fill('admin');
  await page.locator('#login-pass').fill('123');
  await page.getByRole('button', { name: /masuk/i }).click();

  // 1. Buka shift dengan modal Rp 100.000
  await page.getByRole('button', { name: /buka shift kasir/i }).click();
  await page.locator('input[placeholder="0"]').first().fill('100000');
  await page.getByRole('button', { name: /mulai shift baru/i }).click();
  await expect(page.getByText(/Shift aktif sejak/i)).toBeVisible();

  // 2. Penjualan tunai: 2 x Oli (Rp 55.000)
  await page.getByRole('button', { name: 'Kasir', exact: true }).click();
  await sellInPos(page, 'Oli Mesin', 'Oli Mesin 1L SAE 10W-40', 2);
  await page.getByRole('button', { name: /^bayar$/i }).click();
  await expect(page.getByText('PEMBAYARAN')).toBeVisible();
  await page.getByRole('button', { name: /SELESAI & SIMPAN/i }).click();
  await expect(page.getByText('TRANSAKSI BERHASIL')).toBeVisible();
  await page.getByRole('button', { name: 'PENJUALAN BARU' }).click();

  // 3. Penjualan kredit ke pelanggan level 2: Kampas Rem harga Level 2 = Rp 43.000
  await page.getByRole('button', { name: /Pelanggan/ }).first().click();
  await page.getByRole('button', { name: /Bengkel Jaya Motor/ }).first().click();
  await sellInPos(page, 'Kampas', 'Kampas Rem Depan Honda Beat');
  await page.getByRole('button', { name: /^bayar$/i }).click();
  await page.getByRole('button', { name: /KREDIT/ }).click();
  await page.getByRole('button', { name: /SELESAI & SIMPAN/i }).click();
  await expect(page.getByText('TRANSAKSI BERHASIL')).toBeVisible();
  await page.getByRole('button', { name: 'PENJUALAN BARU' }).click();
  // Setelah transaksi, pelanggan kembali ke Umum (mencegah salah tagih transaksi berikutnya).
  await expect(page.locator('div.w-\\[380px\\]').getByText('Umum', { exact: true })).toBeVisible();

  let data = await readStoredData(page);
  expect(data.customers.find(c => c.id === 'C2')!.currentDebt).toBe(43000);

  // 4. Pelanggan melunasi piutang secara tunai
  await page.getByRole('button', { name: 'Kontak' }).click();
  const customerRow = page.locator('tr', { hasText: 'Bengkel Jaya Motor' });
  await expect(customerRow.getByText('Piutang: Rp 43.000')).toBeVisible();
  await customerRow.getByRole('button', { name: /Bayar/ }).click();
  await page.getByRole('button', { name: /Simpan Pembayaran/ }).click();
  await expect(customerRow.getByText('Piutang: Rp 0')).toBeVisible();

  // 5. PO: 10 Oli dengan harga beli naik ke Rp 50.000
  await page.getByRole('button', { name: 'Pembelian' }).click();
  await page.getByRole('button', { name: /BUAT PO BARU/ }).click();
  await page.locator('select').filter({ hasText: '-- Pilih Supplier --' }).selectOption('S1');
  await page.getByPlaceholder('Ketik Nama / Scan...').fill('Oli');
  await page.getByRole('button', { name: /Oli Mesin 1L SAE 10W-40/ }).first().click();
  await page.getByTitle('Edit Item').first().click();
  await page.getByText('Kuantitas Pesanan').locator('xpath=following-sibling::input').fill('10');
  await page.getByText('Harga Satuan (Beli)').locator('xpath=following-sibling::input').fill('50000');
  await page.getByRole('button', { name: /Update Item PO/ }).click();
  await page.getByRole('button', { name: /SIMPAN PO/ }).click();

  await page.getByRole('button', { name: /TERIMA/ }).first().click();
  await page.getByRole('button', { name: /TERIMA BARANG/ }).click();

  // 6. Modal tinjau harga muncul: modal rata-rata (22 x 45.000 + 10 x 50.000) / 32 = 46.563
  await expect(page.getByRole('heading', { name: /Harga modal berubah/ })).toBeVisible();
  await expect(page.getByText('Rp 46.563')).toBeVisible();
  await page.getByRole('button', { name: /Sesuaikan harga jual \(1 barang\)/ }).click();

  data = await readStoredData(page);
  const oli = data.items.find((item: Item) => item.id === '1')!;
  expect(oli.stock).toBe(32);
  expect(oli.basePrice).toBe(46563);
  // 55.000 x 46.563 / 45.000 = 56.910,6 → dibulatkan ke atas kelipatan Rp 100 = 57.000
  expect(oli.memberPrices[0]).toBe(57000);
  expect(data.priceHistory!.filter(entry => entry.itemId === '1').map(entry => entry.source).sort()).toEqual(['COST_REVIEW', 'PURCHASE']);

  // 7. Riwayat harga terlihat di Master Barang
  await page.getByRole('button', { name: 'Barang' }).click();
  await page.locator('tr', { hasText: 'Oli Mesin 1L SAE 10W-40' }).locator('button').nth(1).click();
  await expect(page.getByText('Riwayat Harga Terakhir')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  // 8. Tutup shift: kas seharusnya 100.000 + 110.000 (tunai) + 43.000 (pelunasan) = 253.000
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await page.getByRole('button', { name: /Tutup Shift/ }).first().click();
  await page.locator('input[placeholder="0"]').first().fill('253000');
  await page.getByRole('button', { name: /TUTUP SHIFT KASIR/ }).click();
  await expect.poll(() => dialogs.some(message => message.includes('Kas sesuai.'))).toBe(true);

  data = await readStoredData(page);
  const closed = data.cashSessions[0];
  expect(closed.status).toBe('CLOSED');
  expect(closed.expectedCash).toBe(253000);
  expect(closed.shortageOrOverage).toBe(0);

  // Saldo akun = saldo awal + jurnal otomatis dari dokumen transaksi (sama seperti yang ditampilkan aplikasi).
  const ledger = computeAccountBalances(data.accounts, buildJournals(data));
  const balance = (code: string) => ledger.find(account => account.code === code)!.balance;
  expect(balance('1-1000')).toBe(5_000_000 + 110_000 + 43_000); // Kas Toko
  expect(balance('1-1200')).toBe(0); // Piutang lunas
  expect(balance('2-1100')).toBe(500_000); // Hutang supplier dari penerimaan PO
  expect(balance('4-1100')).toBe(110_000 + 43_000); // Penjualan
  expect(balance('1-1300')).toBe(data.accounts.find(account => account.code === '1-1300')!.balance + 500_000 - 2 * 45_000 - 35_000); // Persediaan: + PO - HPP 2 oli & 1 kampas
  const sum = (type: string) => ledger.filter(account => account.type === type).reduce((total, account) => total + account.balance, 0);
  expect(sum('ASSET')).toBe(sum('LIABILITY') + sum('EQUITY') + sum('INCOME') - sum('EXPENSE')); // neraca seimbang
});
