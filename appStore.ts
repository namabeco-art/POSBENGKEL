import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';
import { 
  AppData, User, Item, Customer, Supplier, Account, PurchaseOrder, 
  Sale, SaleReturn, InventoryMovement, AuditLog, CashSession, PaymentRecord, PromotionCampaign, 
  MediaAsset, AIUndoEntry, Branch, InventoryLog, ChatMessage, CashExpense, PriceChangeLog, DeletedRecord, StoreProfile
} from './types';
import { 
  mockUsers, mockItems, mockCustomers, mockSuppliers, mockAccounts, 
  mockBranches, mockPromotions 
} from './store';
import { CUSTOMER_FIELD_GROUPS, ITEM_FIELD_GROUPS, stampCollection, stampEntity } from './services/syncMeta';
import { AUDIT_LOG_LIMIT, DELETED_RECORDS_LIMIT } from './services/mergeService';
import { PRICE_HISTORY_LIMIT } from './services/pricing';

type Updater<T> = T | ((prev: T) => T);
const resolve = <T,>(updater: Updater<T>, prev: T): T =>
  typeof updater === 'function' ? (updater as (prev: T) => T)(prev) : updater;
const nowIso = () => new Date().toISOString();

export interface AppState extends AppData {
  // Application Data (from AppData)
  users: User[];
  items: Item[];
  customers: Customer[];
  suppliers: Supplier[];
  accounts: Account[];
  purchaseOrders: PurchaseOrder[];
  sales: Sale[];
  returns: SaleReturn[];
  inventoryLogs: InventoryLog[];
  inventoryMovements: InventoryMovement[];
  auditLogs: AuditLog[];
  cashSessions: CashSession[];
  cashExpenses: CashExpense[];
  paymentRecords: PaymentRecord[];
  promotions: PromotionCampaign[];
  mediaAssets: MediaAsset[];
  aiUndoStack: AIUndoEntry[];
  branches: Branch[];
  aiConsultantHistory: ChatMessage[];
  floatingChatHistory: ChatMessage[];
  priceHistory: PriceChangeLog[];
  deletedRecords: DeletedRecord[];
  storeProfile?: StoreProfile;

  // Config fields
  openRouterApiKey?: string;
  aiModel?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseBucket?: string;
  
  // Actions
  applyData: (data: Partial<AppData>) => void;
  appendAuditLog: (log: AuditLog) => void;
  
  setUsers: (users: User[] | ((prev: User[]) => User[])) => void;
  setItems: (items: Item[] | ((prev: Item[]) => Item[])) => void;
  setCustomers: (customers: Customer[] | ((prev: Customer[]) => Customer[])) => void;
  setSuppliers: (suppliers: Supplier[] | ((prev: Supplier[]) => Supplier[])) => void;
  setPurchaseOrders: (pos: PurchaseOrder[] | ((prev: PurchaseOrder[]) => PurchaseOrder[])) => void;
  setSales: (sales: Sale[] | ((prev: Sale[]) => Sale[])) => void;
  setReturns: (returns: SaleReturn[] | ((prev: SaleReturn[]) => SaleReturn[])) => void;
  setInventoryMovements: (movements: InventoryMovement[] | ((prev: InventoryMovement[]) => InventoryMovement[])) => void;
  setCashSessions: (sessions: CashSession[] | ((prev: CashSession[]) => CashSession[])) => void;
  setCashExpenses: (expenses: CashExpense[] | ((prev: CashExpense[]) => CashExpense[])) => void;
  setPaymentRecords: (records: PaymentRecord[] | ((prev: PaymentRecord[]) => PaymentRecord[])) => void;
  setAccounts: (accounts: Account[] | ((prev: Account[]) => Account[])) => void;
  setAiUndoStack: (stack: AIUndoEntry[] | ((prev: AIUndoEntry[]) => AIUndoEntry[])) => void;
  setPromotions: (promos: PromotionCampaign[] | ((prev: PromotionCampaign[]) => PromotionCampaign[])) => void;
  setMediaAssets: (assets: MediaAsset[] | ((prev: MediaAsset[]) => MediaAsset[])) => void;
  setAiConsultantHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setFloatingChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  appendPriceHistory: (logs: PriceChangeLog[]) => void;
  /** Catat penghapusan agar data tidak muncul lagi dari salinan perangkat lain saat sinkronisasi. */
  recordDeletion: (collection: string, ids: string[]) => void;
  setStoreProfile: (profile: StoreProfile) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  users: mockUsers,
  items: mockItems,
  customers: mockCustomers,
  suppliers: mockSuppliers,
  accounts: mockAccounts,
  purchaseOrders: [],
  sales: [],
  returns: [],
  inventoryLogs: [],
  inventoryMovements: [],
  auditLogs: [],
  cashSessions: [],
  cashExpenses: [],
  paymentRecords: [],
  promotions: mockPromotions,
  mediaAssets: [],
  aiUndoStack: [],
  branches: mockBranches,
  aiConsultantHistory: [],
  floatingChatHistory: [],
  priceHistory: [],
  deletedRecords: [],
  storeProfile: undefined,

  // Implement applyData logic
  applyData: (data) => set((prev) => {
    return {
      users: Array.isArray(data.users) ? data.users : prev.users,
      items: Array.isArray(data.items) ? data.items : prev.items,
      customers: Array.isArray(data.customers) ? data.customers : prev.customers,
      suppliers: Array.isArray(data.suppliers) ? data.suppliers : prev.suppliers,
      accounts: Array.isArray(data.accounts) ? data.accounts : prev.accounts,
      purchaseOrders: Array.isArray(data.purchaseOrders) ? data.purchaseOrders : prev.purchaseOrders,
      sales: Array.isArray(data.sales) ? data.sales : prev.sales,
      returns: Array.isArray(data.returns) ? data.returns : prev.returns,
      inventoryLogs: Array.isArray(data.inventoryLogs) ? data.inventoryLogs : prev.inventoryLogs,
      inventoryMovements: Array.isArray(data.inventoryMovements) ? data.inventoryMovements : prev.inventoryMovements,
      auditLogs: Array.isArray(data.auditLogs) ? data.auditLogs : prev.auditLogs,
      cashSessions: Array.isArray(data.cashSessions) ? data.cashSessions : prev.cashSessions,
      cashExpenses: Array.isArray(data.cashExpenses) ? data.cashExpenses : prev.cashExpenses,
      paymentRecords: Array.isArray(data.paymentRecords) ? data.paymentRecords : prev.paymentRecords,
      promotions: Array.isArray((data as any).promotions) ? (data as any).promotions : prev.promotions,
      mediaAssets: Array.isArray((data as any).mediaAssets) ? (data as any).mediaAssets : prev.mediaAssets,
      aiUndoStack: Array.isArray((data as any).aiUndoStack) ? (data as any).aiUndoStack : prev.aiUndoStack,
      aiConsultantHistory: Array.isArray(data.aiConsultantHistory) ? data.aiConsultantHistory : prev.aiConsultantHistory,
      floatingChatHistory: Array.isArray(data.floatingChatHistory) ? data.floatingChatHistory : prev.floatingChatHistory,
      branches: Array.isArray((data as any).branches) ? (data as any).branches : prev.branches,
      priceHistory: Array.isArray(data.priceHistory) ? data.priceHistory : prev.priceHistory,
      deletedRecords: Array.isArray(data.deletedRecords) ? data.deletedRecords : prev.deletedRecords,
      storeProfile: data.storeProfile && typeof data.storeProfile === 'object' ? data.storeProfile : prev.storeProfile,
      openRouterApiKey: data.openRouterApiKey || prev.openRouterApiKey,
      aiModel: data.aiModel || prev.aiModel,
      supabaseUrl: data.supabaseUrl || prev.supabaseUrl,
      supabaseAnonKey: data.supabaseAnonKey || prev.supabaseAnonKey,
      supabaseBucket: data.supabaseBucket || prev.supabaseBucket,
    };
  }),

  appendAuditLog: (log) => set((state) => {
    const newLogs = [log, ...state.auditLogs];
    // Archive older logs to localStorage before trimming
    if (newLogs.length > AUDIT_LOG_LIMIT) {
      try {
        const archiveKey = 'HGROUP_AUDIT_ARCHIVE';
        const existing = JSON.parse(localStorage.getItem(archiveKey) || '[]');
        const toArchive = newLogs.slice(AUDIT_LOG_LIMIT);
        const archived = [...toArchive, ...existing].slice(0, 10000);
        localStorage.setItem(archiveKey, JSON.stringify(archived));
      } catch {
        // localStorage full — silently skip archival
      }
    }
    return { auditLogs: newLogs.slice(0, AUDIT_LOG_LIMIT) };
  }),

  // Basic Setters with generic functional update support.
  // Koleksi yang bisa berubah diberi cap waktu agar merge antar perangkat tahu versi mana yang terbaru.
  setUsers: (updater) => set((state) => ({ users: stampCollection(state.users, resolve(updater, state.users), nowIso()) })),
  setItems: (updater) => set((state) => ({ items: stampCollection(state.items, resolve(updater, state.items), nowIso(), { groups: ITEM_FIELD_GROUPS }) })),
  setCustomers: (updater) => set((state) => ({ customers: stampCollection(state.customers, resolve(updater, state.customers), nowIso(), { groups: CUSTOMER_FIELD_GROUPS }) })),
  setSuppliers: (updater) => set((state) => ({ suppliers: stampCollection(state.suppliers, resolve(updater, state.suppliers), nowIso()) })),
  setPurchaseOrders: (updater) => set((state) => ({ purchaseOrders: stampCollection(state.purchaseOrders, resolve(updater, state.purchaseOrders), nowIso()) })),
  setSales: (updater) => set((state) => ({ sales: resolve(updater, state.sales) })),
  setReturns: (updater) => set((state) => ({ returns: stampCollection(state.returns, resolve(updater, state.returns), nowIso()) })),
  setInventoryMovements: (updater) => set((state) => ({ inventoryMovements: resolve(updater, state.inventoryMovements) })),
  setCashSessions: (updater) => set((state) => ({ cashSessions: stampCollection(state.cashSessions, resolve(updater, state.cashSessions), nowIso()) })),
  setCashExpenses: (updater) => set((state) => ({ cashExpenses: resolve(updater, state.cashExpenses) })),
  setPaymentRecords: (updater) => set((state) => ({ paymentRecords: resolve(updater, state.paymentRecords) })),
  setAccounts: (updater) => set((state) => ({ accounts: stampCollection(state.accounts, resolve(updater, state.accounts), nowIso(), { key: 'code' }) })),
  setAiUndoStack: (updater) => set((state) => ({ aiUndoStack: resolve(updater, state.aiUndoStack) })),
  setPromotions: (updater) => set((state) => ({ promotions: stampCollection(state.promotions, resolve(updater, state.promotions), nowIso()) })),
  setMediaAssets: (updater) => set((state) => ({ mediaAssets: resolve(updater, state.mediaAssets) })),
  setAiConsultantHistory: (updater) => set((state) => ({ aiConsultantHistory: resolve(updater, state.aiConsultantHistory) })),
  setFloatingChatHistory: (updater) => set((state) => ({ floatingChatHistory: resolve(updater, state.floatingChatHistory) })),
  appendPriceHistory: (logs) => {
    if (!logs.length) return;
    set((state) => ({ priceHistory: [...logs, ...state.priceHistory].slice(0, PRICE_HISTORY_LIMIT) }));
  },
  recordDeletion: (collection, ids) => {
    if (!ids.length) return;
    const deletedAt = nowIso();
    set((state) => ({
      deletedRecords: [...ids.map(id => ({ collection, id, deletedAt })), ...state.deletedRecords].slice(0, DELETED_RECORDS_LIMIT),
    }));
  },
  setStoreProfile: (profile) => set((state) => ({ storeProfile: stampEntity(state.storeProfile as any, profile as any, nowIso()) })),
}));


// ============================================================
// SELECTOR HOOKS — Use these instead of destructuring the entire store.
// Each selector only triggers re-render when its specific slice changes.
// ============================================================

/** Select multiple state slices with shallow comparison to prevent unnecessary re-renders */
export const useAppStoreShallow = <T>(selector: (state: AppState) => T): T =>
  useAppStore(useShallow(selector));

/** Common selectors for frequently accessed data */
export const useItems = () => useAppStore(state => state.items);
export const useUsers = () => useAppStore(state => state.users);
export const useCustomers = () => useAppStore(state => state.customers);
export const useSuppliers = () => useAppStore(state => state.suppliers);
export const useSales = () => useAppStore(state => state.sales);
export const useReturns = () => useAppStore(state => state.returns);
export const usePurchaseOrders = () => useAppStore(state => state.purchaseOrders);
export const useInventoryMovements = () => useAppStore(state => state.inventoryMovements);
export const useAuditLogs = () => useAppStore(state => state.auditLogs);
export const useCashSessions = () => useAppStore(state => state.cashSessions);
export const useCashExpenses = () => useAppStore(state => state.cashExpenses);
export const usePaymentRecords = () => useAppStore(state => state.paymentRecords);
export const usePromotions = () => useAppStore(state => state.promotions);
export const useMediaAssets = () => useAppStore(state => state.mediaAssets);
export const useAccounts = () => useAppStore(state => state.accounts);
export const useBranches = () => useAppStore(state => state.branches);
export const useAiUndoStack = () => useAppStore(state => state.aiUndoStack);
export const useAiConsultantHistory = () => useAppStore(state => state.aiConsultantHistory);
export const useFloatingChatHistory = () => useAppStore(state => state.floatingChatHistory);
export const usePriceHistory = () => useAppStore(state => state.priceHistory);

/** Action-only selectors (never cause re-renders from data changes) */
export const useAppActions = () => useAppStoreShallow(state => ({
  applyData: state.applyData,
  appendAuditLog: state.appendAuditLog,
  setUsers: state.setUsers,
  setItems: state.setItems,
  setCustomers: state.setCustomers,
  setSuppliers: state.setSuppliers,
  setPurchaseOrders: state.setPurchaseOrders,
  setSales: state.setSales,
  setReturns: state.setReturns,
  setInventoryMovements: state.setInventoryMovements,
  setCashSessions: state.setCashSessions,
  setCashExpenses: state.setCashExpenses,
  setPaymentRecords: state.setPaymentRecords,
  setAccounts: state.setAccounts,
  setAiUndoStack: state.setAiUndoStack,
  setPromotions: state.setPromotions,
  setMediaAssets: state.setMediaAssets,
  setAiConsultantHistory: state.setAiConsultantHistory,
  setFloatingChatHistory: state.setFloatingChatHistory,
  appendPriceHistory: state.appendPriceHistory,
  recordDeletion: state.recordDeletion,
  setStoreProfile: state.setStoreProfile,
}));
