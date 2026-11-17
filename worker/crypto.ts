/** Utilitas kriptografi Worker (Web Crypto, tanpa dependency). */

const encoder = new TextEncoder();

const toHex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer)).map(byte => byte.toString(16).padStart(2, '0')).join('');

const toBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const randomToken = (bytes = 32) => toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));

export const sha256Hex = async (value: string) => toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));

/** Perbandingan waktu-konstan agar panjang/isi rahasia tidak bocor lewat timing. */
export const timingSafeEqual = (a: string, b: string) => {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
};

const PBKDF2_ITERATIONS = 100_000;

/** Hash password: pbkdf2$<iterasi>$<salt-hex>$<hash-hex>. */
export const hashPassword = async (password: string, iterations = PBKDF2_ITERATIONS) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${toHex(salt.buffer)}$${toHex(bits)}`;
};

export const verifyPassword = async (password: string, stored: string) => {
  const [scheme, iterationText, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'pbkdf2' || !saltHex || !hashHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(pair => parseInt(pair, 16)));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: Number(iterationText) }, key, 256);
  return timingSafeEqual(toHex(bits), hashHex);
};

const hmacKey = (secret: string) => crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

export const hmacSign = async (secret: string, message: string) =>
  toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(message))));
