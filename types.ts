
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

/** BARANG = punya stok; JASA = ongkos servis/jasa, tidak punya stok (mode Lengkap). */
export type ItemType = 'BARANG' | 'JASA';

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
  /** Default BARANG. JASA tidak mengurangi stok. */
  itemType?: ItemType;
  /** Komisi mekanik/sales per baris: persen dari nilai jual baris. */
  commissionPercent?: number;
  /** Komisi mekanik/sales per baris: rupiah per satuan dasar (dipakai jika diisi). */
  commissionAmount?: number;
  /** Wajib input nomor seri saat dijual (aki, ban, dll). */
  trackSerial?: boolean;
  /** Masa garansi dalam hari (0/kosong = tanpa garansi). */
  warrantyDays?: number;
  /**
   * Stok di gudang selain gudang utama (W1). Stok gudang utama = stock - jumlah gudang lain.
   * Termasuk kelompok field "stock" untuk sinkronisasi.
   */
  stockByWarehouse?: Record<string, number>;
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
  /** Saldo deposit/uang muka pelanggan (mode Lengkap). Berubah hanya lewat buku besar pelanggan. */
  depositBalance?: number;
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
  /** Gudang penerimaan (default W1). */
  warehouseId?: string;
  /** Dibuat oleh versi dengan buku besar otomatis (hutang dicatat saat barang diterima, bukan saat PO dibuat). */
  ledgerV?: number;
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
  /** Nilai baris sebelum diskon baris. `total` = grossTotal - discountAmount. */
  grossTotal?: number;
  /** Diskon baris (rupiah). */
  discountAmount?: number;
  /** Teks diskon yang diinput kasir, mis. "10+5" (persen bertingkat) atau "5000". */
  discountText?: string;
  /** Baris jasa (tidak mengurangi stok). */
  isJasa?: boolean;
  /** Bonus promo Beli X Gratis Y. */
  isPromoGift?: boolean;
  mechanicId?: string;
  mechanicName?: string;
  /** Komisi mekanik/sales untuk baris ini (rupiah). */
  commissionAmount?: number;
  serialNumbers?: string[];
  warrantyDays?: number;
}

export type PaymentMethodCode = 'TUNAI' | 'QRIS' | 'TRANSFER' | 'DEBIT' | 'KREDIT' | 'DEPOSIT';

export interface SalePayment {
  method: PaymentMethodCode;
  /** Nilai yang dibayarkan dengan metode ini (untuk TUNAI: sudah dikurangi kembalian). */
  amount: number;
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
  /** Pembayaran campuran (mode Lengkap). Kosong = data lama: satu metode sesuai paymentType. */
  payments?: SalePayment[];
  serviceOrderId?: string;
  serviceOrderNo?: string;
  /** Penjualan dicatat ke buku besar otomatis (jurnal diturunkan dari dokumen ini). */
  ledgerV?: number;
  /** Void dicatat oleh versi buku besar (jurnal pembalik dibuat). */
  voidLedgerV?: number;
}

/** Pembagian pengembalian dana retur penjualan. */
export interface ReturnRefund {
  /** Mengurangi piutang pelanggan. */
  credit: number;
  /** Kembali ke saldo deposit pelanggan. */
  deposit: number;
  /** Uang tunai keluar dari laci. */
  cash: number;
  /** Dikembalikan lewat bank/QRIS/transfer. */
  bank: number;
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
  /** Rincian pengembalian dana (diisi saat disetujui). */
  refund?: ReturnRefund;
  ledgerV?: number;
}

export interface Warehouse {
  id: string;
  name: string;
  location: string;
  isActive?: boolean;
  updatedAt?: string;
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
  type: 'SALE' | 'RETURN' | 'PURCHASE_RECEIPT' | 'STOCK_OPNAME' | 'SALE_VOID' | 'TRANSFER' | 'PURCHASE_RETURN';
  direction: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  /** Stok total barang sebelum mutasi (semua gudang). */
  previousStock: number;
  /** Stok total barang sesudah mutasi (semua gudang). */
  newStock: number;
  referenceNo: string;
  note?: string;
  warehouseId: string;
  operatorName: string;
  operatorId?: string;
  createdAt: string;
  /** Harga modal per satuan dasar saat mutasi (untuk nilai persediaan di buku besar). */
  unitCost?: number;
  ledgerV?: number;
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
    | 'SETTINGS_UPDATED'
    | 'DEPOSIT_RECORDED'
    | 'SERVICE_ORDER_SAVED'
    | 'STOCK_TRANSFERRED'
    | 'PURCHASE_RETURNED'
    | 'COMMISSION_PAID'
    | 'JOURNAL_POSTED';
  actorId?: string;
  actorName: string;
  entityType: 'AUTH' | 'USER' | 'ITEM' | 'SALE' | 'RETURN' | 'PURCHASE_ORDER' | 'INVENTORY' | 'SYNC' | 'SETTINGS' | 'CUSTOMER' | 'SERVICE_ORDER' | 'MECHANIC' | 'JOURNAL' | 'SUPPLIER';
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
  /** Uang tunai masuk lain (topup deposit/DP, refund retur beli dari supplier). */
  otherCashIn?: number;
  /** Uang tunai keluar lain (pengembalian deposit, bayar komisi). */
  otherCashOut?: number;
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
  ledgerV?: number;
}

export interface PaymentRecord {
  id: string;
  referenceNo: string;
  referenceType: 'SALE' | 'PURCHASE_ORDER' | 'RETURN' | 'CUSTOMER_PAYMENT' | 'DEPOSIT' | 'COMMISSION' | 'PURCHASE_RETURN';
  amount: number;
  method: string;
  direction: 'IN' | 'OUT';
  createdAt: string;
  operatorName: string;
  operatorId?: string;
  customerId?: string;
  cashSessionId?: string;
  note?: string;
  ledgerV?: number;
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
  /** TRANSACTION (default) = diskon faktur; BUY_X_GET_Y = bonus barang (mode Lengkap). */
  kind?: 'TRANSACTION' | 'BUY_X_GET_Y';
  /** Hari berlaku: 0 = Minggu ... 6 = Sabtu. Kosong = setiap hari. */
  daysOfWeek?: number[];
  /** Jam berlaku "HH:mm" (lokal). */
  timeStart?: string;
  timeEnd?: string;
  /** Angka kecil = diutamakan. */
  priority?: number;
  /** Minimal belanja (subtotal) agar promo faktur berlaku. */
  minSubtotal?: number;
  buyItemId?: string;
  buyQty?: number;
  freeItemId?: string;
  freeQty?: number;
  /** Berlaku kelipatan (beli 2 gratis 1, beli 4 gratis 2, ...). */
  isMultiple?: boolean;
}

/** Pengaturan toko yang tersinkron ke semua perangkat. */
export type AppMode = 'SIMPLE' | 'LENGKAP';

export interface AppSettings {
  mode: AppMode;
  /** Tutup buku: transaksi bertanggal s/d tanggal ini (YYYY-MM-DD) tidak bisa diubah/dibatalkan. */
  lockDate?: string;
  /** Peringatan di kasir jika margin baris di bawah persentase ini. */
  minMarginPercent?: number;
  /** 10 huruf sandi harga modal untuk label (angka 0-9). */
  costCipher?: string;
  /** Komisi default (%) untuk baris jasa jika barang tidak punya pengaturan komisi. */
  defaultCommissionPercent?: number;
  updatedAt?: string;
}

/** Buku besar pelanggan: setiap perubahan piutang, poin, dan deposit (append-only, aman untuk sinkron). */
export interface CustomerLedgerEntry {
  id: string;
  customerId: string;
  customerName?: string;
  kind: 'DEBT' | 'POINTS' | 'DEPOSIT';
  /** Perubahan saldo (+ menambah, - mengurangi). */
  delta: number;
  referenceNo: string;
  referenceType: 'SALE' | 'SALE_VOID' | 'RETURN' | 'PAYMENT' | 'DEPOSIT_TOPUP' | 'DEPOSIT_REFUND' | 'DP' | 'OPENING' | 'ADJUST';
  /** Metode uang masuk/keluar untuk topup/refund deposit (TUNAI/TRANSFER/...). */
  method?: string;
  note?: string;
  cashSessionId?: string;
  operatorName: string;
  operatorId?: string;
  createdAt: string;
}

export interface JournalLine {
  accountCode: string;
  debit: number;
  credit: number;
}

/** Jurnal manual (mode Lengkap). Jurnal transaksi lain diturunkan otomatis dari dokumen. */
export interface ManualJournal {
  id: string;
  journalNo: string;
  date: string; // YYYY-MM-DD
  description: string;
  lines: JournalLine[];
  createdAt: string;
  operatorName: string;
  operatorId?: string;
}

export interface Mechanic {
  id: string;
  name: string;
  phone?: string;
  /** Komisi default (%) dari baris jasa yang dikerjakan. */
  defaultCommissionPercent: number;
  isActive: boolean;
  updatedAt?: string;
}

export interface CommissionPayment {
  id: string;
  paymentNo: string;
  mechanicId: string;
  mechanicName: string;
  amount: number;
  method: string;
  note?: string;
  cashSessionId?: string;
  createdAt: string;
  operatorName: string;
  operatorId?: string;
}

export interface HeldCartLine {
  itemId: string;
  name: string;
  unitName: string;
  conversion: number;
  qty: number;
  discountText?: string;
  mechanicId?: string;
  serialNumbers?: string[];
}

/** Transaksi kasir yang ditahan (pending) untuk dilanjutkan nanti. */
export interface HeldCart {
  id: string;
  label: string;
  customerId: string;
  customerName: string;
  lines: HeldCartLine[];
  serviceOrderId?: string;
  createdAt: string;
  updatedAt?: string;
  operatorName: string;
  operatorId?: string;
}

export type ServiceOrderStatus = 'ESTIMASI' | 'DIKERJAKAN' | 'SELESAI' | 'DIFAKTURKAN' | 'BATAL';

export interface ServiceOrderLine {
  itemId: string;
  name: string;
  qty: number;
  price: number;
  isJasa?: boolean;
  mechanicId?: string;
}

/** Estimasi biaya / Work Order servis (mode Lengkap). */
export interface ServiceOrder {
  id: string;
  orderNo: string;
  status: ServiceOrderStatus;
  customerId: string;
  customerName: string;
  vehiclePlate?: string;
  vehicleModel?: string;
  odometer?: number;
  complaint?: string;
  mechanicId?: string;
  mechanicName?: string;
  lines: ServiceOrderLine[];
  estimatedTotal: number;
  /** Uang muka yang sudah diterima (masuk ke deposit pelanggan). */
  dpAmount?: number;
  invoiceNo?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  operatorName: string;
  operatorId?: string;
}

export interface StockTransfer {
  id: string;
  transferNo: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  items: { itemId: string; name: string; qty: number }[];
  note?: string;
  createdAt: string;
  operatorName: string;
  operatorId?: string;
}

export interface PurchaseReturn {
  id: string;
  returnNo: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId?: string;
  warehouseId: string;
  items: { itemId: string; name: string; qty: number; cost: number }[];
  total: number;
  /** POTONG_HUTANG = mengurangi hutang ke supplier; REFUND_* = supplier mengembalikan uang. */
  settlement: 'POTONG_HUTANG' | 'REFUND_TUNAI' | 'REFUND_BANK';
  note?: string;
  createdAt: string;
  operatorName: string;
  operatorId?: string;
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
  /** cloud = Cloudflare R2; supabase = data lama sebelum migrasi. */
  sourceType: 'cloud' | 'supabase' | 'local';
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
  // ---- Mode Lengkap (semua opsional agar data lama tetap valid) ----
  appSettings?: AppSettings;
  customerLedger?: CustomerLedgerEntry[];
  manualJournals?: ManualJournal[];
  mechanics?: Mechanic[];
  commissionPayments?: CommissionPayment[];
  heldCarts?: HeldCart[];
  serviceOrders?: ServiceOrder[];
  warehouses?: Warehouse[];
  stockTransfers?: StockTransfer[];
  purchaseReturns?: PurchaseReturn[];
  openRouterApiKey?: string;
  aiModel?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseBucket?: string;
}
