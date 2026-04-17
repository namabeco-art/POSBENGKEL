import { create } from 'zustand';
import { 
  AppData, User, Item, Customer, Supplier, Account, PurchaseOrder, 
  Sale, SaleReturn, InventoryMovement, AuditLog, CashSession, PaymentRecord, PromotionCampaign, 
  MediaAsset, AIUndoEntry, Branch 
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
  inventoryLogs: any[];
  inventoryMovements: InventoryMovement[];
  auditLogs: AuditLog[];
  cashSessions: CashSession[];
  paymentRecords: PaymentRecord[];
  promotions: PromotionCampaign[];
  mediaAssets: MediaAsset[];
  aiUndoStack: AIUndoEntry[];
  branches: Branch[];
  aiConsultantHistory: any[];
  floatingChatHistory: any[];

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
  setAiConsultantHistory: (history: any[] | ((prev: any[]) => any[])) => void;
  setFloatingChatHistory: (history: any[] | ((prev: any[]) => any[])) => void;
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
      openRouterApiKey: data.openRouterApiKey || prev.openRouterApiKey,
      aiModel: data.aiModel || prev.aiModel,
      supabaseUrl: data.supabaseUrl || prev.supabaseUrl,
      supabaseAnonKey: data.supabaseAnonKey || prev.supabaseAnonKey,
      supabaseBucket: data.supabaseBucket || prev.supabaseBucket,
    };
  }),

  appendAuditLog: (log) => set((state) => ({
    auditLogs: [log, ...state.auditLogs].slice(0, 500)
  })),

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
