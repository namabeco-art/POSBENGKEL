import { PermissionKey, User } from '../types';

export const TAB_PERMISSION_MAP: Record<string, PermissionKey> = {
  'dashboard': 'dashboard.view',
  'master-items': 'item.view',
  'master-contacts': 'contact.view',
  'pos': 'sale.create',
  'sales-list': 'sale.view',
  'returns': 'return.create',
  'purchasing': 'purchase.view',
  'stock-opname': 'stock.view',
  'accounting': 'accounting.view',
  'reporting': 'report.view',
  'erp-control': 'report.view',
  'user-management': 'user.view',
  'settings': 'settings.manage',
  'ai-consultant': 'ai.use',
  'media-vault': 'ai.use',
};

export const MODULE_ACTIONS: Array<{ id: string; label: string; permission: PermissionKey; group: string }> = [
  { id: 'dashboard', label: 'Dashboard', permission: 'dashboard.view', group: 'Utama' },
  { id: 'master-items', label: 'Master Barang', permission: 'item.view', group: 'Master' },
  { id: 'master-contacts', label: 'Pelanggan & Supplier', permission: 'contact.view', group: 'Master' },
  { id: 'pos', label: 'Kasir', permission: 'sale.create', group: 'Transaksi' },
  { id: 'sales-list', label: 'Daftar Penjualan', permission: 'sale.view', group: 'Transaksi' },
  { id: 'returns', label: 'Retur Penjualan', permission: 'return.create', group: 'Transaksi' },
  { id: 'purchasing', label: 'Pembelian', permission: 'purchase.view', group: 'Transaksi' },
  { id: 'stock-opname', label: 'Stok Opname', permission: 'stock.view', group: 'Inventory' },
  { id: 'accounting', label: 'Akuntansi', permission: 'accounting.view', group: 'Keuangan' },
  { id: 'reporting', label: 'Laporan', permission: 'report.view', group: 'Keuangan' },
  { id: 'erp-control', label: 'ERP Control Tower', permission: 'report.view', group: 'Keuangan' },
  { id: 'user-management', label: 'Manajemen User', permission: 'user.view', group: 'Sistem' },
  { id: 'settings', label: 'Pengaturan', permission: 'settings.manage', group: 'Sistem' },
  { id: 'ai-consultant', label: 'Business Consultant', permission: 'ai.use', group: 'Intelligence' },
  { id: 'media-vault', label: 'Media Vault', permission: 'ai.use', group: 'Intelligence' },
];

export const hasPermission = (user: User | null | undefined, permission: PermissionKey): boolean => {
  if (!user) return false;
  return user.permissions.includes(permission);
};

export const canAccessTab = (user: User | null | undefined, tabId: string): boolean => {
  const permission = TAB_PERMISSION_MAP[tabId];
  if (!permission) return false;
  return hasPermission(user, permission);
};

export const getAccessibleTabs = (user: User | null | undefined): string[] =>
  Object.keys(TAB_PERMISSION_MAP).filter(tabId => canAccessTab(user, tabId));
