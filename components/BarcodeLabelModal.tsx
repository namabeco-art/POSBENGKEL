import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import { Item } from '../types';
import { Button, Field, inputClass, Modal } from './ui';
import { code128Svg, encodeCostCipher } from '../services/code128';
import { getSellPrice } from '../services/pricing';

interface BarcodeLabelModalProps {
  items: Item[];
  costCipher?: string;
  onClose: () => void;
}

const LAYOUTS = {
  a4: { label: 'A4 — 3 kolom (63 x 32 mm)', page: 'A4', width: '63mm', height: '32mm', columns: 3 },
  roll50: { label: 'Roll thermal 50 x 30 mm', page: '50mm 30mm', width: '50mm', height: '30mm', columns: 1 },
  roll38: { label: 'Roll thermal 38 x 25 mm', page: '38mm 25mm', width: '38mm', height: '25mm', columns: 1 },
} as const;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

/** Cetak label barcode/rak (Code 128) untuk printer label, inkjet, atau laser. */
const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({ items, costCipher, onClose }) => {
  const [copies, setCopies] = useState<Record<string, number>>(() => Object.fromEntries(items.map(item => [item.id, 1])));
  const [layout, setLayout] = useState<keyof typeof LAYOUTS>('a4');
  const [showPrice, setShowPrice] = useState(true);
  const [showCipher, setShowCipher] = useState(Boolean(costCipher));
  const cipherReady = Boolean(costCipher && costCipher.length >= 10);

  const print = () => {
    const spec = LAYOUTS[layout];
    const labels: string[] = [];
    const errors: string[] = [];
    items.forEach(item => {
      const value = item.barcode || item.code;
      let svg = '';
      try { svg = code128Svg(value); } catch { errors.push(item.name); return; }
      const price = getSellPrice(item, 1);
      const label = `<div class="label">
        <div class="name">${escapeHtml(item.name)}</div>
        <div class="bars">${svg}</div>
        <div class="code">${escapeHtml(value)}</div>
        <div class="row">${showPrice && price > 0 ? `<b>Rp ${Math.round(price).toLocaleString('id-ID')}</b>` : '<span></span>'}${showCipher && cipherReady ? `<span>${escapeHtml(encodeCostCipher(item.basePrice || 0, costCipher))}</span>` : ''}</div>
      </div>`;
      for (let i = 0; i < Math.max(0, copies[item.id] || 0); i += 1) labels.push(label);
    });
    if (errors.length) alert(`Barcode tidak valid (huruf non-ASCII) untuk: ${errors.join(', ')}`);
    if (labels.length === 0) return;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Label Barcode</title><style>
      @page { size: ${spec.page}; margin: ${layout === 'a4' ? '8mm' : '0'}; }
      body { margin: 0; font-family: Arial, sans-serif; }
      .sheet { display: grid; grid-template-columns: repeat(${spec.columns}, ${spec.width}); gap: ${layout === 'a4' ? '2mm' : '0'}; }
      .label { width: ${spec.width}; height: ${spec.height}; box-sizing: border-box; padding: 1.5mm 2mm; overflow: hidden; display: flex; flex-direction: column; page-break-inside: avoid; ${layout === 'a4' ? 'border: 0.2mm dashed #bbb;' : 'page-break-after: always;'} }
      .name { font-size: 7.5pt; font-weight: bold; line-height: 1.1; max-height: 2.2em; overflow: hidden; }
      .bars { flex: 1; min-height: 0; margin-top: 1mm; }
      .bars svg { width: 100%; height: 100%; }
      .code { font-size: 7pt; text-align: center; letter-spacing: 0.5px; }
      .row { display: flex; justify-content: space-between; font-size: 8pt; }
    </style></head><body><div class="sheet">${labels.join('')}</div><script>window.onload=()=>{window.print();}</script></body></html>`;
    const win = window.open('', '_blank', 'width=900,height=900');
    if (!win) return alert('Pop-up diblokir browser. Izinkan pop-up untuk mencetak label.');
    win.document.write(html);
    win.document.close();
  };

  const total = items.reduce((sum, item) => sum + Math.max(0, copies[item.id] || 0), 0);

  return (
    <Modal wide title={`Cetak label barcode (${items.length} barang)`} onClose={onClose} footer={<>
      <span className="mr-auto text-sm text-slate-500 self-center">{total} label</span>
      <Button variant="secondary" onClick={onClose}>Tutup</Button>
      <Button icon={<Printer size={16} />} disabled={total === 0} onClick={print}>Cetak</Button>
    </>}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Field label="Ukuran kertas">
          <select className={inputClass} value={layout} onChange={event => setLayout(event.target.value as keyof typeof LAYOUTS)}>
            {Object.entries(LAYOUTS).map(([key, spec]) => <option key={key} value={key}>{spec.label}</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={showPrice} onChange={event => setShowPrice(event.target.checked)} /> Tampilkan harga jual</label>
        <label className={`flex items-center gap-2 text-sm mt-6 ${cipherReady ? '' : 'opacity-50'}`} title={cipherReady ? '' : 'Atur sandi harga modal di Pengaturan → Mode Aplikasi'}>
          <input type="checkbox" disabled={!cipherReady} checked={showCipher && cipherReady} onChange={event => setShowCipher(event.target.checked)} /> Sandi harga modal
        </label>
      </div>
      <div className="space-y-2 max-h-[50vh] overflow-y-auto">
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-3 p-2 border border-slate-100 rounded-xl">
            <span className="flex-1 text-sm">{item.name} <span className="text-xs text-slate-400">{item.barcode || item.code}</span></span>
            <input aria-label={`Jumlah label ${item.name}`} type="number" min={0} className={`${inputClass} w-24`} value={copies[item.id] ?? 0} onChange={event => setCopies({ ...copies, [item.id]: Math.max(0, Math.round(Number(event.target.value) || 0)) })} />
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default BarcodeLabelModal;
