import { expect, test } from '@playwright/test';
import { mockAccounts, mockBranches, mockCustomers, mockUsers } from '../store';
import type { AppData, Item, User } from '../types';
import { cloudVersion, createTestStore, loginUser, openDevice, readCloud } from './cloudHarness';

/**
 * Keamanan cloud toko di backend Cloudflare asli (lokal): hanya perangkat yang login akun cloud toko
 * yang boleh membaca/menulis data; perangkat lain ditolak dan diberi peringatan.
 */

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

test('perangkat baru harus login cloud toko; data toko dipakai utuh tanpa data contoh', async ({ browser }) => {
  test.setTimeout(120_000);
  const store = await createTestStore(storeData(), 'sec');
  const { page, context } = await openDevice(browser, store, { connected: false, displayName: 'Toko Sembako 1' });

  // Belum terhubung: user toko (sari) belum ada di perangkat ini.
  await page.locator('#login-user').fill('sari');
  await page.locator('#login-pass').fill('123');
  await page.getByRole('button', { name: /masuk/i }).click();
  await expect(page.getByText('Username atau Password salah!')).toBeVisible();

  await page.getByRole('button', { name: /Hubungkan perangkat ke cloud toko Toko Sembako 1/ }).click();
  await page.getByLabel('Email akun cloud toko').fill(store.email);
  await page.getByLabel('Password akun cloud toko').fill('salah-sekali');
  await page.getByRole('button', { name: /Hubungkan ke Cloud/ }).click();
  await expect(page.getByText('Email atau password cloud salah.')).toBeVisible();

  await page.getByLabel('Password akun cloud toko').fill(store.password);
  await page.getByRole('button', { name: /Hubungkan ke Cloud/ }).click();
  await expect(page.getByText(`terhubung sebagai ${store.email}`)).toBeVisible();

  await loginUser(page, 'sari');
  await page.getByRole('button', { name: 'Kasir', exact: true }).click();
  await page.getByPlaceholder('Cari barang / scan barcode...').fill('Oli');
  await expect(page.getByText('Oops! Produk Tidak Ada')).toBeVisible(); // barang contoh tidak ikut masuk
  await page.getByPlaceholder('Cari barang / scan barcode...').fill('Gula');
  await page.getByText('Gula Pasir 1kg').first().click();
  await page.getByRole('button', { name: /^bayar$/i }).click();
  await page.getByRole('button', { name: /SELESAI & SIMPAN/i }).click();
  await expect(page.getByText('TRANSAKSI BERHASIL')).toBeVisible();

  const data = await readCloud(store);
  expect(data.sales).toHaveLength(1);
  expect(data.items.find(item => item.id === 'G1')!.stock).toBe(39);
  expect(data.items.map(item => item.id).sort()).toEqual(['G1', 'M1']);
  expect(data.users.map(user => user.username).sort()).toEqual(['admin', 'sari']);
  await context.close();
});

test('perangkat tanpa login cloud tidak bisa menimpa data toko dan diberi peringatan', async ({ browser }) => {
  test.setTimeout(120_000);
  const store = await createTestStore(storeData(), 'sec');
  const before = await cloudVersion(store);
  const { page, context } = await openDevice(browser, store, { connected: false, displayName: 'Toko Sembako 1' });

  // Login dengan user bawaan lokal, lalu ubah data → simpan ke cloud ditolak server (401).
  await loginUser(page, 'admin');
  await page.getByRole('button', { name: 'Barang' }).click();
  await page.locator('tr', { hasText: 'Busi NGK C7HSA' }).locator('button').nth(1).click();
  await page.getByText('Harga Level 1').locator('xpath=following-sibling::input').fill('26000');
  await page.getByRole('button', { name: /Update Master Barang/i }).click();

  await expect(page.getByText(/belum terkirim ke cloud/)).toBeVisible({ timeout: 20_000 });
  expect(await cloudVersion(store)).toBe(before); // data toko tidak tersentuh
  expect((await readCloud(store)).items.map(item => item.id).sort()).toEqual(['G1', 'M1']);

  // Hubungkan lewat banner → Pengaturan, peringatan hilang dan data toko masuk.
  await page.getByRole('button', { name: 'Hubungkan di Pengaturan' }).click();
  await page.getByLabel('Email akun cloud toko').fill(store.email);
  await page.getByLabel('Password akun cloud toko').fill(store.password);
  await page.getByRole('button', { name: /Hubungkan ke Cloud/ }).click();
  await expect(page.getByText(`terhubung sebagai ${store.email}`)).toBeVisible();
  await expect(page.getByText(/belum terkirim ke cloud/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Barang' }).click();
  await expect(page.getByText('Gula Pasir 1kg')).toBeVisible();
  await expect(page.getByText('Busi NGK C7HSA')).toHaveCount(0);
  await context.close();
});

test('owner mendaftarkan toko baru dari aplikasi; ganti password mengeluarkan perangkat lain', async ({ browser }) => {
  test.setTimeout(120_000);
  // Toko yang belum terdaftar: perangkat owner mendaftarkannya lewat panel Keamanan Cloud.
  const storeId = `reg-${Date.now().toString(36)}`;
  const store = { storeId, email: `${storeId}@toko.test`, password: 'PasswordToko#1', token: '' };
  const owner = await openDevice(browser, store, { connected: false });
  await loginUser(owner.page, 'admin');
  await owner.page.getByRole('button', { name: 'Pengaturan', exact: true }).click();
  await owner.page.getByRole('button', { name: /Hubungkan perangkat ke cloud toko/ }).click();
  await owner.page.getByRole('button', { name: /Daftarkan toko baru/ }).click();
  await owner.page.getByLabel('Email akun cloud toko').fill(store.email);
  await owner.page.getByLabel('Password akun cloud toko').fill(store.password);
  await owner.page.getByLabel('Ulangi password').fill(store.password);
  await owner.page.getByLabel('Kode pendaftaran toko').fill('kode-salah');
  await owner.page.getByRole('button', { name: /Daftarkan & Hubungkan/ }).click();
  await expect(owner.page.getByText('Kode pendaftaran toko salah.')).toBeVisible();
  await owner.page.getByLabel('Kode pendaftaran toko').fill('dev-setup-key');
  await owner.page.getByRole('button', { name: /Daftarkan & Hubungkan/ }).click();
  await expect(owner.page.getByText(`terhubung sebagai ${store.email}`)).toBeVisible();

  // Data perangkat owner terunggah ke cloud toko baru.
  const ownerToken = await owner.page.evaluate(() => JSON.parse(localStorage.getItem('POS_CLOUD_SESSION_CF') || '{}').token);
  await expect.poll(async () => (await readCloud({ ...store, token: ownerToken })).items?.length ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);

  // Perangkat kasir login, lalu owner mengganti password → sesi kasir dicabut.
  const kasir = await openDevice(browser, store, { username: 'kasir' });
  await owner.page.getByRole('button', { name: 'Ganti password' }).click();
  await owner.page.getByLabel('Password lama').fill(store.password);
  await owner.page.getByLabel('Password baru').fill('PasswordBaru#2');
  await owner.page.getByLabel('Ulangi password').fill('PasswordBaru#2');
  await owner.page.getByRole('button', { name: 'Simpan password baru' }).click();
  await expect(owner.page.getByText(/Perangkat lain harus login ulang/)).toBeVisible();

  await kasir.page.getByRole('button', { name: 'Sync' }).click();
  await expect(kasir.page.getByText(/belum terkirim ke cloud/)).toBeVisible({ timeout: 20_000 });
  await owner.context.close();
  await kasir.context.close();
});
