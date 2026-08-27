/**
 * Membuat ID unik yang aman dipakai lintas terminal.
 * randomUUID tersedia di browser modern; fallback tetap menyertakan waktu dan random bytes.
 */
export const createId = (prefix: string): string => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;

  const randomPart = Math.random().toString(36).slice(2, 12);
  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
};

/** Nomor dokumen yang mudah dibaca, dengan waktu dan suffix acak untuk mencegah tabrakan. */
export const createDocumentNo = (prefix: string, now = new Date()): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${suffix}`;
};
