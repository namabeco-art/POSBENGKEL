
import { Item, Customer, Supplier, Warehouse, Account, User, UserRole, Branch, PromotionCampaign } from './types';

const DEFAULT_PASSWORD_HASH = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';

export const mockUsers: User[] = [
  { 
    id: 'U1', 
    name: 'Administrator', 
    username: 'admin', 
    passwordHash: DEFAULT_PASSWORD_HASH,
    role: UserRole.OWNER,
    permissions: [
      'dashboard.view', 'item.view', 'item.create', 'item.edit', 'item.delete',
      'contact.view', 'contact.create', 'contact.edit', 'contact.delete',
      'sale.create', 'sale.view', 'sale.void',
      'return.create', 'return.approve',
      'purchase.view', 'purchase.create', 'purchase.receive', 'purchase.pay',
      'stock.view', 'stock.adjust', 'stock.opname',
      'accounting.view', 'report.view',
      'user.view', 'user.manage', 'settings.manage', 'ai.use'
    ],
    schedule: { enabled: false, startTime: '08:00', endTime: '17:00' },
    isActive: true,
    sessionPolicy: { maxOfflineMinutes: 480, requireReauthForSensitiveAction: true }
  },
  { 
    id: 'U2', 
    name: 'Kasir Utama', 
    username: 'kasir', 
    passwordHash: DEFAULT_PASSWORD_HASH,
    role: UserRole.KASIR,
    permissions: ['dashboard.view', 'sale.create', 'sale.view', 'return.create'],
    schedule: { enabled: true, startTime: '08:00', endTime: '17:00' },
    isActive: true,
    sessionPolicy: { maxOfflineMinutes: 240, requireReauthForSensitiveAction: false }
  },
  {
    id: 'U3',
    name: 'Admin Gudang',
    username: 'gudang',
    passwordHash: DEFAULT_PASSWORD_HASH,
    role: UserRole.WAREHOUSE,
    permissions: ['dashboard.view', 'item.view', 'purchase.view', 'purchase.receive', 'stock.view', 'stock.opname'],
    schedule: { enabled: true, startTime: '08:00', endTime: '17:00' },
    isActive: true,
    sessionPolicy: { maxOfflineMinutes: 360, requireReauthForSensitiveAction: true }
  }
];

export const mockItems: Item[] = [
  {
    id: '1',
    code: 'BRG-001',
    barcode: '8991234567',
    name: 'Indomie Goreng Original',
    category: 'Sembako',
    brand: 'Indofood',
    basePrice: 2800,
    memberPrices: [3100, 3050, 3000, 2950],
    stock: 500,
    warehouseId: 'W1',
    reorderLevel: 50,
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1585109649139-366815a0d713?q=80&w=300&auto=format&fit=crop',
    units: [
      { name: 'Pcs', conversion: 1, price: 3100 }
    ]
  },
  {
    id: '2',
    code: 'BRG-002',
    barcode: '8999876543',
    name: 'Mineral Water 600ml',
    category: 'Minuman',
    brand: 'Aqua',
    basePrice: 2000,
    memberPrices: [2500, 2450, 2400, 2350],
    stock: 1200,
    warehouseId: 'W1',
    reorderLevel: 120,
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1523362628242-f513a5e33439?q=80&w=300&auto=format&fit=crop',
    units: [
      { name: 'Pcs', conversion: 1, price: 2500 }
    ]
  }
];

export const mockCustomers: Customer[] = [
  { id: 'C1', name: 'Umum / Retail', phone: '-', address: '-', creditLimit: 0, currentDebt: 0, level: 1 },
  { id: 'C2', name: 'Toko Berkah', phone: '0812345678', address: 'Jl. Melati No. 10', creditLimit: 5000000, currentDebt: 1200000, level: 2 }
];

export const mockAccounts: Account[] = [
  { code: '1-1000', name: 'Kas Kecil', type: 'ASSET', balance: 2500000 },
  { code: '1-1100', name: 'Bank BCA', type: 'ASSET', balance: 50000000 },
  { code: '1-1200', name: 'Piutang Dagang', type: 'ASSET', balance: 1200000 },
  { code: '2-1100', name: 'Hutang Dagang', type: 'LIABILITY', balance: 0 },
  { code: '4-1100', name: 'Pendapatan Penjualan', type: 'INCOME', balance: 0 },
  { code: '6-1100', name: 'Biaya Listrik', type: 'EXPENSE', balance: 0 }
];

export const mockWarehouses: Warehouse[] = [
  { id: 'W1', name: 'Gudang Pusat', location: 'Jakarta' },
  { id: 'W2', name: 'Gudang Cabang', location: 'Bandung' }
];

export const mockSuppliers: Supplier[] = [
  { id: 'S1', name: 'Indofood CBP', phone: '021-123456', address: 'Jakarta Industrial Estate' }
];

export const mockBranches: Branch[] = [
  { id: 'B1', name: 'Toko Pusat', address: 'Jakarta', isHeadOffice: true }
];

export const mockPromotions: PromotionCampaign[] = [
  {
    id: 'PROMO-HEMAT5',
    name: 'Promo Hemat 5%',
    type: 'PERCENT',
    value: 5,
    minCustomerLevel: 1,
    startAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    isActive: true,
    notes: 'Promo default untuk semua pelanggan.',
  },
  {
    id: 'PROMO-MEMBER10',
    name: 'Member L3+ 10%',
    type: 'PERCENT',
    value: 10,
    minCustomerLevel: 3,
    startAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    isActive: true,
    notes: 'Promo khusus pelanggan level 3 ke atas.',
  },
];
