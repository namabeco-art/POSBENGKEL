/**
 * Diskon baris kasir.
 * - "10"      → 10%
 * - "10+5+2"  → diskon bertingkat 10%, lalu 5% dari sisa, lalu 2% dari sisa
 * - "10%"     → 10%
 * - "Rp5000" / "5.000" / "5000" (angka > 100) → potongan rupiah
 * Hasil selalu dibulatkan dan tidak melebihi nilai baris.
 */
export const parseLineDiscount = (rawText: string | undefined, gross: number): number => {
  const text = (rawText || '').trim().toLowerCase().replace(/\s/g, '');
  const safeGross = Math.max(0, Math.round(gross || 0));
  if (!text || safeGross <= 0) return 0;

  const isRupiah = text.startsWith('rp');
  const cleaned = text.replace(/^rp\.?/, '').replace(/%/g, '');
  if (!cleaned) return 0;

  if (!isRupiah && cleaned.includes('+')) {
    const parts = cleaned.split('+').map(part => Number(part.replace(',', '.')));
    if (parts.some(part => !Number.isFinite(part) || part < 0 || part > 100)) return 0;
    const net = parts.reduce((value, percent) => value * (1 - percent / 100), safeGross);
    return Math.min(safeGross, Math.max(0, Math.round(safeGross - net)));
  }

  const numeric = Number(cleaned.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  if (!isRupiah && (text.endsWith('%') || numeric <= 100)) {
    return Math.min(safeGross, Math.round(safeGross * Math.min(100, numeric) / 100));
  }
  return Math.min(safeGross, Math.round(numeric));
};

/** Teks diskon valid? (dipakai untuk menandai input yang salah ketik) */
export const isValidDiscountText = (rawText: string | undefined): boolean => {
  const text = (rawText || '').trim();
  if (!text) return true;
  return parseLineDiscount(text, 1_000_000) > 0;
};
