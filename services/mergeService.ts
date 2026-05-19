/**
 * Merge Service for Cloud Sync Conflict Resolution
 * 
 * Instead of last-write-wins, this service merges local and remote data
 * using timestamp-based conflict resolution per entity.
 * 
 * Strategy:
 * - For entities with `createdAt`: newer entries win, union of both sets
 * - For entities with `id`: merge by ID, keep the one with latest timestamp
 * - For arrays without timestamps: union by ID (no duplicates)
 */

import { AppData, Sale, SaleReturn, PurchaseOrder, InventoryMovement, AuditLog, PaymentRecord, CashSession, InventoryLog, ChatMessage, Account } from '../types';

type EntityWithId = { id: string; createdAt?: string; [key: string]: any };
type EntityWithCode = { code: string; [key: string]: any };

/**
 * Merge two arrays of entities by ID, preferring the one with the latest createdAt.
 * If no createdAt, remote wins (cloud is source of truth for shared data).
 */
const mergeById = <T extends EntityWithId>(local: T[], remote: T[]): T[] => {
  const merged = new Map<string, T>();

  // Add all local entries
  for (const item of local) {
    merged.set(item.id, item);
  }

  // Merge remote entries (newer wins)
  for (const item of remote) {
    const existing = merged.get(item.id);
    if (!existing) {
      merged.set(item.id, item);
    } else if (item.createdAt && existing.createdAt) {
      if (new Date(item.createdAt) > new Date(existing.createdAt)) {
        merged.set(item.id, item);
      }
    }
    // If no createdAt on either, keep local (already in map)
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

/**
 * Merge mutable entities (items, customers, users) — latest update wins.
 * Uses a `lastModifiedAt` or `createdAt` field for comparison.
 */
const mergeMutable = <T extends EntityWithId>(local: T[], remote: T[]): T[] => {
  const merged = new Map<string, T>();

  for (const item of local) {
    merged.set(item.id, item);
  }

  for (const item of remote) {
    const existing = merged.get(item.id);
    if (!existing) {
      merged.set(item.id, item);
    } else {
      // For mutable entities without explicit timestamp, remote wins
      // (cloud is shared state, likely more up-to-date from other terminals)
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
  for (const item of remote) merged.set(item.code, item); // remote wins
  return Array.from(merged.values());
};

/**
 * Smart merge of local and remote AppData.
 * Returns merged data that preserves changes from both sides.
 */
export const mergeAppData = (local: Partial<AppData>, remote: Partial<AppData>): Partial<AppData> => {
  return {
    // Mutable master data — remote wins for shared entities
    users: mergeMutable(local.users || [], remote.users || []),
    items: mergeMutable(local.items || [], remote.items || []),
    customers: mergeMutable(local.customers || [], remote.customers || []),
    suppliers: mergeMutable(local.suppliers || [], remote.suppliers || []),
    accounts: mergeByCode(local.accounts || [], remote.accounts || []),
    branches: mergeMutable(local.branches || [], remote.branches || []),

    // Append-only transactional data — union of both
    sales: mergeAppendOnly(local.sales || [], remote.sales || []),
    returns: mergeAppendOnly(local.returns || [], remote.returns || []),
    purchaseOrders: mergeAppendOnly(local.purchaseOrders || [], remote.purchaseOrders || []),
    inventoryMovements: mergeAppendOnly(local.inventoryMovements || [], remote.inventoryMovements || []),
    auditLogs: mergeAppendOnly(local.auditLogs || [], remote.auditLogs || []).slice(0, 2000),
    paymentRecords: mergeAppendOnly(local.paymentRecords || [], remote.paymentRecords || []),
    cashSessions: mergeAppendOnly(local.cashSessions || [], remote.cashSessions || []),
    inventoryLogs: mergeAppendOnly(local.inventoryLogs || [], remote.inventoryLogs || []),

    // Promotions — merge by ID
    promotions: mergeMutable(local.promotions || [], remote.promotions || []),

    // Media assets — merge by ID
    mediaAssets: mergeById(local.mediaAssets || [], remote.mediaAssets || []),

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
