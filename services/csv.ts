/**
 * Utilitas CSV kecil tanpa dependency.
 * - Mendeteksi pemisah otomatis (koma, titik koma — default Excel Indonesia — atau tab).
 * - Mendukung tanda kutip, koma di dalam nama barang, BOM UTF-8, dan baris CRLF.
 */

const stripBom = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

export const detectDelimiter = (headerLine: string): ',' | ';' | '\t' => {
  const counts = { ',': 0, ';': 0, '\t': 0 } as Record<',' | ';' | '\t', number>;
  let inQuotes = false;
  for (const char of headerLine) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && char in counts) counts[char as ',' | ';' | '\t'] += 1;
  }
  if (counts['\t'] > counts[','] && counts['\t'] >= counts[';']) return '\t';
  if (counts[';'] > counts[',']) return ';';
  return ',';
};

export const parseCsv = (rawText: string): string[][] => {
  const text = stripBom(rawText || '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
};

/** Satu sel CSV yang aman dari formula injection Excel. */
export const csvCell = (value: unknown): string => {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export const toCsv = (rows: unknown[][]): string => rows.map(row => row.map(csvCell).join(',')).join('\r\n');

export const downloadCsv = (fileName: string, rows: unknown[][]) => {
  // BOM agar Excel membaca UTF-8 dengan benar.
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Cari indeks kolom berdasarkan beberapa kemungkinan nama header (case-insensitive). */
export const findColumn = (header: string[], candidates: string[]): number => {
  const normalized = header.map(value => value.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const candidate of candidates) {
    const key = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
    const index = normalized.indexOf(key);
    if (index >= 0) return index;
  }
  return -1;
};
