import { describe, expect, it } from 'vitest';
import { mergeAppData } from '../services/mergeService';
import { stampAppData, stampCollection, ITEM_FIELD_GROUPS } from '../services/syncMeta';
import type { AppData, Customer, Item } from '../types';

const item = (overrides: Partial<Item> = {}): Item => ({
  id: 'I1',
  code: 'OLI-001',
  barcode: '111',
  name: 'Oli',
  category: 'Oli',
  brand: 'X',
  basePrice: 45000,
  memberPrices: [55000, 0, 0, 0],
  units: [{ name: 'Botol', conversion: 1, price: 55000 }],
  stock: 24,
  warehouseId: 'W1',
  ...overrides,
});

const T1 = '2026-10-06T08:00:00.000Z';
const T2 = '2026-10-06T08:00:10.000Z';
const T3 = '2026-10-06T08:00:20.000Z';

describe('sinkronisasi: cap waktu perubahan', () => {
  it('hanya entitas yang berubah yang diberi cap waktu, per kelompok field', () => {
    const before = [item(), item({ id: 'I2', code: 'B' })];
    const after = before.map(entry => (entry.id === 'I1' ? { ...entry, memberPrices: [60000, 0, 0, 0] } : entry));
    const stamped = stampCollection(before, after, T1, { groups: ITEM_FIELD_GROUPS });
    expect(stamped[0].fieldUpdatedAt).toEqual({ price: T1 });
    expect(stamped[0].updatedAt).toBe(T1);
    expect(stamped[1]).toBe(before[1]); // tidak berubah → referensi sama, tanpa cap
  });

  it('stampAppData memberi cap pada hasil mutasi transaksi', () => {
    const prev: Partial<AppData> = { items: [item()] };
    const next: Partial<AppData> = { items: [item({ stock: 23 })] };
    const stamped = stampAppData(prev, next, T2);
    expect(stamped.items![0].fieldUpdatedAt).toEqual({ stock: T2 });
  });
});

describe('sinkronisasi: merge antar perangkat', () => {
  it('perubahan harga lokal yang belum terkirim TIDAK dikembalikan oleh data cloud lama', () => {
    const local = { items: [item({ memberPrices: [60000, 0, 0, 0], updatedAt: T2, fieldUpdatedAt: { price: T2 } })] };
    const remote = { items: [item()] }; // cloud belum menerima perubahan (tanpa cap waktu / lebih lama)
    const merged = mergeAppData(local, remote);
    expect(merged.items![0].memberPrices[0]).toBe(60000);
  });

  it('harga baru dari owner DAN stok baru dari kasir sama-sama dipertahankan', () => {
    // Owner (lokal) ubah harga pada T2; kasir (cloud) menjual 1 unit pada T3.
    const local = { items: [item({ memberPrices: [60000, 0, 0, 0], updatedAt: T2, fieldUpdatedAt: { price: T2 } })] };
    const remote = { items: [item({ stock: 23, updatedAt: T3, fieldUpdatedAt: { stock: T3 } })] };
    const merged = mergeAppData(local, remote).items![0];
    expect(merged.memberPrices[0]).toBe(60000);
    expect(merged.stock).toBe(23);
    expect(merged.fieldUpdatedAt).toEqual({ price: T2, stock: T3 });

    // Simetris: urutan local/remote dibalik memberi hasil sama.
    const reversed = mergeAppData(remote, local).items![0];
    expect(reversed.memberPrices[0]).toBe(60000);
    expect(reversed.stock).toBe(23);
  });

  it('data cloud yang lebih baru tetap menang', () => {
    const local = { items: [item({ memberPrices: [60000, 0, 0, 0], fieldUpdatedAt: { price: T1 }, updatedAt: T1 })] };
    const remote = { items: [item({ memberPrices: [65000, 0, 0, 0], fieldUpdatedAt: { price: T3 }, updatedAt: T3 })] };
    expect(mergeAppData(local, remote).items![0].memberPrices[0]).toBe(65000);
  });

  it('piutang pelanggan dari transaksi kasir tidak tertimpa edit profil di perangkat lain', () => {
    const base: Customer = { id: 'C2', name: 'Bengkel Jaya', phone: '0812', address: '-', creditLimit: 5_000_000, currentDebt: 0, level: 2 };
    const local = { customers: [{ ...base, name: 'Bengkel Jaya Motor', updatedAt: T2, fieldUpdatedAt: { base: T2 } }] };
    const remote = { customers: [{ ...base, currentDebt: 250_000, updatedAt: T3, fieldUpdatedAt: { balance: T3 } }] };
    const merged = mergeAppData(local, remote).customers![0];
    expect(merged.name).toBe('Bengkel Jaya Motor');
    expect(merged.currentDebt).toBe(250_000);
  });

  it('shift yang ditutup di perangkat ini tidak dibuka lagi oleh salinan cloud lama', () => {
    const local = { cashSessions: [{ id: 'CS1', userId: 'U2', userName: 'Kasir', openedAt: T1, openingCash: 0, status: 'CLOSED' as const, updatedAt: T2 }] };
    const remote = { cashSessions: [{ id: 'CS1', userId: 'U2', userName: 'Kasir', openedAt: T1, openingCash: 0, status: 'OPEN' as const }] };
    expect(mergeAppData(local, remote).cashSessions![0].status).toBe('CLOSED');
  });

  it('barang yang dihapus tidak muncul lagi dari salinan perangkat lain', () => {
    const local = { items: [], deletedRecords: [{ collection: 'items', id: 'I1', deletedAt: T2 }] };
    const remote = { items: [item()] };
    const merged = mergeAppData(local, remote);
    expect(merged.items).toEqual([]);
    expect(merged.deletedRecords).toHaveLength(1);
    // Perangkat lain yang menerima tombstone juga menghapus salinannya.
    expect(mergeAppData({ items: [item()] }, merged).items).toEqual([]);
  });

  it('pengeluaran kas yang dihapus tidak kembali lewat union append-only', () => {
    const expense = { id: 'KAS-1', date: '-', description: 'Bensin', amount: 20000, category: 'transport', createdAt: T1, operatorName: 'Kasir' };
    const merged = mergeAppData(
      { cashExpenses: [], deletedRecords: [{ collection: 'cashExpenses', id: 'KAS-1', deletedAt: T2 }] },
      { cashExpenses: [expense] },
    );
    expect(merged.cashExpenses).toEqual([]);
  });

  it('riwayat harga digabung (union) dari semua perangkat', () => {
    const log = (id: string, createdAt: string) => ({
      id, itemId: 'I1', itemCode: 'OLI-001', itemName: 'Oli', oldBasePrice: 1, newBasePrice: 2,
      oldMemberPrices: [1], newMemberPrices: [2], source: 'MANUAL' as const, operatorName: 'Owner', createdAt,
    });
    const merged = mergeAppData({ priceHistory: [log('P1', T1)] }, { priceHistory: [log('P2', T2)] });
    expect(merged.priceHistory!.map(entry => entry.id)).toEqual(['P2', 'P1']);
  });
});
