/**
 * Crypto Service for Activation Codes
 * 
 * Uses AES-GCM encryption instead of plain base64 encoding.
 * The encryption key is derived from a passphrase using PBKDF2.
 * 
 * Format: base64(salt + iv + ciphertext + tag)
 * - salt: 16 bytes (for PBKDF2 key derivation)
 * - iv: 12 bytes (AES-GCM nonce)
 * - ciphertext + tag: variable length
 */

const ACTIVATION_PASSPHRASE = 'POSHULIO-ACTIVATION-V2';
const PBKDF2_ITERATIONS = 50_000;

const bufToBase64 = (buf: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i]);
  }
  return btoa(binary);
};

const base64ToBuf = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buf[i] = binary.charCodeAt(i);
  }
  return buf;
};

const deriveKey = async (passphrase: string, salt: Uint8Array): Promise<CryptoKey> => {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

/**
 * Encrypt activation payload using AES-GCM.
 * Returns a base64 string containing salt + iv + ciphertext.
 */
export const encryptActivationCode = async (payload: Record<string, any>): Promise<string> => {
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(payload));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(ACTIVATION_PASSPHRASE, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  );

  // Combine: salt (16) + iv (12) + ciphertext (variable)
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return bufToBase64(combined);
};

/**
 * Decrypt activation code back to payload object.
 * Returns null if decryption fails (invalid code or tampered data).
 */
export const decryptActivationCode = async (code: string): Promise<Record<string, any> | null> => {
  try {
    const combined = base64ToBuf(code);
    if (combined.length < 28 + 1) return null; // minimum: 16 salt + 12 iv + 1 byte data

    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);

    const key = await deriveKey(ACTIVATION_PASSPHRASE, salt);

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(plaintext));
  } catch {
    return null;
  }
};

/**
 * Try to decode activation code — supports both new encrypted format
 * and legacy base64 format for backward compatibility.
 */
export const decodeActivationCodeCompat = async (code: string): Promise<Record<string, any> | null> => {
  // Try new encrypted format first
  const encrypted = await decryptActivationCode(code);
  if (encrypted) return encrypted;

  // Fallback: legacy plain base64 format
  try {
    const decoded = JSON.parse(atob(code));
    if (decoded && typeof decoded === 'object' && (decoded.su || decoded.u || decoded.s)) {
      return decoded;
    }
  } catch {
    // Not valid base64 JSON either
  }

  return null;
};
