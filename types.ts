
export enum UnitType {
  DUS = 'Dus',
  PAK = 'Pak',
  RENTENG = 'Renteng',
  PCS = 'Pcs'
}

export enum UserRole {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  SUPERVISOR = 'SUPERVISOR',
  WAREHOUSE = 'WAREHOUSE',
  KASIR = 'KASIR'
}

export type PermissionKey =
  | 'dashboard.view'
  | 'item.view'
  | 'item.create'
  | 'item.edit'
  | 'item.delete'
  | 'contact.view'
  | 'contact.create'
  | 'contact.edit'
  | 'contact.delete'
  | 'sale.create'
  | 'sale.view'
  | 'sale.void'
  | 'return.create'
  | 'return.approve'
  | 'purchase.view'
  | 'purchase.create'
  | 'purchase.receive'
  | 'purchase.pay'
  | 'stock.view'
  | 'stock.adjust'
  | 'stock.opname'
  | 'accounting.view'
  | 'report.view'
  | 'user.view'
  | 'user.manage'
  | 'settings.manage'
  | 'ai.use';

export interface SessionPolicy {
  maxOfflineMinutes: number;
  requireReauthForSensitiveAction: boolean;
}

export interface UserSchedule {
  enabled: boolean;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
}

export interface User {
  id: string;
  name: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  permissions: PermissionKey[];
  schedule: UserSchedule;
  isActive: boolean;
  lastLoginAt?: string;
  sessionPolicy?: SessionPolicy;
  updatedAt?: string;
}

export interface Unit {
  name: string;
  conversion: number;
  price: number;
}

export interface BundleComponent {
  itemId: string;
  name: string;
  qty: number;
  basePrice: number;
}

export interface Item {
  id: string;
  code: string;
  barcode: string;
  name: string;
  category: string;
  brand: string;
  basePrice: number;
  memberPrices: number[]; // Level 1, 2, 3, 4
  units: Unit[];
  stock: number;
  warehouseId: string;
  reorderLevel?: number;
  isActive?: boolean;
  imageUrl?: string;
  isBundle?: boolean;
  components?: BundleComponent[];
  /** Waktu perubahan terakhir (dipakai untuk merge sinkronisasi antar perangkat). */
  updatedAt?: string;
  /** Waktu perubahan per kelompok field: base (data master), stock, price. */
  fieldUpdatedAt?: Partial<Record<'base' | 'stock' | 'price', string>>;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  creditLimit: number;
  currentDebt: number;
  level: number; // Support levels 1 - 4
  rewardPoints?: number; // Accumulate loyalty points
  updatedAt?: string;
  /** Waktu perubahan per kelompok field: base (profil) dan balance (piutang/poin). */
  fieldUpdatedAt?: Partial<Record<'base' | 'balance', string>>;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  address: string;
  updatedAt?: string;
}

export interface PurchaseOrderItem {
  itemId: string;
  name: string;
  orderedQty: number;
  receivedQty: number;
  cost: number;
}

export interface PurchaseOrder {
  id: string;
  date: string; // Order Date
  dueDate: string; // Calculated: Date + TOP
  termOfPayment: number; // in days
  discount: number; // overall percentage
  supplierId: string;
  supplierName: string;
  items: PurchaseOrderItem[];
  subtotal: number;
  total: number; // after discount
  status: 'PENDING' | 'RECEIVED' | 'CANCELLED';
  isPaid: boolean;
  paidAmount?: number;
  paymentNotes?: string[];
  updatedAt?: string;
}

export interface SaleItem {
  itemId: string;
  name: string;
  /** Jumlah dalam satuan dasar (dipakai untuk stok & retur). */
  qty: number;
  /** Harga per satuan dasar. */
  price: number;
  /** Harga pokok per satuan dasar saat transaksi terjadi. Jangan dihitung ulang dari master barang. */
  costPrice?: number;
  total: number;
  /** Satuan yang dijual, mis. "Dus (12)". Kosong = satuan dasar. */
  unitName?: string;
  /** Jumlah dalam satuan yang dijual (mis. 2 Dus). */
  unitQty?: number;
  /** Harga per satuan yang dijual. */
  unitPrice?: number;
  /** Isi satuan yang dijual dalam satuan dasar (mis. 12). */
  conversion?: number;
  /** Barang paket: stok komponen yang dikurangi oleh baris ini (total, satuan dasar). */
  components?: { itemId: string; name: string; qty: number }[];
}

export interface Sale {
  id: string;
  invoiceNo: string;
  date: string;
  createdAt?: string;
  customerId: string;
  customerName: string;
  items: SaleItem[];
  subtotal: number;
  tax: number;
  total: number;
  discountAmount?: number;
  promoName?: string;
  pointsUsed?: number;
  pointsEarned?: number;
  paymentType: 'TUNAI' | 'NON-TUNAI' | 'KREDIT';
  paymentMethod?: string;
  amountReceived: number;
  changeAmount: number;
  operatorName: string;
  operatorId?: string;
  status?: 'COMPLETED' | 'VOID';
  cashSessionId?: string;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
  updatedAt?: string;
}

export interface ReturnItem {
  itemId: string;
  name: string;
  qty: number;
  price: number;
  reason: string;
}

export interface SaleReturn {
  id: string;
  returnNo: string;
  originalInvoiceNo: string;
  date: string;
  createdAt?: string;
  customerId: string;
  customerName: string;
  items: ReturnItem[];
  totalReturn: number;
  operatorName: string;
  operatorId?: string;
  status?: 'PENDING' | 'APPROVED';
  approvedAt?: string;
  approvedBy?: string;
  /** Shift kasir tempat uang refund dikeluarkan (diisi saat retur disetujui). */
  cashSessionId?: string;
  updatedAt?: string;
}

export interface Warehouse {
  id: string;
  name: string;
  location: string;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  isHeadOffice: boolean;
  updatedAt?: string;
}

export interface Account {
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  balance: number;
  updatedAt?: string;
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  itemName: string;
  type: 'SALE' | 'RETURN' | 'PURCHASE_RECEIPT' | 'STOCK_OPNAME' | 'SALE_VOID';
  direction: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  previousStock: number;
  newStock: number;
  referenceNo: string;
  note?: string;
  warehouseId: string;
  operatorName: string;
  operatorId?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action:
    | 'LOGIN_SUCCESS'
    | 'LOGIN_FAILED'
    | 'USER_CREATED'
    | 'USER_UPDATED'
    | 'USER_DELETED'
    | 'ITEM_CREATED'
    | 'ITEM_UPDATED'
    | 'ITEM_DELETED'
    | 'SALE_COMPLETED'
    | 'SALE_VOIDED'
    | 'RETURN_COMPLETED'
    | 'PO_CREATED'
    | 'PO_RECEIVED'
    | 'PO_PAID'
    | 'STOCK_ADJUSTED'
    | 'PRICE_CHANGED'
    | 'CUSTOMER_PAYMENT'
    | 'SYNC_PUSH'
    | 'SYNC_PULL'
    | 'SETTINGS_UPDATED';
  actorId?: string;
  actorName: string;
  entityType: 'AUTH' | 'USER' | 'ITEM' | 'SALE' | 'RETURN' | 'PURCHASE_ORDER' | 'INVENTORY' | 'SYNC' | 'SETTINGS' | 'CUSTOMER';
  entityId?: string;
  entityLabel?: string;
  details: string;
  createdAt: string;
}

export interface CashSession {
  id: string;
  userId: string;
  userName: string;
  openedAt: string;
  closedAt?: string;
  openingCash: number;
  closingCash?: number;
  expectedCash?: number;
  nonCashSales?: number;
  creditSales?: number;
  cashRefunds?: number;
  cashExpenses?: number;
  shortageOrOverage?: number;
  closingNotes?: string;
  customerCashPayments?: number;
  status: 'OPEN' | 'CLOSED';
  updatedAt?: string;
}

export interface CashExpense {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  createdAt: string;
  operatorId?: string;
  operatorName: string;
  cashSessionId?: string;
}

export interface PaymentRecord {
  id: string;
  referenceNo: string;
  referenceType: 'SALE' | 'PURCHASE_ORDER' | 'RETURN' | 'CUSTOMER_PAYMENT';
  amount: number;
  method: string;
  direction: 'IN' | 'OUT';
  createdAt: string;
  operatorName: string;
  operatorId?: string;
  customerId?: string;
  cashSessionId?: string;
  note?: string;
}

export interface PromotionCampaign {
  id: string;
  name: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  minCustomerLevel?: number;
  startAt: string;
  endAt?: string;
  isActive: boolean;
  createdBy?: string;
  notes?: string;
  updatedAt?: string;
}

export type PriceChangeSource = 'MANUAL' | 'BULK' | 'MARGIN' | 'IMPORT' | 'AI' | 'AI_UNDO' | 'PURCHASE' | 'COST_REVIEW';

/** Riwayat perubahan harga per barang — membantu owner melacak harga yang cepat berubah. */
export interface PriceChangeLog {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  oldBasePrice: number;
  newBasePrice: number;
  oldMemberPrices: number[];
  newMemberPrices: number[];
  source: PriceChangeSource;
  note?: string;
  operatorId?: string;
  operatorName: string;
  createdAt: string;
}

/** Penanda data yang dihapus, agar tidak "hidup lagi" saat sinkronisasi antar perangkat. */
export interface DeletedRecord {
  collection: string;
  id: string;
  deletedAt: string;
}

export interface StoreProfile {
  name: string;
  address?: string;
  phone?: string;
  receiptFooter?: string;
  updatedAt?: string;
}

export interface AIPriceUpdateDraft {
  itemId: string;
  itemName: string;
  itemCode: string;
  oldBasePrice: number;
  newBasePrice: number;
  oldMemberPrices: number[];
  newMemberPrices: number[];
  reason?: string;
}

export interface AIUndoEntry {
  id: string;
  actionType: 'PRICE_UPDATE' | 'PROMO_CREATE' | 'PO_CREATE';
  label: string;
  createdAt: string;
  payload: any;
}

export interface MediaAsset {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  supplierName?: string;
  effectiveDate?: string;
  category?: 'PRICE_LIST' | 'INVOICE' | 'CATALOG' | 'PROMO' | 'OTHER';
  notes?: string;
  extractedText?: string;
  sourceType: 'supabase' | 'local';
  storagePath?: string;
  signedUrl?: string;
  useAsKnowledge?: boolean;
}

export interface InventoryLog {
  id: string;
  itemId: string;
  itemName: string;
  previousStock?: number;
  systemStock?: number;
  actualStock: number;
  difference?: number;
  date?: string;
  notes: string;
  operatorName?: string;
  operatorId?: string;
  createdAt?: string;
  status?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  actions?: any[];
}

export interface AppData {
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
  mediaAssets?: MediaAsset[];
  aiUndoStack?: AIUndoEntry[];
  branches: Branch[];
  aiConsultantHistory: ChatMessage[];
  floatingChatHistory: ChatMessage[];
  priceHistory?: PriceChangeLog[];
  deletedRecords?: DeletedRecord[];
  storeProfile?: StoreProfile;
  openRouterApiKey?: string;
  aiModel?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseBucket?: string;
}
