/**
 * Encoder Code 128 (set B, ditambah set C untuk deret angka genap) → SVG.
 * Cukup untuk barcode barang ritel/sparepart yang dibaca scanner USB biasa.
 */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;
const STOP = 106;

/** Nilai simbol Code 128 (termasuk start, checksum, stop). */
export const encodeCode128 = (text: string): number[] => {
  const value = String(text || '');
  if (!value) throw new Error('Teks barcode kosong.');
  if (/[^\x20-\x7e]/.test(value)) throw new Error('Barcode hanya mendukung huruf/angka ASCII.');
  const codes: number[] = [];
  const digitRun = (from: number) => {
    let end = from;
    while (end < value.length && /\d/.test(value[end])) end += 1;
    return end - from;
  };
  let index = 0;
  let set: 'B' | 'C' = digitRun(0) >= 4 && digitRun(0) % 2 === 0 ? 'C' : 'B';
  codes.push(set === 'C' ? START_C : START_B);
  while (index < value.length) {
    const run = digitRun(index);
    if (set === 'B' && run >= 6) {
      // Pindah ke set C untuk deret angka panjang (lebih pendek di kertas).
      if (run % 2 === 1) {
        codes.push(value.charCodeAt(index) - 32);
        index += 1;
      }
      codes.push(CODE_C);
      set = 'C';
      continue;
    }
    if (set === 'C') {
      if (run >= 2) {
        codes.push(Number(value.slice(index, index + 2)));
        index += 2;
        continue;
      }
      codes.push(CODE_B);
      set = 'B';
      continue;
    }
    codes.push(value.charCodeAt(index) - 32);
    index += 1;
  }
  const checksum = codes.reduce((sum, code, position) => sum + code * (position === 0 ? 1 : position), 0) % 103;
  return [...codes, checksum, STOP];
};

/** Lebar modul bar/spasi bergantian (dimulai dengan bar). */
export const code128Modules = (text: string): number[] =>
  encodeCode128(text).flatMap(code => PATTERNS[code].split('').map(Number));

/** SVG barcode (tanpa teks). `height` dalam unit viewBox; skala lewat CSS width. */
export const code128Svg = (text: string, height = 40): string => {
  const modules = code128Modules(text);
  const quiet = 10;
  const width = modules.reduce((sum, w) => sum + w, 0) + quiet * 2;
  let x = quiet;
  const bars: string[] = [];
  modules.forEach((w, index) => {
    if (index % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w}" height="${height}"/>`);
    x += w;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${width}" height="${height}" fill="#fff"/><g fill="#000">${bars.join('')}</g></svg>`;
};

/**
 * Sandi harga modal untuk label (seperti di toko sparepart): tiap digit diganti huruf dari kunci 10 huruf.
 * Contoh kunci "HULIOPRAKS": 0→H, 1→U, ..., 9→S. 45000 → "IOHHH".
 */
export const encodeCostCipher = (value: number, key = 'HULIOPRAKS'): string => {
  const letters = (key || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (letters.length < 10) return String(Math.round(value || 0));
  return String(Math.max(0, Math.round(value || 0))).split('').map(digit => letters[Number(digit)]).join('');
};
