import { Account, Sale } from '../types';

const applyDeltas = (accounts: Account[], deltas: Record<string, number>): Account[] =>
  accounts.map(account => ({
    ...account,
    balance: account.balance + (deltas[account.code] || 0),
  }));

export const postSaleAccounts = (accounts: Account[], sale: Sale): Account[] => {
  const assetCode = sale.paymentType === 'TUNAI'
    ? '1-1000'
    : sale.paymentType === 'NON-TUNAI'
      ? '1-1100'
      : '1-1200';
  return applyDeltas(accounts, { [assetCode]: sale.total, '4-1100': sale.total });
};

export const postReturnAccounts = (accounts: Account[], sale: Sale, amount: number): Account[] => {
  const assetCode = sale.paymentType === 'TUNAI'
    ? '1-1000'
    : sale.paymentType === 'NON-TUNAI'
      ? '1-1100'
      : '1-1200';
  return applyDeltas(accounts, { [assetCode]: -amount, '4-1100': -amount });
};

export const postPurchaseOrderAccounts = (accounts: Account[], total: number): Account[] =>
  applyDeltas(accounts, { '2-1100': total });

export const postPurchasePaymentAccounts = (accounts: Account[], amount: number, method = ''): Account[] => {
  const sourceCode = /tunai|cash/i.test(method) ? '1-1000' : '1-1100';
  return applyDeltas(accounts, { [sourceCode]: -amount, '2-1100': -amount });
};

export const postCashExpenseAccounts = (accounts: Account[], amount: number): Account[] =>
  applyDeltas(accounts, { '1-1000': -amount, '6-1100': amount });

export const reverseCashExpenseAccounts = (accounts: Account[], amount: number): Account[] =>
  applyDeltas(accounts, { '1-1000': amount, '6-1100': -amount });

/** Pelunasan piutang pelanggan: piutang berkurang, kas/bank bertambah. */
export const postCustomerPaymentAccounts = (accounts: Account[], amount: number, method = ''): Account[] => {
  const targetCode = /tunai|cash/i.test(method) ? '1-1000' : '1-1100';
  return applyDeltas(accounts, { [targetCode]: amount, '1-1200': -amount });
};

/** Membatalkan pencatatan hutang PO (misal undo draft PO yang belum diterima/dibayar). */
export const reversePurchaseOrderAccounts = (accounts: Account[], total: number): Account[] =>
  applyDeltas(accounts, { '2-1100': -total });
