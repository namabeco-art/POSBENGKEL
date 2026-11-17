import React, { Suspense, lazy, useState, useEffect, useCallback, useMemo } from 'react';
import Layout from './components/Layout';
import { AIPriceUpdateDraft, AIUndoEntry, AppData, AppSettings, AuditLog, Branch, CashExpense, CashSession, Customer, HeldCart, InventoryLog, InventoryMovement, Item, JournalLine, MediaAsset, Mechanic, PaymentRecord, PriceChangeSource, PromotionCampaign, PurchaseOrder, PurchaseReturn, Sale, SaleReturn, ServiceOrder, StockTransfer, StoreProfile, Supplier, User, UserRole, Account, Warehouse } from './types';
import { mockUsers, mockItems, mockCustomers, mockSuppliers, mockAccounts, mockBranches, mockPromotions } from './store';
import { ShieldCheck, User as UserIcon, Key, Clock, AlertCircle, Info, CloudLightning, RefreshCw, Loader2, Link2, CheckCircle2, X, Plus, Store, ChevronRight, Globe, Lock, Trash2, Settings2, Database, HardDrive, Server, QrCode, Terminal, Activity, ChevronDown, Search, Cloud, Monitor, MapPin, ShieldEllipsis } from 'lucide-react';
import { pullFromCloud, syncWithCloud, getCloudConfig, hasCloudConfig, applyActivationCode, saveCloudConfig, withCloudInventoryLock } from './services/syncService';
import { clearSessionLocal, loadAppDataLocal, loadSessionLocal, saveAppDataLocal, saveSessionLocal } from './services/storageService';
import { hashPassword, sanitizeUserSession, verifyPassword } from './services/authService';
import { canAccessTab, getAccessibleTabs, hasPermission } from './services/permissions';
import { getLoginLockoutRemaining, recordFailedLogin, resetLoginAttempts } from './services/rateLimiter';
import { adjustStock, completeReturn, completeSale, receivePurchaseOrderStock, validateUniqueItem, voidSaleStock, type CostChange } from './services/posOperations';
import { getCloudProfileLabel, getCloudProfileRegion, getCloudProfiles } from './services/cloudProfiles';
import { useAppStore } from './appStore';
import { mergeAppData } from './services/mergeService';
import { loadAppDataIndexedDB, saveAppDataIndexedDB } from './services/indexedDbService';
import { createDocumentNo, createId } from './services/idService';
import { postPurchasePaymentAccounts, reverseCashExpenseAccounts, reversePurchaseOrderAccounts } from './services/accountingService';
import { buildPriceChangeLogs, getItemCost, PRICE_HISTORY_LIMIT, syncUnitPrices } from './services/pricing';
import { stampAppData } from './services/syncMeta';
import { AUDIT_LOG_LIMIT } from './services/mergeService';
import ErrorBoundary from './components/ErrorBoundary';
import CloudConnectPanel from './components/CloudConnectPanel';
import { isCloudAuthError, onCloudSessionChange } from './services/cloudAuth';
import { applyBalanceChanges, BalanceChange } from './services/customerLedger';
import { allocateReturnRefund, getSaleBankAmount, getSaleCashAmount, getSaleCreditAmount, getSaleDepositAmount, getSalePayments, summarizePaymentType } from './services/salePayments';
import { buildJournals, computeAccountBalances, ensureLedgerAccounts, getReturnRefund, LEDGER_VERSION } from './services/ledger';
import { assertPeriodOpen, createPurchaseReturn, getPurchaseOrderOutstanding, importOpeningReceivables, payCommission, postManualJournal, receiveServiceOrderDp, refundDeposit, saveServiceOrder, topupDeposit, transferStockOp } from './services/fullOps';
import { getAutoBackupConfig, isBackupDue, runBackup } from './services/autoBackup';
import { DEFAULT_WAREHOUSE_ID } from './services/warehouses';

/** Perangkat yang belum punya transaksi apa pun (data bawaan/contoh saja). */
const hasLocalTransactions = (data: Partial<AppData>) => Boolean(
  data.sales?.length || data.inventoryMovements?.length || data.purchaseOrders?.length || data.cashSessions?.length
  || data.returns?.length || data.paymentRecords?.length || data.cashExpenses?.length
  || data.customerLedger?.length || data.serviceOrders?.length || data.purchaseReturns?.length || data.manualJournals?.length,
);

/** Workspace (Store ID) pemilik data lokal di perangkat ini. */
const DATA_WORKSPACE_KEY = 'POS_DATA_WORKSPACE';
/** Jeda setelah perubahan terakhir sebelum dikirim ke cloud. */
const PUSH_DEBOUNCE_MS = 4000;
/** Jarak minimum antar push ke cloud. */
const PUSH_MIN_INTERVAL_MS = 5000;
/** Jeda percobaan ulang jika push gagal (offline / server sibuk). */
const PUSH_RETRY_MS = 15000;

/** Field barang yang boleh diubah lewat edit master — stok hanya berubah lewat transaksi/opname. */
const toItemPatch = (item: Partial<Item>): Partial<Item> => {
  const { stock: _stock, updatedAt: _updatedAt, fieldUpdatedAt: _fieldUpdatedAt, ...patch } = item as Item;
  return patch;
};

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
const ServiceOrders = lazy(() => import('./pages/ServiceOrders'));
const Deposits = lazy(() => import('./pages/Deposits'));
const Mechanics = lazy(() => import('./pages/Mechanics'));
const Warehouses = lazy(() => import('./pages/Warehouses'));
const PurchaseReturns = lazy(() => import('./pages/PurchaseReturns'));
const Promotions = lazy(() => import('./pages/Promotions'));
const Ledger = lazy(() => import('./pages/Ledger'));
const AdvancedReports = lazy(() => import('./pages/AdvancedReports'));

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
  /** Cloud menolak perangkat ini (RLS) — perangkat perlu login cloud toko. */
  const [cloudAuthRequired, setCloudAuthRequired] = useState(false);
  
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
    priceHistory, appendPriceHistory, recordDeletion, storeProfile, setStoreProfile,
    appSettings, setAppSettings, customerLedger, manualJournals, mechanics, setMechanics, commissionPayments,
    heldCarts, setHeldCarts, serviceOrders, setServiceOrders, warehouses, setWarehouses, stockTransfers, purchaseReturns,
    applyData, appendAuditLog
  } = appStore;
  /** Mode aplikasi toko: SIMPLE (default, tampilan seperti biasa) atau LENGKAP (fitur ala ERP). */
  const appMode = appSettings?.mode === 'LENGKAP' ? 'LENGKAP' : 'SIMPLE';
  const isFullMode = appMode === 'LENGKAP';

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
      priceHistory: state.priceHistory,
      deletedRecords: state.deletedRecords,
      storeProfile: state.storeProfile,
      appSettings: state.appSettings,
      customerLedger: state.customerLedger,
      manualJournals: state.manualJournals,
      mechanics: state.mechanics,
      commissionPayments: state.commissionPayments,
      heldCarts: state.heldCarts,
      serviceOrders: state.serviceOrders,
      warehouses: state.warehouses,
      stockTransfers: state.stockTransfers,
      purchaseReturns: state.purchaseReturns,
      // Kredensial (API key AI, dsb.) sengaja TIDAK ikut tersimpan ke data cloud/backup.
    };
  }, []);

  // Flag to prevent push/pull infinite loop
  const isApplyingFromCloud = React.useRef(false);
  const lastPushTime = React.useRef(0);
  const pushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushInFlight = React.useRef(false);

  /**
   * Terapkan data hasil merge dari cloud. Flag hanya aktif selama applyData berjalan
   * (subscriber zustand dipanggil sinkron), sehingga perubahan lokal sesudahnya tetap tersimpan & terkirim.
   */
  const applyRemoteData = useCallback((data: AppData) => {
    isApplyingFromCloud.current = true;
    try {
      applyData(data);
    } finally {
      isApplyingFromCloud.current = false;
    }
    saveAppDataLocal(data);
    void saveAppDataIndexedDB(data);
  }, [applyData]);

  /**
   * Gabungkan data lokal dengan data cloud. Jika data di perangkat ini milik workspace/toko lain
   * (Workspace ID diganti di Pengaturan), data cloud dipakai apa adanya agar data dua toko tidak tercampur.
   */
  const mergeWithRemote = useCallback((local: AppData, remote: Partial<AppData>): AppData => {
    const storeId = getCloudConfig().storeId || '';
    const dataWorkspace = localStorage.getItem(DATA_WORKSPACE_KEY);
    if (storeId) localStorage.setItem(DATA_WORKSPACE_KEY, storeId);
    if (dataWorkspace && storeId && dataWorkspace !== storeId) {
      console.warn(`[Sync] Workspace berganti dari ${dataWorkspace} ke ${storeId}; data lokal diganti data cloud.`);
      return { ...local, ...remote } as AppData;
    }
    // Perangkat baru yang belum pernah sinkron & belum punya transaksi: pakai data toko dari cloud apa adanya.
    // Tanpa ini, data contoh bawaan (barang, pelanggan, user demo) ikut tercampur ke katalog toko.
    if (!dataWorkspace && !hasLocalTransactions(local)) return { ...local, ...remote } as AppData;
    return mergeAppData(local, remote) as AppData;
  }, []);

  /** Tandai data perangkat ini sudah menyatu dengan workspace cloud aktif (dipanggil setelah push berhasil). */
  const markWorkspaceSynced = useCallback(() => {
    const storeId = getCloudConfig().storeId;
    if (storeId) localStorage.setItem(DATA_WORKSPACE_KEY, storeId);
    setCloudAuthRequired(false);
  }, []);

  /** Catat bila cloud menolak karena perangkat belum login (RLS). */
  const noteCloudError = useCallback((error: unknown) => {
    if (isCloudAuthError(error)) setCloudAuthRequired(true);
  }, []);

  /** Ambil data cloud lalu gabungkan dengan data lokal terbaru. */
  const pullAndMerge = useCallback(async (): Promise<boolean> => {
    const cloudData = await pullFromCloud();
    // Kosong bisa berarti workspace baru ATAU bucket private menyembunyikan data dari perangkat yang belum login,
    // jadi workspace baru ditandai tersinkron hanya setelah push pertama berhasil.
    if (!cloudData || typeof cloudData !== 'object') return false;
    // Snapshot lokal diambil SETELAH request selesai agar perubahan selama menunggu jaringan tidak hilang.
    applyRemoteData(mergeWithRemote(buildDataSnapshot(), cloudData));
    return true;
  }, [applyRemoteData, buildDataSnapshot, mergeWithRemote]);

  const runCloudPushRef = React.useRef<() => Promise<void>>(async () => undefined);
  const schedulePush = useCallback((delayMs: number) => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => { void runCloudPushRef.current(); }, delayMs);
  }, []);

  /** Pull → merge → push, agar transaksi terminal lain yang belum diterima tidak tertimpa snapshot lama. */
  const runCloudPush = useCallback(async () => {
    if (!hasCloudConfig()) return;
    const wait = PUSH_MIN_INTERVAL_MS - (Date.now() - lastPushTime.current);
    if (wait > 0 || pushInFlight.current) {
      // Jangan membuang perubahan — jadwalkan ulang.
      schedulePush(Math.max(wait, 1000));
      return;
    }
    pushInFlight.current = true;
    lastPushTime.current = Date.now();
    try {
      // Tarik → gabung → simpan (compare-and-swap; diulang otomatis bila perangkat lain menyimpan bersamaan).
      const { remote, data: merged } = await syncWithCloud(remote => (remote ? mergeWithRemote(buildDataSnapshot(), remote) : buildDataSnapshot()));
      markWorkspaceSynced();
      if (remote) applyRemoteData(mergeAppData(buildDataSnapshot(), merged) as AppData);
      setLastSyncTime(new Date().toLocaleTimeString());
      setSyncError(false);
    } catch (error) {
      // Gagal sementara (offline/server sibuk): coba lagi nanti, data tetap aman di lokal.
      noteCloudError(error);
      schedulePush(isCloudAuthError(error) ? PUSH_RETRY_MS * 4 : PUSH_RETRY_MS);
    } finally {
      pushInFlight.current = false;
    }
  }, [applyRemoteData, buildDataSnapshot, markWorkspaceSynced, mergeWithRemote, noteCloudError, schedulePush]);
  runCloudPushRef.current = runCloudPush;

  const handleManualRefresh = useCallback(async (showFeedback = true) => {
    const config = getCloudConfig();
    if (!config.enabled) {
      if (showFeedback) alert("Fitur Cloud tidak aktif. Menggunakan database lokal.");
      return;
    }

    setIsSyncing(true);
    setSyncError(false);
    try {
      await pullAndMerge();
      setLastSyncTime(new Date().toLocaleTimeString());
      setSyncError(false);
      if (showFeedback) alert("Database berhasil diperbarui dari Cloud!");
    } catch (e) {
      setSyncError(true);
      noteCloudError(e);
      if (showFeedback) alert(isCloudAuthError(e) ? 'Cloud menolak perangkat ini. Hubungkan perangkat ke cloud toko di Pengaturan.' : "Gagal sinkronisasi Cloud. Periksa koneksi atau kredensial.");
    } finally {
      setIsSyncing(false);
    }
  }, [pullAndMerge]);

  const handleCloudConnected = useCallback(async () => {
    setCloudAuthRequired(false);
    await handleManualRefresh(false);
    schedulePush(500);
  }, [handleManualRefresh, schedulePush]);

  useEffect(() => onCloudSessionChange(session => {
    if (!session && hasCloudConfig()) setCloudAuthRequired(true);
  }), []);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    setLoginView('auth');
    clearSessionLocal();
  }, []);

  // AUTO-SAVE LOGIC (PERSISTENCE) + jadwal kirim ke cloud
  useEffect(() => {
    if (!isDataLoaded) return;

    const unsubscribe = useAppStore.subscribe(() => {
      if (isApplyingFromCloud.current) return;
      const snapshot = buildDataSnapshot();
      saveAppDataLocal(snapshot);
      void saveAppDataIndexedDB(snapshot);

      // Schedule a cloud push if cloud is active
      if (hasCloudConfig()) schedulePush(PUSH_DEBOUNCE_MS);
    });

    const initialSnapshot = buildDataSnapshot();
    saveAppDataLocal(initialSnapshot);
    void saveAppDataIndexedDB(initialSnapshot);
    return () => {
      unsubscribe();
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    };
  }, [buildDataSnapshot, isDataLoaded, schedulePush]);

  // AUTO-PULL FROM CLOUD (every 30 seconds) — uses merge, not overwrite
  useEffect(() => {
    if (!isDataLoaded || !hasCloudConfig()) return;

    const interval = setInterval(async () => {
      if (pushInFlight.current) return;
      try {
        if (await pullAndMerge()) {
          setLastSyncTime(new Date().toLocaleTimeString());
          setSyncError(false);
        }
      } catch {
        // Silent fail — don't set syncError for background pulls
        // Only manual sync should show error state
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isDataLoaded, pullAndMerge]);

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
            await pullAndMerge();
            setSyncError(false);
            setLastSyncTime(new Date().toLocaleTimeString());
          } catch {
            setSyncError(true);
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
    const defaultTab = getAccessibleTabs(updatedUser, appMode)[0] || 'dashboard';
    setActiveTab(defaultTab);
  };

  const handleManualPush = useCallback(async () => {
    if (!hasCloudConfig()) return;
    setIsSyncing(true);
    try {
      const config = getCloudConfig();
      // Gabungkan dulu dengan cloud agar transaksi terminal lain tidak tertimpa.
      const { remote, data: dataToSave } = await syncWithCloud(remote => (remote ? mergeWithRemote(buildDataSnapshot(), remote) : buildDataSnapshot()));
      markWorkspaceSynced();
      if (remote) applyRemoteData(mergeAppData(buildDataSnapshot(), dataToSave) as AppData);
      lastPushTime.current = Date.now();
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
      noteCloudError(e);
      alert(isCloudAuthError(e) ? 'Cloud menolak perangkat ini. Hubungkan perangkat ke cloud toko di Pengaturan.' : "Gagal mengirim sinkronisasi manual.");
    } finally {
      setIsSyncing(false);
    }
  }, [appendAuditLog, applyRemoteData, buildDataSnapshot, currentUser, markWorkspaceSynced, mergeWithRemote, noteCloudError]);

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
    const { openRouterApiKey: _key, supabaseUrl: _url, supabaseAnonKey: _anon, supabaseBucket: _bucket, ...safeData } = snapshot;
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
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items) || !Array.isArray(parsed.users)) {
      throw new Error('File bukan backup POS Hulio yang valid.');
    }
    applyData(parsed); // subscriber menyimpan ke localStorage + IndexedDB
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
      await syncWithCloud(remote => (remote ? { ...mergeWithRemote(buildDataSnapshot(), remote), users: useAppStore.getState().users } : dataToSave));
      setLastSyncTime(new Date().toLocaleTimeString());
      setSyncError(false);
      alert(`User default untuk workspace ${workspaceLabel} berhasil direset. Gunakan admin / 123.`);
    } catch (error) {
      setSyncError(true);
      alert('Reset user lokal berhasil, tetapi sinkronisasi ke cloud gagal. Periksa koneksi workspace lalu coba lagi.');
    } finally {
      setIsSyncing(false);
    }
  }, [buildDataSnapshot, mergeWithRemote, recoveryPhraseInput, recoveryWorkspaceInput]);

  const runInventorySafeMutation = useCallback(async (
    mutator: (snapshot: AppData) => AppData,
  ): Promise<AppData> => {
    // Setiap entitas yang berubah diberi cap waktu agar merge antar perangkat memilih versi terbaru.
    const mutate = (snapshot: AppData) => stampAppData(snapshot, mutator(snapshot));

    // Prefer a locked cloud mutation; fall back to durable local storage when offline.
    if (hasCloudConfig()) {
      setIsSyncing(true);
      let mutationError: unknown;
      try {
        let nextCloud: AppData | null = null;
        await withCloudInventoryLock(async () => {
          // Mutasi dihitung dari data cloud terbaru; bila versi cloud berubah saat menyimpan, dihitung ulang.
          const result = await syncWithCloud(remote => {
            const localSnapshot = buildDataSnapshot();
            const latest = remote ? mergeWithRemote(localSnapshot, remote) : localSnapshot;
            try {
              return mutate(latest);
            } catch (error) {
              mutationError = error;
              throw error;
            }
          });
          nextCloud = result.data;
        });
        if (!nextCloud) throw new Error('Mutasi cloud tidak menghasilkan data.');
        markWorkspaceSynced();
        // Gabungkan dengan perubahan lokal yang terjadi selama menunggu jaringan.
        const finalData = mergeAppData(buildDataSnapshot(), nextCloud) as AppData;
        applyRemoteData(finalData);
        setSyncError(false);
        setLastSyncTime(new Date().toLocaleTimeString());
        lastPushTime.current = Date.now();
        return finalData;
      } catch (error: any) {
        if (mutationError) throw mutationError;
        setSyncError(true);
        noteCloudError(error);
        console.warn('[Sync] Cloud gagal; menggunakan penyimpanan lokal:', error?.message);
      } finally {
        setIsSyncing(false);
      }
    }
    // Snapshot diambil ulang: percobaan cloud bisa memakan waktu dan data lokal mungkin sudah berubah.
    const nextLocal = mutate(buildDataSnapshot());
    applyData(nextLocal); // subscriber menyimpan ke lokal & menjadwalkan push saat online
    return nextLocal;
  }, [applyData, applyRemoteData, buildDataSnapshot, markWorkspaceSynced, mergeWithRemote, noteCloudError]);

  // HANDLERS WITH FUNCTIONAL UPDATES (PREV STATE SAFETY)
  const logPriceChanges = (before: Item[], after: Item[], source: PriceChangeSource, note?: string) => {
    if (!currentUser) return;
    const logs = buildPriceChangeLogs(before, after, { source, note, operatorName: currentUser.name, operatorId: currentUser.id });
    if (logs.length === 0) return;
    appendPriceHistory(logs);
    appendAuditLog({
      id: createId('AUD'),
      action: 'PRICE_CHANGED',
      actorId: currentUser.id,
      actorName: currentUser.name,
      entityType: 'ITEM',
      entityId: logs.length === 1 ? logs[0].itemId : undefined,
      entityLabel: logs.length === 1 ? logs[0].itemName : `${logs.length} barang`,
      details: `Harga ${logs.length} barang diubah (${source})${note ? `: ${note}` : ''}.`,
      createdAt: new Date().toISOString(),
    });
  };

  const addItem = (item: Item) => {
    if (!hasPermission(currentUser, 'item.create')) return alert('Anda tidak memiliki izin menambah barang.');
    try {
      validateUniqueItem(useAppStore.getState().items, item);
      setItems(prev => [...prev, item]);
      if (currentUser) {
        appendAuditLog({
          id: createId('AUD'),
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

  /**
   * Import master barang dari CSV: kode yang sudah ada DIPERBARUI (nama, kategori, merk, barcode, harga),
   * kode baru DITAMBAHKAN. Stok barang lama tidak disentuh — gunakan Stok Opname.
   */
  const importItems = (rows: Item[]): { added: number; updated: number; errors: string[] } => {
    const canCreate = hasPermission(currentUser, 'item.create');
    const canEdit = hasPermission(currentUser, 'item.edit');
    const errors: string[] = [];
    if (!canCreate && !canEdit) return { added: 0, updated: 0, errors: ['Anda tidak memiliki izin mengimpor barang.'] };

    const before = useAppStore.getState().items;
    let working = [...before];
    const addedIds = new Set<string>();
    const updatedIds = new Set<string>();

    rows.forEach((row, index) => {
      const line = index + 2; // +1 header, +1 nomor baris manusia
      const existing = working.find(item => item.code.toLowerCase() === row.code.toLowerCase());
      if (existing) {
        if (!canEdit) { errors.push(`Baris ${line}: ${row.code} sudah ada (butuh izin edit barang).`); return; }
        const next: Item = {
          ...existing,
          name: row.name || existing.name,
          category: row.category || existing.category,
          brand: row.brand ?? existing.brand,
          barcode: row.barcode || existing.barcode,
          imageUrl: row.imageUrl || existing.imageUrl,
          basePrice: row.basePrice > 0 ? row.basePrice : existing.basePrice,
          memberPrices: row.memberPrices.map((price, level) => (price > 0 ? price : existing.memberPrices[level] || 0)),
          itemType: row.itemType ?? existing.itemType,
          reorderLevel: row.reorderLevel ?? existing.reorderLevel,
          trackSerial: row.trackSerial ?? existing.trackSerial,
        };
        next.units = syncUnitPrices(existing.units, existing.memberPrices[0] || 0, next.memberPrices[0] || 0);
        // Satuan besar dari file (mis. migrasi iPos) menggantikan satuan besar lama.
        const importedExtras = (row.units || []).filter(unit => unit.conversion > 1);
        if (importedExtras.length > 0) next.units = [...(next.units || []).filter(unit => unit.conversion === 1), ...importedExtras];
        try { validateUniqueItem(working, next); } catch (error: any) { errors.push(`Baris ${line}: ${error.message}`); return; }
        working = working.map(item => (item.id === existing.id ? next : item));
        if (!addedIds.has(existing.id)) updatedIds.add(existing.id);
      } else {
        if (!canCreate) { errors.push(`Baris ${line}: ${row.code} belum ada (butuh izin tambah barang).`); return; }
        try { validateUniqueItem(working, row); } catch (error: any) { errors.push(`Baris ${line}: ${error.message}`); return; }
        working = [...working, row];
        addedIds.add(row.id);
      }
    });

    if (addedIds.size === 0 && updatedIds.size === 0) return { added: 0, updated: 0, errors };
    const workingMap = new Map(working.map(item => [item.id, item]));
    setItems(prev => [
      ...prev.map(item => (updatedIds.has(item.id) ? { ...item, ...toItemPatch(workingMap.get(item.id)!) } : item)),
      ...working.filter(item => addedIds.has(item.id)),
    ]);
    logPriceChanges(before.filter(item => updatedIds.has(item.id)), working.filter(item => updatedIds.has(item.id)), 'IMPORT', 'Import master barang');
    if (currentUser) {
      appendAuditLog({
        id: createId('AUD'),
        action: 'ITEM_UPDATED',
        actorId: currentUser.id,
        actorName: currentUser.name,
        entityType: 'ITEM',
        details: `Import master barang: ${addedIds.size} baru, ${updatedIds.size} diperbarui, ${errors.length} baris ditolak.`,
        createdAt: new Date().toISOString(),
      });
    }
    return { added: addedIds.size, updated: updatedIds.size, errors };
  };

  /** Edit master barang. Stok TIDAK ikut diubah dari form agar penjualan yang terjadi saat form terbuka tidak tertimpa. */
  const updateItem = (updated: Item) => {
    if (!hasPermission(currentUser, 'item.edit')) return alert('Anda tidak memiliki izin mengubah barang.');
    const current = useAppStore.getState().items;
    const existing = current.find(item => item.id === updated.id);
    if (!existing) return alert('Barang tidak ditemukan — mungkin sudah dihapus di perangkat lain.');
    const patch = toItemPatch(updated);
    const next = { ...existing, ...patch };
    try {
      validateUniqueItem(current, next);
    } catch (error: any) {
      return alert(error.message);
    }
    setItems(prev => prev.map(item => (item.id === updated.id ? { ...item, ...patch } : item)));
    logPriceChanges([existing], [next], 'MANUAL');
    if (currentUser) {
      appendAuditLog({
        id: createId('AUD'),
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
  };

  /** Update banyak barang sekaligus (harga massal, kategori/merk). Hanya field yang dikirim yang diubah; stok tidak disentuh. */
  const updateItemsBulk = (patches: Array<Partial<Item> & { id: string }>, source: PriceChangeSource = 'BULK', note?: string) => {
    if (!hasPermission(currentUser, 'item.edit')) return alert('Anda tidak memiliki izin mengubah barang.');
    if (patches.length === 0) return;
    const patchMap = new Map(patches.map(patch => [patch.id, toItemPatch(patch)]));
    const before = useAppStore.getState().items.filter(item => patchMap.has(item.id));
    setItems(prev => prev.map(item => {
      const patch = patchMap.get(item.id);
      return patch ? { ...item, ...patch } : item;
    }));
    const after = useAppStore.getState().items.filter(item => patchMap.has(item.id));
    logPriceChanges(before, after, source, note);
    if (currentUser) {
      appendAuditLog({
        id: createId('AUD'),
        action: 'ITEM_UPDATED',
        actorId: currentUser.id,
        actorName: currentUser.name,
        entityType: 'ITEM',
        details: `${patches.length} master barang diperbarui sekaligus (${source}).`,
        createdAt: new Date().toISOString(),
      });
    }
  };

  const deleteItem = (id: string) => {
    if (!hasPermission(currentUser, 'item.delete')) return alert('Anda tidak memiliki izin menghapus barang.');
    const target = useAppStore.getState().items.find(item => item.id === id);
    if (target && currentUser) {
      appendAuditLog({
        id: createId('AUD'),
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
    recordDeletion('items', [id]);
  };

  const applyAIPriceUpdates = (updates: AIPriceUpdateDraft[]) => {
    if (!currentUser || updates.length === 0) return;
    if (!hasPermission(currentUser, 'item.edit')) return alert('Anda tidak memiliki izin mengubah harga.');
    const updateMap = new Map(updates.map(update => [update.itemId, update]));
    const beforeItems = useAppStore.getState().items.filter(item => updateMap.has(item.id));
    setItems(prev =>
      prev.map(item => {
        const draft = updateMap.get(item.id);
        if (!draft) return item;
        return {
          ...item,
          basePrice: draft.newBasePrice,
          memberPrices: draft.newMemberPrices,
          units: syncUnitPrices(item.units, item.memberPrices[0] || 0, draft.newMemberPrices[0] || 0),
        };
      }),
    );
    const afterItems = useAppStore.getState().items.filter(item => updateMap.has(item.id));
    setAiUndoStack(prev => [{
      id: createId('UNDO'),
      actionType: 'PRICE_UPDATE' as const,
      label: `Undo perubahan harga (${updates.length} item)`,
      createdAt: new Date().toISOString(),
      // Simpan HANYA harga lama — undo tidak boleh mengembalikan stok/data lain yang sudah berubah.
      payload: { prices: beforeItems.map(item => ({ id: item.id, basePrice: item.basePrice, memberPrices: [...item.memberPrices] })) },
    }, ...prev].slice(0, 3));
    logPriceChanges(beforeItems, afterItems, 'AI', 'AI Consultant (dikonfirmasi user)');
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
      id: createId('UNDO'),
      actionType: 'PROMO_CREATE' as const,
      label: `Undo pembuatan promo (${drafts.length} campaign)`,
      createdAt: new Date().toISOString(),
      payload: { promotionIds: createdIds },
    }, ...prev].slice(0, 3));
    appendAuditLog({
      id: createId('AUD'),
      action: 'SETTINGS_UPDATED',
      actorId: currentUser.id,
      actorName: currentUser.name,
      entityType: 'SETTINGS',
      details: `AI Consultant membuat ${drafts.length} campaign promo baru setelah konfirmasi user.`,
      createdAt: new Date().toISOString(),
    });
  };

  const createAIPurchaseOrders = async (drafts: PurchaseOrder[]) => {
    if (!currentUser || drafts.length === 0) return;
    const createdIds: string[] = [];
    // Berurutan agar tiap PO tersimpan (dan error per PO terlihat), bukan hilang sebagai promise yang tidak ditangani.
    for (const draft of drafts) {
      try {
        await addPurchaseOrder(draft);
        createdIds.push(draft.id);
      } catch (error: any) {
        alert(`PO untuk ${draft.supplierName} gagal dibuat: ${error?.message || 'error tidak diketahui'}`);
      }
    }
    if (createdIds.length === 0) return;
    setAiUndoStack(prev => [{
      id: createId('UNDO'),
      actionType: 'PO_CREATE' as const,
      label: `Undo draft PO (${createdIds.length} dokumen)`,
      createdAt: new Date().toISOString(),
      payload: { poIds: createdIds },
    }, ...prev].slice(0, 3));
  };

  const undoAIAction = (undoId: string) => {
    if (!currentUser) return;
    const target = aiUndoStack.find(entry => entry.id === undoId);
    if (!target) return;

    if (target.actionType === 'PRICE_UPDATE') {
      // Format baru: payload.prices. Format lama: payload.items (objek barang penuh) — ambil harganya saja.
      const restorePrices: Array<{ id: string; basePrice: number; memberPrices: number[] }> = Array.isArray(target.payload?.prices)
        ? target.payload.prices
        : Array.isArray(target.payload?.items)
          ? target.payload.items.map((item: Item) => ({ id: item.id, basePrice: item.basePrice, memberPrices: item.memberPrices }))
          : [];
      const map = new Map(restorePrices.map(entry => [entry.id, entry]));
      const beforeItems = useAppStore.getState().items.filter(item => map.has(item.id));
      setItems(prev => prev.map(item => {
        const restore = map.get(item.id);
        return restore
          ? { ...item, basePrice: restore.basePrice, memberPrices: [...restore.memberPrices], units: syncUnitPrices(item.units, item.memberPrices[0] || 0, restore.memberPrices[0] || 0) }
          : item;
      }));
      logPriceChanges(beforeItems, useAppStore.getState().items.filter(item => map.has(item.id)), 'AI_UNDO', target.label);
    }

    if (target.actionType === 'PROMO_CREATE') {
      const ids: string[] = Array.isArray(target.payload?.promotionIds) ? target.payload.promotionIds : [];
      setPromotions(prev => prev.filter(item => !ids.includes(item.id)));
      recordDeletion('promotions', ids);
    }

    if (target.actionType === 'PO_CREATE') {
      const ids: string[] = Array.isArray(target.payload?.poIds) ? target.payload.poIds : [];
      const targets = useAppStore.getState().purchaseOrders.filter(po => ids.includes(po.id));
      // Hanya PO yang belum diterima & belum dibayar yang boleh dibatalkan.
      const removable = targets.filter(po => po.status === 'PENDING' && !(po.paidAmount && po.paidAmount > 0) && po.items.every(line => line.receivedQty === 0));
      const removableIds = new Set(removable.map(po => po.id));
      if (removable.length > 0) {
        setPurchaseOrders(prev => prev.filter(po => !removableIds.has(po.id)));
        // Hanya PO versi lama yang mencatat hutang saat dibuat; PO baru belum punya jurnal sebelum barang diterima.
        const legacyTotal = removable.filter(po => !po.ledgerV).reduce((sum, po) => sum + po.total, 0);
        if (legacyTotal > 0) setAccounts(prev => reversePurchaseOrderAccounts(prev, legacyTotal));
        recordDeletion('purchaseOrders', [...removableIds]);
      }
      if (removable.length < targets.length) {
        alert(`${targets.length - removable.length} PO tidak dibatalkan karena sudah diterima atau dibayar.`);
      }
    }

    setAiUndoStack(prev => prev.filter(entry => entry.id !== undoId));
    appendAuditLog({
      id: createId('AUD'),
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
      id: createId('AUD'),
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
    recordDeletion('mediaAssets', [id]);
    if (!currentUser || !target) return;
    appendAuditLog({
      id: createId('AUD'),
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
  const deleteCustomer = (id: string) => {
    if (!hasPermission(currentUser, 'contact.delete')) return alert('Anda tidak memiliki izin menghapus kontak.');
    const target = useAppStore.getState().customers.find(customer => customer.id === id);
    if (target && target.currentDebt > 0) {
      return alert(`${target.name} masih memiliki piutang Rp ${target.currentDebt.toLocaleString('id-ID')}. Lunasi dulu sebelum menghapus.`);
    }
    setCustomers(prev => prev.filter(c => c.id !== id));
    recordDeletion('customers', [id]);
  };

  const addSupplier = (s: Supplier) => hasPermission(currentUser, 'contact.create') ? setSuppliers(prev => [...prev, s]) : alert('Anda tidak memiliki izin menambah kontak.');
  const updateSupplier = (updated: Supplier) => hasPermission(currentUser, 'contact.edit') ? setSuppliers(prev => prev.map(s => s.id === updated.id ? updated : s)) : alert('Anda tidak memiliki izin mengubah kontak.');
  const deleteSupplier = (id: string) => {
    if (!hasPermission(currentUser, 'contact.delete')) return alert('Anda tidak memiliki izin menghapus kontak.');
    setSuppliers(prev => prev.filter(s => s.id !== id));
    recordDeletion('suppliers', [id]);
  };

  const addUser = async (draft: UserDraft) => {
    if (!hasPermission(currentUser, 'user.manage')) return alert('Anda tidak memiliki izin mengelola user.');
    if (users.some(user => user.username.toLowerCase() === draft.username.trim().toLowerCase())) {
      alert('Username sudah digunakan.');
      return;
    }
    if (!draft.password || draft.password.length < 4) {
      alert('Password akun baru wajib diisi (minimal 4 karakter).');
      return;
    }
    const passwordHash = await hashPassword(draft.password);
    const newUser: User = {
      id: draft.id,
      name: draft.name,
      username: draft.username.trim().toLowerCase(),
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
    recordDeletion('users', [id]);
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

  const closeCashSession = (closingCash: number, closingNotes: string = ''): CashSession | null => {
    if (!currentUser) return null;
    const openSession = getOpenCashSession(currentUser.id);
    if (!openSession) {
      alert('Tidak ada shift kasir terbuka.');
      return null;
    }

    const sessionSales = sales.filter(sale => sale.cashSessionId === openSession.id && sale.status !== 'VOID');
    const cashRefunds = returns
      .filter(ret => ret.status === 'APPROVED')
      .reduce((sum, ret) => {
        // Retur baru mencatat shift tempat uang refund dikeluarkan (hanya bagian tunai).
        if (ret.cashSessionId) return sum + (ret.cashSessionId === openSession.id ? (ret.refund ? ret.refund.cash : ret.totalReturn) : 0);
        // Data lama: perkiraan dari shift penjualan asal.
        if ((ret.createdAt || '') < openSession.openedAt) return sum;
        const origin = sales.find(sale => sale.invoiceNo === ret.originalInvoiceNo);
        return sum + (origin?.cashSessionId === openSession.id && origin.paymentType === 'TUNAI' ? ret.totalReturn : 0);
      }, 0);
    const sessionExpenses = cashExpenses
      .filter(expense => expense.cashSessionId === openSession.id)
      .reduce((sum, expense) => sum + expense.amount, 0);
    const customerCashPayments = paymentRecords
      .filter(payment => payment.referenceType === 'CUSTOMER_PAYMENT' && payment.cashSessionId === openSession.id)
      .reduce((sum, payment) => sum + payment.amount, 0);
    // Uang tunai lain di laci: topup deposit/DP & refund retur beli (masuk), pengembalian deposit & komisi (keluar).
    const otherCash = (direction: 'IN' | 'OUT') => paymentRecords
      .filter(payment => payment.cashSessionId === openSession.id && payment.direction === direction && /tunai|cash/i.test(payment.method))
      .filter(payment => payment.referenceType === 'DEPOSIT' || payment.referenceType === 'COMMISSION' || payment.referenceType === 'PURCHASE_RETURN')
      .reduce((sum, payment) => sum + payment.amount, 0);
    const otherCashIn = otherCash('IN');
    const otherCashOut = otherCash('OUT');
    const expectedCash = openSession.openingCash
      + sessionSales.reduce((sum, sale) => sum + getSaleCashAmount(sale), 0)
      + customerCashPayments
      + otherCashIn
      - cashRefunds
      - otherCashOut
      - sessionExpenses;
    const nonCashSales = sessionSales.reduce((sum, sale) => sum + getSaleBankAmount(sale) + getSaleDepositAmount(sale), 0);
    const creditSales = sessionSales.reduce((sum, sale) => sum + getSaleCreditAmount(sale), 0);
    const shortageOrOverage = closingCash - expectedCash;

    const closedSession: CashSession = {
      ...openSession,
      closedAt: new Date().toISOString(),
      closingCash,
      expectedCash,
      nonCashSales,
      creditSales,
      cashRefunds,
      cashExpenses: sessionExpenses,
      customerCashPayments,
      otherCashIn,
      otherCashOut,
      shortageOrOverage,
      closingNotes,
      status: 'CLOSED',
    };
    setCashSessions(prev => prev.map(session => session.id === openSession.id ? closedSession : session));
    return closedSession;
  };

  const addCashExpense = async (expense: CashExpense): Promise<void> => {
    if (!currentUser || !hasPermission(currentUser, 'accounting.view')) throw new Error('Anda tidak memiliki izin mencatat pengeluaran.');
    if (expense.amount <= 0 || !expense.description.trim()) throw new Error('Keterangan dan nominal pengeluaran wajib diisi.');
    await runInventorySafeMutation(snapshot => {
      const openSession = snapshot.cashSessions.find(session => session.userId === currentUser.id && session.status === 'OPEN');
      const prepared = { ...expense, operatorId: currentUser.id, operatorName: currentUser.name, cashSessionId: openSession?.id, ledgerV: LEDGER_VERSION };
      // Jurnal (Dr Biaya, Cr Kas) diturunkan otomatis dari dokumen ini — saldo akun tidak diubah langsung.
      return {
        ...snapshot,
        cashExpenses: [prepared, ...snapshot.cashExpenses],
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
      assertPeriodOpen(snapshot.appSettings, target.createdAt, 'Pengeluaran');
      return {
        ...snapshot,
        cashExpenses: snapshot.cashExpenses.filter(expense => expense.id !== id),
        // Data lama (sebelum buku besar otomatis) memakai saldo akun langsung.
        accounts: target.ledgerV ? snapshot.accounts : reverseCashExpenseAccounts(snapshot.accounts, target.amount),
        deletedRecords: [{ collection: 'cashExpenses', id, deletedAt: new Date().toISOString() }, ...(snapshot.deletedRecords || [])],
      };
    });
  };

  /**
   * Simpan penjualan. Mendukung pembayaran campuran (`sale.payments`), jasa, diskon baris, deposit,
   * dan faktur dari Work Order. Saldo pelanggan berubah lewat buku besar pelanggan (aman untuk sinkron).
   */
  const addSale = async (sale: Sale, options: { heldCartId?: string } = {}): Promise<Sale> => {
    if (!currentUser || !hasPermission(currentUser, 'sale.create')) throw new Error('Anda tidak memiliki izin membuat penjualan.');
    const zeroPriced = sale.items.find(line => !(line.price > 0));
    if (zeroPriced) throw new Error(`Harga jual ${zeroPriced.name} masih Rp 0. Atur harga di Master Barang sebelum dijual.`);
    const next = await runInventorySafeMutation((snapshot) => {
      if (snapshot.sales.some(entry => entry.id === sale.id || entry.invoiceNo === sale.invoiceNo)) {
        throw new Error(`Faktur ${sale.invoiceNo} sudah tersimpan.`);
      }
      const payments = getSalePayments(sale);
      const paidTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
      if (Math.round(paidTotal) !== Math.round(sale.total)) throw new Error('Total pembayaran tidak sama dengan total belanja.');
      const customer = snapshot.customers.find(entry => entry.id === sale.customerId);
      const creditAmount = getSaleCreditAmount(sale);
      const depositAmount = getSaleDepositAmount(sale);
      if (creditAmount > 0) {
        if (!customer || customer.creditLimit <= 0) throw new Error('Pilih pelanggan yang memiliki limit kredit.');
        if (customer.currentDebt + creditAmount > customer.creditLimit) throw new Error('Transaksi melebihi limit kredit pelanggan.');
      }
      if (depositAmount > 0 && (!customer || (customer.depositBalance || 0) < depositAmount)) {
        throw new Error(`Saldo deposit pelanggan tidak cukup (tersedia Rp ${(customer?.depositBalance || 0).toLocaleString('id-ID')}).`);
      }
      const openSession = snapshot.cashSessions.find(session => session.userId === currentUser.id && session.status === 'OPEN') || null;
      const preparedSale: Sale = {
        ...sale,
        paymentType: sale.payments?.length ? summarizePaymentType(sale.payments) : sale.paymentType,
        items: sale.items.map(line => ({
          ...line,
          costPrice: (() => {
            const source = snapshot.items.find(item => item.id === line.itemId);
            // Modal per satuan dasar; paket = jumlah modal komponen saat ini.
            return source ? getItemCost(source, snapshot.items) : line.costPrice ?? 0;
          })(),
        })),
        createdAt: new Date().toISOString(),
        status: 'COMPLETED',
        operatorId: currentUser.id,
        cashSessionId: openSession?.id,
        ledgerV: LEDGER_VERSION,
      };
      const result = completeSale(snapshot.items, preparedSale, currentUser, snapshot.customers);
      const balanceChanges: BalanceChange[] = [
        { customerId: preparedSale.customerId, kind: 'DEBT', delta: creditAmount, referenceNo: preparedSale.invoiceNo, referenceType: 'SALE' },
        { customerId: preparedSale.customerId, kind: 'DEPOSIT', delta: -depositAmount, referenceNo: preparedSale.invoiceNo, referenceType: 'SALE' },
        { customerId: preparedSale.customerId, kind: 'POINTS', delta: (preparedSale.pointsEarned || 0) - (preparedSale.pointsUsed || 0), referenceNo: preparedSale.invoiceNo, referenceType: 'SALE' },
      ];
      const balances = applyBalanceChanges(snapshot.customers, balanceChanges, currentUser);
      const now = new Date().toISOString();
      const serviceOrdersNext = preparedSale.serviceOrderId
        ? (snapshot.serviceOrders || []).map(order => (order.id === preparedSale.serviceOrderId ? { ...order, status: 'DIFAKTURKAN' as const, invoiceNo: preparedSale.invoiceNo, updatedAt: now } : order))
        : snapshot.serviceOrders;
      const heldCartsNext = options.heldCartId ? (snapshot.heldCarts || []).filter(cart => cart.id !== options.heldCartId) : snapshot.heldCarts;
      return {
        ...snapshot,
        sales: [{ ...preparedSale, items: result.saleItems }, ...snapshot.sales],
        items: result.items,
        customers: balances.customers,
        customerLedger: [...balances.entries, ...(snapshot.customerLedger || [])],
        serviceOrders: serviceOrdersNext,
        heldCarts: heldCartsNext,
        deletedRecords: options.heldCartId
          ? [{ collection: 'heldCarts', id: options.heldCartId, deletedAt: now }, ...(snapshot.deletedRecords || [])]
          : snapshot.deletedRecords,
        inventoryMovements: [...result.movements, ...snapshot.inventoryMovements],
        paymentRecords: [result.payment, ...snapshot.paymentRecords],
        auditLogs: [result.audit, ...snapshot.auditLogs].slice(0, AUDIT_LOG_LIMIT),
      };
    });
    const saved = next.sales.find(entry => entry.id === sale.id);
    if (!saved) throw new Error('Penjualan gagal disimpan.');
    return saved;
  };

  /**
   * Batalkan transaksi (void) — untuk salah input di shift yang sama. Stok, kas/bank, piutang, deposit, dan poin dikembalikan.
   * Transaksi dari shift yang sudah ditutup, yang sudah diretur, atau yang piutangnya sudah dicicil harus lewat Retur.
   */
  const voidSale = async (saleId: string, reason: string): Promise<void> => {
    if (!currentUser || !hasPermission(currentUser, 'sale.void')) throw new Error('Anda tidak memiliki izin membatalkan transaksi.');
    const trimmedReason = reason.trim();
    if (!trimmedReason) throw new Error('Alasan pembatalan wajib diisi.');
    await runInventorySafeMutation(snapshot => {
      const sale = snapshot.sales.find(entry => entry.id === saleId);
      if (!sale) throw new Error('Transaksi tidak ditemukan.');
      if (sale.status === 'VOID') throw new Error(`Faktur ${sale.invoiceNo} sudah dibatalkan.`);
      assertPeriodOpen(snapshot.appSettings, sale.createdAt, `Faktur ${sale.invoiceNo}`);
      if (snapshot.returns.some(entry => entry.originalInvoiceNo === sale.invoiceNo)) {
        throw new Error('Faktur ini sudah memiliki retur — gunakan menu Retur untuk sisa barang.');
      }
      if (sale.cashSessionId && snapshot.cashSessions.some(session => session.id === sale.cashSessionId && session.status === 'CLOSED')) {
        throw new Error('Shift kasir untuk transaksi ini sudah ditutup — gunakan menu Retur.');
      }
      const customer = snapshot.customers.find(entry => entry.id === sale.customerId);
      const creditAmount = getSaleCreditAmount(sale);
      if (creditAmount > 0 && customer && customer.currentDebt < creditAmount) {
        throw new Error('Piutang transaksi ini sudah dibayar sebagian — gunakan menu Retur.');
      }
      const result = voidSaleStock(snapshot.items, sale, currentUser, trimmedReason);
      const now = new Date().toISOString();
      const balances = applyBalanceChanges(snapshot.customers, [
        { customerId: sale.customerId, kind: 'DEBT', delta: -creditAmount, referenceNo: sale.invoiceNo, referenceType: 'SALE_VOID' },
        { customerId: sale.customerId, kind: 'DEPOSIT', delta: getSaleDepositAmount(sale), referenceNo: sale.invoiceNo, referenceType: 'SALE_VOID' },
        { customerId: sale.customerId, kind: 'POINTS', delta: (sale.pointsUsed || 0) - (sale.pointsEarned || 0), referenceNo: sale.invoiceNo, referenceType: 'SALE_VOID' },
      ], currentUser);
      return {
        ...snapshot,
        sales: snapshot.sales.map(entry => entry.id === saleId ? {
          ...entry,
          status: 'VOID' as const,
          voidedAt: now,
          voidedBy: currentUser.name,
          voidReason: trimmedReason,
          voidLedgerV: LEDGER_VERSION,
          updatedAt: now,
        } : entry),
        items: result.items,
        customers: balances.customers,
        customerLedger: [...balances.entries, ...(snapshot.customerLedger || [])],
        // WO yang difakturkan lewat transaksi ini kembali ke status SELESAI agar bisa difakturkan ulang.
        serviceOrders: sale.serviceOrderId
          ? (snapshot.serviceOrders || []).map(order => (order.id === sale.serviceOrderId ? { ...order, status: 'SELESAI' as const, invoiceNo: undefined, updatedAt: now } : order))
          : snapshot.serviceOrders,
        inventoryMovements: [...result.movements, ...snapshot.inventoryMovements],
        paymentRecords: [result.payment, ...snapshot.paymentRecords],
        auditLogs: [result.audit, ...snapshot.auditLogs].slice(0, AUDIT_LOG_LIMIT),
      };
    });
  };

  /**
   * Proses retur yang disetujui: stok kembali dan dana dikembalikan sesuai cara bayar faktur asal
   * (kurangi piutang → deposit → bank → tunai). Dipakai saat retur langsung disetujui maupun approval belakangan.
   */
  const applyApprovedReturn = (snapshot: AppData, targetReturn: SaleReturn, user: User): AppData => {
    const approvedReturns = snapshot.returns.filter(entry => entry.status === 'APPROVED');
    const result = completeReturn(snapshot.items, snapshot.sales, approvedReturns, { ...targetReturn, status: 'APPROVED' }, user);
    const originSale = snapshot.sales.find(sale => sale.invoiceNo === targetReturn.originalInvoiceNo)!;
    const customer = snapshot.customers.find(entry => entry.id === originSale.customerId);
    const alreadyRefunded = approvedReturns
      .filter(entry => entry.originalInvoiceNo === originSale.invoiceNo)
      .reduce((acc, entry) => {
        const refund = getReturnRefund(entry, originSale);
        return { credit: acc.credit + refund.credit, deposit: acc.deposit + refund.deposit, cash: acc.cash + refund.cash, bank: acc.bank + refund.bank };
      }, { credit: 0, deposit: 0, cash: 0, bank: 0 });
    const refund = allocateReturnRefund(originSale, targetReturn.totalReturn, { currentDebt: customer?.currentDebt || 0, alreadyRefunded });
    // Deposit hanya untuk pelanggan terdaftar; jika tidak ada, kembalikan tunai.
    if (refund.deposit > 0 && !customer) { refund.cash += refund.deposit; refund.deposit = 0; }
    const refundSession = snapshot.cashSessions.find(session => session.userId === user.id && session.status === 'OPEN');
    const now = new Date().toISOString();
    const approved: SaleReturn = {
      ...targetReturn,
      status: 'APPROVED',
      approvedAt: now,
      approvedBy: user.name,
      refund,
      ledgerV: LEDGER_VERSION,
      cashSessionId: refund.cash > 0 ? refundSession?.id : undefined,
    };
    const balances = applyBalanceChanges(snapshot.customers, [
      { customerId: originSale.customerId, kind: 'DEBT', delta: -refund.credit, referenceNo: targetReturn.returnNo, referenceType: 'RETURN' },
      { customerId: originSale.customerId, kind: 'DEPOSIT', delta: refund.deposit, referenceNo: targetReturn.returnNo, referenceType: 'RETURN' },
    ], user);
    const exists = snapshot.returns.some(entry => entry.id === targetReturn.id);
    return {
      ...snapshot,
      returns: exists ? snapshot.returns.map(entry => (entry.id === targetReturn.id ? approved : entry)) : [approved, ...snapshot.returns],
      items: result.items,
      customers: balances.customers,
      customerLedger: [...balances.entries, ...(snapshot.customerLedger || [])],
      inventoryMovements: [...result.movements, ...snapshot.inventoryMovements],
      paymentRecords: [result.payment, ...snapshot.paymentRecords],
      auditLogs: [result.audit, ...snapshot.auditLogs].slice(0, AUDIT_LOG_LIMIT),
    };
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
        return { ...snapshot, returns: [preparedReturn, ...snapshot.returns], auditLogs: [audit, ...snapshot.auditLogs].slice(0, AUDIT_LOG_LIMIT) };
      }
      return applyApprovedReturn(snapshot, preparedReturn, currentUser);
    });
    return next.returns.find(entry => entry.id === ret.id) || preparedReturn;
  };

  const approveReturn = async (returnId: string): Promise<void> => {
    if (!currentUser || !hasPermission(currentUser, 'return.approve')) throw new Error('Anda tidak memiliki izin approve retur.');
    await runInventorySafeMutation((snapshot) => {
      const targetReturn = snapshot.returns.find(entry => entry.id === returnId);
      if (!targetReturn || targetReturn.status === 'APPROVED') return snapshot;
      return applyApprovedReturn(snapshot, targetReturn, currentUser);
    });
  };

  const addPurchaseOrder = async (po: PurchaseOrder): Promise<void> => {
    if (!currentUser || !hasPermission(currentUser, 'purchase.create')) throw new Error('Anda tidak memiliki izin membuat PO.');
    await runInventorySafeMutation(snapshot => {
      if (snapshot.purchaseOrders.some(entry => entry.id === po.id)) throw new Error(`PO ${po.id} sudah tersimpan.`);
      if (!Number.isFinite(po.total) || po.total <= 0 || po.items.length === 0 || po.items.some(line => !(line.orderedQty > 0) || !(line.cost >= 0))) throw new Error('Data item PO tidak valid.');
      // Hutang dicatat di buku besar saat barang diterima (bukan saat PO dibuat).
      const roundedPo = { ...po, subtotal: Math.round(po.subtotal), total: Math.round(po.total), ledgerV: LEDGER_VERSION };
      return {
        ...snapshot,
        purchaseOrders: [roundedPo, ...snapshot.purchaseOrders],
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
        } as AuditLog, ...snapshot.auditLogs].slice(0, AUDIT_LOG_LIMIT),
      };
    });
  };
  const payPurchaseOrder = async (poId: string, amount?: number, note?: string, method?: string): Promise<void> => {
    if (!currentUser || !hasPermission(currentUser, 'purchase.pay')) throw new Error('Anda tidak memiliki izin membayar PO.');
    await runInventorySafeMutation(snapshot => {
      const po = snapshot.purchaseOrders.find(item => item.id === poId);
      if (!po) throw new Error('PO tidak ditemukan.');
      // Sisa hutang memperhitungkan retur beli yang memotong hutang PO ini.
      const payableAmount = getPurchaseOrderOutstanding(po, snapshot.purchaseReturns || []);
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
        ledgerV: po.ledgerV ? LEDGER_VERSION : undefined,
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
          isPaid: payableAmount - paymentAmount <= 0,
          paymentNotes: note ? [...(item.paymentNotes || []), note] : item.paymentNotes,
        } : item),
        // PO versi lama: saldo akun masih dikelola langsung (hutang sudah dicatat saat PO dibuat).
        accounts: po.ledgerV ? snapshot.accounts : postPurchasePaymentAccounts(snapshot.accounts, paymentAmount, method),
        paymentRecords: [payment, ...snapshot.paymentRecords],
        auditLogs: [audit, ...snapshot.auditLogs].slice(0, AUDIT_LOG_LIMIT),
      };
    });
  };
  /** Terima barang dari PO. Mengembalikan daftar barang yang harga modalnya berubah agar harga jual bisa ditinjau. */
  const receivePurchaseOrder = async (poId: string, updatedItems: { itemId: string, receivedQty: number }[]): Promise<CostChange[]> => {
    if (!currentUser || !hasPermission(currentUser, 'purchase.receive')) throw new Error('Anda tidak memiliki izin menerima PO.');
    let costChanges: CostChange[] = [];
        await runInventorySafeMutation((snapshot) => {
          const po = snapshot.purchaseOrders.find(item => item.id === poId);
          if (!po) throw new Error('PO tidak ditemukan.');
          const result = receivePurchaseOrderStock(snapshot.items, po, updatedItems, currentUser);
          if (result.movements.length === 0) throw new Error('Masukkan minimal satu qty penerimaan.');
          costChanges = result.costChanges;
          const priceLogs = buildPriceChangeLogs(snapshot.items, result.items, {
            source: 'PURCHASE',
            note: `Modal rata-rata dari penerimaan ${po.id}`,
            operatorName: currentUser.name,
            operatorId: currentUser.id,
          });
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
            priceHistory: [...priceLogs, ...(snapshot.priceHistory || [])].slice(0, PRICE_HISTORY_LIMIT),
            auditLogs: [result.audit, ...snapshot.auditLogs].slice(0, AUDIT_LOG_LIMIT),
          };
        });
    return costChanges;
  };

  /** Pelunasan (sebagian/penuh) piutang pelanggan. Pembayaran tunai masuk ke rekap shift kasir yang terbuka. */
  const receiveCustomerPayment = async (customerId: string, amount: number, method: string, note?: string): Promise<void> => {
    if (!currentUser || !(hasPermission(currentUser, 'sale.create') || hasPermission(currentUser, 'accounting.view'))) {
      throw new Error('Anda tidak memiliki izin menerima pembayaran piutang.');
    }
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Nominal pembayaran tidak valid.');
    await runInventorySafeMutation(snapshot => {
      const customer = snapshot.customers.find(entry => entry.id === customerId);
      if (!customer) throw new Error('Pelanggan tidak ditemukan.');
      if (customer.currentDebt <= 0) throw new Error(`${customer.name} tidak memiliki piutang.`);
      const payAmount = Math.min(Math.round(amount), customer.currentDebt);
      const isCash = /tunai|cash/i.test(method);
      const openSession = isCash ? snapshot.cashSessions.find(session => session.userId === currentUser.id && session.status === 'OPEN') : undefined;
      const now = new Date().toISOString();
      const payment: PaymentRecord = {
        id: createId('PAY'),
        referenceNo: createDocumentNo('PLN'),
        referenceType: 'CUSTOMER_PAYMENT',
        amount: payAmount,
        method,
        direction: 'IN',
        createdAt: now,
        operatorName: currentUser.name,
        operatorId: currentUser.id,
        customerId,
        cashSessionId: openSession?.id,
        note,
        ledgerV: LEDGER_VERSION,
      };
      const balances = applyBalanceChanges(snapshot.customers, [
        { customerId, kind: 'DEBT', delta: -payAmount, referenceNo: payment.referenceNo, referenceType: 'PAYMENT', method, cashSessionId: openSession?.id },
      ], currentUser);
      const audit: AuditLog = {
        id: createId('AUD'),
        action: 'CUSTOMER_PAYMENT',
        actorId: currentUser.id,
        actorName: currentUser.name,
        entityType: 'CUSTOMER',
        entityId: customerId,
        entityLabel: customer.name,
        details: `Pelunasan piutang ${customer.name} Rp ${payAmount.toLocaleString('id-ID')} via ${method}. Sisa: Rp ${(customer.currentDebt - payAmount).toLocaleString('id-ID')}.`,
        createdAt: now,
      };
      return {
        ...snapshot,
        customers: balances.customers,
        customerLedger: [...balances.entries, ...(snapshot.customerLedger || [])],
        paymentRecords: [payment, ...snapshot.paymentRecords],
        auditLogs: [audit, ...snapshot.auditLogs].slice(0, AUDIT_LOG_LIMIT),
      };
    });
  };

  const canAdjustStock = hasPermission(currentUser, 'stock.adjust') || hasPermission(currentUser, 'stock.opname');
  const completeInventoryLog = (log: any): InventoryLog => ({
    ...log,
    id: log.id || createId('SO'),
    createdAt: log.createdAt || new Date().toISOString(),
    operatorName: log.operatorName || currentUser?.name || '',
    operatorId: log.operatorId || currentUser?.id,
  });

  const handleStockAdjustment = (rawLog: any) => {
    if (!currentUser || !canAdjustStock) return alert('Anda tidak memiliki izin menyesuaikan stok.');
    const log = completeInventoryLog(rawLog);
    (async () => {
      try {
        await runInventorySafeMutation((snapshot) => {
          const result = adjustStock(snapshot.items, log.itemId, log.actualStock, log.id, log.notes, currentUser);
          return {
            ...snapshot,
            inventoryLogs: [log, ...snapshot.inventoryLogs],
            items: result.items,
            inventoryMovements: [result.movement, ...snapshot.inventoryMovements],
            auditLogs: [result.audit, ...snapshot.auditLogs].slice(0, AUDIT_LOG_LIMIT),
          };
        });
      } catch (error: any) {
        alert(error?.message || 'Gagal adjust stok.');
      }
    })();
  };

  const handleStockAdjustmentBulk = (rawLogs: any[]) => {
    if (!currentUser || !canAdjustStock) return alert('Anda tidak memiliki izin menyesuaikan stok.');
    const logs = rawLogs.map(completeInventoryLog);
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
            auditLogs: [...bulkAudits, ...snapshot.auditLogs].slice(0, AUDIT_LOG_LIMIT),
          };
        });
      } catch (error: any) {
        alert(error?.message || 'Gagal bulk adjust stok.');
      }
    })();
  };

  // ============================================================ MODE LENGKAP
  const requireUser = (permission: Parameters<typeof hasPermission>[1], message: string): User => {
    if (!currentUser || !hasPermission(currentUser, permission)) throw new Error(message);
    return currentUser;
  };

  /** Simpan pengaturan toko (mode, tutup buku, margin minimal, sandi modal). Tersinkron ke semua perangkat. */
  const saveAppSettings = (patch: Partial<AppSettings>): boolean => {
    if (!currentUser || !hasPermission(currentUser, 'settings.manage')) {
      alert('Hanya owner/manager yang bisa mengubah pengaturan toko.');
      return false;
    }
    if (patch.lockDate) {
      const pad = (n: number) => String(n).padStart(2, '0');
      const now = new Date();
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      if (patch.lockDate >= today) {
        alert('Tanggal tutup buku harus sebelum hari ini.');
        return false;
      }
    }
    const current = useAppStore.getState().appSettings;
    setAppSettings({ mode: 'SIMPLE', ...(current || {}), ...patch } as AppSettings);
    appendAuditLog({
      id: createId('AUD'),
      action: 'SETTINGS_UPDATED',
      actorId: currentUser.id,
      actorName: currentUser.name,
      entityType: 'SETTINGS',
      details: `Pengaturan toko diubah: ${Object.keys(patch).join(', ')}${patch.mode ? ` (mode ${patch.mode})` : ''}${patch.lockDate !== undefined ? ` (tutup buku s/d ${patch.lockDate || '-'})` : ''}.`,
      createdAt: new Date().toISOString(),
    });
    return true;
  };

  const handleTopupDeposit = async (customerId: string, amount: number, method: string, note?: string) => {
    const user = requireUser('sale.create', 'Anda tidak memiliki izin menerima deposit.');
    await runInventorySafeMutation(snapshot => topupDeposit(snapshot, user, { customerId, amount, method, note }));
  };

  const handleRefundDeposit = async (customerId: string, amount: number, method: string, note?: string) => {
    const user = requireUser('accounting.view', 'Pengembalian deposit butuh izin akuntansi.');
    await runInventorySafeMutation(snapshot => refundDeposit(snapshot, user, { customerId, amount, method, note }));
  };

  const handleSaveServiceOrder = async (order: ServiceOrder) => {
    const user = requireUser('sale.create', 'Anda tidak memiliki izin membuat Work Order.');
    await runInventorySafeMutation(snapshot => saveServiceOrder(snapshot, user, order));
  };

  const handleServiceOrderDp = async (orderId: string, amount: number, method: string) => {
    const user = requireUser('sale.create', 'Anda tidak memiliki izin menerima DP.');
    await runInventorySafeMutation(snapshot => receiveServiceOrderDp(snapshot, user, orderId, amount, method));
  };

  /** WO yang dikirim ke kasir untuk dibuatkan faktur. */
  const [posServiceOrder, setPosServiceOrder] = useState<ServiceOrder | null>(null);
  const sendServiceOrderToPos = (order: ServiceOrder) => {
    setPosServiceOrder(order);
    setActiveTab('pos');
  };

  const handleSaveMechanic = (mechanic: Mechanic) => {
    if (!hasPermission(currentUser, 'settings.manage')) return alert('Hanya owner/manager yang bisa mengubah data mekanik.');
    if (!mechanic.name.trim()) return alert('Nama mekanik wajib diisi.');
    setMechanics(prev => (prev.some(entry => entry.id === mechanic.id) ? prev.map(entry => (entry.id === mechanic.id ? mechanic : entry)) : [...prev, mechanic]));
  };

  const handlePayCommission = async (mechanicId: string, amount: number, method: string, note?: string) => {
    const user = requireUser('accounting.view', 'Pembayaran komisi butuh izin akuntansi.');
    await runInventorySafeMutation(snapshot => payCommission(snapshot, user, { mechanicId, amount, method, note }));
  };

  const handleSaveWarehouse = (warehouse: Warehouse) => {
    if (!hasPermission(currentUser, 'stock.adjust')) return alert('Anda tidak memiliki izin mengelola gudang.');
    if (!warehouse.name.trim()) return alert('Nama gudang wajib diisi.');
    setWarehouses(prev => (prev.some(entry => entry.id === warehouse.id) ? prev.map(entry => (entry.id === warehouse.id ? warehouse : entry)) : [...prev, warehouse]));
  };

  const handleTransferStock = async (input: { fromWarehouseId: string; toWarehouseId: string; items: StockTransfer['items']; note?: string }) => {
    const user = requireUser('stock.adjust', 'Anda tidak memiliki izin memindahkan stok.');
    await runInventorySafeMutation(snapshot => transferStockOp(snapshot, user, input));
  };

  const handlePurchaseReturn = async (input: Omit<PurchaseReturn, 'id' | 'returnNo' | 'total' | 'createdAt' | 'operatorName' | 'operatorId'>) => {
    const user = requireUser('purchase.create', 'Anda tidak memiliki izin membuat retur pembelian.');
    await runInventorySafeMutation(snapshot => createPurchaseReturn(snapshot, user, input));
  };

  const handleSavePromotion = (promo: PromotionCampaign) => {
    if (!hasPermission(currentUser, 'item.edit')) return alert('Anda tidak memiliki izin mengatur promo.');
    setPromotions(prev => (prev.some(entry => entry.id === promo.id) ? prev.map(entry => (entry.id === promo.id ? promo : entry)) : [promo, ...prev]));
  };

  const handleDeletePromotion = (id: string) => {
    if (!hasPermission(currentUser, 'item.edit')) return alert('Anda tidak memiliki izin mengatur promo.');
    setPromotions(prev => prev.filter(entry => entry.id !== id));
    recordDeletion('promotions', [id]);
  };

  const handlePostJournal = async (input: { date: string; description: string; lines: JournalLine[] }) => {
    const user = requireUser('accounting.view', 'Anda tidak memiliki izin membuat jurnal.');
    await runInventorySafeMutation(snapshot => postManualJournal(snapshot, user, input));
  };

  const handleHoldCart = (cart: HeldCart) => {
    if (!hasPermission(currentUser, 'sale.create')) return alert('Anda tidak memiliki izin menahan transaksi.');
    setHeldCarts(prev => [cart, ...prev.filter(entry => entry.id !== cart.id)]);
  };

  const handleDeleteHeldCart = (id: string) => {
    setHeldCarts(prev => prev.filter(entry => entry.id !== id));
    recordDeletion('heldCarts', [id]);
  };

  /** Import pelanggan/supplier hasil migrasi. Nama yang sudah ada dilewati. */
  const handleImportContacts = (newCustomers: Customer[], newSuppliers: Supplier[]) => {
    if (!hasPermission(currentUser, 'contact.create')) {
      alert('Anda tidak memiliki izin menambah kontak.');
      return { customers: 0, suppliers: 0 };
    }
    const state = useAppStore.getState();
    const customerNames = new Set(state.customers.map(entry => entry.name.trim().toLowerCase()));
    const supplierNames = new Set(state.suppliers.map(entry => entry.name.trim().toLowerCase()));
    const freshCustomers = newCustomers.filter(entry => {
      const key = entry.name.trim().toLowerCase();
      if (customerNames.has(key)) return false;
      customerNames.add(key);
      return true;
    });
    const freshSuppliers = newSuppliers.filter(entry => {
      const key = entry.name.trim().toLowerCase();
      if (supplierNames.has(key)) return false;
      supplierNames.add(key);
      return true;
    });
    if (freshCustomers.length) setCustomers(prev => [...prev, ...freshCustomers]);
    if (freshSuppliers.length) setSuppliers(prev => [...prev, ...freshSuppliers]);
    return { customers: freshCustomers.length, suppliers: freshSuppliers.length };
  };

  const handleImportOpeningReceivables = async (rows: Array<{ customerName: string; amount: number }>) => {
    const user = requireUser('accounting.view', 'Import saldo awal piutang butuh izin akuntansi.');
    let summary = { applied: 0, missing: [] as string[] };
    await runInventorySafeMutation(snapshot => {
      const result = importOpeningReceivables(snapshot, user, rows);
      summary = { applied: result.applied, missing: result.missing };
      return result.data;
    });
    return summary;
  };

  /** Buku besar diturunkan dari dokumen transaksi — saldo akun yang ditampilkan di semua halaman. */
  const journals = useMemo(() => buildJournals({
    sales, returns, purchaseOrders, inventoryMovements, paymentRecords, cashExpenses,
    customerLedger, commissionPayments, purchaseReturns, manualJournals,
  }), [sales, returns, purchaseOrders, inventoryMovements, paymentRecords, cashExpenses, customerLedger, commissionPayments, purchaseReturns, manualJournals]);
  const ledgerAccounts = useMemo(() => computeAccountBalances(accounts, journals), [accounts, journals]);

  // Lengkapi bagan akun (Persediaan, Deposit, Modal, HPP, ...) sekali setelah data dimuat.
  useEffect(() => {
    if (!isDataLoaded) return;
    const state = useAppStore.getState();
    const ensured = ensureLedgerAccounts(state.accounts, state.items);
    if (ensured !== state.accounts) setAccounts(ensured);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDataLoaded, accounts.length]);

  // Backup otomatis per perangkat (mode Lengkap).
  useEffect(() => {
    if (!isDataLoaded || !isFullMode) return;
    const tick = async () => {
      if (!isBackupDue(getAutoBackupConfig())) return;
      try {
        await runBackup(buildDataSnapshot());
      } catch (error) {
        console.warn('[AutoBackup] gagal:', error);
      }
    };
    void tick();
    const timer = setInterval(() => { void tick(); }, 5 * 60_000);
    return () => clearInterval(timer);
  }, [isDataLoaded, isFullMode, buildDataSnapshot]);

  // Transaksi yang di-void tidak dihitung di omzet, laporan, pajak, maupun AI.
  const activeSales = sales.filter(sale => sale.status !== 'VOID');

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

              {hasCloudConfig() && (
                <div className="mt-5">
                  <CloudConnectPanel compact authRequired={cloudAuthRequired} onConnected={handleCloudConnected} />
                </div>
              )}

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
    if (!canAccessTab(currentUser, activeTab, appMode)) {
       return (
         <div className="h-full flex flex-col items-center justify-center p-10 text-center space-y-6 animate-in fade-in duration-500">
           <div className="w-24 h-24 bg-red-50 text-red-500 rounded-full flex items-center justify-center shadow-inner border-4 border-red-100"><Lock size={48} /></div>
           <div><h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Akses Ditolak</h2><p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-2 max-w-xs mx-auto">Anda tidak memiliki izin akses untuk modul ini. Hubungi Manager untuk bantuan.</p></div>
           <button onClick={() => setActiveTab(getAccessibleTabs(currentUser, appMode)[0] || 'dashboard')} className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 border-b-4 border-slate-950">Kembali ke Beranda</button>
         </div>
       );
    }

    switch (activeTab) {
      case 'settings': return <Settings cloudAuthRequired={cloudAuthRequired} onCloudConnected={handleCloudConnected} onCloudConfigChange={() => { setIsCloudActive(hasCloudConfig()); setSavedDbs(getCloudProfiles()); }} onExportBackup={exportBackup} onImportBackup={importBackup} storeProfile={storeProfile} onSaveStoreProfile={setStoreProfile}
        appSettings={appSettings} onSaveAppSettings={saveAppSettings} getSnapshot={buildDataSnapshot}
        onImportItems={hasPermission(currentUser, 'item.create') ? importItems : undefined}
        onImportContacts={hasPermission(currentUser, 'contact.create') ? handleImportContacts : undefined}
        onImportOpeningReceivables={hasPermission(currentUser, 'accounting.view') ? handleImportOpeningReceivables : undefined} />;
      case 'dashboard': return <Dashboard items={items} sales={activeSales} customers={customers} accounts={ledgerAccounts} purchaseOrders={purchaseOrders} inventoryMovements={inventoryMovements} cashSessions={cashSessions} currentUser={currentUser} onOpenCashSession={openCashSession} onCloseCashSession={closeCashSession} onNavigate={setActiveTab} />;
      case 'master-items': return <MasterData type="items" items={items} priceHistory={priceHistory} onAddItem={addItem} onImportItems={importItems} onUpdateItem={updateItem} onUpdateItemsBulk={updateItemsBulk} onAdjustStockBulk={canAdjustStock ? handleStockAdjustmentBulk : undefined} onDeleteItem={deleteItem} onManualPush={handleManualPush} onRefresh={() => handleManualRefresh(true)} isSyncing={isSyncing} canCreate={hasPermission(currentUser, 'item.create')} canEdit={hasPermission(currentUser, 'item.edit')} canDelete={hasPermission(currentUser, 'item.delete')} isFullMode={isFullMode} appSettings={appSettings} warehouses={warehouses} />;
      case 'master-contacts': return <MasterData type="contacts" customers={customers} suppliers={suppliers} onAddCustomer={addCustomer} onUpdateCustomer={updateCustomer} onAddSupplier={addSupplier} onUpdateSupplier={updateSupplier} onDeleteCustomer={deleteCustomer} onDeleteSupplier={deleteSupplier} onReceiveCustomerPayment={(hasPermission(currentUser, 'sale.create') || hasPermission(currentUser, 'accounting.view')) ? receiveCustomerPayment : undefined} canCreate={hasPermission(currentUser, 'contact.create')} canEdit={hasPermission(currentUser, 'contact.edit')} canDelete={hasPermission(currentUser, 'contact.delete')} isFullMode={isFullMode} />;
      case 'pos': return <SalesPOS currentUser={currentUser} items={items} customers={customers} promotions={promotions} cashSessions={cashSessions} storeProfile={storeProfile} onCompleteSale={addSale} onNavigate={setActiveTab}
        isFullMode={isFullMode} appSettings={appSettings} mechanics={mechanics} heldCarts={heldCarts} onHoldCart={handleHoldCart} onDeleteHeldCart={handleDeleteHeldCart}
        serviceOrder={posServiceOrder} onServiceOrderConsumed={() => setPosServiceOrder(null)} />;
      case 'sales-list': return <SalesList sales={sales} storeProfile={storeProfile} onVoidSale={hasPermission(currentUser, 'sale.void') ? voidSale : undefined} onInitiateReturn={(invNo) => { setPreselectedReturnInvoice(invNo); setActiveTab('returns'); }} />;
      case 'returns': return <Returns sales={activeSales}  returns={returns} onCompleteReturn={addReturn} onApproveReturn={approveReturn} currentUser={currentUser} preselectedInvoiceNo={preselectedReturnInvoice} />;
      case 'purchasing': return <Purchasing purchaseOrders={purchaseOrders} suppliers={suppliers} items={items} onAddPO={addPurchaseOrder} onReceivePO={receivePurchaseOrder} onPayPO={payPurchaseOrder} onUpdateItemsBulk={hasPermission(currentUser, 'item.edit') ? updateItemsBulk : undefined} currentUser={currentUser}
        isFullMode={isFullMode} warehouses={warehouses} purchaseReturns={purchaseReturns} />;
      case 'stock-opname': return <Inventory items={items} logs={inventoryLogs} movements={inventoryMovements} onAdjustStock={handleStockAdjustment} onAdjustStockBulk={handleStockAdjustmentBulk} canAdjust={canAdjustStock} />;
      case 'accounting': return <Accounting accounts={ledgerAccounts} sales={activeSales} cashSessions={cashSessions} cashExpenses={cashExpenses} currentUser={currentUser} onAddCashExpense={addCashExpense} onDeleteCashExpense={deleteCashExpense} />;
      case 'reporting': return <Reporting items={items} customers={customers} suppliers={suppliers} accounts={ledgerAccounts} sales={activeSales} returns={returns} purchaseOrders={purchaseOrders} onReceiveCustomerPayment={(hasPermission(currentUser, 'sale.create') || hasPermission(currentUser, 'accounting.view')) ? receiveCustomerPayment : undefined} onAnalyzeWithAI={() => setActiveTab('ai-consultant')} />;
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
          sales={activeSales}
          purchaseOrders={purchaseOrders}
          returns={returns}
          items={items}
          customers={customers}
          suppliers={suppliers}
          cashSessions={cashSessions}
          onNavigate={setActiveTab}
        />
      );
      // ---------------- Mode Lengkap
      case 'service-orders': return <ServiceOrders orders={serviceOrders} customers={customers} items={items} mechanics={mechanics} currentUser={currentUser}
        onSave={handleSaveServiceOrder} onReceiveDp={handleServiceOrderDp} onSendToPos={sendServiceOrderToPos} />;
      case 'deposits': return <Deposits customers={customers} ledger={customerLedger} onTopup={handleTopupDeposit}
        onRefund={hasPermission(currentUser, 'accounting.view') ? handleRefundDeposit : undefined} />;
      case 'mechanics': return <Mechanics mechanics={mechanics} sales={activeSales} returns={returns} payments={commissionPayments} appSettings={appSettings}
        onSaveMechanic={hasPermission(currentUser, 'settings.manage') ? handleSaveMechanic : undefined}
        onPayCommission={hasPermission(currentUser, 'accounting.view') ? handlePayCommission : undefined} />;
      case 'warehouses': return <Warehouses warehouses={warehouses} items={items} transfers={stockTransfers}
        onSaveWarehouse={hasPermission(currentUser, 'stock.adjust') ? handleSaveWarehouse : undefined}
        onTransfer={hasPermission(currentUser, 'stock.adjust') ? handleTransferStock : undefined} />;
      case 'purchase-returns': return <PurchaseReturns suppliers={suppliers} items={items} purchaseOrders={purchaseOrders} purchaseReturns={purchaseReturns} warehouses={warehouses}
        onCreate={hasPermission(currentUser, 'purchase.create') ? handlePurchaseReturn : undefined} />;
      case 'promotions': return <Promotions promotions={promotions} items={items} currentUser={currentUser}
        onSave={hasPermission(currentUser, 'item.edit') ? handleSavePromotion : undefined}
        onDelete={hasPermission(currentUser, 'item.edit') ? handleDeletePromotion : undefined} />;
      case 'ledger': return <Ledger accounts={accounts} journals={journals} appSettings={appSettings}
        onPostJournal={handlePostJournal}
        onSaveAppSettings={hasPermission(currentUser, 'settings.manage') ? saveAppSettings : undefined} />;
      case 'advanced-reports': return <AdvancedReports items={items} sales={activeSales} returns={returns} movements={inventoryMovements}
        purchaseOrders={purchaseOrders} suppliers={suppliers} mechanics={mechanics} warehouses={warehouses} />;
      case 'user-management': return <UserManagement users={users} onAddUser={addUser} onUpdateUser={updateUser} onDeleteUser={deleteUser} canManage={hasPermission(currentUser, 'user.manage')} />;
      case 'ai-consultant': return (
        <AIConsultant
          items={items}
          sales={activeSales}
          accounts={ledgerAccounts}
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
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} onLogout={handleLogout} items={items} sales={activeSales} accounts={ledgerAccounts} isFullMode={isFullMode} floatingMessages={floatingChatHistory} onUpdateMessages={setFloatingChatHistory} isSyncing={isSyncing} onManualSync={() => handleManualRefresh(true)} lastSyncTime={lastSyncTime} syncError={syncError} cloudAuthRequired={cloudAuthRequired}>
      <ErrorBoundary key={activeTab} fallbackTitle="Halaman ini">
        <Suspense fallback={<PageLoadingFallback />}>
          {renderContent()}
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
};

export default App;
