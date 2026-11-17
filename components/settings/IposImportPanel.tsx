import React, { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { Customer, Item, Supplier } from '../../types';
import { parseIposContacts, parseIposItems, parseOpeningReceivables } from '../../services/iposImport';

interface IposImportPanelProps {
  onImportItems?: (rows: Item[]) => { added: number; updated: number; errors: string[] };
  onImportContacts?: (customers: Customer[], suppliers: Supplier[]) => { customers: number; suppliers: number };
  onImportOpeningReceivables?: (rows: Array<{ customerName: string; amount: number }>) => Promise<{ applied: number; missing: string[] }>;
}

type Kind = 'items' | 'customers' | 'suppliers' | 'receivables';

const KINDS: Array<{ kind: Kind; label: string; hint: string }> = [
  { kind: 'items', label: 'Data Item', hint: 'KODE ITEM, NAMA ITEM, JENIS, MEREK, SATUAN, HARGA POKOK, HARGA JUAL (1–4), STOK, STOK MINIMUM, TIPE ITEM, MENGGUNAKAN SERIAL' },
  { kind: 'customers', label: 'Pelanggan', hint: 'KODE, NAMA, ALAMAT, KOTA, TELEPON' },
  { kind: 'suppliers', label: 'Supplier', hint: 'KODE, NAMA, ALAMAT, KOTA, TELEPON' },
  { kind: 'receivables', label: 'Saldo Awal Piutang', hint: 'NAMA PELANGGAN + NILAI/SISA (pelanggan harus sudah diimpor)' },
];

/**
 * Migrasi dari iPos: buka file Excel iPos (export atau template impor) → Simpan Sebagai CSV → unggah di sini.
 * Kode barang yang sudah ada diperbarui, sisanya ditambahkan.
 */
const IposImportPanel: React.FC<IposImportPanelProps> = ({ onImportItems, onImportContacts, onImportOpeningReceivables }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>('items');
  const [result, setResult] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const available: Record<Kind, boolean> = {
    items: Boolean(onImportItems),
    customers: Boolean(onImportContacts),
    suppliers: Boolean(onImportContacts),
    receivables: Boolean(onImportOpeningReceivables),
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setResult('');
    try {
      const text = await file.text();
      if (kind === 'items' && onImportItems) {
        const parsed = parseIposItems(text);
        if (parsed.rows.length === 0) { setResult(parsed.errors.join('\n') || 'Tidak ada baris yang bisa diimpor.'); return; }
        const outcome = onImportItems(parsed.rows);
        setResult([`Barang: ${outcome.added} baru, ${outcome.updated} diperbarui${parsed.mergedUnits ? `, ${parsed.mergedUnits} satuan tambahan` : ''}.`, ...parsed.errors, ...outcome.errors].join('\n'));
      } else if ((kind === 'customers' || kind === 'suppliers') && onImportContacts) {
        const parsed = parseIposContacts(text, kind === 'customers' ? 'customer' : 'supplier');
        const outcome = kind === 'customers' ? onImportContacts(parsed.rows as Customer[], []) : onImportContacts([], parsed.rows as Supplier[]);
        const added = kind === 'customers' ? outcome.customers : outcome.suppliers;
        setResult([`${added} ${kind === 'customers' ? 'pelanggan' : 'supplier'} ditambahkan (${parsed.rows.length - added} nama sudah ada, dilewati).`, ...parsed.errors].join('\n'));
      } else if (kind === 'receivables' && onImportOpeningReceivables) {
        const parsed = parseOpeningReceivables(text);
        if (parsed.rows.length === 0) { setResult(parsed.errors.join('\n') || 'Tidak ada baris.'); return; }
        if (!window.confirm(`Tambahkan saldo awal piutang untuk ${parsed.rows.length} pelanggan? Jangan impor file yang sama dua kali.`)) return;
        const outcome = await onImportOpeningReceivables(parsed.rows);
        setResult([`Saldo awal piutang tercatat untuk ${outcome.applied} pelanggan.`, ...(outcome.missing.length ? [`Pelanggan tidak ditemukan: ${outcome.missing.join(', ')}`] : []), ...parsed.errors].join('\n'));
      }
    } catch (error: any) {
      setResult(error?.message || 'Gagal membaca file.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800">Pindah dari iPos</h3>
        <p className="text-xs text-slate-400 mt-0.5">Di iPos: Pengaturan → Export ke Excel (atau pakai template impor iPos). Buka di Excel → <b>Simpan Sebagai CSV</b> → unggah di sini.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {KINDS.filter(entry => available[entry.kind]).map(entry => (
          <button key={entry.kind} type="button" onClick={() => setKind(entry.kind)} className={`px-3 py-2 rounded-lg text-xs font-semibold ${kind === entry.kind ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{entry.label}</button>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">Kolom yang dibaca: {KINDS.find(entry => entry.kind === kind)?.hint}</p>
      <button type="button" disabled={busy || !available[kind]} onClick={() => inputRef.current?.click()} className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs flex items-center gap-2 disabled:bg-slate-300">
        <FileUp size={16} /> {busy ? 'Memproses...' : 'Pilih file CSV iPos'}
      </button>
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" aria-label="File CSV iPos" onChange={event => { const file = event.target.files?.[0]; if (file) void handleFile(file); }} />
      {result && <pre className="text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 whitespace-pre-wrap max-h-48 overflow-y-auto">{result}</pre>}
    </div>
  );
};

export default IposImportPanel;
