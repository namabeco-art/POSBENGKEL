import { PaymentMethodCode, Sale, SalePayment } from '../types';

/** Metode pembayaran yang masuk ke rekening bank (bukan laci kas). */
export const BANK_METHODS: PaymentMethodCode[] = ['QRIS', 'TRANSFER', 'DEBIT'];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethodCode, string> = {
  TUNAI: 'Tunai',
  QRIS: 'QRIS',
  TRANSFER: 'Transfer',
  DEBIT: 'Debit',
  KREDIT: 'Kredit (Piutang)',
  DEPOSIT: 'Deposit',
};

const toMethodCode = (raw?: string): PaymentMethodCode => {
  const value = (raw || '').toUpperCase();
  if (value === 'TUNAI' || value === 'CASH') return 'TUNAI';
  if (value === 'KREDIT') return 'KREDIT';
  if (value === 'DEPOSIT') return 'DEPOSIT';
  if (value === 'TRANSFER') return 'TRANSFER';
  if (value === 'DEBIT') return 'DEBIT';
  return 'QRIS';
};

/**
 * Daftar pembayaran sebuah penjualan. Data lama (tanpa `payments`) dianggap satu metode
 * sesuai `paymentType`/`paymentMethod`, sehingga semua laporan memakai satu jalur hitung.
 */
export const getSalePayments = (sale: Pick<Sale, 'payments' | 'paymentType' | 'paymentMethod' | 'total'>): SalePayment[] => {
  if (Array.isArray(sale.payments) && sale.payments.length > 0) {
    return sale.payments.filter(payment => Number.isFinite(payment.amount) && payment.amount > 0);
  }
  const total = Math.max(0, sale.total || 0);
  if (total <= 0) return [];
  if (sale.paymentType === 'TUNAI') return [{ method: 'TUNAI', amount: total }];
  if (sale.paymentType === 'KREDIT') return [{ method: 'KREDIT', amount: total }];
  return [{ method: toMethodCode(sale.paymentMethod), amount: total }];
};

const sumBy = (sale: Parameters<typeof getSalePayments>[0], predicate: (method: PaymentMethodCode) => boolean) =>
  getSalePayments(sale).filter(payment => predicate(payment.method)).reduce((sum, payment) => sum + payment.amount, 0);

/** Uang tunai yang benar-benar masuk laci (sudah dikurangi kembalian). */
export const getSaleCashAmount = (sale: Parameters<typeof getSalePayments>[0]) => sumBy(sale, method => method === 'TUNAI');
export const getSaleBankAmount = (sale: Parameters<typeof getSalePayments>[0]) => sumBy(sale, method => BANK_METHODS.includes(method));
export const getSaleCreditAmount = (sale: Parameters<typeof getSalePayments>[0]) => sumBy(sale, method => method === 'KREDIT');
export const getSaleDepositAmount = (sale: Parameters<typeof getSalePayments>[0]) => sumBy(sale, method => method === 'DEPOSIT');

/** Label metode untuk struk/daftar: "TUNAI", "QRIS", atau "TUNAI + QRIS". */
export const describeSalePayments = (sale: Parameters<typeof getSalePayments>[0]): string => {
  const payments = getSalePayments(sale);
  if (payments.length === 0) return sale.paymentMethod || sale.paymentType || '-';
  return payments.map(payment => payment.method).join(' + ');
};

/** Apakah penjualan memakai metode tertentu (untuk filter daftar penjualan). */
export const saleUsesPaymentType = (sale: Parameters<typeof getSalePayments>[0], type: 'TUNAI' | 'NON-TUNAI' | 'KREDIT') => {
  const methods = getSalePayments(sale).map(payment => payment.method);
  if (type === 'TUNAI') return methods.includes('TUNAI');
  if (type === 'KREDIT') return methods.includes('KREDIT');
  return methods.some(method => BANK_METHODS.includes(method) || method === 'DEPOSIT');
};

/** paymentType ringkas untuk kompatibilitas data lama (metode dengan nilai terbesar). */
export const summarizePaymentType = (payments: SalePayment[]): Sale['paymentType'] => {
  const totals = { TUNAI: 0, 'NON-TUNAI': 0, KREDIT: 0 } as Record<Sale['paymentType'], number>;
  payments.forEach(payment => {
    const bucket: Sale['paymentType'] = payment.method === 'TUNAI' ? 'TUNAI' : payment.method === 'KREDIT' ? 'KREDIT' : 'NON-TUNAI';
    totals[bucket] += payment.amount;
  });
  return (Object.entries(totals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'TUNAI') as Sale['paymentType'];
};

/**
 * Bagi pengembalian dana retur sesuai cara bayar faktur asal.
 * Urutan: kurangi piutang dulu (yang belum dibayar), lalu deposit, lalu bank, lalu tunai.
 * `alreadyRefunded` = total refund retur sebelumnya per kelompok agar tidak melebihi pembayaran asal.
 */
export const allocateReturnRefund = (
  sale: Parameters<typeof getSalePayments>[0],
  amount: number,
  options: { currentDebt: number; alreadyRefunded?: Partial<Record<'credit' | 'deposit' | 'cash' | 'bank', number>> },
) => {
  const refunded = options.alreadyRefunded || {};
  let remaining = Math.max(0, Math.round(amount));
  const take = (capacity: number) => {
    const value = Math.max(0, Math.min(remaining, Math.round(capacity)));
    remaining -= value;
    return value;
  };
  const credit = take(Math.min(getSaleCreditAmount(sale) - (refunded.credit || 0), Math.max(0, options.currentDebt)));
  const deposit = take(getSaleDepositAmount(sale) - (refunded.deposit || 0));
  const bank = take(getSaleBankAmount(sale) - (refunded.bank || 0));
  // Sisa (termasuk piutang yang sudah dilunasi tunai) dikembalikan tunai.
  const cash = remaining;
  return { credit, deposit, cash, bank };
};
