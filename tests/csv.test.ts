import { describe, expect, it } from 'vitest';
import { csvCell, detectDelimiter, findColumn, parseCsv, toCsv } from '../services/csv';

describe('csv', () => {
  it('membaca CSV titik koma (default Excel Indonesia) dengan BOM dan CRLF', () => {
    const text = '﻿Kode;Nama;Harga Level 1\r\nA-1;Kopi;12.500\r\nA-2;"Gula, 1kg";15000\r\n';
    expect(detectDelimiter(text.split(/\r?\n/)[0])).toBe(';');
    expect(parseCsv(text)).toEqual([
      ['Kode', 'Nama', 'Harga Level 1'],
      ['A-1', 'Kopi', '12.500'],
      ['A-2', 'Gula, 1kg', '15000'],
    ]);
  });

  it('menangani koma di dalam tanda kutip dan kutip ganda', () => {
    const rows = parseCsv('Kode,Nama\nB-1,"Oli ""Super"", 1L"\n\n');
    expect(rows).toEqual([['Kode', 'Nama'], ['B-1', 'Oli "Super", 1L']]);
  });

  it('menulis sel aman dari formula injection, angka tidak dikutip', () => {
    expect(csvCell('=SUM(A1)')).toBe(`"'=SUM(A1)"`);
    expect(csvCell(-5000)).toBe('-5000');
    expect(toCsv([['Nama', 'Harga'], ['Gula, 1kg', 15000]])).toBe('"Nama","Harga"\r\n"Gula, 1kg",15000');
  });

  it('menemukan kolom tanpa peduli spasi/huruf besar', () => {
    expect(findColumn(['Kode Barang', 'Stok Fisik'], ['stok fisik'])).toBe(1);
    expect(findColumn(['A'], ['B'])).toBe(-1);
  });
});
