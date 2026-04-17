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
  Wand2
} from 'lucide-react';
import { Item, Customer, Supplier, BundleComponent } from '../types';
import { hasCloudConfig } from '../services/syncService';

interface MasterDataProps {
  type: 'items' | 'contacts' | 'warehouses';
  items?: Item[];
  customers?: Customer[];
  suppliers?: Supplier[];
  onAddItem?: (item: Item) => void;
  onAddItemsBulk?: (items: Item[]) => void;
  onUpdateItem?: (item: Item) => void;
  onUpdateItemsBulk?: (updatedList: Item[]) => void;
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
}

const MasterData: React.FC<MasterDataProps> = ({ 
  type, items = [], customers = [], suppliers = [], 
  onAddItem, onAddItemsBulk, onUpdateItem, onUpdateItemsBulk, onAddCustomer, onUpdateCustomer, onAddSupplier, onUpdateSupplier,
  onDeleteItem, onDeleteCustomer, onDeleteSupplier, onManualPush
}) => {
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

    const itemData: any = {
      ...newItem,
      memberPrices: [newItem.priceL1, newItem.priceL2, newItem.priceL3, newItem.priceL4],
      warehouseId: 'W1',
      imageUrl: newItem.imageUrl || 'https://images.unsplash.com/photo-1583258292688-d0213dc5a3a8?q=80&w=300&auto=format&fit=crop',
      units: [{ name: 'Pcs', conversion: 1, price: newItem.priceL1 }]
    };

    if (editingId && onUpdateItem) {
      onUpdateItem({ id: editingId, ...itemData });
    } else if (onAddItem) {
      onAddItem({ id: Math.random().toString(36).substr(2, 9), ...itemData });
    }
    setIsModalOpen(false);
    resetItemForm();
  };

  const handleSubmitContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (contactTab === 'customer') {
      if (editingId && onUpdateCustomer) {
        const existing = customers.find(c => c.id === editingId);
        onUpdateCustomer({ id: editingId, ...newContact, currentDebt: existing?.currentDebt || 0 });
      } else if (onAddCustomer) {
        onAddCustomer({ id: Math.random().toString(36).substr(2, 9), ...newContact, currentDebt: 0 });
      }
    } else if (contactTab === 'supplier') {
      if (editingId && onUpdateSupplier) {
        onUpdateSupplier({ id: editingId, name: newContact.name, phone: newContact.phone, address: newContact.address });
      } else if (onAddSupplier) {
        onAddSupplier({ id: Math.random().toString(36).substr(2, 9), name: newContact.name, phone: newContact.phone, address: newContact.address });
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
    const headers = "Kode,Nama,Kategori,Merk,Harga Dasar,Harga Level 1,Harga Level 2,Harga Level 3,Harga Level 4,Barcode,URL Gambar,Stok\n";
    const rows = items.map(i => [
      i.code, i.name, i.category, i.brand, i.basePrice, i.memberPrices[0], i.memberPrices[1], i.memberPrices[2], i.memberPrices[3], i.barcode, i.imageUrl, i.stock
    ].join(",")).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "master_barang_ipos5.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadTemplate = () => {
    const headers = "Kode,Nama,Kategori,Merk,Harga Dasar,Harga Level 1,Harga Level 2,Harga Level 3,Harga Level 4,Barcode,URL Gambar,Stok\n";
    const example = "BRG-EXAMPLE,Contoh Produk,Sembako,Merk Contoh,1000,1200,1150,1100,1050,1234567890,https://example.com/img.jpg,100";
    const blob = new Blob([headers + example], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "template_import_barang.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n");
      const newItems: Item[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const columns = line.split(",");
        if (columns.length < 5) continue;

        const code = columns[0];
        const name = columns[1];
        const category = columns[2];
        const brand = columns[3];
        const basePrice = parseInt(columns[4]) || 0;
        const p1 = parseInt(columns[5]) || 0;
        const p2 = parseInt(columns[6]) || 0;
        const p3 = parseInt(columns[7]) || 0;
        const p4 = parseInt(columns[8]) || 0;
        const barcode = columns[9] || '';
        const img = columns[10] || 'https://images.unsplash.com/photo-1583258292688-d0213dc5a3a8?q=80&w=300&auto=format&fit=crop';
        const stock = parseInt(columns[11]) || 0;

        newItems.push({
          id: Math.random().toString(36).substr(2, 9),
          code, barcode, name, category, brand, basePrice,
          memberPrices: [p1, p2, p3, p4],
          stock: stock, warehouseId: 'W1', imageUrl: img,
          units: [{ name: 'Pcs', conversion: 1, price: p1 }]
        });
      }

      if (newItems.length > 0 && onAddItemsBulk) {
        onAddItemsBulk(newItems);
        alert(`Berhasil mengimpor ${newItems.length} barang.`);
      }
      if (e.target) e.target.value = '';
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
    if (selectedItemIds.length === 0 || !onUpdateItemsBulk) return;
    
    const updatedList = items.filter(item => selectedItemIds.includes(item.id)).map(item => ({
      ...item,
      category: bulkEditForm.category || item.category,
      brand: bulkEditForm.brand || item.brand,
      stock: item.stock + (bulkEditForm.stockChange || 0)
    }));

    onUpdateItemsBulk(updatedList);
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
          <button onClick={handleImportClick} className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-700 hover:bg-emerald-100 transition-all shadow-sm active:scale-95" title="Import Excel">
            <Upload size={18}/><span className="hidden lg:block text-[11px] font-bold uppercase">Import</span>
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-300 rounded-xl text-blue-700 hover:bg-blue-100 transition-all shadow-sm active:scale-95" title="Export Excel">
            <FileSpreadsheet size={18}/><span className="hidden lg:block text-[11px] font-bold uppercase">Export</span>
          </button>
          {selectedItemIds.length > 0 && (
            <button 
              onClick={() => setIsBulkEditModalOpen(true)}
              className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-300 rounded-xl text-orange-700 hover:bg-orange-100 transition-all shadow-sm active:scale-95 animate-in slide-in-from-left"
            >
              <Wand2 size={18}/><span className="text-[11px] font-bold uppercase">Edit Massal ({selectedItemIds.length})</span>
            </button>
          )}
        </div>
        <button onClick={handleOpenAddModal} className="flex items-center gap-2 px-6 py-3.5 bg-blue-700 text-white rounded-2xl font-bold hover:bg-blue-800 shadow-xl transition-all active:scale-95 uppercase tracking-tight">
          <Plus size={20} /> <span className="hidden sm:inline">TAMBAH BARANG BARU</span><span className="sm:hidden">TAMBAH BARANG</span>
        </button>
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
                        <img src={item.imageUrl} className="w-14 h-14 rounded-2xl object-cover border border-slate-300 shadow-sm" />
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
                     <div className="font-bold text-slate-900 text-base tracking-tighter">Rp {item.memberPrices[0]?.toLocaleString()}</div>
                     <div className="text-[10px] font-bold text-slate-500 uppercase">Beli: Rp {item.basePrice.toLocaleString()}</div>
                  </td>
                  <td className="px-8 py-5 text-right border-r border-slate-100">
                    <div className={`font-bold text-xl tracking-tighter ${item.stock < 10 ? 'text-red-600' : 'text-emerald-700'}`}>{item.stock}</div>
                    <div className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full inline-block ${item.stock < 10 ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>{item.stock < 10 ? 'KRITIS' : 'AMAN'}</div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => handleEditItemClick(item)} className="p-3 text-slate-600 hover:text-blue-700 hover:bg-blue-100 rounded-xl transition-all shadow-sm border border-slate-200 active:scale-90"><Edit2 size={18} /></button>
                      <button onClick={() => onDeleteItem && onDeleteItem(item.id)} className="p-3 text-slate-600 hover:text-red-700 hover:bg-red-100 rounded-xl transition-all shadow-sm border border-slate-200 active:scale-90"><Trash2 size={18} /></button>
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
                 <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Tambah/Kurang Stok (Misal: 10 atau -5)</label>
                    <input type="number" className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-orange-500" value={bulkEditForm.stockChange} onChange={e => setBulkEditForm({...bulkEditForm, stockChange: parseInt(e.target.value) || 0})} />
                 </div>
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
        <button onClick={handleOpenAddModal} className="flex items-center gap-2 px-8 py-3.5 bg-slate-900 text-white rounded-2xl font-bold hover:bg-black shadow-xl active:scale-95 transition-all uppercase text-sm tracking-tight"><Plus size={20} /> Tambah {contactTab === 'customer' ? 'Pelanggan' : 'Supplier'}</button>
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
                              <div className="font-bold text-slate-900 text-base tracking-tighter">Rp {(contact as Customer).currentDebt.toLocaleString()}</div>
                              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Limit: Rp {(contact as Customer).creditLimit.toLocaleString()}</div>
                           </div>
                        </td>
                     )}
                     <td className="px-8 py-5 text-center">
                        <div className="flex justify-center gap-2">
                           <button onClick={() => handleEditContactClick(contact)} className="p-3 text-slate-700 hover:text-blue-700 hover:bg-blue-100 border border-slate-200 rounded-xl transition-all active:scale-90"><Edit2 size={18}/></button>
                           <button onClick={() => contactTab === 'customer' ? (onDeleteCustomer && onDeleteCustomer(contact.id)) : (onDeleteSupplier && onDeleteSupplier(contact.id))} className="p-3 text-slate-700 hover:text-red-700 hover:bg-red-100 border border-slate-200 rounded-xl transition-all active:scale-90"><Trash2 size={18}/></button>
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
                           <label className="text-[11px] font-bold text-blue-700 uppercase tracking-widest block mb-2">Stok Saat Ini</label>
                           <input type="number" className="w-full bg-white border border-slate-300 rounded-2xl p-4 font-bold text-slate-900 outline-none focus:border-blue-500" value={newItem.stock} onChange={e => setNewItem({...newItem, stock: parseInt(e.target.value) || 0})} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map(l => (
                          <div key={l}><label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">Harga Level {l}</label><input type="number" className="w-full bg-white border border-slate-300 rounded-xl p-3 font-bold text-xs outline-none focus:border-blue-600 shadow-inner" value={newItem[`priceL${l}` as keyof typeof newItem] as number} onChange={e => setNewItem({...newItem, [`priceL${l}`]: parseInt(e.target.value) || 0})} /></div>
                        ))}
                      </div>
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
    </div>
  );
};

export default MasterData;
