import { CommissionPayment, Item, Mechanic, Sale, SaleReturn } from '../types';

/**
 * Komisi satu baris penjualan.
 * Prioritas: komisi rupiah per satuan di barang → komisi % di barang → komisi default mekanik (khusus jasa)
 * → komisi default toko (khusus jasa).
 */
export const computeLineCommission = (
  item: Pick<Item, 'commissionAmount' | 'commissionPercent' | 'itemType'> | undefined,
  line: { qty: number; total: number },
  mechanic?: Pick<Mechanic, 'defaultCommissionPercent'>,
  storeDefaultPercent = 0,
): number => {
  if (!item || !(line.total > 0)) return 0;
  if (item.commissionAmount && item.commissionAmount > 0) return Math.round(item.commissionAmount * line.qty);
  if (item.commissionPercent && item.commissionPercent > 0) return Math.round(line.total * item.commissionPercent / 100);
  if (item.itemType === 'JASA') {
    const percent = mechanic?.defaultCommissionPercent || storeDefaultPercent || 0;
    return Math.round(line.total * percent / 100);
  }
  return 0;
};

export interface CommissionSummaryRow {
  mechanicId: string;
  mechanicName: string;
  lines: number;
  salesValue: number;
  earned: number;
  returned: number;
  paid: number;
  outstanding: number;
}

/**
 * Rekap komisi per mekanik. Komisi dari faktur void tidak dihitung; komisi barang yang diretur
 * dikurangi proporsional terhadap qty yang diretur.
 */
export const summarizeCommissions = (
  sales: Sale[],
  returns: SaleReturn[],
  payments: CommissionPayment[],
  mechanics: Mechanic[],
  range?: { from?: string; to?: string },
): CommissionSummaryRow[] => {
  const inRange = (iso?: string) => {
    if (!range) return true;
    const value = iso || '';
    if (range.from && value < range.from) return false;
    if (range.to && value > range.to) return false;
    return true;
  };
  const rows = new Map<string, CommissionSummaryRow>();
  const row = (id: string, name: string) => {
    const existing = rows.get(id);
    if (existing) return existing;
    const created: CommissionSummaryRow = { mechanicId: id, mechanicName: name, lines: 0, salesValue: 0, earned: 0, returned: 0, paid: 0, outstanding: 0 };
    rows.set(id, created);
    return created;
  };
  mechanics.forEach(mechanic => row(mechanic.id, mechanic.name));

  const returnedQty = new Map<string, Map<string, number>>();
  returns.filter(ret => ret.status === 'APPROVED').forEach(ret => {
    const map = returnedQty.get(ret.originalInvoiceNo) || new Map<string, number>();
    ret.items.forEach(item => map.set(item.itemId, (map.get(item.itemId) || 0) + item.qty));
    returnedQty.set(ret.originalInvoiceNo, map);
  });

  sales.forEach(sale => {
    if (sale.status === 'VOID' || !inRange(sale.createdAt)) return;
    const saleReturns = returnedQty.get(sale.invoiceNo);
    const remainingReturn = new Map(saleReturns || []);
    sale.items.forEach(line => {
      if (!line.mechanicId || !(line.commissionAmount && line.commissionAmount > 0)) return;
      const target = row(line.mechanicId, line.mechanicName || line.mechanicId);
      target.lines += 1;
      target.salesValue += line.total;
      target.earned += line.commissionAmount;
      const toReturn = Math.min(line.qty, remainingReturn.get(line.itemId) || 0);
      if (toReturn > 0 && line.qty > 0) {
        target.returned += Math.round(line.commissionAmount * (toReturn / line.qty));
        remainingReturn.set(line.itemId, (remainingReturn.get(line.itemId) || 0) - toReturn);
      }
    });
  });

  payments.forEach(payment => {
    if (!inRange(payment.createdAt)) return;
    row(payment.mechanicId, payment.mechanicName).paid += payment.amount;
  });

  return Array.from(rows.values()).map(entry => ({ ...entry, outstanding: entry.earned - entry.returned - entry.paid }));
};
