import { describe, expect, it } from 'vitest';
import {
  buildPriceChangeLogs,
  getBelowCostLevels,
  getMarginPercent,
  getSellPrice,
  parseRupiah,
  roundPrice,
  scaleSellPricesToCost,
} from '../services/pricing';
import type { Item } from '../types';

const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: 'I1',
  code: 'KOP-001',
  barcode: '111',
  name: 'Kopi',
  category: 'Minuman',
  brand: 'ABC',
  basePrice: 15000,
  memberPrices: [20000, 0, 0, 0],
  units: [{ name: 'Pcs', conversion: 1, price: 20000 }],
  stock: 10,
  warehouseId: 'W1',
  ...overrides,
});

describe('getSellPrice', () => {
  it('memakai harga Level 1 jika harga level pelanggan kosong (0) — tidak pernah Rp 0', () => {
    const item = makeItem();
    expect(getSellPrice(item, 1)).toBe(20000);
    expect(getSellPrice(item, 2)).toBe(20000);
    expect(getSellPrice(item, 4)).toBe(20000);
  });

  it('memakai harga level jika diisi', () => {
    const item = makeItem({ memberPrices: [20000, 19000, 18000, 17000] });
    expect(getSellPrice(item, 3)).toBe(18000);
  });

  it('jatuh ke harga satuan dasar lalu 0 jika semua kosong', () => {
    expect(getSellPrice(makeItem({ memberPrices: [0, 0, 0, 0] }), 2)).toBe(20000);
    expect(getSellPrice(makeItem({ memberPrices: [], units: [] }), 1)).toBe(0);
  });
});

describe('parseRupiah', () => {
  it.each([
    ['12500', 12500],
    ['12.500', 12500],
    ['12,500', 12500],
    ['Rp 12.500', 12500],
    ['1.250.000', 1250000],
    ['12500.00', 12500],
    ['12.500,50', 12501],
    ['125.000', 125000],
  ])('%s → %i', (raw, expected) => {
    expect(parseRupiah(raw)).toBe(expected);
  });

  it('mengembalikan undefined untuk kosong atau teks', () => {
    expect(parseRupiah('')).toBeUndefined();
    expect(parseRupiah('   ')).toBeUndefined();
    expect(parseRupiah('abc')).toBeUndefined();
    expect(parseRupiah(undefined)).toBeUndefined();
  });
});

describe('roundPrice & margin', () => {
  it('membulatkan ke atas ke kelipatan', () => {
    expect(roundPrice(12340, 100)).toBe(12400);
    expect(roundPrice(12340, 500)).toBe(12500);
    expect(roundPrice(12000, 1000)).toBe(12000);
    expect(roundPrice(12340, 0)).toBe(12340);
    expect(roundPrice(-5, 100)).toBe(0);
  });

  it('menghitung margin kotor', () => {
    expect(getMarginPercent(20000, 15000)).toBeCloseTo(25);
    expect(getMarginPercent(0, 15000)).toBeNull();
  });

  it('menandai level yang dijual rugi', () => {
    expect(getBelowCostLevels(makeItem({ basePrice: 20000 }))).toEqual([1, 2, 3, 4]);
    expect(getBelowCostLevels(makeItem({ memberPrices: [20000, 15000, 0, 0] }))).toEqual([2]);
    expect(getBelowCostLevels(makeItem({ basePrice: 0 }))).toEqual([]);
  });

  it('menyesuaikan harga jual mengikuti kenaikan modal (markup tetap)', () => {
    expect(scaleSellPricesToCost([13000, 12500, 0, 0], 10000, 12000, 100)).toEqual([15600, 15000, 0, 0]);
    expect(scaleSellPricesToCost([13000], 0, 12000)).toEqual([13000]);
  });
});

describe('buildPriceChangeLogs', () => {
  it('hanya mencatat barang yang harganya berubah', () => {
    const before = [makeItem(), makeItem({ id: 'I2', code: 'B', name: 'B' })];
    const after = [makeItem({ memberPrices: [21000, 0, 0, 0] }), makeItem({ id: 'I2', code: 'B', name: 'B', stock: 3 })];
    const logs = buildPriceChangeLogs(before, after, { source: 'MANUAL', operatorName: 'Owner' });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ itemId: 'I1', oldMemberPrices: [20000, 0, 0, 0], newMemberPrices: [21000, 0, 0, 0], source: 'MANUAL' });
  });
});
