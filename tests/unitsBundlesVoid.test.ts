import { describe, expect, it } from 'vitest';
import { completeReturn, completeSale, voidSaleStock } from '../services/posOperations';
import {
  describeSaleLine,
  findStockShortage,
  getAvailableStock,
  getItemCost,
  getSellUnits,
  syncUnitPrices,
} from '../services/pricing';
import { mergeAppData } from '../services/mergeService';
import { UserRole, type Item, type Sale, type SaleReturn, type User } from '../types';

const user: User = {
  id: 'U1', name: 'Owner', username: 'owner', passwordHash: 'x', role: UserRole.OWNER,
  permissions: ['sale.create', 'sale.void', 'return.approve'], schedule: { enabled: false, startTime: '08:00', endTime: '17:00' }, isActive: true,
};

const oli: Item = {
  id: 'OLI', code: 'OLI', barcode: '1', name: 'Oli 1L', category: 'Oli', brand: 'X', basePrice: 45000,
  memberPrices: [55000, 52000, 0, 0], units: [{ name: 'Botol', conversion: 1, price: 55000 }, { name: 'Dus (12)', conversion: 12, price: 600000 }],
  stock: 30, warehouseId: 'W1',
};
const filter: Item = {
  id: 'FLT', code: 'FLT', barcode: '2', name: 'Filter Oli', category: 'Oli', brand: 'X', basePrice: 20000,
  memberPrices: [30000, 0, 0, 0], units: [{ name: 'Pcs', conversion: 1, price: 30000 }], stock: 5, warehouseId: 'W1',
};
const paket: Item = {
  id: 'PKT', code: 'PKT', barcode: '3', name: 'Paket Ganti Oli', category: 'Paket', brand: '', basePrice: 0,
  memberPrices: [95000, 0, 0, 0], units: [{ name: 'Paket', conversion: 1, price: 95000 }], stock: 0, warehouseId: 'W1',
  isBundle: true, components: [{ itemId: 'OLI', name: 'Oli 1L', qty: 1, basePrice: 45000 }, { itemId: 'FLT', name: 'Filter Oli', qty: 1, basePrice: 20000 }],
};

const sale = (items: Sale['items'], overrides: Partial<Sale> = {}): Sale => ({
  id: 'S1', invoiceNo: 'INV-1', date: '-', customerId: 'UMUM', customerName: 'Umum', items,
  subtotal: items.reduce((sum, line) => sum + line.total, 0), tax: 0, total: items.reduce((sum, line) => sum + line.total, 0),
  paymentType: 'TUNAI', amountReceived: 0, changeAmount: 0, operatorName: 'Owner', ...overrides,
});

describe('satuan jual (Botol / Dus)', () => {
  it('menampilkan satuan dasar dengan harga level + satuan besar', () => {
    expect(getSellUnits(oli, 2)).toEqual([
      { name: 'Botol', conversion: 1, price: 52000 },
      { name: 'Dus (12)', conversion: 12, price: 600000 },
    ]);
  });

  it('menjual 1 Dus mengurangi 12 botol dan struk menulis "1 Dus (12)"', () => {
    const line = { itemId: 'OLI', name: 'Oli 1L', qty: 12, price: 50000, total: 600000, unitName: 'Dus (12)', unitQty: 1, unitPrice: 600000, conversion: 12 };
    const result = completeSale([oli, filter], sale([line]), user);
    expect(result.items.find(i => i.id === 'OLI')!.stock).toBe(18);
    expect(describeSaleLine(line)).toEqual({ qtyText: '1 Dus (12)', priceText: '600.000' });
  });

  it('harga Dus ikut naik dengan rasio yang sama saat harga Level 1 naik', () => {
    expect(syncUnitPrices(oli.units, 55000, 60500, 1000)).toEqual([
      { name: 'Botol', conversion: 1, price: 60500 },
      { name: 'Dus (12)', conversion: 12, price: 660000 },
    ]);
  });

  it('retur dari faktur berisi Dus + Botol menghitung total satuan dasar', () => {
    const lines = [
      { itemId: 'OLI', name: 'Oli 1L', qty: 12, price: 50000, total: 600000, unitName: 'Dus (12)', unitQty: 1, unitPrice: 600000, conversion: 12 },
      { itemId: 'OLI', name: 'Oli 1L', qty: 3, price: 55000, total: 165000, unitName: 'Botol', unitQty: 3, unitPrice: 55000, conversion: 1 },
    ];
    const ret = { id: 'R1', returnNo: 'RET-1', originalInvoiceNo: 'INV-1', date: '-', customerId: 'UMUM', customerName: 'Umum', items: [{ itemId: 'OLI', name: 'Oli 1L', qty: 15, price: 51000, reason: '-' }], totalReturn: 765000, operatorName: 'Owner' } as SaleReturn;
    const result = completeReturn([{ ...oli, stock: 15 }], [sale(lines)], [], ret, user);
    expect(result.items[0].stock).toBe(30);
    expect(() => completeReturn([oli], [sale(lines)], [], { ...ret, items: [{ ...ret.items[0], qty: 16 }] }, user)).toThrow(/melebihi/);
  });
});

describe('barang paket (bundle)', () => {
  it('stok & modal paket dihitung dari komponen', () => {
    expect(getAvailableStock(paket, [oli, filter, paket])).toBe(5); // dibatasi filter
    expect(getItemCost(paket, [oli, filter, paket])).toBe(65000);
  });

  it('menjual paket mengurangi stok komponen dan mencatat komponen di baris penjualan', () => {
    const result = completeSale([oli, filter, paket], sale([{ itemId: 'PKT', name: 'Paket Ganti Oli', qty: 2, price: 95000, total: 190000 }]), user);
    expect(result.items.find(i => i.id === 'OLI')!.stock).toBe(28);
    expect(result.items.find(i => i.id === 'FLT')!.stock).toBe(3);
    expect(result.items.find(i => i.id === 'PKT')!.stock).toBe(0);
    expect(result.saleItems[0].components).toEqual([{ itemId: 'OLI', name: 'Oli 1L', qty: 2 }, { itemId: 'FLT', name: 'Filter Oli', qty: 2 }]);
    expect(result.movements.map(m => m.itemId)).toEqual(['OLI', 'FLT']);
  });

  it('menolak paket bila komponen kurang, termasuk saat dijual bersama komponennya', () => {
    expect(() => completeSale([oli, { ...filter, stock: 1 }, paket], sale([{ itemId: 'PKT', name: 'Paket', qty: 2, price: 95000, total: 190000 }]), user)).toThrow(/Filter Oli/);
    const shortage = findStockShortage([{ item: paket, baseQty: 4 }, { item: filter, baseQty: 2 }], [oli, filter, paket]);
    expect(shortage).toEqual({ name: 'Filter Oli', needed: 6, available: 5 });
  });

  it('retur 1 dari 2 paket mengembalikan komponen secara proporsional', () => {
    const sold = completeSale([oli, filter, paket], sale([{ itemId: 'PKT', name: 'Paket Ganti Oli', qty: 2, price: 95000, total: 190000 }]), user);
    const saved = sale(sold.saleItems);
    const ret = { id: 'R1', returnNo: 'RET-1', originalInvoiceNo: 'INV-1', date: '-', customerId: 'UMUM', customerName: 'Umum', items: [{ itemId: 'PKT', name: 'Paket', qty: 1, price: 95000, reason: '-' }], totalReturn: 95000, operatorName: 'Owner' } as SaleReturn;
    const result = completeReturn(sold.items, [saved], [], ret, user);
    expect(result.items.find(i => i.id === 'OLI')!.stock).toBe(29);
    expect(result.items.find(i => i.id === 'FLT')!.stock).toBe(4);
  });
});

describe('void transaksi', () => {
  it('mengembalikan seluruh stok (termasuk komponen paket) dan menolak void ganda', () => {
    const sold = completeSale([oli, filter, paket], sale([
      { itemId: 'PKT', name: 'Paket Ganti Oli', qty: 1, price: 95000, total: 95000 },
      { itemId: 'OLI', name: 'Oli 1L', qty: 12, price: 50000, total: 600000, unitName: 'Dus (12)', unitQty: 1, unitPrice: 600000, conversion: 12 },
    ]), user);
    const saved = sale(sold.saleItems);
    const voided = voidSaleStock(sold.items, saved, user, 'salah input');
    expect(voided.items.find(i => i.id === 'OLI')!.stock).toBe(30);
    expect(voided.items.find(i => i.id === 'FLT')!.stock).toBe(5);
    expect(voided.movements.every(m => m.type === 'SALE_VOID' && m.direction === 'IN')).toBe(true);
    expect(voided.payment).toMatchObject({ direction: 'OUT', amount: 695000, method: 'VOID' });
    expect(() => voidSaleStock(sold.items, { ...saved, status: 'VOID' }, user, 'x')).toThrow(/sudah dibatalkan/);
  });

  it('faktur yang sudah void tidak bisa diretur', () => {
    const ret = { id: 'R1', returnNo: 'RET-1', originalInvoiceNo: 'INV-1', date: '-', customerId: 'UMUM', customerName: 'Umum', items: [{ itemId: 'OLI', name: 'Oli', qty: 1, price: 55000, reason: '-' }], totalReturn: 55000, operatorName: 'Owner' } as SaleReturn;
    const voidedSale = sale([{ itemId: 'OLI', name: 'Oli 1L', qty: 1, price: 55000, total: 55000 }], { status: 'VOID' });
    expect(() => completeReturn([oli], [voidedSale], [], ret, user)).toThrow(/void/);
  });

  it('status void dari perangkat lain tidak tertimpa salinan lama saat sinkron', () => {
    const base = sale([{ itemId: 'OLI', name: 'Oli 1L', qty: 1, price: 55000, total: 55000 }], { createdAt: '2026-10-06T08:00:00.000Z', status: 'COMPLETED' });
    const voided = { ...base, status: 'VOID' as const, updatedAt: '2026-10-06T09:00:00.000Z' };
    expect(mergeAppData({ sales: [base] }, { sales: [voided] }).sales![0].status).toBe('VOID');
    expect(mergeAppData({ sales: [voided] }, { sales: [base] }).sales![0].status).toBe('VOID');
  });
});
