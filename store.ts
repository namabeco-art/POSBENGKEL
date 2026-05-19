
import { Item, Customer, Supplier, Warehouse, Account, User, UserRole, Branch, PromotionCampaign } from './types';

// Default password: "123" (SHA-256 hash — will be auto-upgraded to PBKDF2 on first login)
const DEFAULT_PASSWORD_HASH = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';

export const mockUsers: User[] = [
  { 
    id: 'U1', 
    name: 'Pemilik', 
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
    schedule: { enabled: false, startTime: '08:00', endTime: '21:00' },
    isActive: true,
    sessionPolicy: { maxOfflineMinutes: 480, requireReauthForSensitiveAction: false }
  },
  { 
    id: 'U2', 
    name: 'Kasir', 
    username: 'kasir', 
    passwordHash: DEFAULT_PASSWORD_HASH,
    role: UserRole.KASIR,
    permissions: ['dashboard.view', 'sale.create', 'sale.view', 'return.create', 'item.view'],
    schedule: { enabled: false, startTime: '08:00', endTime: '21:00' },
    isActive: true,
    sessionPolicy: { maxOfflineMinutes: 480, requireReauthForSensitiveAction: false }
  },
  {
    id: 'U3',
    name: 'Gudang',
    username: 'gudang',
    passwordHash: DEFAULT_PASSWORD_HASH,
    role: UserRole.WAREHOUSE,
    permissions: ['dashboard.view', 'item.view', 'purchase.view', 'purchase.receive', 'stock.view', 'stock.opname'],
    schedule: { enabled: false, startTime: '08:00', endTime: '21:00' },
    isActive: true,
    sessionPolicy: { maxOfflineMinutes: 480, requireReauthForSensitiveAction: false }
  }
];

export const mockItems: Item[] = [
  {
    id: '1',
    code: 'OLI-001',
    barcode: '8991001001',
    name: 'Oli Mesin 1L SAE 10W-40',
    category: 'Oli & Pelumas',
    brand: 'Pertamina',
    basePrice: 45000,
    memberPrices: [55000, 52000, 50000, 48000],
    stock: 24,
    warehouseId: 'W1',
    reorderLevel: 5,
    isActive: true,
    units: [
      { name: 'Botol', conversion: 1, price: 55000 },
      { name: 'Dus (12)', conversion: 12, price: 600000 }
    ]
  },
  {
    id: '2',
    code: 'BRK-001',
    barcode: '8991002001',
    name: 'Kampas Rem Depan Honda Beat',
    category: 'Rem',
    brand: 'Aspira',
    basePrice: 35000,
    memberPrices: [45000, 43000, 42000, 40000],
    stock: 15,
    warehouseId: 'W1',
    reorderLevel: 3,
    isActive: true,
    units: [
      { name: 'Set', conversion: 1, price: 45000 }
    ]
  },
  {
    id: '3',
    code: 'BUS-001',
    barcode: '8991003001',
    name: 'Busi NGK C7HSA',
    category: 'Kelistrikan',
    brand: 'NGK',
    basePrice: 18000,
    memberPrices: [25000, 23000, 22000, 20000],
    stock: 50,
    warehouseId: 'W1',
    reorderLevel: 10,
    isActive: true,
    units: [
      { name: 'Pcs', conversion: 1, price: 25000 }
    ]
  },
  {
    id: '4',
    code: 'BAN-001',
    barcode: '8991004001',
    name: 'Ban Dalam 17 inch',
    category: 'Ban & Velg',
    brand: 'Swallow',
    basePrice: 25000,
    memberPrices: [35000, 33000, 32000, 30000],
    stock: 20,
    warehouseId: 'W1',
    reorderLevel: 5,
    isActive: true,
    units: [
      { name: 'Pcs', conversion: 1, price: 35000 }
    ]
  },
  {
    id: '5',
    code: 'RNT-001',
    barcode: '8991005001',
    name: 'Rantai Motor 428H',
    category: 'Transmisi',
    brand: 'TK',
    basePrice: 65000,
    memberPrices: [85000, 80000, 78000, 75000],
    stock: 8,
    warehouseId: 'W1',
    reorderLevel: 3,
    isActive: true,
    units: [
      { name: 'Set', conversion: 1, price: 85000 }
    ]
  }
];

export const mockCustomers: Customer[] = [
  { id: 'C1', name: 'Umum / Walk-in', phone: '-', address: '-', creditLimit: 0, currentDebt: 0, level: 1 },
  { id: 'C2', name: 'Bengkel Jaya Motor', phone: '08123456789', address: 'Jl. Raya No. 10', creditLimit: 5000000, currentDebt: 0, level: 2 }
];

export const mockAccounts: Account[] = [
  { code: '1-1000', name: 'Kas Toko', type: 'ASSET', balance: 5000000 },
  { code: '1-1100', name: 'Bank', type: 'ASSET', balance: 20000000 },
  { code: '1-1200', name: 'Piutang', type: 'ASSET', balance: 0 },
  { code: '2-1100', name: 'Hutang Supplier', type: 'LIABILITY', balance: 0 },
  { code: '4-1100', name: 'Penjualan', type: 'INCOME', balance: 0 },
  { code: '6-1100', name: 'Biaya Operasional', type: 'EXPENSE', balance: 0 }
];

export const mockWarehouses: Warehouse[] = [
  { id: 'W1', name: 'Gudang Utama', location: 'Toko' }
];

export const mockSuppliers: Supplier[] = [
  { id: 'S1', name: 'PT Astra Otoparts', phone: '021-7654321', address: 'Jakarta' },
  { id: 'S2', name: 'Toko Sparepart Jaya', phone: '08567891234', address: 'Lokal' }
];

export const mockBranches: Branch[] = [
  { id: 'B1', name: 'Toko Utama', address: '-', isHeadOffice: true }
];

export const mockPromotions: PromotionCampaign[] = [
  {
    id: 'PROMO-MEMBER5',
    name: 'Diskon Langganan 5%',
    type: 'PERCENT',
    value: 5,
    minCustomerLevel: 2,
    startAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    isActive: true,
    notes: 'Diskon untuk pelanggan tetap (level 2+).',
  },
];
