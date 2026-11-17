import { Item, PriceChangeLog, PriceChangeSource } from '../types';
import { createId } from './idService';
import { DEFAULT_WAREHOUSE_ID, getWarehouseStock } from './warehouses';

/**
 * Harga jual efektif untuk level pelanggan.
 * Harga level yang kosong/0 berarti "ikut harga Level 1" — tidak pernah menghasilkan Rp 0
 * selama Level 1 atau harga satuan dasar sudah diisi.
 */
export const getSellPrice = (item: Pick<Item, 'memberPrices' | 'units'>, level = 1): number => {
  const prices = Array.isArray(item.memberPrices) ? item.memberPrices : [];
  const levelPrice = Number(prices[Math.max(0, Math.min(3, level - 1))]);
  if (Number.isFinite(levelPrice) && levelPrice > 0) return levelPrice;
  const basePrice = Number(prices[0]);
  if (Number.isFinite(basePrice) && basePrice > 0) return basePrice;
  const unitPrice = Number(item.units?.find(unit => unit.conversion === 1)?.price ?? item.units?.[0]?.price);
  return Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 0;
};

/** Margin kotor (%) dari harga jual. Null jika harga jual belum ada. */
export const getMarginPercent = (sellPrice: number, cost: number): number | null => {
  if (!Number.isFinite(sellPrice) || sellPrice <= 0) return null;
  return ((sellPrice - (cost || 0)) / sellPrice) * 100;
};

export type RoundingStep = 0 | 100 | 500 | 1000;

/** Pembulatan ke atas ke kelipatan tertentu (umum di ritel: Rp 100 / 500 / 1.000). */
export const roundPrice = (value: number, step: RoundingStep = 0): number => {
  const safe = Math.max(0, Math.round(Number(value) || 0));
  if (!step) return safe;
  return Math.ceil(safe / step) * step;
};

/**
 * Membaca angka rupiah dari teks CSV/Excel dengan berbagai format:
 * "12500", "12.500", "12,500", "Rp 12.500", "12500.00", "12.500,50".
 * Mengembalikan undefined jika kosong/tidak valid.
 */
export const parseRupiah = (raw: unknown): number | undefined => {
  if (raw === null || raw === undefined) return undefined;
  let text = String(raw).trim().replace(/^rp\.?/i, '').replace(/\s/g, '');
  if (!text) return undefined;
  if (/[^0-9.,-]/.test(text)) return undefined;

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Separator terakhir adalah desimal, sisanya ribuan.
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandSep = decimalSep === '.' ? ',' : '.';
    text = text.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const parts = text.split(sep);
    const tail = parts[parts.length - 1];
    // "12.500" / "1.250.000" = pemisah ribuan; "12500.5" / "12500,50" = desimal.
    const looksLikeThousands = parts.length > 2 || (tail.length === 3 && parts[0].length <= 3);
    text = looksLikeThousands ? parts.join('') : `${parts.slice(0, -1).join('')}.${tail}`;
  }

  const value = Number(text);
  if (!Number.isFinite(value)) return undefined;
  return Math.round(value);
};

const samePrices = (a: number[] = [], b: number[] = []) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

export const hasPriceChanged = (before: Pick<Item, 'basePrice' | 'memberPrices'>, after: Pick<Item, 'basePrice' | 'memberPrices'>) =>
  before.basePrice !== after.basePrice || !samePrices(before.memberPrices, after.memberPrices);

/** Membuat log riwayat harga untuk setiap barang yang harganya berubah. */
export const buildPriceChangeLogs = (
  before: Item[],
  after: Item[],
  meta: { source: PriceChangeSource; operatorName: string; operatorId?: string; note?: string },
): PriceChangeLog[] => {
  const beforeMap = new Map(before.map(item => [item.id, item]));
  const createdAt = new Date().toISOString();
  const logs: PriceChangeLog[] = [];
  for (const item of after) {
    const previous = beforeMap.get(item.id);
    if (!previous || !hasPriceChanged(previous, item)) continue;
    logs.push({
      id: createId('PRC'),
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      oldBasePrice: previous.basePrice,
      newBasePrice: item.basePrice,
      oldMemberPrices: [...(previous.memberPrices || [])],
      newMemberPrices: [...(item.memberPrices || [])],
      source: meta.source,
      note: meta.note,
      operatorName: meta.operatorName,
      operatorId: meta.operatorId,
      createdAt,
    });
  }
  return logs;
};

export const PRICE_HISTORY_LIMIT = 5000;

/** Barang yang harga jual efektifnya (level mana pun) tidak lebih tinggi dari harga modal. */
export const getBelowCostLevels = (item: Pick<Item, 'basePrice' | 'memberPrices' | 'units'>): number[] => {
  if (!item.basePrice || item.basePrice <= 0) return [];
  const levels: number[] = [];
  for (let level = 1; level <= 4; level += 1) {
    const price = getSellPrice(item, level);
    if (price > 0 && price <= item.basePrice) levels.push(level);
  }
  return levels;
};

/**
 * Menaikkan/menurunkan harga jual mengikuti perubahan modal dengan margin rupiah-per-modal yang sama.
 * Contoh: modal 10.000 → 12.000 dan harga jual 13.000 → 15.600 (markup 30% dipertahankan).
 */
export const scaleSellPricesToCost = (
  memberPrices: number[],
  oldCost: number,
  newCost: number,
  step: RoundingStep = 0,
): number[] => {
  if (!oldCost || oldCost <= 0 || !newCost || newCost <= 0) return [...memberPrices];
  const ratio = newCost / oldCost;
  return memberPrices.map(price => (price > 0 ? roundPrice(price * ratio, step) : price));
};

/** Nama satuan dasar barang (conversion = 1), default "Pcs". */
export const getBaseUnitName = (item: Pick<Item, 'units'>): string =>
  item.units?.find(unit => unit.conversion === 1)?.name?.trim() || 'Pcs';

export interface SellUnit {
  name: string;
  conversion: number;
  price: number;
}

/**
 * Satuan yang bisa dijual di kasir: satuan dasar (harga mengikuti level pelanggan)
 * + satuan besar seperti Dus/Pak yang punya harga sendiri.
 */
export const getSellUnits = (item: Pick<Item, 'memberPrices' | 'units'>, level = 1): SellUnit[] => {
  const base: SellUnit = { name: getBaseUnitName(item), conversion: 1, price: getSellPrice(item, level) };
  const extras = (item.units || [])
    .filter(unit => unit.conversion > 1 && unit.price > 0 && unit.name?.trim())
    .map(unit => ({ name: unit.name.trim(), conversion: unit.conversion, price: unit.price }));
  return [base, ...extras];
};

/** Harga modal barang. Untuk paket: jumlah modal komponen saat ini (bukan angka saat paket dibuat). */
export const getItemCost = (item: Item, items: Item[]): number => {
  if (item.isBundle && item.components?.length) {
    return item.components.reduce((sum, component) => {
      const source = items.find(entry => entry.id === component.itemId);
      return sum + (source?.basePrice ?? component.basePrice ?? 0) * component.qty;
    }, 0);
  }
  return item.basePrice || 0;
};

/** Stok yang bisa dijual di kasir = stok gudang utama. Jasa tidak dibatasi stok. */
export const getSellableStock = (item: Item): number =>
  item.itemType === 'JASA' ? Number.POSITIVE_INFINITY : getWarehouseStock(item, DEFAULT_WAREHOUSE_ID);

/** Stok yang bisa dijual. Untuk paket: berapa paket yang bisa dirakit dari stok komponen. */
export const getAvailableStock = (item: Item, items: Item[]): number => {
  if (item.itemType === 'JASA') return Number.POSITIVE_INFINITY;
  if (item.isBundle && item.components?.length) {
    return Math.max(0, Math.min(...item.components.map(component => {
      const source = items.find(entry => entry.id === component.itemId);
      return source && component.qty > 0 ? Math.floor(getSellableStock(source) / component.qty) : 0;
    })));
  }
  return getSellableStock(item);
};

/** Kebutuhan stok riil (satuan dasar, per barang non-paket) dari daftar baris keranjang. */
export const getStockDemand = (lines: Array<{ item: Item; baseQty: number }>): Map<string, { item: Item | null; name: string; qty: number }> => {
  const demand = new Map<string, { item: Item | null; name: string; qty: number }>();
  const add = (id: string, name: string, qty: number) => {
    const current = demand.get(id);
    demand.set(id, { item: null, name, qty: (current?.qty || 0) + qty });
  };
  lines.forEach(({ item, baseQty }) => {
    if (item.itemType === 'JASA') return; // jasa tidak butuh stok
    if (item.isBundle && item.components?.length) {
      item.components.forEach(component => add(component.itemId, component.name, component.qty * baseQty));
    } else {
      add(item.id, item.name, baseQty);
    }
  });
  return demand;
};

/** Cari barang yang stoknya tidak cukup untuk keranjang ini. */
export const findStockShortage = (lines: Array<{ item: Item; baseQty: number }>, items: Item[]): { name: string; needed: number; available: number } | null => {
  for (const [itemId, entry] of getStockDemand(lines)) {
    const source = items.find(item => item.id === itemId);
    const available = source ? getSellableStock(source) : 0;
    if (entry.qty > available) return { name: source?.name || entry.name, needed: entry.qty, available };
  }
  return null;
};

/**
 * Sesuaikan harga satuan saat harga Level 1 berubah: satuan dasar = harga baru,
 * satuan besar (Dus/Pak) ikut naik/turun dengan rasio yang sama.
 */
export const syncUnitPrices = (units: Item['units'] | undefined, oldBasePrice: number, newBasePrice: number, step: RoundingStep = 0): Item['units'] => {
  if (!units?.length) return newBasePrice > 0 ? [{ name: 'Pcs', conversion: 1, price: newBasePrice }] : [];
  return units.map(unit => {
    if (unit.conversion === 1) return newBasePrice > 0 ? { ...unit, price: newBasePrice } : unit;
    if (!(oldBasePrice > 0) || !(newBasePrice > 0) || oldBasePrice === newBasePrice) return unit;
    return { ...unit, price: roundPrice(unit.price * (newBasePrice / oldBasePrice), step) };
  });
};

/** Label qty & harga baris penjualan untuk struk/daftar: "2 Dus (12) x Rp 600.000" atau "3 Botol x Rp 55.000". */
export const describeSaleLine = (line: { qty: number; price: number; unitName?: string; unitQty?: number; unitPrice?: number; conversion?: number }) => {
  const rupiah = (value: number) => Math.round(value || 0).toLocaleString('id-ID');
  if (line.unitName && line.unitQty && line.conversion && line.conversion > 1) {
    return { qtyText: `${line.unitQty} ${line.unitName}`, priceText: rupiah(line.unitPrice ?? line.price * line.conversion) };
  }
  return { qtyText: `${line.qty}${line.unitName ? ` ${line.unitName}` : ''}`, priceText: rupiah(line.price) };
};
