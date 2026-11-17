/**
 * Buku besar double-entry yang DITURUNKAN dari dokumen transaksi (penjualan, retur, penerimaan PO,
 * pembayaran, kas keluar, opname, deposit, komisi, retur beli) + jurnal manual.
 *
 * Kenapa diturunkan, bukan disimpan? Dokumen transaksi sudah tersinkron dengan aman (append-only),
 * jadi jurnal selalu konsisten di semua perangkat tanpa risiko saldo akun tertimpa saat dua kasir
 * offline bersamaan. Saldo akun lama (`Account.balance`) dipakai sebagai saldo awal.
 *
 * Dokumen yang dibuat versi lama (tanpa `ledgerV`) sudah tercermin di saldo awal, jadi dilewati.
 */
import { Account, AppData, InventoryMovement, Item, JournalLine, PurchaseOrder, Sale, SaleReturn } from '../types';
import { getSalePayments } from './salePayments';

export const ACC = {
  KAS: '1-1000',
  BANK: '1-1100',
  PIUTANG: '1-1200',
  PERSEDIAAN: '1-1300',
  HUTANG: '2-1100',
  DEPOSIT: '2-1200',
  MODAL: '3-1000',
  PENJUALAN: '4-1100',
  JASA: '4-1200',
  HPP: '5-1100',
  BIAYA: '6-1100',
  KOMISI: '6-1200',
  SELISIH: '6-1300',
} as const;

export const LEDGER_VERSION = 1;

export const DEFAULT_LEDGER_ACCOUNTS: Account[] = [
  { code: ACC.KAS, name: 'Kas Toko', type: 'ASSET', balance: 0 },
  { code: ACC.BANK, name: 'Bank', type: 'ASSET', balance: 0 },
  { code: ACC.PIUTANG, name: 'Piutang Usaha', type: 'ASSET', balance: 0 },
  { code: ACC.PERSEDIAAN, name: 'Persediaan Barang', type: 'ASSET', balance: 0 },
  { code: ACC.HUTANG, name: 'Hutang Supplier', type: 'LIABILITY', balance: 0 },
  { code: ACC.DEPOSIT, name: 'Deposit / Uang Muka Pelanggan', type: 'LIABILITY', balance: 0 },
  { code: ACC.MODAL, name: 'Modal & Saldo Awal', type: 'EQUITY', balance: 0 },
  { code: ACC.PENJUALAN, name: 'Penjualan Barang', type: 'INCOME', balance: 0 },
  { code: ACC.JASA, name: 'Pendapatan Jasa', type: 'INCOME', balance: 0 },
  { code: ACC.HPP, name: 'Harga Pokok Penjualan', type: 'EXPENSE', balance: 0 },
  { code: ACC.BIAYA, name: 'Biaya Operasional', type: 'EXPENSE', balance: 0 },
  { code: ACC.KOMISI, name: 'Biaya Komisi Mekanik/Sales', type: 'EXPENSE', balance: 0 },
  { code: ACC.SELISIH, name: 'Selisih Persediaan (Opname)', type: 'EXPENSE', balance: 0 },
];

const isDebitNormal = (type: Account['type']) => type === 'ASSET' || type === 'EXPENSE';

/** Nilai persediaan (modal x stok) untuk barang fisik. */
export const inventoryValuation = (items: Item[]) =>
  Math.round(items
    .filter(item => !item.isBundle && item.itemType !== 'JASA')
    .reduce((sum, item) => sum + Math.max(0, item.stock || 0) * Math.max(0, item.basePrice || 0), 0));

/**
 * Lengkapi bagan akun. Saat akun Persediaan pertama kali dibuat, saldo awalnya = nilai stok saat ini;
 * akun Modal diisi sebagai penyeimbang agar Neraca seimbang sejak awal migrasi.
 */
export const ensureLedgerAccounts = (accounts: Account[], items: Item[]): Account[] => {
  const existing = new Set(accounts.map(account => account.code));
  const missing = DEFAULT_LEDGER_ACCOUNTS.filter(account => !existing.has(account.code));
  if (missing.length === 0) return accounts;
  const added = missing.map(account => (account.code === ACC.PERSEDIAAN ? { ...account, balance: inventoryValuation(items) } : { ...account }));
  let next = [...accounts, ...added];
  if (!existing.has(ACC.MODAL)) {
    const sum = (type: Account['type']) => next.filter(account => account.type === type && account.code !== ACC.MODAL).reduce((total, account) => total + (account.balance || 0), 0);
    const plug = sum('ASSET') - sum('LIABILITY') - sum('EQUITY') - sum('INCOME') + sum('EXPENSE');
    next = next.map(account => (account.code === ACC.MODAL ? { ...account, balance: Math.round(plug) } : account));
  }
  return next.sort((a, b) => a.code.localeCompare(b.code));
};

export interface DerivedJournal {
  id: string;
  /** ISO timestamp. */
  date: string;
  referenceNo: string;
  referenceType: string;
  description: string;
  lines: JournalLine[];
  isManual?: boolean;
}

/** Akun kas/bank/piutang/deposit dari nama metode bayar bebas. */
export const methodAccount = (method?: string): string => {
  const value = (method || '').toLowerCase();
  if (/tunai|cash/.test(value)) return ACC.KAS;
  if (/deposit/.test(value)) return ACC.DEPOSIT;
  if (/kredit|piutang/.test(value)) return ACC.PIUTANG;
  return ACC.BANK;
};

const round = (value: number) => Math.round(value || 0);

/** Gabungkan baris akun yang sama & buang baris nol. */
const compact = (lines: JournalLine[]): JournalLine[] => {
  const map = new Map<string, number>();
  lines.forEach(line => map.set(line.accountCode, (map.get(line.accountCode) || 0) + round(line.debit) - round(line.credit)));
  return Array.from(map.entries())
    .filter(([, net]) => net !== 0)
    .map(([accountCode, net]) => ({ accountCode, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 }));
};

const negate = (lines: JournalLine[]): JournalLine[] => lines.map(line => ({ accountCode: line.accountCode, debit: line.credit, credit: line.debit }));

const dr = (accountCode: string, amount: number): JournalLine => ({ accountCode, debit: round(amount), credit: 0 });
const cr = (accountCode: string, amount: number): JournalLine => ({ accountCode, debit: 0, credit: round(amount) });

const paymentAccount = (method: string) => {
  if (method === 'TUNAI') return ACC.KAS;
  if (method === 'KREDIT') return ACC.PIUTANG;
  if (method === 'DEPOSIT') return ACC.DEPOSIT;
  return ACC.BANK;
};

/** Pisahkan pendapatan barang vs jasa secara proporsional terhadap nilai baris. */
const splitRevenue = (lines: Array<{ total: number; isJasa?: boolean }>, amount: number) => {
  const jasaGross = lines.filter(line => line.isJasa).reduce((sum, line) => sum + (line.total || 0), 0);
  const allGross = lines.reduce((sum, line) => sum + (line.total || 0), 0);
  const jasa = allGross > 0 ? round(amount * (jasaGross / allGross)) : 0;
  return { jasa, goods: round(amount) - jasa };
};

const saleCost = (sale: Sale) =>
  round(sale.items.filter(line => !line.isJasa).reduce((sum, line) => sum + (line.costPrice || 0) * (line.qty || 0), 0));

export const buildSaleLines = (sale: Sale): JournalLine[] => {
  const lines: JournalLine[] = getSalePayments(sale).map(payment => dr(paymentAccount(payment.method), payment.amount));
  const revenue = splitRevenue(sale.items, sale.total);
  lines.push(cr(ACC.PENJUALAN, revenue.goods), cr(ACC.JASA, revenue.jasa));
  const cost = saleCost(sale);
  if (cost > 0) lines.push(dr(ACC.HPP, cost), cr(ACC.PERSEDIAAN, cost));
  return compact(lines);
};

export const getReturnRefund = (ret: SaleReturn, origin: Sale | undefined) => {
  if (ret.refund) return ret.refund;
  // Data lama: refund mengikuti tipe bayar faktur asal.
  const amount = ret.totalReturn;
  if (origin?.paymentType === 'KREDIT') return { credit: amount, deposit: 0, cash: 0, bank: 0 };
  if (origin?.paymentType === 'NON-TUNAI') return { credit: 0, deposit: 0, cash: 0, bank: amount };
  return { credit: 0, deposit: 0, cash: amount, bank: 0 };
};

export const buildReturnLines = (ret: SaleReturn, origin: Sale | undefined): JournalLine[] => {
  const refund = getReturnRefund(ret, origin);
  const returnedLines = ret.items.map(item => {
    const originLine = origin?.items.find(line => line.itemId === item.itemId);
    return { total: item.qty * item.price, isJasa: originLine?.isJasa, cost: (originLine?.costPrice || 0) * item.qty };
  });
  const revenue = splitRevenue(returnedLines, ret.totalReturn);
  const lines: JournalLine[] = [
    dr(ACC.PENJUALAN, revenue.goods),
    dr(ACC.JASA, revenue.jasa),
    cr(ACC.PIUTANG, refund.credit),
    cr(ACC.DEPOSIT, refund.deposit),
    cr(ACC.KAS, refund.cash),
    cr(ACC.BANK, refund.bank),
  ];
  if (origin?.ledgerV) {
    const cost = round(returnedLines.filter(line => !line.isJasa).reduce((sum, line) => sum + line.cost, 0));
    if (cost > 0) lines.push(dr(ACC.PERSEDIAAN, cost), cr(ACC.HPP, cost));
  }
  return compact(lines);
};

const movementValue = (movement: InventoryMovement) => round(Math.abs(movement.quantity) * (movement.unitCost || 0));

/** Semua jurnal (otomatis + manual), urut tanggal naik. */
export const buildJournals = (data: Partial<AppData>): DerivedJournal[] => {
  const journals: DerivedJournal[] = [];
  const push = (entry: Omit<DerivedJournal, 'lines'> & { lines: JournalLine[] }) => {
    const lines = compact(entry.lines);
    if (lines.length > 0) journals.push({ ...entry, lines });
  };
  const sales = data.sales || [];
  const salesByInvoice = new Map(sales.map(sale => [sale.invoiceNo, sale]));
  const poById = new Map((data.purchaseOrders || []).map(po => [po.id, po] as [string, PurchaseOrder]));

  sales.forEach(sale => {
    if (sale.ledgerV) {
      push({ id: `J-${sale.id}`, date: sale.createdAt || sale.date, referenceNo: sale.invoiceNo, referenceType: 'SALE', description: `Penjualan ${sale.invoiceNo} - ${sale.customerName}`, lines: buildSaleLines(sale) });
    }
    if (sale.status === 'VOID' && sale.voidLedgerV) {
      const original = sale.ledgerV
        ? buildSaleLines(sale)
        : compact([...getSalePayments(sale).map(payment => dr(paymentAccount(payment.method), payment.amount)), cr(ACC.PENJUALAN, sale.total)]);
      push({ id: `JV-${sale.id}`, date: sale.voidedAt || sale.updatedAt || sale.createdAt || sale.date, referenceNo: sale.invoiceNo, referenceType: 'SALE_VOID', description: `Void ${sale.invoiceNo}: ${sale.voidReason || ''}`.trim(), lines: negate(original) });
    }
  });

  (data.returns || []).forEach(ret => {
    if (!ret.ledgerV || ret.status !== 'APPROVED') return;
    push({ id: `JR-${ret.id}`, date: ret.approvedAt || ret.createdAt || ret.date, referenceNo: ret.returnNo, referenceType: 'RETURN', description: `Retur ${ret.returnNo} atas ${ret.originalInvoiceNo}`, lines: buildReturnLines(ret, salesByInvoice.get(ret.originalInvoiceNo)) });
  });

  // Penerimaan barang PO & opname (nilai = qty x modal saat mutasi).
  const receipts = new Map<string, InventoryMovement[]>();
  (data.inventoryMovements || []).forEach(movement => {
    if (!movement.ledgerV) return;
    if (movement.type === 'PURCHASE_RECEIPT') {
      const key = `${movement.referenceNo}|${movement.createdAt}`;
      receipts.set(key, [...(receipts.get(key) || []), movement]);
    } else if (movement.type === 'STOCK_OPNAME') {
      const delta = (movement.newStock ?? 0) - (movement.previousStock ?? 0);
      const value = movementValue(movement);
      if (!value) return;
      push({
        id: `JO-${movement.id}`,
        date: movement.createdAt,
        referenceNo: movement.referenceNo,
        referenceType: 'STOCK_OPNAME',
        description: `Opname ${movement.itemName} (${delta > 0 ? '+' : ''}${delta})`,
        lines: delta > 0 ? [dr(ACC.PERSEDIAAN, value), cr(ACC.SELISIH, value)] : [dr(ACC.SELISIH, value), cr(ACC.PERSEDIAAN, value)],
      });
    }
  });
  receipts.forEach((movements, key) => {
    const value = movements.reduce((sum, movement) => sum + movementValue(movement), 0);
    const po = poById.get(movements[0].referenceNo);
    // PO versi lama sudah mencatat hutang saat dibuat → sisi kredit ke Modal agar tidak dobel.
    const creditAccount = po?.ledgerV ? ACC.HUTANG : ACC.MODAL;
    push({ id: `JP-${key}`, date: movements[0].createdAt, referenceNo: movements[0].referenceNo, referenceType: 'PURCHASE_RECEIPT', description: `Terima barang ${movements[0].referenceNo}`, lines: [dr(ACC.PERSEDIAAN, value), cr(creditAccount, value)] });
  });

  (data.paymentRecords || []).forEach(payment => {
    if (!payment.ledgerV) return;
    if (payment.referenceType === 'PURCHASE_ORDER') {
      push({ id: `JPP-${payment.id}`, date: payment.createdAt, referenceNo: payment.referenceNo, referenceType: 'PURCHASE_PAYMENT', description: `Bayar hutang ${payment.referenceNo} (${payment.method})`, lines: [dr(ACC.HUTANG, payment.amount), cr(methodAccount(payment.method), payment.amount)] });
    } else if (payment.referenceType === 'CUSTOMER_PAYMENT') {
      push({ id: `JCP-${payment.id}`, date: payment.createdAt, referenceNo: payment.referenceNo, referenceType: 'CUSTOMER_PAYMENT', description: `Pelunasan piutang ${payment.referenceNo} (${payment.method})`, lines: [dr(methodAccount(payment.method), payment.amount), cr(ACC.PIUTANG, payment.amount)] });
    }
  });

  (data.cashExpenses || []).forEach(expense => {
    if (!expense.ledgerV) return;
    push({ id: `JE-${expense.id}`, date: expense.createdAt, referenceNo: expense.id, referenceType: 'EXPENSE', description: `Kas keluar: ${expense.description}`, lines: [dr(ACC.BIAYA, expense.amount), cr(ACC.KAS, expense.amount)] });
  });

  (data.customerLedger || []).forEach(entry => {
    const amount = Math.abs(entry.delta);
    if (entry.kind === 'DEPOSIT' && (entry.referenceType === 'DEPOSIT_TOPUP' || entry.referenceType === 'DP')) {
      push({ id: `JD-${entry.id}`, date: entry.createdAt, referenceNo: entry.referenceNo, referenceType: 'DEPOSIT', description: `Deposit ${entry.customerName || ''} (${entry.method || 'TUNAI'})`.trim(), lines: [dr(methodAccount(entry.method || 'TUNAI'), amount), cr(ACC.DEPOSIT, amount)] });
    } else if (entry.kind === 'DEPOSIT' && entry.referenceType === 'DEPOSIT_REFUND') {
      push({ id: `JD-${entry.id}`, date: entry.createdAt, referenceNo: entry.referenceNo, referenceType: 'DEPOSIT_REFUND', description: `Pengembalian deposit ${entry.customerName || ''}`.trim(), lines: [dr(ACC.DEPOSIT, amount), cr(methodAccount(entry.method || 'TUNAI'), amount)] });
    } else if (entry.referenceType === 'OPENING' && entry.kind === 'DEBT') {
      push({ id: `JOB-${entry.id}`, date: entry.createdAt, referenceNo: entry.referenceNo, referenceType: 'OPENING', description: `Saldo awal piutang ${entry.customerName || ''}`.trim(), lines: entry.delta > 0 ? [dr(ACC.PIUTANG, amount), cr(ACC.MODAL, amount)] : [dr(ACC.MODAL, amount), cr(ACC.PIUTANG, amount)] });
    } else if (entry.referenceType === 'OPENING' && entry.kind === 'DEPOSIT') {
      push({ id: `JOB-${entry.id}`, date: entry.createdAt, referenceNo: entry.referenceNo, referenceType: 'OPENING', description: `Saldo awal deposit ${entry.customerName || ''}`.trim(), lines: entry.delta > 0 ? [dr(ACC.MODAL, amount), cr(ACC.DEPOSIT, amount)] : [dr(ACC.DEPOSIT, amount), cr(ACC.MODAL, amount)] });
    }
  });

  (data.commissionPayments || []).forEach(payment => {
    push({ id: `JK-${payment.id}`, date: payment.createdAt, referenceNo: payment.paymentNo, referenceType: 'COMMISSION', description: `Komisi ${payment.mechanicName}`, lines: [dr(ACC.KOMISI, payment.amount), cr(methodAccount(payment.method), payment.amount)] });
  });

  (data.purchaseReturns || []).forEach(ret => {
    const debit = ret.settlement === 'POTONG_HUTANG' ? ACC.HUTANG : ret.settlement === 'REFUND_TUNAI' ? ACC.KAS : ACC.BANK;
    push({ id: `JRB-${ret.id}`, date: ret.createdAt, referenceNo: ret.returnNo, referenceType: 'PURCHASE_RETURN', description: `Retur beli ${ret.returnNo} ke ${ret.supplierName}`, lines: [dr(debit, ret.total), cr(ACC.PERSEDIAAN, ret.total)] });
  });

  (data.manualJournals || []).forEach(journal => {
    push({ id: `JM-${journal.id}`, date: `${journal.date}T12:00:00.000Z`, referenceNo: journal.journalNo, referenceType: 'MANUAL', description: journal.description, lines: journal.lines, isManual: true });
  });

  return journals.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
};

export const journalTotals = (lines: JournalLine[]) => ({
  debit: lines.reduce((sum, line) => sum + line.debit, 0),
  credit: lines.reduce((sum, line) => sum + line.credit, 0),
});

/** Saldo akun = saldo awal (Account.balance) + mutasi jurnal (s/d `until` bila diisi, ISO). */
export const computeAccountBalances = (accounts: Account[], journals: DerivedJournal[], until?: string): Account[] => {
  const movement = new Map<string, number>();
  journals.forEach(journal => {
    if (until && (journal.date || '') > until) return;
    journal.lines.forEach(line => movement.set(line.accountCode, (movement.get(line.accountCode) || 0) + line.debit - line.credit));
  });
  return accounts.map(account => {
    const net = movement.get(account.code) || 0;
    return { ...account, balance: round((account.balance || 0) + (isDebitNormal(account.type) ? net : -net)) };
  });
};

/** Mutasi akun pendapatan/biaya dalam rentang tanggal (ISO, inklusif). */
export const computeProfitAndLoss = (accounts: Account[], journals: DerivedJournal[], from: string, to: string) => {
  const movement = new Map<string, number>();
  journals.forEach(journal => {
    if ((journal.date || '') < from || (journal.date || '') > to) return;
    journal.lines.forEach(line => movement.set(line.accountCode, (movement.get(line.accountCode) || 0) + line.debit - line.credit));
  });
  const rows = accounts
    .filter(account => account.type === 'INCOME' || account.type === 'EXPENSE')
    .map(account => {
      const net = movement.get(account.code) || 0;
      return { account, amount: round(account.type === 'INCOME' ? -net : net) };
    });
  const income = rows.filter(row => row.account.type === 'INCOME').reduce((sum, row) => sum + row.amount, 0);
  const expense = rows.filter(row => row.account.type === 'EXPENSE').reduce((sum, row) => sum + row.amount, 0);
  return { rows, income, expense, net: income - expense };
};

/** Validasi jurnal manual: minimal 2 baris, seimbang, nominal positif. */
export const validateJournalLines = (lines: JournalLine[]): string | null => {
  const clean = lines.filter(line => line.accountCode && (line.debit > 0 || line.credit > 0));
  if (clean.length < 2) return 'Jurnal minimal 2 baris.';
  if (clean.some(line => line.debit < 0 || line.credit < 0 || (line.debit > 0 && line.credit > 0))) return 'Tiap baris diisi debit ATAU kredit (positif).';
  const totals = journalTotals(clean);
  if (round(totals.debit) !== round(totals.credit)) return `Jurnal tidak seimbang (debit ${totals.debit.toLocaleString('id-ID')} ≠ kredit ${totals.credit.toLocaleString('id-ID')}).`;
  return null;
};
