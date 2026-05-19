import React, { useMemo, useState } from 'react';
import {
  FileText, Download, Calendar, DollarSign, TrendingUp,
  CheckCircle2, AlertTriangle, Info
} from 'lucide-react';
import { Sale } from '../types';

interface LaporanPajakProps {
  sales: Sale[];
}

const PAJAK_UMKM_RATE = 0.005; // 0.5% dari omzet bruto
const BATAS_OMZET_TAHUNAN = 500_000_000; // Rp 500jt batas UMKM

/**
 * Laporan Pajak UMKM Sederhana
 * PPh Final UMKM = 0.5% x Omzet Bruto (PP 55/2022)
 * Berlaku untuk UMKM dengan omzet ≤ Rp 500jt/tahun
 */
const LaporanPajak: React.FC<LaporanPajakProps> = ({ sales }) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Parse sales by month
  const monthlyData = useMemo(() => {
    const months: { month: number; label: string; omzet: number; pajak: number; count: number }[] = [];

    for (let m = 0; m < 12; m++) {
      const monthSales = sales.filter(sale => {
        try {
          const parts = sale.date.split(' ')[0].split('/');
          const saleDate = new Date(+parts[2], +parts[1] - 1, +parts[0]);
          return saleDate.getFullYear() === selectedYear && saleDate.getMonth() === m;
        } catch { return false; }
      });

      const omzet = monthSales.reduce((sum, s) => sum + s.total, 0);
      months.push({
        month: m,
        label: new Date(selectedYear, m).toLocaleDateString('id-ID', { month: 'long' }),
        omzet,
        pajak: Math.round(omzet * PAJAK_UMKM_RATE),
        count: monthSales.length,
      });
    }

    return months;
  }, [sales, selectedYear]);

  const yearSummary = useMemo(() => {
    const totalOmzet = monthlyData.reduce((sum, m) => sum + m.omzet, 0);
    const totalPajak = monthlyData.reduce((sum, m) => sum + m.pajak, 0);
    const totalTransactions = monthlyData.reduce((sum, m) => sum + m.count, 0);
    const isUnderLimit = totalOmzet <= BATAS_OMZET_TAHUNAN;
    return { totalOmzet, totalPajak, totalTransactions, isUnderLimit };
  }, [monthlyData]);

  const exportPajakCSV = () => {
    const header = 'Bulan,Omzet Bruto,Pajak (0.5%),Jumlah Transaksi\n';
    const rows = monthlyData.map(m => `"${m.label}",${m.omzet},${m.pajak},${m.count}`).join('\n');
    const footer = `\n"TOTAL TAHUN ${selectedYear}",${yearSummary.totalOmzet},${yearSummary.totalPajak},${yearSummary.totalTransactions}`;
    const blob = new Blob([header + rows + footer], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `laporan-pajak-umkm-${selectedYear}.csv`;
    link.click();
  };

  return (
    <div className="space-y-5">
      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <Info size={18} className="text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-blue-800">PPh Final UMKM (PP 55/2022)</p>
          <p className="text-xs text-blue-600 mt-1">Tarif 0.5% dari omzet bruto per bulan. Berlaku untuk usaha dengan omzet ≤ Rp 500jt/tahun. Setor paling lambat tanggal 15 bulan berikutnya.</p>
        </div>
      </div>

      {/* Year Selector + Summary */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar size={16} className="text-slate-400" />
          <select value={selectedYear} onChange={e => setSelectedYear(+e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium outline-none focus:border-indigo-400">
            {[currentYear, currentYear - 1, currentYear - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={exportPajakCSV} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-all">
          <Download size={14}/> Export Laporan Pajak
        </button>
      </div>

      {/* Year Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">Omzet {selectedYear}</p>
          <p className="text-xl font-bold text-slate-800">Rp {(yearSummary.totalOmzet / 1000000).toFixed(1)}jt</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">Total Pajak</p>
          <p className="text-xl font-bold text-red-600">Rp {(yearSummary.totalPajak / 1000).toFixed(0)}rb</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">Transaksi</p>
          <p className="text-xl font-bold text-slate-700">{yearSummary.totalTransactions}</p>
        </div>
        <div className={`p-4 rounded-xl border shadow-sm ${yearSummary.isUnderLimit ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <p className="text-xs text-slate-500 mb-1">Status UMKM</p>
          <div className="flex items-center gap-1.5">
            {yearSummary.isUnderLimit ? <CheckCircle2 size={16} className="text-emerald-600"/> : <AlertTriangle size={16} className="text-amber-600"/>}
            <p className={`text-sm font-bold ${yearSummary.isUnderLimit ? 'text-emerald-700' : 'text-amber-700'}`}>
              {yearSummary.isUnderLimit ? 'Di bawah limit' : 'Mendekati limit'}
            </p>
          </div>
        </div>
      </div>

      {/* Monthly Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Bulan</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Omzet Bruto</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Pajak (0.5%)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 hidden sm:table-cell">Transaksi</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {monthlyData.map(m => {
              const currentMonth = new Date().getMonth();
              const isPast = selectedYear < currentYear || (selectedYear === currentYear && m.month < currentMonth);
              const isCurrent = selectedYear === currentYear && m.month === currentMonth;
              return (
                <tr key={m.month} className={`${isCurrent ? 'bg-indigo-50/30' : ''} hover:bg-slate-50 transition-colors`}>
                  <td className="px-4 py-3">
                    <span className={`font-medium ${isCurrent ? 'text-indigo-700' : 'text-slate-800'}`}>{m.label}</span>
                    {isCurrent && <span className="ml-2 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[10px] font-semibold">Bulan ini</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-700">
                    {m.omzet > 0 ? `Rp ${m.omzet.toLocaleString()}` : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">
                    {m.pajak > 0 ? `Rp ${m.pajak.toLocaleString()}` : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500 hidden sm:table-cell">{m.count || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {m.omzet === 0 && !isPast ? (
                      <span className="text-slate-300 text-xs">—</span>
                    ) : m.omzet === 0 && isPast ? (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-400 rounded-full text-[10px] font-medium">Nihil</span>
                    ) : isPast ? (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-medium">Perlu setor</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-medium">Berjalan</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 border-t-2 border-slate-200">
            <tr className="font-bold">
              <td className="px-4 py-3 text-slate-800">TOTAL {selectedYear}</td>
              <td className="px-4 py-3 text-right text-slate-800">Rp {yearSummary.totalOmzet.toLocaleString()}</td>
              <td className="px-4 py-3 text-right text-red-700">Rp {yearSummary.totalPajak.toLocaleString()}</td>
              <td className="px-4 py-3 text-right text-slate-600 hidden sm:table-cell">{yearSummary.totalTransactions}</td>
              <td className="px-4 py-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Reminder */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-medium text-amber-800">Reminder Setor Pajak</p>
          <p className="text-xs text-amber-600 mt-1">Setor PPh Final paling lambat tanggal 15 bulan berikutnya. Bayar via bank/e-billing DJP Online dengan kode billing 411128-420.</p>
        </div>
      </div>
    </div>
  );
};

export default LaporanPajak;
