import { describe, expect, it } from 'vitest';
import { canAccessTab, getAccessibleTabs, hasPermission } from '../services/permissions';
import { UserRole, type User } from '../types';

const makeUser = (overrides: Partial<User>): User => ({
  id: 'U1',
  name: 'Test User',
  username: 'test',
  passwordHash: 'hashed',
  role: UserRole.KASIR,
  permissions: ['dashboard.view'],
  schedule: { enabled: false, startTime: '08:00', endTime: '17:00' },
  isActive: true,
  ...overrides,
});

describe('permissions', () => {
  it('grants kasir access only to cashier-related tabs', () => {
    const kasir = makeUser({
      role: UserRole.KASIR,
      permissions: ['dashboard.view', 'sale.create', 'sale.view', 'return.create'],
    });

    expect(canAccessTab(kasir, 'dashboard')).toBe(true);
    expect(canAccessTab(kasir, 'pos')).toBe(true);
    expect(canAccessTab(kasir, 'sales-list')).toBe(true);
    expect(canAccessTab(kasir, 'returns')).toBe(true);
    expect(canAccessTab(kasir, 'settings')).toBe(false);
    expect(canAccessTab(kasir, 'user-management')).toBe(false);
    expect(canAccessTab(kasir, 'purchasing')).toBe(false);
  });

  it('returns only accessible tabs for kasir', () => {
    const kasir = makeUser({
      permissions: ['dashboard.view', 'sale.create', 'sale.view', 'return.create'],
    });

    expect(getAccessibleTabs(kasir)).toEqual(['dashboard', 'pos', 'sales-list', 'returns']);
  });

  it('checks explicit action permissions', () => {
    const owner = makeUser({
      role: UserRole.OWNER,
      permissions: ['settings.manage', 'user.manage', 'stock.adjust'],
    });

    expect(hasPermission(owner, 'settings.manage')).toBe(true);
    expect(hasPermission(owner, 'sale.create')).toBe(false);
  });
});
