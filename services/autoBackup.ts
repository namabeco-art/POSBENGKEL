/**
 * Backup otomatis per perangkat (mode Lengkap): 3 slot bergilir di IndexedDB, opsional juga
 * ditulis ke folder pilihan (Chrome/Edge, File System Access API).
 * Pengaturan disimpan per perangkat karena tiap komputer punya penyimpanan sendiri.
 */
import { AppData } from '../types';

const CONFIG_KEY = 'POSHULIO_AUTO_BACKUP';
const DB_NAME = 'POSHULIO_BACKUPS';
const STORE = 'slots';
const HANDLE_KEY = 'folder-handle';
export const BACKUP_SLOTS = 3;

export interface AutoBackupConfig {
  enabled: boolean;
  intervalHours: number;
  lastBackupAt?: string;
  nextSlot: number;
  folderName?: string;
}

export interface BackupSlotInfo {
  slot: number;
  createdAt: string;
  sizeBytes: number;
  sales: number;
  items: number;
}

const DEFAULT_CONFIG: AutoBackupConfig = { enabled: false, intervalHours: 4, nextSlot: 1 };

export const getAutoBackupConfig = (): AutoBackupConfig => {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
};

export const saveAutoBackupConfig = (config: AutoBackupConfig) => {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch { /* storage penuh */ }
};

export const isBackupDue = (config: AutoBackupConfig, now = Date.now()) => {
  if (!config.enabled) return false;
  if (!config.lastBackupAt) return true;
  const last = new Date(config.lastBackupAt).getTime();
  return !Number.isFinite(last) || now - last >= Math.max(1, config.intervalHours) * 3_600_000;
};

const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB tidak tersedia.')); return; }
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Gagal membuka database backup.'));
});

const idb = async <T,>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> => {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
};

/** Data backup tanpa kredensial cloud/AI. */
export const stripSecrets = (data: AppData) => {
  const { openRouterApiKey: _a, supabaseUrl: _b, supabaseAnonKey: _c, supabaseBucket: _d, ...safe } = data;
  return safe;
};

const writeToFolder = async (fileName: string, content: string): Promise<boolean> => {
  try {
    const handle = await idb<any>('readonly', store => store.get(HANDLE_KEY));
    if (!handle || typeof handle.queryPermission !== 'function') return false;
    const permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') return false;
    const file = await handle.getFileHandle(fileName, { create: true });
    const writable = await file.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch {
    return false;
  }
};

/** Simpan backup ke slot berikutnya. Mengembalikan info slot dan apakah file folder ikut ditulis. */
export const runBackup = async (data: AppData, now = new Date()): Promise<{ slot: number; wroteFolder: boolean }> => {
  const config = getAutoBackupConfig();
  const slot = ((config.nextSlot - 1) % BACKUP_SLOTS) + 1;
  const content = JSON.stringify(stripSecrets(data));
  const info: BackupSlotInfo = { slot, createdAt: now.toISOString(), sizeBytes: content.length, sales: data.sales?.length || 0, items: data.items?.length || 0 };
  await idb('readwrite', store => store.put({ info, content }, `slot-${slot}`));
  const wroteFolder = await writeToFolder(`poshulio-autobackup-${slot}.json`, content);
  saveAutoBackupConfig({ ...config, lastBackupAt: info.createdAt, nextSlot: (slot % BACKUP_SLOTS) + 1 });
  return { slot, wroteFolder };
};

export const listBackupSlots = async (): Promise<BackupSlotInfo[]> => {
  const slots: BackupSlotInfo[] = [];
  for (let slot = 1; slot <= BACKUP_SLOTS; slot += 1) {
    try {
      const record = await idb<{ info: BackupSlotInfo } | undefined>('readonly', store => store.get(`slot-${slot}`));
      if (record?.info) slots.push(record.info);
    } catch { /* slot kosong */ }
  }
  return slots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const readBackupSlot = async (slot: number): Promise<string | null> => {
  const record = await idb<{ content: string } | undefined>('readonly', store => store.get(`slot-${slot}`));
  return record?.content || null;
};

export const supportsFolderBackup = () => typeof (window as any).showDirectoryPicker === 'function';

/** Pilih folder tujuan backup (butuh klik pengguna). */
export const chooseBackupFolder = async (): Promise<string | null> => {
  if (!supportsFolderBackup()) return null;
  const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
  await idb('readwrite', store => store.put(handle, HANDLE_KEY));
  saveAutoBackupConfig({ ...getAutoBackupConfig(), folderName: handle.name });
  return handle.name as string;
};
