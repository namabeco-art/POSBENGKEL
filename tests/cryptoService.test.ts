import { describe, it, expect } from 'vitest';
import { encryptActivationCode, decryptActivationCode, decodeActivationCodeCompat } from '../services/cryptoService';

describe('cryptoService', () => {
  describe('encryptActivationCode / decryptActivationCode', () => {
    it('should encrypt and decrypt a payload correctly', async () => {
      const payload = {
        su: 'https://test.supabase.co',
        sk: 'test-anon-key',
        s: 'store_001',
        or: 'openrouter-key',
        m: 'openrouter/auto',
      };

      const encrypted = await encryptActivationCode(payload);
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toContain('supabase'); // Should not be readable

      const decrypted = await decryptActivationCode(encrypted);
      expect(decrypted).toEqual(payload);
    });

    it('should return null for invalid encrypted data', async () => {
      const result = await decryptActivationCode('invalid-base64-data');
      expect(result).toBeNull();
    });

    it('should return null for tampered data', async () => {
      const payload = { su: 'https://test.supabase.co', sk: 'key', s: 'store' };
      const encrypted = await encryptActivationCode(payload);

      // Tamper with the encrypted data
      const tampered = encrypted.slice(0, -5) + 'XXXXX';
      const result = await decryptActivationCode(tampered);
      expect(result).toBeNull();
    });

    it('should produce different ciphertext for same payload (random IV)', async () => {
      const payload = { su: 'https://test.supabase.co', sk: 'key', s: 'store' };
      const enc1 = await encryptActivationCode(payload);
      const enc2 = await encryptActivationCode(payload);
      expect(enc1).not.toBe(enc2);
    });
  });

  describe('decodeActivationCodeCompat', () => {
    it('should decode new encrypted format', async () => {
      const payload = { su: 'https://test.supabase.co', sk: 'key', s: 'store' };
      const encrypted = await encryptActivationCode(payload);
      const result = await decodeActivationCodeCompat(encrypted);
      expect(result).toEqual(payload);
    });

    it('should decode legacy base64 format', async () => {
      const payload = { su: 'https://old.supabase.co', sk: 'old-key', s: 'old_store' };
      const legacyCode = btoa(JSON.stringify(payload));
      const result = await decodeActivationCodeCompat(legacyCode);
      expect(result).toEqual(payload);
    });

    it('should return null for completely invalid input', async () => {
      const result = await decodeActivationCodeCompat('not-valid-at-all!!!');
      expect(result).toBeNull();
    });
  });
});
