import { expect, test, type Page } from '@playwright/test';
import { createTestStore, openDevice, readCloud } from './cloudHarness';
import { mockAccounts, mockBranches, mockCustomers, mockItems, mockSuppliers, mockUsers } from '../store';
import type { AppData, Item } from '../types';
import { buildJournals, computeAccountBalances, journalTotals } from '../services/ledger';

/**
 * Mode Lengkap end-to-end: ganti mode, kasir (jasa, diskon baris, mekanik, tahan, bayar campuran),
 * Work Order + DP → faktur dengan deposit, gudang & transfer, retur beli, neraca seimbang,
 * dan sinkron piutang dua perangkat yang offline bersamaan.
 */

const STORAGE_KEY = 'HGROUP_ENTERPRISE_DATA';
const SESSION_KEY = 'HGROUP_USER_SESSION';

const jasa: Item = {
  id: 'J1', code: 'JASA-001', barcode: '', name: 'Jasa Servis Ringan', category: 'Jasa', brand: '', basePrice: 0,
  memberPrices: [50000, 0, 0, 0], units: [{ name: 'Paket', conversion: 1, price: 50000 }], stock: 0, warehouseId: 'W1', isActive: true, itemType: 'JASA',
};

const buildSeed = (mode: 'SIMPLE' | 'LENGKAP' = 'LENGKAP'): AppData => ({
  users: mockUsers.map(user => ({ ...user })),
  items: [...mockItems.map(item => ({ ...item })), { ...jasa }],
  customers: mockCustomers.map(customer => ({ ...customer })),
  suppliers: mockSuppliers.map(supplier => ({ ...supplier })),
  accounts: mockAccounts.map(account => ({ ...account })),
  purchaseOrders: [], sales: [], returns: [], inventoryLogs: [], inventoryMovements: [], auditLogs: [],
  cashSessions: [], cashExpenses: [], paymentRecords: [], promotions: [],
  branches: mockBranches.map(branch => ({ ...branch })),
  aiConsultantHistory: [], floatingChatHistory: [],
  appSettings: { mode },
  mechanics: [{ id: 'M1', name: 'Andi', defaultCommissionPercent: 10, isActive: true }],
});

const seed = async (page: Page, data: AppData) => {
  await page.addInitScript(({ key, sessionKey, payload }) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    indexedDB.deleteDatabase('POSHULIO_DB');
    localStorage.setItem(key, JSON.stringify(payload));
    localStorage.removeItem(sessionKey);
  }, { key: STORAGE_KEY, sessionKey: SESSION_KEY, payload: data });
};

const login = async (page: Page, username = 'admin') => {
  await page.goto('/');
  await page.locator('#login-user').fill(username);
  await page.locator('#login-pass').fill('123');
  await page.getByRole('button', { name: /masuk/i }).click();
  await expect(page.getByRole('button', { name: /keluar/i }).first()).toBeVisible();
};

const readStoredData = (page: Page): Promise<AppData> =>
  page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), STORAGE_KEY);

const openShift = async (page: Page, amount: string) => {
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await page.getByRole('button', { name: /buka shift kasir/i }).click();
  await page.locator('input[placeholder="0"]').first().fill(amount);
  await page.getByRole('button', { name: /mulai shift baru/i }).click();
  await expect(page.getByText(/Shift aktif sejak/i)).toBeVisible();
};

const addToCart = async (page: Page, search: string, name: string) => {
  await page.getByPlaceholder('Cari barang / scan barcode...').fill(search);
  await page.getByText(name).first().click();
};

const ledgerOf = (data: AppData) => computeAccountBalances(data.accounts, buildJournals(data));
const expectBalanced = (data: AppData) => {
  buildJournals(data).forEach(journal => { const totals = journalTotals(journal.lines); expect(totals.debit, journal.description).toBe(totals.credit); });
  const ledger = ledgerOf(data);
  const sum = (type: string) => ledger.filter(account => account.type === type).reduce((total, account) => total + account.balance, 0);
  expect(sum('ASSET')).toBe(sum('LIABILITY') + sum('EQUITY') + sum('INCOME') - sum('EXPENSE'));
};

test('owner mengganti mode Simple ↔ Lengkap dan menu ikut berubah', async ({ page }) => {
  page.on('dialog', dialog => void dialog.accept());
  await seed(page, buildSeed('SIMPLE'));
  await login(page);
  await expect(page.getByRole('button', { name: 'Servis / WO' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Pengaturan' }).click();
  await page.getByRole('button', { name: /Mode Lengkap/ }).click();
  await expect(page.getByRole('button', { name: 'Servis / WO' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Jurnal & Neraca' })).toBeVisible();
  expect((await readStoredData(page)).appSettings?.mode).toBe('LENGKAP');

  await page.getByRole('button', { name: /Mode Simple/ }).click();
  await expect(page.getByRole('button', { name: 'Servis / WO' })).toHaveCount(0);
});

test('kasir mode Lengkap: jasa + diskon baris + mekanik + tahan transaksi + bayar QRIS & tunai', async ({ page }) => {
  test.setTimeout(120_000);
  const dialogs: string[] = [];
  page.on('dialog', dialog => { dialogs.push(dialog.message()); void (dialog.type() === 'prompt' ? dialog.accept('Motor B 1234') : dialog.accept()); });
  await seed(page, buildSeed());
  await login(page);
  await openShift(page, '100000');

  await page.getByRole('button', { name: 'Kasir', exact: true }).click();
  await addToCart(page, 'Jasa Servis', 'Jasa Servis Ringan');
  await addToCart(page, 'Oli Mesin', 'Oli Mesin 1L SAE 10W-40');
  await page.getByLabel('Diskon Oli Mesin 1L SAE 10W-40').fill('10');
  await page.getByLabel('Mekanik Jasa Servis Ringan').selectOption('M1');
  await expect(page.getByText('Rp 99.500').first()).toBeVisible();

  // Tahan lalu lanjutkan transaksi.
  await page.getByRole('button', { name: /Tahan \(F3\)/ }).click();
  await expect(page.getByText('Belum ada item')).toBeVisible();
  expect((await readStoredData(page)).heldCarts).toHaveLength(1);
  await page.getByRole('button', { name: /Ditahan \(1\)/ }).click();
  await expect(page.getByText('Motor B 1234')).toBeVisible();
  await page.getByRole('button', { name: 'Lanjutkan' }).click();
  await expect(page.getByLabel('Diskon Oli Mesin 1L SAE 10W-40')).toHaveValue('10');

  await page.getByRole('button', { name: /^bayar$/i }).click();
  await page.getByLabel('Nominal non-tunai').fill('50000');
  await expect(page.getByText('Rp 49.500').first()).toBeVisible();
  await page.getByRole('button', { name: /SELESAI & SIMPAN/i }).click();
  await expect(page.getByText('TRANSAKSI BERHASIL')).toBeVisible();
  await page.getByRole('button', { name: 'PENJUALAN BARU' }).click();

  const data = await readStoredData(page);
  const [sale] = data.sales;
  expect(sale.total).toBe(99500);
  expect(sale.payments).toEqual([{ method: 'QRIS', amount: 50000 }, { method: 'TUNAI', amount: 49500 }]);
  const jasaLine = sale.items.find(line => line.itemId === 'J1')!;
  expect(jasaLine).toMatchObject({ isJasa: true, mechanicId: 'M1', commissionAmount: 5000 });
  expect(sale.items.find(line => line.itemId === '1')).toMatchObject({ discountAmount: 5500, total: 49500 });
  expect(data.inventoryMovements.filter(movement => movement.referenceNo === sale.invoiceNo).map(movement => movement.itemId)).toEqual(['1']);
  expect(data.heldCarts).toHaveLength(0);
  expectBalanced(data);
  expect(ledgerOf(data).find(account => account.code === '4-1200')!.balance).toBe(50000); // pendapatan jasa

  // Tutup shift: hanya bagian tunai (49.500) yang masuk laci.
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await page.getByRole('button', { name: /Tutup Shift/ }).first().click();
  await page.locator('input[placeholder="0"]').first().fill('149500');
  await page.getByRole('button', { name: /TUTUP SHIFT KASIR/ }).click();
  await expect.poll(() => dialogs.some(message => message.includes('Kas sesuai.'))).toBe(true);
});

test('Work Order dengan DP difakturkan di kasir memakai deposit; neraca tetap seimbang', async ({ page }) => {
  test.setTimeout(120_000);
  page.on('dialog', dialog => void dialog.accept());
  await seed(page, buildSeed());
  await login(page);

  await page.getByRole('button', { name: 'Servis / WO' }).click();
  await page.getByRole('button', { name: 'WO Baru' }).click();
  await page.getByLabel('Pelanggan terdaftar').selectOption('C2');
  await page.getByLabel('No. polisi').fill('b 1234 xy');
  await page.getByPlaceholder(/Tambah sparepart/).fill('Jasa Servis');
  await page.getByRole('button', { name: /Jasa Servis Ringan/ }).click();
  await page.getByPlaceholder(/Tambah sparepart/).fill('Busi');
  await page.getByRole('button', { name: /Busi NGK/ }).click();
  await page.getByRole('button', { name: 'Simpan WO' }).click();
  await expect(page.getByText('B 1234 XY')).toBeVisible();

  await page.getByRole('button', { name: 'DP', exact: true }).click();
  await page.getByLabel('Nominal DP (Rp)').fill('30000');
  await page.getByRole('button', { name: 'Simpan DP' }).click();
  await expect(page.getByText('Rp 30.000').first()).toBeVisible();

  await page.getByRole('button', { name: 'Faktur di Kasir' }).click();
  await expect(page.getByText(/Faktur Work Order/)).toBeVisible();
  await page.getByRole('button', { name: /^bayar$/i }).click();
  await expect(page.getByLabel(/^Deposit/)).toHaveValue('30000');
  await page.getByRole('button', { name: /SELESAI & SIMPAN/i }).click();
  await expect(page.getByText('TRANSAKSI BERHASIL')).toBeVisible();
  await page.getByRole('button', { name: 'PENJUALAN BARU' }).click();

  const data = await readStoredData(page);
  expect(data.serviceOrders![0]).toMatchObject({ status: 'DIFAKTURKAN', dpAmount: 30000 });
  expect(data.customers.find(customer => customer.id === 'C2')!.depositBalance).toBe(0);
  // Level 2: jasa 50.000 + busi 23.000 = 73.000; deposit 30.000 + tunai 43.000.
  expect(data.sales[0].payments).toEqual([{ method: 'DEPOSIT', amount: 30000 }, { method: 'TUNAI', amount: 43000 }]);
  expectBalanced(data);
  expect(ledgerOf(data).find(account => account.code === '2-1200')!.balance).toBe(0); // deposit habis dipakai

  await page.getByRole('button', { name: 'Jurnal & Neraca' }).click();
  await page.getByRole('button', { name: 'Neraca', exact: true }).click();
  await expect(page.getByText('Neraca seimbang')).toBeVisible();
});

test('gudang: transfer stok ke gudang lain lalu retur beli ke supplier', async ({ page }) => {
  test.setTimeout(120_000);
  page.on('dialog', dialog => void dialog.accept());
  await seed(page, buildSeed());
  await login(page);

  await page.getByRole('button', { name: 'Gudang & Transfer' }).click();
  await page.getByRole('button', { name: 'Tambah Gudang' }).click();
  await page.getByLabel('Nama gudang / cabang').fill('Gudang Belakang');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await page.getByRole('button', { name: 'Transfer Stok' }).click();
  await page.getByPlaceholder('Tambah barang...').fill('Busi');
  await page.getByRole('button', { name: /Busi NGK/ }).click();
  await page.getByLabel('Qty Busi NGK C7HSA').fill('10');
  await page.getByRole('button', { name: 'Pindahkan' }).click();

  let data = await readStoredData(page);
  const busi = data.items.find(item => item.id === '3')!;
  expect(busi.stock).toBe(50);
  expect(Object.values(busi.stockByWarehouse || {})).toEqual([10]);
  expect(data.stockTransfers).toHaveLength(1);

  // Kasir hanya bisa menjual stok gudang utama (40).
  await page.getByRole('button', { name: 'Kasir', exact: true }).click();
  await page.getByPlaceholder('Cari barang / scan barcode...').fill('Busi');
  await expect(page.getByText('40', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Retur Beli' }).click();
  await page.getByRole('button', { name: 'Retur Baru' }).click();
  await page.getByLabel('Penyelesaian').selectOption('REFUND_TUNAI');
  await page.getByPlaceholder('Tambah barang yang diretur...').fill('Busi');
  await page.getByRole('button', { name: /Busi NGK/ }).click();
  await page.getByLabel('Qty Busi NGK C7HSA').fill('2');
  await page.getByRole('button', { name: 'Simpan Retur' }).click();
  await expect(page.getByText('Refund tunai')).toBeVisible();

  data = await readStoredData(page);
  expect(data.items.find(item => item.id === '3')!.stock).toBe(48);
  expect(data.purchaseReturns![0]).toMatchObject({ total: 36000, settlement: 'REFUND_TUNAI' });
  expectBalanced(data);
});

// ---------------------------------------------------------------- Sinkron dua perangkat (backend Cloudflare asli, lokal)

const sellOnCredit = async (page: Page, search: string, name: string) => {
  await page.getByRole('button', { name: 'Kasir', exact: true }).click();
  await page.getByRole('button', { name: /Pelanggan/ }).first().click();
  await page.getByRole('button', { name: /Bengkel Jaya Motor/ }).first().click();
  await addToCart(page, search, name);
  await page.getByRole('button', { name: /^bayar$/i }).click();
  await page.getByRole('button', { name: /KREDIT/ }).click();
  await page.getByRole('button', { name: /SELESAI & SIMPAN/i }).click();
  await expect(page.getByText('TRANSAKSI BERHASIL')).toBeVisible();
  await page.getByRole('button', { name: 'PENJUALAN BARU' }).click();
};

test('dua kasir offline bersamaan menjual kredit ke pelanggan yang sama → piutang keduanya tercatat', async ({ browser }) => {
  test.setTimeout(180_000);
  const store = await createTestStore(buildSeed('SIMPLE'), 'debt');

  const kasirA = await openDevice(browser, store, { username: 'kasir' });
  const kasirB = await openDevice(browser, store, { username: 'admin' });
  const cloudDebt = async () => (await readCloud(store)).customers.find(customer => customer.id === 'C2')!.currentDebt;

  kasirA.setOffline(true);
  await sellOnCredit(kasirA.page, 'Oli Mesin', 'Oli Mesin 1L SAE 10W-40'); // Level 2: Rp 52.000, tersimpan lokal
  await sellOnCredit(kasirB.page, 'Kampas', 'Kampas Rem Depan Honda Beat'); // Level 2: Rp 43.000, langsung ke cloud
  await expect.poll(cloudDebt, { timeout: 20_000 }).toBe(43000);

  kasirA.setOffline(false);
  await kasirA.page.getByRole('button', { name: 'Sync' }).click();
  await expect.poll(async () => (await readCloud(store)).sales?.length ?? 0, { timeout: 40_000 }).toBe(2);
  await expect.poll(cloudDebt, { timeout: 40_000 }).toBe(95000);

  await kasirB.page.getByRole('button', { name: 'Sync' }).click();
  for (const device of [kasirA, kasirB]) {
    await expect.poll(async () => (await readStoredData(device.page)).customers.find(customer => customer.id === 'C2')!.currentDebt).toBe(95000);
  }
  expect((await readCloud(store)).customerLedger!.filter(entry => entry.kind === 'DEBT').map(entry => entry.delta).sort()).toEqual([43000, 52000]);

  await kasirA.context.close();
  await kasirB.context.close();
});

test('smoke: semua halaman mode Lengkap terbuka tanpa error; promo Beli X Gratis Y masuk otomatis di kasir', async ({ page, context }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => void dialog.accept());
  const data = buildSeed();
  data.customers = data.customers.map(customer => (customer.id === 'C2' ? { ...customer, depositBalance: 0 } : customer));
  await seed(page, data);
  await login(page);

  const pages: Array<[string, RegExp | string]> = [
    ['Servis / WO', 'WO Baru'],
    ['Mekanik & Komisi', 'Rekap komisi'],
    ['Promo', 'Beli X Gratis Y'],
    ['Deposit Pelanggan', 'Saldo per pelanggan'],
    ['Retur Beli', 'Riwayat retur pembelian'],
    ['Gudang & Transfer', 'Stok per gudang'],
    ['Jurnal & Neraca', 'Jurnal Manual'],
    ['Laporan Lengkap', 'Laba per barang'],
    ['Akuntansi', 'Buku Besar'],
  ];
  for (const [menu, marker] of pages) {
    await page.getByRole('button', { name: menu, exact: true }).click();
    await expect(page.getByText(marker).first(), menu).toBeVisible();
    await expect(page.getByText('Mengalami Error')).toHaveCount(0);
  }

  // Laporan Lengkap: semua tab terbuka.
  await page.getByRole('button', { name: 'Laporan Lengkap', exact: true }).click();
  for (const tab of ['Per Kategori/Merek/Mekanik/Supplier', 'Barang Tidak Laku', 'Jam & Hari Ramai', 'Mutasi Stok', 'Cek Garansi / Serial']) {
    await page.getByRole('button', { name: tab }).click();
    await expect(page.getByText('Mengalami Error')).toHaveCount(0);
  }

  // Deposit: setor Rp 25.000 untuk pelanggan.
  await page.getByRole('button', { name: 'Deposit Pelanggan', exact: true }).click();
  await page.locator('tr', { hasText: 'Bengkel Jaya Motor' }).getByRole('button', { name: 'Setor' }).click();
  await page.getByLabel('Nominal (Rp)').fill('25000');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.locator('tr', { hasText: 'Bengkel Jaya Motor' }).getByText('Rp 25.000', { exact: true }).first()).toBeVisible();

  // Mekanik baru.
  await page.getByRole('button', { name: 'Mekanik & Komisi', exact: true }).click();
  await page.getByRole('button', { name: 'Tambah Mekanik' }).click();
  await page.getByLabel('Nama', { exact: true }).fill('Budi');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByText('Budi').first()).toBeVisible();

  // Promo: beli 2 Oli gratis 1 Busi.
  await page.getByRole('button', { name: 'Promo', exact: true }).click();
  await page.getByRole('button', { name: 'Beli X Gratis Y' }).click();
  await page.getByLabel('Nama promo').fill('Oli 2 gratis busi');
  await page.getByLabel('Barang yang dibeli').selectOption('1');
  await page.getByLabel('Barang bonus').selectOption('3');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByText('Berlaku sekarang').first()).toBeVisible();

  await page.getByRole('button', { name: 'Kasir', exact: true }).click();
  await addToCart(page, 'Oli Mesin', 'Oli Mesin 1L SAE 10W-40');
  await page.getByText('Oli Mesin 1L SAE 10W-40').first().click();
  await expect(page.getByText(/Bonus Oli 2 gratis busi/)).toBeVisible();
  await page.getByRole('button', { name: /^bayar$/i }).click();
  await page.getByRole('button', { name: /SELESAI & SIMPAN/i }).click();
  await expect(page.getByText('TRANSAKSI BERHASIL')).toBeVisible();
  await page.getByRole('button', { name: 'PENJUALAN BARU' }).click();
  const stored = await readStoredData(page);
  const gift = stored.sales[0].items.find(line => line.isPromoGift)!;
  expect(gift).toMatchObject({ itemId: '3', qty: 1, total: 0, discountAmount: 25000 });
  expect(stored.items.find(item => item.id === '3')!.stock).toBe(49);
  expect(stored.sales[0].total).toBe(110000);
  expectBalanced(stored);

  // Master barang: form mode Lengkap & label barcode.
  await page.getByRole('button', { name: 'Barang', exact: true }).click();
  await page.getByRole('button', { name: 'Pilih Busi NGK C7HSA' }).click();
  const popup = context.waitForEvent('page');
  await page.getByTitle('Cetak label barcode').click();
  await expect(page.getByText(/Cetak label barcode \(1 barang\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Cetak', exact: true }).click();
  const labelPage = await popup;
  await expect(labelPage.locator('svg').first()).toBeVisible();
  await labelPage.close();
  await page.getByRole('button', { name: 'Tutup', exact: true }).last().click();
  await page.getByRole('button', { name: /TAMBAH BARANG/ }).first().click();
  await expect(page.getByText('JASA / ONGKOS (tanpa stok)')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  // Pengaturan mode Lengkap: backup otomatis & impor iPos tersedia.
  await page.getByRole('button', { name: 'Pengaturan', exact: true }).click();
  await expect(page.getByText('Backup Otomatis (perangkat ini)')).toBeVisible();
  await expect(page.getByText('Pindah dari iPos')).toBeVisible();
  await page.getByRole('button', { name: 'Backup sekarang' }).click();
  await expect(page.getByText(/Backup tersimpan di slot 1/)).toBeVisible();

  // Layar pelanggan (jendela kedua) menerima isi keranjang.
  const display = await context.newPage();
  await display.goto('/#customer-display');
  await expect(display.getByText('Terima kasih telah berbelanja')).toBeVisible();
  await page.getByRole('button', { name: 'Kasir', exact: true }).click();
  await addToCart(page, 'Kampas', 'Kampas Rem Depan Honda Beat');
  await expect(display.getByText('Kampas Rem Depan Honda Beat')).toBeVisible();
  await display.close();

  expect(errors).toEqual([]);
});
