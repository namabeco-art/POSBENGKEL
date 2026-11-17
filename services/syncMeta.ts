/**
 * Metadata sinkronisasi: memberi cap waktu `updatedAt` (dan per kelompok field) pada entitas yang berubah.
 *
 * Kenapa per kelompok field? Di toko yang harganya cepat berubah, owner bisa mengubah harga di PC belakang
 * sementara kasir menjual barang yang sama di perangkat lain. Dengan cap waktu terpisah untuk `price` dan
 * `stock`, merge bisa mengambil harga terbaru dari owner DAN stok terbaru dari kasir, alih-alih salah satunya
 * menimpa yang lain.
 */
import { AppData } from '../types';

export const ITEM_FIELD_GROUPS: Record<string, string[]> = {
  stock: ['stock', 'stockByWarehouse'],
  price: ['basePrice', 'memberPrices', 'units'],
};

export const CUSTOMER_FIELD_GROUPS: Record<string, string[]> = {
  balance: ['currentDebt', 'rewardPoints', 'depositBalance'],
};

const META_KEYS = new Set(['updatedAt', 'fieldUpdatedAt']);

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter(key => record[key] !== undefined)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
};

const pick = (entity: Record<string, any>, keys: string[]) => {
  const out: Record<string, unknown> = {};
  keys.forEach(key => { out[key] = entity[key]; });
  return out;
};

const omit = (entity: Record<string, any>, keys: Set<string>) => {
  const out: Record<string, unknown> = {};
  Object.keys(entity).forEach(key => {
    if (!keys.has(key)) out[key] = entity[key];
  });
  return out;
};

const baseExclusions = (groups: Record<string, string[]>) =>
  new Set([...META_KEYS, ...Object.values(groups).flat()]);

/** Beri cap waktu pada satu entitas jika isinya berubah dibanding versi sebelumnya. */
export const stampEntity = <T extends Record<string, any>>(
  previous: T | undefined,
  next: T,
  now: string,
  groups?: Record<string, string[]>,
): T => {
  if (previous === next) return next;

  if (!groups) {
    if (previous && stableStringify(omit(previous, META_KEYS)) === stableStringify(omit(next, META_KEYS))) return next;
    return { ...next, updatedAt: now };
  }

  const fieldUpdatedAt: Record<string, string> = { ...(previous?.fieldUpdatedAt || {}), ...(next.fieldUpdatedAt || {}) };
  let changed = false;
  const excluded = baseExclusions(groups);
  if (!previous || stableStringify(omit(previous, excluded)) !== stableStringify(omit(next, excluded))) {
    fieldUpdatedAt.base = now;
    changed = true;
  }
  for (const [group, keys] of Object.entries(groups)) {
    if (!previous || stableStringify(pick(previous, keys)) !== stableStringify(pick(next, keys))) {
      fieldUpdatedAt[group] = now;
      changed = true;
    }
  }
  if (!changed) return next;
  return { ...next, updatedAt: now, fieldUpdatedAt };
};

/** Beri cap waktu pada semua entitas yang berubah dalam satu koleksi. */
export const stampCollection = <T extends Record<string, any>>(
  previous: T[] | undefined,
  next: T[],
  now: string,
  options: { key?: string; groups?: Record<string, string[]> } = {},
): T[] => {
  if (!Array.isArray(next) || previous === next) return next;
  const key = options.key || 'id';
  const previousMap = new Map((previous || []).map(entity => [entity[key], entity]));
  let mutated = false;
  const stamped = next.map(entity => {
    const result = stampEntity(previousMap.get(entity[key]), entity, now, options.groups);
    if (result !== entity) mutated = true;
    return result;
  });
  return mutated ? stamped : next;
};

/** Koleksi yang bisa berubah (bukan log append-only) beserta cara memberi cap waktunya. */
export const MUTABLE_COLLECTIONS: Array<{ name: keyof AppData; key?: string; groups?: Record<string, string[]> }> = [
  { name: 'users' },
  { name: 'items', groups: ITEM_FIELD_GROUPS },
  { name: 'customers', groups: CUSTOMER_FIELD_GROUPS },
  { name: 'suppliers' },
  { name: 'accounts', key: 'code' },
  { name: 'branches' },
  { name: 'returns' },
  { name: 'purchaseOrders' },
  { name: 'cashSessions' },
  { name: 'promotions' },
  { name: 'mechanics' },
  { name: 'heldCarts' },
  { name: 'serviceOrders' },
  { name: 'warehouses' },
];

export const stampAppData = <T extends Partial<AppData>>(previous: Partial<AppData>, next: T, now = new Date().toISOString()): T => {
  const result: Record<string, unknown> = { ...next };
  for (const collection of MUTABLE_COLLECTIONS) {
    const nextValue = next[collection.name];
    if (!Array.isArray(nextValue)) continue;
    result[collection.name] = stampCollection(
      previous[collection.name] as any[] | undefined,
      nextValue as any[],
      now,
      { key: collection.key, groups: collection.groups },
    );
  }
  if (next.storeProfile && next.storeProfile !== previous.storeProfile) {
    result.storeProfile = stampEntity(previous.storeProfile as any, next.storeProfile as any, now);
  }
  if (next.appSettings && next.appSettings !== previous.appSettings) {
    result.appSettings = stampEntity(previous.appSettings as any, next.appSettings as any, now);
  }
  return result as T;
};

/** Merge dua versi entitas: tiap kelompok field diambil dari sisi yang paling baru mengubahnya. */
export const mergeEntityByFieldGroups = <T extends Record<string, any>>(
  local: T,
  remote: T,
  groups: Record<string, string[]>,
): T => {
  const localTimes = local.fieldUpdatedAt || {};
  const remoteTimes = remote.fieldUpdatedAt || {};
  const newer = (group: string) => ((localTimes[group] || '') > (remoteTimes[group] || '') ? local : remote);

  const merged: Record<string, any> = { ...newer('base') };
  const mergedTimes: Record<string, string> = {};
  const baseTime = [localTimes.base, remoteTimes.base].filter(Boolean).sort().pop();
  if (baseTime) mergedTimes.base = baseTime;

  for (const [group, keys] of Object.entries(groups)) {
    const source = newer(group);
    keys.forEach(key => { merged[key] = source[key]; });
    const time = [localTimes[group], remoteTimes[group]].filter(Boolean).sort().pop();
    if (time) mergedTimes[group] = time;
  }

  const updatedAt = [local.updatedAt, remote.updatedAt].filter(Boolean).sort().pop();
  if (updatedAt) merged.updatedAt = updatedAt;
  if (Object.keys(mergedTimes).length > 0) merged.fieldUpdatedAt = mergedTimes;
  return merged as T;
};
