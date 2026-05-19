import React, { useState, useMemo, useRef } from 'react';
import {
  X, TrendingUp, TrendingDown, Percent, Upload, Download,
  Search, CheckCircle2, AlertTriangle, Filter, ArrowRight,
  Calculator, History, FileSpreadsheet, Layers, ChevronDown,
  RotateCcw, Zap, Package
} from 'lucide-react';
import { Item } from '../types';

interface PriceManagerProps {
  items: Item[];
  onUpdateItemsBulk: (items: Item[]) => void;
  onClose: () => void;
}

type TabId = 'bulk' | 'margin' | 'import' | 'history';

interface PriceChange {
  itemId: string;
  itemName: string;
  itemCode: string;
  category: string;
  oldBasePrice: number;
  newBasePrice: number;
  oldMemberPrices: number[];
  newMemberPrices: number[];
}

// Margin presets per category
const DEFAULT_MARGINS: Record<string, number> = {
  'Oli & Pelumas': 20,
  'Rem': 25,
  'Kelistrikan': 30,
  'Ban & Velg': 20,
  'Transmisi': 22,
  'Body': 25,
  'Mesin': 28,
};

const PriceManager: React.FC<PriceManagerProps> = ({ items, onUpdateItemsBulk, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabId>('bulk');
  const [preview, setPreview] = useState<PriceChange[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk update state
  const [bulkMode, setBulkMode] = useState<'percent' | 'fixed'>('percent');
  const [bulkDirection, setBulkDirection] = useState<'up' | 'down'>('up');
  const [bulkValue, setBulkValue] = useState<number>(0);
  const [bulkFilter, setBulkFilter] = useState<'all' | 'category' | 'brand' | 'selected'>('all');
  const [bulkFilterValue, setBulkFilterValue] = useState('');
  const [bulkApplyToMember, setBulkApplyToMember] = useState(true);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [itemSearchTerm, setItemSearchTerm] = useState('');

  // Margin state
  const [margins, setMargins] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    const cats = Array.from(new Set(items.map(i => i.category)));
    cats.forEach(cat => { m[cat] = DEFAULT_MARGINS[cat] || 20; });
    return m;
  });

  // Import state
  const [importData, setImportData] = useState<{ code: string; newPrice: number; name?: string }[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  // Price history (from localStorage)
  const [priceHistory] = useState<{ date: string; changes: number; type: string }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('HGROUP_PRICE_HISTORY') || '[]');
    } catch { return []; }
  });

  const categories = useMemo(() => Array.from(new Set(items.map(i => i.category))).sort(), [items]);
  const brands = useMemo(() => Array.from(new Set(items.map(i => i.brand))).filter(Boolean).sort(), [items]);

  const getFilteredItems = () => {
    if (bulkFilter === 'all') return items;
    if (bulkFilter === 'category') return items.filter(i => i.category === bulkFilterValue);
    if (bulkFilter === 'brand') return items.filter(i => i.brand === bulkFilterValue);
    if (bulkFilter === 'selected') return items.filter(i => selectedItemIds.has(i.id));
    return items;
  };

  const filteredItemList = useMemo(() => {
    if (!itemSearchTerm.trim()) return items;
    const term = itemSearchTerm.toLowerCase();
    return items.filter(i => 
      i.name.toLowerCase().includes(term) || 
      i.code.toLowerCase().includes(term) || 
      i.barcode.includes(term) ||
      i.category.toLowerCase().includes(term)
    );
  }, [items, itemSearchTerm]);

  const toggleItemSelection = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      filteredItemList.forEach(i => next.add(i.id));
      return next;
    });
  };

  const deselectAll = () => setSelectedItemIds(new Set());

  // === BULK PRICE UPDATE ===
  const generateBulkPreview = () => {
    const filtered = getFilteredItems();
    if (filtered.length === 0 || bulkValue <= 0) return;

    const changes: PriceChange[] = filtered.map(item => {
      let newBase: number;
      if (bulkMode === 'percent') {
        const multiplier = bulkDirection === 'up' ? (1 + bulkValue / 100) : (1 - bulkValue / 100);
        newBase = Math.round(item.basePrice * multiplier);
      } else {
        newBase = bulkDirection === 'up' ? item.basePrice + bulkValue : Math.max(0, item.basePrice - bulkValue);
      }

      let newMemberPrices = [...item.memberPrices];
      if (bulkApplyToMember) {
        newMemberPrices = item.memberPrices.map(mp => {
          if (bulkMode === 'percent') {
            const multiplier = bulkDirection === 'up' ? (1 + bulkValue / 100) : (1 - bulkValue / 100);
            return Math.round(mp * multiplier);
          }
          return bulkDirection === 'up' ? mp + bulkValue : Math.max(0, mp - bulkValue);
        });
      }

      return {
        itemId: item.id, itemName: item.name, itemCode: item.code, category: item.category,
        oldBasePrice: item.basePrice, newBasePrice: newBase,
        oldMemberPrices: item.memberPrices, newMemberPrices,
      };
    });

    setPreview(changes);
    setShowPreview(true);
  };

  // === MARGIN-BASED PRICING ===
  const generateMarginPreview = () => {
    const changes: PriceChange[] = items.map(item => {
      const margin = margins[item.category] || 20;
      const newMemberPrices = item.memberPrices.map((_, idx) => {
        // Level 1 = full margin, Level 4 = reduced margin (closer to base)
        const levelDiscount = idx * 2; // 0%, 2%, 4%, 6% less margin per level
        const effectiveMargin = Math.max(5, margin - levelDiscount);
        return Math.round(item.basePrice * (1 + effectiveMargin / 100));
      });

      return {
        itemId: item.id, itemName: item.name, itemCode: item.code, category: item.category,
        oldBasePrice: item.basePrice, newBasePrice: item.basePrice, // base stays same
        oldMemberPrices: item.memberPrices, newMemberPrices,
      };
    }).filter(c => JSON.stringify(c.oldMemberPrices) !== JSON.stringify(c.newMemberPrices));

    setPreview(changes);
    setShowPreview(true);
  };

  // === CSV IMPORT ===
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      const errors: string[] = [];
      const data: { code: string; newPrice: number; name?: string }[] = [];

      // Skip header if present
      const startIdx = lines[0]?.toLowerCase().includes('code') || lines[0]?.toLowerCase().includes('kode') ? 1 : 0;

      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(/[,;\t]/).map(c => c.trim().replace(/"/g, ''));
        if (cols.length < 2) { errors.push(`Baris ${i + 1}: format tidak valid`); continue; }

        const code = cols[0];
        const price = parseInt(cols[1].replace(/[^0-9]/g, ''));
        if (!code || isNaN(price) || price <= 0) { errors.push(`Baris ${i + 1}: harga tidak valid (${cols[1]})`); continue; }

        const matchedItem = items.find(item => item.code === code || item.barcode === code);
        if (!matchedItem) { errors.push(`Baris ${i + 1}: kode "${code}" tidak ditemukan`); continue; }

        data.push({ code, newPrice: price, name: matchedItem.name });
      }

      setImportData(data);
      setImportErrors(errors);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const generateImportPreview = () => {
    const changes: PriceChange[] = importData.map(row => {
      const item = items.find(i => i.code === row.code || i.barcode === row.code);
      if (!item) return null;

      // Recalculate member prices proportionally
      const ratio = row.newPrice / item.basePrice;
      const newMemberPrices = item.memberPrices.map(mp => Math.round(mp * ratio));

      return {
        itemId: item.id, itemName: item.name, itemCode: item.code, category: item.category,
        oldBasePrice: item.basePrice, newBasePrice: row.newPrice,
        oldMemberPrices: item.memberPrices, newMemberPrices,
      };
    }).filter(Boolean) as PriceChange[];

    setPreview(changes);
    setShowPreview(true);
  };

  // === APPLY CHANGES ===
  const applyChanges = () => {
    if (preview.length === 0) return;

    const updatedItems = preview.map(change => {
      const item = items.find(i => i.id === change.itemId);
      if (!item) return null;
      return { ...item, basePrice: change.newBasePrice, memberPrices: change.newMemberPrices };
    }).filter(Boolean) as Item[];

    onUpdateItemsBulk(updatedItems);

    // Save to price history
    const historyEntry = { date: new Date().toISOString(), changes: preview.length, type: activeTab };
    const history = [...(priceHistory || []), historyEntry].slice(-50);
    localStorage.setItem('HGROUP_PRICE_HISTORY', JSON.stringify(history));

    alert(`${preview.length} item berhasil diupdate!`);
    setPreview([]);
    setShowPreview(false);
    setImportData([]);
  };

  // === EXPORT TEMPLATE ===
  const exportPriceTemplate = () => {
    const header = 'Kode,Harga Beli,Nama Barang,Kategori\n';
    const rows = items.map(i => `${i.code},${i.basePrice},"${i.name}","${i.category}"`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `harga-barang-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'bulk', label: 'Bulk Update', icon: <Zap size={16} /> },
    { id: 'margin', label: 'Margin', icon: <Calculator size={16} /> },
    { id: 'import', label: 'Import CSV', icon: <FileSpreadsheet size={16} /> },
    { id: 'history', label: 'Riwayat', icon: <History size={16} /> },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-2 md:p-4">
      <div className="bg-white w-full max-w-4xl max-h-[95vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><TrendingUp size={20}/></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Manajemen Harga</h2>
              <p className="text-xs text-slate-400">{items.length} SKU terdaftar</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"><X size={20}/></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-4 shrink-0 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setShowPreview(false); }}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {/* TAB: Bulk Update */}
          {activeTab === 'bulk' && !showPreview && (
            <div className="space-y-5 animate-fadeIn">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                <p className="text-sm text-indigo-700">Ubah harga banyak item sekaligus berdasarkan persentase atau nominal tetap.</p>
              </div>

              {/* Filter */}
              <div className="space-y-3">
                <label className="text-xs font-medium text-slate-500">Terapkan ke</label>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setBulkFilter('all')} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${bulkFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Semua ({items.length})</button>
                  <button onClick={() => setBulkFilter('category')} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${bulkFilter === 'category' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Per Kategori</button>
                  <button onClick={() => setBulkFilter('brand')} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${bulkFilter === 'brand' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Per Merk</button>
                  <button onClick={() => setBulkFilter('selected')} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${bulkFilter === 'selected' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Pilih Item ({selectedItemIds.size})</button>
                </div>
                {bulkFilter === 'category' && (
                  <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500" value={bulkFilterValue} onChange={e => setBulkFilterValue(e.target.value)}>
                    <option value="">-- Pilih Kategori --</option>
                    {categories.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
                {bulkFilter === 'brand' && (
                  <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500" value={bulkFilterValue} onChange={e => setBulkFilterValue(e.target.value)}>
                    <option value="">-- Pilih Merk --</option>
                    {brands.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
                {bulkFilter === 'selected' && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    {/* Search */}
                    <div className="p-2 border-b border-slate-100 bg-slate-50">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input
                          type="text"
                          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400 placeholder:text-slate-300"
                          placeholder="Cari nama / kode barang..."
                          value={itemSearchTerm}
                          onChange={e => setItemSearchTerm(e.target.value)}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-2 px-1">
                        <span className="text-[11px] text-slate-400">{selectedItemIds.size} item dipilih</span>
                        <div className="flex gap-2">
                          <button type="button" onClick={selectAllFiltered} className="text-[11px] text-indigo-600 font-medium hover:underline">Pilih semua</button>
                          <button type="button" onClick={deselectAll} className="text-[11px] text-slate-400 font-medium hover:underline">Reset</button>
                        </div>
                      </div>
                    </div>
                    {/* Item list with checkboxes */}
                    <div className="max-h-48 overflow-y-auto">
                      {filteredItemList.map(item => (
                        <label key={item.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedItemIds.has(item.id)}
                            onChange={() => toggleItemSelection(item.id)}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-800 truncate">{item.name}</p>
                            <p className="text-[11px] text-slate-400">{item.code} • {item.category} • Rp {item.basePrice.toLocaleString()}</p>
                          </div>
                        </label>
                      ))}
                      {filteredItemList.length === 0 && (
                        <p className="text-center py-4 text-sm text-slate-400">Tidak ditemukan</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Direction & Mode */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-500">Arah</label>
                  <div className="flex gap-2">
                    <button onClick={() => setBulkDirection('up')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${bulkDirection === 'up' ? 'bg-red-50 text-red-600 border-2 border-red-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}><TrendingUp size={16}/> Naik</button>
                    <button onClick={() => setBulkDirection('down')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${bulkDirection === 'down' ? 'bg-emerald-50 text-emerald-600 border-2 border-emerald-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}><TrendingDown size={16}/> Turun</button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-500">Mode</label>
                  <div className="flex gap-2">
                    <button onClick={() => setBulkMode('percent')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${bulkMode === 'percent' ? 'bg-indigo-50 text-indigo-600 border-2 border-indigo-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}><Percent size={16}/> Persen</button>
                    <button onClick={() => setBulkMode('fixed')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${bulkMode === 'fixed' ? 'bg-indigo-50 text-indigo-600 border-2 border-indigo-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>Rp Tetap</button>
                  </div>
                </div>
              </div>

              {/* Value input */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500">Nilai {bulkMode === 'percent' ? '(%)' : '(Rp)'}</label>
                <input type="number" min="0" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-semibold text-slate-800 outline-none focus:border-indigo-500" placeholder={bulkMode === 'percent' ? '5' : '5000'} value={bulkValue || ''} onChange={e => setBulkValue(parseInt(e.target.value) || 0)} />
              </div>

              {/* Options */}
              <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
                <input type="checkbox" checked={bulkApplyToMember} onChange={e => setBulkApplyToMember(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-sm text-slate-700">Terapkan juga ke harga member (Level 1-4)</span>
              </label>

              <button onClick={generateBulkPreview} disabled={bulkValue <= 0 || (bulkFilter === 'category' && !bulkFilterValue) || (bulkFilter === 'brand' && !bulkFilterValue) || (bulkFilter === 'selected' && selectedItemIds.size === 0)} className="w-full py-3.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                <ArrowRight size={18}/> Preview Perubahan ({getFilteredItems().length} item)
              </button>
            </div>
          )}

          {/* TAB: Margin-Based Pricing */}
          {activeTab === 'margin' && !showPreview && (
            <div className="space-y-5 animate-fadeIn">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <p className="text-sm text-amber-700">Set margin per kategori. Harga jual (member) akan dihitung otomatis dari harga beli + margin.</p>
                <p className="text-xs text-amber-500 mt-1">Level 1 = margin penuh, Level 4 = margin dikurangi 6% (harga grosir).</p>
              </div>

              <div className="space-y-3">
                {categories.map(cat => {
                  const count = items.filter(i => i.category === cat).length;
                  return (
                    <div key={cat} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{cat}</p>
                        <p className="text-xs text-slate-400">{count} item</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min="1" max="100"
                          className="w-16 px-2 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-center outline-none focus:border-indigo-500"
                          value={margins[cat] || 20}
                          onChange={e => setMargins({ ...margins, [cat]: parseInt(e.target.value) || 0 })}
                        />
                        <span className="text-sm text-slate-500 font-medium">%</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button onClick={generateMarginPreview} className="w-full py-3.5 bg-amber-600 text-white font-semibold rounded-xl hover:bg-amber-700 transition-all flex items-center justify-center gap-2">
                <Calculator size={18}/> Hitung & Preview
              </button>
            </div>
          )}

          {/* TAB: Import CSV */}
          {activeTab === 'import' && !showPreview && (
            <div className="space-y-5 animate-fadeIn">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
                <p className="text-sm text-blue-700 font-medium">Import harga dari file CSV/Excel</p>
                <p className="text-xs text-blue-600">Format: <code className="bg-blue-100 px-1 rounded">Kode Barang, Harga Baru</code> (pisah dengan koma, titik koma, atau tab)</p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => fileInputRef.current?.click()} className="flex-1 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                  <Upload size={16}/> Upload File CSV
                </button>
                <button onClick={exportPriceTemplate} className="px-4 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-all flex items-center gap-2 text-sm">
                  <Download size={16}/> Download Template
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleFileImport} />

              {importData.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-emerald-700 flex items-center gap-2"><CheckCircle2 size={16}/> {importData.length} item berhasil dibaca</p>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0"><tr><th className="p-2 text-left text-slate-500">Kode</th><th className="p-2 text-left text-slate-500">Nama</th><th className="p-2 text-right text-slate-500">Harga Baru</th></tr></thead>
                      <tbody>
                        {importData.slice(0, 20).map((row, i) => (
                          <tr key={i} className="border-t border-slate-100"><td className="p-2 font-mono text-slate-700">{row.code}</td><td className="p-2 text-slate-600 truncate max-w-[150px]">{row.name}</td><td className="p-2 text-right font-semibold text-slate-800">Rp {row.newPrice.toLocaleString()}</td></tr>
                        ))}
                        {importData.length > 20 && <tr><td colSpan={3} className="p-2 text-center text-slate-400">...dan {importData.length - 20} lainnya</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={generateImportPreview} className="w-full py-3.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                    <ArrowRight size={18}/> Preview Perubahan
                  </button>
                </div>
              )}

              {importErrors.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-1">
                  <p className="text-xs font-medium text-red-700 flex items-center gap-1"><AlertTriangle size={14}/> {importErrors.length} baris bermasalah:</p>
                  <div className="max-h-24 overflow-y-auto text-xs text-red-600 space-y-0.5">
                    {importErrors.slice(0, 10).map((err, i) => <p key={i}>• {err}</p>)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: Price History */}
          {activeTab === 'history' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                <p className="text-sm text-slate-600">Riwayat perubahan harga massal yang pernah dilakukan.</p>
              </div>
              {priceHistory.length === 0 ? (
                <div className="text-center py-12 text-slate-300">
                  <History size={32} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm text-slate-400">Belum ada riwayat perubahan harga</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {[...priceHistory].reverse().map((entry, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><TrendingUp size={14}/></div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">{entry.changes} item diupdate</p>
                          <p className="text-xs text-slate-400">via {entry.type === 'bulk' ? 'Bulk Update' : entry.type === 'margin' ? 'Margin' : 'Import CSV'}</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400">{new Date(entry.date).toLocaleDateString('id-ID')} {new Date(entry.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Stale price alert */}
              {(() => {
                const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
                const lastUpdate = priceHistory.length > 0 ? new Date(priceHistory[priceHistory.length - 1].date).getTime() : 0;
                if (lastUpdate < thirtyDaysAgo) {
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                      <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">Harga belum diupdate &gt; 30 hari</p>
                        <p className="text-xs text-amber-600 mt-1">Pertimbangkan untuk cek harga supplier terbaru dan lakukan update.</p>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {/* PREVIEW PANEL */}
          {showPreview && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowPreview(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"><RotateCcw size={16}/></button>
                  <h3 className="text-sm font-bold text-slate-800">Preview: {preview.length} item akan berubah</h3>
                </div>
              </div>

              <div className="max-h-[40vh] overflow-y-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                      <th className="p-2.5 text-left text-slate-500 font-medium">Barang</th>
                      <th className="p-2.5 text-right text-slate-500 font-medium">Harga Lama</th>
                      <th className="p-2.5 text-center text-slate-500 font-medium">→</th>
                      <th className="p-2.5 text-right text-slate-500 font-medium">Harga Baru</th>
                      <th className="p-2.5 text-right text-slate-500 font-medium">Selisih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 50).map(change => {
                      const diff = change.newMemberPrices[0] - change.oldMemberPrices[0];
                      return (
                        <tr key={change.itemId} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="p-2.5">
                            <p className="font-medium text-slate-800 truncate max-w-[180px]">{change.itemName}</p>
                            <p className="text-slate-400 text-[11px]">{change.category}</p>
                          </td>
                          <td className="p-2.5 text-right font-mono text-slate-600">Rp {change.oldMemberPrices[0].toLocaleString()}</td>
                          <td className="p-2.5 text-center text-slate-300">→</td>
                          <td className="p-2.5 text-right font-mono font-semibold text-slate-900">Rp {change.newMemberPrices[0].toLocaleString()}</td>
                          <td className={`p-2.5 text-right font-mono font-semibold ${diff > 0 ? 'text-red-600' : diff < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {diff > 0 ? '+' : ''}{diff.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                    {preview.length > 50 && <tr><td colSpan={5} className="p-2.5 text-center text-slate-400">...dan {preview.length - 50} item lainnya</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowPreview(false)} className="flex-1 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-all">Batal</button>
                <button onClick={applyChanges} className="flex-[2] py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
                  <CheckCircle2 size={18}/> Terapkan {preview.length} Perubahan
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PriceManager;
