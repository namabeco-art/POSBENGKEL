import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Plus, Search, Edit2, Trash2, Layers, X, 
  User as UserIcon, Truck, Phone, MapPin, 
  CreditCard, ShieldCheck, Filter, Award,
  ImageIcon, Link as LinkIcon,
  AlertCircle, Download, Upload, FileSpreadsheet,
  Package, Box, ChevronDown, Minus, RefreshCcw, Cloud,
  Sparkles,
  Barcode,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  Wand2,
  TrendingUp
} from 'lucide-react';
import { Item, Customer, Supplier, BundleComponent, PriceChangeLog, PriceChangeSource } from '../types';
import PriceManager from '../components/PriceManager';
import CustomerPaymentModal from '../components/CustomerPaymentModal';
import { createId } from '../services/idService';
import { downloadCsv, findColumn, parseCsv } from '../services/csv';
import { getMarginPercent, getSellPrice, parseRupiah } from '../services/pricing';

const ITEM_CSV_HEADER = ['Kode', 'Nama', 'Kategori', 'Merk', 'Harga Dasar', 'Harga Level 1', 'Harga Level 2', 'Harga Level 3', 'Harga Level 4', 'Barcode', 'URL Gambar', 'Stok'];

const SOURCE_LABEL: Record<PriceChangeSource, string> = {
  MANUAL: 'Edit manual',
  BULK: 'Update massal',
  MARGIN: 'Hitung markup',
  IMPORT: 'Import CSV',
  AI: 'AI Consultant',
  AI_UNDO: 'Undo AI',
  PURCHASE: 'Penerimaan PO',
  COST_REVIEW: 'Sesuaikan modal',
};

interface MasterDataProps {
  type: 'items' | 'contacts' | 'warehouses';
  items?: Item[];
  priceHistory?: PriceChangeLog[];
  customers?: Customer[];
  suppliers?: Supplier[];
  onAddItem?: (item: Item) => void;
  /** Import CSV: kode yang sudah ada diperbarui, kode baru ditambahkan. */
  onImportItems?: (items: Item[]) => { added: number; updated: number; errors: string[] };
  onUpdateItem?: (item: Item) => void;
  onUpdateItemsBulk?: (patches: Array<Partial<Item> & { id: string }>, source?: PriceChangeSource, note?: string) => void;
  /** Penyesuaian stok massal lewat opname (tercatat di kartu stok). */
  onAdjustStockBulk?: (logs: any[]) => void;
  onReceiveCustomerPayment?: (customerId: string, amount: number, method: string, note?: string) => Promise<void>;
  onAddCustomer?: (c: Customer) => void;
  onUpdateCustomer?: (c: Customer) => void;
  onAddSupplier?: (s: Supplier) => void;
  onUpdateSupplier?: (s: Supplier) => void;
  onDeleteItem?: (id: string) => void;
  onDeleteCustomer?: (id: string) => void;
  onDeleteSupplier?: (id: string) => void;
  onManualPush?: () => Promise<void>;
  onRefresh?: () => void;
  isSyncing?: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

const MasterData: React.FC<MasterDataProps> = ({
  type, items = [], priceHistory = [], customers = [], suppliers = [],
  onAddItem, onImportItems, onUpdateItem, onUpdateItemsBulk, onAdjustStockBulk, onReceiveCustomerPayment,
  onAddCustomer, onUpdateCustomer, onAddSupplier, onUpdateSupplier,
  onDeleteItem, onDeleteCustomer, onDeleteSupplier,
  canCreate = true, canEdit = true, canDelete = true
}) => {
  const [payingCustomer, setPayingCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contactTab, setContactTab] = useState<'customer' | 'supplier'>('customer');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  // Bulk Selection State
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [isPriceManagerOpen, setIsPriceManagerOpen] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState({
    category: '',
    brand: '',
    stockChange: 0
  });

  // Filter States
  const [filterCategory, setFilterCategory] = useState('Semua');
  const [filterBrand, setFilterBrand] = useState('Semua');
  const [filterStockStatus, setFilterStockStatus] = useState<'Semua' | 'Kritis' | 'Aman'>('Semua');
  const [filterType, setFilterProductType] = useState<'Semua' | 'Reguler' | 'Bundle'>('Semua');

  // FIX: Menggunakan useMemo agar daftar kategori dan merk selalu sinkron dengan data items
  const dynamicCategories = useMemo(() => {
    const baseCategories = ['Sembako', 'Minuman', 'Snack', 'Elektronik'];
    const itemCategories = items.map(i => i.category);
    return Array.from(new Set([...baseCategories, ...itemCategories])).filter(Boolean).sort();
  }, [items]);

  const dynamicBrands = useMemo(() => {
    const baseBrands = ['Indofood', 'Aqua', 'Wings', 'Unilever'];
    const itemBrands = items.map(i => i.brand);
    return Array.from(new Set([...baseBrands, ...itemBrands])).filter(Boolean).sort();
  }, [items]);
  
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [isAddingBrand, setIsAddingBrand] = useState(false);
  const [newBrandInput, setNewBrandInput] = useState('');

  // Form States for Item
  const [newItem, setNewItem] = useState({
    code: '', name: '', barcode: '', category: 'Sembako', brand: '',
    basePrice: 0, priceL1: 0, priceL2: 0, priceL3: 0, priceL4: 0,
    stock: 0, imageUrl: '', isBundle: false, components: [] as BundleComponent[]
  });

  const [isSelectingComponent, setIsSelectingComponent] = useState(false);
  const [componentSearch, setComponentSearch] = useState('');
  const [newContact, setNewContact] = useState({
    name: '', phone: '', address: '', creditLimit: 0, level: 1
  });

  // LOGIKA AUTO-GENERATE KODE & BARCODE
  useEffect(() => {
    if (!editingId && type === 'items' && newItem.name.length >= 3) {
      generateSmartCodeAndBarcode();
    }
  }, [newItem.name, newItem.brand, editingId]);

  const generateSmartCodeAndBarcode = () => {
    const cleanName = newItem.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const cleanBrand = (newItem.brand || 'NON').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const namePrefix = cleanName.substring(0, 3).padEnd(3, 'X');
    const brandPrefix = cleanBrand.substring(0, 3).padEnd(3, 'X');
    const baseCodePrefix = `${namePrefix}-${brandPrefix}`; 
    const nameNum = cleanName.charCodeAt(0).toString().substring(0, 2);
    const brandNum = cleanBrand.charCodeAt(0).toString().substring(0, 2);
    const baseBarcodePrefix = `88${nameNum}${brandNum}`;

    let counter = 1;
    let finalCode = '';
    let finalBarcode = '';
    let isUnique = false;

    while (!isUnique && counter < 999) {
      const seq = counter.toString().padStart(3, '0');
      const candidateCode = `${baseCodePrefix}-${seq}`;
      const candidateBarcode = `${baseBarcodePrefix}${seq}${Math.floor(Math.random() * 10)}`;
      const exists = items.some(i => i.code === candidateCode || i.barcode === candidateBarcode);
      if (!exists) {
        finalCode = candidateCode;
        finalBarcode = candidateBarcode;
        isUnique = true;
      } else {
        counter++;
      }
    }

    if (finalCode) {
      setNewItem(prev => ({ ...prev, code: finalCode, barcode: finalBarcode }));
    }
  };

  useEffect(() => {
    if (newItem.isBundle) {
      const totalCost = newItem.components.reduce((sum, c) => sum + (c.basePrice * c.qty), 0);
      setNewItem(prev => ({ ...prev, basePrice: totalCost }));
    }
  }, [newItem.components, newItem.isBundle]);

  const handleOpenAddModal = () => {
    setEditingId(null);
    resetItemForm();
    resetContactForm();
    setIsModalOpen(true);
  };

  const handleEditItemClick = (item: Item) => {
    setEditingId(item.id);
    setNewItem({
      code: item.code,
      name: item.name,
      barcode: item.barcode,
      category: item.category,
      brand: item.brand,
      basePrice: item.basePrice,
      priceL1: item.memberPrices[0] || 0,
      priceL2: item.memberPrices[1] || 0,
      priceL3: item.memberPrices[2] || 0,
      priceL4: item.memberPrices[3] || 0,
      stock: item.stock,
      imageUrl: item.imageUrl || '',
      isBundle: item.isBundle || false,
      components: item.components || []
    });
    setIsModalOpen(true);
  };

  const handleEditContactClick = (contact: Customer | Supplier) => {
    setEditingId(contact.id);
    if ('level' in contact) {
      setNewContact({
        name: contact.name,
        phone: contact.phone,
        address: contact.address,
        creditLimit: contact.creditLimit,
        level: contact.level
      });
    } else {
      setNewContact({
        name: contact.name,
        phone: contact.phone,
        address: contact.address,
        creditLimit: 0,
        level: 1
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmitItem = (e: React.FormEvent) => {
    e.preventDefault();
    const duplicateCode = items.find(i => i.code === newItem.code && i.id !== editingId);
    if (duplicateCode) {
      alert(`Error: Kode Barang ${newItem.code} sudah digunakan oleh ${duplicateCode.name}!`);
      return;
    }

    const memberPrices = [newItem.priceL1, newItem.priceL2, newItem.priceL3, newItem.priceL4].map(value => Math.max(0, Math.round(value || 0)));
    if (memberPrices[0] <= 0) {
      alert('Harga Level 1 (harga jual eceran) wajib diisi. Level 2–4 boleh 0 = ikut harga Level 1.');
      return;
    }
    const belowCostLevels = newItem.basePrice > 0
      ? memberPrices.map((price, index) => ({ level: index + 1, price: price > 0 ? price : memberPrices[0] })).filter(entry => entry.price <= newItem.basePrice)
      : [];
    if (belowCostLevels.length > 0 && !window.confirm(`Harga jual Level ${belowCostLevels.map(entry => entry.level).join(', ')} tidak lebih tinggi dari harga modal Rp ${newItem.basePrice.toLocaleString('id-ID')} — barang akan dijual rugi. Tetap simpan?`)) {
      return;
    }

    const existing = editingId ? items.find(i => i.id === editingId) : undefined;
    // Pertahankan satuan lain (mis. Dus isi 12); hanya harga satuan dasar yang mengikuti Level 1.
    const units = existing?.units?.length
      ? existing.units.map(unit => (unit.conversion === 1 ? { ...unit, price: memberPrices[0] } : unit))
      : [{ name: 'Pcs', conversion: 1, price: memberPrices[0] }];
    const itemData = {
      code: newItem.code,
      name: newItem.name.trim(),
      barcode: newItem.barcode,
      category: newItem.category,
      brand: newItem.brand,
      basePrice: Math.max(0, Math.round(newItem.basePrice || 0)),
      memberPrices,
      units,
      imageUrl: newItem.imageUrl.trim() || undefined,
      isBundle: newItem.isBundle,
      components: newItem.components,
    };

    if (existing && onUpdateItem) {
      onUpdateItem({ ...existing, ...itemData }); // stok tetap dari data terbaru (diatur lewat Stok Opname)
    } else if (onAddItem) {
      onAddItem({ id: createId('ITEM'), ...itemData, stock: Math.max(0, newItem.stock || 0), warehouseId: 'W1', isActive: true });
    }
    setIsModalOpen(false);
    resetItemForm();
  };

  const handleSubmitContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (contactTab === 'customer') {
      if (editingId && onUpdateCustomer) {
        const existing = customers.find(c => c.id === editingId);
        // Spread data terbaru agar piutang/poin yang berubah saat form terbuka tidak tertimpa.
        if (existing) onUpdateCustomer({ ...existing, ...newContact });
      } else if (onAddCustomer) {
        onAddCustomer({ id: createId('CUST'), ...newContact, currentDebt: 0 });
      }
    } else if (contactTab === 'supplier') {
      if (editingId && onUpdateSupplier) {
        const existing = suppliers.find(s => s.id === editingId);
        if (existing) onUpdateSupplier({ ...existing, name: newContact.name, phone: newContact.phone, address: newContact.address });
      } else if (onAddSupplier) {
        onAddSupplier({ id: createId('SUP'), name: newContact.name, phone: newContact.phone, address: newContact.address });
      }
    }
    setIsModalOpen(false);
    resetContactForm();
  };

  const resetItemForm = () => {
    setNewItem({
      code: '', name: '', barcode: '', category: 'Sembako', brand: '',
      basePrice: 0, priceL1: 0, priceL2: 0, priceL3: 0, priceL4: 0,
      stock: 0, imageUrl: '', isBundle: false, components: []
    });
    setEditingId(null);
    setIsAddingCategory(false);
    setIsAddingBrand(false);
    setNewCatInput('');
    setNewBrandInput('');
  };

  const resetContactForm = () => {
    setNewContact({ name: '', phone: '', address: '', creditLimit: 0, level: 1 });
    setEditingId(null);
  };

  const addCategory = () => {
    if (newCatInput) {
      setNewItem({...newItem, category: newCatInput});
      setNewCatInput('');
      setIsAddingCategory(false);
    }
  };

  const addBrand = () => {
    if (newBrandInput) {
      setNewItem({...newItem, brand: newBrandInput});
      setNewBrandInput('');
      setIsAddingBrand(false);
    }
  };

  const handleExport = () => {
    downloadCsv(`master_barang_${new Date().toISOString().slice(0, 10)}.csv`, [
      ITEM_CSV_HEADER,
      ...items.map(i => [
        i.code, i.name, i.category, i.brand, i.basePrice,
        ...[0, 1, 2, 3].map(level => i.memberPrices[level] || 0),
        i.barcode, i.imageUrl || '', i.stock,
      ]),
    ]);
  };

  const handleDownloadTemplate = () => {
    downloadCsv('template_import_barang.csv', [
      ITEM_CSV_HEADER,
      ['BRG-EXAMPLE', 'Contoh Produk', 'Sembako', 'Merk Contoh', 1000, 1200, 1150, 1100, 1050, '1234567890', '', 100],
    ]);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  /**
   * Import CSV (pemisah koma/titik koma otomatis). Kode yang sudah ada → harga & data master diperbarui,
   * kode baru → barang ditambahkan. Cocok untuk update harga massal: Export → ubah di Excel → Import.
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file || !onImportItems) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const rows = parseCsv(String(event.target?.result || ''));
      if (rows.length < 2) {
        alert('File kosong atau tidak sesuai template.');
        return;
      }
      const header = rows[0];
      const col = (names: string[], fallback: number) => {
        const index = findColumn(header, names);
        return index >= 0 ? index : fallback;
      };
      const idx = {
        code: col(['Kode', 'Kode Barang', 'Code', 'SKU'], 0),
        name: col(['Nama', 'Nama Barang', 'Name'], 1),
        category: col(['Kategori', 'Category'], 2),
        brand: col(['Merk', 'Brand'], 3),
        base: col(['Harga Dasar', 'Harga Beli', 'Modal', 'HPP'], 4),
        levels: [
          col(['Harga Level 1', 'Harga Lv1', 'Lv1', 'Harga Jual'], 5),
          col(['Harga Level 2', 'Harga Lv2', 'Lv2'], 6),
          col(['Harga Level 3', 'Harga Lv3', 'Lv3'], 7),
          col(['Harga Level 4', 'Harga Lv4', 'Lv4'], 8),
        ],
        barcode: col(['Barcode'], 9),
        image: col(['URL Gambar', 'Gambar', 'Image'], 10),
        stock: col(['Stok', 'Stock'], 11),
      };

      const parsed: Item[] = [];
      const skipped: string[] = [];
      rows.slice(1).forEach((row, index) => {
        const code = (row[idx.code] || '').trim();
        const name = (row[idx.name] || '').trim();
        if (!code || !name) {
          skipped.push(`Baris ${index + 2}: kode/nama kosong`);
          return;
        }
        const memberPrices = idx.levels.map(column => parseRupiah(row[column]) ?? 0);
        parsed.push({
          id: createId('ITEM'),
          code,
          name,
          category: (row[idx.category] || '').trim() || 'Umum',
          brand: (row[idx.brand] || '').trim(),
          basePrice: parseRupiah(row[idx.base]) ?? 0,
          memberPrices,
          barcode: (row[idx.barcode] || '').trim(),
          imageUrl: (row[idx.image] || '').trim() || undefined,
          stock: Math.max(0, parseRupiah(row[idx.stock]) ?? 0),
          warehouseId: 'W1',
          isActive: true,
          units: [{ name: 'Pcs', conversion: 1, price: memberPrices[0] }],
        });
      });

      if (parsed.length === 0) {
        alert(`Tidak ada baris yang bisa diimpor.\n${skipped.slice(0, 8).join('\n')}`);
        return;
      }
      const result = onImportItems(parsed);
      const errors = [...skipped, ...result.errors];
      alert(
        `Import selesai: ${result.added} barang baru, ${result.updated} barang diperbarui.`
        + (errors.length ? `\n\n${errors.length} baris dilewati:\n${errors.slice(0, 8).join('\n')}` : ''),
      );
    };
    reader.readAsText(file);
  };

  const toggleItemSelection = (id: string) => {
    setSelectedItemIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = (currentItems: Item[]) => {
    const allIds = currentItems.map(i => i.id);
    const areAllSelected = allIds.every(id => selectedItemIds.includes(id));
    
    if (areAllSelected) {
      setSelectedItemIds(prev => prev.filter(id => !allIds.includes(id)));
    } else {
      setSelectedItemIds(prev => Array.from(new Set([...prev, ...allIds])));
    }
  };

  const handleBulkUpdate = () => {
    if (selectedItemIds.length === 0) return;
    const targets = items.filter(item => selectedItemIds.includes(item.id));

    if ((bulkEditForm.category || bulkEditForm.brand) && onUpdateItemsBulk) {
      onUpdateItemsBulk(
        targets.map(item => ({
          id: item.id,
          ...(bulkEditForm.category ? { category: bulkEditForm.category } : {}),
          ...(bulkEditForm.brand ? { brand: bulkEditForm.brand } : {}),
        })),
        'BULK',
        'Edit massal kategori/merk',
      );
    }

    // Perubahan stok massal dicatat sebagai opname agar muncul di kartu stok & audit.
    if (bulkEditForm.stockChange && onAdjustStockBulk) {
      const now = new Date();
      const batchId = createId('SO');
      const change = bulkEditForm.stockChange;
      onAdjustStockBulk(targets.map((item, index) => {
        const actualStock = Math.max(0, item.stock + change);
        return {
          id: `${batchId}-${index + 1}`,
          date: now.toLocaleDateString('id-ID'),
          createdAt: now.toISOString(),
          itemId: item.id,
          itemName: item.name,
          systemStock: item.stock,
          actualStock,
          difference: actualStock - item.stock,
          notes: `Edit massal stok (${change > 0 ? '+' : ''}${change})`,
          status: 'SELESAI',
        };
      }));
    }
    setSelectedItemIds([]);
    setIsBulkEditModalOpen(false);
    setBulkEditForm({ category: '', brand: '', stockChange: 0 });
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        item.name.toLowerCase().includes(searchLower) || 
        item.code.toLowerCase().includes(searchLower) ||
        item.barcode.includes(searchLower);

      const matchesCategory = filterCategory === 'Semua' || item.category === filterCategory;
      const matchesBrand = filterBrand === 'Semua' || item.brand === filterBrand;
      
      let matchesStock = true;
      if (filterStockStatus === 'Kritis') matchesStock = item.stock < 10;
      else if (filterStockStatus === 'Aman') matchesStock = item.stock >= 10;

      let matchesType = true;
      if (filterType === 'Reguler') matchesType = !item.isBundle;
      else if (filterType === 'Bundle') matchesType = !!item.isBundle;

      return matchesSearch && matchesCategory && matchesBrand && matchesStock && matchesType;
    });
  }, [items, searchTerm, filterCategory, filterBrand, filterStockStatus, filterType]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const currentItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterCategory, filterBrand, filterStockStatus, filterType]);

  const resetFilters = () => {
    setSearchTerm('');
    setFilterCategory('Semua');
    setFilterBrand('Semua');
    setFilterStockStatus('Semua');
    setFilterProductType('Semua');
  };

  const toggleComponentToBundle = (item: Item) => {
    const exists = newItem.components.find(c => c.itemId === item.id);
    if (exists) {
      setNewItem(prev => ({ ...prev, components: prev.components.filter(c => c.itemId !== item.id) }));
    } else {
      setNewItem(prev => ({ ...prev, components: [...prev.components, { itemId: item.id, name: item.name, qty: 1, basePrice: item.basePrice }] }));
    }
  };

  const updateComponentQty = (itemId: string, qty: number) => {
    setNewItem(prev => ({ ...prev, components: prev.components.map(c => c.itemId === itemId ? { ...c, qty: Math.max(1, qty) } : c) }));
  };

  const renderItemsTable = () => (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleFileChange} />
          <button onClick={handleDownloadTemplate} className="flex items-center gap-2 p-3 bg-white border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm active:scale-95" title="Download Template Excel">
            <Download size={18}/><span className="hidden lg:block text-[11px] font-bold uppercase">Template</span>
          </button>
          {canCreate && <button onClick={handleImportClick} className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-700 hover:bg-emerald-100 transition-all shadow-sm active:scale-95" title="Import Excel">
            <Upload size={18}/><span className="hidden lg:block text-[11px] font-bold uppercase">Import</span>
          </button>}
          <button onClick={handleExport} className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-300 rounded-xl text-blue-700 hover:bg-blue-100 transition-all shadow-sm active:scale-95" title="Export Excel">
            <FileSpreadsheet size={18}/><span className="hidden lg:block text-[11px] font-bold uppercase">Export</span>
          </button>
          {canEdit && selectedItemIds.length > 0 && (
            <button 
              onClick={() => setIsBulkEditModalOpen(true)}
              className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-300 rounded-xl text-orange-700 hover:bg-orange-100 transition-all shadow-sm active:scale-95 animate-in slide-in-from-left"
            >
              <Wand2 size={18}/><span className="text-[11px] font-bold uppercase">Edit Massal ({selectedItemIds.length})</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && <button onClick={() => setIsPriceManagerOpen(true)} className="flex items-center gap-2 px-4 py-3.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-2xl font-bold hover:bg-amber-100 transition-all active:scale-95 text-xs uppercase tracking-tight">
            <TrendingUp size={18} /> <span className="hidden sm:inline">Kelola Harga</span><span className="sm:hidden">Harga</span>
          </button>}
          {canCreate && <button onClick={handleOpenAddModal} className="flex items-center gap-2 px-6 py-3.5 bg-blue-700 text-white rounded-2xl font-bold hover:bg-blue-800 shadow-xl transition-all active:scale-95 uppercase tracking-tight">
            <Plus size={20} /> <span className="hidden sm:inline">TAMBAH BARANG BARU</span><span className="sm:hidden">TAMBAH BARANG</span>
          </button>}
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-md space-y-5">
        <div className="flex flex-col lg:flex-row gap-4">
           <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input type="text" placeholder="Cari Nama Produk, SKU, atau Barcode..." className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-300 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-semibold text-slate-800 transition-all focus:border-blue-600 focus:bg-white" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
           </div>
           <div className="flex flex-wrap gap-3">
              <div className="relative min-w-[140px]">
                 <select className="w-full pl-4 pr-10 py-3.5 bg-slate-50 border border-slate-300 rounded-2xl appearance-none font-bold text-[11px] uppercase tracking-wider text-slate-700 focus:border-blue-600 outline-none cursor-pointer" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                    <option value="Semua">SEMUA KATEGORI</option>
                    {dynamicCategories.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                 </select>
                 <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
              <div className="relative min-w-[140px]">
                 <select className="w-full pl-4 pr-10 py-3.5 bg-slate-50 border border-slate-300 rounded-2xl appearance-none font-bold text-[11px] uppercase tracking-wider text-slate-700 focus:border-blue-600 outline-none cursor-pointer" value={filterBrand} onChange={e => setFilterBrand(e.target.value)}>
                    <option value="Semua">SEMUA MERK</option>
                    {dynamicBrands.map(b => <option key={b} value={b}>{b.toUpperCase()}</option>)}
                 </select>
                 <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
           </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-100">
           <div className="flex flex-wrap gap-3">
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
                 {['Semua', 'Kritis', 'Aman'].map(status => (
                   <button key={status} onClick={() => setFilterStockStatus(status as any)} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 ${filterStockStatus === status ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{status === 'Semua' ? 'SEMUA STOK' : status.toUpperCase()}</button>
                 ))}
              </div>
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
                 {['Semua', 'Reguler', 'Bundle'].map(type => (
                   <button key={type} onClick={() => setFilterProductType(type as any)} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 ${filterType === type ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{type === 'Semua' ? 'SEMUA TIPE' : type.toUpperCase()}</button>
                 ))}
              </div>
           </div>
           <button onClick={resetFilters} className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-[11px] uppercase tracking-widest hover:bg-black transition-all active:scale-95 shadow-lg"><RefreshCcw size={14}/> RESET FILTER</button>
        </div>
      </div>

      <div className="flex items-center justify-between px-2">
         <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Halaman {currentPage} dari {totalPages} ({filteredItems.length} Produk)</span>
         </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-300 shadow-lg overflow-hidden">
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-300">
              <tr className="text-left">
                <th className="px-6 py-6 border-r border-slate-200 w-10">
                   <button onClick={() => toggleSelectAll(currentItems)} className="text-slate-400 hover:text-blue-600 transition-colors">
                      {currentItems.every(i => selectedItemIds.includes(i.id)) ? <CheckSquare size={20} className="text-blue-600"/> : <Square size={20}/>}
                   </button>
                </th>
                <th className="px-8 py-6 font-bold text-slate-700 uppercase text-[11px] tracking-wider whitespace-nowrap border-r border-slate-200">Produk & Identitas</th>
                <th className="px-8 py-6 font-bold text-slate-700 uppercase text-[11px] tracking-wider border-r border-slate-200">Kategori & Merk</th>
                <th className="px-8 py-6 font-bold text-slate-700 uppercase text-[11px] tracking-wider border-r border-slate-200">Harga Jual (L1)</th>
                <th className="px-8 py-6 font-bold text-slate-700 uppercase text-[11px] tracking-wider text-right border-r border-slate-200">Stok</th>
                <th className="px-8 py-6 font-bold text-slate-700 uppercase text-[11px] tracking-wider text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {currentItems.map((item) => (
                <tr key={item.id} className={`hover:bg-blue-50/40 transition-colors group ${selectedItemIds.includes(item.id) ? 'bg-blue-50/60' : ''}`}>
                  <td className="px-6 py-5 border-r border-slate-100">
                    <button onClick={() => toggleItemSelection(item.id)} className="text-slate-300 hover:text-blue-600 transition-colors">
                      {selectedItemIds.includes(item.id) ? <CheckSquare size={20} className="text-blue-600"/> : <Square size={20}/>}
                    </button>
                  </td>
                  <td className="px-8 py-5 border-r border-slate-100">
                    <div className="flex items-center gap-5">
                      <div className="relative shrink-0">
                        {item.imageUrl
                          ? <img src={item.imageUrl} alt="" className="w-14 h-14 rounded-2xl object-cover border border-slate-300 shadow-sm" />
                          : <div className="w-14 h-14 rounded-2xl border border-slate-300 bg-slate-100 flex items-center justify-center text-slate-400"><Package size={22} /></div>}
                        <div className="absolute -bottom-1 -right-1 bg-white p-1 rounded-lg border border-slate-200">
                          {item.isBundle ? <Box size={12} className="text-orange-600"/> : <ShieldCheck size={12} className="text-blue-600"/>}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="font-bold text-slate-900 text-base leading-tight truncate">{item.name}</div>
                          {item.isBundle && <span className="shrink-0 text-[8px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded border border-orange-200 uppercase tracking-tight">Paket</span>}
                        </div>
                        <div className="flex items-center gap-2 overflow-hidden">
                           <span className="shrink-0 text-[10px] font-bold text-white uppercase tracking-wider bg-slate-800 px-2 py-0.5 rounded shadow-sm">CODE: {item.code}</span>
                           <span className="text-[11px] font-mono text-blue-700 font-bold truncate">{item.barcode}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5 border-r border-slate-100">
                    <div className="flex flex-col gap-1.5">
                      <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight w-fit border border-blue-200">{item.category}</span>
                      <span className="text-[12px] text-slate-600 font-bold uppercase tracking-tight">{item.brand || 'No Brand'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 border-r border-slate-100">
                     {(() => {
                       const sellPrice = getSellPrice(item, 1);
                       const margin = getMarginPercent(sellPrice, item.basePrice);
                       const isLoss = item.basePrice > 0 && sellPrice > 0 && sellPrice <= item.basePrice;
                       return (
                         <>
                           <div className="font-bold text-slate-900 text-base tracking-tighter">{sellPrice > 0 ? `Rp ${sellPrice.toLocaleString('id-ID')}` : <span className="text-red-600 text-sm">Belum diatur</span>}</div>
                           <div className="text-[10px] font-bold text-slate-500 uppercase">Modal: Rp {item.basePrice.toLocaleString('id-ID')}</div>
                           {margin !== null && item.basePrice > 0 && (
                             <div className={`mt-1 inline-block text-[10px] font-bold px-2 py-0.5 rounded ${isLoss ? 'bg-red-100 text-red-700' : margin < 10 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                               {isLoss ? 'RUGI ' : 'Margin '}{margin.toFixed(1)}%
                             </div>
                           )}
                         </>
                       );
                     })()}
                  </td>
                  <td className="px-8 py-5 text-right border-r border-slate-100">
                    <div className={`font-bold text-xl tracking-tighter ${item.stock < 10 ? 'text-red-600' : 'text-emerald-700'}`}>{item.stock}</div>
                    <div className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full inline-block ${item.stock < 10 ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>{item.stock < 10 ? 'KRITIS' : 'AMAN'}</div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex justify-center gap-2">
                      {canEdit && <button onClick={() => handleEditItemClick(item)} className="p-3 text-slate-600 hover:text-blue-700 hover:bg-blue-100 rounded-xl transition-all shadow-sm border border-slate-200 active:scale-90"><Edit2 size={18} /></button>}
                      {canDelete && <button onClick={() => onDeleteItem && window.confirm(`Hapus barang "${item.name}"? Riwayat transaksi lama tetap tersimpan.`) && onDeleteItem(item.id)} className="p-3 text-slate-600 hover:text-red-700 hover:bg-red-100 rounded-xl transition-all shadow-sm border border-slate-200 active:scale-90"><Trash2 size={18} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {currentItems.length === 0 && (
                <tr><td colSpan={6} className="py-20 text-center opacity-10 font-black uppercase tracking-widest text-2xl">Data Tidak Ditemukan</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-3 pt-4">
           <button 
             disabled={currentPage === 1} 
             onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
             className="p-3 bg-white border border-slate-300 rounded-xl text-slate-600 disabled:opacity-30 hover:bg-slate-50 transition-all active:scale-90"
           >
             <ChevronLeft size={20}/>
           </button>
           
           <div className="flex items-center gap-1.5 overflow-x-auto max-w-[200px] sm:max-w-none scrollbar-hide">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button 
                  key={i} 
                  onClick={() => setCurrentPage(i + 1)}
                  className={`min-w-[40px] h-10 rounded-xl font-bold text-sm transition-all ${currentPage === i + 1 ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200 hover:border-blue-400'}`}
                >
                  {i + 1}
                </button>
              ))}
           </div>

           <button 
             disabled={currentPage === totalPages} 
             onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
             className="p-3 bg-white border border-slate-300 rounded-xl text-slate-600 disabled:opacity-30 hover:bg-slate-50 transition-all active:scale-90"
           >
             <ChevronRight size={20}/>
           </button>
        </div>
      )}

      {/* Bulk Edit Modal */}
      {isBulkEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[200] flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl border-4 border-orange-100 animate-in zoom-in duration-300">
              <div className="flex justify-between items-center mb-8">
                 <div className="flex items-center gap-4">
                    <div className="p-3 bg-orange-600 text-white rounded-2xl"><Wand2 size={24}/></div>
                    <div>
                       <h3 className="text-xl font-black text-slate-900 uppercase">Edit Massal</h3>
                       <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedItemIds.length} Produk Terpilih</p>
                    </div>
                 </div>
                 <button onClick={() => setIsBulkEditModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all"><X/></button>
              </div>
              
              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Kategori Baru (Kosongkan jika tetap)</label>
                    <select className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-orange-500" value={bulkEditForm.category} onChange={e => setBulkEditForm({...bulkEditForm, category: e.target.value})}>
                       <option value="">-- Tetap --</option>
                       {dynamicCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Merk Baru (Kosongkan jika tetap)</label>
                    <select className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-orange-500" value={bulkEditForm.brand} onChange={e => setBulkEditForm({...bulkEditForm, brand: e.target.value})}>
                       <option value="">-- Tetap --</option>
                       {dynamicBrands.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                 </div>
                 {onAdjustStockBulk && (
                 <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Tambah/Kurang Stok (Misal: 10 atau -5)</label>
                    <input type="number" className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-orange-500" value={bulkEditForm.stockChange} onChange={e => setBulkEditForm({...bulkEditForm, stockChange: parseInt(e.target.value) || 0})} />
                    <p className="text-[11px] text-slate-500 ml-1">Dicatat sebagai stok opname di kartu stok.</p>
                 </div>
                 )}
              </div>

              <div className="mt-10 flex gap-4">
                 <button onClick={() => setIsBulkEditModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 font-bold rounded-2xl hover:bg-slate-200">Batal</button>
                 <button onClick={handleBulkUpdate} className="flex-1 py-4 bg-orange-600 text-white font-black rounded-2xl shadow-xl hover:bg-orange-700 border-b-4 border-orange-800 active:scale-95 uppercase tracking-widest">Terapkan Perubahan</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );

  const renderContactsTable = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-7 rounded-[2rem] border-2 border-slate-200 shadow-md flex items-center gap-5">
           <div className="p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100"><UserIcon size={28}/></div>
           <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total Pelanggan</div>
              <div className="text-3xl font-bold text-slate-900 tracking-tighter">{customers.length}</div>
           </div>
        </div>
        <div className="bg-white p-7 rounded-[2rem] border-2 border-slate-200 shadow-md flex items-center gap-5">
           <div className="p-4 bg-purple-600 text-white rounded-2xl shadow-lg shadow-purple-100"><Truck size={28}/></div>
           <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total Supplier</div>
              <div className="text-3xl font-bold text-slate-900 tracking-tighter">{suppliers.length}</div>
           </div>
        </div>
        <div className="bg-white p-7 rounded-[2rem] border-2 border-slate-200 shadow-md flex items-center gap-5">
           <div className="p-4 bg-emerald-600 text-white rounded-2xl shadow-lg shadow-emerald-100"><CreditCard size={28}/></div>
           <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 text-emerald-700">Total Piutang</div>
              <div className="text-3xl font-bold text-slate-900 tracking-tighter text-emerald-800">Rp {customers.reduce((s, c) => s + c.currentDebt, 0).toLocaleString()}</div>
           </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex bg-slate-200/50 p-1 rounded-2xl border border-slate-300 shadow-inner">
           <button onClick={() => setContactTab('customer')} className={`px-8 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 ${contactTab === 'customer' ? 'bg-white text-blue-700 shadow-md border border-blue-100' : 'text-slate-600 hover:text-slate-800'}`}>PELANGGAN</button>
           <button onClick={() => setContactTab('supplier')} className={`px-8 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 ${contactTab === 'supplier' ? 'bg-white text-purple-700 shadow-md border border-purple-100' : 'text-slate-600 hover:text-slate-800'}`}>SUPPLIER</button>
        </div>
        <div className="flex-1 max-w-md relative">
           <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
           <input type="text" placeholder={`Cari ${contactTab === 'customer' ? 'pelanggan' : 'supplier'}...`} className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-300 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none shadow-sm font-bold text-slate-800 transition-all placeholder:text-slate-400 focus:border-blue-600" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        {canCreate && <button onClick={handleOpenAddModal} className="flex items-center gap-2 px-8 py-3.5 bg-slate-900 text-white rounded-2xl font-bold hover:bg-black shadow-xl active:scale-95 transition-all uppercase text-sm tracking-tight"><Plus size={20} /> Tambah {contactTab === 'customer' ? 'Pelanggan' : 'Supplier'}</button>}
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-300 shadow-xl overflow-hidden">
         <table className="w-full text-sm">
            <thead className="bg-slate-100 border-b border-slate-300 text-left">
               <tr>
                  <th className="px-8 py-6 text-[11px] font-bold text-slate-700 uppercase tracking-widest border-r border-slate-200">Nama & Identitas</th>
                  <th className="px-8 py-6 text-[11px] font-bold text-slate-700 uppercase tracking-widest border-r border-slate-200">Informasi Kontak</th>
                  <th className="px-8 py-6 text-[11px] font-bold text-slate-700 uppercase tracking-widest border-r border-slate-200">Alamat Lengkap</th>
                  {contactTab === 'customer' && <th className="px-8 py-6 text-[11px] font-bold text-slate-700 uppercase tracking-widest text-right border-r border-slate-200">Level & Limit</th>}
                  <th className="px-8 py-6 text-[11px] font-bold text-slate-700 uppercase tracking-widest text-center">Aksi</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
               {(contactTab === 'customer' ? customers : suppliers)
                 .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
                 .map(contact => (
                  <tr key={contact.id} className="hover:bg-slate-50 transition-colors">
                     <td className="px-8 py-5 border-r border-slate-100">
                        <div className="flex items-center gap-4">
                           <div className={`p-3 rounded-2xl border-2 ${contactTab === 'customer' ? 'bg-blue-100 border-blue-200 text-blue-700' : 'bg-purple-100 border-purple-200 text-purple-700'}`}>{contactTab === 'customer' ? <UserIcon size={20}/> : <Truck size={20}/>}</div>
                           <div>
                              <div className="font-bold text-slate-900 text-base tracking-tight leading-none mb-1">{contact.name}</div>
                              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">ID: {contact.id}</div>
                           </div>
                        </div>
                     </td>
                     <td className="px-8 py-5 border-r border-slate-100"><div className="flex items-center gap-2 text-slate-800 font-bold"><Phone size={14} className="text-blue-600"/> {contact.phone}</div></td>
                     <td className="px-8 py-5 border-r border-slate-100"><div className="flex items-start gap-2 text-slate-700 font-semibold max-w-xs leading-relaxed"><MapPin size={14} className="text-red-600 mt-1 shrink-0"/> {contact.address}</div></td>
                     {contactTab === 'customer' && (
                        <td className="px-8 py-5 text-right border-r border-slate-100">
                           <div className="flex flex-col items-end gap-1">
                              <span className="bg-emerald-600 text-white px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm">Level {(contact as Customer).level}</span>
                              <div className={`font-bold text-base tracking-tighter ${(contact as Customer).currentDebt > 0 ? 'text-red-600' : 'text-slate-900'}`}>Piutang: Rp {(contact as Customer).currentDebt.toLocaleString('id-ID')}</div>
                              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Limit: Rp {(contact as Customer).creditLimit.toLocaleString()}</div>
                           </div>
                        </td>
                     )}
                     <td className="px-8 py-5 text-center">
                        <div className="flex justify-center gap-2">
                           {contactTab === 'customer' && onReceiveCustomerPayment && (contact as Customer).currentDebt > 0 && (
                             <button onClick={() => setPayingCustomer(contact as Customer)} className="px-3 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all active:scale-90" title="Terima pembayaran piutang">
                               <CreditCard size={16} className="inline mr-1"/>Bayar
                             </button>
                           )}
                           {canEdit && <button onClick={() => handleEditContactClick(contact)} className="p-3 text-slate-700 hover:text-blue-700 hover:bg-blue-100 border border-slate-200 rounded-xl transition-all active:scale-90"><Edit2 size={18}/></button>}
                           {canDelete && <button onClick={() => window.confirm(`Hapus ${contactTab === 'customer' ? 'pelanggan' : 'supplier'} "${contact.name}"?`) && (contactTab === 'customer' ? (onDeleteCustomer && onDeleteCustomer(contact.id)) : (onDeleteSupplier && onDeleteSupplier(contact.id)))} className="p-3 text-slate-700 hover:text-red-700 hover:bg-red-100 border border-slate-200 rounded-xl transition-all active:scale-90"><Trash2 size={18}/></button>}
                        </div>
                     </td>
                  </tr>
               ))}
            </tbody>
         </table>
      </div>
    </div>
  );

  return (
    <div className="font-sans">
      {type === 'items' && renderItemsTable()}
      {type === 'contacts' && renderContactsTable()}
      
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl z-[150] flex items-center justify-center p-0 md:p-6 overflow-hidden">
           <div className="bg-white w-full max-w-2xl h-full md:h-auto md:rounded-[3rem] p-6 md:p-10 shadow-2xl animate-in zoom-in duration-300 overflow-y-auto max-h-[100vh] md:max-h-[95vh] scrollbar-hide relative border border-slate-300">
              <div className="flex justify-between items-center mb-10 sticky top-0 bg-white z-[160] pb-4 border-b border-slate-100">
                 <div>
                   <h3 className="text-2xl md:text-4xl font-bold text-slate-900 tracking-tighter uppercase leading-none">{editingId ? 'EDIT' : 'INPUT'} {type === 'items' ? 'BARANG' : contactTab === 'customer' ? 'PELANGGAN' : 'SUPPLIER'}</h3>
                   <p className="text-slate-600 font-bold text-[10px] md:text-sm uppercase tracking-widest mt-2">Pencatatan Master Data Hulio Group</p>
                 </div>
                 <button type="button" onClick={() => setIsModalOpen(false)} className="p-4 md:p-4 bg-slate-100 rounded-2xl hover:bg-red-600 hover:text-white transition-all active:scale-90 shadow-sm border-2 border-slate-300" aria-label="Close"><X size={24}/></button>
              </div>

              {type === 'items' ? (
                <form onSubmit={handleSubmitItem} className="space-y-6">
                   <div className="p-6 bg-slate-50 border-2 border-slate-200 rounded-3xl">
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-widest block mb-4">Tipe Produk</label>
                      <div className="flex bg-slate-200 p-1 rounded-2xl">
                         <button type="button" onClick={() => setNewItem(prev => ({ ...prev, isBundle: false, components: [] }))} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs transition-all ${!newItem.isBundle ? 'bg-white text-blue-700 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}><Package size={16}/> REGULER</button>
                         <button type="button" onClick={() => setNewItem(prev => ({ ...prev, isBundle: true }))} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs transition-all ${newItem.isBundle ? 'bg-white text-orange-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}><Box size={16}/> PAKET / BUNDLE</button>
                      </div>
                   </div>

                   <div className="space-y-6">
                      <div className="col-span-2">
                         <div className="flex justify-between items-center mb-2">
                           <label className="text-[11px] font-bold text-slate-700 uppercase tracking-widest block ml-1">Nama Produk</label>
                           {!editingId && <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1 animate-pulse"><Sparkles size={10}/> Auto-Code Active</span>}
                         </div>
                         <input required className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-4 focus:border-blue-700 bg-white outline-none font-bold text-slate-900 shadow-inner placeholder:text-slate-300" placeholder="Contoh: Susu UHT 1L" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-1">
                           <label className="text-[11px] font-bold text-slate-700 uppercase tracking-widest block mb-2">Kategori</label>
                           <div className="flex gap-2">
                             {isAddingCategory ? (
                                <div className="flex-1 flex gap-2">
                                  <input autoFocus className="flex-1 bg-white border-2 border-blue-500 rounded-2xl px-4 py-2 font-bold" value={newCatInput} onChange={e => setNewCatInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addCategory())} />
                                  <button type="button" onClick={addCategory} className="p-3 bg-emerald-500 text-white rounded-xl active:scale-90"><Plus size={20}/></button>
                                  <button type="button" onClick={() => { setIsAddingCategory(false); setNewCatInput(''); }} className="p-3 bg-slate-200 text-slate-500 rounded-xl active:scale-90"><X size={20}/></button>
                                </div>
                             ) : (
                                <div className="flex-1 flex gap-2">
                                  <select className="flex-1 bg-slate-50 border border-slate-300 rounded-2xl p-4 focus:border-blue-700 bg-white outline-none font-bold text-slate-900 shadow-inner cursor-pointer" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                                      {dynamicCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                  <button type="button" onClick={() => setIsAddingCategory(true)} className="p-4 bg-slate-100 text-slate-600 rounded-2xl border border-slate-300 hover:bg-blue-600 hover:text-white transition-all active:scale-90"><Plus size={20}/></button>
                                </div>
                             )}
                           </div>
                        </div>

                        <div className="col-span-1">
                           <label className="text-[11px] font-bold text-slate-700 uppercase tracking-widest block mb-2">Merk / Brand</label>
                           <div className="flex gap-2">
                             {isAddingBrand ? (
                                <div className="flex-1 flex gap-2">
                                  <input autoFocus className="flex-1 bg-white border-2 border-blue-500 rounded-2xl px-4 py-2 font-bold" value={newBrandInput} onChange={e => setNewBrandInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addBrand())} />
                                  <button type="button" onClick={addBrand} className="p-3 bg-emerald-500 text-white rounded-xl active:scale-90"><Plus size={20}/></button>
                                  <button type="button" onClick={() => { setIsAddingBrand(false); setNewBrandInput(''); }} className="p-3 bg-slate-200 text-slate-500 rounded-xl active:scale-90"><X size={20}/></button>
                                </div>
                             ) : (
                                <div className="flex-1 flex gap-2">
                                  <select className="flex-1 bg-slate-50 border border-slate-300 rounded-2xl p-4 focus:border-blue-700 bg-white outline-none font-bold text-slate-900 shadow-inner cursor-pointer" value={newItem.brand} onChange={e => setNewItem({...newItem, brand: e.target.value})}>
                                      <option value="">-- Tanpa Merk --</option>
                                      {dynamicBrands.map(b => <option key={b} value={b}>{b}</option>)}
                                  </select>
                                  <button type="button" onClick={() => setIsAddingBrand(true)} className="p-4 bg-slate-100 text-slate-600 rounded-2xl border border-slate-300 hover:bg-blue-600 hover:text-white transition-all active:scale-90"><Plus size={20}/></button>
                                </div>
                             )}
                           </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-6 bg-blue-50/50 p-6 rounded-[2rem] border-2 border-blue-100">
                        <div className="col-span-2 md:col-span-1">
                           <label className="text-[11px] font-bold text-blue-700 uppercase tracking-widest block mb-2">Kode Barang (ABC-DEF-001)</label>
                           <div className="relative">
                             <input required className="w-full bg-white border border-blue-300 rounded-2xl p-4 focus:border-blue-700 outline-none font-black text-blue-900 transition-all shadow-sm placeholder:text-blue-200" placeholder="AUTO" value={newItem.code} readOnly={!editingId} onChange={e => editingId && setNewItem({...newItem, code: e.target.value.toUpperCase()})} />
                             {!editingId && <Sparkles className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-400" size={18}/>}
                           </div>
                        </div>
                        <div className="col-span-2 md:col-span-1">
                           <label className="text-[11px] font-bold text-blue-700 uppercase tracking-widest block mb-2">Barcode (Numeric Only)</label>
                           <div className="relative">
                             <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                             <input required className="w-full pl-12 pr-4 py-4 bg-white border border-blue-300 rounded-2xl focus:border-blue-700 outline-none font-black text-blue-900 shadow-sm" placeholder="Contoh: 88123456001" value={newItem.barcode} onChange={e => setNewItem({...newItem, barcode: e.target.value.replace(/\D/g, '')})} />
                           </div>
                        </div>
                      </div>
                   </div>

                   {newItem.isBundle && (
                     <div className="p-8 bg-orange-50 border-2 border-orange-200 rounded-[2.5rem] space-y-6">
                        <div className="flex justify-between items-center">
                           <label className="text-[11px] font-bold text-orange-800 uppercase tracking-widest flex items-center gap-2"><Box size={14}/> ITEM PENYUSUN PAKET</label>
                           <button type="button" onClick={() => setIsSelectingComponent(!isSelectingComponent)} className="px-4 py-2 bg-white text-orange-600 border border-orange-200 rounded-xl font-bold text-[11px] uppercase hover:bg-orange-600 hover:text-white transition-all shadow-sm active:scale-95">{isSelectingComponent ? 'TUTUP' : 'TAMBAH'}</button>
                        </div>
                        {isSelectingComponent && (
                          <div className="bg-white p-4 rounded-2xl border border-orange-200 shadow-lg space-y-3 animate-in fade-in duration-300">
                             <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/><input className="w-full pl-10 pr-4 py-3 bg-slate-50 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-orange-400" placeholder="Cari item penyusun..." value={componentSearch} onChange={e => setComponentSearch(e.target.value)} />
                             </div>
                             <div className="max-h-[200px] overflow-y-auto space-y-2 scrollbar-hide">
                                {items.filter(i => !i.isBundle && (i.name.toLowerCase().includes(componentSearch.toLowerCase()) || i.code.toLowerCase().includes(componentSearch.toLowerCase()))).map(i => {
                                    const isSelected = newItem.components.find(c => c.itemId === i.id);
                                    return (
                                      <button key={i.id} type="button" onClick={() => toggleComponentToBundle(i)} className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all active:scale-[0.98] ${isSelected ? 'bg-orange-100 border-orange-400' : 'bg-slate-50 border-transparent hover:border-slate-300'}`}>
                                         <div className="flex items-center gap-3"><img src={i.imageUrl} className="w-8 h-8 rounded-lg object-cover" /><div className="text-left"><div className="font-bold text-[11px] text-slate-800 uppercase leading-none">{i.name}</div><div className="text-[9px] font-bold text-slate-400 mt-1">HPP: Rp {i.basePrice.toLocaleString()}</div></div></div>
                                         {isSelected ? <ShieldCheck size={18} className="text-orange-600"/> : <Plus size={18} className="text-slate-400"/>}
                                      </button>
                                    );
                                })}
                             </div>
                          </div>
                        )}
                        <div className="space-y-2">
                           {newItem.components.map(c => (
                             <div key={c.itemId} className="flex items-center justify-between p-3 bg-white rounded-2xl border border-orange-100 shadow-sm">
                                <div className="flex flex-col"><div className="font-bold text-[12px] text-slate-800 uppercase">{c.name}</div><div className="text-[10px] font-bold text-slate-400 mt-0.5">@ Rp {c.basePrice.toLocaleString()}</div></div>
                                <div className="flex items-center gap-4"><div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl"><button type="button" onClick={() => updateComponentQty(c.itemId, c.qty - 1)} className="p-2 text-slate-500 hover:text-orange-600 active:scale-90"><Minus size={14}/></button><span className="font-bold text-xs min-w-[20px] text-center">{c.qty}</span><button type="button" onClick={() => updateComponentQty(c.itemId, c.qty + 1)} className="p-2 text-slate-500 hover:text-orange-600 active:scale-90"><Plus size={14}/></button></div><div className="font-bold text-orange-700 text-xs tracking-tight min-w-[100px] text-right">Rp {(c.qty * c.basePrice).toLocaleString()}</div><button type="button" onClick={() => toggleComponentToBundle({ id: c.itemId } as any)} className="p-2 text-red-400 hover:text-red-600 transition-all active:scale-90"><Trash2 size={18}/></button></div>
                             </div>
                           ))}
                        </div>
                     </div>
                   )}

                   <div className="p-6 bg-blue-50 border-2 border-blue-100 rounded-[2rem] space-y-4">
                      <label className="text-[11px] font-bold text-blue-800 uppercase tracking-widest flex items-center gap-2"><ImageIcon size={14}/> Gambar Produk (URL Source)</label>
                      <div className="relative"><LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400" size={18}/><input className="w-full pl-12 pr-4 py-4 bg-white border-2 border-blue-300 rounded-2xl focus:border-blue-700 outline-none font-bold text-blue-900 shadow-sm placeholder:text-blue-200" placeholder="https://images.unsplash.com/..." value={newItem.imageUrl} onChange={e => setNewItem({...newItem, imageUrl: e.target.value})} /></div>
                   </div>

                   <div className="bg-slate-100 p-8 rounded-[2.5rem] border-2 border-slate-300 space-y-6">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="col-span-2 md:col-span-1">
                           <label className="text-[11px] font-bold text-slate-700 uppercase tracking-widest block mb-2">Harga Dasar (Beli)</label>
                           <input type="number" required disabled={newItem.isBundle} className={`w-full bg-white border border-slate-300 rounded-2xl p-4 font-bold text-slate-900 outline-none focus:border-slate-500 ${newItem.isBundle ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} value={newItem.basePrice} onChange={e => !newItem.isBundle && setNewItem({...newItem, basePrice: parseInt(e.target.value) || 0})} />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                           <label className="text-[11px] font-bold text-blue-700 uppercase tracking-widest block mb-2">{editingId ? 'Stok Saat Ini' : 'Stok Awal'}</label>
                           <input type="number" min={0} disabled={!!editingId} className={`w-full border border-slate-300 rounded-2xl p-4 font-bold outline-none focus:border-blue-500 ${editingId ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white text-slate-900'}`} value={editingId ? (items.find(i => i.id === editingId)?.stock ?? newItem.stock) : newItem.stock} onChange={e => setNewItem({...newItem, stock: parseInt(e.target.value) || 0})} />
                           {editingId && <p className="text-[10px] text-slate-500 mt-1">Ubah stok lewat menu Stok Opname agar tercatat di kartu stok.</p>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map(l => {
                          const value = newItem[`priceL${l}` as keyof typeof newItem] as number;
                          const effective = value > 0 ? value : newItem.priceL1;
                          const margin = getMarginPercent(effective, newItem.basePrice);
                          const isLoss = newItem.basePrice > 0 && effective > 0 && effective <= newItem.basePrice;
                          return (
                            <div key={l}>
                              <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">Harga Level {l}{l === 1 ? ' *' : ''}</label>
                              <input type="number" min={0} required={l === 1} placeholder={l === 1 ? 'Wajib' : 'Ikut L1'} className={`w-full bg-white border rounded-xl p-3 font-bold text-xs outline-none focus:border-blue-600 shadow-inner ${isLoss ? 'border-red-400' : 'border-slate-300'}`} value={value || ''} onChange={e => setNewItem({...newItem, [`priceL${l}`]: parseInt(e.target.value) || 0})} />
                              {margin !== null && newItem.basePrice > 0 && (
                                <p className={`text-[10px] font-bold mt-1 ${isLoss ? 'text-red-600' : margin < 10 ? 'text-amber-600' : 'text-emerald-600'}`}>{isLoss ? 'Rugi' : 'Margin'} {margin.toFixed(1)}%</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-slate-500">Harga Level 2–4 yang dikosongkan otomatis memakai harga Level 1.</p>
                      {editingId && priceHistory.some(entry => entry.itemId === editingId) && (
                        <div className="bg-white rounded-2xl border border-slate-200 p-4">
                          <p className="text-[11px] font-bold text-slate-700 uppercase tracking-widest mb-2">Riwayat Harga Terakhir</p>
                          <div className="space-y-1.5">
                            {priceHistory.filter(entry => entry.itemId === editingId).slice(0, 5).map(entry => (
                              <div key={entry.id} className="flex justify-between gap-3 text-[11px] text-slate-600">
                                <span>{new Date(entry.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })} • {SOURCE_LABEL[entry.source] || entry.source} • {entry.operatorName}</span>
                                <span className="font-semibold text-slate-800 whitespace-nowrap">
                                  Jual Rp {(entry.oldMemberPrices[0] || 0).toLocaleString('id-ID')} → {(entry.newMemberPrices[0] || 0).toLocaleString('id-ID')}
                                  {entry.oldBasePrice !== entry.newBasePrice && ` • Modal ${entry.oldBasePrice.toLocaleString('id-ID')} → ${entry.newBasePrice.toLocaleString('id-ID')}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                   </div>
                   <button type="submit" className="w-full py-6 bg-blue-700 text-white font-bold text-xl rounded-3xl shadow-2xl shadow-blue-500/30 hover:bg-blue-800 transition-all uppercase tracking-tight active:scale-95">{editingId ? 'Update' : 'Simpan'} Master Barang</button>
                </form>
              ) : (
                <form onSubmit={handleSubmitContact} className="space-y-6">
                   <div className="space-y-5">
                      <div><label className="text-[11px] font-bold text-slate-700 uppercase tracking-widest block mb-2">Nama Lengkap {contactTab === 'customer' ? 'Pelanggan' : 'Perusahaan'}</label><div className="relative"><UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-800" size={20}/><input required className="w-full pl-12 pr-4 py-4 bg-slate-50 border-slate-300 rounded-2xl focus:border-blue-700 bg-white outline-none font-bold text-slate-900 shadow-inner" placeholder="Masukkan nama..." value={newContact.name} onChange={e => setNewContact({...newContact, name: e.target.value})} /></div></div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div><label className="text-[11px] font-bold text-slate-700 uppercase tracking-widest block mb-2">Nomor Telepon</label><div className="relative"><Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-800" size={18}/><input required className="w-full pl-12 pr-4 py-4 bg-slate-50 border-slate-300 rounded-2xl focus:border-blue-700 bg-white outline-none font-bold text-slate-900 shadow-inner" placeholder="08xx..." value={newContact.phone} onChange={e => setNewContact({...newContact, phone: e.target.value})} /></div></div>
                        {contactTab === 'customer' && (
                          <div><label className="text-[11px] font-bold text-blue-700 uppercase tracking-widest block mb-2">Member Level</label><div className="relative"><Award className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-800" size={18}/><select className="w-full pl-12 pr-4 py-4 bg-blue-50 border-blue-400 rounded-2xl focus:border-blue-700 bg-white outline-none font-bold text-blue-800 shadow-inner appearance-none cursor-pointer" value={newContact.level} onChange={e => setNewContact({...newContact, level: parseInt(e.target.value)})}><option value={1}>Level 1 (Retail)</option><option value={2}>Level 2 (Member)</option><option value={3}>Level 3 (Grosir)</option><option value={4}>Level 4 (Distributor)</option></select></div></div>
                        )}
                      </div>
                      {contactTab === 'customer' && (
                        <div><label className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest block mb-2">Limit Piutang (Kredit)</label><div className="relative"><CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-800" size={18}/><input type="number" className="w-full pl-12 pr-4 py-4 bg-emerald-50 border-emerald-400 rounded-2xl focus:border-emerald-600 bg-white outline-none font-bold text-emerald-800 shadow-inner" value={newContact.creditLimit} onChange={e => setNewContact({...newContact, creditLimit: parseInt(e.target.value) || 0})} /></div></div>
                      )}
                      <div><label className="text-[11px] font-bold text-slate-700 uppercase tracking-widest block mb-2">Alamat Pengiriman</label><textarea required rows={3} className="w-full p-4 bg-slate-50 border-slate-300 rounded-2xl focus:border-blue-700 bg-white outline-none font-bold text-slate-900 shadow-inner resize-none" placeholder="Jl. Alamat Lengkap..." value={newContact.address} onChange={e => setNewContact({...newContact, address: e.target.value})} /></div>
                   </div>
                   <div className="pt-6"><button type="submit" className={`w-full py-6 text-white font-bold text-xl rounded-3xl shadow-2xl transition-all uppercase tracking-tight active:scale-95 ${contactTab === 'customer' ? 'bg-blue-700 hover:bg-blue-800 shadow-blue-500/30' : 'bg-purple-700 hover:bg-purple-800 shadow-purple-500/30'}`}>{editingId ? 'Update' : 'Simpan'} {contactTab === 'customer' ? 'Pelanggan' : 'Supplier'}</button></div>
                </form>
              )}
           </div>
        </div>
      )}

      {/* Price Manager Modal */}
      {isPriceManagerOpen && type === 'items' && onUpdateItemsBulk && (
        <PriceManager
          items={items}
          priceHistory={priceHistory}
          onUpdateItemsBulk={onUpdateItemsBulk}
          onClose={() => setIsPriceManagerOpen(false)}
        />
      )}

      {payingCustomer && onReceiveCustomerPayment && (
        <CustomerPaymentModal
          customer={customers.find(c => c.id === payingCustomer.id) || payingCustomer}
          onSubmit={onReceiveCustomerPayment}
          onClose={() => setPayingCustomer(null)}
        />
      )}
    </div>
  );
};

export default MasterData;
