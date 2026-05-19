import React, { useState, useMemo } from 'react';
import {
  Plus, Trash2, Coffee, Fuel, ShoppingBag, Wrench, Truck,
  X, Calendar, DollarSign, TrendingDown, Receipt, Download
} from 'lucide-react';

interface KasEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  createdAt: string;
}

interface KasHarianProps {
  openingCash: number;
  salesCashToday: number;
}

const CATEGORIES = [
  { id: 'makan', label: 'Makan/Minum', icon: <Coffee size={14}/> },
  { id: 'transport', label: 'Transport/Bensin', icon: <Fuel size={14}/> },
  { id: 'belanja', label: 'Belanja Toko', icon: <ShoppingBag size={14}/> },
  { id: 'perbaikan', label: 'Perbaikan/Alat', icon: <Wrench size={14}/> },
  { id: 'kirim', label: 'Ongkir/Kurir', icon: <Truck size={14}/> },
  { id: 'lainnya', label: 'Lainnya', icon: <Receipt size={14}/> },
];

const STORAGE_KEY = 'HGROUP_KAS_HARIAN';

const loadEntries = (): KasEntry[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
};

const saveEntries = (entries: KasEntry[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
};

const KasHarian: React.FC<KasHarianProps> = ({ openingCash, salesCashToday }) => {
  const [entries, setEntries] = useState<KasEntry[]>(loadEntries);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ description: '', amount: 0, category: 'lainnya' });
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));

  const todayStr = new Date().toLocaleDateString('id-ID');

  const todayEntries = useMemo(() => {
    return entries.filter(e => {
      const entryDate = new Date(e.createdAt).toISOString().slice(0, 10);
      return entryDate === filterDate;
    });
  }, [entries, filterDate]);

  const totalPengeluaran = useMemo(() => todayEntries.reduce((sum, e) => sum + e.amount, 0), [todayEntries]);
  const kasAkhir = openingCash + salesCashToday - totalPengeluaran;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || form.amount <= 0) return;

    const newEntry: KasEntry = {
      id: `KAS-${Date.now()}`,
      date: todayStr,
      description: form.description,
      amount: form.amount,
      category: form.category,
      createdAt: new Date().toISOString(),
    };

    const updated = [newEntry, ...entries];
    setEntries(updated);
    saveEntries(updated);
    setForm({ description: '', amount: 0, category: 'lainnya' });
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Hapus pengeluaran ini?')) return;
    const updated = entries.filter(e => e.id !== id);
    setEntries(updated);
    saveEntries(updated);
  };

  const exportKasHarian = () => {
    const header = 'Tanggal,Keterangan,Kategori,Jumlah\n';
    const rows = todayEntries.map(e => `"${e.date}","${e.description}","${e.category}",${e.amount}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `kas-harian-${filterDate}.csv`;
    link.click();
  };

  const getCategoryIcon = (catId: string) => CATEGORIES.find(c => c.id === catId)?.icon || <Receipt size={14}/>;
  const getCategoryLabel = (catId: string) => CATEGORIES.find(c => c.id === catId)?.label || catId;

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">Modal Awal</p>
          <p className="text-lg font-bold text-slate-800">Rp {openingCash.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">Pemasukan Tunai</p>
          <p className="text-lg font-bold text-emerald-600">+Rp {salesCashToday.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">Pengeluaran</p>
          <p className="text-lg font-bold text-red-600">-Rp {totalPengeluaran.toLocaleString()}</p>
        </div>
        <div className={`p-4 rounded-xl border shadow-sm ${kasAkhir >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <p className="text-xs text-slate-500 mb-1">Kas Akhir</p>
          <p className={`text-lg font-bold ${kasAkhir >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>Rp {kasAkhir.toLocaleString()}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-slate-400" />
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400" />
        </div>
        <div className="flex gap-2">
          {todayEntries.length > 0 && (
            <button onClick={exportKasHarian} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition-all">
              <Download size={14}/> Export
            </button>
          )}
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-all">
            <Plus size={14}/> Catat Pengeluaran
          </button>
        </div>
      </div>

      {/* Entry List */}
      {todayEntries.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <DollarSign size={32} className="mx-auto text-slate-200 mb-3" />
          <p className="text-sm text-slate-400">Belum ada pengeluaran hari ini</p>
          <p className="text-xs text-slate-300 mt-1">Klik "Catat Pengeluaran" untuk menambah</p>
        </div>
      ) : (
        <div className="space-y-2">
          {todayEntries.map(entry => (
            <div key={entry.id} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-all">
              <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 shrink-0">
                {getCategoryIcon(entry.category)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{entry.description}</p>
                <p className="text-xs text-slate-400">{getCategoryLabel(entry.category)} • {new Date(entry.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <p className="text-sm font-semibold text-red-600 shrink-0">-Rp {entry.amount.toLocaleString()}</p>
              <button onClick={() => handleDelete(entry.id)} className="p-1.5 text-slate-300 hover:text-red-500 rounded-md hover:bg-red-50 transition-all"><Trash2 size={14}/></button>
            </div>
          ))}
        </div>
      )}

      {/* Add Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form onSubmit={handleAdd} className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 shadow-2xl space-y-4 animate-slideUp">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-slate-900">Catat Pengeluaran</h3>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg"><X size={20}/></button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500">Kategori</label>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setForm({ ...form, category: cat.id })}
                    className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium transition-all ${form.category === cat.id ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}
                  >
                    {cat.icon} {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500">Keterangan</label>
              <input
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400"
                placeholder="Beli makan siang, bensin, dll..."
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500">Jumlah (Rp)</label>
              <input
                required
                type="number"
                min="1"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-semibold outline-none focus:border-indigo-400"
                placeholder="25000"
                value={form.amount || ''}
                onChange={e => setForm({ ...form, amount: parseInt(e.target.value) || 0 })}
              />
              {/* Quick amounts */}
              <div className="flex gap-2 flex-wrap">
                {[10000, 20000, 25000, 50000, 100000].map(val => (
                  <button key={val} type="button" onClick={() => setForm({ ...form, amount: val })} className="px-2.5 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition-all">
                    {(val/1000)}rb
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" className="w-full py-3.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-all flex items-center justify-center gap-2">
              <TrendingDown size={16}/> Catat Pengeluaran
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default KasHarian;
