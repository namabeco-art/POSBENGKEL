import { describe, expect, it } from 'vitest';
import {
  postCashExpenseAccounts,
  postPurchaseOrderAccounts,
  postPurchasePaymentAccounts,
  postReturnAccounts,
  postSaleAccounts,
} from '../services/accountingService';
import { mockAccounts } from '../store';
import type { Sale } from '../types';

const sale = (paymentType: Sale['paymentType']): Sale => ({
  id: 'S1', invoiceNo: 'INV-1', date: '1/1/2026', customerId: 'C1', customerName: 'Pelanggan',
  items: [], subtotal: 100_000, tax: 0, total: 100_000, paymentType, amountReceived: 0, changeAmount: 0, operatorName: 'Kasir',
});
const balance = (accounts: typeof mockAccounts, code: string) => accounts.find(account => account.code === code)!.balance;

describe('accountingService', () => {
  it('posts cash, bank, and credit sales to the correct asset', () => {
    expect(balance(postSaleAccounts(mockAccounts, sale('TUNAI')), '1-1000')).toBe(5_100_000);
    expect(balance(postSaleAccounts(mockAccounts, sale('NON-TUNAI')), '1-1100')).toBe(20_100_000);
    expect(balance(postSaleAccounts(mockAccounts, sale('KREDIT')), '1-1200')).toBe(100_000);
  });

  it('reverses a credit sale on return', () => {
    const posted = postSaleAccounts(mockAccounts, sale('KREDIT'));
    const returned = postReturnAccounts(posted, sale('KREDIT'), 40_000);
    expect(balance(returned, '1-1200')).toBe(60_000);
    expect(balance(returned, '4-1100')).toBe(60_000);
  });

  it('tracks PO liability, payment source, and cash expenses', () => {
    const ordered = postPurchaseOrderAccounts(mockAccounts, 250_000);
    const paid = postPurchasePaymentAccounts(ordered, 100_000, 'Tunai');
    const spent = postCashExpenseAccounts(paid, 25_000);
    expect(balance(spent, '2-1100')).toBe(150_000);
    expect(balance(spent, '1-1000')).toBe(4_875_000);
    expect(balance(spent, '6-1100')).toBe(25_000);
  });
});
