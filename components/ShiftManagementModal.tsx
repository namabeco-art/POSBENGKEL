import React, { useState } from 'react';
import { CashSession, User } from '../types';
import { X, Calculator, AlertCircle, PlayCircle, StopCircle } from 'lucide-react';

interface ShiftManagementModalProps {
  currentUser: User;
  activeSession?: CashSession;
  onStartShift: (openingCash: number) => void;
  onEndShift: (closingCash: number, notes: string) => void;
  onClose: () => void;
}

const ShiftManagementModal: React.FC<ShiftManagementModalProps> = ({ currentUser, activeSession, onStartShift, onEndShift, onClose }) => {
  const [cashAmount, setCashAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(cashAmount.replace(/[^0-9]/g, '')) || 0;
    if (activeSession) {
      onEndShift(amount, notes);
    } else {
      onStartShift(amount);
    }
  };

  const formatRupiah = (val: string) => {
    const num = val.replace(/[^0-9]/g, '');
    if (!num) return '';
    return new Intl.NumberFormat('id-ID').format(Number(num));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-800">
              {activeSession ? 'Akhiri Shift Kasir' : 'Mulai Shift Kasir'}
            </h2>
            <p className="text-sm font-medium text-slate-500 mt-1">
              Kasir: {currentUser.name}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition-colors text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {activeSession ? (
            <div className="bg-blue-50 text-blue-800 p-4 rounded-xl flex items-start gap-3 border border-blue-100/50">
              <InfoIcon />
              <div>
                <p className="text-sm font-bold">Blind Close Aktif</p>
                <p className="text-xs font-medium opacity-80 mt-1">Hitung seluruh uang fisik di laci dan masukkan totalnya. Sistem akan menghitung selisih secara otomatis.</p>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl flex items-start gap-3 border border-emerald-100/50">
              <Calculator size={20} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold">Persiapan Shift Baru</p>
                <p className="text-xs font-medium opacity-80 mt-1">Masukkan total saldo awal tunai yang ada di dalam laci kasir saat ini.</p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                {activeSession ? 'Total Uang Fisik (Laci)' : 'Saldo Modal Awal'}
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">Rp</span>
                <input
                  type="text"
                  required
                  value={cashAmount}
                  onChange={(e) => setCashAmount(formatRupiah(e.target.value))}
                  placeholder="0"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-12 pr-4 font-black flex-1 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-lg"
                />
              </div>
            </div>

            {activeSession && (
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Catatan Shift (Opsional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ada kejadian khusus selama shift?"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none h-20 text-sm"
                />
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className={`w-full py-3.5 rounded-xl font-black flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                activeSession 
                  ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]' 
                  : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]'
              }`}
            >
              {activeSession ? (
                <><StopCircle size={18} /> TTP SHIFT KASIR</>
              ) : (
                <><PlayCircle size={18} /> MULAI SHIFT BARU</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const InfoIcon = () => <Info size={20} className="mt-0.5 shrink-0" />;
import { Info } from 'lucide-react';

export default ShiftManagementModal;
