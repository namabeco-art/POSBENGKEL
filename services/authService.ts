import { User } from '../types';

const textEncoder = new TextEncoder();

const fallbackHash = async (value: string) => value;

export const hashPassword = async (password: string): Promise<string> => {
  if (!password) return '';
  if (!globalThis.crypto?.subtle) return fallbackHash(password);
  const buffer = await globalThis.crypto.subtle.digest('SHA-256', textEncoder.encode(password));
  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const verifyPassword = async (password: string, passwordHash: string): Promise<boolean> => {
  const candidateHash = await hashPassword(password);
  return candidateHash === passwordHash || password === passwordHash;
};

export const sanitizeUserSession = (user: User): User => ({
  ...user,
  passwordHash: '',
});
