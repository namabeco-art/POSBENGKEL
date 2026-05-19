import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { AppData } from '../../types';
import { pullFromCloud, pushToCloud, getCloudConfig, hasCloudConfig, withCloudInventoryLock } from '../../services/syncService';
import { saveAppDataLocal } from '../../services/storageService';
import { saveAppDataIndexedDB } from '../../services/indexedDbService';
import { mergeAppData } from '../../services/mergeService';
import { useAppStore } from '../../appStore';

interface SyncContextValue {
  isSyncing: boolean;
  lastSyncTime: string | null;
  syncError: boolean;
  handleManualRefresh: (showFeedback?: boolean) => Promise<void>;
  handleManualPush: () => Promise<void>;
  runInventorySafeMutation: (mutator: (snapshot: AppData) => AppData) => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export const useSyncContext = () => {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSyncContext must be used within SyncProvider');
  return ctx;
};

interface SyncProviderProps {
  children: React.ReactNode;
  currentUserId?: string;
  currentUserName?: string;
}

/**
 * SyncProvider extracts cloud synchronization logic from App.tsx.
 * Handles:
 * - Auto-save (debounced push to cloud)
 * - Manual refresh (pull from cloud with merge)
 * - Inventory-safe mutations (with distributed lock)
 */
export const SyncProvider: React.FC<SyncProviderProps> = ({ children, currentUserId, currentUserName }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncError, setSyncError] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildDataSnapshot = useCallback((): AppData => {
    const state = useAppStore.getState();
    const config = getCloudConfig();
    return {
      users: state.users,
      items: state.items,
      customers: state.customers,
      suppliers: state.suppliers,
      accounts: state.accounts,
      purchaseOrders: state.purchaseOrders,
      sales: state.sales,
      returns: state.returns,
      inventoryLogs: state.inventoryLogs,
      inventoryMovements: state.inventoryMovements,
      auditLogs: state.auditLogs,
      cashSessions: state.cashSessions,
      paymentRecords: state.paymentRecords,
      promotions: state.promotions,
      mediaAssets: state.mediaAssets,
      aiUndoStack: state.aiUndoStack,
      branches: state.branches,
      aiConsultantHistory: state.aiConsultantHistory,
      floatingChatHistory: state.floatingChatHistory,
      openRouterApiKey: config.openRouterApiKey,
      aiModel: config.aiModel,
      supabaseUrl: (config as any).supabaseUrl || '',
      supabaseAnonKey: (config as any).supabaseAnonKey || '',
      supabaseBucket: (config as any).supabaseBucket || 'erp-media',
    };
  }, []);

  const handleManualRefresh = useCallback(async (showFeedback = true) => {
    const config = getCloudConfig();
    if (!config.enabled) {
      if (showFeedback) alert('Fitur Cloud tidak aktif. Menggunakan database lokal.');
      return;
    }

    setIsSyncing(true);
    setSyncError(false);
    try {
      const cloudData = await pullFromCloud();
      if (cloudData) {
        const localData = buildDataSnapshot();
        // Use merge strategy instead of last-write-wins
        const merged = mergeAppData(localData, cloudData);
        useAppStore.getState().applyData(merged);
        saveAppDataLocal(merged as AppData);
        await saveAppDataIndexedDB(merged as AppData);

        if (currentUserId) {
          useAppStore.getState().appendAuditLog({
            id: `AUD-${Date.now()}`,
            action: 'SYNC_PULL',
            actorId: currentUserId,
            actorName: currentUserName || 'System',
            entityType: 'SYNC',
            details: `Sinkronisasi cloud berhasil untuk workspace ${config.storeId}.`,
            createdAt: new Date().toISOString(),
          });
        }
      }
      setLastSyncTime(new Date().toLocaleTimeString());
      if (showFeedback) alert('Database berhasil diperbarui dari Cloud!');
    } catch {
      setSyncError(true);
      if (showFeedback) alert('Gagal sinkronisasi Cloud. Periksa koneksi atau kredensial.');
    } finally {
      setIsSyncing(false);
    }
  }, [buildDataSnapshot, currentUserId, currentUserName]);

  const handleManualPush = useCallback(async () => {
    if (!hasCloudConfig()) return;
    setIsSyncing(true);
    try {
      const dataToSave = buildDataSnapshot();
      await pushToCloud(dataToSave);
      setLastSyncTime(new Date().toLocaleTimeString());
      setSyncError(false);

      if (currentUserId) {
        const config = getCloudConfig();
        useAppStore.getState().appendAuditLog({
          id: `AUD-${Date.now()}`,
          action: 'SYNC_PUSH',
          actorId: currentUserId,
          actorName: currentUserName || 'System',
          entityType: 'SYNC',
          details: `Sinkronisasi manual berhasil untuk workspace ${config.storeId}.`,
          createdAt: new Date().toISOString(),
        });
      }
      alert('Sinkronisasi manual berhasil dikirim ke Cloud!');
    } catch {
      setSyncError(true);
      alert('Gagal mengirim sinkronisasi manual.');
    } finally {
      setIsSyncing(false);
    }
  }, [buildDataSnapshot, currentUserId, currentUserName]);

  const runInventorySafeMutation = useCallback(async (
    mutator: (snapshot: AppData) => AppData,
  ) => {
    const localSnapshot = buildDataSnapshot();
    if (!hasCloudConfig()) {
      const nextLocal = mutator(localSnapshot);
      useAppStore.getState().applyData(nextLocal);
      saveAppDataLocal(nextLocal);
      await saveAppDataIndexedDB(nextLocal);
      return;
    }

    setIsSyncing(true);
    try {
      await withCloudInventoryLock(async () => {
        const latest = await pullFromCloud();
        const baseSnapshot = (latest && typeof latest === 'object')
          ? mergeAppData(localSnapshot, latest) as AppData
          : localSnapshot;
        const nextSnapshot = mutator(baseSnapshot);
        await pushToCloud(nextSnapshot);
        useAppStore.getState().applyData(nextSnapshot);
        saveAppDataLocal(nextSnapshot);
        await saveAppDataIndexedDB(nextSnapshot);
      });
      setSyncError(false);
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (error: any) {
      setSyncError(true);
      throw error;
    } finally {
      setIsSyncing(false);
    }
  }, [buildDataSnapshot]);

  // Auto-save with debounce
  useEffect(() => {
    if (!hasCloudConfig()) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      const dataToSave = buildDataSnapshot();
      pushToCloud(dataToSave)
        .then(() => {
          setLastSyncTime(new Date().toLocaleTimeString());
          setSyncError(false);
        })
        .catch(() => setSyncError(true));
    }, 3000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [buildDataSnapshot]);

  const value: SyncContextValue = {
    isSyncing,
    lastSyncTime,
    syncError,
    handleManualRefresh,
    handleManualPush,
    runInventorySafeMutation,
  };

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
};
