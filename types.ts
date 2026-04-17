
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
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  address: string;
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
}

export interface SaleItem {
  itemId: string;
  name: string;
  qty: number;
  price: number;
  total: number;
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
}

export interface Account {
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  balance: number;
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  itemName: string;
  type: 'SALE' | 'RETURN' | 'PURCHASE_RECEIPT' | 'STOCK_OPNAME';
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
    | 'RETURN_COMPLETED'
    | 'PO_CREATED'
    | 'PO_RECEIVED'
    | 'PO_PAID'
    | 'STOCK_ADJUSTED'
    | 'SYNC_PUSH'
    | 'SYNC_PULL'
    | 'SETTINGS_UPDATED';
  actorId?: string;
  actorName: string;
  entityType: 'AUTH' | 'USER' | 'ITEM' | 'SALE' | 'RETURN' | 'PURCHASE_ORDER' | 'INVENTORY' | 'SYNC' | 'SETTINGS';
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
  shortageOrOverage?: number;
  closingNotes?: string;
  status: 'OPEN' | 'CLOSED';
}

export interface PaymentRecord {
  id: string;
  referenceNo: string;
  referenceType: 'SALE' | 'PURCHASE_ORDER' | 'RETURN';
  amount: number;
  method: string;
  direction: 'IN' | 'OUT';
  createdAt: string;
  operatorName: string;
  operatorId?: string;
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

export interface AppData {
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
  mediaAssets?: MediaAsset[];
  aiUndoStack?: AIUndoEntry[];
  branches: Branch[];
  aiConsultantHistory: any[];
  floatingChatHistory: any[];
  openRouterApiKey?: string;
  aiModel?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseBucket?: string;
}
