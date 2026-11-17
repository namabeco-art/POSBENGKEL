import React, { useState, useMemo, useRef } from 'react';
import {
  X, TrendingUp, TrendingDown, Percent, Upload, Download,
  Search, CheckCircle2, AlertTriangle, Filter, ArrowRight,
  Calculator, History, FileSpreadsheet, Layers, ChevronDown,
  RotateCcw, Zap, Package
} from 'lucide-react';
import { Item, PriceChangeLog, PriceChangeSource } from '../types';
import { findColumn, parseCsv, downloadCsv } from '../services/csv';
import { getMarginPercent, parseRupiah, roundPrice, syncUnitPrices, type RoundingStep } from '../services/pricing';

interface PriceManagerProps {
  items: Item[];
  priceHistory?: PriceChangeLog[];
  onUpdateItemsBulk: (patches: Array<Partial<Item> & { id: string }>, source?: PriceChangeSource, note?: string) => void;
  onClose: () => void;
}

const ROUNDING_OPTIONS: { value: RoundingStep; label: string }[] = [
  { value: 0, label: 'Tanpa' },
  { value: 100, label: 'Rp 100' },
  { value: 500, label: 'Rp 500' },
  { value: 1000, label: 'Rp 1.000' },
];

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: 'Edit manual', BULK: 'Update massal', MARGIN: 'Hitung markup', IMPORT: 'Import CSV',
  AI: 'AI Consultant', AI_UNDO: 'Undo AI', PURCHASE: 'Penerimaan PO', COST_REVIEW: 'Sesuaikan modal',
};

const rp = (value: number) => `Rp ${Math.round(value || 0).toLocaleString('id-ID')}`;

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

const PriceManager: React.FC<PriceManagerProps> = ({ items, priceHistory = [], onUpdateItemsBulk, onClose }) => {
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
  /** Yang diubah: harga jual (Level 1-4), harga modal, atau keduanya. */
  const [bulkTarget, setBulkTarget] = useState<'both' | 'sell' | 'cost'>('both');
  const [rounding, setRounding] = useState<RoundingStep>(100);
  const [historySearch, setHistorySearch] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [itemSearchTerm, setItemSearchTerm] = useState('');

  // Margin state
  const [margins, setMargins] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    const cats = Array.from(new Set(items.map(i => i.category)));
    cats.forEach(cat => { m[cat] = DEFAULT_MARGINS[cat] ?? 20; });
    return m;
  });

  // Import state
  const [importData, setImportData] = useState<{ code: string; newBasePrice?: number; newLv1?: number; newLv2?: number; newLv3?: number; newLv4?: number; name?: string }[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const filteredHistory = useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    const list = term
      ? priceHistory.filter(entry => entry.itemName.toLowerCase().includes(term) || entry.itemCode.toLowerCase().includes(term))
      : priceHistory;
    return list.slice(0, 200);
  }, [priceHistory, historySearch]);

  /** Barang yang harganya belum ditinjau > 30 hari (atau belum pernah sejak riwayat dicatat). */
  const stalePriceCount = useMemo(() => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const lastChange = new Map<string, string>();
    priceHistory.forEach(entry => {
      if ((lastChange.get(entry.itemId) || '') < entry.createdAt) lastChange.set(entry.itemId, entry.createdAt);
    });
    return items.filter(item => (lastChange.get(item.id) || '') < cutoff).length;
  }, [items, priceHistory]);

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
  const adjustValue = (value: number) => {
    if (value <= 0) return value; // harga level kosong (ikut Level 1) tetap kosong
    if (bulkMode === 'percent') {
      const multiplier = bulkDirection === 'up' ? (1 + bulkValue / 100) : (1 - bulkValue / 100);
      return Math.max(0, value * multiplier);
    }
    return Math.max(0, bulkDirection === 'up' ? value + bulkValue : value - bulkValue);
  };

  const generateBulkPreview = () => {
    const filtered = getFilteredItems();
    if (filtered.length === 0 || bulkValue <= 0) return;
    if (bulkMode === 'percent' && bulkDirection === 'down' && bulkValue >= 100) {
      alert('Penurunan persen harus kurang dari 100%.');
      return;
    }

    const changes: PriceChange[] = filtered.map(item => {
      const newBase = bulkTarget === 'sell' ? item.basePrice : Math.round(adjustValue(item.basePrice));
      const newMemberPrices = bulkTarget === 'cost'
        ? [...item.memberPrices]
        : item.memberPrices.map(price => (price > 0 ? roundPrice(adjustValue(price), rounding) : price));

      return {
        itemId: item.id, itemName: item.name, itemCode: item.code, category: item.category,
        oldBasePrice: item.basePrice, newBasePrice: newBase,
        oldMemberPrices: item.memberPrices, newMemberPrices,
      };
    }).filter(change => change.newBasePrice !== change.oldBasePrice || JSON.stringify(change.newMemberPrices) !== JSON.stringify(change.oldMemberPrices));

    setPreview(changes);
    setShowPreview(true);
  };

  // === MARGIN-BASED PRICING ===
  const generateMarginPreview = () => {
    // Barang tanpa harga modal dilewati — kalau tidak, harga jualnya akan menjadi Rp 0.
    const withoutCost = items.filter(item => !(item.basePrice > 0)).length;
    if (withoutCost > 0) alert(`${withoutCost} barang belum punya harga modal dan dilewati.`);
    const changes: PriceChange[] = items.filter(item => item.basePrice > 0).map(item => {
      const margin = margins[item.category] ?? 20;
      const newMemberPrices = [0, 1, 2, 3].map(idx => {
        // Level 1 = full margin, Level 4 = reduced margin (closer to base)
        const levelDiscount = idx * 2; // 0%, 2%, 4%, 6% less margin per level
        const effectiveMargin = Math.max(5, margin - levelDiscount);
        return roundPrice(item.basePrice * (1 + effectiveMargin / 100), rounding);
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
  const parsePrice = (val: string): number | undefined => {
    const num = parseRupiah(val); // mendukung 12.500 / 12,500 / 12500.00 / Rp 12.500
    return num !== undefined && num > 0 ? num : undefined; // kosong/0 = harga lama tetap
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = parseCsv(text);
      const errors: string[] = [];
      const data: { code: string; newBasePrice?: number; newLv1?: number; newLv2?: number; newLv3?: number; newLv4?: number; name?: string }[] = [];

      // Skip header if present
      const firstLine = (lines[0] || []).join(' ').toLowerCase();
      const hasHeader = firstLine.includes('code') || firstLine.includes('kode') || firstLine.includes('harga');
      const startIdx = hasHeader ? 1 : 0;
      const header = hasHeader ? lines[0] : [];
      const colIndex = (names: string[], fallback: number) => {
        const index = hasHeader ? findColumn(header, names) : -1;
        return index >= 0 ? index : fallback;
      };
      const cIdx = {
        code: colIndex(['Kode', 'Kode Barang', 'Code', 'Barcode'], 0),
        base: colIndex(['Harga Beli', 'Harga Dasar', 'Modal', 'HPP'], 1),
        lv: [
          colIndex(['Harga Lv1', 'Harga Level 1', 'Lv1'], 2),
          colIndex(['Harga Lv2', 'Harga Level 2', 'Lv2'], 3),
          colIndex(['Harga Lv3', 'Harga Level 3', 'Lv3'], 4),
          colIndex(['Harga Lv4', 'Harga Level 4', 'Lv4'], 5),
        ],
      };

      for (let i = startIdx; i < lines.length; i++) {
        const raw = lines[i];
        const cols = [raw[cIdx.code], raw[cIdx.base], ...cIdx.lv.map(index => raw[index])].map(c => (c || '').trim());
        if (cols.length < 2) { errors.push(`Baris ${i + 1}: minimal 2 kolom (kode + harga)`); continue; }

        const code = cols[0]?.trim();
        if (!code) { errors.push(`Baris ${i + 1}: kode barang kosong`); continue; }

        const matchedItem = items.find(item => item.code === code || item.barcode === code);
        if (!matchedItem) { errors.push(`Baris ${i + 1}: kode "${code}" tidak ditemukan`); continue; }

        const newBasePrice = parsePrice(cols[1] || '');
        const newLv1 = parsePrice(cols[2] || '');
        const newLv2 = parsePrice(cols[3] || '');
        const newLv3 = parsePrice(cols[4] || '');
        const newLv4 = parsePrice(cols[5] || '');

        // At least one price must be provided
        if (!newBasePrice && !newLv1 && !newLv2 && !newLv3 && !newLv4) {
          errors.push(`Baris ${i + 1}: tidak ada harga yang valid`);
          continue;
        }

        data.push({ code, newBasePrice, newLv1, newLv2, newLv3, newLv4, name: matchedItem.name });
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

      // Rule: undefined = keep old value
      const newBasePrice = row.newBasePrice ?? item.basePrice;
      const newMemberPrices = [
        row.newLv1 ?? item.memberPrices[0],
        row.newLv2 ?? item.memberPrices[1],
        row.newLv3 ?? item.memberPrices[2],
        row.newLv4 ?? item.memberPrices[3],
      ];

      // Skip if nothing actually changed
      if (newBasePrice === item.basePrice && JSON.stringify(newMemberPrices) === JSON.stringify(item.memberPrices)) {
        return null;
      }

      return {
        itemId: item.id, itemName: item.name, itemCode: item.code, category: item.category,
        oldBasePrice: item.basePrice, newBasePrice,
        oldMemberPrices: item.memberPrices, newMemberPrices,
      };
    }).filter(Boolean) as PriceChange[];

    setPreview(changes);
    setShowPreview(true);
  };

  // === APPLY CHANGES ===
  const isBelowCost = (change: PriceChange) =>
    change.newBasePrice > 0 && change.newMemberPrices.some((price, index) => {
      const effective = price > 0 ? price : (index > 0 ? change.newMemberPrices[0] : 0);
      return effective > 0 && effective <= change.newBasePrice;
    });
  const belowCostCount = preview.filter(isBelowCost).length;

  const applyChanges = () => {
    if (preview.length === 0) return;
    if (belowCostCount > 0 && !window.confirm(`${belowCostCount} barang akan memiliki harga jual ≤ harga modal (jual rugi). Tetap terapkan?`)) return;

    // Hanya kirim field harga — stok & data lain diambil dari data terbaru saat disimpan.
    const patches = preview.map(change => {
      const item = items.find(i => i.id === change.itemId);
      if (!item) return null;
      return {
        id: item.id,
        basePrice: change.newBasePrice,
        memberPrices: change.newMemberPrices,
        // Harga Dus/Pak ikut naik/turun dengan rasio yang sama dengan harga Level 1.
        units: syncUnitPrices(item.units, change.oldMemberPrices[0] || 0, change.newMemberPrices[0] || 0, rounding),
      };
    }).filter(Boolean) as Array<Partial<Item> & { id: string }>;

    const source: PriceChangeSource = activeTab === 'margin' ? 'MARGIN' : activeTab === 'import' ? 'IMPORT' : 'BULK';
    onUpdateItemsBulk(patches, source, source === 'BULK' ? `${bulkDirection === 'up' ? 'Naik' : 'Turun'} ${bulkMode === 'percent' ? `${bulkValue}%` : rp(bulkValue)}` : undefined);

    alert(`${preview.length} item berhasil diupdate!`);
    setPreview([]);
    setShowPreview(false);
    setImportData([]);
  };

  // === EXPORT TEMPLATE ===
  const exportPriceTemplate = () => {
    downloadCsv(`harga-barang-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Kode', 'Harga Beli', 'Harga Lv1', 'Harga Lv2', 'Harga Lv3', 'Harga Lv4', 'Nama Barang', 'Kategori'],
      ...items.map(i => [i.code, i.basePrice, i.memberPrices[0] || '', i.memberPrices[1] || '', i.memberPrices[2] || '', i.memberPrices[3] || '', i.name, i.category]),
    ]);
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'bulk', label: 'Bulk Update', icon: <Zap size={16} /> },
    { id: 'margin', label: 'Markup', icon: <Calculator size={16} /> },
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
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500">Harga yang diubah</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'both', label: 'Modal + Jual' },
                    { id: 'sell', label: 'Harga Jual saja' },
                    { id: 'cost', label: 'Harga Modal saja' },
                  ] as const).map(option => (
                    <button key={option.id} type="button" onClick={() => setBulkTarget(option.id)} className={`py-2.5 rounded-xl text-xs font-medium transition-all ${bulkTarget === option.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{option.label}</button>
                  ))}
                </div>
              </div>
              {bulkTarget !== 'cost' && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-500">Pembulatan harga jual (ke atas)</label>
                  <div className="grid grid-cols-4 gap-2">
                    {ROUNDING_OPTIONS.map(option => (
                      <button key={option.value} type="button" onClick={() => setRounding(option.value)} className={`py-2 rounded-lg text-xs font-medium ${rounding === option.value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{option.label}</button>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={generateBulkPreview} disabled={bulkValue <= 0 || (bulkFilter === 'category' && !bulkFilterValue) || (bulkFilter === 'brand' && !bulkFilterValue) || (bulkFilter === 'selected' && selectedItemIds.size === 0)} className="w-full py-3.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                <ArrowRight size={18}/> Preview Perubahan ({getFilteredItems().length} item)
              </button>
            </div>
          )}

          {/* TAB: Margin-Based Pricing */}
          {activeTab === 'margin' && !showPreview && (
            <div className="space-y-5 animate-fadeIn">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <p className="text-sm text-amber-700">Set markup per kategori. Harga jual (Level 1–4) dihitung otomatis: harga modal + markup %.</p>
                <p className="text-xs text-amber-500 mt-1">Level 1 = markup penuh, Level 4 = markup dikurangi 6% (harga grosir). Barang tanpa harga modal dilewati.</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500">Pembulatan harga jual (ke atas)</label>
                <div className="grid grid-cols-4 gap-2">
                  {ROUNDING_OPTIONS.map(option => (
                    <button key={option.value} type="button" onClick={() => setRounding(option.value)} className={`py-2 rounded-lg text-xs font-medium ${rounding === option.value ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{option.label}</button>
                  ))}
                </div>
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
                          type="number" min="0" max="500"
                          className="w-16 px-2 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-center outline-none focus:border-indigo-500"
                          value={margins[cat] ?? 20}
                          onChange={e => setMargins({ ...margins, [cat]: Math.max(0, parseInt(e.target.value) || 0) })}
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
                <p className="text-xs text-blue-600">Format: <code className="bg-blue-100 px-1 rounded">Kode, Harga Beli, Lv1, Lv2, Lv3, Lv4</code></p>
                <p className="text-xs text-blue-500 mt-1">💡 Kolom yang dikosongkan = harga tidak berubah (tetap pakai harga lama). Minimal isi kode + 1 harga.</p>
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
                  <div className="max-h-48 overflow-x-auto overflow-y-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs min-w-[500px]">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="p-2 text-left text-slate-500">Kode</th>
                          <th className="p-2 text-left text-slate-500">Nama</th>
                          <th className="p-2 text-right text-slate-500">Beli</th>
                          <th className="p-2 text-right text-slate-500">Lv1</th>
                          <th className="p-2 text-right text-slate-500">Lv2</th>
                          <th className="p-2 text-right text-slate-500">Lv3</th>
                          <th className="p-2 text-right text-slate-500">Lv4</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importData.slice(0, 20).map((row, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="p-2 font-mono text-slate-700">{row.code}</td>
                            <td className="p-2 text-slate-600 truncate max-w-[120px]">{row.name}</td>
                            <td className="p-2 text-right font-semibold text-slate-800">{row.newBasePrice ? `Rp ${row.newBasePrice.toLocaleString()}` : <span className="text-slate-300">—</span>}</td>
                            <td className="p-2 text-right">{row.newLv1 ? `${row.newLv1.toLocaleString()}` : <span className="text-slate-300">—</span>}</td>
                            <td className="p-2 text-right">{row.newLv2 ? `${row.newLv2.toLocaleString()}` : <span className="text-slate-300">—</span>}</td>
                            <td className="p-2 text-right">{row.newLv3 ? `${row.newLv3.toLocaleString()}` : <span className="text-slate-300">—</span>}</td>
                            <td className="p-2 text-right">{row.newLv4 ? `${row.newLv4.toLocaleString()}` : <span className="text-slate-300">—</span>}</td>
                          </tr>
                        ))}
                        {importData.length > 20 && <tr><td colSpan={7} className="p-2 text-center text-slate-400">...dan {importData.length - 20} lainnya</td></tr>}
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
                <p className="text-sm text-slate-600">Riwayat perubahan harga per barang (tersinkron ke semua perangkat): siapa, kapan, dan dari mana perubahan berasal.</p>
              </div>
              {stalePriceCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">{stalePriceCount} barang harganya belum ditinjau &gt; 30 hari</p>
                    <p className="text-xs text-amber-600 mt-1">Cek harga supplier terbaru, lalu update lewat Bulk Update atau Import CSV.</p>
                  </div>
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400" placeholder="Cari nama / kode barang..." value={historySearch} onChange={e => setHistorySearch(e.target.value)} />
              </div>
              {filteredHistory.length === 0 ? (
                <div className="text-center py-12 text-slate-300">
                  <History size={32} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm text-slate-400">Belum ada riwayat perubahan harga</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-xs min-w-[640px]">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="p-2.5 text-left text-slate-500 font-medium">Waktu</th>
                        <th className="p-2.5 text-left text-slate-500 font-medium">Barang</th>
                        <th className="p-2.5 text-right text-slate-500 font-medium">Modal</th>
                        <th className="p-2.5 text-right text-slate-500 font-medium">Jual Lv1</th>
                        <th className="p-2.5 text-left text-slate-500 font-medium">Sumber</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.map(entry => (
                        <tr key={entry.id} className="border-t border-slate-100">
                          <td className="p-2.5 text-slate-500 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</td>
                          <td className="p-2.5"><p className="font-medium text-slate-800 truncate max-w-[180px]">{entry.itemName}</p><p className="text-[11px] text-slate-400">{entry.itemCode}</p></td>
                          <td className="p-2.5 text-right font-mono">{entry.oldBasePrice === entry.newBasePrice ? <span className="text-slate-400">{rp(entry.newBasePrice)}</span> : <>{rp(entry.oldBasePrice)} → <b>{rp(entry.newBasePrice)}</b></>}</td>
                          <td className="p-2.5 text-right font-mono">{(entry.oldMemberPrices[0] || 0) === (entry.newMemberPrices[0] || 0) ? <span className="text-slate-400">{rp(entry.newMemberPrices[0])}</span> : <>{rp(entry.oldMemberPrices[0])} → <b>{rp(entry.newMemberPrices[0])}</b></>}</td>
                          <td className="p-2.5 text-slate-600"><p>{SOURCE_LABEL[entry.source] || entry.source}</p><p className="text-[11px] text-slate-400">{entry.operatorName}</p></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
              {belowCostCount > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                  <AlertTriangle size={14} /> {belowCostCount} barang akan dijual di bawah/sama dengan harga modal (baris merah).
                </div>
              )}

              <div className="max-h-[40vh] overflow-y-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                      <th className="p-2.5 text-left text-slate-500 font-medium">Barang</th>
                      <th className="p-2.5 text-right text-slate-500 font-medium">Modal</th>
                      <th className="p-2.5 text-right text-slate-500 font-medium">Jual Lv1 Lama</th>
                      <th className="p-2.5 text-center text-slate-500 font-medium">→</th>
                      <th className="p-2.5 text-right text-slate-500 font-medium">Jual Lv1 Baru</th>
                      <th className="p-2.5 text-right text-slate-500 font-medium">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 100).map(change => {
                      const margin = getMarginPercent(change.newMemberPrices[0] || 0, change.newBasePrice);
                      const loss = isBelowCost(change);
                      return (
                        <tr key={change.itemId} className={`border-t border-slate-100 ${loss ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
                          <td className="p-2.5">
                            <p className="font-medium text-slate-800 truncate max-w-[180px]">{change.itemName}</p>
                            <p className="text-slate-400 text-[11px]">{change.category}</p>
                          </td>
                          <td className="p-2.5 text-right font-mono text-slate-600 whitespace-nowrap">{change.oldBasePrice === change.newBasePrice ? rp(change.newBasePrice) : <>{rp(change.oldBasePrice)} → <b>{rp(change.newBasePrice)}</b></>}</td>
                          <td className="p-2.5 text-right font-mono text-slate-600">{rp(change.oldMemberPrices[0])}</td>
                          <td className="p-2.5 text-center text-slate-300">→</td>
                          <td className="p-2.5 text-right font-mono font-semibold text-slate-900">{rp(change.newMemberPrices[0])}</td>
                          <td className={`p-2.5 text-right font-mono font-semibold ${loss ? 'text-red-600' : margin !== null && margin < 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {margin === null ? '-' : `${margin.toFixed(1)}%`}
                          </td>
                        </tr>
                      );
                    })}
                    {preview.length > 100 && <tr><td colSpan={6} className="p-2.5 text-center text-slate-400">...dan {preview.length - 100} item lainnya</td></tr>}
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
