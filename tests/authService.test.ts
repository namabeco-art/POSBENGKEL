import { describe, it, expect, beforeAll } from 'vitest';
import { hashPassword, verifyPassword, sanitizeUserSession } from '../services/authService';
import { User, UserRole } from '../types';

describe('authService', () => {
  describe('hashPassword', () => {
    it('should return empty string for empty password', async () => {
      const result = await hashPassword('');
      expect(result).toBe('');
    });

    it('should produce PBKDF2 format with salt:hash', async () => {
      const result = await hashPassword('testpassword');
      expect(result).toContain(':');
      const [salt, hash] = result.split(':');
      expect(salt).toHaveLength(32); // 16 bytes = 32 hex chars
      expect(hash).toHaveLength(64); // 32 bytes = 64 hex chars
    });

    it('should produce different hashes for same password (random salt)', async () => {
      const hash1 = await hashPassword('samepassword');
      const hash2 = await hashPassword('samepassword');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes for different passwords', async () => {
      const hash1 = await hashPassword('password1');
      const hash2 = await hashPassword('password2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password against PBKDF2 hash', async () => {
      const password = 'mySecurePassword123';
      const hash = await hashPassword(password);
      const result = await verifyPassword(password, hash);
      expect(result).toBe(true);
    });

    it('should reject incorrect password against PBKDF2 hash', async () => {
      const hash = await hashPassword('correctPassword');
      const result = await verifyPassword('wrongPassword', hash);
      expect(result).toBe(false);
    });

    it('should verify against legacy SHA-256 hash (backward compat)', async () => {
      // SHA-256 of "123" = a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3
      const legacyHash = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
      const result = await verifyPassword('123', legacyHash);
      expect(result).toBe(true);
    });

    it('should reject wrong password against legacy SHA-256 hash', async () => {
      const legacyHash = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
      const result = await verifyPassword('wrong', legacyHash);
      expect(result).toBe(false);
    });

    it('should return false for empty password', async () => {
      const hash = await hashPassword('test');
      const result = await verifyPassword('', hash);
      expect(result).toBe(false);
    });

    it('should return false for empty hash', async () => {
      const result = await verifyPassword('test', '');
      expect(result).toBe(false);
    });
  });

  describe('sanitizeUserSession', () => {
    it('should remove passwordHash from user object', () => {
      const user: User = {
        id: 'U1',
        name: 'Test User',
        username: 'testuser',
        passwordHash: 'secret_hash_value',
        role: UserRole.KASIR,
        permissions: ['sale.create'],
        schedule: { enabled: false, startTime: '08:00', endTime: '17:00' },
        isActive: true,
      };

      const sanitized = sanitizeUserSession(user);
      expect(sanitized.passwordHash).toBe('');
      expect(sanitized.name).toBe('Test User');
      expect(sanitized.username).toBe('testuser');
    });
  });
});
