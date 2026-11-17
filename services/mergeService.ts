/**
 * Merge Service for Cloud Sync Conflict Resolution
 *
 * Strategy:
 * - Append-only logs (sales, movements, payments, audit, price history): union by ID, newest first.
 * - Mutable entities: the side with the newer `updatedAt` wins. Without timestamps (legacy data)
 *   the remote copy wins, matching the previous behaviour.
 * - Items & customers: merged per field group (stock / price / base, balance / base), so a price
 *   change on one device and a sale on another device are both preserved.
 * - Deleted records (tombstones) are unioned and filtered out, so deletions do not come back
 *   from another device's stale copy.
 */

import { AppData, AppSettings, Customer, DeletedRecord, InventoryMovement, Item, PurchaseOrder, StoreProfile } from '../types';
import { CUSTOMER_FIELD_GROUPS, ITEM_FIELD_GROUPS, mergeEntityByFieldGroups } from './syncMeta';
import { PRICE_HISTORY_LIMIT } from './pricing';
import { BALANCE_FIELD } from './customerLedger';
import { DEFAULT_WAREHOUSE_ID, warehouseMovementDelta } from './warehouses';

type EntityWithId = { id: string; createdAt?: string; updatedAt?: string; [key: string]: any };
type EntityWithCode = { code: string; updatedAt?: string; [key: string]: any };

export const DELETED_RECORDS_LIMIT = 5000;
export const AUDIT_LOG_LIMIT = 2000;

/**
 * Merge two arrays of entities by ID, preferring the one with the latest createdAt.
 */
const mergeById = <T extends EntityWithId>(local: T[], remote: T[]): T[] => {
  const merged = new Map<string, T>();

  for (const item of local) {
    merged.set(item.id, item);
  }

  for (const item of remote) {
    const existing = merged.get(item.id);
    if (!existing) {
      merged.set(item.id, item);
    } else if (item.updatedAt || existing.updatedAt) {
      // Dokumen yang diperbarui (mis. penjualan di-void) — versi terbaru menang.
      if ((item.updatedAt || item.createdAt || '') > (existing.updatedAt || existing.createdAt || '')) merged.set(item.id, item);
    } else if (item.createdAt && existing.createdAt) {
      if (new Date(item.createdAt) > new Date(existing.createdAt)) {
        merged.set(item.id, item);
      }
    }
  }

  return Array.from(merged.values());
};

/**
 * Merge append-only arrays (like sales, audit logs) — union by ID, sorted by createdAt desc.
 */
const mergeAppendOnly = <T extends EntityWithId>(local: T[], remote: T[]): T[] => {
  const merged = mergeById(local, remote);
  return merged.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA; // newest first
  });
};

const isLocalNewer = (local: { updatedAt?: string }, remote: { updatedAt?: string }) =>
  (local.updatedAt || '') > (remote.updatedAt || '');

/**
 * Merge mutable entities — the newest `updatedAt` wins, remote wins on ties/legacy data.
 * When field groups are given, each group is resolved independently.
 */
const mergeMutable = <T extends EntityWithId>(local: T[], remote: T[], groups?: Record<string, string[]>): T[] => {
  const merged = new Map<string, T>();

  for (const item of local) {
    merged.set(item.id, item);
  }

  for (const item of remote) {
    const existing = merged.get(item.id);
    if (!existing) {
      merged.set(item.id, item);
    } else if (groups) {
      merged.set(item.id, mergeEntityByFieldGroups(existing, item, groups));
    } else if (!isLocalNewer(existing, item)) {
      merged.set(item.id, item);
    }
  }

  return Array.from(merged.values());
};

/**
 * Merge entities keyed by `code` instead of `id` (e.g., Account).
 */
const mergeByCode = <T extends EntityWithCode>(local: T[], remote: T[]): T[] => {
  const merged = new Map<string, T>();
  for (const item of local) merged.set(item.code, item);
  for (const item of remote) {
    const existing = merged.get(item.code);
    if (!existing || !isLocalNewer(existing, item)) merged.set(item.code, item);
  }
  return Array.from(merged.values());
};

/** Perubahan stok yang dihasilkan satu mutasi. Opname (ADJUSTMENT) dicatat sebagai selisih sebelum/sesudah. */
export const movementDelta = (movement: InventoryMovement): number => {
  if (movement.direction === 'OUT') return -movement.quantity;
  if (movement.direction === 'IN') return movement.quantity;
  return (movement.newStock ?? 0) - (movement.previousStock ?? 0);
};

/**
 * Rekonsiliasi stok berbasis mutasi (kartu stok).
 *
 * Mutasi bersifat append-only dan digabung (union) dari semua perangkat, sedangkan angka stok di tiap
 * perangkat sudah mencakup mutasinya sendiri. Jadi stok gabungan = stok satu sisi + mutasi yang hanya
 * ada di sisi lain. Contoh: perangkat A offline menjual 2, perangkat B menjual 1 → 24 - 3 = 21,
 * bukan 22 atau 23 seperti bila salah satu menimpa yang lain.
 *
 * Jika ada stok opname, hasil hitung fisik terakhir menjadi patokan: stok = hasil opname + semua
 * mutasi yang terjadi sesudah opname tersebut.
 */
const reconcileStockWithMovements = (
  mergedItems: Item[],
  local: Partial<AppData>,
  remote: Partial<AppData>,
): Item[] => {
  const localMovements = local.inventoryMovements || [];
  const remoteMovements = remote.inventoryMovements || [];
  const localIds = new Set(localMovements.map(movement => movement.id));
  const remoteIds = new Set(remoteMovements.map(movement => movement.id));
  const localOnly = new Map<string, InventoryMovement[]>();
  const remoteOnly = new Map<string, InventoryMovement[]>();
  localMovements.forEach(movement => {
    if (remoteIds.has(movement.id)) return;
    localOnly.set(movement.itemId, [...(localOnly.get(movement.itemId) || []), movement]);
  });
  remoteMovements.forEach(movement => {
    if (localIds.has(movement.id)) return;
    remoteOnly.set(movement.itemId, [...(remoteOnly.get(movement.itemId) || []), movement]);
  });
  if (localOnly.size === 0 && remoteOnly.size === 0) return mergedItems;

  const localItems = new Map((local.items || []).map(item => [item.id, item]));
  const remoteItems = new Map((remote.items || []).map(item => [item.id, item]));

  return mergedItems.map(item => {
    const localItem = localItems.get(item.id);
    const remoteItem = remoteItems.get(item.id);
    if (!localItem || !remoteItem) return item; // barang baru di satu sisi — tidak ada konflik
    const onlyLocal = localOnly.get(item.id) || [];
    const onlyRemote = remoteOnly.get(item.id) || [];
    if (onlyLocal.length === 0 && onlyRemote.length === 0) return item;

    // Patokan: opname terakhir (berdasarkan waktu) dari gabungan mutasi barang ini.
    // Hanya STOCK_OPNAME — mutasi TRANSFER antar gudang juga ADJUSTMENT tetapi tidak mengubah stok total.
    const allForItem = new Map<string, InventoryMovement>();
    [...localMovements, ...remoteMovements].forEach(movement => {
      if (movement.itemId === item.id) allForItem.set(movement.id, movement);
    });
    const sorted = Array.from(allForItem.values()).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    const anchorIndex = sorted.map(movement => movement.type).lastIndexOf('STOCK_OPNAME');

    let stock: number;
    if (anchorIndex >= 0) {
      stock = sorted[anchorIndex].newStock + sorted.slice(anchorIndex + 1).reduce((sum, movement) => sum + movementDelta(movement), 0);
    } else {
      stock = remoteItem.stock + onlyLocal.reduce((sum, movement) => sum + movementDelta(movement), 0);
    }

    // Stok gudang selain gudang utama: versi cloud + mutasi gudang tsb yang hanya ada di perangkat ini.
    const warehouseShift = new Map<string, number>();
    onlyLocal.forEach(movement => {
      if (!movement.warehouseId || movement.warehouseId === DEFAULT_WAREHOUSE_ID) return;
      warehouseShift.set(movement.warehouseId, (warehouseShift.get(movement.warehouseId) || 0) + warehouseMovementDelta(movement));
    });
    const touchesWarehouses = [...onlyLocal, ...onlyRemote].some(movement => movement.warehouseId && movement.warehouseId !== DEFAULT_WAREHOUSE_ID);
    let stockByWarehouse = item.stockByWarehouse;
    if (touchesWarehouses) {
      const nextMap: Record<string, number> = { ...(remoteItem.stockByWarehouse || {}) };
      warehouseShift.forEach((delta, warehouseId) => { nextMap[warehouseId] = (nextMap[warehouseId] || 0) + delta; });
      Object.keys(nextMap).forEach(key => { if (!nextMap[key]) delete nextMap[key]; });
      stockByWarehouse = Object.keys(nextMap).length ? nextMap : undefined;
    }

    const stockChanged = Number.isFinite(stock) && stock !== item.stock;
    const warehouseChanged = JSON.stringify(stockByWarehouse || {}) !== JSON.stringify(item.stockByWarehouse || {});
    if (!stockChanged && !warehouseChanged) return item;
    return { ...item, ...(stockChanged ? { stock } : {}), stockByWarehouse };
  });
};

/**
 * Rekonsiliasi saldo pelanggan (piutang, poin, deposit) dari buku besar pelanggan — sama seperti stok:
 * saldo = versi cloud + perubahan yang hanya ada di perangkat ini. Dua kasir offline yang sama-sama
 * menjual kredit ke pelanggan yang sama → piutang keduanya tercatat, tidak saling menimpa.
 */
const reconcileCustomerBalances = (mergedCustomers: Customer[], local: Partial<AppData>, remote: Partial<AppData>): Customer[] => {
  const localEntries = local.customerLedger || [];
  const remoteEntries = remote.customerLedger || [];
  const localIds = new Set(localEntries.map(entry => entry.id));
  const remoteIds = new Set(remoteEntries.map(entry => entry.id));
  const localOnly = new Map<string, number>();
  const touched = new Set<string>();
  localEntries.forEach(entry => {
    if (remoteIds.has(entry.id)) return;
    const key = `${entry.customerId}|${entry.kind}`;
    localOnly.set(key, (localOnly.get(key) || 0) + entry.delta);
    touched.add(key);
  });
  remoteEntries.forEach(entry => {
    if (!localIds.has(entry.id)) touched.add(`${entry.customerId}|${entry.kind}`);
  });
  if (touched.size === 0) return mergedCustomers;

  const remoteCustomers = new Map((remote.customers || []).map(customer => [customer.id, customer]));
  const localCustomers = new Set((local.customers || []).map(customer => customer.id));
  return mergedCustomers.map(customer => {
    const remoteCustomer = remoteCustomers.get(customer.id);
    if (!remoteCustomer || !localCustomers.has(customer.id)) return customer;
    let next = customer;
    (Object.keys(BALANCE_FIELD) as Array<keyof typeof BALANCE_FIELD>).forEach(kind => {
      const key = `${customer.id}|${kind}`;
      if (!touched.has(key)) return;
      const field = BALANCE_FIELD[kind];
      const value = Math.max(0, Number(remoteCustomer[field] || 0) + (localOnly.get(key) || 0));
      if (value !== Number(next[field] || 0)) next = { ...next, [field]: value };
    });
    return next;
  });
};

/** Nilai bayar PO tidak boleh lebih kecil dari total bukti bayar (dua perangkat membayar PO yang sama). */
const reconcilePurchasePayments = (orders: PurchaseOrder[], data: Partial<AppData>): PurchaseOrder[] => {
  const paidByPo = new Map<string, number>();
  (data.paymentRecords || []).forEach(payment => {
    if (payment.referenceType !== 'PURCHASE_ORDER' || payment.direction !== 'OUT') return;
    paidByPo.set(payment.referenceNo, (paidByPo.get(payment.referenceNo) || 0) + payment.amount);
  });
  return orders.map(order => {
    const recorded = paidByPo.get(order.id) || 0;
    if (recorded <= (order.paidAmount || 0)) return order;
    return { ...order, paidAmount: recorded, isPaid: order.isPaid || recorded >= order.total };
  });
};

const recordKey = (record: Pick<DeletedRecord, 'collection' | 'id'>) => `${record.collection}:${record.id}`;

const mergeDeletedRecords = (local: DeletedRecord[] = [], remote: DeletedRecord[] = []): DeletedRecord[] => {
  const merged = new Map<string, DeletedRecord>();
  [...remote, ...local].forEach(record => {
    if (record?.collection && record?.id) merged.set(recordKey(record), record);
  });
  return Array.from(merged.values())
    .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''))
    .slice(0, DELETED_RECORDS_LIMIT);
};

const withoutDeleted = <T extends { id: string }>(collection: string, entities: T[], deleted: Set<string>): T[] =>
  deleted.size === 0 ? entities : entities.filter(entity => !deleted.has(`${collection}:${entity.id}`));

const mergeStoreProfile = (local?: StoreProfile, remote?: StoreProfile): StoreProfile | undefined => {
  if (!local) return remote;
  if (!remote) return local;
  return isLocalNewer(local, remote) ? local : remote;
};

const mergeAppSettings = (local?: AppSettings, remote?: AppSettings): AppSettings | undefined => {
  if (!local) return remote;
  if (!remote) return local;
  return isLocalNewer(local, remote) ? local : remote;
};

/**
 * Smart merge of local and remote AppData.
 * Returns merged data that preserves changes from both sides.
 */
export const mergeAppData = (local: Partial<AppData>, remote: Partial<AppData>): Partial<AppData> => {
  const deletedRecords = mergeDeletedRecords(local.deletedRecords, remote.deletedRecords);
  const deleted = new Set(deletedRecords.map(recordKey));

  const paymentRecords = mergeAppendOnly(local.paymentRecords || [], remote.paymentRecords || []);

  return {
    // Mutable master data — newest change wins, field groups for high-contention entities.
    users: withoutDeleted('users', mergeMutable(local.users || [], remote.users || []), deleted),
    items: withoutDeleted('items', reconcileStockWithMovements(mergeMutable(local.items || [], remote.items || [], ITEM_FIELD_GROUPS), local, remote), deleted),
    customers: withoutDeleted('customers', reconcileCustomerBalances(mergeMutable(local.customers || [], remote.customers || [], CUSTOMER_FIELD_GROUPS), local, remote), deleted),
    suppliers: withoutDeleted('suppliers', mergeMutable(local.suppliers || [], remote.suppliers || []), deleted),
    accounts: mergeByCode(local.accounts || [], remote.accounts || []),
    branches: withoutDeleted('branches', mergeMutable(local.branches || [], remote.branches || []), deleted),

    // Append-only transaction logs use union; mutable workflow documents use newest change.
    sales: mergeAppendOnly(local.sales || [], remote.sales || []),
    returns: mergeMutable(local.returns || [], remote.returns || []),
    purchaseOrders: reconcilePurchasePayments(withoutDeleted('purchaseOrders', mergeMutable(local.purchaseOrders || [], remote.purchaseOrders || []), deleted), { paymentRecords }),
    inventoryMovements: mergeAppendOnly(local.inventoryMovements || [], remote.inventoryMovements || []),
    auditLogs: mergeAppendOnly(local.auditLogs || [], remote.auditLogs || []).slice(0, AUDIT_LOG_LIMIT),
    paymentRecords,

    // Mode Lengkap
    appSettings: mergeAppSettings(local.appSettings, remote.appSettings),
    customerLedger: mergeAppendOnly(local.customerLedger || [], remote.customerLedger || []),
    manualJournals: withoutDeleted('manualJournals', mergeAppendOnly(local.manualJournals || [], remote.manualJournals || []), deleted),
    mechanics: withoutDeleted('mechanics', mergeMutable(local.mechanics || [], remote.mechanics || []), deleted),
    commissionPayments: mergeAppendOnly(local.commissionPayments || [], remote.commissionPayments || []),
    heldCarts: withoutDeleted('heldCarts', mergeMutable(local.heldCarts || [], remote.heldCarts || []), deleted),
    serviceOrders: withoutDeleted('serviceOrders', mergeMutable(local.serviceOrders || [], remote.serviceOrders || []), deleted),
    warehouses: withoutDeleted('warehouses', mergeMutable(local.warehouses || [], remote.warehouses || []), deleted),
    stockTransfers: mergeAppendOnly(local.stockTransfers || [], remote.stockTransfers || []),
    purchaseReturns: mergeAppendOnly(local.purchaseReturns || [], remote.purchaseReturns || []),
    cashSessions: mergeMutable(local.cashSessions || [], remote.cashSessions || []),
    cashExpenses: withoutDeleted('cashExpenses', mergeAppendOnly(local.cashExpenses || [], remote.cashExpenses || []), deleted),
    inventoryLogs: mergeAppendOnly((local.inventoryLogs || []) as any[], (remote.inventoryLogs || []) as any[]),
    priceHistory: mergeAppendOnly(local.priceHistory || [], remote.priceHistory || []).slice(0, PRICE_HISTORY_LIMIT),

    // Promotions — merge by ID
    promotions: withoutDeleted('promotions', mergeMutable(local.promotions || [], remote.promotions || []), deleted),

    // Media assets — merge by ID
    mediaAssets: withoutDeleted('mediaAssets', mergeById(local.mediaAssets || [], remote.mediaAssets || []), deleted),

    deletedRecords,
    storeProfile: mergeStoreProfile(local.storeProfile, remote.storeProfile),

    // AI state — keep local (per-device)
    aiUndoStack: local.aiUndoStack || remote.aiUndoStack || [],
    aiConsultantHistory: local.aiConsultantHistory || remote.aiConsultantHistory || [],
    floatingChatHistory: local.floatingChatHistory || remote.floatingChatHistory || [],

    // Config — remote wins (shared config)
    openRouterApiKey: remote.openRouterApiKey || local.openRouterApiKey,
    aiModel: remote.aiModel || local.aiModel,
    supabaseUrl: remote.supabaseUrl || local.supabaseUrl,
    supabaseAnonKey: remote.supabaseAnonKey || local.supabaseAnonKey,
    supabaseBucket: remote.supabaseBucket || local.supabaseBucket,
  };
};
