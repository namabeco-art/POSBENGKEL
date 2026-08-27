import React, { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import { AIPriceUpdateDraft, AIUndoEntry, AppData, AuditLog, Branch, CashExpense, CashSession, Customer, InventoryMovement, Item, MediaAsset, PaymentRecord, PromotionCampaign, PurchaseOrder, Sale, SaleReturn, Supplier, User, UserRole, Account } from './types';
import { mockUsers, mockItems, mockCustomers, mockSuppliers, mockAccounts, mockBranches, mockPromotions } from './store';
import { ShieldCheck, User as UserIcon, Key, Clock, AlertCircle, Info, CloudLightning, RefreshCw, Loader2, Link2, CheckCircle2, X, Plus, Store, ChevronRight, Globe, Lock, Trash2, Settings2, Database, HardDrive, Server, QrCode, Terminal, Activity, ChevronDown, Search, Cloud, Monitor, MapPin, ShieldEllipsis } from 'lucide-react';
import { pullFromCloud, pushToCloud, getCloudConfig, hasCloudConfig, applyActivationCode, saveCloudConfig, withCloudInventoryLock } from './services/syncService';
import { clearSessionLocal, loadAppDataLocal, loadSessionLocal, saveAppDataLocal, saveSessionLocal } from './services/storageService';
import { hashPassword, sanitizeUserSession, verifyPassword } from './services/authService';
import { canAccessTab, getAccessibleTabs, hasPermission } from './services/permissions';
import { getLoginLockoutRemaining, recordFailedLogin, resetLoginAttempts } from './services/rateLimiter';
import { adjustStock, completeReturn, completeSale, receivePurchaseOrderStock, validateUniqueItem } from './services/posOperations';
import { getCloudProfileLabel, getCloudProfileRegion, getCloudProfiles } from './services/cloudProfiles';
import { hasEnvCloudConfig, getEnvConfig } from './services/appConfig';
import { useAppStore } from './appStore';
import { mergeAppData } from './services/mergeService';
import { loadAppDataIndexedDB, saveAppDataIndexedDB } from './services/indexedDbService';
import { createId } from './services/idService';
import { postCashExpenseAccounts, postPurchaseOrderAccounts, postPurchasePaymentAccounts, postReturnAccounts, postSaleAccounts, reverseCashExpenseAccounts } from './services/accountingService';

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
    cashSessions, setCashSessions, cashExpenses, setCashExpenses, promotions, setPromotions,
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
      cashExpenses: state.cashExpenses,
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
      isApplyingFromCloud.current = true;
      const cloudData = await pullFromCloud();
      if (cloudData && typeof cloudData === 'object') {
        const localData = buildDataSnapshot();
        const merged = mergeAppData(localData, cloudData);
        applyData(merged);
        saveAppDataLocal(merged as AppData);
        void saveAppDataIndexedDB(merged as AppData);
      }
      setLastSyncTime(new Date().toLocaleTimeString());
      setSyncError(false);
      if (showFeedback) alert("Database berhasil diperbarui dari Cloud!");
    } catch (e) { 
      setSyncError(true);
      if (showFeedback) alert("Gagal sinkronisasi Cloud. Periksa koneksi atau kredensial."); 
    } finally {
      setIsSyncing(false);
      setTimeout(() => { isApplyingFromCloud.current = false; }, 1500);
    }
  }, [applyData, buildDataSnapshot]);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    setLoginView('auth');
    clearSessionLocal();
  }, []);

  // Flag to prevent push/pull infinite loop
  const isApplyingFromCloud = React.useRef(false);
  const lastPushTime = React.useRef(0);
  const pushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // AUTO-SAVE LOGIC (PERSISTENCE) — only save to localStorage
  useEffect(() => {
    if (!isDataLoaded) return;

    const unsubscribe = useAppStore.subscribe(() => {
      if (isApplyingFromCloud.current) return;
      const snapshot = buildDataSnapshot();
      saveAppDataLocal(snapshot);
      void saveAppDataIndexedDB(snapshot);

      // Schedule a cloud push if cloud is active
      if (hasCloudConfig()) {
        if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
        pushTimerRef.current = setTimeout(() => {
          const now = Date.now();
          if (now - lastPushTime.current < 5000) return;
          if (isApplyingFromCloud.current) return;
          lastPushTime.current = now;

          pushToCloud(buildDataSnapshot()).then(() => {
            setLastSyncTime(new Date().toLocaleTimeString());
            setSyncError(false);
          }).catch(() => {
            // Don't immediately show error — transient failures are normal
            // syncError will only be set by manual sync or after initial load failure
          });
        }, 4000);
      }
    });

    const initialSnapshot = buildDataSnapshot();
    saveAppDataLocal(initialSnapshot);
    void saveAppDataIndexedDB(initialSnapshot);
    return () => {
      unsubscribe();
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    };
  }, [buildDataSnapshot, isDataLoaded]);

  // AUTO-PULL FROM CLOUD (every 30 seconds) — uses merge, not overwrite
  useEffect(() => {
    if (!isDataLoaded || !hasCloudConfig()) return;

    const interval = setInterval(async () => {
      try {
        const cloudData = await pullFromCloud();
        if (cloudData && typeof cloudData === 'object') {
          isApplyingFromCloud.current = true;
          const localData = buildDataSnapshot();
          const merged = mergeAppData(localData, cloudData);
          applyData(merged);
          saveAppDataLocal(merged as AppData);
          void saveAppDataIndexedDB(merged as AppData);
          setLastSyncTime(new Date().toLocaleTimeString());
          setSyncError(false);
          setTimeout(() => { isApplyingFromCloud.current = false; }, 1000);
        }
      } catch {
        // Silent fail — don't set syncError for background pulls
        // Only manual sync should show error state
        isApplyingFromCloud.current = false;
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isDataLoaded, applyData, buildDataSnapshot]);

  // INITIAL LOAD — fixed: load saved data FIRST, then find user from loaded data
  useEffect(() => {
    const initData = async () => {
      try {
        // 1. Load Local Data first
        const savedData = await loadAppDataIndexedDB() || loadAppDataLocal();
        if (savedData) {
          let migratedData = savedData;
          if (!Array.isArray(savedData.cashExpenses)) {
            try {
              const legacyExpenses = JSON.parse(localStorage.getItem('HGROUP_KAS_HARIAN') || '[]');
              if (Array.isArray(legacyExpenses)) migratedData = { ...savedData, cashExpenses: legacyExpenses };
            } catch { /* data lama yang rusak diabaikan */ }
          }
          applyData(migratedData);
        }

        // 2. Load User Session (AFTER data is loaded so users array is correct)
        const savedSession = loadSessionLocal<User>();
        if (savedSession) {
          const currentUsers = useAppStore.getState().users;
          const user = currentUsers.find(item => item.id === savedSession.id);
          const maxAge = (user?.sessionPolicy?.maxOfflineMinutes || 12 * 60) * 60_000;
          const sessionAge = Date.now() - new Date(savedSession.lastLoginAt || 0).getTime();
          if (user?.isActive && sessionAge <= maxAge) setCurrentUser(user);
          else clearSessionLocal();
        }

        // 3. Then Refresh from Cloud (latest) with merge
        if (hasCloudConfig()) {
          try {
            isApplyingFromCloud.current = true;
            const cloudData = await pullFromCloud();
            if (cloudData && typeof cloudData === 'object') {
              const localData = buildDataSnapshot();
              const merged = mergeAppData(localData, cloudData);
              applyData(merged);
              saveAppDataLocal(merged as AppData);
              void saveAppDataIndexedDB(merged as AppData);
            }
            setSyncError(false);
            setLastSyncTime(new Date().toLocaleTimeString());
          } catch {
            setSyncError(true);
          } finally {
            setTimeout(() => { isApplyingFromCloud.current = false; }, 1000);
          }
        }
      } catch (e) {
        console.error("Initialization error", e);
      } finally {
        setIsDataLoaded(true);
      }
    };
    initData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    // Bug #5 fix: Rate limiting
    const lockoutRemaining = getLoginLockoutRemaining();
    if (lockoutRemaining > 0) {
      const min = Math.floor(lockoutRemaining / 60);
      const sec = lockoutRemaining % 60;
      setLoginError(`Terlalu banyak percobaan. Coba lagi dalam ${min}m ${sec}s.`);
      return;
    }

    const user = users.find(u => u.username === loginUsername.trim().toLowerCase());
    const legacyPassword = (user as any)?.password;
    const storedPassword = user?.passwordHash || legacyPassword || '';
    
    if (!user || !user.isActive || !(await verifyPassword(loginPassword, storedPassword))) {
      setLoginError('Username atau Password salah!');
      const lockMsg = recordFailedLogin();
      if (lockMsg) setLoginError(lockMsg);
      appendAuditLog({
        id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        action: 'LOGIN_FAILED',
        actorName: loginUsername || 'Unknown',
        entityType: 'AUTH',
        details: `Percobaan login gagal untuk username ${loginUsername || '-'}.`,
        createdAt: new Date().toISOString(),
      });
      return;
    }

    // Bug #19 fix: Handle overnight schedule (e.g., 22:00 - 06:00)
    if (user.schedule && user.schedule.enabled) {
      const now = new Date();
      const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();

      const [startH, startM] = user.schedule.startTime.split(':').map(Number);
      const [endH, endM] = user.schedule.endTime.split(':').map(Number);
      const startTotal = startH * 60 + startM;
      const endTotal = endH * 60 + endM;

      let isAllowed: boolean;
      if (endTotal >= startTotal) {
        // Normal schedule (e.g., 08:00 - 17:00)
        isAllowed = currentTimeInMinutes >= startTotal && currentTimeInMinutes <= endTotal;
      } else {
        // Overnight schedule (e.g., 22:00 - 06:00)
        isAllowed = currentTimeInMinutes >= startTotal || currentTimeInMinutes <= endTotal;
      }

      if (!isAllowed) {
        setLoginError(`AKSES DITOLAK: Jam kerja Anda adalah ${user.schedule.startTime} s/d ${user.schedule.endTime}.`);
        return;
      }
    }

    // Bug #6 fix: Upgrade legacy SHA-256 to PBKDF2 (detect by format, not value comparison)
    let upgradedPasswordHash = user.passwordHash;
    const isLegacyFormat = storedPassword.length === 64 && !storedPassword.includes(':');
    if (isLegacyFormat) {
      upgradedPasswordHash = await hashPassword(loginPassword);
    }

    const updatedUser = { ...user, passwordHash: upgradedPasswordHash, lastLoginAt: new Date().toISOString() };
    setUsers(prev => prev.map(item => item.id === updatedUser.id ? updatedUser : item));
    setCurrentUser(updatedUser);
    saveSessionLocal(sanitizeUserSession(updatedUser));
    resetLoginAttempts(); // Bug #5: reset on success
    appendAuditLog({
      id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
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
    const snapshot = buildDataSnapshot();
    // Bug #20 fix: Strip sensitive credentials from backup
    const { openRouterApiKey, supabaseUrl, supabaseAnonKey, supabaseBucket, ...safeData } = snapshot;
    const blob = new Blob([JSON.stringify(safeData, null, 2)], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `poshulio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href); // Bug #11 fix: revoke object URL
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
  ): Promise<AppData> => {
    const localSnapshot = buildDataSnapshot();
    
    // Prefer a locked cloud mutation; fall back to durable local storage when offline.
    let cloudMutationError: unknown;

    if (hasCloudConfig()) {
      setIsSyncing(true);
      let mutationError: unknown;
      try {
        let nextCloud: AppData | null = null;
        await withCloudInventoryLock(async () => {
          const remote = await pullFromCloud();
          const latest = remote ? mergeAppData(localSnapshot, remote) as AppData : localSnapshot;
          try {
            nextCloud = mutator(latest);
          } catch (error) {
            mutationError = error;
            throw error;
          }
          await pushToCloud(nextCloud);
        });
        if (!nextCloud) throw new Error('Mutasi cloud tidak menghasilkan data.');
        applyData(nextCloud);
        saveAppDataLocal(nextCloud);
        void saveAppDataIndexedDB(nextCloud);
        setSyncError(false);
        setLastSyncTime(new Date().toLocaleTimeString());
        lastPushTime.current = Date.now();
        return nextCloud;
      } catch (error: any) {
        if (mutationError) throw mutationError;
        setSyncError(true);
        cloudMutationError = error;
        console.warn('[Sync] Cloud gagal; menggunakan penyimpanan lokal:', error?.message);
      } finally {
        setIsSyncing(false);
      }
    }
    const nextLocal = mutator(localSnapshot);
    applyData(nextLocal);
    saveAppDataLocal(nextLocal);
    void saveAppDataIndexedDB(nextLocal);
    if (cloudMutationError) console.warn('[Sync] Transaksi disimpan lokal setelah cloud gagal.');
    return nextLocal;
  }, [applyData, buildDataSnapshot]);

  // HANDLERS WITH FUNCTIONAL UPDATES (PREV STATE SAFETY)
  const addItem = (item: Item) => {
    if (!hasPermission(currentUser, 'item.create')) return alert('Anda tidak memiliki izin menambah barang.');
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
    if (!hasPermission(currentUser, 'item.create')) return alert('Anda tidak memiliki izin menambah barang.');
    try {
      newItems.forEach(item => validateUniqueItem([...items, ...newItems.filter(candidate => candidate.id !== item.id)], item));
      setItems(prev => [...prev, ...newItems]);
    } catch (error: any) {
      alert(error.message);
    }
  };
  const updateItem = (updated: Item) => {
    if (!hasPermission(currentUser, 'item.edit')) return alert('Anda tidak memiliki izin mengubah barang.');
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
    if (!hasPermission(currentUser, 'item.edit')) return alert('Anda tidak memiliki izin mengubah barang.');
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
    if (!hasPermission(currentUser, 'item.delete')) return alert('Anda tidak memiliki izin menghapus barang.');
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

  const addCustomer = (c: Customer) => hasPermission(currentUser, 'contact.create') ? setCustomers(prev => [...prev, c]) : alert('Anda tidak memiliki izin menambah kontak.');
  const updateCustomer = (updated: Customer) => hasPermission(currentUser, 'contact.edit') ? setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c)) : alert('Anda tidak memiliki izin mengubah kontak.');
  const deleteCustomer = (id: string) => hasPermission(currentUser, 'contact.delete') ? setCustomers(prev => prev.filter(c => c.id !== id)) : alert('Anda tidak memiliki izin menghapus kontak.');

  const addSupplier = (s: Supplier) => hasPermission(currentUser, 'contact.create') ? setSuppliers(prev => [...prev, s]) : alert('Anda tidak memiliki izin menambah kontak.');
  const updateSupplier = (updated: Supplier) => hasPermission(currentUser, 'contact.edit') ? setSuppliers(prev => prev.map(s => s.id === updated.id ? updated : s)) : alert('Anda tidak memiliki izin mengubah kontak.');
  const deleteSupplier = (id: string) => hasPermission(currentUser, 'contact.delete') ? setSuppliers(prev => prev.filter(s => s.id !== id)) : alert('Anda tidak memiliki izin menghapus kontak.');

  const addUser = async (draft: UserDraft) => {
    if (!hasPermission(currentUser, 'user.manage')) return alert('Anda tidak memiliki izin mengelola user.');
    if (users.some(user => user.username.toLowerCase() === draft.username.trim().toLowerCase())) {
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
    if (!hasPermission(currentUser, 'user.manage')) return alert('Anda tidak memiliki izin mengelola user.');
    const existing = users.find(user => user.id === draft.id);
    if (!existing) return;
    if (users.some(user => user.id !== draft.id && user.username.toLowerCase() === draft.username.trim().toLowerCase())) return alert('Username sudah digunakan.');
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
    if (!hasPermission(currentUser, 'user.manage')) return alert('Anda tidak memiliki izin mengelola user.');
    if (id === currentUser?.id) return;
    const target = users.find(user => user.id === id);
    const activeManagers = users.filter(user => user.isActive && (user.role === 'OWNER' || user.role === 'MANAGER'));
    if (target?.isActive && (target.role === 'OWNER' || target.role === 'MANAGER') && activeManagers.length <= 1) return alert('Minimal satu Owner atau Manager aktif harus tersedia.');
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
    if (!currentUser || !hasPermission(currentUser, 'sale.create')) return;
    const existing = getOpenCashSession(currentUser.id);
    if (existing) {
      alert('Masih ada shift kasir yang terbuka.');
      return;
    }

    const session: CashSession = {
      id: createId('CS'),
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
    const cashRefunds = returns
      .filter(ret => ret.status === 'APPROVED' && (ret.createdAt || '') >= openSession.openedAt)
      .reduce((sum, ret) => {
        const origin = sales.find(sale => sale.invoiceNo === ret.originalInvoiceNo);
        return sum + (origin?.cashSessionId === openSession.id && origin.paymentType === 'TUNAI' ? ret.totalReturn : 0);
      }, 0);
    const sessionExpenses = cashExpenses
      .filter(expense => expense.cashSessionId === openSession.id)
      .reduce((sum, expense) => sum + expense.amount, 0);
    const expectedCash = openSession.openingCash + sessionSales.filter(sale => sale.paymentType === 'TUNAI').reduce((sum, sale) => sum + sale.total, 0) - cashRefunds - sessionExpenses;
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
      cashRefunds,
      cashExpenses: sessionExpenses,
      shortageOrOverage,
      closingNotes,
      status: 'CLOSED',
    } : session));
  };

  const addCashExpense = async (expense: CashExpense): Promise<void> => {
    if (!currentUser || !hasPermission(currentUser, 'accounting.view')) throw new Error('Anda tidak memiliki izin mencatat pengeluaran.');
    if (expense.amount <= 0 || !expense.description.trim()) throw new Error('Keterangan dan nominal pengeluaran wajib diisi.');
    await runInventorySafeMutation(snapshot => {
      const openSession = snapshot.cashSessions.find(session => session.userId === currentUser.id && session.status === 'OPEN');
      const prepared = { ...expense, operatorId: currentUser.id, operatorName: currentUser.name, cashSessionId: openSession?.id };
      return {
        ...snapshot,
        cashExpenses: [prepared, ...snapshot.cashExpenses],
        accounts: postCashExpenseAccounts(snapshot.accounts, prepared.amount),
      };
    });
  };

  const deleteCashExpense = async (id: string): Promise<void> => {
    if (!currentUser || !hasPermission(currentUser, 'accounting.view')) throw new Error('Anda tidak memiliki izin menghapus pengeluaran.');
    await runInventorySafeMutation(snapshot => {
      const target = snapshot.cashExpenses.find(expense => expense.id === id);
      if (!target) throw new Error('Pengeluaran tidak ditemukan.');
      if (target.cashSessionId && snapshot.cashSessions.some(session => session.id === target.cashSessionId && session.status === 'CLOSED')) {
        throw new Error('Pengeluaran dari shift yang sudah ditutup tidak dapat dihapus.');
      }
      return {
        ...snapshot,
        cashExpenses: snapshot.cashExpenses.filter(expense => expense.id !== id),
        accounts: reverseCashExpenseAccounts(snapshot.accounts, target.amount),
      };
    });
  };

  const addSale = async (sale: Sale): Promise<Sale> => {
    if (!currentUser || !hasPermission(currentUser, 'sale.create')) throw new Error('Anda tidak memiliki izin membuat penjualan.');
    const next = await runInventorySafeMutation((snapshot) => {
      if (snapshot.sales.some(entry => entry.id === sale.id || entry.invoiceNo === sale.invoiceNo)) {
        throw new Error(`Faktur ${sale.invoiceNo} sudah tersimpan.`);
      }
      const customer = snapshot.customers.find(entry => entry.id === sale.customerId);
      if (sale.paymentType === 'KREDIT') {
        if (!customer || customer.creditLimit <= 0) throw new Error('Pilih pelanggan yang memiliki limit kredit.');
        if (customer.currentDebt + sale.total > customer.creditLimit) throw new Error('Transaksi melebihi limit kredit pelanggan.');
      }
      const openSession = snapshot.cashSessions.find(session => session.userId === currentUser.id && session.status === 'OPEN') || null;
      const preparedSale: Sale = {
        ...sale,
        items: sale.items.map(line => ({
          ...line,
          costPrice: snapshot.items.find(item => item.id === line.itemId)?.basePrice ?? line.costPrice ?? 0,
        })),
        createdAt: new Date().toISOString(),
        status: 'COMPLETED',
        operatorId: currentUser.id,
        cashSessionId: openSession?.id,
      };
      const result = completeSale(snapshot.items, preparedSale, currentUser, snapshot.customers);
      let nextCustomers = snapshot.customers;
      if (preparedSale.paymentType === 'KREDIT') {
        nextCustomers = nextCustomers.map(entry => entry.id === preparedSale.customerId ? { ...entry, currentDebt: entry.currentDebt + preparedSale.total } : entry);
      }
      if (result.updatedCustomer) {
        nextCustomers = nextCustomers.map(entry => entry.id === result.updatedCustomer!.id ? { ...entry, rewardPoints: result.updatedCustomer!.rewardPoints } : entry);
      }
      return {
        ...snapshot,
        sales: [preparedSale, ...snapshot.sales],
        items: result.items,
        customers: nextCustomers,
        accounts: postSaleAccounts(snapshot.accounts, preparedSale),
        inventoryMovements: [...result.movements, ...snapshot.inventoryMovements],
        paymentRecords: [result.payment, ...snapshot.paymentRecords],
        auditLogs: [result.audit, ...snapshot.auditLogs].slice(0, 500),
      };
    });
    const saved = next.sales.find(entry => entry.id === sale.id);
    if (!saved) throw new Error('Penjualan gagal disimpan.');
    return saved;
  };

  const addReturn = async (ret: SaleReturn): Promise<SaleReturn> => {
    if (!currentUser || !hasPermission(currentUser, 'return.create')) throw new Error('Anda tidak memiliki izin membuat retur.');
    const canApproveReturn = hasPermission(currentUser, 'return.approve');
    const preparedReturn: SaleReturn = {
      ...ret,
      createdAt: new Date().toISOString(),
      operatorId: currentUser.id,
      status: canApproveReturn ? 'APPROVED' : 'PENDING',
    };
    const next = await runInventorySafeMutation((snapshot) => {
      if (snapshot.returns.some(entry => entry.id === ret.id || entry.returnNo === ret.returnNo)) {
        throw new Error(`Retur ${ret.returnNo} sudah tersimpan.`);
      }
      if (!canApproveReturn) {
        const audit: AuditLog = {
          id: createId('AUD'),
          action: 'RETURN_COMPLETED',
          actorId: currentUser.id,
          actorName: currentUser.name,
          entityType: 'RETURN',
          entityId: preparedReturn.id,
          entityLabel: preparedReturn.returnNo,
          details: `Retur ${preparedReturn.returnNo} dibuat dan menunggu approval.`,
          createdAt: new Date().toISOString(),
        };
        return { ...snapshot, returns: [preparedReturn, ...snapshot.returns], auditLogs: [audit, ...snapshot.auditLogs].slice(0, 500) };
      }
      const approvedReturns = snapshot.returns.filter(entry => entry.status === 'APPROVED');
      const result = completeReturn(snapshot.items, snapshot.sales, approvedReturns, preparedReturn, currentUser);
      const originSale = snapshot.sales.find(sale => sale.invoiceNo === preparedReturn.originalInvoiceNo)!;
      const nextCustomers = originSale.paymentType === 'KREDIT'
        ? snapshot.customers.map(customer => customer.id === originSale.customerId
          ? { ...customer, currentDebt: Math.max(0, customer.currentDebt - preparedReturn.totalReturn) }
          : customer)
        : snapshot.customers;
      return {
        ...snapshot,
        returns: [preparedReturn, ...snapshot.returns],
        items: result.items,
        customers: nextCustomers,
        accounts: postReturnAccounts(snapshot.accounts, originSale, preparedReturn.totalReturn),
        inventoryMovements: [...result.movements, ...snapshot.inventoryMovements],
        paymentRecords: [result.payment, ...snapshot.paymentRecords],
        auditLogs: [result.audit, ...snapshot.auditLogs].slice(0, 500),
      };
    });
    return next.returns.find(entry => entry.id === ret.id) || preparedReturn;
  };

  const approveReturn = async (returnId: string): Promise<void> => {
    if (!currentUser || !hasPermission(currentUser, 'return.approve')) throw new Error('Anda tidak memiliki izin approve retur.');
        await runInventorySafeMutation((snapshot) => {
          const targetReturn = snapshot.returns.find(entry => entry.id === returnId);
          if (!targetReturn || targetReturn.status === 'APPROVED') return snapshot;
          const approvedReturns = snapshot.returns.filter(entry => entry.status === 'APPROVED');
          const result = completeReturn(snapshot.items, snapshot.sales, approvedReturns, { ...targetReturn, status: 'APPROVED' }, currentUser);
          const originSale = snapshot.sales.find(sale => sale.invoiceNo === targetReturn.originalInvoiceNo)!;
          return {
            ...snapshot,
            returns: snapshot.returns.map(entry => entry.id === returnId ? { ...entry, status: 'APPROVED' } : entry),
            items: result.items,
            customers: originSale.paymentType === 'KREDIT'
              ? snapshot.customers.map(customer => customer.id === originSale.customerId ? { ...customer, currentDebt: Math.max(0, customer.currentDebt - targetReturn.totalReturn) } : customer)
              : snapshot.customers,
            accounts: postReturnAccounts(snapshot.accounts, originSale, targetReturn.totalReturn),
            inventoryMovements: [...result.movements, ...snapshot.inventoryMovements],
            paymentRecords: [result.payment, ...snapshot.paymentRecords],
            auditLogs: [result.audit, ...snapshot.auditLogs].slice(0, 500),
          };
        });
  };

  const addPurchaseOrder = async (po: PurchaseOrder): Promise<void> => {
    if (!currentUser || !hasPermission(currentUser, 'purchase.create')) throw new Error('Anda tidak memiliki izin membuat PO.');
    await runInventorySafeMutation(snapshot => {
      if (snapshot.purchaseOrders.some(entry => entry.id === po.id)) throw new Error(`PO ${po.id} sudah tersimpan.`);
      if (po.total <= 0 || po.items.length === 0 || po.items.some(line => line.orderedQty <= 0 || line.cost < 0)) throw new Error('Data item PO tidak valid.');
      return {
        ...snapshot,
        purchaseOrders: [po, ...snapshot.purchaseOrders],
        accounts: postPurchaseOrderAccounts(snapshot.accounts, po.total),
        auditLogs: [{
        id: createId('AUD'),
        action: 'PO_CREATED',
        actorId: currentUser.id,
        actorName: currentUser.name,
        entityType: 'PURCHASE_ORDER',
        entityId: po.id,
        entityLabel: po.id,
        details: `PO ${po.id} dibuat untuk supplier ${po.supplierName}.`,
        createdAt: new Date().toISOString(),
        } as AuditLog, ...snapshot.auditLogs].slice(0, 500),
      };
    });
  };
  const payPurchaseOrder = async (poId: string, amount?: number, note?: string, method?: string): Promise<void> => {
    if (!currentUser || !hasPermission(currentUser, 'purchase.pay')) throw new Error('Anda tidak memiliki izin membayar PO.');
    await runInventorySafeMutation(snapshot => {
      const po = snapshot.purchaseOrders.find(item => item.id === poId);
      if (!po) throw new Error('PO tidak ditemukan.');
      const payableAmount = Math.max(0, po.total - (po.paidAmount || 0));
      const paymentAmount = amount && amount > 0 ? Math.min(amount, payableAmount) : payableAmount;
      if (paymentAmount <= 0) throw new Error('PO sudah lunas atau nominal tidak valid.');
      const payment: PaymentRecord = {
        id: createId('PAY'),
        referenceNo: po.id,
        referenceType: 'PURCHASE_ORDER',
        amount: paymentAmount,
        method: method || 'PAYABLE_SETTLEMENT',
        direction: 'OUT',
        createdAt: new Date().toISOString(),
        operatorName: currentUser.name,
        operatorId: currentUser.id,
      };
      const audit: AuditLog = {
        id: createId('AUD'),
        action: 'PO_PAID',
        actorId: currentUser.id,
        actorName: currentUser.name,
        entityType: 'PURCHASE_ORDER',
        entityId: po.id,
        entityLabel: po.id,
        details: `Pembayaran PO ${po.id} sebesar Rp ${paymentAmount.toLocaleString()} berhasil dicatat.`,
        createdAt: new Date().toISOString(),
      };
      return {
        ...snapshot,
        purchaseOrders: snapshot.purchaseOrders.map(item => item.id === poId ? {
          ...item,
          paidAmount: (item.paidAmount || 0) + paymentAmount,
          isPaid: ((item.paidAmount || 0) + paymentAmount) >= item.total,
          paymentNotes: note ? [...(item.paymentNotes || []), note] : item.paymentNotes,
        } : item),
        accounts: postPurchasePaymentAccounts(snapshot.accounts, paymentAmount, method),
        paymentRecords: [payment, ...snapshot.paymentRecords],
        auditLogs: [audit, ...snapshot.auditLogs].slice(0, 500),
      };
    });
  };
  const receivePurchaseOrder = async (poId: string, updatedItems: { itemId: string, receivedQty: number }[]): Promise<void> => {
    if (!currentUser || !hasPermission(currentUser, 'purchase.receive')) throw new Error('Anda tidak memiliki izin menerima PO.');
        await runInventorySafeMutation((snapshot) => {
          const po = snapshot.purchaseOrders.find(item => item.id === poId);
          if (!po) throw new Error('PO tidak ditemukan.');
          const result = receivePurchaseOrderStock(snapshot.items, po, updatedItems, currentUser);
          if (result.movements.length === 0) throw new Error('Masukkan minimal satu qty penerimaan.');
          const nextLines = po.items.map(line => {
            const update = updatedItems.find(entry => entry.itemId === line.itemId);
            return update ? { ...line, receivedQty: line.receivedQty + update.receivedQty } : line;
          });
          return {
            ...snapshot,
            purchaseOrders: snapshot.purchaseOrders.map(item => item.id === poId ? {
              ...item,
              status: nextLines.every(line => line.receivedQty >= line.orderedQty) ? 'RECEIVED' : 'PENDING',
              items: nextLines,
            } : item),
            items: result.items,
            inventoryMovements: [...result.movements, ...snapshot.inventoryMovements],
            auditLogs: [result.audit, ...snapshot.auditLogs].slice(0, 500),
          };
        });
  };

  const handleStockAdjustment = (log: any) => {
    if (!currentUser || !hasPermission(currentUser, 'stock.adjust')) return alert('Anda tidak memiliki izin menyesuaikan stok.');
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
    if (!currentUser || !hasPermission(currentUser, 'stock.adjust')) return alert('Anda tidak memiliki izin menyesuaikan stok.');
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

              {/* Hint — only show if default password hasn't been changed */}
              {users.some(u => u.passwordHash === 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3') && (
              <div className="mt-6 flex items-center gap-3 p-3 bg-gradient-to-r from-slate-50 to-indigo-50/30 rounded-xl">
                <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                  <Key size={14} className="text-indigo-600" />
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Default login: <span className="font-semibold text-slate-700">admin</span> / <span className="font-semibold text-slate-700">123</span>
                </p>
              </div>
              )}
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
      case 'master-items': return <MasterData type="items" items={items} onAddItem={addItem} onAddItemsBulk={addItemsBulk} onUpdateItem={updateItem} onUpdateItemsBulk={updateItemsBulk} onDeleteItem={deleteItem} onManualPush={handleManualPush} onRefresh={() => handleManualRefresh(true)} isSyncing={isSyncing} canCreate={hasPermission(currentUser, 'item.create')} canEdit={hasPermission(currentUser, 'item.edit')} canDelete={hasPermission(currentUser, 'item.delete')} />;
      case 'master-contacts': return <MasterData type="contacts" customers={customers} suppliers={suppliers} onAddCustomer={addCustomer} onUpdateCustomer={updateCustomer} onAddSupplier={addSupplier} onUpdateSupplier={updateSupplier} onDeleteCustomer={deleteCustomer} onDeleteSupplier={deleteSupplier} canCreate={hasPermission(currentUser, 'contact.create')} canEdit={hasPermission(currentUser, 'contact.edit')} canDelete={hasPermission(currentUser, 'contact.delete')} />;
      case 'pos': return <SalesPOS currentUser={currentUser} items={items} customers={customers} promotions={promotions} onCompleteSale={addSale} />;
      case 'sales-list': return <SalesList sales={sales} onInitiateReturn={(invNo) => { setPreselectedReturnInvoice(invNo); setActiveTab('returns'); }} />;
      case 'returns': return <Returns sales={sales} returns={returns} onCompleteReturn={addReturn} onApproveReturn={approveReturn} currentUser={currentUser} preselectedInvoiceNo={preselectedReturnInvoice} />;
      case 'purchasing': return <Purchasing purchaseOrders={purchaseOrders} suppliers={suppliers} items={items} onAddPO={addPurchaseOrder} onReceivePO={receivePurchaseOrder} onPayPO={payPurchaseOrder} currentUser={currentUser} />;
      case 'stock-opname': return <Inventory items={items} logs={inventoryLogs} movements={inventoryMovements} onAdjustStock={handleStockAdjustment} onAdjustStockBulk={handleStockAdjustmentBulk} canAdjust={hasPermission(currentUser, 'stock.adjust')} />;
      case 'accounting': return <Accounting accounts={accounts} sales={sales} cashSessions={cashSessions} cashExpenses={cashExpenses} currentUser={currentUser} onAddCashExpense={addCashExpense} onDeleteCashExpense={deleteCashExpense} />;
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
      case 'user-management': return <UserManagement users={users} onAddUser={addUser} onUpdateUser={updateUser} onDeleteUser={deleteUser} canManage={hasPermission(currentUser, 'user.manage')} />;
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
