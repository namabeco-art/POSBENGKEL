import React, { useState, useMemo } from 'react';
import { 
  ShoppingCart, Plus, Search, FileText, ArrowDownCircle, 
  History, CreditCard, X, Trash2, CheckCircle, Package,
  Zap, ArrowRight, Layers, Users, Eye, AlertCircle, Check,
  Printer, Download, Calendar, Tag, Bell, DollarSign, Clock, User as UserIcon, Wallet, Notebook, ChevronRight, ShoppingBag, Minus, AlertTriangle, Edit,
  Building2,
  Truck
} from 'lucide-react';
import { PurchaseOrder, Supplier, Item, User } from '../types';
import { printPurchaseOrder } from '../services/printService';

interface PurchasingProps {
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
  items: Item[];
  currentUser: User;
  onAddPO: (po: PurchaseOrder) => void;
  onReceivePO: (poId: string, updatedItems: { itemId: string, receivedQty: number }[]) => void;
  onPayPO: (poId: string, amount?: number, note?: string, method?: string) => void;
}

const Purchasing: React.FC<PurchasingProps> = ({ purchaseOrders, suppliers, items, currentUser, onAddPO, onReceivePO, onPayPO }) => {
  const [activeSubTab, setActiveSubTab] = useState('po');
  const [isNewPOModalOpen, setIsNewPOModalOpen] = useState(false);
  const [selectedPOToReceive, setSelectedPOToReceive] = useState<PurchaseOrder | null>(null);
  const [selectedPOToView, setSelectedPOToView] = useState<PurchaseOrder | null>(null);
  const [selectedPOToPay, setSelectedPOToPay] = useState<PurchaseOrder | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [itemSearchTerm, setItemSearchTerm] = useState('');

  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [poDraftItems, setPoDraftItems] = useState<{ item: Item; qty: number; cost: number }[]>([]);
  const [editingDraftIndex, setEditingDraftIndex] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState({ qty: 0, cost: 0 });

  const [termOfPayment, setTermOfPayment] = useState<number>(0);
  const [discountPercent, setDiscountPercent] = useState<number>(0);

  // States for Payment Details
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Transfer Bank');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);

  const [receiptUpdates, setReceiptUpdates] = useState<{ itemId: string, receivedQty: number }[]>([]);

  const tabs = [
    { id: 'po', label: '1. Draft PO', icon: <FileText size={16} /> },
    { id: 'receive', label: '2. Terima Stok', icon: <ArrowDownCircle size={16} /> },
    { id: 'history', label: '3. Riwayat', icon: <History size={16} /> },
  ];

  const handleAddItemToPO = (item: Item) => {
    const existing = poDraftItems.find(p => p.item.id === item.id);
    if (existing) {
      setPoDraftItems(poDraftItems.map(p => p.item.id === item.id ? { ...p, qty: p.qty + 1 } : p));
    } else {
      setPoDraftItems([{ item, qty: 1, cost: item.basePrice }, ...poDraftItems]);
    }
  };

  const handleOpenEditDraft = (index: number) => {
    const target = poDraftItems[index];
    setEditingDraftIndex(index);
    setEditFormData({ qty: target.qty, cost: target.cost });
  };

  const handleSaveEditDraft = () => {
    if (editingDraftIndex === null) return;
    const newList = [...poDraftItems];
    newList[editingDraftIndex] = {
      ...newList[editingDraftIndex],
      qty: editFormData.qty,
      cost: editFormData.cost
    };
    setPoDraftItems(newList);
    setEditingDraftIndex(null);
  };

  const handleSavePO = () => {
    if (!selectedSupplier || poDraftItems.length === 0) return;

    const subtotal = poDraftItems.reduce((s, p) => s + (p.qty * p.cost), 0);
    const total = subtotal * (1 - (discountPercent / 100));
    
    const today = new Date();
    const due = new Date(today);
    due.setDate(today.getDate() + termOfPayment);

    const newPO: PurchaseOrder = {
      id: `PO-${Date.now().toString().slice(-6)}`,
      date: today.toLocaleDateString('id-ID'),
      dueDate: due.toLocaleDateString('id-ID'),
      termOfPayment,
      discount: discountPercent,
      supplierId: selectedSupplier.id,
      supplierName: selectedSupplier.name,
      items: poDraftItems.map(p => ({ 
        itemId: p.item.id, 
        name: p.item.name, 
        orderedQty: p.qty, 
        receivedQty: 0, 
        cost: p.cost 
      })),
      subtotal,
      total,
      status: 'PENDING',
      isPaid: false,
      paidAmount: 0,
      paymentNotes: []
    };

    onAddPO(newPO);
    setIsNewPOModalOpen(false);
    resetDraftForm();
    setActiveSubTab('receive');
  };

  const resetDraftForm = () => {
    setSelectedSupplier(null);
    setPoDraftItems([]);
    setItemSearchTerm('');
    setTermOfPayment(0);
    setDiscountPercent(0);
  };

  const handleFinalPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPOToPay) {
      onPayPO(selectedPOToPay.id, paymentAmount || (selectedPOToPay.total - (selectedPOToPay.paidAmount || 0)), paymentNotes, paymentMethod);
      setSelectedPOToPay(null);
      setPaymentNotes(''); // Reset notes
      setPaymentAmount(0);
      alert(`Pembayaran Faktur ${selectedPOToPay.id} Berhasil.`);
    }
  };

  const openReceiveModal = (po: PurchaseOrder) => {
    setSelectedPOToReceive(po);
    setReceiptUpdates(po.items.map(i => ({ itemId: i.itemId, receivedQty: i.orderedQty })));
  };

  const handlePrintPO = () => {
    if (selectedPOToView) {
      printPurchaseOrder(selectedPOToView);
    }
  };

  const filteredPOs = useMemo(() => {
    return purchaseOrders.filter(po => {
      if (activeSubTab === 'po') return po.status === 'PENDING';
      if (activeSubTab === 'receive') return po.status === 'PENDING';
      if (activeSubTab === 'history') return po.status === 'RECEIVED';
      return true;
    }).filter(po => {
      const term = searchTerm.toLowerCase();
      return po.id.toLowerCase().includes(term) || po.supplierName.toLowerCase().includes(term);
    });
  }, [purchaseOrders, activeSubTab, searchTerm]);

  const filteredItems = useMemo(() => items.filter(item => 
    item.name.toLowerCase().includes(itemSearchTerm.toLowerCase()) || 
    item.barcode.includes(itemSearchTerm) ||
    item.code.toLowerCase().includes(itemSearchTerm.toLowerCase())
  ), [items, itemSearchTerm]);

  const subtotalDraft = poDraftItems.reduce((s, p) => s + (p.qty * p.cost), 0);
  const totalDraft = subtotalDraft * (1 - (discountPercent / 100));

  const getDueDateStatus = (dueDateStr: string, isPaid: boolean) => {
    if (isPaid) return { label: 'LUNAS', color: 'bg-emerald-100 text-emerald-900 border-emerald-400 font-black' };
    const parts = dueDateStr.split('/');
    const dueDate = new Date(+parts[2], +parts[1] - 1, +parts[0]);
    const today = new Date();
    today.setHours(0,0,0,0);
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: `LEWAT ${Math.abs(diffDays)} HARI`, color: 'bg-red-100 text-red-900 border-red-500 animate-pulse font-black' };
    if (diffDays === 0) return { label: `TEMPO HARI INI`, color: 'bg-orange-100 text-orange-900 border-orange-500 font-black' };
    return { label: `H-${diffDays}: ${dueDateStr}`, color: 'bg-blue-50 text-blue-900 border-blue-400 font-black' };
  };

  return (
    <div className="space-y-4 pb-20 animate-in fade-in duration-500">
      <div className="flex bg-white/80 p-1.5 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto scrollbar-hide">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-2.5 font-bold text-[10px] md:text-[11px] uppercase tracking-wide transition-all rounded-xl min-w-[140px] whitespace-nowrap active:scale-95 ${
              activeSubTab === tab.id 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder={`Cari nomor faktur atau supplier...`}
            className="w-full pl-11 pr-4 py-3.5 bg-white border-2 border-slate-300 rounded-2xl text-xs md:text-sm font-semibold focus:ring-4 focus:ring-blue-100 outline-none shadow-sm transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        {activeSubTab === 'po' && (
          <button 
            onClick={() => setIsNewPOModalOpen(true)}
            className="w-full md:w-auto flex items-center justify-center gap-2.5 bg-blue-700 text-white px-8 py-3.5 md:py-4 rounded-2xl font-bold uppercase text-[10px] tracking-widest hover:bg-blue-800 shadow-lg active:scale-95 transition-all"
          >
            <Plus size={16} /> <span className="hidden sm:inline">BUAT PO BARU</span><span className="sm:hidden">PO BARU</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl md:rounded-[2rem] border border-slate-200 shadow-md overflow-hidden">
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left">
                <th className="px-5 py-4 font-black text-slate-400 uppercase tracking-widest">Faktur PO</th>
                <th className="hidden lg:table-cell px-5 py-4 font-black text-slate-400 uppercase tracking-widest">Tgl</th>
                <th className="px-5 py-4 font-black text-slate-400 uppercase tracking-widest">Supplier</th>
                <th className="px-5 py-4 font-black text-slate-400 uppercase tracking-widest text-right">Total</th>
                <th className="px-5 py-4 font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                <th className="px-5 py-4 font-black text-slate-400 uppercase tracking-widest text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPOs.map(po => {
                const dueStatus = getDueDateStatus(po.dueDate, po.isPaid);
                return (
                  <tr key={po.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4">
                       <div className="font-black text-blue-700">{po.id}</div>
                       <div className="lg:hidden text-[8px] font-bold text-slate-400 uppercase">{po.date}</div>
                    </td>
                    <td className="hidden lg:table-cell px-5 py-4 text-slate-950 font-black">{po.date}</td>
                    <td className="px-5 py-4">
                       <div className="font-black text-slate-700 uppercase truncate max-w-[80px] md:max-w-none">{po.supplierName}</div>
                       <div className="md:hidden mt-0.5"><span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded border ${dueStatus.color}`}>{dueStatus.label}</span></div>
                    </td>
                    <td className="px-5 py-4 text-right font-black text-slate-900 text-[10px] md:text-sm">
                      <div>Rp {po.total.toLocaleString()}</div>
                      {!po.isPaid && (po.paidAmount || 0) > 0 && <div className="text-[8px] text-emerald-600">Paid Rp {(po.paidAmount || 0).toLocaleString()}</div>}
                    </td>
                    <td className="hidden md:table-cell px-5 py-4 text-center">
                      <span className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase border tracking-tight ${dueStatus.color}`}>
                         {dueStatus.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex justify-center gap-1.5 md:gap-2">
                        {po.status === 'PENDING' ? (
                          <button 
                            onClick={() => openReceiveModal(po)}
                            className="p-2.5 md:px-4 md:py-2.5 bg-slate-900 text-white rounded-xl hover:bg-emerald-600 transition-all font-black text-[9px] uppercase tracking-tighter active:scale-90"
                          >
                            <ArrowDownCircle size={18} className="md:hidden"/><span className="hidden md:inline">TERIMA</span>
                          </button>
                        ) : (
                          <>
                            <button onClick={() => setSelectedPOToView(po)} className="p-3 md:px-3 md:py-2 bg-white border-2 border-blue-200 text-blue-600 rounded-xl active:scale-90"><Eye size={18}/></button>
                            {!po.isPaid && <button onClick={() => { setSelectedPOToPay(po); setPaymentAmount(po.total - (po.paidAmount || 0)); }} className="p-3 md:px-3 md:py-2 bg-emerald-50 text-emerald-700 border-2 border-emerald-200 rounded-xl active:scale-90"><DollarSign size={18}/></button>}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isNewPOModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[250] flex items-center justify-center p-0 md:p-4 lg:p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-6xl h-full md:h-[90vh] md:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden md:border-4 border-slate-100">
             {/* Header - Fixed */}
             <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0 relative z-[260]">
                <div className="flex items-center gap-3">
                   <div className="p-2 md:p-2.5 bg-blue-600 text-white rounded-xl shadow-md"><Plus size={18}/></div>
                   <h3 className="text-sm md:text-xl font-black text-slate-900 uppercase leading-none">Input Purchase Order</h3>
                </div>
                <button 
                  onClick={() => setIsNewPOModalOpen(false)} 
                  className="p-4 md:p-3 bg-slate-100 rounded-2xl hover:bg-red-500 hover:text-white transition-all active:scale-90 shadow-sm border border-slate-200"
                >
                  <X size={24} className="md:w-5 md:h-5"/>
                </button>
             </div>

             {/* Content Area - Split/Combined with Scrolling Logic */}
             <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
                
                {/* Left Side: Search & Selection */}
                <div className="w-full lg:w-[35%] flex flex-col border-b lg:border-b-0 lg:border-r border-slate-100 bg-slate-50/20 overflow-y-auto scrollbar-hide shrink-0 lg:shrink">
                   <div className="p-4 md:p-5 space-y-5 md:space-y-6">
                      <div className="space-y-1.5">
                         <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-1">1. Pilih Supplier</label>
                         <select 
                           className="w-full p-4 md:p-4 bg-white border-2 border-slate-200 rounded-2xl font-black text-[11px] md:text-xs text-slate-800 outline-none focus:border-blue-500 appearance-none shadow-sm"
                           value={selectedSupplier?.id || ''}
                           onChange={(e) => setSelectedSupplier(suppliers.find(s => s.id === e.target.value) || null)}
                         >
                            <option value="">-- Pilih Supplier --</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                         </select>
                      </div>

                      <div className="space-y-3">
                         <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-1">2. Cari Barang</label>
                         <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                            <input 
                              type="text" 
                              placeholder="Ketik Nama / Scan..."
                              className="w-full pl-11 pr-4 py-4 md:p-4 bg-white border-2 border-slate-200 rounded-2xl font-black text-[11px] md:text-xs focus:border-blue-600 outline-none"
                              value={itemSearchTerm}
                              onChange={(e) => setItemSearchTerm(e.target.value)}
                            />
                         </div>
                         
                         <div className="grid grid-cols-1 gap-2">
                            {filteredItems.slice(0, 8).map(item => {
                              const isOutOfStock = item.stock <= 0;
                              const isLowStock = item.stock < 10 && item.stock > 0;
                              
                              return (
                                <button 
                                  key={item.id}
                                  onClick={() => handleAddItemToPO(item)}
                                  className={`flex items-center gap-3 p-3 md:p-3 bg-white border rounded-xl hover:border-blue-500 transition-all text-left shadow-sm group active:scale-[0.98] ${
                                    isOutOfStock ? 'border-red-200 bg-red-50/30' : 'border-slate-200'
                                  }`}
                                >
                                  <div className="relative">
                                    <img src={item.imageUrl} className="w-10 h-10 md:w-10 md:h-10 rounded-lg object-cover" />
                                    {isOutOfStock && <div className="absolute -top-1 -left-1 bg-red-600 text-white rounded-full p-0.5 shadow-lg border border-white"><AlertTriangle size={8}/></div>}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 mb-0.5">
                                        <div className={`font-black uppercase text-[9px] md:text-[10px] truncate leading-tight group-hover:text-blue-700 ${isOutOfStock ? 'text-red-700' : 'text-slate-800'}`}>
                                          {item.name} <span className="text-slate-400 font-bold ml-1">[{item.brand}]</span>
                                        </div>
                                        {isOutOfStock && (
                                          <span className="shrink-0 text-[6px] md:text-[7px] font-black bg-red-600 text-white px-1 py-0.5 rounded shadow-sm animate-pulse">HABIS</span>
                                        )}
                                        {isLowStock && (
                                          <span className="shrink-0 text-[6px] md:text-[7px] font-black bg-orange-500 text-white px-1 py-0.5 rounded shadow-sm">KRITIS</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <div className="text-[8px] md:text-[9px] font-bold text-slate-400">Rp {item.basePrice.toLocaleString()}</div>
                                        <div className={`text-[8px] md:text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${
                                          isOutOfStock ? 'bg-red-100 text-red-700 border-red-200' : 
                                          isLowStock ? 'bg-orange-100 text-orange-700 border-orange-200' : 
                                          'bg-blue-50 text-blue-600 border-blue-100'
                                        }`}>
                                          STOK: {item.stock}
                                        </div>
                                      </div>
                                  </div>
                                  <div className={`p-2 md:p-2 rounded-lg transition-colors ${
                                    isOutOfStock ? 'bg-red-600 text-white shadow-red-200 shadow-lg' : 'bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white'
                                  }`}>
                                      <Plus size={16} />
                                  </div>
                                </button>
                              );
                            })}
                         </div>
                      </div>
                   </div>
                </div>

                {/* Right Side: Draft Basket & Summary */}
                <div className="flex-1 flex flex-col bg-white overflow-hidden relative min-h-0">
                   {/* Items List Container */}
                   <div className="flex-1 overflow-y-auto scrollbar-hide p-4 md:p-5">
                      <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-2">
                         <h4 className="font-black text-slate-800 uppercase text-[10px] md:text-sm tracking-tight">Barang dalam Keranjang</h4>
                         <span className="text-[8px] md:text-[9px] font-black bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg uppercase">{poDraftItems.length} SKU</span>
                      </div>

                      {poDraftItems.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center text-slate-100">
                           <ShoppingBag size={56} className="opacity-10 mb-3" />
                           <p className="font-black text-[10px] md:text-[10px] uppercase tracking-widest opacity-20 text-center">Keranjang PO Belum Terisi</p>
                        </div>
                      ) : (
                        <div className="space-y-3 pb-4">
                           {poDraftItems.map((p, idx) => (
                             <div key={idx} className="p-4 md:p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 group shadow-sm">
                                <div className="flex-1 flex items-center gap-3 md:gap-4">
                                   <img src={p.item.imageUrl} className="w-12 h-12 md:w-12 md:h-12 rounded-xl object-cover border border-slate-200" />
                                   <div className="min-w-0 flex-1">
                                      <div className="font-black text-slate-800 text-[10px] md:text-[11px] uppercase truncate">
                                        {p.item.name} <span className="text-slate-400 font-bold ml-1">({p.item.brand})</span>
                                      </div>
                                      <div className="flex items-center gap-3 md:gap-4 mt-1.5 md:mt-2">
                                         <div className="flex flex-col">
                                            <span className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase mb-1">QTY</span>
                                            <div className="flex items-center bg-white border border-slate-300 rounded-lg overflow-hidden h-9 md:h-9">
                                              <button 
                                                onClick={() => setPoDraftItems(poDraftItems.map((item, i) => i === idx ? { ...item, qty: Math.max(1, item.qty - 1) } : item))}
                                                className="px-3 text-slate-400 hover:text-red-500 transition-colors active:bg-slate-50"
                                              ><Minus size={14}/></button>
                                              <input 
                                                type="number" 
                                                className="w-10 md:w-12 text-center font-black text-[11px] md:text-xs text-blue-700 outline-none"
                                                value={p.qty}
                                                onChange={(e) => setPoDraftItems(poDraftItems.map((item, i) => i === idx ? { ...item, qty: Math.max(1, parseInt(e.target.value) || 0) } : item))}
                                              />
                                              <button 
                                                onClick={() => setPoDraftItems(poDraftItems.map((item, i) => i === idx ? { ...item, qty: item.qty + 1 } : item))}
                                                className="px-3 text-slate-400 hover:text-blue-600 transition-colors active:bg-slate-50"
                                              ><Plus size={14}/></button>
                                            </div>
                                         </div>
                                         <div className="flex flex-col">
                                            <span className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase mb-1">HARGA</span>
                                            <input 
                                              type="number" 
                                              className="w-24 md:w-24 h-9 md:h-9 p-2 bg-white border border-slate-300 rounded-lg font-black text-[11px] md:text-xs text-slate-800 text-right focus:border-blue-500 outline-none"
                                              value={p.cost}
                                              onChange={(e) => setPoDraftItems(poDraftItems.map((item, i) => i === idx ? { ...item, cost: parseInt(e.target.value) || 0 } : item))}
                                            />
                                         </div>
                                      </div>
                                   </div>
                                </div>
                                <div className="flex justify-between items-center md:flex-col md:items-end pt-3 md:pt-0 border-t md:border-0 border-slate-200">
                                   <div className="font-black text-slate-900 text-sm md:text-lg tracking-tighter leading-none">Rp {(p.qty * p.cost).toLocaleString()}</div>
                                   <div className="flex gap-1">
                                      <button 
                                          onClick={() => handleOpenEditDraft(idx)} 
                                          className="p-3 md:p-2 text-slate-300 hover:text-blue-600 transition-all active:scale-90"
                                          title="Edit Item"
                                      >
                                          <Edit size={18} className="md:w-4 md:h-4"/>
                                      </button>
                                      <button 
                                          onClick={() => setPoDraftItems(poDraftItems.filter((_, i) => i !== idx))} 
                                          className="p-3 md:p-2 text-slate-300 hover:text-red-600 transition-all active:scale-90"
                                          title="Hapus"
                                      >
                                          <Trash2 size={18} className="md:w-4 md:h-4"/>
                                      </button>
                                   </div>
                                </div>
                             </div>
                           ))}
                        </div>
                      )}
                   </div>

                   {/* Footer Actions - PERSISTENT ON MOBILE */}
                   <div className="p-3 md:p-6 lg:p-8 bg-slate-900 border-t border-slate-700 space-y-3 md:space-y-6 shrink-0 relative z-20 shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.3)]">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                         <div className="bg-white/10 p-2 md:p-4 rounded-xl md:rounded-2xl border border-white/10 shadow-sm">
                            <label className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Termin (HARI)</label>
                            <input type="number" min="0" className="w-full bg-white/20 rounded-lg px-2 py-1 font-black text-white outline-none text-xs md:text-base placeholder:text-white/40 focus:bg-white/30 transition-all" placeholder="0" value={termOfPayment || ''} onChange={e => setTermOfPayment(parseInt(e.target.value) || 0)}/>
                         </div>
                         <div className="bg-white/10 p-2 md:p-4 rounded-xl md:rounded-2xl border border-emerald-500/20 shadow-sm">
                            <label className="text-[7px] md:text-[8px] font-black text-emerald-400 uppercase tracking-widest block mb-1">Diskon (%)</label>
                            <input type="number" min="0" max="100" className="w-full bg-white/20 rounded-lg px-2 py-1 font-black text-emerald-100 outline-none text-xs md:text-base placeholder:text-emerald-300/40 focus:bg-white/30 transition-all" placeholder="0" value={discountPercent || ''} onChange={e => setDiscountPercent(Math.min(100, parseInt(e.target.value) || 0))}/>
                         </div>
                         <div className="hidden md:block bg-white/10 p-4 rounded-2xl border border-white/10">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Subtotal</label>
                            <div className="font-black text-slate-300 text-sm">Rp {subtotalDraft.toLocaleString()}</div>
                         </div>
                         <div className="col-span-2 md:col-span-1 bg-blue-700 p-2 md:p-4 rounded-xl md:rounded-2xl shadow-xl shadow-blue-500/20 border-b-4 border-blue-900">
                            <label className="text-[7px] md:text-[8px] font-black text-blue-200 uppercase tracking-widest block mb-0.5 md:mb-1">Total Netto</label>
                            <div className="font-black text-white text-sm md:text-xl tracking-tighter leading-none">Rp {totalDraft.toLocaleString()}</div>
                         </div>
                      </div>

                      <div className="flex flex-row justify-between items-center gap-3">
                         <div className="hidden sm:flex items-center gap-2 text-slate-400 font-black text-[9px] md:text-[9px] uppercase">
                            <Calendar size={14} className="md:w-3.5 md:h-3.5"/> {
                              (() => {
                                const d = new Date();
                                d.setDate(d.getDate() + termOfPayment);
                                return `Tempo: ${d.toLocaleDateString('id-ID')}`;
                              })()
                            }
                         </div>
                         <div className="flex gap-2 w-full md:w-auto">
                            <button onClick={resetDraftForm} className="flex-1 md:flex-none px-4 md:px-6 py-3 md:py-4 bg-white/5 text-slate-400 rounded-xl font-black text-[8px] md:text-[10px] uppercase hover:bg-red-500/20 hover:text-red-400 transition-all active:scale-95 border border-white/10">RESET</button>
                            <button disabled={!selectedSupplier || poDraftItems.length === 0} onClick={handleSavePO} className="flex-[2] md:flex-none px-6 md:px-10 py-3 md:py-4 bg-blue-600 text-white font-black text-[9px] md:text-[10px] rounded-xl shadow-xl hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 transition-all flex items-center justify-center gap-2 uppercase tracking-widest border-b-4 border-blue-800 active:scale-95">
                               <CheckCircle size={16} className="md:w-[18px] md:h-[18px]"/> SIMPAN PO
                            </button>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Modal Edit Draft Item */}
      {editingDraftIndex !== null && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[300] flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in duration-200 border-4 border-slate-100">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-black text-slate-900 uppercase">Edit Detail Item</h3>
                 <button onClick={() => setEditingDraftIndex(null)} className="p-2 hover:bg-slate-100 rounded-xl"><X/></button>
              </div>
              <div className="space-y-6">
                 <div className="bg-blue-50 p-4 rounded-2xl">
                    <div className="text-[10px] font-black text-blue-600 uppercase mb-1">Item Terpilih</div>
                    <div className="font-black text-slate-800 uppercase">{poDraftItems[editingDraftIndex].item.name}</div>
                 </div>
                 <div className="space-y-4">
                    <div>
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Kuantitas Pesanan</label>
                       <input 
                         type="number" 
                         className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-blue-700 outline-none focus:border-blue-600"
                         value={editFormData.qty}
                         onChange={e => setEditFormData({ ...editFormData, qty: parseInt(e.target.value) || 0 })}
                       />
                    </div>
                    <div>
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Harga Satuan (Beli)</label>
                       <input 
                         type="number" 
                         className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-slate-800 outline-none focus:border-blue-600"
                         value={editFormData.cost}
                         onChange={e => setEditFormData({ ...editFormData, cost: parseInt(e.target.value) || 0 })}
                       />
                    </div>
                 </div>
                 <button 
                   onClick={handleSaveEditDraft}
                   className="w-full py-5 bg-blue-600 text-white font-black rounded-2xl shadow-xl hover:bg-blue-700 border-b-4 border-blue-800 active:scale-95 uppercase tracking-widest"
                 >
                    Update Item PO
                 </button>
              </div>
           </div>
        </div>
      )}

      {selectedPOToPay && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[280] flex items-center justify-center p-4">
           <form onSubmit={handleFinalPayment} className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 md:p-10 shadow-2xl animate-in zoom-in duration-300 border-4 border-emerald-100 relative">
              <div className="flex justify-between items-center mb-8 relative z-[290]">
                 <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-lg"><Wallet size={24}/></div>
                    <div>
                       <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">PELUNASAN</h3>
                       <p className="text-slate-400 font-bold text-[9px] uppercase tracking-widest mt-1">{selectedPOToPay.id}</p>
                    </div>
                 </div>
                 <button 
                  type="button" 
                  onClick={() => setSelectedPOToPay(null)} 
                  className="p-4 bg-slate-50 rounded-2xl hover:bg-red-500 hover:text-white transition-all active:scale-90 border border-slate-200"
                 >
                   <X size={24}/>
                 </button>
              </div>

              <div className="space-y-6">
                 <div className="p-6 bg-emerald-50 border-2 border-emerald-200 rounded-[1.5rem] flex flex-col items-center">
                    <div className="text-emerald-800 font-black text-[10px] uppercase tracking-[0.2em] mb-2 text-center">Total Tagihan Dibayar</div>
                    <div className="text-3xl font-black text-emerald-900 tracking-tighter">Rp {(selectedPOToPay.total - (selectedPOToPay.paidAmount || 0)).toLocaleString()}</div>
                 </div>

                 {/* Focus Feature: Catatan Pelunasan */}
                 <div className="space-y-4">
                    <div>
                       <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Jumlah Dibayar</label>
                       <input 
                          type="number"
                          className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-xs text-slate-800 focus:border-emerald-600 outline-none shadow-inner"
                          value={paymentAmount}
                          onChange={e => setPaymentAmount(parseInt(e.target.value) || 0)}
                        />
                    </div>
                    <div>
                       <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Catatan Pelunasan</label>
                       <textarea 
                          rows={3} 
                          className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-xs text-slate-800 focus:border-emerald-600 outline-none resize-none shadow-inner"
                          placeholder="Masukkan keterangan pembayaran, nomor referensi bank, atau catatan tambahan..."
                          value={paymentNotes}
                          onChange={e => setPaymentNotes(e.target.value)}
                       />
                    </div>
                    <div>
                       <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Metode Pembayaran</label>
                       <select 
                          className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-xs text-slate-800 outline-none focus:border-emerald-600 appearance-none"
                          value={paymentMethod}
                          onChange={e => setPaymentMethod(e.target.value)}
                        >
                          <option value="Transfer Bank">Transfer Bank</option>
                          <option value="Tunai">Tunai / Cash</option>
                          <option value="Giro">Bilyet Giro</option>
                       </select>
                    </div>
                 </div>

                 <button type="submit" className="w-full py-5 bg-emerald-600 text-white font-black text-lg rounded-2xl shadow-xl hover:bg-emerald-700 transition-all border-b-8 border-emerald-800 active:scale-95 uppercase tracking-widest">KONFIRMASI LUNAS</button>
              </div>
           </form>
        </div>
      )}

      {selectedPOToReceive && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[270] flex items-center justify-center p-0 md:p-4">
          {/* Tambahkan max-h-[90vh] dan md:h-auto agar modal tetap terkendali tingginya */}
          <div className="bg-white w-full max-w-xl h-full md:h-auto md:max-h-[90vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border-4 border-slate-100 relative">
             <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0 relative z-[280]">
                <div>
                   <h3 className="text-base font-black text-slate-900 uppercase leading-none">Penerimaan Stok</h3>
                   <p className="text-slate-400 font-bold text-[8px] uppercase tracking-widest mt-1">{selectedPOToReceive.id}</p>
                </div>
                <button 
                  onClick={() => setSelectedPOToReceive(null)} 
                  className="p-4 bg-slate-50 rounded-2xl hover:bg-red-500 hover:text-white transition-all active:scale-90 border border-slate-200"
                >
                  <X size={24}/>
                </button>
             </div>

             <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-hide">
                <div className="space-y-3">
                   {selectedPOToReceive.items.map((p, idx) => (
                     <div key={idx} className="p-4 md:p-5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-4 shadow-sm">
                        <div className="flex-1 min-w-0">
                           <div className="font-black text-slate-800 text-[11px] md:text-sm uppercase truncate leading-tight mb-1.5">{p.name}</div>
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded">ORDER: {p.orderedQty} UNIT</span>
                        </div>
                        <div className="flex items-center bg-white border-4 border-slate-300 rounded-xl overflow-hidden focus-within:border-emerald-500 shadow-inner transition-all">
                           <input 
                             type="number" 
                             className="w-16 p-2 text-center font-black text-blue-600 text-sm outline-none bg-transparent"
                             value={receiptUpdates.find(u => u.itemId === p.itemId)?.receivedQty ?? 0}
                             onChange={(e) => {
                               const val = parseInt(e.target.value) || 0;
                               setReceiptUpdates(receiptUpdates.map(u => u.itemId === p.itemId ? { ...u, receivedQty: val } : u));
                             }}
                           />
                           <button onClick={() => {
                             setReceiptUpdates(receiptUpdates.map(u => u.itemId === p.itemId ? { ...u, receivedQty: p.orderedQty } : u));
                           }} className="bg-emerald-50 px-4 py-2 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all border-l-2 border-slate-200 active:scale-90"><Check size={20} /></button>
                        </div>
                     </div>
                   ))}
                </div>
             </div>

             <div className="p-6 bg-slate-900 text-white flex flex-col md:flex-row items-center justify-between gap-4 rounded-t-[2.5rem] shrink-0">
                <div className="text-center md:text-left">
                   <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1 leading-none">Sistem Inventory</span>
                   <div className="text-lg font-black tracking-tight">POSTING STOK MASUK</div>
                </div>
                <button onClick={() => {
                  onReceivePO(selectedPOToReceive.id, receiptUpdates);
                  setSelectedPOToReceive(null);
                  setActiveSubTab('history');
                }} className="w-full md:w-auto px-10 py-5 bg-emerald-600 text-white font-black text-xs rounded-2xl shadow-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 uppercase tracking-widest border-b-4 border-emerald-800 active:scale-95">
                   <CheckCircle size={20}/> TERIMA BARANG
                </button>
             </div>
          </div>
        </div>
      )}

      {/* DETAIL PO MODAL - REFINED AS PROFESSIONAL INVOICE */}
      {selectedPOToView && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[300] flex items-center justify-center p-0 md:p-6 lg:p-10 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-4xl h-full md:h-auto md:max-h-[95vh] md:rounded-[3rem] shadow-[0_0_100px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden border-[8px] md:border-[12px] border-slate-100 relative">
             
             {/* Header Section */}
             <div className="p-6 md:p-8 border-b-2 border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-white shrink-0 gap-4">
                <div className="flex items-center gap-4">
                   <div className="p-3 bg-slate-950 text-white rounded-2xl shadow-xl"><Building2 size={24}/></div>
                   <div>
                      <h3 className="text-lg md:text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">FAKTUR PEMBELIAN</h3>
                      <div className="flex items-center gap-2 mt-1.5">
                         <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md">{selectedPOToView.id}</span>
                         <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${selectedPOToView.isPaid ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-orange-50 text-orange-600 border-orange-200'}`}>
                            {selectedPOToView.isPaid ? 'LUNAS' : 'TEMPO'}
                         </span>
                      </div>
                   </div>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                   <button onClick={handlePrintPO} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-50 text-blue-600 rounded-xl font-black text-[10px] uppercase hover:bg-blue-100 transition-all active:scale-95 border-2 border-blue-200">
                     <Printer size={18}/> CETAK
                   </button>
                   <button 
                     onClick={() => setSelectedPOToView(null)} 
                     className="p-3.5 bg-slate-50 text-slate-400 rounded-xl hover:bg-red-500 hover:text-white transition-all active:scale-90 border-2 border-slate-200"
                   >
                     <X size={24}/>
                   </button>
                </div>
             </div>

             {/* Content: Metadata & Table */}
             <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 scrollbar-hide">
                
                {/* Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 space-y-4 shadow-inner">
                      <div className="flex items-center gap-2 text-slate-400">
                         <Truck size={14} />
                         <span className="text-[9px] font-black uppercase tracking-widest">Supplier Pengirim</span>
                      </div>
                      <div className="min-w-0">
                         <div className="font-black text-slate-900 text-lg uppercase leading-none">{selectedPOToView.supplierName}</div>
                         <div className="text-[10px] font-bold text-slate-500 mt-2 flex items-center gap-2">
                           <Users size={12}/> ID: {selectedPOToView.supplierId}
                         </div>
                      </div>
                   </div>
                   <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 space-y-4 shadow-inner">
                      <div className="flex items-center gap-2 text-slate-400">
                         <Calendar size={14} />
                         <span className="text-[9px] font-black uppercase tracking-widest">Detail Waktu & Termin</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                         <div>
                            <span className="text-[8px] font-bold text-slate-400 uppercase block mb-1">Tgl Transaksi</span>
                            <span className="font-black text-slate-800 text-xs">{selectedPOToView.date}</span>
                         </div>
                         <div>
                            <span className="text-[8px] font-bold text-slate-400 uppercase block mb-1">Jatuh Tempo</span>
                            <span className="font-black text-red-600 text-xs">{selectedPOToView.dueDate}</span>
                         </div>
                         <div className="col-span-2 pt-2 border-t border-slate-200">
                            <span className="text-[8px] font-bold text-slate-400 uppercase block mb-1">Lama Termin</span>
                            <span className="font-black text-blue-700 text-xs">{selectedPOToView.termOfPayment} Hari</span>
                         </div>
                      </div>
                   </div>
                </div>

                {/* Items Table */}
                <div className="space-y-4">
                   <div className="flex items-center gap-3 px-2">
                      <div className="w-6 h-1 bg-blue-600 rounded-full"></div>
                      <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Rincian Barang</h4>
                   </div>
                   <div className="bg-white border-2 border-slate-100 rounded-3xl overflow-hidden shadow-sm">
                      <table className="w-full text-left">
                         <thead className="bg-slate-50 border-b-2 border-slate-100">
                            <tr>
                               <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase">Barang</th>
                               <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase text-center">Pesan</th>
                               <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase text-center">Terima</th>
                               <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase text-right">Harga</th>
                               <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase text-right">Subtotal</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-50">
                            {selectedPOToView.items.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                 <td className="px-6 py-4">
                                    <div className="font-black text-slate-800 uppercase text-xs truncate max-w-[200px]">{item.name}</div>
                                    <div className="text-[8px] font-bold text-slate-400 mt-1 uppercase">ID: {item.itemId}</div>
                                 </td>
                                 <td className="px-6 py-4 text-center font-black text-slate-500 text-xs">{item.orderedQty}</td>
                                 <td className="px-6 py-4 text-center font-black text-emerald-600 text-xs">{item.receivedQty}</td>
                                 <td className="px-6 py-4 text-right font-black text-slate-600 text-xs">Rp {item.cost.toLocaleString()}</td>
                                 <td className="px-6 py-4 text-right font-black text-slate-900 text-xs">Rp {(item.receivedQty * item.cost).toLocaleString()}</td>
                              </tr>
                            ))}
                         </tbody>
                      </table>
                   </div>
                </div>
             </div>

             {/* Footer Totals */}
             <div className="p-8 md:p-10 bg-slate-900 text-white shrink-0 flex flex-col md:flex-row items-end md:items-center justify-between gap-8 rounded-t-[3rem] shadow-2xl relative z-20">
                <div className="flex items-center gap-6 w-full md:w-auto">
                   <div className="hidden md:flex flex-col border-r border-white/10 pr-6">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Subtotal Bruto</span>
                      <span className="font-black text-slate-200 text-lg">Rp {selectedPOToView.subtotal.toLocaleString()}</span>
                   </div>
                   <div className="flex flex-col">
                      <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Diskon ({selectedPOToView.discount}%)</span>
                      <span className="font-black text-emerald-500 text-lg">- Rp {(selectedPOToView.subtotal * selectedPOToView.discount / 100).toLocaleString()}</span>
                   </div>
                </div>
                
                <div className="bg-white/10 p-6 rounded-3xl border border-white/20 text-right w-full md:w-auto flex flex-col items-end">
                   <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mb-1">Total Netto Faktur</span>
                   <div className="text-3xl md:text-4xl font-black tracking-tighter">Rp {selectedPOToView.total.toLocaleString()}</div>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Purchasing;
