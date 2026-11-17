import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Customer, PaymentMethodCode, SalePayment } from '../types';

const rp = (value: number) => `Rp ${Math.round(value || 0).toLocaleString('id-ID')}`;
const NON_CASH: PaymentMethodCode[] = ['QRIS', 'TRANSFER', 'DEBIT'];

export interface SplitPaymentResult {
  payments: SalePayment[];
  cashReceived: number;
  change: number;
}

interface SplitPaymentPanelProps {
  total: number;
  customer: Customer;
  /** Deposit yang langsung dipakai (mis. DP Work Order). */
  defaultDeposit?: number;
  isSaving: boolean;
  onSubmit: (result: SplitPaymentResult) => void;
}

const numberInput = 'w-full p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-lg font-bold outline-none focus:border-blue-600';

/**
 * Pembayaran campuran (mode Lengkap): deposit + non-tunai + kredit + tunai dalam satu transaksi.
 * Sisa tagihan setelah metode lain dibayar tunai; kembalian dihitung dari uang tunai yang diterima.
 */
const SplitPaymentPanel: React.FC<SplitPaymentPanelProps> = ({ total, customer, defaultDeposit = 0, isSaving, onSubmit }) => {
  const isRegistered = customer.id !== 'UMUM';
  const depositBalance = isRegistered ? customer.depositBalance || 0 : 0;
  const creditRoom = isRegistered && customer.creditLimit > 0 ? Math.max(0, customer.creditLimit - customer.currentDebt) : 0;

  const [deposit, setDeposit] = useState(0);
  const [nonCashMethod, setNonCashMethod] = useState<PaymentMethodCode>('QRIS');
  const [nonCash, setNonCash] = useState(0);
  const [credit, setCredit] = useState(0);
  const [cashReceived, setCashReceived] = useState(0);

  useEffect(() => {
    const initialDeposit = Math.min(defaultDeposit, depositBalance, total);
    setDeposit(initialDeposit);
    setNonCash(0);
    setCredit(0);
    setCashReceived(Math.max(0, total - initialDeposit));
  }, [total, defaultDeposit, depositBalance]);

  const cashDue = total - deposit - nonCash - credit;
  const change = Math.max(0, cashReceived - Math.max(0, cashDue));

  const error = useMemo(() => {
    if (deposit > depositBalance) return `Deposit tersedia hanya ${rp(depositBalance)}.`;
    if (credit > 0 && !isRegistered) return 'Kredit hanya untuk pelanggan terdaftar.';
    if (credit > creditRoom) return `Sisa limit kredit hanya ${rp(creditRoom)}.`;
    if (cashDue < 0) return `Pembayaran non-tunai melebihi total sebesar ${rp(-cashDue)}.`;
    if (cashDue > 0 && cashReceived < cashDue) return `Uang tunai kurang ${rp(cashDue - cashReceived)}.`;
    return null;
  }, [deposit, depositBalance, credit, isRegistered, creditRoom, cashDue, cashReceived]);

  const setOnly = (patch: { deposit?: number; nonCash?: number; credit?: number }) => {
    const next = { deposit: 0, nonCash: 0, credit: 0, ...patch };
    setDeposit(next.deposit);
    setNonCash(next.nonCash);
    setCredit(next.credit);
    setCashReceived(Math.max(0, total - next.deposit - next.nonCash - next.credit));
  };

  const submit = () => {
    if (error) return;
    const payments: SalePayment[] = [];
    if (deposit > 0) payments.push({ method: 'DEPOSIT', amount: Math.round(deposit) });
    if (nonCash > 0) payments.push({ method: nonCashMethod, amount: Math.round(nonCash) });
    if (credit > 0) payments.push({ method: 'KREDIT', amount: Math.round(credit) });
    if (cashDue > 0) payments.push({ method: 'TUNAI', amount: Math.round(cashDue) });
    onSubmit({ payments, cashReceived: cashDue > 0 ? Math.round(cashReceived) : 0, change: Math.round(change) });
  };

  const amountField = (label: string, value: number, onChange: (value: number) => void, hint?: string, disabled = false) => (
    <label className="block">
      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}{hint && <span className="normal-case font-medium text-slate-400"> — {hint}</span>}</span>
      <input type="number" min={0} disabled={disabled} className={`${numberInput} mt-1 disabled:opacity-40`} value={value || ''} onChange={event => onChange(Math.max(0, Math.round(Number(event.target.value) || 0)))} />
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setOnly({})} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold">Semua Tunai</button>
        <button type="button" onClick={() => setOnly({ nonCash: total })} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold">Semua {nonCashMethod}</button>
        {depositBalance > 0 && <button type="button" onClick={() => setOnly({ deposit: Math.min(depositBalance, total) })} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold">Pakai Deposit</button>}
        {creditRoom > 0 && <button type="button" onClick={() => setOnly({ deposit, credit: Math.max(0, Math.min(creditRoom, total - deposit)) })} className="px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold">Sisa ke Kredit</button>}
      </div>

      {depositBalance > 0 && amountField('Deposit', deposit, value => { setDeposit(value); setCashReceived(Math.max(0, total - value - nonCash - credit)); }, `saldo ${rp(depositBalance)}`)}

      <div className="grid grid-cols-3 gap-2 items-end">
        <label className="block col-span-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Non-tunai</span>
          <select className={`${numberInput} mt-1 text-sm`} value={nonCashMethod} onChange={event => setNonCashMethod(event.target.value as PaymentMethodCode)}>
            {NON_CASH.map(method => <option key={method} value={method}>{method}</option>)}
          </select>
        </label>
        <div className="col-span-2">{amountField('Nominal non-tunai', nonCash, value => { setNonCash(value); setCashReceived(Math.max(0, total - deposit - value - credit)); })}</div>
      </div>

      {isRegistered && customer.creditLimit > 0 && amountField('Kredit (piutang)', credit, value => { setCredit(value); setCashReceived(Math.max(0, total - deposit - nonCash - value)); }, `sisa limit ${rp(creditRoom)}`)}

      <div className="p-4 bg-slate-100 rounded-2xl space-y-2">
        <div className="flex justify-between text-sm font-bold text-slate-600"><span>Sisa dibayar tunai</span><span>{rp(Math.max(0, cashDue))}</span></div>
        {amountField('Uang tunai diterima', cashReceived, setCashReceived, undefined, cashDue <= 0)}
        {cashDue > 0 && (
          <div className="flex gap-2">
            {[cashDue, 50000, 100000].map((value, index) => (
              <button key={index} type="button" onClick={() => setCashReceived(Math.round(value))} className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-bold">{index === 0 ? 'PAS' : `${value / 1000}K`}</button>
            ))}
          </div>
        )}
        <div className="flex justify-between text-lg font-black text-emerald-700"><span>KEMBALIAN</span><span>{rp(change)}</span></div>
      </div>

      {error && <div className="flex items-center gap-2 text-red-600 text-xs font-bold bg-red-50 border border-red-200 p-3 rounded-xl"><AlertTriangle size={14} />{error}</div>}

      <button
        type="button"
        disabled={Boolean(error) || isSaving}
        onClick={submit}
        className="w-full py-4 text-white font-black text-sm rounded-2xl shadow-xl border-b-4 flex items-center justify-center gap-2 active:scale-95 bg-emerald-600 hover:bg-emerald-700 border-emerald-800 disabled:bg-slate-300 disabled:border-slate-400 disabled:text-slate-500"
      >
        {isSaving ? 'MENYIMPAN...' : 'SELESAI & SIMPAN'} <ChevronRight size={20} />
      </button>
    </div>
  );
};

export default SplitPaymentPanel;
