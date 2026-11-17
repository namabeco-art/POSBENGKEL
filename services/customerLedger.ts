import { Customer, CustomerLedgerEntry, User } from '../types';
import { createId } from './idService';

export type BalanceKind = CustomerLedgerEntry['kind'];

export const BALANCE_FIELD: Record<BalanceKind, 'currentDebt' | 'rewardPoints' | 'depositBalance'> = {
  DEBT: 'currentDebt',
  POINTS: 'rewardPoints',
  DEPOSIT: 'depositBalance',
};

export const getCustomerBalance = (customer: Customer | undefined, kind: BalanceKind): number =>
  Number(customer?.[BALANCE_FIELD[kind]] || 0);

export interface BalanceChange {
  customerId: string;
  kind: BalanceKind;
  /** Perubahan yang diminta; saldo tidak akan turun di bawah 0. */
  delta: number;
  referenceNo: string;
  referenceType: CustomerLedgerEntry['referenceType'];
  method?: string;
  note?: string;
  cashSessionId?: string;
}

/**
 * Terapkan perubahan saldo pelanggan (piutang/poin/deposit) dan catat di buku besar pelanggan.
 * Buku besar append-only inilah yang membuat saldo tetap benar saat dua perangkat offline
 * mengubah pelanggan yang sama (lihat reconcileCustomerBalances di mergeService).
 */
export const applyBalanceChanges = (
  customers: Customer[],
  changes: BalanceChange[],
  user: Pick<User, 'id' | 'name'>,
  now = new Date().toISOString(),
): { customers: Customer[]; entries: CustomerLedgerEntry[] } => {
  const next = [...customers];
  const entries: CustomerLedgerEntry[] = [];
  for (const change of changes) {
    if (!change.delta || !Number.isFinite(change.delta)) continue;
    const index = next.findIndex(customer => customer.id === change.customerId);
    if (index < 0) continue; // pelanggan umum / tidak terdaftar: tidak punya saldo
    const field = BALANCE_FIELD[change.kind];
    const before = Number(next[index][field] || 0);
    const after = Math.max(0, Math.round(before + change.delta));
    const actual = after - before;
    if (actual === 0) continue;
    next[index] = { ...next[index], [field]: after };
    entries.push({
      id: createId('CLG'),
      customerId: change.customerId,
      customerName: next[index].name,
      kind: change.kind,
      delta: actual,
      referenceNo: change.referenceNo,
      referenceType: change.referenceType,
      method: change.method,
      note: change.note,
      cashSessionId: change.cashSessionId,
      operatorName: user.name,
      operatorId: user.id,
      createdAt: now,
    });
  }
  return { customers: next, entries };
};

/** Jumlah delta buku besar per pelanggan & jenis saldo. */
export const sumLedgerDeltas = (entries: CustomerLedgerEntry[]) => {
  const totals = new Map<string, number>();
  entries.forEach(entry => {
    const key = `${entry.customerId}|${entry.kind}`;
    totals.set(key, (totals.get(key) || 0) + entry.delta);
  });
  return totals;
};
