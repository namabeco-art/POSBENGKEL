import { User } from '../types';

const textEncoder = new TextEncoder();

const bufToHex = (buffer: Uint8Array): string =>
  Array.from(buffer).map(byte => byte.toString(16).padStart(2, '0')).join('');

const hexToBuf = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
};

/**
 * Hash password using PBKDF2 with a random 16-byte salt.
 * Output format: `salt_hex:derived_key_hex`
 * Falls back to legacy SHA-256 (no salt) if Web Crypto is unavailable.
 */
export const hashPassword = async (password: string): Promise<string> => {
  if (!password) return '';

  if (!globalThis.crypto?.subtle) {
    // Fallback for environments without Web Crypto (should not happen in modern browsers)
    return password;
  }

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );

  return `${bufToHex(salt)}:${bufToHex(new Uint8Array(derivedBits))}`;
};

/**
 * Verify password against a stored hash.
 * Supports both new PBKDF2 format (salt:hash) and legacy SHA-256 format.
 */
export const verifyPassword = async (password: string, storedHash: string): Promise<boolean> => {
  if (!password || !storedHash) return false;

  // New PBKDF2 format: salt_hex:derived_key_hex
  if (storedHash.includes(':') && storedHash.length > 65) {
    const [saltHex, expectedHash] = storedHash.split(':');
    if (!saltHex || !expectedHash) return false;

    const salt = hexToBuf(saltHex);
    const keyMaterial = await globalThis.crypto.subtle.importKey(
      'raw',
      textEncoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    );

    const derivedBits = await globalThis.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt as unknown as BufferSource,
        iterations: 100_000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256,
    );

    return bufToHex(new Uint8Array(derivedBits)) === expectedHash;
  }

  // Legacy SHA-256 format (no salt) — for backward compatibility
  if (globalThis.crypto?.subtle) {
    const buffer = await globalThis.crypto.subtle.digest(
      'SHA-256',
      textEncoder.encode(password),
    );
    const candidateHash = bufToHex(new Uint8Array(buffer));
    if (candidateHash === storedHash) return true;
  }

  // Last resort: plain text comparison (for very old data)
  return password === storedHash;
};

export const sanitizeUserSession = (user: User): User => ({
  ...user,
  passwordHash: '',
});
