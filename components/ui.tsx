/** Komponen UI kecil yang dipakai halaman mode Lengkap agar tampilannya seragam. */
import React from 'react';
import { X } from 'lucide-react';

export const formatRp = (value: number) => `Rp ${Math.round(value || 0).toLocaleString('id-ID')}`;

export const formatDateTime = (iso?: string) => {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const PageHeader: React.FC<{ title: string; subtitle?: string; icon?: React.ReactNode; actions?: React.ReactNode }> = ({ title, subtitle, icon, actions }) => (
  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div className="flex items-center gap-3">
      {icon && <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-sm">{icon}</div>}
      <div>
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

export const Card: React.FC<{ children: React.ReactNode; className?: string; title?: string; actions?: React.ReactNode }> = ({ children, className = '', title, actions }) => (
  <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>
    {(title || actions) && (
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100">
        {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
        {actions}
      </div>
    )}
    <div className="p-5">{children}</div>
  </section>
);

export const StatTile: React.FC<{ label: string; value: string; tone?: 'default' | 'good' | 'warn' | 'bad'; hint?: string }> = ({ label, value, tone = 'default', hint }) => {
  const toneClass = { default: 'text-slate-900', good: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-red-700' }[tone];
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${toneClass}`}>{value}</p>
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
};

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; icon?: React.ReactNode }> = ({ variant = 'primary', icon, className = '', children, ...props }) => {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-300',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:text-slate-300',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300',
    ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-300',
  };
  return (
    <button type="button" {...props} className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed ${styles[variant]} ${className}`}>
      {icon}{children}
    </button>
  );
};

export const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string; className?: string }> = ({ label, children, hint, className = '' }) => (
  <label className={`block ${className}`}>
    <span className="text-xs font-semibold text-slate-600 block mb-1.5">{label}</span>
    {children}
    {hint && <span className="text-[11px] text-slate-400 block mt-1">{hint}</span>}
  </label>
);

export const inputClass = 'w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode }> = ({ title, onClose, children, wide, footer }) => (
  <div className="fixed inset-0 z-[180] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={title}>
    <div className={`bg-white w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[92vh] rounded-2xl shadow-2xl flex flex-col`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <button type="button" onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Tutup"><X size={18} /></button>
      </div>
      <div className="p-5 overflow-y-auto flex-1">{children}</div>
      {footer && <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 shrink-0">{footer}</div>}
    </div>
  </div>
);

export const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="py-10 text-center text-sm text-slate-400">{text}</div>
);

export const Table: React.FC<{ headers: React.ReactNode[]; children: React.ReactNode; alignRight?: number[] }> = ({ headers, children, alignRight = [] }) => (
  <div className="overflow-x-auto -mx-5">
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
          {headers.map((header, index) => <th key={index} className={`px-5 py-2.5 font-semibold whitespace-nowrap ${alignRight.includes(index) ? 'text-right' : ''}`}>{header}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">{children}</tbody>
    </table>
  </div>
);

export const PAYMENT_METHOD_OPTIONS = ['TUNAI', 'TRANSFER', 'QRIS', 'DEBIT'];

/** Tanggal lokal hari ini (YYYY-MM-DD). */
export const todayKey = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** Rentang ISO (inklusif seharian) dari dua tanggal lokal YYYY-MM-DD. */
export const rangeToIso = (from: string, to: string) => ({
  from: new Date(`${from}T00:00:00`).toISOString(),
  to: new Date(`${to}T23:59:59.999`).toISOString(),
});
