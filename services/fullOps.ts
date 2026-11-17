/**
 * Operasi mode Lengkap sebagai fungsi murni (snapshot → snapshot baru).
 * Dipanggil lewat runInventorySafeMutation di App sehingga ikut terkunci & tersinkron ke cloud,
 * dan bisa diuji tanpa UI.
 */
import {
  AppData, AppSettings, AuditLog, CommissionPayment, Customer, InventoryMovement, JournalLine, ManualJournal,
  PaymentRecord, PurchaseOrder, PurchaseReturn, ServiceOrder, StockTransfer, User,
} from '../types';
import { applyBalanceChanges } from './customerLedger';
import { createDocumentNo, createId } from './idService';
import { LEDGER_VERSION, validateJournalLines } from './ledger';
import { DEFAULT_WAREHOUSE_ID, getWarehouseStock, shiftWarehouseStock, transferStock } from './warehouses';
import { AUDIT_LOG_LIMIT } from './mergeService';

type Actor = Pick<User, 'id' | 'name'>;
const nowIso = () => new Date().toISOString();
const isCash = (method?: string) => /tunai|cash/i.test(method || '');

const audit = (action: AuditLog['action'], entityType: AuditLog['entityType'], user: Actor, details: string, entityId?: string, entityLabel?: string): AuditLog => ({
  id: createId('AUD'), action, actorId: user.id, actorName: user.name, entityType, entityId, entityLabel, details, createdAt: nowIso(),
});

const withAudit = (snapshot: AppData, log: AuditLog): AuditLog[] => [log, ...snapshot.auditLogs].slice(0, AUDIT_LOG_LIMIT);

export const openSessionId = (snapshot: Pick<AppData, 'cashSessions'>, userId: string) =>
  snapshot.cashSessions.find(session => session.userId === userId && session.status === 'OPEN')?.id;

/** Tanggal lokal YYYY-MM-DD dari ISO/Date. */
export const localDateKey = (value: string | Date | undefined): string => {
  const date = value instanceof Date ? value : new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** Tolak perubahan atas transaksi di periode yang sudah ditutup (tutup buku). */
export const assertPeriodOpen = (settings: AppSettings | undefined, when: string | undefined, label: string) => {
  if (!settings?.lockDate || !when) return;
  const key = localDateKey(when);
  if (key && key <= settings.lockDate) {
    throw new Error(`${label} bertanggal ${key} berada di periode yang sudah ditutup (s/d ${settings.lockDate}).`);
  }
};

const requireAmount = (amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Nominal harus lebih dari 0.');
  return Math.round(amount);
};

const findCustomer = (snapshot: AppData, customerId: string): Customer => {
  const customer = snapshot.customers.find(entry => entry.id === customerId);
  if (!customer) throw new Error('Pelanggan tidak ditemukan. Deposit hanya untuk pelanggan terdaftar.');
  return customer;
};

// ---------------------------------------------------------------- Deposit pelanggan

export const topupDeposit = (
  snapshot: AppData,
  user: Actor,
  input: { customerId: string; amount: number; method: string; note?: string; referenceType?: 'DEPOSIT_TOPUP' | 'DP'; referenceNo?: string },
): AppData => {
  const amount = requireAmount(input.amount);
  const customer = findCustomer(snapshot, input.customerId);
  const referenceNo = input.referenceNo || createDocumentNo('DEP');
  const cashSessionId = isCash(input.method) ? openSessionId(snapshot, user.id) : undefined;
  const { customers, entries } = applyBalanceChanges(snapshot.customers, [{
    customerId: customer.id, kind: 'DEPOSIT', delta: amount, referenceNo, referenceType: input.referenceType || 'DEPOSIT_TOPUP', method: input.method, note: input.note, cashSessionId,
  }], user);
  const payment: PaymentRecord = {
    id: createId('PAY'), referenceNo, referenceType: 'DEPOSIT', amount, method: input.method, direction: 'IN', createdAt: nowIso(),
    operatorName: user.name, operatorId: user.id, customerId: customer.id, cashSessionId, note: input.note,
  };
  return {
    ...snapshot,
    customers,
    customerLedger: [...entries, ...(snapshot.customerLedger || [])],
    paymentRecords: [payment, ...snapshot.paymentRecords],
    auditLogs: withAudit(snapshot, audit('DEPOSIT_RECORDED', 'CUSTOMER', user, `Deposit ${customer.name} +Rp ${amount.toLocaleString('id-ID')} via ${input.method}.`, customer.id, customer.name)),
  };
};

export const refundDeposit = (
  snapshot: AppData,
  user: Actor,
  input: { customerId: string; amount: number; method: string; note?: string },
): AppData => {
  const amount = requireAmount(input.amount);
  const customer = findCustomer(snapshot, input.customerId);
  if ((customer.depositBalance || 0) < amount) throw new Error(`Saldo deposit ${customer.name} hanya Rp ${(customer.depositBalance || 0).toLocaleString('id-ID')}.`);
  const referenceNo = createDocumentNo('DRF');
  const cashSessionId = isCash(input.method) ? openSessionId(snapshot, user.id) : undefined;
  const { customers, entries } = applyBalanceChanges(snapshot.customers, [{
    customerId: customer.id, kind: 'DEPOSIT', delta: -amount, referenceNo, referenceType: 'DEPOSIT_REFUND', method: input.method, note: input.note, cashSessionId,
  }], user);
  const payment: PaymentRecord = {
    id: createId('PAY'), referenceNo, referenceType: 'DEPOSIT', amount, method: input.method, direction: 'OUT', createdAt: nowIso(),
    operatorName: user.name, operatorId: user.id, customerId: customer.id, cashSessionId, note: input.note,
  };
  return {
    ...snapshot,
    customers,
    customerLedger: [...entries, ...(snapshot.customerLedger || [])],
    paymentRecords: [payment, ...snapshot.paymentRecords],
    auditLogs: withAudit(snapshot, audit('DEPOSIT_RECORDED', 'CUSTOMER', user, `Pengembalian deposit ${customer.name} Rp ${amount.toLocaleString('id-ID')} via ${input.method}.`, customer.id, customer.name)),
  };
};

// ---------------------------------------------------------------- Work order / estimasi servis

export const saveServiceOrder = (snapshot: AppData, user: Actor, order: ServiceOrder): AppData => {
  if (!order.customerName.trim()) throw new Error('Nama pelanggan wajib diisi.');
  if (order.lines.some(line => !(line.qty > 0) || !(line.price >= 0))) throw new Error('Qty/harga baris tidak valid.');
  const existing = (snapshot.serviceOrders || []).find(entry => entry.id === order.id);
  if (existing && (existing.status === 'DIFAKTURKAN' || existing.status === 'BATAL')) {
    throw new Error(`WO ${existing.orderNo} sudah ${existing.status === 'BATAL' ? 'dibatalkan' : 'difakturkan'} dan tidak bisa diubah.`);
  }
  const estimatedTotal = Math.round(order.lines.reduce((sum, line) => sum + line.qty * line.price, 0));
  const saved: ServiceOrder = { ...order, estimatedTotal, dpAmount: existing?.dpAmount ?? order.dpAmount ?? 0, updatedAt: nowIso() };
  const list = snapshot.serviceOrders || [];
  return {
    ...snapshot,
    serviceOrders: existing ? list.map(entry => (entry.id === order.id ? saved : entry)) : [saved, ...list],
    auditLogs: withAudit(snapshot, audit('SERVICE_ORDER_SAVED', 'SERVICE_ORDER', user, `WO ${saved.orderNo} (${saved.status}) disimpan untuk ${saved.customerName}.`, saved.id, saved.orderNo)),
  };
};

/** Terima uang muka WO: masuk deposit pelanggan, dipakai saat faktur dibuat di kasir. */
export const receiveServiceOrderDp = (snapshot: AppData, user: Actor, orderId: string, amount: number, method: string): AppData => {
  const order = (snapshot.serviceOrders || []).find(entry => entry.id === orderId);
  if (!order) throw new Error('WO tidak ditemukan.');
  if (order.status === 'DIFAKTURKAN' || order.status === 'BATAL') throw new Error('WO sudah ditutup.');
  if (!order.customerId || order.customerId === 'UMUM') throw new Error('DP hanya bisa untuk pelanggan terdaftar (pilih pelanggan di WO).');
  const next = topupDeposit(snapshot, user, { customerId: order.customerId, amount, method, referenceType: 'DP', referenceNo: order.orderNo, note: `DP ${order.orderNo}` });
  return {
    ...next,
    serviceOrders: (next.serviceOrders || []).map(entry => (entry.id === orderId ? { ...entry, dpAmount: (entry.dpAmount || 0) + Math.round(amount), updatedAt: nowIso() } : entry)),
  };
};

// ---------------------------------------------------------------- Komisi

export const payCommission = (
  snapshot: AppData,
  user: Actor,
  input: { mechanicId: string; amount: number; method: string; note?: string },
): AppData => {
  const amount = requireAmount(input.amount);
  const mechanic = (snapshot.mechanics || []).find(entry => entry.id === input.mechanicId);
  if (!mechanic) throw new Error('Mekanik tidak ditemukan.');
  const paymentNo = createDocumentNo('KOM');
  const cashSessionId = isCash(input.method) ? openSessionId(snapshot, user.id) : undefined;
  const commission: CommissionPayment = {
    id: createId('KOM'), paymentNo, mechanicId: mechanic.id, mechanicName: mechanic.name, amount, method: input.method, note: input.note,
    cashSessionId, createdAt: nowIso(), operatorName: user.name, operatorId: user.id,
  };
  const payment: PaymentRecord = {
    id: createId('PAY'), referenceNo: paymentNo, referenceType: 'COMMISSION', amount, method: input.method, direction: 'OUT', createdAt: commission.createdAt,
    operatorName: user.name, operatorId: user.id, cashSessionId, note: `Komisi ${mechanic.name}`,
  };
  return {
    ...snapshot,
    commissionPayments: [commission, ...(snapshot.commissionPayments || [])],
    paymentRecords: [payment, ...snapshot.paymentRecords],
    auditLogs: withAudit(snapshot, audit('COMMISSION_PAID', 'MECHANIC', user, `Bayar komisi ${mechanic.name} Rp ${amount.toLocaleString('id-ID')} via ${input.method}.`, mechanic.id, mechanic.name)),
  };
};

// ---------------------------------------------------------------- Gudang

export const transferStockOp = (
  snapshot: AppData,
  user: Actor,
  input: { fromWarehouseId: string; toWarehouseId: string; items: StockTransfer['items']; note?: string },
): AppData => {
  const warehouses = new Set([DEFAULT_WAREHOUSE_ID, ...(snapshot.warehouses || []).map(warehouse => warehouse.id)]);
  if (!warehouses.has(input.fromWarehouseId) || !warehouses.has(input.toWarehouseId)) throw new Error('Gudang tidak dikenal.');
  const result = transferStock(snapshot.items, {
    id: createId('TRF'), transferNo: createDocumentNo('TRF'), fromWarehouseId: input.fromWarehouseId, toWarehouseId: input.toWarehouseId, items: input.items, note: input.note,
  }, user);
  return {
    ...snapshot,
    items: result.items,
    inventoryMovements: [...result.movements.map(movement => ({ ...movement, ledgerV: LEDGER_VERSION })), ...snapshot.inventoryMovements],
    stockTransfers: [result.transfer, ...(snapshot.stockTransfers || [])],
    auditLogs: withAudit(snapshot, audit('STOCK_TRANSFERRED', 'INVENTORY', user, `Transfer ${result.transfer.transferNo}: ${input.items.length} barang ${input.fromWarehouseId} → ${input.toWarehouseId}.`, result.transfer.id, result.transfer.transferNo)),
  };
};

// ---------------------------------------------------------------- Retur pembelian

/** Sisa hutang PO setelah pembayaran dan retur beli yang memotong hutang. */
export const getPurchaseOrderOutstanding = (po: PurchaseOrder, purchaseReturns: PurchaseReturn[] = []) => {
  const returned = purchaseReturns
    .filter(ret => ret.purchaseOrderId === po.id && ret.settlement === 'POTONG_HUTANG')
    .reduce((sum, ret) => sum + ret.total, 0);
  return Math.max(0, Math.round(po.total - (po.paidAmount || 0) - returned));
};

export const createPurchaseReturn = (
  snapshot: AppData,
  user: Actor,
  input: Omit<PurchaseReturn, 'id' | 'returnNo' | 'total' | 'createdAt' | 'operatorName' | 'operatorId'>,
): AppData => {
  const supplier = snapshot.suppliers.find(entry => entry.id === input.supplierId);
  if (!supplier) throw new Error('Supplier tidak ditemukan.');
  if (!input.items.length) throw new Error('Pilih minimal satu barang yang diretur.');
  const warehouseId = input.warehouseId || DEFAULT_WAREHOUSE_ID;
  const total = Math.round(input.items.reduce((sum, line) => sum + line.qty * line.cost, 0));
  if (!(total > 0)) throw new Error('Nilai retur harus lebih dari 0.');
  if (input.settlement === 'POTONG_HUTANG' && input.purchaseOrderId) {
    const po = snapshot.purchaseOrders.find(entry => entry.id === input.purchaseOrderId);
    if (!po) throw new Error('PO tidak ditemukan.');
    const outstanding = getPurchaseOrderOutstanding(po, snapshot.purchaseReturns || []);
    if (total > outstanding) throw new Error(`Nilai retur Rp ${total.toLocaleString('id-ID')} melebihi sisa hutang PO Rp ${outstanding.toLocaleString('id-ID')}. Pilih refund tunai/bank.`);
  }
  const returnNo = createDocumentNo('RB');
  const now = nowIso();
  const nextItems = [...snapshot.items];
  const movements: InventoryMovement[] = [];
  for (const line of input.items) {
    if (!(Number.isFinite(line.qty) && line.qty > 0) || !(line.cost >= 0)) throw new Error(`Qty/harga ${line.name} tidak valid.`);
    const index = nextItems.findIndex(item => item.id === line.itemId);
    if (index < 0) throw new Error(`Barang ${line.name} tidak ditemukan.`);
    const item = nextItems[index];
    if (item.itemType === 'JASA' || item.isBundle) throw new Error(`${item.name} tidak punya stok fisik.`);
    const available = getWarehouseStock(item, warehouseId);
    if (available < line.qty) throw new Error(`Stok ${item.name} di gudang hanya ${available}.`);
    const newStock = item.stock - line.qty;
    nextItems[index] = shiftWarehouseStock({ ...item, stock: newStock }, warehouseId, -line.qty);
    movements.push({
      id: createId('MOV'), itemId: item.id, itemName: item.name, type: 'PURCHASE_RETURN', direction: 'OUT', quantity: line.qty,
      previousStock: item.stock, newStock, referenceNo: returnNo, note: `Retur ke ${supplier.name}`, warehouseId,
      operatorName: user.name, operatorId: user.id, createdAt: now, unitCost: line.cost, ledgerV: LEDGER_VERSION,
    });
  }
  const purchaseReturn: PurchaseReturn = { ...input, id: createId('RB'), returnNo, warehouseId, supplierName: supplier.name, total, createdAt: now, operatorName: user.name, operatorId: user.id };
  const refundMethod = input.settlement === 'REFUND_TUNAI' ? 'TUNAI' : input.settlement === 'REFUND_BANK' ? 'TRANSFER' : null;
  const payments: PaymentRecord[] = refundMethod ? [{
    id: createId('PAY'), referenceNo: returnNo, referenceType: 'PURCHASE_RETURN', amount: total, method: refundMethod, direction: 'IN', createdAt: now,
    operatorName: user.name, operatorId: user.id, cashSessionId: refundMethod === 'TUNAI' ? openSessionId(snapshot, user.id) : undefined, note: `Refund retur beli ${supplier.name}`,
  }] : [];
  // PO lunas jika sisa hutang habis karena retur.
  const purchaseReturns = [purchaseReturn, ...(snapshot.purchaseReturns || [])];
  const purchaseOrders = input.purchaseOrderId
    ? snapshot.purchaseOrders.map(po => (po.id === input.purchaseOrderId && getPurchaseOrderOutstanding(po, purchaseReturns) === 0 ? { ...po, isPaid: true } : po))
    : snapshot.purchaseOrders;
  return {
    ...snapshot,
    items: nextItems,
    purchaseOrders,
    purchaseReturns,
    inventoryMovements: [...movements, ...snapshot.inventoryMovements],
    paymentRecords: [...payments, ...snapshot.paymentRecords],
    auditLogs: withAudit(snapshot, audit('PURCHASE_RETURNED', 'SUPPLIER', user, `Retur beli ${returnNo} ke ${supplier.name} Rp ${total.toLocaleString('id-ID')} (${input.settlement}).`, purchaseReturn.id, returnNo)),
  };
};

// ---------------------------------------------------------------- Jurnal manual & saldo awal

export const postManualJournal = (snapshot: AppData, user: Actor, input: { date: string; description: string; lines: JournalLine[] }): AppData => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Tanggal jurnal tidak valid.');
  assertPeriodOpen(snapshot.appSettings, `${input.date}T12:00:00`, 'Jurnal');
  if (!input.description.trim()) throw new Error('Keterangan jurnal wajib diisi.');
  const lines = input.lines
    .filter(line => line.accountCode && (line.debit > 0 || line.credit > 0))
    .map(line => ({ accountCode: line.accountCode, debit: Math.round(line.debit || 0), credit: Math.round(line.credit || 0) }));
  const error = validateJournalLines(lines);
  if (error) throw new Error(error);
  const known = new Set(snapshot.accounts.map(account => account.code));
  const unknown = lines.find(line => !known.has(line.accountCode));
  if (unknown) throw new Error(`Akun ${unknown.accountCode} tidak ada di bagan akun.`);
  const journal: ManualJournal = {
    id: createId('JM'), journalNo: createDocumentNo('JM'), date: input.date, description: input.description.trim(), lines,
    createdAt: nowIso(), operatorName: user.name, operatorId: user.id,
  };
  return {
    ...snapshot,
    manualJournals: [journal, ...(snapshot.manualJournals || [])],
    auditLogs: withAudit(snapshot, audit('JOURNAL_POSTED', 'JOURNAL', user, `Jurnal manual ${journal.journalNo}: ${journal.description}.`, journal.id, journal.journalNo)),
  };
};

/** Saldo awal piutang hasil migrasi (mis. dari iPos). Dicocokkan ke pelanggan berdasarkan nama. */
export const importOpeningReceivables = (
  snapshot: AppData,
  user: Actor,
  rows: Array<{ customerName: string; amount: number }>,
): { data: AppData; applied: number; missing: string[] } => {
  const missing: string[] = [];
  const changes = rows.flatMap(row => {
    const customer = snapshot.customers.find(entry => entry.name.trim().toLowerCase() === row.customerName.trim().toLowerCase());
    if (!customer) { missing.push(row.customerName); return []; }
    return [{ customerId: customer.id, kind: 'DEBT' as const, delta: Math.round(row.amount), referenceNo: 'SALDO-AWAL', referenceType: 'OPENING' as const, note: 'Saldo awal piutang (migrasi)' }];
  });
  const { customers, entries } = applyBalanceChanges(snapshot.customers, changes, user);
  return {
    data: {
      ...snapshot,
      customers,
      customerLedger: [...entries, ...(snapshot.customerLedger || [])],
      auditLogs: withAudit(snapshot, audit('CUSTOMER_PAYMENT', 'CUSTOMER', user, `Import saldo awal piutang: ${entries.length} pelanggan.`)),
    },
    applied: entries.length,
    missing,
  };
};
