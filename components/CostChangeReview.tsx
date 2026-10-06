import React, { useMemo, useState } from 'react';
import { AlertTriangle, TrendingUp, X } from 'lucide-react';
import { Item, PriceChangeSource } from '../types';
import type { CostChange } from '../services/posOperations';
import { getMarginPercent, getSellPrice, roundPrice, scaleSellPricesToCost, type RoundingStep } from '../services/pricing';

interface CostChangeReviewProps {
  changes: CostChange[];
  items: Item[];
  referenceNo: string;
  onApply: (patches: Array<Partial<Item> & { id: string }>, source?: PriceChangeSource, note?: string) => void;
  onClose: () => void;
}

const rp = (value: number) => `Rp ${Math.round(value || 0).toLocaleString('id-ID')}`;

/**
 * Setelah barang diterima dengan harga modal baru, tampilkan dampaknya ke margin
 * dan tawarkan penyesuaian harga jual (markup dipertahankan) dalam satu klik.
 */
const CostChangeReview: React.FC<CostChangeReviewProps> = ({ changes, items, referenceNo, onApply, onClose }) => {
  const [rounding, setRounding] = useState<RoundingStep>(100);
  const rows = useMemo(() => changes.map(change => {
    const item = items.find(entry => entry.id === change.itemId);
    if (!item) return null;
    const currentSell = getSellPrice(item, 1);
    const marginNow = getMarginPercent(currentSell, change.newCost);
    const proposed = scaleSellPricesToCost(item.memberPrices, change.oldCost, change.newCost, rounding);
    const proposedSell = proposed[0] > 0 ? proposed[0] : roundPrice(currentSell, rounding);
    return {
      change,
      item,
      currentSell,
      marginNow,
      proposed,
      proposedSell,
      isLoss: currentSell > 0 && currentSell <= change.newCost,
      costUp: change.newCost > change.oldCost,
    };
  }).filter(Boolean) as Array<{
    change: CostChange; item: Item; currentSell: number; marginNow: number | null;
    proposed: number[]; proposedSell: number; isLoss: boolean; costUp: boolean;
  }>, [changes, items, rounding]);

  // Default: tandai barang yang modalnya naik (margin tergerus).
  const [selected, setSelected] = useState<Set<string>>(() => new Set(changes.filter(change => change.newCost > change.oldCost).map(change => change.itemId)));

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const apply = () => {
    const patches = rows
      .filter(row => selected.has(row.item.id) && row.change.oldCost > 0)
      .map(row => ({
        id: row.item.id,
        memberPrices: row.proposed,
        units: row.item.units?.map(unit => (unit.conversion === 1 && row.proposed[0] > 0 ? { ...unit, price: row.proposed[0] } : unit)),
      }));
    if (patches.length === 0) return onClose();
    onApply(patches, 'COST_REVIEW', `Penyesuaian harga jual setelah ${referenceNo}`);
    alert(`Harga jual ${patches.length} barang disesuaikan dengan modal baru.`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3" role="dialog" aria-modal="true" aria-label="Tinjau perubahan harga modal">
      <div className="bg-white w-full max-w-3xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-lg"><TrendingUp size={20} /></div>
            <div>
              <h3 className="font-bold text-slate-900">Harga modal berubah — cek harga jual</h3>
              <p className="text-xs text-slate-500 mt-0.5">{referenceNo}: modal rata-rata {rows.length} barang berubah. Pilih barang yang harga jualnya ingin disesuaikan agar markup tetap sama.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg" aria-label="Tutup"><X size={18} /></button>
        </div>
        <div className="px-5 pt-4 flex items-center gap-2 text-xs">
          <span className="text-slate-500">Pembulatan:</span>
          {([0, 100, 500, 1000] as RoundingStep[]).map(step => (
            <button key={step} type="button" onClick={() => setRounding(step)} className={`px-2.5 py-1 rounded-lg font-medium ${rounding === step ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {step === 0 ? 'Tanpa' : rp(step)}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-auto p-5">
          <table className="w-full text-xs min-w-[620px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-2 w-8"></th>
                <th className="p-2 text-left font-medium">Barang</th>
                <th className="p-2 text-right font-medium">Modal</th>
                <th className="p-2 text-right font-medium">Jual Lv1 sekarang</th>
                <th className="p-2 text-right font-medium">Margin sekarang</th>
                <th className="p-2 text-right font-medium">Usulan Jual Lv1</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.item.id} className={`border-t border-slate-100 ${row.isLoss ? 'bg-red-50' : ''}`}>
                  <td className="p-2 text-center">
                    <input type="checkbox" aria-label={`Sesuaikan ${row.item.name}`} checked={selected.has(row.item.id)} disabled={!(row.change.oldCost > 0)} onChange={() => toggle(row.item.id)} />
                  </td>
                  <td className="p-2"><p className="font-medium text-slate-800">{row.item.name}</p><p className="text-[11px] text-slate-400">{row.item.code}</p></td>
                  <td className={`p-2 text-right font-mono whitespace-nowrap ${row.costUp ? 'text-red-600' : 'text-emerald-600'}`}>{rp(row.change.oldCost)} → <b>{rp(row.change.newCost)}</b></td>
                  <td className="p-2 text-right font-mono">{rp(row.currentSell)}</td>
                  <td className={`p-2 text-right font-mono font-semibold ${row.isLoss ? 'text-red-600' : row.marginNow !== null && row.marginNow < 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {row.isLoss && <AlertTriangle size={12} className="inline mr-1" />}{row.marginNow === null ? '-' : `${row.marginNow.toFixed(1)}%`}
                  </td>
                  <td className="p-2 text-right font-mono font-semibold text-slate-900">{row.change.oldCost > 0 ? rp(row.proposedSell) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-5 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl">Nanti saja</button>
          <button type="button" onClick={apply} disabled={selected.size === 0} className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold rounded-xl">
            Sesuaikan harga jual ({selected.size} barang)
          </button>
        </div>
      </div>
    </div>
  );
};

export default CostChangeReview;
