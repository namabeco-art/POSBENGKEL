import React, { useMemo, useState } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Package, Calendar,
  Search, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { Item, Sale } from '../types';

interface ProfitAnalysisProps {
  items: Item[];
  sales: Sale[];
}

/**
 * Profit Analysis — #5
 * Shows profit per item and per transaction with margin calculation.
 */
const ProfitAnalysis: React.FC<ProfitAnalysisProps> = ({ items, sales }) => {
  const [view, setView] = useState<'items' | 'transactions'>('items');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<'7d' | '30d' | 'all'>('30d');

  const filteredSales = useMemo(() => {
    if (dateRange === 'all') return sales;
    const daysAgo = dateRange === '7d' ? 7 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysAgo);

    return sales.filter(sale => {
      try {
        const parts = sale.date.split(' ')[0].split('/');
        const saleDate = new Date(+parts[2], +parts[1] - 1, +parts[0]);
        return saleDate >= cutoff;
      } catch { return false; }
    });
  }, [sales, dateRange]);

  // Profit per item
  const itemProfits = useMemo(() => {
    const profitMap: Record<string, { itemId: string; name: string; category: string; totalRevenue: number; totalCost: number; totalQty: number }> = {};

    filteredSales.forEach(sale => {
      sale.items.forEach(si => {
        const masterItem = items.find(i => i.id === si.itemId);
        const cost = masterItem?.basePrice || 0;
        if (!profitMap[si.itemId]) {
          profitMap[si.itemId] = { itemId: si.itemId, name: si.name, category: masterItem?.category || '', totalRevenue: 0, totalCost: 0, totalQty: 0 };
        }
        profitMap[si.itemId].totalRevenue += si.total;
        profitMap[si.itemId].totalCost += cost * si.qty;
        profitMap[si.itemId].totalQty += si.qty;
      });
    });

    return Object.values(profitMap)
      .map(p => ({
        ...p,
        profit: p.totalRevenue - p.totalCost,
        marginPercent: p.totalRevenue > 0 ? Math.round(((p.totalRevenue - p.totalCost) / p.totalRevenue) * 100) : 0,
      }))
      .sort((a, b) => b.profit - a.profit);
  }, [filteredSales, items]);

  // Profit per transaction
  const transactionProfits = useMemo(() => {
    return filteredSales.map(sale => {
      let totalCost = 0;
      sale.items.forEach(si => {
        const masterItem = items.find(i => i.id === si.itemId);
        totalCost += (masterItem?.basePrice || 0) * si.qty;
      });
      const profit = sale.total - totalCost;
      const marginPercent = sale.total > 0 ? Math.round((profit / sale.total) * 100) : 0;
      return { ...sale, totalCost, profit, marginPercent };
    });
  }, [filteredSales, items]);

  const summary = useMemo(() => {
    const totalRevenue = filteredSales.reduce((sum, s) => sum + s.total, 0);
    const totalCost = transactionProfits.reduce((sum, t) => sum + t.totalCost, 0);
    const totalProfit = totalRevenue - totalCost;
    const avgMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;
    return { totalRevenue, totalCost, totalProfit, avgMargin, transactionCount: filteredSales.length };
  }, [filteredSales, transactionProfits]);

  const filteredItemProfits = useMemo(() => {
    if (!searchTerm) return itemProfits;
    const term = searchTerm.toLowerCase();
    return itemProfits.filter(p => p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term));
  }, [itemProfits, searchTerm]);

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">Total Omzet</p>
          <p className="text-xl font-bold text-slate-800">Rp {(summary.totalRevenue / 1000000).toFixed(1)}jt</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">Total Modal</p>
          <p className="text-xl font-bold text-slate-600">Rp {(summary.totalCost / 1000000).toFixed(1)}jt</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">Laba Kotor</p>
          <p className={`text-xl font-bold ${summary.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            Rp {(summary.totalProfit / 1000000).toFixed(1)}jt
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">Margin Rata²</p>
          <p className={`text-xl font-bold ${summary.avgMargin >= 15 ? 'text-emerald-600' : summary.avgMargin >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
            {summary.avgMargin}%
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2">
          <button onClick={() => setView('items')} className={`px-3 py-2 rounded-lg text-xs font-medium ${view === 'items' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Per Barang</button>
          <button onClick={() => setView('transactions')} className={`px-3 py-2 rounded-lg text-xs font-medium ${view === 'transactions' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Per Transaksi</button>
        </div>
        <div className="flex gap-2">
          {(['7d', '30d', 'all'] as const).map(r => (
            <button key={r} onClick={() => setDateRange(r)} className={`px-3 py-2 rounded-lg text-xs font-medium ${dateRange === r ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {r === '7d' ? '7 Hari' : r === '30d' ? '30 Hari' : 'Semua'}
            </button>
          ))}
        </div>
        {view === 'items' && (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
            <input className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Cari barang..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        )}
      </div>

      {/* Per Item View */}
      {view === 'items' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Barang</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 hidden sm:table-cell">Omzet</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 hidden sm:table-cell">Modal</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Laba</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItemProfits.slice(0, 50).map(p => (
                  <tr key={p.itemId} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 text-sm truncate max-w-[180px]">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.category}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">{p.totalQty}</td>
                    <td className="px-4 py-3 text-right text-slate-600 hidden sm:table-cell">Rp {p.totalRevenue.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-400 hidden sm:table-cell">Rp {p.totalCost.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${p.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      Rp {p.profit.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.marginPercent >= 20 ? 'bg-emerald-100 text-emerald-700' : p.marginPercent >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                        {p.marginPercent}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per Transaction View */}
      {view === 'transactions' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Invoice</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 hidden sm:table-cell">Tanggal</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Omzet</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 hidden sm:table-cell">Modal</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Laba</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactionProfits.slice(0, 50).map(t => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 text-sm">{t.invoiceNo}</p>
                      <p className="text-xs text-slate-400 sm:hidden">{t.date}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs hidden sm:table-cell">{t.date}</td>
                    <td className="px-4 py-3 text-right text-slate-700">Rp {t.total.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-400 hidden sm:table-cell">Rp {t.totalCost.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${t.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      Rp {t.profit.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${t.marginPercent >= 20 ? 'bg-emerald-100 text-emerald-700' : t.marginPercent >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                        {t.marginPercent}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfitAnalysis;
