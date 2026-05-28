import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';
import { 
  AppData, User, Item, Customer, Supplier, Account, PurchaseOrder, 
  Sale, SaleReturn, InventoryMovement, AuditLog, CashSession, PaymentRecord, PromotionCampaign, 
  MediaAsset, AIUndoEntry, Branch, InventoryLog, ChatMessage
} from './types';
import { 
  mockUsers, mockItems, mockCustomers, mockSuppliers, mockAccounts, 
  mockBranches, mockPromotions 
} from './store';
import { validateUniqueItem } from './services/posOperations';

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
  paymentRecords: PaymentRecord[];
  promotions: PromotionCampaign[];
  mediaAssets: MediaAsset[];
  aiUndoStack: AIUndoEntry[];
  branches: Branch[];
  aiConsultantHistory: ChatMessage[];
  floatingChatHistory: ChatMessage[];

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
  setPaymentRecords: (records: PaymentRecord[] | ((prev: PaymentRecord[]) => PaymentRecord[])) => void;
  setAccounts: (accounts: Account[] | ((prev: Account[]) => Account[])) => void;
  setAiUndoStack: (stack: AIUndoEntry[] | ((prev: AIUndoEntry[]) => AIUndoEntry[])) => void;
  setPromotions: (promos: PromotionCampaign[] | ((prev: PromotionCampaign[]) => PromotionCampaign[])) => void;
  setMediaAssets: (assets: MediaAsset[] | ((prev: MediaAsset[]) => MediaAsset[])) => void;
  setAiConsultantHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setFloatingChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
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
  paymentRecords: [],
  promotions: mockPromotions,
  mediaAssets: [],
  aiUndoStack: [],
  branches: mockBranches,
  aiConsultantHistory: [],
  floatingChatHistory: [],

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
      paymentRecords: Array.isArray(data.paymentRecords) ? data.paymentRecords : prev.paymentRecords,
      promotions: Array.isArray((data as any).promotions) ? (data as any).promotions : prev.promotions,
      mediaAssets: Array.isArray((data as any).mediaAssets) ? (data as any).mediaAssets : prev.mediaAssets,
      aiUndoStack: Array.isArray((data as any).aiUndoStack) ? (data as any).aiUndoStack : prev.aiUndoStack,
      aiConsultantHistory: Array.isArray(data.aiConsultantHistory) ? data.aiConsultantHistory : prev.aiConsultantHistory,
      floatingChatHistory: Array.isArray(data.floatingChatHistory) ? data.floatingChatHistory : prev.floatingChatHistory,
      branches: Array.isArray((data as any).branches) ? (data as any).branches : prev.branches,
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
    if (newLogs.length > 2000) {
      try {
        const archiveKey = 'HGROUP_AUDIT_ARCHIVE';
        const existing = JSON.parse(localStorage.getItem(archiveKey) || '[]');
        const toArchive = newLogs.slice(2000);
        const archived = [...toArchive, ...existing].slice(0, 10000);
        localStorage.setItem(archiveKey, JSON.stringify(archived));
      } catch {
        // localStorage full — silently skip archival
      }
    }
    return { auditLogs: newLogs.slice(0, 2000) };
  }),

  // Basic Setters with generic functional update support
  setUsers: (updater) => set((state) => ({ users: typeof updater === 'function' ? updater(state.users) : updater })),
  setItems: (updater) => set((state) => ({ items: typeof updater === 'function' ? updater(state.items) : updater })),
  setCustomers: (updater) => set((state) => ({ customers: typeof updater === 'function' ? updater(state.customers) : updater })),
  setSuppliers: (updater) => set((state) => ({ suppliers: typeof updater === 'function' ? updater(state.suppliers) : updater })),
  setPurchaseOrders: (updater) => set((state) => ({ purchaseOrders: typeof updater === 'function' ? updater(state.purchaseOrders) : updater })),
  setSales: (updater) => set((state) => ({ sales: typeof updater === 'function' ? updater(state.sales) : updater })),
  setReturns: (updater) => set((state) => ({ returns: typeof updater === 'function' ? updater(state.returns) : updater })),
  setInventoryMovements: (updater) => set((state) => ({ inventoryMovements: typeof updater === 'function' ? updater(state.inventoryMovements) : updater })),
  setCashSessions: (updater) => set((state) => ({ cashSessions: typeof updater === 'function' ? updater(state.cashSessions) : updater })),
  setPaymentRecords: (updater) => set((state) => ({ paymentRecords: typeof updater === 'function' ? updater(state.paymentRecords) : updater })),
  setAccounts: (updater) => set((state) => ({ accounts: typeof updater === 'function' ? updater(state.accounts) : updater })),
  setAiUndoStack: (updater) => set((state) => ({ aiUndoStack: typeof updater === 'function' ? updater(state.aiUndoStack) : updater })),
  setPromotions: (updater) => set((state) => ({ promotions: typeof updater === 'function' ? updater(state.promotions) : updater })),
  setMediaAssets: (updater) => set((state) => ({ mediaAssets: typeof updater === 'function' ? updater(state.mediaAssets) : updater })),
  setAiConsultantHistory: (updater) => set((state) => ({ aiConsultantHistory: typeof updater === 'function' ? updater(state.aiConsultantHistory) : updater })),
  setFloatingChatHistory: (updater) => set((state) => ({ floatingChatHistory: typeof updater === 'function' ? updater(state.floatingChatHistory) : updater })),
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
export const usePaymentRecords = () => useAppStore(state => state.paymentRecords);
export const usePromotions = () => useAppStore(state => state.promotions);
export const useMediaAssets = () => useAppStore(state => state.mediaAssets);
export const useAccounts = () => useAppStore(state => state.accounts);
export const useBranches = () => useAppStore(state => state.branches);
export const useAiUndoStack = () => useAppStore(state => state.aiUndoStack);
export const useAiConsultantHistory = () => useAppStore(state => state.aiConsultantHistory);
export const useFloatingChatHistory = () => useAppStore(state => state.floatingChatHistory);

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
  setPaymentRecords: state.setPaymentRecords,
  setAccounts: state.setAccounts,
  setAiUndoStack: state.setAiUndoStack,
  setPromotions: state.setPromotions,
  setMediaAssets: state.setMediaAssets,
  setAiConsultantHistory: state.setAiConsultantHistory,
  setFloatingChatHistory: state.setFloatingChatHistory,
}));
