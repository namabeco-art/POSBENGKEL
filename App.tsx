import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import MasterData from './pages/MasterData';
import SalesPOS from './pages/SalesPOS';
import SalesList from './pages/SalesList';
import Accounting from './pages/Accounting';
import Purchasing from './pages/Purchasing';
import Inventory from './pages/Inventory';
import UserManagement from './UserManagement';
import Reporting from './pages/Reporting';
import Returns from './pages/Returns';
import AIConsultant from './pages/AIConsultant';
import Settings from './pages/Settings';
import ERPControlTower from './pages/ERPControlTower';
import MediaVault from './pages/MediaVault';
import { AIPriceUpdateDraft, AIUndoEntry, AppData, AuditLog, Branch, CashSession, Customer, InventoryMovement, Item, MediaAsset, PaymentRecord, PromotionCampaign, PurchaseOrder, Sale, SaleReturn, Supplier, User, UserRole, Account } from './types';
import { mockUsers, mockItems, mockCustomers, mockSuppliers, mockAccounts, mockBranches, mockPromotions } from './store';
import { ShieldCheck, User as UserIcon, Key, Clock, AlertCircle, Info, CloudLightning, RefreshCw, Loader2, Link2, CheckCircle2, X, Plus, Store, ChevronRight, Globe, Lock, Trash2, Settings2, Database, HardDrive, Server, QrCode, Terminal, Activity, ChevronDown, Search, Cloud, Monitor, MapPin, ShieldEllipsis } from 'lucide-react';
import { pullFromCloud, pushToCloud, getCloudConfig, hasCloudConfig, applyActivationCode, saveCloudConfig, withCloudInventoryLock } from './services/syncService';
import { clearSessionLocal, loadAppDataLocal, loadSessionLocal, saveAppDataLocal, saveSessionLocal } from './services/storageService';
import { hashPassword, sanitizeUserSession, verifyPassword } from './services/authService';
import { canAccessTab, getAccessibleTabs, hasPermission } from './services/permissions';
import { adjustStock, completeReturn, completeSale, receivePurchaseOrderStock, validateUniqueItem } from './services/posOperations';
import { getCloudProfileLabel, getCloudProfileRegion, getCloudProfiles } from './services/cloudProfiles';
import { hasEnvCloudConfig } from './services/appConfig';
import { useAppStore } from './appStore';

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
  useEffect(() => {
    if (!isDataLoaded) return;
    const dataToSave = buildDataSnapshot();
    
    // 1. Instant Local Persistence
    saveAppDataLocal(dataToSave);

    // 2. Debounced Cloud Persistence
    if (hasCloudConfig()) {
      const timer = setTimeout(() => {
        pushToCloud(dataToSave).then(() => {
          setLastSyncTime(new Date().toLocaleTimeString());
          setSyncError(false);
        }).catch(() => setSyncError(true));
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [buildDataSnapshot, isDataLoaded]);

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
    if (!hasCloudConfig()) {
      const nextLocal = mutator(localSnapshot);
      applyData(nextLocal);
      saveAppDataLocal(nextLocal);
      return;
    }

    setIsSyncing(true);
    try {
      await withCloudInventoryLock(async () => {
        const latest = await pullFromCloud();
        const baseSnapshot = (latest && typeof latest === 'object')
          ? ({ ...localSnapshot, ...latest } as AppData)
          : localSnapshot;
        const nextSnapshot = mutator(baseSnapshot);
        await pushToCloud(nextSnapshot);
        applyData(nextSnapshot);
        saveAppDataLocal(nextSnapshot);
      });
      setSyncError(false);
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (error: any) {
      setSyncError(true);
      throw error;
    } finally {
      setIsSyncing(false);
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
    const activeCloudConfig = getCloudConfig();
    const isSetupView = loginView === 'setup';
    const currentActiveDbId = activeCloudConfig.storeId;
    const currentActiveDbLabel = getCloudProfileLabel(activeCloudConfig);
    const currentActiveRegion = getCloudProfileRegion(activeCloudConfig);
    const isLocalActive = !activeCloudConfig.enabled;
    const isEnvLockedWorkspace = hasEnvCloudConfig();
    const filteredProfiles = savedDbs.filter(db => {
      const keyword = cloudSearchTerm.toLowerCase();
      return (
        getCloudProfileLabel(db).toLowerCase().includes(keyword) ||
        getCloudProfileRegion(db).toLowerCase().includes(keyword) ||
        db.storeId.toLowerCase().includes(keyword)
      );
    });

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex flex-col items-center justify-start md:justify-center p-3 md:p-6 font-sans overflow-y-auto scrollbar-hide">
        <div className={`w-full ${isSetupView ? 'max-w-6xl grid grid-cols-1 lg:grid-cols-12' : 'max-w-2xl'} gap-4 md:gap-6 items-start py-4`}>
           {isSetupView && <div className="lg:col-span-4 space-y-3">
              <button
                onClick={() => setLoginView('auth')}
                className="px-4 py-2.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-indigo-400 hover:text-indigo-700 transition-all text-[10px] font-black uppercase tracking-[0.16em]"
              >
                Kembali ke Login
              </button>
              <div className="px-1 mb-2">
                 <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-white rounded-lg text-indigo-600 shadow-md border border-indigo-100"><Monitor size={16}/></div>
                    <h2 className="text-slate-700 font-black text-[10px] uppercase tracking-[0.2em]">{isEnvLockedWorkspace ? 'WORKSPACE TERKUNCI' : 'AKSES SISTEM'}</h2>
                 </div>
                 <p className="text-slate-500 font-bold text-[10px] tracking-wide leading-relaxed">{isEnvLockedWorkspace ? `Deployment ini langsung terhubung ke workspace ${currentActiveDbLabel}.` : 'Pilih mode kerja lalu tentukan workspace operasional'}</p>
              </div>

              {!isEnvLockedWorkspace && <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setLoginAccessMode('cloud');
                    setShowCloudSelector(current => !current);
                  }}
                  className={`px-4 py-2.5 rounded-full border transition-all text-left flex items-center gap-2.5 group ${loginAccessMode === 'cloud' ? 'bg-white border-emerald-300 shadow-md text-emerald-700' : 'bg-white/80 border-slate-200 text-slate-500 hover:border-indigo-300'}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all group-hover:scale-110 ${loginAccessMode === 'cloud' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    <Cloud size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-[10px] uppercase tracking-[0.18em] truncate leading-none">Cloud Workspace</div>
                    <div className="hidden">
                      {loginAccessMode === 'cloud' && !isLocalActive ? `${currentActiveDbLabel} • ${currentActiveRegion}` : 'Pilih lokasi cabang'}
                    </div>
                  </div>
                  <ChevronDown size={16} className={`transition-transform duration-300 ${showCloudSelector ? 'rotate-180' : ''}`} />
                </button>
              </div>}

              {isEnvLockedWorkspace && (
                <div className="space-y-4">
                  <div className="px-1 border-b border-slate-800 pb-2 mb-2 flex items-center justify-between">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">Workspace Terkunci (Env)</div>
                    <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{envConfig.stores.length} Unit Terdeteksi</div>
                  </div>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-hide">
                    {envConfig.stores.map((store, i) => {
                      const isSelected = currentActiveDbId === store.storeId && !isLocalActive;
                      const isPusat = i === 0;
                      return (
                        <button
                          key={store.storeId}
                          onClick={() => switchDb({ ...store, enabled: true })}
                          className={`w-full p-3 rounded-2xl border transition-all flex items-center justify-between group ${isSelected ? 'bg-emerald-500/10 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-slate-900/50 border-slate-800 hover:border-slate-600'}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isSelected ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
                              {isPusat ? <Database size={18} /> : <Store size={18} />}
                            </div>
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <div className={`font-black text-[11px] uppercase truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>{store.displayName}</div>
                                {isPusat && <span className="px-1.5 py-0.5 bg-indigo-600 text-white text-[7px] font-black uppercase rounded">PUSAT</span>}
                              </div>
                              <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">{store.region} • {store.storeId}</div>
                            </div>
                          </div>
                          {isSelected && <CheckCircle2 size={16} className="text-emerald-500" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {!isEnvLockedWorkspace && loginAccessMode === 'cloud' && (
                <div className="rounded-[1rem] border border-slate-800 bg-slate-900/70 px-3 py-2">
                  <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    {!isLocalActive ? `${currentActiveDbLabel} • ${currentActiveRegion}` : 'Pilih lokasi cabang'}
                  </div>
                </div>
              )}

              {!isEnvLockedWorkspace && loginAccessMode === 'cloud' && showCloudSelector && (
                <div className="bg-slate-900 border border-slate-800 rounded-[1.1rem] shadow-xl overflow-hidden animate-in slide-in-from-top-2 duration-300">
                  <div className="p-2.5 border-b border-slate-800 bg-slate-950/50">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={14} />
                      <input
                        autoFocus
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-[10px] font-bold text-white outline-none focus:border-emerald-500 placeholder:text-slate-600"
                        placeholder="Cari lokasi, region, atau workspace..."
                        value={cloudSearchTerm}
                        onChange={e => setCloudSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="max-h-[230px] overflow-y-auto scrollbar-hide py-1.5">
                    {filteredProfiles.length === 0 ? (
                      <div className="px-4 py-6 text-center">
                        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Belum ada workspace cloud tersimpan</p>
                      </div>
                    ) : (
                      filteredProfiles.map((db, idx) => {
                        const isSelected = currentActiveDbId === db.storeId && !isLocalActive;
                        return (
                          <button
                            key={idx}
                            onClick={() => switchDb(db)}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800 transition-colors group"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${isSelected ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-800 text-slate-500 group-hover:bg-slate-700'}`}>
                                <MapPin size={14} />
                              </div>
                              <div className="text-left min-w-0">
                                <div className="font-black text-[11px] text-slate-200 uppercase truncate leading-none">{getCloudProfileLabel(db)}</div>
                                <div className="text-[8px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">{getCloudProfileRegion(db)} • {db.storeId}</div>
                              </div>
                            </div>
                            {isSelected && <CheckCircle2 size={14} className="text-emerald-500" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

		              {!isEnvLockedWorkspace && <button
                onClick={openAdminSetup}
                className="px-4 py-2.5 rounded-full border border-dashed border-slate-300 bg-white/80 text-slate-600 hover:border-indigo-500 hover:text-indigo-700 transition-all flex items-center gap-2.5 group w-fit"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 text-slate-500 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                  <ShieldEllipsis size={14} />
                </div>
                <div className="min-w-0">
                  <div className="font-black text-[10px] uppercase tracking-[0.18em] leading-none">Setup Admin</div>
                </div>
                <Plus size={14} />
              </button>
              }
           </div>}

		           <div className={`${isSetupView ? 'lg:col-span-8' : ''} bg-white rounded-[2.2rem] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-right-8 duration-700 border border-indigo-100 flex flex-col h-auto`}>
		              <div className="p-6 md:p-8 bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 text-white relative overflow-hidden">
		                 <div className="absolute top-0 right-0 p-4 opacity-20"><Database size={140} /></div>
                 <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                   <div className="flex items-center gap-4">
	                      <div className="w-14 h-14 bg-white/20 backdrop-blur-xl rounded-[1.2rem] flex items-center justify-center border border-white/30 shadow-2xl"><span className="text-white font-black text-3xl italic">H</span></div>
                      <div className="h-10 w-px bg-white/10 hidden md:block"></div>
	                      <div className="flex flex-col">
	                        <span className="text-[10px] font-black uppercase tracking-[0.35em] text-cyan-100">Hulio Group V5</span>
	                        <span className="text-xl md:text-2xl font-black tracking-tighter uppercase leading-none mt-1">Authentication</span>
	                      </div>
	                   </div>
	                   <div className="flex flex-col items-start md:items-end">
                      {!isSetupView && !isEnvLockedWorkspace && (
                        <button
                          type="button"
                          onClick={() => setLoginView('setup')}
                          className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 border border-white/30 text-white text-[10px] font-black uppercase tracking-[0.16em] transition-all"
                        >
                          Pengaturan Koneksi
                        </button>
                      )}
                      {isSetupView && (
	                      <div className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl border backdrop-blur-md transition-all ${isLocalActive ? 'bg-white/15 border-white/20' : 'bg-emerald-400/20 border-emerald-200/40'}`}>
	                         {isLocalActive ? <HardDrive size={14} className="text-white"/> : <Store size={14} className="text-emerald-100"/>}
	                         <span className="text-[10px] font-black text-white uppercase tracking-widest">{isLocalActive ? 'Local DB' : currentActiveDbLabel}</span>
	                         {!isLocalActive && isSyncing && <RefreshCw size={10} className="animate-spin text-emerald-400"/>}
	                      </div>
                      )}
	                      <span className="text-[7px] font-bold text-slate-500 uppercase tracking-[0.18em] mt-2 ml-1 md:ml-0">{isLocalActive ? 'Sistem Siap Digunakan' : `${currentActiveRegion} Workspace`}</span>
	                   </div>
	                 </div>
	              </div>

	              <div className="p-6 md:p-8 space-y-6">
                {isSetupView && (
		                 <div className={`rounded-[1.4rem] border px-4 py-3 flex items-start gap-3 ${isLocalActive ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
	                    {isLocalActive ? <HardDrive size={16} className="shrink-0 mt-0.5" /> : <MapPin size={16} className="shrink-0 mt-0.5" />}
	                    <div>
                      <div className="font-black text-[10px] uppercase tracking-[0.2em]">{isLocalActive ? 'Mode Lokal Aktif' : `Workspace ${currentActiveDbLabel}`}</div>
                      <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.14em] leading-relaxed">
                        {isLocalActive ? 'Cocok untuk toko tunggal, koneksi putus, atau perangkat kasir cadangan.' : `Terhubung ke region ${currentActiveRegion}. User cukup login tanpa perlu memasukkan URL server.`}
	                      </p>
	                    </div>
	                 </div>
                )}
	                 <form onSubmit={handleLogin} className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.18em] ml-1.5">Identitas Login</label>
                          <div className="relative group">
                             <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-600 transition-colors" size={18} />
                             <input type="text" required autoFocus className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-[1.2rem] focus:border-indigo-600 focus:bg-white outline-none font-black text-slate-800 transition-all shadow-inner text-sm" placeholder="ID AKUN" value={loginUsername} onChange={e => setLoginUsername(e.target.value)} />
                          </div>
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.18em] ml-1.5">Kata Sandi</label>
                          <div className="relative group">
                             <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-600 transition-colors" size={18} />
                             <input type="password" required className="w-full pl-14 pr-4 py-5 bg-slate-50 border-4 border-slate-100 rounded-[2rem] focus:border-indigo-600 focus:bg-white outline-none font-black text-slate-800 transition-all shadow-inner text-sm" placeholder="••••••••" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
                          </div>
                       </div>
                    </div>
                    {loginError && (<div className="p-3.5 bg-red-50 text-red-600 rounded-[1.2rem] border border-red-100 font-black uppercase text-[10px] flex items-center gap-3"><AlertCircle size={16}/> {loginError}</div>)}
	                    <button type="submit" className="w-full py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 text-white rounded-[1.35rem] font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-indigo-200/70 hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-3">Masuk Dashboard <ChevronRight size={18}/></button>
                 </form>
                {isSetupView && (
	                 <div className="flex items-center gap-3 px-1">
	                    <div className="flex-1 h-px bg-slate-100"></div>
	                    <div className="flex items-center gap-2"><ShieldCheck size={12} className="text-slate-300"/><span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.16em]">Encrypted Session Active</span></div>
	                    <div className="flex-1 h-px bg-slate-100"></div>
	                 </div>
                )}
                {isSetupView && (
	                 <div className="flex items-center justify-between gap-3 border border-slate-100 rounded-[1.1rem] px-3 py-2 bg-slate-50/80">
	                    <div className="min-w-0">
	                      <div className="text-[9px] font-black text-slate-500 uppercase tracking-[0.18em]">Mode Lokal</div>
                      <div className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.14em] mt-1">Gunakan hanya saat offline atau perangkat cadangan</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setLoginAccessMode('local');
                        setShowCloudSelector(false);
                        switchDb({ enabled: false, storeId: 'local_offline', displayName: 'Local Workspace', region: 'Offline' });
                      }}
                      className={`shrink-0 inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 transition-all ${isLocalActive ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center ${isLocalActive ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                        <CheckCircle2 size={10} />
                      </span>
	                      <span className="text-[9px] font-black uppercase tracking-[0.16em]">{isLocalActive ? 'Aktif' : 'Pakai Lokal'}</span>
	                    </button>
	                 </div>
                )}
	              </div>
	           </div>
        </div>

        {showAdminUnlock && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[190] flex items-center justify-center p-4">
             <div className="bg-white w-full max-w-md rounded-[2rem] p-6 shadow-2xl border-8 border-slate-100 relative overflow-hidden">
                <button onClick={closeAdminSetup} className="absolute top-5 right-5 p-3 bg-slate-50 rounded-full text-slate-400 hover:bg-red-500 hover:text-white transition-all shadow-sm z-50"><X size={18}/></button>
                <div className="flex flex-col items-center text-center mb-6">
                   <div className="w-14 h-14 bg-slate-100 text-slate-700 rounded-[1.2rem] flex items-center justify-center mb-4 shadow-inner"><ShieldEllipsis size={26}/></div>
                   <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Verifikasi Admin</h3>
                   <p className="mt-2 text-[10px] font-bold text-slate-500 uppercase tracking-[0.16em]">Setup server dan recovery hanya untuk akun admin</p>
                </div>
                <form onSubmit={handleAdminUnlock} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.18em] ml-1.5">Username Admin</label>
                    <input
                      type="text"
                      className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-[1.1rem] font-black text-xs text-slate-800 focus:border-indigo-600 outline-none shadow-inner"
                      placeholder="admin"
                      value={adminUnlockUsername}
                      onChange={e => setAdminUnlockUsername(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.18em] ml-1.5">Password Admin</label>
                    <input
                      type="password"
                      className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-[1.1rem] font-black text-xs text-slate-800 focus:border-indigo-600 outline-none shadow-inner"
                      placeholder="Password admin"
                      value={adminUnlockPassword}
                      onChange={e => setAdminUnlockPassword(e.target.value)}
                    />
                  </div>
                  {adminUnlockError && (
                    <div className="p-3 bg-red-50 text-red-600 rounded-[1rem] border border-red-100 font-black uppercase text-[10px] flex items-center gap-2.5">
                      <AlertCircle size={14} /> {adminUnlockError}
                    </div>
                  )}
                  <button type="submit" className="w-full py-4 bg-slate-950 text-white font-black rounded-[1.35rem] uppercase tracking-[0.18em] text-sm hover:bg-slate-900 shadow-xl border-b-4 border-slate-900 active:scale-95 transition-all">
                    Buka Setup Admin
                  </button>
                </form>
             </div>
          </div>
        )}

        {showAddDb && (
          <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-2xl z-[200] flex items-center justify-center p-4">
             <div className="bg-white w-full max-w-lg rounded-[2.4rem] p-6 md:p-8 shadow-2xl animate-in zoom-in-95 duration-500 border-8 border-slate-100 relative overflow-hidden">
                <button onClick={closeAdminSetup} className="absolute top-5 right-5 p-3 bg-slate-50 rounded-full text-slate-400 hover:bg-red-500 hover:text-white transition-all shadow-sm z-50"><X size={18}/></button>
                <div className="flex flex-col items-center text-center mb-6">
                   <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-[1.2rem] flex items-center justify-center mb-4 shadow-inner"><CloudLightning size={28}/></div>
                   <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Setup Cloud</h3>
                   <div className="flex mt-5 bg-slate-100 p-1.5 rounded-[1.1rem] border border-slate-200 w-full">
                      <button onClick={() => setAddDbMode('code')} className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.18em] transition-all flex items-center justify-center gap-2 ${addDbMode === 'code' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400'}`}><QrCode size={16}/> Kode</button>
                      <button onClick={() => setAddDbMode('manual')} className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.18em] transition-all flex items-center justify-center gap-2 ${addDbMode === 'manual' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400'}`}><Terminal size={16}/> Manual</button>
                   </div>
                </div>
                {addDbMode === 'code' ? (
                  <form onSubmit={handleAddActivationCode} className="space-y-5 animate-in slide-in-from-left duration-500">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.18em] ml-1.5">Input Kode Aktivasi</label>
                       <textarea rows={5} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-[1.2rem] font-mono text-[11px] text-slate-800 focus:border-indigo-600 outline-none shadow-inner resize-none break-all" placeholder="Paste kode aktivasi base64..." value={activationCodeInput} onChange={e => setActivationCodeInput(e.target.value)} />
                       <div className="p-3 bg-blue-50/50 rounded-[1.1rem] border border-blue-100 flex items-start gap-3"><Info size={14} className="text-blue-500 shrink-0 mt-0.5"/><p className="text-[10px] font-bold text-blue-600 uppercase leading-relaxed">Hubungi admin IT untuk mendapatkan kode akses workspace.</p></div>
                    </div>
                    <button type="submit" className="w-full py-4 bg-indigo-600 text-white font-black rounded-[1.35rem] uppercase tracking-[0.18em] text-sm hover:bg-indigo-700 shadow-xl border-b-4 border-indigo-900 active:scale-95 transition-all">Aktivasi Node</button>
                  </form>
                ) : (
                  <form onSubmit={handleAddManualDb} className="space-y-4 animate-in slide-in-from-right duration-500">
                    <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.18em] ml-1.5">Nama Lokasi</label><input className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-[1.1rem] font-black text-xs text-slate-800 focus:border-indigo-600 outline-none shadow-inner" placeholder="Bekasi Barat" value={newDbForm.displayName} onChange={e => setNewDbForm({...newDbForm, displayName: e.target.value})} /></div>
                    <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.18em] ml-1.5">Region / Cluster</label><input className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-[1.1rem] font-black text-xs text-slate-800 focus:border-indigo-600 outline-none shadow-inner" placeholder="Bekasi / Sumatra / Pusat" value={newDbForm.region} onChange={e => setNewDbForm({...newDbForm, region: e.target.value})} /></div>
                    <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.18em] ml-1.5">Workspace ID</label><input className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-[1.1rem] font-black text-xs text-slate-800 focus:border-indigo-600 outline-none shadow-inner" placeholder="toko_pusat" value={newDbForm.storeId} onChange={e => setNewDbForm({...newDbForm, storeId: e.target.value.toLowerCase().replace(/\s+/g, '_')})} /></div>
                    <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.18em] ml-1.5">Supabase URL</label><input className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-[1.1rem] font-black text-xs text-slate-800 focus:border-indigo-600 outline-none shadow-inner" placeholder="https://xxxxx.supabase.co" value={newDbForm.supabaseUrl} onChange={e => setNewDbForm({...newDbForm, supabaseUrl: e.target.value})} /></div>
                    <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.18em] ml-1.5">Supabase Anon Key</label><input type="password" className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-[1.1rem] font-black text-xs text-slate-800 focus:border-indigo-600 outline-none shadow-inner" placeholder="eyJ..." value={newDbForm.supabaseAnonKey} onChange={e => setNewDbForm({...newDbForm, supabaseAnonKey: e.target.value})} /></div>
                    <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.18em] ml-1.5">Supabase Bucket</label><input className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-[1.1rem] font-black text-xs text-slate-800 focus:border-indigo-600 outline-none shadow-inner" placeholder="erp-media" value={newDbForm.supabaseBucket} onChange={e => setNewDbForm({...newDbForm, supabaseBucket: e.target.value})} /></div>
                    <button type="submit" className="w-full py-4 bg-indigo-600 text-white font-black rounded-[1.35rem] uppercase tracking-[0.18em] text-sm hover:bg-indigo-700 shadow-xl border-b-4 border-indigo-900 active:scale-95 transition-all mt-2">Hubungkan Manual</button>
                  </form>
                )}
                <div className="mt-5 rounded-[1.1rem] border border-slate-200 bg-slate-50 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setShowRecoveryPanel(current => !current)}
                    className="w-full flex items-center justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] font-black text-slate-700 uppercase tracking-[0.18em]">Recovery Lanjutan</div>
                      <p className="mt-1 text-[10px] font-bold text-slate-500 leading-relaxed">
                        Buka hanya jika benar-benar perlu reset user workspace aktif.
                      </p>
                    </div>
                    <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${showRecoveryPanel ? 'rotate-180' : ''}`} />
                  </button>
                  {showRecoveryPanel && (
                    <div className="mt-4 rounded-[1rem] border border-amber-200 bg-amber-50 px-4 py-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-black text-amber-700 uppercase tracking-[0.18em]">Zona Berisiko</div>
                          <p className="mt-1 text-[10px] font-bold text-amber-600 leading-relaxed">
                            Tindakan ini akan mengganti user workspace aktif menjadi default `admin / 123`, `kasir / 123`, dan `gudang / 123`.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-amber-700 uppercase tracking-[0.18em]">Ketik Workspace ID Aktif</label>
                        <input
                          type="text"
                          className="w-full p-3 bg-white border border-amber-200 rounded-[0.9rem] font-black text-[11px] text-slate-800 outline-none focus:border-amber-400"
                          placeholder={getCloudConfig().storeId || 'local_offline'}
                          value={recoveryWorkspaceInput}
                          onChange={e => setRecoveryWorkspaceInput(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-amber-700 uppercase tracking-[0.18em]">Ketik Frasa Konfirmasi</label>
                        <input
                          type="text"
                          className="w-full p-3 bg-white border border-amber-200 rounded-[0.9rem] font-black text-[11px] text-slate-800 outline-none focus:border-amber-400"
                          placeholder="RESET USERS"
                          value={recoveryPhraseInput}
                          onChange={e => setRecoveryPhraseInput(e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleResetWorkspaceUsers}
                        className="w-full py-3 rounded-[1rem] border border-amber-200 bg-white text-amber-700 font-black text-[10px] uppercase tracking-[0.18em] hover:bg-amber-100 transition-all"
                      >
                        Jalankan Reset User Workspace
                      </button>
                    </div>
                  )}
                </div>
             </div>
          </div>
        )}
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
      return <Settings onCloudConfigChange={() => { setIsCloudActive(hasCloudConfig()); setSavedDbs(getCloudProfiles()); handleManualRefresh(true); }} onExportBackup={exportBackup} onImportBackup={importBackup} />;
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
      case 'accounting': return <Accounting accounts={accounts} />;
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
      {renderContent()}
    </Layout>
  );
};

export default App;
