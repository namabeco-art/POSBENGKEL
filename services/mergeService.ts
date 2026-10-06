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

import { AppData, DeletedRecord, StoreProfile } from '../types';
import { CUSTOMER_FIELD_GROUPS, ITEM_FIELD_GROUPS, mergeEntityByFieldGroups } from './syncMeta';
import { PRICE_HISTORY_LIMIT } from './pricing';

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

/**
 * Smart merge of local and remote AppData.
 * Returns merged data that preserves changes from both sides.
 */
export const mergeAppData = (local: Partial<AppData>, remote: Partial<AppData>): Partial<AppData> => {
  const deletedRecords = mergeDeletedRecords(local.deletedRecords, remote.deletedRecords);
  const deleted = new Set(deletedRecords.map(recordKey));

  return {
    // Mutable master data — newest change wins, field groups for high-contention entities.
    users: withoutDeleted('users', mergeMutable(local.users || [], remote.users || []), deleted),
    items: withoutDeleted('items', mergeMutable(local.items || [], remote.items || [], ITEM_FIELD_GROUPS), deleted),
    customers: withoutDeleted('customers', mergeMutable(local.customers || [], remote.customers || [], CUSTOMER_FIELD_GROUPS), deleted),
    suppliers: withoutDeleted('suppliers', mergeMutable(local.suppliers || [], remote.suppliers || []), deleted),
    accounts: mergeByCode(local.accounts || [], remote.accounts || []),
    branches: withoutDeleted('branches', mergeMutable(local.branches || [], remote.branches || []), deleted),

    // Append-only transaction logs use union; mutable workflow documents use newest change.
    sales: mergeAppendOnly(local.sales || [], remote.sales || []),
    returns: mergeMutable(local.returns || [], remote.returns || []),
    purchaseOrders: withoutDeleted('purchaseOrders', mergeMutable(local.purchaseOrders || [], remote.purchaseOrders || []), deleted),
    inventoryMovements: mergeAppendOnly(local.inventoryMovements || [], remote.inventoryMovements || []),
    auditLogs: mergeAppendOnly(local.auditLogs || [], remote.auditLogs || []).slice(0, AUDIT_LOG_LIMIT),
    paymentRecords: mergeAppendOnly(local.paymentRecords || [], remote.paymentRecords || []),
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
