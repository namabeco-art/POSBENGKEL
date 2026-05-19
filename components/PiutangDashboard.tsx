import React, { useMemo, useState } from 'react';
import {
  DollarSign, AlertTriangle, Clock, Users, Search,
  Phone, MessageSquare, CheckCircle2, ArrowRight, Filter
} from 'lucide-react';
import { Customer, Sale } from '../types';

interface PiutangDashboardProps {
  customers: Customer[];
  sales: Sale[];
}

/**
 * Piutang (Receivables) Dashboard — #2
 * Shows customers with outstanding debt, aging analysis, and WhatsApp reminder.
 */
const PiutangDashboard: React.FC<PiutangDashboardProps> = ({ customers, sales }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'overdue' | 'high'>('all');

  const piutangData = useMemo(() => {
    return customers
      .filter(c => c.currentDebt > 0)
      .map(customer => {
        // Find last credit sale for this customer
        const creditSales = sales.filter(s => s.customerId === customer.id && s.paymentType === 'KREDIT');
        const lastCreditSale = creditSales[0]; // sales are sorted newest first
        const oldestUnpaid = creditSales[creditSales.length - 1];
        
        let daysSinceLastCredit = 0;
        if (oldestUnpaid) {
          try {
            const parts = oldestUnpaid.date.split(' ')[0].split('/');
            const saleDate = new Date(+parts[2], +parts[1] - 1, +parts[0]);
            daysSinceLastCredit = Math.floor((Date.now() - saleDate.getTime()) / (1000 * 60 * 60 * 24));
          } catch { /* ignore */ }
        }

        const isOverdue = daysSinceLastCredit > 30;
        const isHigh = customer.currentDebt > 1000000;
        const utilizationPercent = customer.creditLimit > 0 ? Math.round((customer.currentDebt / customer.creditLimit) * 100) : 100;

        return {
          ...customer,
          daysSinceLastCredit,
          isOverdue,
          isHigh,
          utilizationPercent,
          totalCreditSales: creditSales.length,
        };
      })
      .sort((a, b) => b.currentDebt - a.currentDebt);
  }, [customers, sales]);

  const filtered = useMemo(() => {
    let result = piutangData;
    if (filter === 'overdue') result = result.filter(c => c.isOverdue);
    if (filter === 'high') result = result.filter(c => c.isHigh);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(term) || c.phone.includes(term));
    }
    return result;
  }, [piutangData, filter, searchTerm]);

  const summary = useMemo(() => ({
    totalPiutang: piutangData.reduce((sum, c) => sum + c.currentDebt, 0),
    totalCustomers: piutangData.length,
    overdueCount: piutangData.filter(c => c.isOverdue).length,
    overdueAmount: piutangData.filter(c => c.isOverdue).reduce((sum, c) => sum + c.currentDebt, 0),
  }), [piutangData]);

  const sendWhatsAppReminder = (customer: typeof piutangData[0]) => {
    const message = encodeURIComponent(
      `Halo ${customer.name}, ini reminder dari bengkel kami.\n\n` +
      `Sisa tagihan Anda: Rp ${customer.currentDebt.toLocaleString()}\n` +
      `Sudah ${customer.daysSinceLastCredit} hari sejak transaksi terakhir.\n\n` +
      `Mohon segera dilunasi. Terima kasih! 🙏`
    );
    const phone = customer.phone.replace(/[^0-9]/g, '').replace(/^0/, '62');
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
  };

  if (piutangData.length === 0) {
    return (
      <div className="text-center py-16">
        <CheckCircle2 size={48} className="mx-auto text-emerald-300 mb-4" />
        <h3 className="text-lg font-semibold text-slate-700">Tidak Ada Piutang</h3>
        <p className="text-sm text-slate-400 mt-1">Semua pelanggan sudah lunas. Bagus!</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2"><DollarSign size={16} className="text-indigo-500"/><span className="text-xs font-medium text-slate-500">Total Piutang</span></div>
          <p className="text-xl font-bold text-indigo-700">Rp {(summary.totalPiutang / 1000).toFixed(0)}rb</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2"><Users size={16} className="text-slate-500"/><span className="text-xs font-medium text-slate-500">Pelanggan</span></div>
          <p className="text-xl font-bold text-slate-700">{summary.totalCustomers}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle size={16} className="text-red-500"/><span className="text-xs font-medium text-slate-500">Jatuh Tempo</span></div>
          <p className="text-xl font-bold text-red-600">{summary.overdueCount}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2"><Clock size={16} className="text-amber-500"/><span className="text-xs font-medium text-slate-500">Overdue Amount</span></div>
          <p className="text-xl font-bold text-amber-600">Rp {(summary.overdueAmount / 1000).toFixed(0)}rb</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
          <input className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Cari pelanggan..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setFilter('all')} className={`px-3 py-2 rounded-lg text-xs font-medium ${filter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Semua</button>
          <button onClick={() => setFilter('overdue')} className={`px-3 py-2 rounded-lg text-xs font-medium ${filter === 'overdue' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Jatuh Tempo</button>
          <button onClick={() => setFilter('high')} className={`px-3 py-2 rounded-lg text-xs font-medium ${filter === 'high' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Hutang Besar</button>
        </div>
      </div>

      {/* Customer List */}
      <div className="space-y-3">
        {filtered.map(customer => (
          <div key={customer.id} className={`bg-white p-4 rounded-xl border shadow-sm transition-all hover:shadow-md ${customer.isOverdue ? 'border-red-200' : 'border-slate-200'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-slate-800 text-sm truncate">{customer.name}</h4>
                  {customer.isOverdue && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-semibold shrink-0">OVERDUE</span>}
                </div>
                <p className="text-xs text-slate-400">{customer.phone} • Level {customer.level}</p>
                <div className="flex items-center gap-4 mt-2">
                  <div>
                    <p className="text-xs text-slate-400">Hutang</p>
                    <p className="text-base font-bold text-slate-900">Rp {customer.currentDebt.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Umur</p>
                    <p className={`text-sm font-semibold ${customer.daysSinceLastCredit > 30 ? 'text-red-600' : customer.daysSinceLastCredit > 14 ? 'text-amber-600' : 'text-slate-600'}`}>
                      {customer.daysSinceLastCredit} hari
                    </p>
                  </div>
                  {customer.creditLimit > 0 && (
                    <div>
                      <p className="text-xs text-slate-400">Limit</p>
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${customer.utilizationPercent > 80 ? 'bg-red-500' : customer.utilizationPercent > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, customer.utilizationPercent)}%` }} />
                        </div>
                        <span className="text-[10px] text-slate-400">{customer.utilizationPercent}%</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex flex-col gap-2 shrink-0">
                {customer.phone && customer.phone !== '-' && (
                  <button
                    onClick={() => sendWhatsAppReminder(customer)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium hover:bg-emerald-100 transition-all"
                  >
                    <MessageSquare size={14}/> WA
                  </button>
                )}
                <a
                  href={`tel:${customer.phone}`}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-xs font-medium hover:bg-slate-100 transition-all"
                >
                  <Phone size={14}/> Telp
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PiutangDashboard;
