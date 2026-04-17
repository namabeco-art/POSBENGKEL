import { describe, expect, it } from 'vitest';
import { hashPassword, sanitizeUserSession, verifyPassword } from '../services/authService';
import { UserRole, type User } from '../types';

describe('authService', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('secret123');
    expect(hash).not.toBe('secret123');
    await expect(verifyPassword('secret123', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });

  it('sanitizes password hash from session payload', () => {
    const user: User = {
      id: 'U1',
      name: 'Kasir',
      username: 'kasir',
      passwordHash: 'hashed-value',
      role: UserRole.KASIR,
      permissions: ['dashboard.view', 'sale.create'],
      schedule: { enabled: false, startTime: '08:00', endTime: '17:00' },
      isActive: true,
    };

    expect(sanitizeUserSession(user).passwordHash).toBe('');
  });
});
