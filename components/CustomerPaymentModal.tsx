import React, { useState } from 'react';
import { Wallet, X } from 'lucide-react';
import { Customer } from '../types';

interface CustomerPaymentModalProps {
  customer: Customer;
  onSubmit: (customerId: string, amount: number, method: string, note?: string) => Promise<void>;
  onClose: () => void;
}

const METHODS = ['Tunai', 'Transfer Bank', 'QRIS'];

/** Form pelunasan piutang pelanggan (sebagian atau penuh). */
const CustomerPaymentModal: React.FC<CustomerPaymentModalProps> = ({ customer, onSubmit, onClose }) => {
  const [amount, setAmount] = useState<number>(customer.currentDebt);
  const [method, setMethod] = useState(METHODS[0]);
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!(amount > 0)) return alert('Masukkan nominal pembayaran.');
    if (amount > customer.currentDebt) return alert('Nominal melebihi sisa piutang.');
    setIsSaving(true);
    try {
      await onSubmit(customer.id, amount, method, note.trim() || undefined);
      alert(`Pembayaran Rp ${amount.toLocaleString('id-ID')} dari ${customer.name} tercatat.`);
      onClose();
    } catch (error: any) {
      alert(error?.message || 'Pembayaran gagal disimpan.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="Terima pembayaran piutang">
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg"><Wallet size={20} /></div>
            <div>
              <h3 className="font-bold text-slate-900">Terima Pembayaran Piutang</h3>
              <p className="text-xs text-slate-500">{customer.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg" aria-label="Tutup"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-800">
            Sisa piutang: <span className="font-bold">Rp {customer.currentDebt.toLocaleString('id-ID')}</span>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Nominal dibayar (Rp)</span>
            <input
              type="number"
              min={1}
              max={customer.currentDebt}
              autoFocus
              className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-semibold outline-none focus:border-emerald-500"
              value={amount || ''}
              onChange={event => setAmount(parseInt(event.target.value, 10) || 0)}
            />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAmount(customer.currentDebt)} className="px-3 py-1.5 text-xs font-medium bg-slate-100 rounded-lg hover:bg-slate-200">Lunas</button>
            <button type="button" onClick={() => setAmount(Math.round(customer.currentDebt / 2))} className="px-3 py-1.5 text-xs font-medium bg-slate-100 rounded-lg hover:bg-slate-200">50%</button>
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500">Metode</span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {METHODS.map(option => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMethod(option)}
                  className={`py-2.5 rounded-xl text-xs font-semibold border ${method === option ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
                >
                  {option}
                </button>
              ))}
            </div>
            {method === 'Tunai' && <p className="mt-1 text-[11px] text-slate-500">Uang tunai masuk ke rekap shift kasir yang sedang Anda buka.</p>}
          </div>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Catatan (opsional)</span>
            <input className="mt-1 w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500" value={note} onChange={event => setNote(event.target.value)} placeholder="Mis. cicilan ke-2" />
          </label>
        </div>
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl">Batal</button>
          <button type="submit" disabled={isSaving} className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-xl">
            {isSaving ? 'Menyimpan...' : 'Simpan Pembayaran'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CustomerPaymentModal;
