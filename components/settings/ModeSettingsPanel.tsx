import React, { useEffect, useState } from 'react';
import { Layers, Check } from 'lucide-react';
import { AppSettings } from '../../types';
import { encodeCostCipher } from '../../services/code128';

interface ModeSettingsPanelProps {
  appSettings?: AppSettings;
  onSave?: (patch: Partial<AppSettings>) => boolean;
}

const FULL_FEATURES = [
  'Kasir: tahan transaksi (F3/F4), pembayaran campuran (tunai + QRIS + deposit + kredit), diskon per barang (10+5), mekanik per baris, nomor seri & garansi, layar pelanggan',
  'Servis / Work Order: estimasi → dikerjakan → selesai → faktur, dengan DP',
  'Jasa tanpa stok, komisi mekanik, deposit pelanggan',
  'Promo terjadwal (hari/jam) & Beli X Gratis Y',
  'Multi gudang & transfer stok, retur pembelian ke supplier',
  'Jurnal otomatis, buku besar, neraca, laba rugi, jurnal manual, tutup buku',
  'Laporan lengkap, cetak label barcode, impor dari iPos, backup otomatis',
];

/** Pilih mode aplikasi (Simple/Lengkap) dan pengaturan toko mode Lengkap. Tersinkron ke semua perangkat. */
const ModeSettingsPanel: React.FC<ModeSettingsPanelProps> = ({ appSettings, onSave }) => {
  const mode = appSettings?.mode === 'LENGKAP' ? 'LENGKAP' : 'SIMPLE';
  const [minMargin, setMinMargin] = useState(appSettings?.minMarginPercent ?? 0);
  const [cipher, setCipher] = useState(appSettings?.costCipher || '');
  const [commission, setCommission] = useState(appSettings?.defaultCommissionPercent ?? 0);

  useEffect(() => {
    setMinMargin(appSettings?.minMarginPercent ?? 0);
    setCipher(appSettings?.costCipher || '');
    setCommission(appSettings?.defaultCommissionPercent ?? 0);
  }, [appSettings?.minMarginPercent, appSettings?.costCipher, appSettings?.defaultCommissionPercent]);

  const cipherLetters = cipher.toUpperCase().replace(/[^A-Z]/g, '');
  const cipherValid = cipherLetters.length === 0 || (cipherLetters.length === 10 && new Set(cipherLetters).size === 10);

  const choose = (next: 'SIMPLE' | 'LENGKAP') => {
    if (!onSave || next === mode) return;
    const message = next === 'LENGKAP'
      ? 'Aktifkan mode LENGKAP untuk semua perangkat toko? Menu dan fitur tambahan akan muncul. Data tidak berubah.'
      : 'Kembali ke mode SIMPLE? Menu tambahan disembunyikan, tetapi semua data (WO, deposit, gudang, jurnal) tetap tersimpan.';
    if (window.confirm(message)) onSave({ mode: next });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-indigo-600 text-white rounded-xl"><Layers size={18} /></div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">Mode Aplikasi</h3>
          <p className="text-xs text-slate-400 mt-0.5">Berlaku untuk semua perangkat toko (tersinkron). Hanya owner/manager yang bisa mengganti.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(['SIMPLE', 'LENGKAP'] as const).map(option => (
          <button
            key={option}
            type="button"
            disabled={!onSave}
            onClick={() => choose(option)}
            aria-pressed={mode === option}
            className={`text-left p-4 rounded-2xl border-2 transition-all ${mode === option ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'} disabled:cursor-not-allowed`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">{option === 'SIMPLE' ? 'Mode Simple' : 'Mode Lengkap'}</span>
              {mode === option && <span className="flex items-center gap-1 text-xs font-semibold text-indigo-700"><Check size={14} /> Aktif</span>}
            </div>
            <p className="text-xs text-slate-500 mt-1">{option === 'SIMPLE' ? 'Kasir cepat, stok, pembelian, laporan inti — tampilan seperti biasa.' : 'Fitur bengkel & toko lengkap ala ERP.'}</p>
          </button>
        ))}
      </div>
      {mode === 'SIMPLE' ? (
        <ul className="text-xs text-slate-500 list-disc pl-5 space-y-1">
          <li className="font-semibold text-slate-600 list-none -ml-5">Yang didapat di mode Lengkap:</li>
          {FULL_FEATURES.map(feature => <li key={feature}>{feature}</li>)}
        </ul>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
          <label className="block text-xs font-medium text-slate-500">Peringatan margin minimal (%)
            <input type="number" min={0} max={100} className="mt-1 w-full p-2.5 border border-slate-300 rounded-xl text-sm" value={minMargin} onChange={event => setMinMargin(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} />
            <span className="block text-[11px] text-slate-400 mt-1">Kasir diberi peringatan bila margin baris di bawah angka ini (0 = hanya cek rugi).</span>
          </label>
          <label className="block text-xs font-medium text-slate-500">Komisi default jasa (%)
            <input type="number" min={0} max={100} className="mt-1 w-full p-2.5 border border-slate-300 rounded-xl text-sm" value={commission} onChange={event => setCommission(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} />
            <span className="block text-[11px] text-slate-400 mt-1">Dipakai bila mekanik & jasa tidak punya komisi sendiri.</span>
          </label>
          <label className="block text-xs font-medium text-slate-500">Sandi harga modal (10 huruf berbeda)
            <input className={`mt-1 w-full p-2.5 border rounded-xl text-sm uppercase ${cipherValid ? 'border-slate-300' : 'border-red-400'}`} maxLength={10} placeholder="Mis. HULIOPRAKS" value={cipher} onChange={event => setCipher(event.target.value)} />
            <span className="block text-[11px] text-slate-400 mt-1">{cipherLetters.length === 10 && cipherValid ? `Contoh: modal 45.000 → ${encodeCostCipher(45000, cipherLetters)}` : 'Huruf ke-1 = angka 0, ke-2 = angka 1, dst. Dicetak di label barcode.'}</span>
          </label>
          <div className="md:col-span-3">
            <button
              type="button"
              disabled={!onSave || !cipherValid}
              onClick={() => onSave?.({ minMarginPercent: minMargin, defaultCommissionPercent: commission, costCipher: cipherLetters || undefined })}
              className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold disabled:bg-slate-300"
            >Simpan pengaturan mode Lengkap</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModeSettingsPanel;
