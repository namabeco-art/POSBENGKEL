import React, { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import { AIPriceUpdateDraft, AIUndoEntry, AppData, AuditLog, Branch, CashSession, Customer, InventoryMovement, Item, MediaAsset, PaymentRecord, PromotionCampaign, PurchaseOrder, Sale, SaleReturn, Supplier, User, UserRole, Account } from './types';
import { mockUsers, mockItems, mockCustomers, mockSuppliers, mockAccounts, mockBranches, mockPromotions } from './store';
import { ShieldCheck, User as UserIcon, Key, Clock, AlertCircle, Info, CloudLightning, RefreshCw, Loader2, Link2, CheckCircle2, X, Plus, Store, ChevronRight, Globe, Lock, Trash2, Settings2, Database, HardDrive, Server, QrCode, Terminal, Activity, ChevronDown, Search, Cloud, Monitor, MapPin, ShieldEllipsis } from 'lucide-react';
import { pullFromCloud, pushToCloud, getCloudConfig, hasCloudConfig, applyActivationCode, saveCloudConfig, withCloudInventoryLock } from './services/syncService';
import { clearSessionLocal, loadAppDataLocal, loadSessionLocal, saveAppDataLocal, saveSessionLocal } from './services/storageService';
import { hashPassword, sanitizeUserSession, verifyPassword } from './services/authService';
import { canAccessTab, getAccessibleTabs, hasPermission } from './services/permissions';
import { adjustStock, completeReturn, completeSale, receivePurchaseOrderStock, validateUniqueItem } from './services/posOperations';
import { getCloudProfileLabel, getCloudProfileRegion, getCloudProfiles } from './services/cloudProfiles';
import { hasEnvCloudConfig, getEnvConfig } from './services/appConfig';
import { useAppStore } from './appStore';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const MasterData = lazy(() => import('./pages/MasterData'));
const SalesPOS = lazy(() => import('./pages/SalesPOS'));
const SalesList = lazy(() => import('./pages/SalesList'));
const Accounting = lazy(() => import('./pages/Accounting'));
const Purchasing = lazy(() => import('./pages/Purchasing'));
const Inventory = lazy(() => import('./pages/Inventory'));
const UserManagement = lazy(() => import('./UserManagement'));
const Reporting = lazy(() => import('./pages/Reporting'));
const Returns = lazy(() => import('./pages/Returns'));
const AIConsultant = lazy(() => import('./pages/AIConsultant'));
const Settings = lazy(() => import('./pages/Settings'));
const ERPControlTower = lazy(() => import('./pages/ERPControlTower'));
const MediaVault = lazy(() => import('./pages/MediaVault'));

type UserDraft = {
  id: string;
  name: string;
  username: string;
  password?: string;
  role: UserRole;
  permissions: User['permissions'];
  schedule: User['schedule'];
  isActive?: boolean;
  sessionPolicy?: User['sessionPolicy'];
};

const PageLoadingFallback: React.FC = () => (
  <div className="h-full flex flex-col items-center justify-center p-10 text-center space-y-4 animate-in fade-in duration-300">
    <div className="w-16 h-16 rounded-full border-4 border-slate-200 border-t-slate-900 animate-spin" />
    <div>
      <h2 className="text-lg font-black text-slate-900 uppercase tracking-widest">Memuat Modul</h2>
      <p className="mt-2 text-[11px] font-bold text-slate-400 uppercase tracking-[0.18em]">Menyiapkan halaman aktif...</p>
    </div>
  </div>
);

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncError, setSyncError] = useState(false);
  
  const [isCloudActive, setIsCloudActive] = useState(hasCloudConfig());
  const [savedDbs, setSavedDbs] = useState<any[]>(getCloudProfiles());
  const [showCloudSelector, setShowCloudSelector] = useState(false);
  const [cloudSearchTerm, setCloudSearchTerm] = useState('');
  const [loginAccessMode, setLoginAccessMode] = useState<'local' | 'cloud'>('local');

  // Dynamic States (Zustand Global Store)
  const appStore = useAppStore();
  const {
    users, setUsers, items, setItems, customers, setCustomers,
    suppliers, setSuppliers, accounts, setAccounts,
    purchaseOrders, setPurchaseOrders, sales, setSales,
    returns, setReturns, inventoryLogs, inventoryMovements, setInventoryMovements,
    auditLogs, paymentRecords, setPaymentRecords,
    cashSessions, setCashSessions, promotions, setPromotions,
    mediaAssets, setMediaAssets, aiUndoStack, setAiUndoStack,
    branches, aiConsultantHistory, setAiConsultantHistory,
    floatingChatHistory, setFloatingChatHistory,
    applyData, appendAuditLog
  } = appStore;

  // Login States
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginView, setLoginView] = useState<'auth' | 'setup'>('auth');
  const [preselectedReturnInvoice, setPreselectedReturnInvoice] = useState<string | undefined>(undefined);

  // Manual Add DB State
  const [showAddDb, setShowAddDb] = useState(false);
  const [showAdminUnlock, setShowAdminUnlock] = useState(false);
  const [addDbMode, setAddDbMode] = useState<'code' | 'manual'>('code');
  const [activationCodeInput, setActivationCodeInput] = useState('');
  const [newDbForm, setNewDbForm] = useState({ storeId: '', displayName: '', region: '', supabaseUrl: '', supabaseAnonKey: '', supabaseBucket: 'erp-media' });
  const [showRecoveryPanel, setShowRecoveryPanel] = useState(false);
  const [recoveryWorkspaceInput, setRecoveryWorkspaceInput] = useState('');
  const [recoveryPhraseInput, setRecoveryPhraseInput] = useState('');
  const [adminUnlockUsername, setAdminUnlockUsername] = useState('admin');
  const [adminUnlockPassword, setAdminUnlockPassword] = useState('');
  const [adminUnlockError, setAdminUnlockError] = useState('');

  useEffect(() => {
    setLoginAccessMode(hasCloudConfig() ? 'cloud' : 'local');
  }, [isCloudActive]);

  const buildDataSnapshot = useCallback((): AppData => {
    const state = useAppStore.getState();
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
      openRouterApiKey: getCloudConfig().openRouterApiKey,
      aiModel: getCloudConfig().aiModel,
      supabaseUrl: (getCloudConfig() as any).supabaseUrl || '',
      supabaseAnonKey: (getCloudConfig() as any).supabaseAnonKey || '',
      supabaseBucket: (getCloudConfig() as any).supabaseBucket || 'erp-media',
    };
  }, []);

  const handleManualRefresh = useCallback(async (showFeedback = true) => {
    const config = getCloudConfig();
    if (!config.enabled) {
      if (showFeedback) alert("Fitur Cloud tidak aktif. Menggunakan database lokal.");
      return;
    }
    
    setIsSyncing(true);
    setSyncError(false);
    try {
      const cloudData = await pullFromCloud();
      if (cloudData) {
        applyData(cloudData);
        saveAppDataLocal(cloudData);
        if (currentUser) {
          appendAuditLog({
            id: `AUD-${Date.now()}`,
            action: 'SYNC_PULL',
            actorId: currentUser.id,
            actorName: currentUser.name,
            entityType: 'SYNC',
            details: `Sinkronisasi cloud berhasil untuk workspace ${config.storeId}.`,
            createdAt: new Date().toISOString(),
          });
        }
      }

      setLastSyncTime(new Date().toLocaleTimeString());
      if (showFeedback) alert("Database berhasil diperbarui dari Cloud!");
    } catch (e) { 
      setSyncError(true);
      if (showFeedback) alert("Gagal sinkronisasi Cloud. Periksa koneksi atau kredensial."); 
    } finally {
      setIsSyncing(false);
    }
  }, [appendAuditLog, applyData, currentUser]);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    setLoginView('auth');
    clearSessionLocal();
  }, []);

  // AUTO-SAVE LOGIC (PERSISTENCE)
  // Subscribe to ALL store changes to ensure persistence
  useEffect(() => {
    if (!isDataLoaded) return;

    // Use Zustand subscribe to detect any state change
    const unsubscribe = useAppStore.subscribe(() => {
      const dataToSave = buildDataSnapshot();
      saveAppDataLocal(dataToSave);
    });

    // Also save immediately on mount
    saveAppDataLocal(buildDataSnapshot());

    return () => unsubscribe();
  }, [buildDataSnapshot, isDataLoaded]);

  // DEBOUNCED CLOUD SYNC (separate from local persistence)
  useEffect(() => {
    if (!isDataLoaded || !hasCloudConfig()) return;

    const timer = setTimeout(() => {
      const dataToSave = buildDataSnapshot();
      pushToCloud(dataToSave).then(() => {
        setLastSyncTime(new Date().toLocaleTimeString());
        setSyncError(false);
      }).catch(() => setSyncError(true));
    }, 3000);

    return () => clearTimeout(timer);
  }, [users, items, customers, suppliers, accounts, purchaseOrders, sales, returns, inventoryMovements, auditLogs, cashSessions, paymentRecords, promotions, mediaAssets, buildDataSnapshot, isDataLoaded]);

  // INITIAL LOAD
  useEffect(() => {
    const initData = async () => {
      try {
        // Load User Session
        const savedSession = loadSessionLocal<User>();
        if (savedSession) {
          const user = users.find(item => item.id === savedSession.id) || savedSession;
          setCurrentUser(user);
        }

        // Load Local Data first (responsive)
        const savedData = loadAppDataLocal();
        if (savedData) applyData(savedData);

        // Then Refresh from Cloud (latest)
        if (hasCloudConfig()) {
          await handleManualRefresh(false);
        }
      } catch (e) {
        console.error("Initialization error", e);
      } finally {
        setIsDataLoaded(true);
      }
    };
    initData();
  }, [handleManualRefresh, applyData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const user = users.find(u => u.username === loginUsername.trim().toLowerCase());
    const legacyPassword = (user as any)?.password;
    const storedPassword = user?.passwordHash || legacyPassword || '';
    
    if (!user || !user.isActive || !(await verifyPassword(loginPassword, storedPassword))) {
      setLoginError('Username atau Password salah!');
      appendAuditLog({
        id: `AUD-${Date.now()}`,
        action: 'LOGIN_FAILED',
        actorName: loginUsername || 'Unknown',
        entityType: 'AUTH',
        details: `Percobaan login gagal untuk username ${loginUsername || '-'}.`,
        createdAt: new Date().toISOString(),
      });
      return;
    }

    // Perbaikan: Validasi Batasan Operasional Jam Kerja
    if (user.schedule && user.schedule.enabled) {
      const now = new Date();
      const currentH = now.getHours();
      const currentM = now.getMinutes();
      const currentTimeInMinutes = currentH * 60 + currentM;

      const [startH, startM] = user.schedule.startTime.split(':').map(Number);
      const [endH, endM] = user.schedule.endTime.split(':').map(Number);
      const startTotal = startH * 60 + startM;
      const endTotal = endH * 60 + endM;

      if (currentTimeInMinutes < startTotal || currentTimeInMinutes > endTotal) {
        setLoginError(`AKSES DITOLAK: Jam kerja Anda adalah ${user.schedule.startTime} s/d ${user.schedule.endTime}. Silakan hubungi admin.`);
        return;
      }
    }

    const upgradedPasswordHash = storedPassword === loginPassword ? await hashPassword(loginPassword) : user.passwordHash;
    const updatedUser = { ...user, passwordHash: upgradedPasswordHash, lastLoginAt: new Date().toISOString() };
    setUsers(prev => prev.map(item => item.id === updatedUser.id ? updatedUser : item));
    setCurrentUser(updatedUser);
    saveSessionLocal(sanitizeUserSession(updatedUser));
    appendAuditLog({
      id: `AUD-${Date.now()}`,
      action: 'LOGIN_SUCCESS',
      actorId: updatedUser.id,
      actorName: updatedUser.name,
      entityType: 'AUTH',
      entityId: updatedUser.id,
      entityLabel: updatedUser.username,
      details: `${updatedUser.name} berhasil login.`,
      createdAt: new Date().toISOString(),
    });
    const defaultTab = getAccessibleTabs(updatedUser)[0] || 'dashboard';
    setActiveTab(defaultTab);
  };

  const handleManualPush = useCallback(async () => {
    if (!hasCloudConfig()) return;
    setIsSyncing(true);
    try {
      const config = getCloudConfig();
      const dataToSave = buildDataSnapshot();
      await pushToCloud(dataToSave);
      setLastSyncTime(new Date().toLocaleTimeString());
      if (currentUser) {
        appendAuditLog({
          id: `AUD-${Date.now()}`,
          action: 'SYNC_PUSH',
          actorId: currentUser.id,
          actorName: currentUser.name,
          entityType: 'SYNC',
          details: `Sinkronisasi manual berhasil untuk workspace ${config.storeId}.`,
          createdAt: new Date().toISOString(),
        });
      }
      alert("Sinkronisasi manual berhasil dikirim ke Cloud!");
    } catch (e) {
      setSyncError(true);
      alert("Gagal mengirim sinkronisasi manual.");
    } finally {
      setIsSyncing(false);
    }
  }, [appendAuditLog, buildDataSnapshot, currentUser]);

  const switchDb = async (config: any) => {
    saveCloudConfig(config);
    setIsCloudActive(config.enabled);
    setSavedDbs(getCloudProfiles());
    setLoginAccessMode(config.enabled ? 'cloud' : 'local');
    setShowCloudSelector(false);
    if (config.enabled) {
      await handleManualRefresh(false);
    }
  };

  const handleAddActivationCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationCodeInput.trim()) return;
    const success = applyActivationCode(activationCodeInput.trim());
    if (success) {
      const config = getCloudConfig();
      setIsCloudActive(config.enabled);
      setSavedDbs(getCloudProfiles());
      handleManualRefresh(false);
      setShowAddDb(false);
      setActivationCodeInput('');
    } else {
      alert("Kode Aktivasi Tidak Valid!");
    }
  };

  // Fix: Implemented missing handleAddManualDb function to handle manual database connection
  const handleAddManualDb = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDbForm.storeId || !newDbForm.displayName || !newDbForm.supabaseUrl || !newDbForm.supabaseAnonKey) {
      alert("Mohon lengkapi semua field!");
      return;
    }
    const config = { ...newDbForm, enabled: true };
    switchDb(config);
    setShowAddDb(false);
    setNewDbForm({ storeId: '', displayName: '', region: '', supabaseUrl: '', supabaseAnonKey: '', supabaseBucket: 'erp-media' });
  };

  const openAdminSetup = useCallback(() => {
    setAdminUnlockError('');
    setAdminUnlockPassword('');
    setShowCloudSelector(false);
    setShowAdminUnlock(true);
  }, []);

  const closeAdminSetup = useCallback(() => {
    setShowAddDb(false);
    setShowAdminUnlock(false);
    setShowRecoveryPanel(false);
    setRecoveryWorkspaceInput('');
    setRecoveryPhraseInput('');
    setAdminUnlockError('');
    setAdminUnlockPassword('');
  }, []);

  const handleAdminUnlock = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminUnlockError('');
    const candidate = users.find(u => u.username === adminUnlockUsername.trim().toLowerCase());
    const candidatePassword = candidate?.passwordHash || (candidate as any)?.password || '';

    if (!candidate || !candidate.isActive || !hasPermission(candidate, 'settings.manage') || !(await verifyPassword(adminUnlockPassword, candidatePassword))) {
      setAdminUnlockError('Akses ditolak. Gunakan akun admin yang valid.');
      return;
    }

    setShowAdminUnlock(false);
    setShowAddDb(true);
    setAdminUnlockPassword('');
  }, [adminUnlockPassword, adminUnlockUsername, users]);

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(buildDataSnapshot(), null, 2)], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `poshulio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
  };

  const importBackup = async (file: File) => {
    const content = await file.text();
    const parsed = JSON.parse(content) as Partial<AppData>;
    applyData(parsed);
    saveAppDataLocal({ ...buildDataSnapshot(), ...parsed } as AppData);
  };

  const handleResetWorkspaceUsers = useCallback(async () => {
    const config = getCloudConfig();
    const workspaceLabel = config.enabled ? getCloudProfileLabel(config) : 'Lokal';
    const expectedWorkspace = config.storeId || 'local_offline';
    if (recoveryWorkspaceInput.trim().toLowerCase() !== expectedWorkspace.toLowerCase()) {
      alert(`Ketik Workspace ID yang benar: ${expectedWorkspace}`);
      return;
    }
    if (recoveryPhraseInput.trim().toUpperCase() !== 'RESET USERS') {
      alert('Ketik frasa konfirmasi RESET USERS untuk melanjutkan.');
      return;
    }

    const resetUsers = mockUsers.map(user => ({ ...user }));
    const dataToSave = { ...buildDataSnapshot(), users: resetUsers };

    setUsers(resetUsers);
    setCurrentUser(null);
    clearSessionLocal();
    saveAppDataLocal(dataToSave);
    setLoginError('');
    setShowRecoveryPanel(false);
    setRecoveryWorkspaceInput('');
    setRecoveryPhraseInput('');

    if (!config.enabled) {
      alert(`User default lokal berhasil direset. Gunakan admin / 123.`);
      return;
    }

    setIsSyncing(true);
    try {
      await pushToCloud(dataToSave);
      setLastSyncTime(new Date().toLocaleTimeString());
      setSyncError(false);
      alert(`User default untuk workspace ${workspaceLabel} berhasil direset. Gunakan admin / 123.`);
    } catch (error) {
      setSyncError(true);
      alert('Reset user lokal berhasil, tetapi sinkronisasi ke cloud gagal. Periksa koneksi workspace lalu coba lagi.');
    } finally {
      setIsSyncing(false);
    }
  }, [buildDataSnapshot, recoveryPhraseInput, recoveryWorkspaceInput]);

  const runInventorySafeMutation = useCallback(async (
    mutator: (snapshot: AppData) => AppData,
  ) => {
    const localSnapshot = buildDataSnapshot();
    
    // Always apply locally first — never lose a transaction
    const nextLocal = mutator(localSnapshot);
    applyData(nextLocal);
    saveAppDataLocal(nextLocal);

    // Then try to sync to cloud (non-blocking for the cashier)
    if (hasCloudConfig()) {
      setIsSyncing(true);
      try {
        await withCloudInventoryLock(async () => {
          // Re-read from cloud to get latest, merge, then push
          const latest = await pullFromCloud();
          const baseSnapshot = (latest && typeof latest === 'object')
            ? ({ ...localSnapshot, ...latest } as AppData)
            : localSnapshot;
          const nextSnapshot = mutator(baseSnapshot);
          await pushToCloud(nextSnapshot);
          // Update local with cloud-merged version
          applyData(nextSnapshot);
          saveAppDataLocal(nextSnapshot);
        });
        setSyncError(false);
        setLastSyncTime(new Date().toLocaleTimeString());
      } catch (error: any) {
        // Cloud sync failed — but transaction is already saved locally!
        setSyncError(true);
        console.warn('[Sync] Cloud sync failed, data saved locally:', error?.message);
        // Don't throw — the sale is safe in localStorage
      } finally {
        setIsSyncing(false);
      }
    }
  }, [applyData, buildDataSnapshot]);

  // HANDLERS WITH FUNCTIONAL UPDATES (PREV STATE SAFETY)
  const addItem = (item: Item) => {
    try {
      validateUniqueItem(items, item);
      setItems(prev => [...prev, item]);
      if (currentUser) {
        appendAuditLog({
          id: `AUD-${Date.now()}`,
          action: 'ITEM_CREATED',
          actorId: currentUser.id,
          actorName: currentUser.name,
          entityType: 'ITEM',
          entityId: item.id,
          entityLabel: item.name,
          details: `Master barang ${item.name} ditambahkan.`,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      alert(error.message);
    }
  };
  const addItemsBulk = (newItems: Item[]) => {
    try {
      newItems.forEach(item => validateUniqueItem([...items, ...newItems.filter(candidate => candidate.id !== item.id)], item));
      setItems(prev => [...prev, ...newItems]);
    } catch (error: any) {
      alert(error.message);
    }
  };
  const updateItem = (updated: Item) => {
    try {
      validateUniqueItem(items, updated);
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
      if (currentUser) {
        appendAuditLog({
          id: `AUD-${Date.now()}`,
          action: 'ITEM_UPDATED',
          actorId: currentUser.id,
          actorName: currentUser.name,
          entityType: 'ITEM',
          entityId: updated.id,
          entityLabel: updated.name,
          details: `Master barang ${updated.name} diperbarui.`,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      alert(error.message);
    }
  };
  const updateItemsBulk = (updatedList: Item[]) => {
    setItems(prev => {
      const newItems = [...prev];
      updatedList.forEach(updated => {
        const idx = newItems.findIndex(i => i.id === updated.id);
        if (idx !== -1) newItems[idx] = updated;
      });
      return newItems;
    });
  };
  const deleteItem = (id: string) => {
    const target = items.find(item => item.id === id);
    if (target && currentUser) {
      appendAuditLog({
        id: `AUD-${Date.now()}`,
        action: 'ITEM_DELETED',
        actorId: currentUser.id,
        actorName: currentUser.name,
        entityType: 'ITEM',
        entityId: id,
        entityLabel: target.name,
        details: `Master barang ${target.name} dihapus.`,
        createdAt: new Date().toISOString(),
      });
    }
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const applyAIPriceUpdates = (updates: AIPriceUpdateDraft[]) => {
    if (!currentUser || updates.length === 0) return;
    const beforeItems = items
      .filter(item => updates.some(update => update.itemId === item.id))
      .map(item => ({ ...item }));
    const updateMap = new Map(updates.map(update => [update.itemId, update]));
    setItems(prev =>
      prev.map(item => {
        const draft = updateMap.get(item.id);
        if (!draft) return item;
        return {
          ...item,
          basePrice: draft.newBasePrice,
          memberPrices: draft.newMemberPrices,
        };
      }),
    );
    setAiUndoStack(prev => [{
      id: `UNDO-${Date.now()}`,
      actionType: 'PRICE_UPDATE' as const,
      label: `Undo perubahan harga (${updates.length} item)`,
      createdAt: new Date().toISOString(),
      payload: { items: beforeItems },
    }, ...prev].slice(0, 3));

    appendAuditLog({
      id: `AUD-${Date.now()}`,
      action: 'ITEM_UPDATED',
      actorId: currentUser.id,
      actorName: currentUser.name,
      entityType: 'ITEM',
      details: `AI Consultant mengeksekusi ${updates.length} perubahan harga barang dengan konfirmasi user.`,
      createdAt: new Date().toISOString(),
    });
  };

  const createAIPromotions = (drafts: PromotionCampaign[]) => {
    if (!currentUser || drafts.length === 0) return;
    const createdIds = drafts.map(item => item.id);
    setPromotions(prev => {
      const existing = new Set(prev.map(item => item.id));
      const next = drafts.filter(item => !existing.has(item.id));
      return [...next, ...prev];
    });
    setAiUndoStack(prev => [{
      id: `UNDO-${Date.now()}`,
      actionType: 'PROMO_CREATE' as const,
      label: `Undo pembuatan promo (${drafts.length} campaign)`,
      createdAt: new Date().toISOString(),
      payload: { promotionIds: createdIds },
    }, ...prev].slice(0, 3));
    appendAuditLog({
      id: `AUD-${Date.now()}`,
      action: 'SETTINGS_UPDATED',
      actorId: currentUser.id,
      actorName: currentUser.name,
      entityType: 'SETTINGS',
      details: `AI Consultant membuat ${drafts.length} campaign promo baru setelah konfirmasi user.`,
      createdAt: new Date().toISOString(),
    });
  };

  const createAIPurchaseOrders = (drafts: PurchaseOrder[]) => {
    if (!currentUser || drafts.length === 0) return;
    const createdIds = drafts.map(item => item.id);
    drafts.forEach(addPurchaseOrder);
    setAiUndoStack(prev => [{
      id: `UNDO-${Date.now()}`,
      actionType: 'PO_CREATE' as const,
      label: `Undo draft PO (${drafts.length} dokumen)`,
      createdAt: new Date().toISOString(),
      payload: { poIds: createdIds },
    }, ...prev].slice(0, 3));
  };

  const undoAIAction = (undoId: string) => {
    if (!currentUser) return;
    const target = aiUndoStack.find(entry => entry.id === undoId);
    if (!target) return;

    if (target.actionType === 'PRICE_UPDATE') {
      const restoreItems: Item[] = Array.isArray(target.payload?.items) ? target.payload.items : [];
      const map = new Map(restoreItems.map(item => [item.id, item]));
      setItems(prev => prev.map(item => map.get(item.id) || item));
    }

    if (target.actionType === 'PROMO_CREATE') {
      const ids: string[] = Array.isArray(target.payload?.promotionIds) ? target.payload.promotionIds : [];
      setPromotions(prev => prev.filter(item => !ids.includes(item.id)));
    }

    if (target.actionType === 'PO_CREATE') {
      const ids: string[] = Array.isArray(target.payload?.poIds) ? target.payload.poIds : [];
      setPurchaseOrders(prev => prev.filter(item => !ids.includes(item.id)));
    }

    setAiUndoStack(prev => prev.filter(entry => entry.id !== undoId));
    appendAuditLog({
      id: `AUD-${Date.now()}`,
      action: 'SETTINGS_UPDATED',
      actorId: currentUser.id,
      actorName: currentUser.name,
      entityType: 'SETTINGS',
      details: `Undo dijalankan untuk aksi AI: ${target.label}.`,
      createdAt: new Date().toISOString(),
    });
  };

  const addMediaAsset = (asset: MediaAsset) => {
    setMediaAssets(prev => [asset, ...prev]);
    if (!currentUser) return;
    appendAuditLog({
      id: `AUD-${Date.now()}`,
      action: 'SETTINGS_UPDATED',
      actorId: currentUser.id,
      actorName: currentUser.name,
      entityType: 'SETTINGS',
      details: `Media diunggah: ${asset.name} (${asset.sourceType}).`,
      createdAt: new Date().toISOString(),
    });
  };

  const patchMediaAsset = (id: string, patch: Partial<MediaAsset>) => {
    setMediaAssets(prev => prev.map(item => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeMediaAsset = (id: string) => {
    const target = mediaAssets.find(item => item.id === id);
    setMediaAssets(prev => prev.filter(item => item.id !== id));
    if (!currentUser || !target) return;
    appendAuditLog({
      id: `AUD-${Date.now()}`,
      action: 'SETTINGS_UPDATED',
      actorId: currentUser.id,
      actorName: currentUser.name,
      entityType: 'SETTINGS',
      details: `Media dihapus: ${target.name}.`,
      createdAt: new Date().toISOString(),
    });
  };

  const addCustomer = (c: Customer) => setCustomers(prev => [...prev, c]);
  const updateCustomer = (updated: Customer) => setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
  const deleteCustomer = (id: string) => setCustomers(prev => prev.filter(c => c.id !== id));

  const addSupplier = (s: Supplier) => setSuppliers(prev => [...prev, s]);
  const updateSupplier = (updated: Supplier) => setSuppliers(prev => prev.map(s => s.id === updated.id ? updated : s));
  const deleteSupplier = (id: string) => setSuppliers(prev => prev.filter(s => s.id !== id));

  const addUser = async (draft: UserDraft) => {
    if (users.some(user => user.username === draft.username)) {
      alert('Username sudah digunakan.');
      return;
    }
    const passwordHash = await hashPassword(draft.password || '123');
    const newUser: User = {
      id: draft.id,
      name: draft.name,
      username: draft.username,
      passwordHash,
      role: draft.role,
      permissions: draft.permissions,
      schedule: draft.schedule,
      isActive: draft.isActive ?? true,
      sessionPolicy: draft.sessionPolicy,
    };
    setUsers(prev => [...prev, newUser]);
    if (currentUser) {
      appendAuditLog({
        id: `AUD-${Date.now()}`,
        action: 'USER_CREATED',
        actorId: currentUser.id,
        actorName: currentUser.name,
        entityType: 'USER',
        entityId: newUser.id,
        entityLabel: newUser.username,
        details: `User ${newUser.username} dibuat dengan role ${newUser.role}.`,
        createdAt: new Date().toISOString(),
      });
    }
  };
  const updateUser = async (draft: UserDraft) => {
    const existing = users.find(user => user.id === draft.id);
    if (!existing) return;
    const passwordHash = draft.password ? await hashPassword(draft.password) : existing.passwordHash;
    const updated: User = {
      ...existing,
      ...draft,
      passwordHash,
      isActive: draft.isActive ?? existing.isActive,
    };
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    // Update active session if updated user is current user
    if (currentUser?.id === updated.id) {
       setCurrentUser(updated);
       saveSessionLocal(sanitizeUserSession(updated));
    }
    if (currentUser) {
      appendAuditLog({
        id: `AUD-${Date.now()}`,
        action: 'USER_UPDATED',
        actorId: currentUser.id,
        actorName: currentUser.name,
        entityType: 'USER',
        entityId: updated.id,
        entityLabel: updated.username,
        details: `User ${updated.username} diperbarui.`,
        createdAt: new Date().toISOString(),
      });
    }
  };
  const deleteUser = (id: string) => {
    if (id === currentUser?.id) return;
    const target = users.find(user => user.id === id);
    setUsers(prev => prev.filter(u => u.id !== id));
    if (target && currentUser) {
      appendAuditLog({
        id: `AUD-${Date.now()}`,
        action: 'USER_DELETED',
        actorId: currentUser.id,
        actorName: currentUser.name,
        entityType: 'USER',
        entityId: target.id,
        entityLabel: target.username,
        details: `User ${target.username} dihapus.`,
        createdAt: new Date().toISOString(),
      });
    }
  };

  const getOpenCashSession = useCallback((userId?: string) => {
    if (!userId) return null;
    return cashSessions.find(session => session.userId === userId && session.status === 'OPEN') || null;
  }, [cashSessions]);

  const openCashSession = (openingCash: number) => {
    if (!currentUser) return;
    const existing = getOpenCashSession(currentUser.id);
    if (existing) {
      alert('Masih ada shift kasir yang terbuka.');
      return;
    }

    const session: CashSession = {
      id: `CS-${Date.now().toString().slice(-6)}`,
      userId: currentUser.id,
      userName: currentUser.name,
      openedAt: new Date().toISOString(),
      openingCash,
      status: 'OPEN',
      nonCashSales: 0,
      creditSales: 0,
    };
    setCashSessions(prev => [session, ...prev]);
  };

  const closeCashSession = (closingCash: number, closingNotes: string = '') => {
    if (!currentUser) return;
    const openSession = getOpenCashSession(currentUser.id);
    if (!openSession) {
      alert('Tidak ada shift kasir terbuka.');
      return;
    }

    const sessionSales = sales.filter(sale => sale.cashSessionId === openSession.id);
    const expectedCash = openSession.openingCash + sessionSales.filter(sale => sale.paymentType === 'TUNAI').reduce((sum, sale) => sum + sale.total, 0);
    const nonCashSales = sessionSales.filter(sale => sale.paymentType === 'NON-TUNAI').reduce((sum, sale) => sum + sale.total, 0);
    const creditSales = sessionSales.filter(sale => sale.paymentType === 'KREDIT').reduce((sum, sale) => sum + sale.total, 0);
    const shortageOrOverage = closingCash - expectedCash;

    setCashSessions(prev => prev.map(session => session.id === openSession.id ? {
      ...session,
      closedAt: new Date().toISOString(),
      closingCash,
      expectedCash,
      nonCashSales,
      creditSales,
      shortageOrOverage,
      closingNotes,
      status: 'CLOSED',
    } : session));
  };

  const addSale = (sale: Sale) => {
    if (!currentUser) return;
    (async () => {
      try {
        await runInventorySafeMutation((snapshot) => {
          const openSession = snapshot.cashSessions.find(session => session.userId === currentUser.id && session.status === 'OPEN') || null;
          const result = completeSale(snapshot.items, sale, currentUser, snapshot.customers);
          const preparedSale: Sale = {
            ...sale,
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
            operatorId: currentUser.id,
            cashSessionId: openSession?.id,
          };
          
          let nextCustomers = snapshot.customers;
          if (sale.paymentType === 'KREDIT') {
            nextCustomers = nextCustomers.map(customer => customer.id === sale.customerId ? { ...customer, currentDebt: customer.currentDebt + sale.total } : customer);
          }
          if (result.updatedCustomer) {
            nextCustomers = nextCustomers.map(c => c.id === result.updatedCustomer!.id ? { ...c, rewardPoints: result.updatedCustomer!.rewardPoints } : c);
          }
          return {
            ...snapshot,
            sales: [preparedSale, ...snapshot.sales],
            items: result.items,
            customers: nextCustomers,
            inventoryMovements: [...result.movements, ...snapshot.inventoryMovements],
            paymentRecords: [result.payment, ...snapshot.paymentRecords],
            auditLogs: [result.audit, ...snapshot.auditLogs].slice(0, 500),
          };
        });
      } catch (error: any) {
        alert(error?.message || 'Gagal memproses penjualan. Coba lagi.');
      }
    })();
  };

  const addReturn = (ret: SaleReturn) => {
    if (!currentUser) return;
    (async () => {
      try {
        const canApproveReturn = hasPermission(currentUser, 'return.approve');
        const preparedReturn: SaleReturn = {
          ...ret,
          createdAt: new Date().toISOString(),
          operatorId: currentUser.id,
          status: canApproveReturn ? 'APPROVED' : 'PENDING',
        };

        if (!canApproveReturn) {
          setReturns(prev => [preparedReturn, ...prev]);
          appendAuditLog({
            id: `AUD-${Date.now()}`,
            action: 'RETURN_COMPLETED',
            actorId: currentUser.id,
            actorName: currentUser.name,
            entityType: 'RETURN',
            entityId: preparedReturn.id,
            entityLabel: preparedReturn.returnNo,
            details: `Retur ${preparedReturn.returnNo} dibuat dan menunggu approval.`,
            createdAt: new Date().toISOString(),
          });
          return;
        }

        await runInventorySafeMutation((snapshot) => {
          const result = completeReturn(snapshot.items, snapshot.sales, snapshot.returns, preparedReturn, currentUser);
          return {
            ...snapshot,
            returns: [preparedReturn, ...snapshot.returns],
            items: result.items,
            inventoryMovements: [...result.movements, ...snapshot.inventoryMovements],
            paymentRecords: [result.payment, ...snapshot.paymentRecords],
            auditLogs: [result.audit, ...snapshot.auditLogs].slice(0, 500),
          };
        });
      } catch (error: any) {
        alert(error?.message || 'Gagal memproses retur.');
      }
    })();
  };

  const approveReturn = (returnId: string) => {
    if (!currentUser || !hasPermission(currentUser, 'return.approve')) return;
    (async () => {
      try {
        await runInventorySafeMutation((snapshot) => {
          const targetReturn = snapshot.returns.find(entry => entry.id === returnId);
          if (!targetReturn || targetReturn.status === 'APPROVED') return snapshot;
          const approvedReturns = snapshot.returns.filter(entry => entry.status === 'APPROVED');
          const result = completeReturn(snapshot.items, snapshot.sales, approvedReturns, { ...targetReturn, status: 'APPROVED' }, currentUser);
          return {
            ...snapshot,
            returns: snapshot.returns.map(entry => entry.id === returnId ? { ...entry, status: 'APPROVED' } : entry),
            items: result.items,
            inventoryMovements: [...result.movements, ...snapshot.inventoryMovements],
            paymentRecords: [result.payment, ...snapshot.paymentRecords],
            auditLogs: [result.audit, ...snapshot.auditLogs].slice(0, 500),
          };
        });
      } catch (error: any) {
        alert(error?.message || 'Gagal approve retur.');
      }
    })();
  };

  const addPurchaseOrder = (po: PurchaseOrder) => {
    setPurchaseOrders(prev => [po, ...prev]);
    if (currentUser) {
      appendAuditLog({
        id: `AUD-${Date.now()}`,
        action: 'PO_CREATED',
        actorId: currentUser.id,
        actorName: currentUser.name,
        entityType: 'PURCHASE_ORDER',
        entityId: po.id,
        entityLabel: po.id,
        details: `PO ${po.id} dibuat untuk supplier ${po.supplierName}.`,
        createdAt: new Date().toISOString(),
      });
    }
  };
  const payPurchaseOrder = (poId: string, amount?: number, note?: string, method?: string) => {
    const po = purchaseOrders.find(item => item.id === poId);
    if (!po) return;
    const payableAmount = po.total - (po.paidAmount || 0);
    const paymentAmount = amount && amount > 0 ? Math.min(amount, payableAmount) : payableAmount;
    setPurchaseOrders(prev => prev.map(item => item.id === poId ? {
      ...item,
      paidAmount: (item.paidAmount || 0) + paymentAmount,
      isPaid: ((item.paidAmount || 0) + paymentAmount) >= item.total,
      paymentNotes: note ? [...(item.paymentNotes || []), note] : item.paymentNotes,
    } : item));
    if (po && currentUser) {
      setPaymentRecords(prev => [{
        id: `PAY-${Date.now()}`,
        referenceNo: po.id,
        referenceType: 'PURCHASE_ORDER',
        amount: paymentAmount,
        method: method || 'PAYABLE_SETTLEMENT',
        direction: 'OUT',
        createdAt: new Date().toISOString(),
        operatorName: currentUser.name,
        operatorId: currentUser.id,
      }, ...prev]);
      appendAuditLog({
        id: `AUD-${Date.now()}`,
        action: 'PO_PAID',
        actorId: currentUser.id,
        actorName: currentUser.name,
        entityType: 'PURCHASE_ORDER',
        entityId: po.id,
        entityLabel: po.id,
        details: `Pembayaran PO ${po.id} sebesar Rp ${paymentAmount.toLocaleString()} berhasil dicatat.`,
        createdAt: new Date().toISOString(),
      });
    }
  };
  const receivePurchaseOrder = (poId: string, updatedItems: { itemId: string, receivedQty: number }[]) => {
    if (!currentUser) return;
    (async () => {
      try {
        await runInventorySafeMutation((snapshot) => {
          const po = snapshot.purchaseOrders.find(item => item.id === poId);
          if (!po) return snapshot;
          const result = receivePurchaseOrderStock(snapshot.items, po, updatedItems, currentUser);
          return {
            ...snapshot,
            purchaseOrders: snapshot.purchaseOrders.map(item => item.id === poId ? {
              ...item,
              status: 'RECEIVED',
              items: item.items.map(line => {
                const update = updatedItems.find(u => u.itemId === line.itemId);
                return update ? { ...line, receivedQty: update.receivedQty } : line;
              }),
            } : item),
            items: result.items,
            inventoryMovements: [...result.movements, ...snapshot.inventoryMovements],
            auditLogs: [result.audit, ...snapshot.auditLogs].slice(0, 500),
          };
        });
      } catch (error: any) {
        alert(error?.message || 'Gagal receive PO.');
      }
    })();
  };

  const handleStockAdjustment = (log: any) => {
    if (!currentUser) return;
    (async () => {
      try {
        await runInventorySafeMutation((snapshot) => {
          const result = adjustStock(snapshot.items, log.itemId, log.actualStock, log.id, log.notes, currentUser);
          return {
            ...snapshot,
            inventoryLogs: [log, ...snapshot.inventoryLogs],
            items: result.items,
            inventoryMovements: [result.movement, ...snapshot.inventoryMovements],
            auditLogs: [result.audit, ...snapshot.auditLogs].slice(0, 500),
          };
        });
      } catch (error: any) {
        alert(error?.message || 'Gagal adjust stok.');
      }
    })();
  };

  const handleStockAdjustmentBulk = (logs: any[]) => {
    if (!currentUser) return;
    (async () => {
      try {
        await runInventorySafeMutation((snapshot) => {
          let nextItems = snapshot.items;
          const bulkMovements: InventoryMovement[] = [];
          const bulkAudits: AuditLog[] = [];
          logs.forEach(log => {
            const result = adjustStock(nextItems, log.itemId, log.actualStock, log.id, log.notes, currentUser);
            nextItems = result.items;
            bulkMovements.push(result.movement);
            bulkAudits.push(result.audit);
          });
          return {
            ...snapshot,
            inventoryLogs: [...logs, ...snapshot.inventoryLogs],
            items: nextItems,
            inventoryMovements: [...bulkMovements, ...snapshot.inventoryMovements],
            auditLogs: [...bulkAudits, ...snapshot.auditLogs].slice(0, 500),
          };
        });
      } catch (error: any) {
        alert(error?.message || 'Gagal bulk adjust stok.');
      }
    })();
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-sky-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm animate-fadeIn">
          {/* Card */}
          <div className="bg-white rounded-3xl shadow-soft-lg border border-slate-100/80 overflow-hidden">
            {/* Top accent */}
            <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
            
            {/* Header */}
            <div className="pt-10 pb-6 px-8 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-indigo-200/50 rotate-3 hover:rotate-0 transition-transform duration-300">
                <span className="text-white font-bold text-2xl -rotate-3">H</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Selamat Datang</h1>
              <p className="text-slate-400 text-sm mt-1.5">Masuk ke POS Hulio</p>
            </div>

            {/* Form */}
            <div className="px-8 pb-8">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="login-user" className="text-xs font-medium text-slate-500 mb-1.5 block">Username</label>
                  <input
                    id="login-user"
                    type="text"
                    required
                    autoFocus
                    autoComplete="username"
                    className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 focus:bg-white outline-none transition-all"
                    placeholder="Ketik username..."
                    value={loginUsername}
                    onChange={e => setLoginUsername(e.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="login-pass" className="text-xs font-medium text-slate-500 mb-1.5 block">Password</label>
                  <input
                    id="login-pass"
                    type="password"
                    required
                    autoComplete="current-password"
                    className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 focus:bg-white outline-none transition-all"
                    placeholder="Ketik password..."
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                  />
                </div>

                {loginError && (
                  <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm flex items-center gap-2 animate-fadeIn" role="alert">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-semibold text-sm shadow-md shadow-indigo-200/50 active:scale-[0.97] transition-all mt-2"
                >
                  Masuk →
                </button>
              </form>

              {/* Hint */}
              <div className="mt-6 flex items-center gap-3 p-3 bg-gradient-to-r from-slate-50 to-indigo-50/30 rounded-xl">
                <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                  <Key size={14} className="text-indigo-600" />
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Default login: <span className="font-semibold text-slate-700">admin</span> / <span className="font-semibold text-slate-700">123</span>
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-5 space-y-1">
            <p className="text-xs text-slate-400">
              {hasCloudConfig() ? '☁️ Cloud Sync Aktif' : '💾 Data tersimpan lokal'}
            </p>
            <p className="text-[11px] text-slate-300">POS Hulio v5</p>
          </div>
        </div>
      </div>
    );
  }


  const renderContent = () => {
    if (!currentUser) return null;
    const isManager = currentUser.role === UserRole.MANAGER || currentUser.role === UserRole.OWNER;
    if (activeTab === 'settings') {
      if (!hasPermission(currentUser, 'settings.manage')) {
        setActiveTab(getAccessibleTabs(currentUser)[0] || 'dashboard');
        return null;
      }
      return <Settings onCloudConfigChange={() => { setIsCloudActive(hasCloudConfig()); setSavedDbs(getCloudProfiles()); }} onExportBackup={exportBackup} onImportBackup={importBackup} />;
    }

    if (!canAccessTab(currentUser, activeTab)) {
       return (
         <div className="h-full flex flex-col items-center justify-center p-10 text-center space-y-6 animate-in fade-in duration-500">
           <div className="w-24 h-24 bg-red-50 text-red-500 rounded-full flex items-center justify-center shadow-inner border-4 border-red-100"><Lock size={48} /></div>
           <div><h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Akses Ditolak</h2><p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-2 max-w-xs mx-auto">Anda tidak memiliki izin akses untuk modul ini. Hubungi Manager untuk bantuan.</p></div>
           <button onClick={() => setActiveTab(getAccessibleTabs(currentUser)[0] || 'dashboard')} className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 border-b-4 border-slate-950">Kembali ke Beranda</button>
         </div>
       );
    }

    switch (activeTab) {
      case 'dashboard': return <Dashboard items={items} sales={sales} customers={customers} accounts={accounts} purchaseOrders={purchaseOrders} inventoryMovements={inventoryMovements} cashSessions={cashSessions} currentUser={currentUser} onOpenCashSession={openCashSession} onCloseCashSession={closeCashSession} />;
      case 'master-items': return <MasterData type="items" items={items} onAddItem={addItem} onAddItemsBulk={addItemsBulk} onUpdateItem={updateItem} onUpdateItemsBulk={updateItemsBulk} onDeleteItem={deleteItem} onManualPush={handleManualPush} onRefresh={() => handleManualRefresh(true)} isSyncing={isSyncing} />;
      case 'master-contacts': return <MasterData type="contacts" customers={customers} suppliers={suppliers} onAddCustomer={addCustomer} onUpdateCustomer={updateCustomer} onAddSupplier={addSupplier} onUpdateSupplier={updateSupplier} onDeleteCustomer={deleteCustomer} onDeleteSupplier={deleteSupplier} />;
      case 'pos': return <SalesPOS currentUser={currentUser} items={items} customers={customers} promotions={promotions} onCompleteSale={addSale} />;
      case 'sales-list': return <SalesList sales={sales} onInitiateReturn={(invNo) => { setPreselectedReturnInvoice(invNo); setActiveTab('returns'); }} />;
      case 'returns': return <Returns sales={sales} returns={returns} onCompleteReturn={addReturn} onApproveReturn={approveReturn} currentUser={currentUser} preselectedInvoiceNo={preselectedReturnInvoice} />;
      case 'purchasing': return <Purchasing purchaseOrders={purchaseOrders} suppliers={suppliers} items={items} onAddPO={addPurchaseOrder} onReceivePO={receivePurchaseOrder} onPayPO={payPurchaseOrder} currentUser={currentUser} />;
      case 'stock-opname': return <Inventory items={items} logs={inventoryLogs} movements={inventoryMovements} onAdjustStock={handleStockAdjustment} onAdjustStockBulk={handleStockAdjustmentBulk} />;
      case 'accounting': return <Accounting accounts={accounts} sales={sales} cashSessions={cashSessions} />;
      case 'reporting': return <Reporting items={items} customers={customers} suppliers={suppliers} accounts={accounts} sales={sales} purchaseOrders={purchaseOrders} onAnalyzeWithAI={() => setActiveTab('ai-consultant')} />;
      case 'media-vault': return (
        <MediaVault
          currentUser={currentUser}
          mediaAssets={mediaAssets}
          onAddMediaAsset={addMediaAsset}
          onPatchMediaAsset={patchMediaAsset}
          onRemoveMediaAsset={removeMediaAsset}
        />
      );
      case 'erp-control': return (
        <ERPControlTower
          currentUser={currentUser}
          sales={sales}
          purchaseOrders={purchaseOrders}
          returns={returns}
          items={items}
          customers={customers}
          suppliers={suppliers}
          cashSessions={cashSessions}
          onNavigate={setActiveTab}
        />
      );
      case 'user-management': return <UserManagement users={users} onAddUser={addUser} onUpdateUser={updateUser} onDeleteUser={deleteUser} />;
      case 'ai-consultant': return (
        <AIConsultant
          items={items}
          sales={sales}
          accounts={accounts}
          messages={aiConsultantHistory}
          onUpdateMessages={setAiConsultantHistory}
          onApplyPriceUpdates={applyAIPriceUpdates}
          onCreatePromotions={createAIPromotions}
          onCreatePurchaseOrders={createAIPurchaseOrders}
          undoHistory={aiUndoStack}
          onUndoAction={undoAIAction}
          mediaAssets={mediaAssets}
          canEditPrices={hasPermission(currentUser, 'item.edit')}
          canCreatePromotions={hasPermission(currentUser, 'sale.create')}
          canCreatePurchaseOrders={hasPermission(currentUser, 'purchase.create')}
          suppliers={suppliers}
        />
      );
      default: return <div className="p-20 text-center font-black opacity-20 uppercase">Modul Belum Tersedia</div>;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} onLogout={handleLogout} items={items} sales={sales} accounts={accounts} floatingMessages={floatingChatHistory} onUpdateMessages={setFloatingChatHistory} isSyncing={isSyncing} onManualSync={() => handleManualRefresh(true)} lastSyncTime={lastSyncTime} syncError={syncError}>
      <Suspense fallback={<PageLoadingFallback />}>
        {renderContent()}
      </Suspense>
    </Layout>
  );
};

export default App;
