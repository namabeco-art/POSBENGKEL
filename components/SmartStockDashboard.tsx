import React, { useMemo, useState } from 'react';
import {
  TrendingUp, TrendingDown, AlertTriangle, Package, ShoppingCart,
  Clock, ArrowRight, Download, RefreshCw, Search, Filter
} from 'lucide-react';
import { Item, Sale } from '../types';

interface SmartStockDashboardProps {
  items: Item[];
  sales: Sale[];
  onCreatePO?: () => void;
}

/**
 * Smart Stock Dashboard — combines:
 * - #3: Analisis Perputaran Stok (fast/slow moving items)
 * - #4: Auto Reorder Suggestion (items below reorder level)
 */
const SmartStockDashboard: React.FC<SmartStockDashboardProps> = ({ items, sales, onCreatePO }) => {
  const [filter, setFilter] = useState<'all' | 'reorder' | 'dead' | 'fast'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Calculate sales velocity per item (last 30 days)
  const itemAnalytics = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const salesMap: Record<string, { totalQty: number; totalRevenue: number; lastSoldDate: string }> = {};

    sales.forEach(sale => {
      try {
        const parts = sale.date.split(' ')[0].split('/');
        const saleDate = new Date(+parts[2], +parts[1] - 1, +parts[0]);
        if (saleDate < thirtyDaysAgo) return;

        sale.items.forEach(si => {
          if (!salesMap[si.itemId]) salesMap[si.itemId] = { totalQty: 0, totalRevenue: 0, lastSoldDate: sale.date };
          salesMap[si.itemId].totalQty += si.qty;
          salesMap[si.itemId].totalRevenue += si.total;
          salesMap[si.itemId].lastSoldDate = sale.date;
        });
      } catch { /* skip unparseable dates */ }
    });

    return items.map(item => {
      const stats = salesMap[item.id] || { totalQty: 0, totalRevenue: 0, lastSoldDate: '' };
      const dailyAvg = stats.totalQty / 30;
      const daysUntilEmpty = dailyAvg > 0 ? Math.round(item.stock / dailyAvg) : 999;
      const reorderLevel = item.reorderLevel || 5;
      const needsReorder = item.stock <= reorderLevel;
      const isDead = stats.totalQty === 0 && item.stock > 0;
      const isFast = stats.totalQty >= 10;
      const suggestedOrderQty = dailyAvg > 0 ? Math.max(reorderLevel, Math.round(dailyAvg * 14)) - item.stock : 0;

      return {
        ...item,
        soldQty30d: stats.totalQty,
        revenue30d: stats.totalRevenue,
        dailyAvg,
        daysUntilEmpty,
        needsReorder,
        isDead,
        isFast,
        suggestedOrderQty: Math.max(0, suggestedOrderQty),
        lastSoldDate: stats.lastSoldDate,
      };
    }).sort((a, b) => b.soldQty30d - a.soldQty30d);
  }, [items, sales]);

  const filteredItems = useMemo(() => {
    let result = itemAnalytics;
    if (filter === 'reorder') result = result.filter(i => i.needsReorder);
    if (filter === 'dead') result = result.filter(i => i.isDead);
    if (filter === 'fast') result = result.filter(i => i.isFast);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(i => i.name.toLowerCase().includes(term) || i.code.toLowerCase().includes(term));
    }
    return result;
  }, [itemAnalytics, filter, searchTerm]);

  const summary = useMemo(() => ({
    needsReorder: itemAnalytics.filter(i => i.needsReorder).length,
    deadStock: itemAnalytics.filter(i => i.isDead).length,
    fastMoving: itemAnalytics.filter(i => i.isFast).length,
    totalValue: items.reduce((sum, i) => sum + (i.stock * i.basePrice), 0),
  }), [itemAnalytics, items]);

  const exportReorderList = () => {
    const reorderItems = itemAnalytics.filter(i => i.needsReorder && i.suggestedOrderQty > 0);
    const header = 'Kode,Nama,Stok Saat Ini,Reorder Level,Saran Order,Kategori\n';
    const rows = reorderItems.map(i => `${i.code},"${i.name}",${i.stock},${i.reorderLevel || 5},${i.suggestedOrderQty},"${i.category}"`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `reorder-suggestion-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle size={16} className="text-red-500"/><span className="text-xs font-medium text-slate-500">Perlu Restock</span></div>
          <p className="text-2xl font-bold text-red-600">{summary.needsReorder}</p>
          <p className="text-xs text-slate-400 mt-1">item di bawah minimum</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2"><Clock size={16} className="text-amber-500"/><span className="text-xs font-medium text-slate-500">Stok Mati</span></div>
          <p className="text-2xl font-bold text-amber-600">{summary.deadStock}</p>
          <p className="text-xs text-slate-400 mt-1">tidak terjual 30 hari</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2"><TrendingUp size={16} className="text-emerald-500"/><span className="text-xs font-medium text-slate-500">Fast Moving</span></div>
          <p className="text-2xl font-bold text-emerald-600">{summary.fastMoving}</p>
          <p className="text-xs text-slate-400 mt-1">terjual ≥10 unit/bulan</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2"><Package size={16} className="text-indigo-500"/><span className="text-xs font-medium text-slate-500">Nilai Stok</span></div>
          <p className="text-xl font-bold text-indigo-600">Rp {(summary.totalValue / 1000000).toFixed(1)}jt</p>
          <p className="text-xs text-slate-400 mt-1">total modal tersimpan</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
          <input className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Cari barang..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {[
            { id: 'all', label: 'Semua' },
            { id: 'reorder', label: `Perlu Restock (${summary.needsReorder})` },
            { id: 'dead', label: `Stok Mati (${summary.deadStock})` },
            { id: 'fast', label: `Laris (${summary.fastMoving})` },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id as any)} className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${filter === f.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      {summary.needsReorder > 0 && (
        <div className="flex gap-2">
          <button onClick={exportReorderList} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-all">
            <Download size={14}/> Export Saran Restock (CSV)
          </button>
          {onCreatePO && (
            <button onClick={onCreatePO} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-all">
              <ShoppingCart size={14}/> Buat PO dari Saran
            </button>
          )}
        </div>
      )}

      {/* Item Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Barang</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Stok</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 hidden sm:table-cell">Terjual/30hr</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 hidden md:table-cell">Rata²/hari</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 hidden md:table-cell">Habis dalam</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Saran Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.slice(0, 50).map(item => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800 text-sm truncate max-w-[200px]">{item.name}</p>
                    <p className="text-xs text-slate-400">{item.code} • {item.category}</p>
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${item.needsReorder ? 'text-red-600' : 'text-slate-800'}`}>{item.stock}</td>
                  <td className="px-4 py-3 text-right text-slate-600 hidden sm:table-cell">{item.soldQty30d}</td>
                  <td className="px-4 py-3 text-right text-slate-600 hidden md:table-cell">{item.dailyAvg.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right hidden md:table-cell">
                    <span className={`text-xs font-medium ${item.daysUntilEmpty <= 7 ? 'text-red-600' : item.daysUntilEmpty <= 14 ? 'text-amber-600' : 'text-slate-500'}`}>
                      {item.daysUntilEmpty >= 999 ? '∞' : `${item.daysUntilEmpty} hari`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.needsReorder && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-semibold">RESTOCK</span>}
                    {item.isDead && !item.needsReorder && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-semibold">MATI</span>}
                    {item.isFast && !item.needsReorder && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-semibold">LARIS</span>}
                    {!item.needsReorder && !item.isDead && !item.isFast && <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.suggestedOrderQty > 0 ? (
                      <span className="font-semibold text-indigo-600">+{item.suggestedOrderQty}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredItems.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm">Tidak ada item yang cocok dengan filter</div>
        )}
      </div>
    </div>
  );
};

export default SmartStockDashboard;
