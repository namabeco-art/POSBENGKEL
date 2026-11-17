import { describe, expect, it } from 'vitest';
import type { AppData, Customer, InventoryMovement, Item, PromotionCampaign, PurchaseOrder, Sale, SaleReturn, User } from '../types';
import { UserRole } from '../types';
import { parseLineDiscount } from '../services/discount';
import { allocateReturnRefund, getSaleCashAmount, getSaleCreditAmount, getSalePayments, saleUsesPaymentType, summarizePaymentType } from '../services/salePayments';
import { computePromoGifts, getTransactionPromotions, isPromotionActiveAt } from '../services/promotions';
import { ACC, buildJournals, buildSaleLines, computeAccountBalances, computeProfitAndLoss, ensureLedgerAccounts, journalTotals, validateJournalLines } from '../services/ledger';
import { mergeAppData } from '../services/mergeService';
import { applyBalanceChanges } from '../services/customerLedger';
import { getWarehouseStock, transferStock } from '../services/warehouses';
import { adjustStock, completeSale, receivePurchaseOrderStock, voidSaleStock } from '../services/posOperations';
import { assertPeriodOpen, createPurchaseReturn, getPurchaseOrderOutstanding, payCommission, postManualJournal, receiveServiceOrderDp, refundDeposit, saveServiceOrder, topupDeposit, transferStockOp } from '../services/fullOps';
import { computeLineCommission, summarizeCommissions } from '../services/commission';
import { encodeCode128, encodeCostCipher, code128Svg } from '../services/code128';
import { parseIposContacts, parseIposItems, parseOpeningReceivables } from '../services/iposImport';
import { canAccessTab, getAccessibleTabs } from '../services/permissions';
import { getAvailableStock, findStockShortage } from '../services/pricing';
import { mockAccounts } from '../store';

const owner: User = {
  id: 'U1', name: 'Pemilik', username: 'admin', passwordHash: 'x', role: UserRole.OWNER,
  permissions: ['sale.create', 'stock.view', 'report.view', 'accounting.view', 'item.edit', 'purchase.view'],
  schedule: { enabled: false, startTime: '08:00', endTime: '17:00' }, isActive: true,
};

const item = (overrides: Partial<Item> = {}): Item => ({
  id: 'I1', code: 'OLI', barcode: '111', name: 'Oli', category: 'Oli', brand: 'X', basePrice: 40000,
  memberPrices: [50000, 0, 0, 0], units: [{ name: 'Botol', conversion: 1, price: 50000 }], stock: 10, warehouseId: 'W1',
  ...overrides,
});

const customer = (overrides: Partial<Customer> = {}): Customer => ({
  id: 'C1', name: 'Budi', phone: '-', address: '-', creditLimit: 1_000_000, currentDebt: 0, level: 1, ...overrides,
});

const sale = (overrides: Partial<Sale> = {}): Sale => ({
  id: 'S1', invoiceNo: 'INV-1', date: '1/1/2026', createdAt: '2026-11-01T03:00:00.000Z', customerId: 'C1', customerName: 'Budi',
  items: [{ itemId: 'I1', name: 'Oli', qty: 2, price: 50000, total: 100000, costPrice: 40000 }],
  subtotal: 100000, tax: 0, total: 100000, paymentType: 'TUNAI', amountReceived: 100000, changeAmount: 0, operatorName: 'Kasir',
  ...overrides,
});

const baseData = (overrides: Partial<AppData> = {}): AppData => ({
  users: [owner], items: [item()], customers: [customer()], suppliers: [{ id: 'S1', name: 'Astra', phone: '-', address: '-' }],
  accounts: mockAccounts.map(account => ({ ...account })), purchaseOrders: [], sales: [], returns: [], inventoryLogs: [], inventoryMovements: [],
  auditLogs: [], cashSessions: [], cashExpenses: [], paymentRecords: [], promotions: [], branches: [], aiConsultantHistory: [], floatingChatHistory: [],
  ...overrides,
});

describe('diskon baris', () => {
  it('memahami persen, persen bertingkat, dan rupiah', () => {
    expect(parseLineDiscount('10', 100000)).toBe(10000);
    expect(parseLineDiscount('10%', 100000)).toBe(10000);
    expect(parseLineDiscount('10+5', 100000)).toBe(14500); // 100.000 → 90.000 → 85.500
    expect(parseLineDiscount('10+5+2', 100000)).toBe(16210);
    expect(parseLineDiscount('5000', 100000)).toBe(5000);
    expect(parseLineDiscount('Rp 5.000', 100000)).toBe(5000);
    expect(parseLineDiscount('200000', 100000)).toBe(100000); // tidak melebihi nilai baris
    expect(parseLineDiscount('abc', 100000)).toBe(0);
    expect(parseLineDiscount('', 100000)).toBe(0);
  });
});

describe('pembayaran campuran', () => {
  it('data lama dianggap satu metode, data baru memakai payments', () => {
    expect(getSalePayments(sale())).toEqual([{ method: 'TUNAI', amount: 100000 }]);
    expect(getSalePayments(sale({ paymentType: 'NON-TUNAI', paymentMethod: 'TRANSFER' }))).toEqual([{ method: 'TRANSFER', amount: 100000 }]);
    const split = sale({ payments: [{ method: 'TUNAI', amount: 30000 }, { method: 'QRIS', amount: 50000 }, { method: 'KREDIT', amount: 20000 }] });
    expect(getSaleCashAmount(split)).toBe(30000);
    expect(getSaleCreditAmount(split)).toBe(20000);
    expect(saleUsesPaymentType(split, 'KREDIT')).toBe(true);
    expect(summarizePaymentType(split.payments!)).toBe('NON-TUNAI');
  });

  it('refund retur mengurangi piutang dulu, lalu deposit, bank, tunai', () => {
    const split = sale({ payments: [{ method: 'DEPOSIT', amount: 20000 }, { method: 'KREDIT', amount: 50000 }, { method: 'TUNAI', amount: 30000 }] });
    expect(allocateReturnRefund(split, 80000, { currentDebt: 50000 })).toEqual({ credit: 50000, deposit: 20000, bank: 0, cash: 10000 });
    // Piutang sudah dibayar sebagian → sisanya dikembalikan tunai, bukan hilang.
    expect(allocateReturnRefund(split, 80000, { currentDebt: 10000 })).toEqual({ credit: 10000, deposit: 20000, bank: 0, cash: 50000 });
    // Retur kedua tidak memakai kapasitas yang sudah dikembalikan.
    expect(allocateReturnRefund(split, 30000, { currentDebt: 50000, alreadyRefunded: { credit: 50000, deposit: 20000 } })).toEqual({ credit: 0, deposit: 0, bank: 0, cash: 30000 });
  });
});

describe('promo terjadwal & beli X gratis Y', () => {
  const base: PromotionCampaign = { id: 'P1', name: 'Happy hour', type: 'PERCENT', value: 10, startAt: '2026-01-01T00:00:00.000Z', isActive: true };
  it('hari & jam berlaku, termasuk jam lewat tengah malam', () => {
    const monday10 = new Date(2026, 10, 16, 10, 30); // Senin
    expect(isPromotionActiveAt({ ...base, daysOfWeek: [1], timeStart: '10:00', timeEnd: '12:00' }, monday10)).toBe(true);
    expect(isPromotionActiveAt({ ...base, daysOfWeek: [2] }, monday10)).toBe(false);
    expect(isPromotionActiveAt({ ...base, timeStart: '22:00', timeEnd: '02:00' }, new Date(2026, 10, 16, 1, 0))).toBe(true);
    expect(isPromotionActiveAt({ ...base, timeStart: '22:00', timeEnd: '02:00' }, monday10)).toBe(false);
    expect(isPromotionActiveAt({ ...base, minCustomerLevel: 2 }, monday10, 1)).toBe(false);
  });
  it('promo faktur memperhatikan minimal belanja dan tidak mencampur promo bonus', () => {
    const promos = [{ ...base, minSubtotal: 200000 }, { ...base, id: 'P2', kind: 'BUY_X_GET_Y' as const }];
    expect(getTransactionPromotions(promos, new Date(2026, 10, 16), 1, 100000)).toHaveLength(0);
    expect(getTransactionPromotions(promos, new Date(2026, 10, 16), 1, 250000).map(promo => promo.id)).toEqual(['P1']);
  });
  it('bonus kelipatan & prioritas', () => {
    const promos: PromotionCampaign[] = [
      { ...base, id: 'B1', kind: 'BUY_X_GET_Y', buyItemId: 'I1', buyQty: 2, freeItemId: 'I2', freeQty: 1, isMultiple: true, priority: 2 },
      { ...base, id: 'B2', kind: 'BUY_X_GET_Y', buyItemId: 'I1', buyQty: 1, freeItemId: 'I3', freeQty: 1, priority: 1 },
    ];
    expect(computePromoGifts(promos, new Map([['I1', 5]]), new Date(2026, 10, 16), 1)).toEqual([{ promoId: 'B2', promoName: 'Happy hour', freeItemId: 'I3', freeQty: 1 }]);
    expect(computePromoGifts([promos[0]], new Map([['I1', 5]]), new Date(2026, 10, 16), 1)[0].freeQty).toBe(2);
  });
});

describe('buku besar otomatis', () => {
  it('jurnal penjualan campuran + jasa seimbang dan mencatat HPP', () => {
    const lines = buildSaleLines(sale({
      items: [
        { itemId: 'I1', name: 'Oli', qty: 2, price: 50000, total: 100000, costPrice: 40000 },
        { itemId: 'J1', name: 'Servis', qty: 1, price: 50000, total: 50000, isJasa: true, costPrice: 0 },
      ],
      subtotal: 150000, total: 150000,
      payments: [{ method: 'TUNAI', amount: 100000 }, { method: 'DEPOSIT', amount: 50000 }],
    }));
    const totals = journalTotals(lines);
    expect(totals.debit).toBe(totals.credit);
    const find = (code: string) => lines.find(line => line.accountCode === code);
    expect(find(ACC.KAS)?.debit).toBe(100000);
    expect(find(ACC.DEPOSIT)?.debit).toBe(50000);
    expect(find(ACC.PENJUALAN)?.credit).toBe(100000);
    expect(find(ACC.JASA)?.credit).toBe(50000);
    expect(find(ACC.HPP)?.debit).toBe(80000);
    expect(find(ACC.PERSEDIAAN)?.credit).toBe(80000);
  });

  it('dokumen lama tanpa ledgerV dilewati; void membatalkan jurnal penjualan', () => {
    const legacy = sale({ id: 'OLD' });
    const fresh = sale({ id: 'NEW', invoiceNo: 'INV-2', ledgerV: 1, status: 'VOID', voidLedgerV: 1, voidedAt: '2026-11-01T04:00:00.000Z' });
    const journals = buildJournals({ sales: [legacy, fresh] });
    expect(journals.map(journal => journal.referenceType)).toEqual(['SALE', 'SALE_VOID']);
    const balances = computeAccountBalances(ensureLedgerAccounts(mockAccounts, []), journals);
    expect(balances.find(account => account.code === ACC.KAS)?.balance).toBe(5_000_000);
  });

  it('neraca seimbang setelah migrasi akun & transaksi', () => {
    const accounts = ensureLedgerAccounts(mockAccounts, [item({ stock: 10, basePrice: 40000 })]);
    expect(accounts.find(account => account.code === ACC.PERSEDIAAN)?.balance).toBe(400000);
    const po: PurchaseOrder = { id: 'PO1', date: '', dueDate: '', termOfPayment: 0, discount: 0, supplierId: 'S1', supplierName: 'Astra', items: [{ itemId: 'I1', name: 'Oli', orderedQty: 5, receivedQty: 0, cost: 42000 }], subtotal: 210000, total: 210000, status: 'PENDING', isPaid: false, ledgerV: 1 };
    const receipt = receivePurchaseOrderStock([item()], po, [{ itemId: 'I1', receivedQty: 5 }], owner);
    const ret: SaleReturn = { id: 'R1', returnNo: 'RET-1', originalInvoiceNo: 'INV-1', date: '', createdAt: '2026-11-02T00:00:00.000Z', customerId: 'C1', customerName: 'Budi', items: [{ itemId: 'I1', name: 'Oli', qty: 1, price: 50000, reason: 'x' }], totalReturn: 50000, operatorName: 'x', status: 'APPROVED', ledgerV: 1, refund: { credit: 0, deposit: 0, cash: 50000, bank: 0 } };
    const journals = buildJournals({
      sales: [sale({ ledgerV: 1 })],
      returns: [ret],
      purchaseOrders: [po],
      inventoryMovements: receipt.movements,
      paymentRecords: [{ id: 'PY', referenceNo: 'PO1', referenceType: 'PURCHASE_ORDER', amount: 100000, method: 'Tunai', direction: 'OUT', createdAt: '2026-11-03T00:00:00.000Z', operatorName: 'x', ledgerV: 1 }],
      cashExpenses: [{ id: 'E1', date: '', description: 'Listrik', amount: 25000, category: 'x', createdAt: '2026-11-03T00:00:00.000Z', operatorName: 'x', ledgerV: 1 }],
    });
    journals.forEach(journal => { const totals = journalTotals(journal.lines); expect(totals.debit).toBe(totals.credit); });
    const balances = computeAccountBalances(accounts, journals);
    const sum = (type: string) => balances.filter(account => account.type === type).reduce((total, account) => total + account.balance, 0);
    expect(sum('ASSET')).toBe(sum('LIABILITY') + sum('EQUITY') + sum('INCOME') - sum('EXPENSE'));
    expect(balances.find(account => account.code === ACC.HUTANG)?.balance).toBe(110000);
    const pnl = computeProfitAndLoss(accounts, journals, '2026-01-01T00:00:00.000Z', '2026-12-31T23:59:59.999Z');
    // Penjualan 100rb - retur 50rb = 50rb; HPP 80rb - 40rb = 40rb; listrik 25rb → rugi 15rb.
    expect(pnl.net).toBe(-15000);
  });

  it('validasi jurnal manual', () => {
    expect(validateJournalLines([{ accountCode: '1-1000', debit: 100, credit: 0 }])).toMatch(/minimal 2/);
    expect(validateJournalLines([{ accountCode: '1-1000', debit: 100, credit: 0 }, { accountCode: '3-1000', debit: 0, credit: 90 }])).toMatch(/tidak seimbang/);
    expect(validateJournalLines([{ accountCode: '1-1000', debit: 100, credit: 0 }, { accountCode: '3-1000', debit: 0, credit: 100 }])).toBeNull();
  });
});

describe('sinkron saldo pelanggan lewat buku besar pelanggan', () => {
  it('dua kasir offline menjual kredit ke pelanggan sama → piutang keduanya tercatat', () => {
    const start = baseData();
    const deviceA = applyBalanceChanges(start.customers, [{ customerId: 'C1', kind: 'DEBT', delta: 100000, referenceNo: 'A', referenceType: 'SALE' }], owner, '2026-11-01T01:00:00.000Z');
    const deviceB = applyBalanceChanges(start.customers, [{ customerId: 'C1', kind: 'DEBT', delta: 30000, referenceNo: 'B', referenceType: 'SALE' }], owner, '2026-11-01T01:00:05.000Z');
    const local = { ...start, customers: deviceA.customers.map(entry => ({ ...entry, fieldUpdatedAt: { balance: '2026-11-01T01:00:00.000Z' } })), customerLedger: deviceA.entries };
    const remote = { ...start, customers: deviceB.customers.map(entry => ({ ...entry, fieldUpdatedAt: { balance: '2026-11-01T01:00:05.000Z' } })), customerLedger: deviceB.entries };
    const merged = mergeAppData(local, remote);
    expect(merged.customers![0].currentDebt).toBe(130000);
    expect(merged.customerLedger).toHaveLength(2);
    // Merge berikutnya (sudah sinkron) tidak menghitung dobel.
    expect(mergeAppData(merged, merged).customers![0].currentDebt).toBe(130000);
  });

  it('deposit & poin juga direkonsiliasi; saldo tidak pernah negatif', () => {
    const start = baseData({ customers: [customer({ depositBalance: 50000, rewardPoints: 3 })] });
    const result = applyBalanceChanges(start.customers, [
      { customerId: 'C1', kind: 'DEPOSIT', delta: -80000, referenceNo: 'X', referenceType: 'SALE' },
      { customerId: 'C1', kind: 'POINTS', delta: 2, referenceNo: 'X', referenceType: 'SALE' },
      { customerId: 'UMUM', kind: 'DEBT', delta: 1000, referenceNo: 'X', referenceType: 'SALE' },
    ], owner);
    expect(result.customers[0].depositBalance).toBe(0);
    expect(result.customers[0].rewardPoints).toBe(5);
    expect(result.entries.map(entry => entry.delta)).toEqual([-50000, 2]);
  });

  it('pembayaran PO dari dua perangkat tidak hilang', () => {
    const po: PurchaseOrder = { id: 'PO1', date: '', dueDate: '', termOfPayment: 0, discount: 0, supplierId: 'S1', supplierName: 'A', items: [], subtotal: 300, total: 300, status: 'RECEIVED', isPaid: false, paidAmount: 100, updatedAt: '2026-11-01T00:00:00.000Z' };
    const pay = (id: string) => ({ id, referenceNo: 'PO1', referenceType: 'PURCHASE_ORDER' as const, amount: 100, method: 'Tunai', direction: 'OUT' as const, createdAt: '2026-11-01T00:00:00.000Z', operatorName: 'x' });
    const merged = mergeAppData(baseData({ purchaseOrders: [po], paymentRecords: [pay('P1')] }), baseData({ purchaseOrders: [{ ...po, updatedAt: '2026-11-01T00:00:01.000Z' }], paymentRecords: [pay('P2')] }));
    expect(merged.purchaseOrders![0].paidAmount).toBe(200);
  });
});

describe('gudang', () => {
  it('stok gudang utama = total - gudang lain; kasir hanya menjual stok gudang utama', () => {
    const allocated = item({ stock: 10, stockByWarehouse: { W2: 8 } });
    expect(getWarehouseStock(allocated, 'W1')).toBe(2);
    expect(getAvailableStock(allocated, [allocated])).toBe(2);
    expect(findStockShortage([{ item: allocated, baseQty: 3 }], [allocated])).toEqual({ name: 'Oli', needed: 3, available: 2 });
    expect(() => completeSale([allocated], sale({ items: [{ itemId: 'I1', name: 'Oli', qty: 3, price: 50000, total: 150000 }] }), owner)).toThrow(/tidak mencukupi/);
  });

  it('transfer tidak mengubah stok total & tidak dianggap opname saat merge', () => {
    const result = transferStock([item()], { id: 'T', transferNo: 'TRF-1', fromWarehouseId: 'W1', toWarehouseId: 'W2', items: [{ itemId: 'I1', name: 'Oli', qty: 4 }] }, owner, '2026-11-01T02:00:00.000Z');
    expect(result.items[0].stock).toBe(10);
    expect(result.items[0].stockByWarehouse).toEqual({ W2: 4 });
    expect(() => transferStock([item()], { id: 'T', transferNo: 'X', fromWarehouseId: 'W1', toWarehouseId: 'W2', items: [{ itemId: 'I1', name: 'Oli', qty: 11 }] }, owner)).toThrow(/hanya 10/);

    // Perangkat lain offline menjual 1 lebih dulu; transfer di perangkat ini terjadi belakangan.
    const saleMovement: InventoryMovement = { id: 'M-SALE', itemId: 'I1', itemName: 'Oli', type: 'SALE', direction: 'OUT', quantity: 1, previousStock: 10, newStock: 9, referenceNo: 'INV', warehouseId: 'W1', operatorName: 'x', createdAt: '2026-11-01T01:00:00.000Z' };
    const local = baseData({ items: result.items.map(entry => ({ ...entry, fieldUpdatedAt: { stock: '2026-11-01T02:00:00.000Z' } })), inventoryMovements: result.movements });
    const remote = baseData({ items: [item({ stock: 9, fieldUpdatedAt: { stock: '2026-11-01T01:00:00.000Z' } })], inventoryMovements: [saleMovement] });
    const merged = mergeAppData(local, remote);
    expect(merged.items![0].stock).toBe(9);
    expect(merged.items![0].stockByWarehouse).toEqual({ W2: 4 });
  });

  it('opname menghitung gudang utama; jasa tidak punya stok', () => {
    const allocated = item({ stock: 10, stockByWarehouse: { W2: 4 } });
    const result = adjustStock([allocated], 'I1', 5, 'SO-1', 'hitung', owner);
    expect(result.items[0].stock).toBe(9); // 5 di toko + 4 di gudang lain
    expect(result.movement.newStock - result.movement.previousStock).toBe(-1);
    const jasa = item({ id: 'J1', itemType: 'JASA', stock: 0 });
    const sold = completeSale([jasa], sale({ items: [{ itemId: 'J1', name: 'Servis', qty: 3, price: 50000, total: 150000 }] }), owner);
    expect(sold.movements).toHaveLength(0);
    expect(sold.saleItems[0].isJasa).toBe(true);
    expect(voidSaleStock([jasa], { ...sale(), items: sold.saleItems }, owner, 'salah').movements).toHaveLength(0);
    expect(() => adjustStock([jasa], 'J1', 1, 'SO', 'x', owner)).toThrow(/jasa/);
  });
});

describe('operasi mode Lengkap', () => {
  it('deposit: setor tunai masuk shift, tidak bisa dikembalikan melebihi saldo', () => {
    const data = baseData({ cashSessions: [{ id: 'CS1', userId: 'U1', userName: 'x', openedAt: '', openingCash: 0, status: 'OPEN' }] });
    const afterTopup = topupDeposit(data, owner, { customerId: 'C1', amount: 100000, method: 'TUNAI' });
    expect(afterTopup.customers[0].depositBalance).toBe(100000);
    expect(afterTopup.paymentRecords[0]).toMatchObject({ referenceType: 'DEPOSIT', direction: 'IN', cashSessionId: 'CS1' });
    expect(() => refundDeposit(afterTopup, owner, { customerId: 'C1', amount: 150000, method: 'TUNAI' })).toThrow(/hanya/);
    const afterRefund = refundDeposit(afterTopup, owner, { customerId: 'C1', amount: 40000, method: 'TRANSFER' });
    expect(afterRefund.customers[0].depositBalance).toBe(60000);
    const journals = buildJournals(afterRefund);
    expect(journals.map(journal => journal.referenceType).sort()).toEqual(['DEPOSIT', 'DEPOSIT_REFUND']);
  });

  it('Work Order: DP masuk deposit pelanggan; WO selesai/batal tidak bisa diedit', () => {
    const order = { id: 'WO1', orderNo: 'WO-1', status: 'ESTIMASI' as const, customerId: 'C1', customerName: 'Budi', lines: [{ itemId: 'I1', name: 'Oli', qty: 2, price: 45000 }], estimatedTotal: 0, createdAt: '', operatorName: 'x' };
    const saved = saveServiceOrder(baseData(), owner, order);
    expect(saved.serviceOrders![0].estimatedTotal).toBe(90000);
    const withDp = receiveServiceOrderDp(saved, owner, 'WO1', 50000, 'TUNAI');
    expect(withDp.serviceOrders![0].dpAmount).toBe(50000);
    expect(withDp.customers[0].depositBalance).toBe(50000);
    expect(withDp.customerLedger![0].referenceType).toBe('DP');
    const cancelled = saveServiceOrder(withDp, owner, { ...withDp.serviceOrders![0], status: 'BATAL' });
    expect(() => saveServiceOrder(cancelled, owner, { ...cancelled.serviceOrders![0], complaint: 'x' })).toThrow(/tidak bisa diubah/);
    expect(() => receiveServiceOrderDp(saveServiceOrder(baseData(), owner, { ...order, customerId: 'UMUM' }), owner, 'WO1', 1000, 'TUNAI')).toThrow(/terdaftar/);
  });

  it('retur pembelian mengurangi stok & sisa hutang PO', () => {
    const po: PurchaseOrder = { id: 'PO1', date: '', dueDate: '', termOfPayment: 0, discount: 0, supplierId: 'S1', supplierName: 'Astra', items: [{ itemId: 'I1', name: 'Oli', orderedQty: 5, receivedQty: 5, cost: 40000 }], subtotal: 200000, total: 200000, status: 'RECEIVED', isPaid: false, paidAmount: 50000, ledgerV: 1 };
    const data = baseData({ purchaseOrders: [po] });
    const result = createPurchaseReturn(data, owner, { supplierId: 'S1', supplierName: 'Astra', purchaseOrderId: 'PO1', warehouseId: 'W1', items: [{ itemId: 'I1', name: 'Oli', qty: 2, cost: 40000 }], settlement: 'POTONG_HUTANG' });
    expect(result.items[0].stock).toBe(8);
    expect(getPurchaseOrderOutstanding(result.purchaseOrders[0], result.purchaseReturns)).toBe(70000);
    expect(() => createPurchaseReturn(result, owner, { supplierId: 'S1', supplierName: 'Astra', purchaseOrderId: 'PO1', warehouseId: 'W1', items: [{ itemId: 'I1', name: 'Oli', qty: 2, cost: 40000 }], settlement: 'POTONG_HUTANG' })).toThrow(/melebihi sisa hutang/);
    const lines = buildJournals(result).find(journal => journal.referenceType === 'PURCHASE_RETURN')!.lines;
    expect(lines).toEqual([{ accountCode: ACC.HUTANG, debit: 80000, credit: 0 }, { accountCode: ACC.PERSEDIAAN, debit: 0, credit: 80000 }]);
  });

  it('transfer antar gudang lewat operasi tersinkron', () => {
    const next = transferStockOp(baseData({ warehouses: [{ id: 'W2', name: 'Gudang Belakang', location: '' }] }), owner, { fromWarehouseId: 'W1', toWarehouseId: 'W2', items: [{ itemId: 'I1', name: 'Oli', qty: 3 }] });
    expect(next.items[0].stockByWarehouse).toEqual({ W2: 3 });
    expect(next.stockTransfers).toHaveLength(1);
    expect(() => transferStockOp(baseData(), owner, { fromWarehouseId: 'W1', toWarehouseId: 'W9', items: [{ itemId: 'I1', name: 'Oli', qty: 1 }] })).toThrow(/tidak dikenal/);
  });

  it('tutup buku menolak perubahan periode terkunci; jurnal manual harus seimbang', () => {
    expect(() => assertPeriodOpen({ mode: 'LENGKAP', lockDate: '2026-10-31' }, '2026-10-15T10:00:00', 'Faktur')).toThrow(/periode yang sudah ditutup/);
    expect(() => assertPeriodOpen({ mode: 'LENGKAP', lockDate: '2026-10-31' }, '2026-11-05T10:00:00', 'Faktur')).not.toThrow();
    const data = baseData({ accounts: ensureLedgerAccounts(mockAccounts, []) });
    expect(() => postManualJournal(data, owner, { date: '2026-11-05', description: 'x', lines: [{ accountCode: '1-1000', debit: 100, credit: 0 }, { accountCode: '3-1000', debit: 0, credit: 50 }] })).toThrow(/tidak seimbang/);
    const posted = postManualJournal(data, owner, { date: '2026-11-05', description: 'Setor modal', lines: [{ accountCode: '1-1100', debit: 1000000, credit: 0 }, { accountCode: '3-1000', debit: 0, credit: 1000000 }] });
    expect(buildJournals(posted)[0].isManual).toBe(true);
    expect(() => postManualJournal({ ...data, appSettings: { mode: 'LENGKAP', lockDate: '2026-11-30' } }, owner, { date: '2026-11-05', description: 'x', lines: [{ accountCode: '1-1100', debit: 1, credit: 0 }, { accountCode: '3-1000', debit: 0, credit: 1 }] })).toThrow(/ditutup/);
  });

  it('komisi mekanik dihitung per baris dan dikurangi retur', () => {
    expect(computeLineCommission({ itemType: 'JASA' }, { qty: 1, total: 100000 }, { defaultCommissionPercent: 20 })).toBe(20000);
    expect(computeLineCommission({ commissionAmount: 5000 }, { qty: 3, total: 300000 })).toBe(15000);
    expect(computeLineCommission({ commissionPercent: 5 }, { qty: 1, total: 100000 })).toBe(5000);
    expect(computeLineCommission({}, { qty: 1, total: 100000 })).toBe(0);
    const sold = sale({ items: [{ itemId: 'I1', name: 'Oli', qty: 2, price: 50000, total: 100000, mechanicId: 'M1', mechanicName: 'Andi', commissionAmount: 10000 }] });
    const ret: SaleReturn = { id: 'R', returnNo: 'R', originalInvoiceNo: 'INV-1', date: '', customerId: 'C1', customerName: 'x', items: [{ itemId: 'I1', name: 'Oli', qty: 1, price: 50000, reason: '' }], totalReturn: 50000, operatorName: 'x', status: 'APPROVED' };
    const mechanic = { id: 'M1', name: 'Andi', defaultCommissionPercent: 10, isActive: true };
    const data = payCommission(baseData({ mechanics: [mechanic] }), owner, { mechanicId: 'M1', amount: 2000, method: 'TUNAI' });
    const [row] = summarizeCommissions([sold], [ret], data.commissionPayments!, [mechanic]);
    expect(row).toMatchObject({ earned: 10000, returned: 5000, paid: 2000, outstanding: 3000 });
  });
});

describe('barcode & sandi modal', () => {
  it('Code 128 memakai set C untuk angka dan checksum benar', () => {
    expect(encodeCode128('123456')).toEqual([105, 12, 34, 56, 44, 106]);
    const textCodes = encodeCode128('OLI-1');
    expect(textCodes[0]).toBe(104);
    expect(textCodes[textCodes.length - 1]).toBe(106);
    expect(code128Svg('8991001001')).toContain('<svg');
    expect(() => encodeCode128('Kué')).toThrow();
  });
  it('sandi harga modal', () => {
    expect(encodeCostCipher(45000, 'HULIOPRAKS')).toBe('OPHHH');
    expect(encodeCostCipher(45000, 'ABC')).toBe('45000');
  });
});

describe('impor dari iPos', () => {
  it('membaca template item iPos termasuk baris satuan besar, jasa, dan serial Y/T', () => {
    const csv = [
      'DATA ITEM;;;;;;;;;;;;;;',
      'KODE ITEM;BARCODE;NAMA ITEM;JENIS;SATUAN;SATUAN DASAR;KONVERSI SATUAN DASAR;HARGA POKOK;HARGA JUAL;STOK MINIMUM;STOK;TIPE ITEM;MENGGUNAKAN SERIAL;RAK;KODE SUPPLIER',
      '0001;899100;Oli Mesin;OLI;BTL;BTL;1;40.000;50.000;5;24;Barang;T;A1;S01',
      '0001;;Oli Mesin;OLI;DUS;BTL;12;;580.000;;;Barang;T;;',
      'J01;;Servis Ringan;JASA;X;X;1;0;35000;;;Jasa;T;;',
      '0002;;Aki GS;AKI;PCS;PCS;1;500000;650000;1;3;Barang;Y;;',
    ].join('\r\n');
    const result = parseIposItems(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(3);
    expect(result.mergedUnits).toBe(1);
    const oli = result.rows[0];
    expect(oli).toMatchObject({ code: '0001', basePrice: 40000, stock: 24, reorderLevel: 5, category: 'OLI', itemType: 'BARANG', trackSerial: false });
    expect(oli.units).toEqual([{ name: 'BTL', conversion: 1, price: 50000 }, { name: 'DUS', conversion: 12, price: 580000 }]);
    expect(result.rows[1]).toMatchObject({ itemType: 'JASA', stock: 0 });
    expect(result.rows[2].trackSerial).toBe(true);
  });
  it('membaca pelanggan & saldo awal piutang', () => {
    const customers = parseIposContacts('PELANGGAN\nKODE,NAMA,ALAMAT,KOTA,TELEPON\nUPC,Union Jaya,Jl. A,Bandung,0812\n', 'customer');
    expect(customers.rows[0]).toMatchObject({ name: 'Union Jaya', address: 'Jl. A, Bandung', phone: '0812' });
    const receivables = parseOpeningReceivables('Nama Pelanggan;No Transaksi;Sisa\nUnion Jaya;PJ1;100.000\nUnion Jaya;PJ2;50.000\n');
    expect(receivables.rows).toEqual([{ customerName: 'Union Jaya', amount: 150000 }]);
  });
});

describe('mode aplikasi', () => {
  it('tab mode Lengkap tersembunyi di mode Simple', () => {
    expect(canAccessTab(owner, 'deposits')).toBe(false);
    expect(canAccessTab(owner, 'deposits', 'LENGKAP')).toBe(true);
    expect(getAccessibleTabs(owner, 'LENGKAP')).toContain('service-orders');
    expect(getAccessibleTabs(owner)).not.toContain('service-orders');
  });
});
