/**
 * Migrasi data dari iPos (Inspirasibiz) lewat file Excel yang disimpan sebagai CSV.
 * Kolom mengikuti template impor iPos 5 (folder "contoh"): KODE ITEM, BARCODE, NAMA ITEM, JENIS, SATUAN,
 * SATUAN DASAR, KONVERSI SATUAN DASAR, HARGA POKOK, HARGA JUAL, STOK MINIMUM, STOK, TIPE ITEM,
 * MENGGUNAKAN SERIAL, RAK, KODE SUPPLIER — plus kolom hasil "Export data item" (MEREK, HARGA JUAL 1-4).
 */
import { Customer, Item, Supplier } from '../types';
import { findColumn, parseCsv } from './csv';
import { createId } from './idService';
import { parseRupiah } from './pricing';
import { DEFAULT_WAREHOUSE_ID } from './warehouses';

export interface ImportResult<T> {
  rows: T[];
  errors: string[];
  /** Jumlah baris satuan tambahan yang digabung ke barang induknya. */
  mergedUnits?: number;
}

const cell = (row: string[], index: number) => (index >= 0 ? (row[index] || '').trim() : '');
const num = (value: string) => parseRupiah(value) ?? 0;
/** iPos memakai Y/T (Ya/Tidak). */
const yes = (value: string) => /^(y|ya|yes|1|true)$/i.test(value.trim());

/** Cari baris header (template iPos punya judul "DATA ITEM" di baris pertama). */
const locateHeader = (rows: string[][], mustHave: string[]): number => {
  for (let index = 0; index < Math.min(rows.length, 10); index += 1) {
    if (mustHave.every(name => findColumn(rows[index], [name]) >= 0)) return index;
  }
  return -1;
};

export const parseIposItems = (text: string): ImportResult<Item> => {
  const rows = parseCsv(text);
  const headerIndex = locateHeader(rows, ['nama item']) >= 0 ? locateHeader(rows, ['nama item']) : locateHeader(rows, ['nama']);
  if (headerIndex < 0) return { rows: [], errors: ['Header tidak ditemukan. Pastikan ada kolom "KODE ITEM" dan "NAMA ITEM".'] };
  const header = rows[headerIndex];
  const col = {
    code: findColumn(header, ['kode item', 'kode', 'kode barang']),
    barcode: findColumn(header, ['barcode']),
    name: findColumn(header, ['nama item', 'nama', 'nama barang']),
    category: findColumn(header, ['jenis', 'kategori']),
    brand: findColumn(header, ['merek', 'merk', 'brand']),
    unit: findColumn(header, ['satuan']),
    baseUnit: findColumn(header, ['satuan dasar']),
    conversion: findColumn(header, ['konversi satuan dasar', 'konversi', 'isi']),
    cost: findColumn(header, ['harga pokok', 'hpp', 'harga beli']),
    price1: findColumn(header, ['harga jual', 'harga jual 1', 'harga jual1', 'harga level 1', 'level 1']),
    price2: findColumn(header, ['harga jual 2', 'harga jual2', 'harga level 2', 'level 2']),
    price3: findColumn(header, ['harga jual 3', 'harga jual3', 'harga level 3', 'level 3']),
    price4: findColumn(header, ['harga jual 4', 'harga jual4', 'harga level 4', 'level 4']),
    minStock: findColumn(header, ['stok minimum', 'stok min', 'minimum']),
    stock: findColumn(header, ['stok', 'stock', 'saldo']),
    type: findColumn(header, ['tipe item', 'tipe']),
    serial: findColumn(header, ['menggunakan serial', 'serial']),
  };
  if (col.code < 0 || col.name < 0) return { rows: [], errors: ['Kolom "KODE ITEM" dan "NAMA ITEM" wajib ada.'] };

  const items: Item[] = [];
  const errors: string[] = [];
  let mergedUnits = 0;
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const line = headerIndex + offset + 2;
    const code = cell(row, col.code).toUpperCase();
    const name = cell(row, col.name);
    if (!code && !name) return;
    const unitName = cell(row, col.unit) || 'Pcs';
    const baseUnitName = cell(row, col.baseUnit) || unitName;
    const conversion = Math.max(1, Math.round(num(cell(row, col.conversion)) || 1));
    const price1 = num(cell(row, col.price1));

    // Baris satuan besar (SATUAN ≠ SATUAN DASAR) untuk kode yang sama → satuan tambahan barang induk.
    const parent = items.find(item => item.code === code);
    if (parent && conversion > 1 && unitName.toLowerCase() !== baseUnitName.toLowerCase()) {
      if (price1 > 0 && !parent.units.some(unit => unit.name.toLowerCase() === unitName.toLowerCase())) {
        parent.units = [...parent.units, { name: unitName, conversion, price: price1 }];
        mergedUnits += 1;
      }
      return;
    }
    if (!code) { errors.push(`Baris ${line}: kode item kosong.`); return; }
    if (!name) { errors.push(`Baris ${line}: nama item kosong.`); return; }
    if (parent) { errors.push(`Baris ${line}: kode ${code} muncul lebih dari sekali.`); return; }

    const typeText = cell(row, col.type).toLowerCase();
    const isJasa = /jasa|service|servis|non/.test(typeText);
    const memberPrices = [price1, num(cell(row, col.price2)), num(cell(row, col.price3)), num(cell(row, col.price4))];
    const stock = isJasa ? 0 : Math.max(0, Math.round(num(cell(row, col.stock))));
    items.push({
      id: createId('ITEM'),
      code,
      barcode: cell(row, col.barcode).replace(/\s/g, ''),
      name,
      category: cell(row, col.category) || 'Umum',
      brand: cell(row, col.brand),
      basePrice: Math.max(0, num(cell(row, col.cost))),
      memberPrices,
      units: [{ name: baseUnitName, conversion: 1, price: price1 }],
      stock,
      warehouseId: DEFAULT_WAREHOUSE_ID,
      reorderLevel: Math.max(0, Math.round(num(cell(row, col.minStock)))) || undefined,
      isActive: true,
      itemType: isJasa ? 'JASA' : 'BARANG',
      trackSerial: col.serial >= 0 ? yes(cell(row, col.serial)) : undefined,
    });
  });
  return { rows: items, errors, mergedUnits };
};

export const parseIposContacts = (text: string, kind: 'customer' | 'supplier'): ImportResult<Customer | Supplier> => {
  const rows = parseCsv(text);
  const headerIndex = locateHeader(rows, ['nama']);
  if (headerIndex < 0) return { rows: [], errors: ['Header tidak ditemukan. Pastikan ada kolom "NAMA".'] };
  const header = rows[headerIndex];
  const col = {
    name: findColumn(header, ['nama']),
    address: findColumn(header, ['alamat']),
    city: findColumn(header, ['kota']),
    phone: findColumn(header, ['telepon', 'telp', 'hp', 'no hp']),
    limit: findColumn(header, ['limit kredit', 'limit piutang', 'limit']),
  };
  const result: Array<Customer | Supplier> = [];
  const errors: string[] = [];
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const name = cell(row, col.name);
    if (!name) {
      if (row.some(value => value)) errors.push(`Baris ${headerIndex + offset + 2}: nama kosong.`);
      return;
    }
    const address = [cell(row, col.address), cell(row, col.city)].filter(Boolean).join(', ') || '-';
    const phone = cell(row, col.phone) || '-';
    if (kind === 'customer') {
      result.push({ id: createId('CUST'), name, phone, address, creditLimit: Math.max(0, num(cell(row, col.limit))), currentDebt: 0, level: 1 });
    } else {
      result.push({ id: createId('SUP'), name, phone, address });
    }
  });
  return { rows: result, errors };
};

export interface OpeningBalanceRow {
  customerName: string;
  amount: number;
}

/** Saldo awal piutang: kolom NAMA/KODE PELANGGAN + NILAI/SALDO/SISA. Baris per pelanggan dijumlahkan. */
export const parseOpeningReceivables = (text: string): ImportResult<OpeningBalanceRow> => {
  const rows = parseCsv(text);
  const headerIndex = (() => {
    for (let index = 0; index < Math.min(rows.length, 10); index += 1) {
      const hasName = findColumn(rows[index], ['nama pelanggan', 'pelanggan', 'nama', 'kode pelanggan']) >= 0;
      const hasAmount = findColumn(rows[index], ['nilai', 'saldo', 'sisa', 'jumlah', 'piutang', 'total']) >= 0;
      if (hasName && hasAmount) return index;
    }
    return -1;
  })();
  if (headerIndex < 0) return { rows: [], errors: ['Butuh kolom nama pelanggan dan nilai/saldo piutang.'] };
  const header = rows[headerIndex];
  const nameCol = findColumn(header, ['nama pelanggan', 'pelanggan', 'nama', 'kode pelanggan']);
  const amountCol = findColumn(header, ['sisa', 'saldo', 'nilai', 'piutang', 'jumlah', 'total']);
  const totals = new Map<string, number>();
  const errors: string[] = [];
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const name = cell(row, nameCol);
    const amount = num(cell(row, amountCol));
    if (!name && !amount) return;
    if (!name || !(amount > 0)) { errors.push(`Baris ${headerIndex + offset + 2}: nama/nilai tidak valid.`); return; }
    totals.set(name, (totals.get(name) || 0) + amount);
  });
  return { rows: Array.from(totals.entries()).map(([customerName, amount]) => ({ customerName, amount })), errors };
};
