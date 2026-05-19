import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Search, 
  User as UserIcon, 
  ShoppingCart, 
  Trash2, 
  CreditCard, 
  Banknote, 
  ArrowLeft,
  X,
  Minus,
  Plus,
  Monitor,
  LayoutGrid,
  List,
  Award,
  Filter,
  CheckCircle2,
  Printer,
  ChevronRight,
  AlertTriangle,
  ChevronDown,
  UserCheck,
  SearchCode,
  ShoppingBag,
  Sparkles,
  PackageX,
  ChevronLeft
} from 'lucide-react';
import { Item, User, Customer, Sale, PromotionCampaign } from '../types';
import { printReceipt } from '../services/printService';
import { printReceiptWebSerial, isWebSerialSupported } from '../services/thermalPrinterService';

interface CartItem {
  id: string;
  item: Item;
  selectedPrice: number;
  qty: number;
}

interface SalesPOSProps {
  currentUser: User;
  items: Item[];
  customers: Customer[];
  promotions: PromotionCampaign[];
  onCompleteSale: (sale: Sale) => void;
}

const SalesPOS: React.FC<SalesPOSProps> = ({ currentUser, items, customers, promotions, onCompleteSale }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Semua');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastCompletedSale, setLastCompletedSale] = useState<Sale | null>(null);
  const UMUM_CUSTOMER: Customer = useMemo(() => ({ id: 'UMUM', name: 'Umum', phone: '-', address: '-', creditLimit: 0, currentDebt: 0, level: 1, rewardPoints: 0 }), []);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer>(UMUM_CUSTOMER);
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [promoName, setPromoName] = useState<string>('NONE');
  const [manualDiscount, setManualDiscount] = useState<number>(0);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Payment States
  const [paymentType, setPaymentType] = useState<'TUNAI' | 'NON-TUNAI' | 'KREDIT'>('TUNAI');
  const [paymentSubMethod, setPaymentSubMethod] = useState<'QRIS' | 'TRANSFER' | 'DEBIT'>('QRIS');
  const [amountReceived, setAmountReceived] = useState<number>(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLDivElement>(null);
  

  // PERFORMANCE OPTIMIZATION: Memoize heavy computations
  const categories = useMemo(() => {
    return ['Semua', ...Array.from(new Set<string>(items.map(i => i.category)))];
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(i => {
      const matchesSearch = i.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           i.barcode.includes(searchTerm) ||
                           i.code.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'Semua' || i.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [items, searchTerm, selectedCategory]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const currentItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, selectedCategory]);

  const subtotal = useMemo(() => {
    return cart.reduce((sum, c) => sum + (c.selectedPrice * c.qty), 0);
  }, [cart]);

  const availablePromos = useMemo(() => {
    const now = Date.now();
    return promotions.filter(promo => {
      if (!promo.isActive) return false;
      const start = new Date(promo.startAt).getTime();
      const end = promo.endAt ? new Date(promo.endAt).getTime() : null;
      const inWindow = now >= start && (end === null || now <= end);
      const levelPass = selectedCustomer.level >= (promo.minCustomerLevel || 1);
      return inWindow && levelPass;
    });
  }, [promotions, selectedCustomer.level]);

  const selectedPromo = useMemo(
    () => availablePromos.find(promo => promo.id === promoName) || null,
    [availablePromos, promoName],
  );

  const promoDiscount = useMemo(() => {
    if (!selectedPromo) return 0;
    if (selectedPromo.type === 'PERCENT') return Math.round(subtotal * (selectedPromo.value / 100));
    return Math.round(selectedPromo.value);
  }, [selectedPromo, subtotal]);

  const total = useMemo(() => {
    return Math.max(0, subtotal - promoDiscount - manualDiscount);
  }, [manualDiscount, promoDiscount, subtotal]);

  const changeAmount = useMemo(() => {
    return Math.max(0, amountReceived - total);
  }, [amountReceived, total]);

  const isAmountShort = useMemo(() => {
    return paymentType === 'TUNAI' && amountReceived < total;
  }, [paymentType, amountReceived, total]);

  useEffect(() => {
    inputRef.current?.focus();
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (customerRef.current && !customerRef.current.contains(event.target as Node)) {
        setShowCustomerList(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    setCart(prev => prev.map(c => ({
      ...c,
      selectedPrice: c.item.memberPrices[selectedCustomer.level - 1] || c.item.memberPrices[0]
    })));
  }, [selectedCustomer]);

  useEffect(() => {
    if (promoName !== 'NONE' && !selectedPromo) {
      setPromoName('NONE');
    }
  }, [promoName, selectedPromo]);

  const addToCart = useCallback((item: Item) => {
    if (item.stock <= 0) {
      alert(`Stok ${item.name} habis!`);
      return;
    }
    setCart(prevCart => {
      const existing = prevCart.find(c => c.id === item.id);
      const price = item.memberPrices?.[selectedCustomer.level - 1] ?? item.memberPrices?.[0] ?? item.basePrice;
      if (existing) {
        if (existing.qty + 1 > item.stock) {
          alert("Jumlah melebihi stok yang tersedia!");
          return prevCart;
        }
        return prevCart.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c);
      } else {
        return [...prevCart, { id: item.id, item, selectedPrice: price, qty: 1 }];
      }
    });
  }, [selectedCustomer.level]);

  useEffect(() => {
    let barcodeString = '';
    let timeoutId: any = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      try {
        const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
        if (isInput && document.activeElement !== inputRef.current && e.key !== 'F1' && e.key !== 'F2') return;

        if (e.key === 'F1') {
          e.preventDefault();
          if (cart.length > 0 && !showCheckout) {
            setPaymentType('TUNAI');
            setAmountReceived(total);
            setShowCheckout(true);
          }
          return;
        }

        if (e.key === 'F2') {
          e.preventDefault();
          inputRef.current?.focus();
          setShowCheckout(false);
          return;
        }

        if (e.key === 'Enter' && !showCheckout) {
          if (barcodeString.length >= 3) {
            e.preventDefault();
            const itemMatch = items.find(i => i.barcode === barcodeString || i.code === barcodeString);
            if (itemMatch) {
              addToCart(itemMatch);
              setSearchTerm('');
            }
            barcodeString = '';
          }
        } else if (e.key.length === 1 && !showCheckout) {
          barcodeString += e.key;
          if (timeoutId) clearTimeout(timeoutId);
          timeoutId = setTimeout(() => { barcodeString = ''; }, 50);
        }
      } catch (err) {
        console.error('[Barcode] handleKeyDown error:', err);
        barcodeString = '';
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [items, cart, total, showCheckout, addToCart]);

  const updateQty = (id: string, delta: number) => {
    setCart(cart.map(c => {
      if (c.id === id) {
        const newQty = Math.max(1, c.qty + delta);
        if (newQty > c.item.stock) {
           alert("Stok tidak mencukupi!");
           return c;
        }
        return { ...c, qty: newQty };
      }
      return c;
    }));
  };

  const setManualQty = (id: string, value: string) => {
    const num = parseInt(value) || 0;
    const cartItem = cart.find(c => c.id === id);
    if (cartItem && num > cartItem.item.stock) {
      alert("Stok tidak mencukupi!");
      return;
    }
    setCart(cart.map(c => id === c.id ? { ...c, qty: num } : c));
  };

  const handleBlurQty = (id: string, value: number) => {
    if (value < 1) {
      setCart(cart.map(c => {
        if (c.id === id) return { ...c, qty: 1 };
        return c;
      }));
    }
  };

  const handleFinishTransaction = () => {
    if (paymentType === 'KREDIT' && (selectedCustomer.currentDebt + total) > selectedCustomer.creditLimit && selectedCustomer.creditLimit > 0) {
      alert('Limit kredit pelanggan terlampaui.');
      return;
    }
    const invoiceId = `INV-${Date.now().toString().slice(-6)}`;
    const pointsToEarn = Math.floor(total / 10000); // 1 pt per Rp 10rb
    const saleData: Sale = {
      id: Math.random().toString(36).substr(2, 9),
      invoiceNo: invoiceId,
      date: new Date().toLocaleDateString('id-ID') + ' ' + new Date().toLocaleTimeString('id-ID'),
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      items: cart.map(c => ({
        itemId: c.item.id,
        name: c.item.name,
        qty: c.qty,
        price: c.selectedPrice,
        total: c.qty * c.selectedPrice
      })),
      subtotal: total,
      discountAmount: promoDiscount + manualDiscount,
      promoName: selectedPromo?.name,
      pointsEarned: pointsToEarn,
      tax: 0,
      total: total,
      paymentType,
      paymentMethod: paymentType === 'NON-TUNAI' ? paymentSubMethod : paymentType,
      amountReceived: paymentType === 'KREDIT' ? 0 : amountReceived,
      changeAmount: paymentType === 'KREDIT' ? 0 : changeAmount,
      operatorName: currentUser.name
    };

    onCompleteSale(saleData);
    setLastCompletedSale(saleData);
    setShowSuccessModal(true);
  };

  const finalizeAndReset = () => {
    setCart([]);
    setShowCheckout(false);
    setShowSuccessModal(false);
    setAmountReceived(0);
    setPromoName('NONE');
    setManualDiscount(0);
    setLastCompletedSale(null);
  };

  const handlePrint = async () => {
    if (lastCompletedSale) {
      if (isWebSerialSupported()) {
        try {
          await printReceiptWebSerial(lastCompletedSale);
        } catch (err: any) {
          console.error("Direct print failed:", err);
          printReceipt(lastCompletedSale);
        }
      } else {
        printReceipt(lastCompletedSale);
      }
    }
  };

  const CartContent = (isMobile: boolean) => (
    <div className={`flex flex-col h-full ${isMobile ? 'bg-white' : ''}`}>
       <div className="p-3 md:p-4 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center justify-between mb-3">
             <h3 className="font-semibold text-slate-800 text-sm">Keranjang</h3>
             <div className="flex items-center gap-2">
                <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">{cart.length} item</span>
                {isMobile && (
                  <button 
                    type="button" 
                    onClick={() => setShowMobileCart(false)} 
                    className="p-2 bg-slate-100 rounded-lg text-slate-500 active:scale-90 transition-all"
                    aria-label="Close Cart"
                  >
                    <X size={20}/>
                  </button>
                )}
             </div>
          </div>
          
          {/* Customer selector - larger touch target */}
          <div className="relative" ref={customerRef}>
             <button 
                type="button"
                onClick={() => setShowCustomerList(!showCustomerList)}
                className="w-full flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 hover:border-indigo-400 transition-all text-left group active:scale-[0.98]"
             >
                <div className="w-9 h-9 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                    <UserIcon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                   <p className="text-[11px] text-slate-400 font-medium leading-none">Pelanggan</p>
                   <p className="text-sm font-semibold text-slate-800 truncate mt-0.5">{selectedCustomer.name}</p>
                </div>
                <div className="px-2 py-1 bg-indigo-600 text-white rounded-md flex items-center gap-1 shrink-0">
                   <Award size={12}/>
                   <span className="font-semibold text-[11px]">Lv.{selectedCustomer.level}</span>
                </div>
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${showCustomerList ? 'rotate-180' : ''}`} />
             </button>

             {showCustomerList && (
               <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg z-[150] overflow-hidden animate-fadeIn">
                  <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                     <span className="text-xs font-medium text-slate-500">Pilih Pelanggan</span>
                     <button type="button" onClick={() => setShowCustomerList(false)} className="p-1 text-slate-400 hover:text-slate-600"><X size={16}/></button>
                  </div>
                  <div className="max-h-[250px] overflow-y-auto">
                     {customers.map(cust => (
                       <button 
                         key={cust.id}
                         type="button"
                         onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedCustomer(cust); setShowCustomerList(false); }}
                         className={`w-full flex items-center justify-between p-3 px-4 hover:bg-indigo-50 transition-all border-b border-slate-50 last:border-0 active:bg-indigo-100 ${selectedCustomer.id === cust.id ? 'bg-indigo-50' : ''}`}
                       >
                          <div className="flex items-center gap-3">
                             <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedCustomer.id === cust.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                <UserCheck size={14} />
                             </div>
                             <div className="text-left">
                                <p className="font-medium text-slate-800 text-sm">{cust.name}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{cust.phone}</p>
                             </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600">Lv.{cust.level}</span>
                       </button>
                     ))}
                  </div>
               </div>
             )}
          </div>
       </div>

       <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2 scrollbar-thin bg-white relative z-10 min-h-0">
         {cart.length === 0 ? (
           <div className="h-full flex flex-col items-center justify-center text-slate-300">
             <ShoppingCart size={32} className="mb-2 opacity-30" />
             <p className="text-sm text-slate-400">Belum ada item</p>
           </div>
         ) : (
           cart.map(c => (
             <div key={c.id} className="flex gap-3 p-3 bg-white border border-slate-100 rounded-xl transition-all hover:border-indigo-200">
                {c.item.imageUrl && (
                  <div className="w-12 h-12 md:w-14 md:h-14 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                     <img src={c.item.imageUrl} className="w-full h-full object-cover" alt={c.item.name} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                   <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800 text-sm truncate leading-tight">{c.item.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{c.item.brand}</p>
                      </div>
                      <button type="button" onClick={() => setCart(cart.filter(x => x.id !== c.id))} className="p-1.5 text-slate-300 hover:text-red-500 transition-all active:scale-90 rounded-md hover:bg-red-50"><Trash2 size={14}/></button>
                   </div>
                   <div className="flex items-center justify-between mt-2">
                      {/* Qty controls - large touch targets */}
                      <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                         <button type="button" onClick={() => updateQty(c.id, -1)} className="w-9 h-9 flex items-center justify-center hover:bg-slate-200 text-slate-600 active:bg-slate-300"><Minus size={14}/></button>
                         <input 
                            type="number"
                            className="w-10 bg-white text-center font-semibold text-indigo-700 text-sm py-1 outline-none appearance-none border-x border-slate-200"
                            value={c.qty}
                            onChange={(e) => setManualQty(c.id, e.target.value)}
                            onBlur={() => handleBlurQty(c.id, c.qty)}
                         />
                         <button type="button" onClick={() => updateQty(c.id, 1)} className="w-9 h-9 flex items-center justify-center hover:bg-slate-200 text-slate-600 active:bg-slate-300"><Plus size={14}/></button>
                      </div>
                      <p className="font-semibold text-slate-900 text-sm">Rp {(c.qty * c.selectedPrice).toLocaleString()}</p>
                   </div>
                </div>
             </div>
           ))
         )}
       </div>

       {/* Bottom total + pay button */}
       <div className="p-4 bg-slate-900 text-white rounded-t-2xl shadow-2xl space-y-3 shrink-0 safe-area-bottom">
          <div className="space-y-1.5">
             <div className="flex justify-between items-center text-xs text-slate-400">
                <span>Subtotal</span>
                <span>Rp {subtotal.toLocaleString()}</span>
             </div>
             {(promoDiscount + manualDiscount) > 0 && (
               <div className="flex justify-between items-center text-xs text-emerald-400">
                 <span>Diskon</span>
                 <span>- Rp {(promoDiscount + manualDiscount).toLocaleString()}</span>
               </div>
             )}
             <div className="pt-2 border-t border-white/10 flex justify-between items-end">
                <div>
                   <p className="text-[11px] text-indigo-300 font-medium">Total</p>
                   <p className="text-2xl font-bold tracking-tight">Rp {total.toLocaleString()}</p>
                </div>
             </div>
          </div>
          <button 
            type="button"
            disabled={cart.length === 0} 
            onClick={() => { setPaymentType('TUNAI'); setAmountReceived(total); setShowCheckout(true); }} 
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold text-base rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.97]"
          >
            <Banknote size={20} /> Bayar
          </button>
       </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-hidden">
      {/* Search Header - optimized for mobile touch */}
      <header className="bg-white border-b border-slate-200 p-3 md:p-4 shrink-0 z-50 safe-area-top">
        <div className="flex items-center gap-2">
           <div className="relative flex-1">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
             <input 
               ref={inputRef}
               type="text"
               placeholder="Cari barang / scan barcode..."
               className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 focus:border-indigo-500 focus:bg-white outline-none text-sm text-slate-800 transition-all placeholder:text-slate-400"
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
           </div>
           <select 
             className="hidden sm:block px-3 py-3 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 appearance-none cursor-pointer min-w-[100px]"
             value={selectedCategory}
             onChange={(e) => setSelectedCategory(e.target.value)}
           >
             {categories.map((cat: string) => <option key={cat} value={cat}>{cat}</option>)}
           </select>
           <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 shrink-0">
              <button type="button" onClick={() => setViewMode('grid')} className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}><LayoutGrid size={16}/></button>
              <button type="button" onClick={() => setViewMode('list')} className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}><List size={16}/></button>
           </div>
           {/* Mobile cart button - large touch target */}
           <button 
            type="button"
            onClick={() => setShowMobileCart(true)}
            className="md:hidden relative p-3 bg-indigo-600 text-white rounded-xl shadow-md active:scale-95 transition-all"
          >
            <ShoppingCart size={20} />
            {cart.length > 0 && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm">{cart.length}</span>}
          </button>
        </div>
        {/* Mobile category pills - scrollable */}
        <div className="flex sm:hidden gap-2 mt-2 overflow-x-auto scrollbar-hide pb-1">
          {categories.map((cat: string) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-hide bg-slate-50 min-h-0 flex flex-col">
          <div className="flex-1">
            {currentItems.length > 0 ? (
              <div className={viewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-4 md:gap-6" : "space-y-3"}>
                {currentItems.map(item => {
                  const appliedPrice = item.memberPrices[selectedCustomer.level - 1] || item.memberPrices[0];
                  const isOutOfStock = item.stock <= 0;
                  return (
                    <button 
                      key={item.id} 
                      type="button"
                      disabled={isOutOfStock}
                      onClick={() => addToCart(item)} 
                      className={`group flex transition-all active:scale-95 border-2 ${isOutOfStock ? 'opacity-60 cursor-not-allowed grayscale' : ''} ${viewMode === 'grid' ? "flex-col bg-white rounded-[1.5rem] md:rounded-[2rem] border-transparent overflow-hidden hover:border-blue-500 hover:shadow-xl shadow-sm" : "bg-white p-4 rounded-2xl border-transparent items-center gap-6 hover:border-blue-500 shadow-sm"}`}
                    >
                      <div className={`${viewMode === 'grid' ? 'w-full h-32 md:h-40' : 'w-20 h-20 md:w-24 md:h-24'} bg-slate-100 flex-shrink-0 relative overflow-hidden`}>
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                        <div className={`absolute top-2 right-2 md:top-3 md:right-3 backdrop-blur-md text-white text-[9px] md:text-[10px] font-bold px-2 py-0.5 md:px-3 md:py-1 rounded-full shadow-lg ${isOutOfStock ? 'bg-red-600' : 'bg-slate-900/80'}`}>
                          {isOutOfStock ? 'HABIS' : item.stock}
                        </div>
                        {isOutOfStock && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <PackageX size={40} className="text-white opacity-80" />
                          </div>
                        )}
                      </div>
                      <div className={`p-3 md:p-5 flex-1 text-left ${viewMode === 'grid' ? '' : 'flex items-center justify-between'}`}>
                        <div>
                          <div className="flex items-center gap-1.5 mb-1 md:mb-1.5">
                            <span className="text-[8px] md:text-[10px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">{item.category}</span>
                          </div>
                          <div className="font-bold text-slate-800 text-[12px] md:text-sm leading-tight line-clamp-2 uppercase tracking-tight">{item.name}</div>
                          <div className="text-[10px] font-semibold text-slate-500 mt-1 uppercase tracking-tight">{item.brand || 'No Brand'}</div>
                        </div>
                        <div className="flex items-center justify-between border-t border-slate-50 pt-2 md:pt-3 mt-2 md:mt-4">
                          <div className="flex flex-col">
                            <span className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-tighter">LV {selectedCustomer.level}</span>
                            <div className={`font-bold text-sm md:text-lg tracking-tight leading-none ${isOutOfStock ? 'text-slate-400' : 'text-blue-700'}`}>Rp {appliedPrice.toLocaleString()}</div>
                          </div>
                          <div className={`p-2 md:p-2 bg-slate-50 rounded-lg text-slate-400 transition-all border border-slate-200 ${!isOutOfStock ? 'group-hover:bg-blue-600 group-hover:text-white' : ''}`}><Plus size={16}/></div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-700">
                 <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-xl border-4 border-slate-200">
                    <ShoppingBag size={40} className="text-slate-300" />
                 </div>
                 <h3 className="text-xl font-bold text-slate-800 uppercase tracking-tighter">Oops! Produk Tidak Ada</h3>
                 <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mt-2">Coba kata kunci lain atau cek kategori</p>
              </div>
            )}
          </div>

          {/* POS Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 py-6 border-t border-slate-200 mt-8 shrink-0">
               <button 
                 disabled={currentPage === 1} 
                 onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                 className="w-12 h-12 flex items-center justify-center bg-white border-2 border-slate-200 rounded-2xl text-slate-400 disabled:opacity-20 hover:border-blue-500 hover:text-blue-600 transition-all active:scale-90"
               >
                 <ChevronLeft size={24}/>
               </button>
               
               <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Halaman</span>
                  <div className="px-4 py-2 bg-slate-900 text-white rounded-xl font-black text-sm shadow-lg">{currentPage}</div>
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Dari {totalPages}</span>
               </div>

               <button 
                 disabled={currentPage === totalPages} 
                 onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                 className="w-12 h-12 flex items-center justify-center bg-white border-2 border-slate-200 rounded-2xl text-slate-400 disabled:opacity-20 hover:border-blue-500 hover:text-blue-600 transition-all active:scale-90"
               >
                 <ChevronRight size={24}/>
               </button>
            </div>
          )}
        </div>

        <div className="hidden md:flex w-[380px] bg-white border-l border-slate-200 flex-col shadow-2xl z-10">
           {CartContent(false)}
        </div>
      </div>

      {showMobileCart && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] md:hidden animate-fadeIn" onClick={() => setShowMobileCart(false)}>
           <div className="absolute inset-0 bg-white flex flex-col animate-slideUp" onClick={e => e.stopPropagation()}>
              {CartContent(true)}
           </div>
        </div>
      )}

      {showCheckout && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center z-[200] p-4 md:p-6 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-md h-auto max-h-[95vh] rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-6 shadow-2xl space-y-4 md:space-y-4 border-4 md:border-6 border-slate-50 flex flex-col overflow-hidden relative">
              <div className="flex justify-between items-center shrink-0 relative z-[210]">
                 <div className="flex items-center gap-2 md:gap-3">
                    <div className="p-3 md:p-3 bg-blue-600 text-white rounded-xl shadow-lg"><Banknote size={24}/></div>
                    <div className="flex flex-col">
                       <h2 className="text-lg md:text-xl font-bold text-slate-900 tracking-tighter uppercase leading-none">PEMBAYARAN</h2>
                       <p className="text-slate-400 font-bold uppercase tracking-widest text-[8px] md:text-[10px] mt-1">Selesaikan Transaksi</p>
                    </div>
                 </div>
                 <button 
                    type="button" 
                    onClick={() => setShowCheckout(false)} 
                    className="p-4 bg-slate-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all border border-red-100 shadow-sm active:scale-90"
                    aria-label="Close Checkout"
                  >
                    <X size={24}/>
                 </button>
              </div>
              
              <div className="flex-1 overflow-y-auto scrollbar-hide space-y-4 md:space-y-4">
                <div className="bg-slate-100 p-5 md:p-6 rounded-2xl md:rounded-2xl text-center border-2 border-slate-200 shadow-inner">
                   <div className="text-slate-400 font-bold text-[10px] md:text-[11px] uppercase tracking-[0.2em] mb-1 md:mb-1">Total Tagihan</div>
                   <div className="text-3xl md:text-3xl font-bold text-slate-900 tracking-tighter leading-none">Rp {total.toLocaleString()}</div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <select className="w-full p-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-black text-[10px] outline-none" value={promoName} onChange={e => setPromoName(e.target.value)}>
                    <option value="NONE">Tanpa Promo</option>
                    {availablePromos.map(promo => (
                      <option key={promo.id} value={promo.id}>
                        {promo.name}
                      </option>
                    ))}
                  </select>
                  <input type="number" className="w-full p-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-black text-[10px] outline-none" placeholder="Diskon manual" value={manualDiscount} onChange={e => setManualDiscount(parseInt(e.target.value) || 0)} />
                </div>

                <div className="grid grid-cols-3 gap-3 md:gap-3">
                   <button 
                     type="button"
                     onClick={() => setPaymentType('TUNAI')}
                     className={`p-5 md:p-5 rounded-2xl md:rounded-2xl border-4 transition-all flex flex-col items-center gap-2 md:gap-2 shadow-lg active:scale-95 ${paymentType === 'TUNAI' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-100 bg-white text-slate-400 hover:border-blue-400 hover:text-blue-500'}`}
                   >
                      <Banknote size={28} className="md:w-7 md:h-7"/> 
                      <span className="font-bold text-[11px] md:text-sm uppercase tracking-tight">TUNAI</span>
                   </button>
                   <button 
                      type="button"
                      onClick={() => setPaymentType('NON-TUNAI')}
                      className={`p-5 md:p-5 rounded-2xl md:rounded-2xl border-4 transition-all flex flex-col items-center gap-2 md:gap-2 shadow-lg active:scale-95 ${paymentType === 'NON-TUNAI' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-100 bg-white text-slate-400 hover:border-blue-400 hover:text-blue-500'}`}
                   >
                      <CreditCard size={28} className="md:w-7 md:h-7"/> 
                      <span className="font-bold text-[11px] md:text-sm uppercase tracking-tight">NON-TUNAI</span>
                   </button>
                   <button 
                      type="button"
                      onClick={() => setPaymentType('KREDIT')}
                      className={`p-5 md:p-5 rounded-2xl md:rounded-2xl border-4 transition-all flex flex-col items-center gap-2 md:gap-2 shadow-lg active:scale-95 ${paymentType === 'KREDIT' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-100 bg-white text-slate-400 hover:border-blue-400 hover:text-blue-500'}`}
                   >
                      <UserCheck size={28} className="md:w-7 md:h-7"/> 
                      <span className="font-bold text-[11px] md:text-sm uppercase tracking-tight">KREDIT</span>
                   </button>
                </div>

                {paymentType === 'TUNAI' ? (
                  <div className="space-y-4 md:space-y-4 animate-in slide-in-from-top-2 duration-300">
                    <div className="space-y-2 md:space-y-2">
                      <label className="text-[10px] md:text-[11px] font-black text-slate-400 uppercase tracking-widest block ml-1">JUMLAH DITERIMA (RP)</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          autoFocus
                          className={`w-full p-4 md:p-4 bg-slate-50 border-4 rounded-2xl md:rounded-2xl text-2xl md:text-2xl font-black focus:border-blue-600 outline-none shadow-inner transition-all ${isAmountShort ? 'border-red-500 text-red-600 bg-red-50' : 'border-slate-400 text-slate-900'}`}
                          value={amountReceived}
                          onChange={(e) => setAmountReceived(parseInt(e.target.value) || 0)}
                        />
                        <div className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 flex gap-2 md:gap-2">
                           {[50000, 100000].map(val => (
                              <button 
                                key={val} 
                                type="button"
                                onClick={() => setAmountReceived(val)}
                                className="px-3 md:px-3 py-2 md:py-2 bg-slate-900 text-white border-2 border-slate-900 rounded-xl md:rounded-xl text-[10px] md:text-[11px] font-bold hover:bg-blue-600 hover:border-blue-700 active:scale-95 transition-all shadow-md"
                              >+{val/1000}K</button>
                           ))}
                        </div>
                      </div>
                      {isAmountShort && (
                        <div className="flex items-center gap-2 text-red-600 px-3 py-2 bg-red-100/50 rounded-xl border border-red-200 animate-pulse">
                          <AlertTriangle size={16}/>
                          <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-widest leading-none">UANG KURANG Rp {(total - amountReceived).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                    {!isAmountShort && (
                      <div className="bg-emerald-50 p-4 md:p-4 rounded-2xl border-2 border-emerald-400 flex justify-between items-center shadow-inner animate-in fade-in zoom-in duration-500">
                         <span className="text-[11px] md:text-sm font-bold text-emerald-600 uppercase tracking-widest">KEMBALIAN</span>
                         <span className="text-xl md:text-xl font-black text-emerald-700 tracking-tighter">Rp {changeAmount.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                ) : paymentType === 'NON-TUNAI' ? (
                  <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                     <h4 className="text-[10px] md:text-[12px] font-bold text-blue-600 uppercase tracking-widest text-center mb-1 bg-blue-50 py-2 md:py-2 rounded-xl md:rounded-xl border border-blue-100">PILIH CHANNEL</h4>
                     <div className="grid grid-cols-3 gap-2 md:gap-2">
                        {['QRIS', 'TRANSFER', 'DEBIT'].map((method) => (
                          <button 
                            key={method}
                            type="button"
                            onClick={() => setPaymentSubMethod(method as any)}
                            className={`py-4 md:py-4 rounded-xl border-2 font-black text-[11px] md:text-sm transition-all shadow-md active:scale-95 ${paymentSubMethod === method ? 'border-blue-600 bg-blue-600 text-white shadow-blue-100' : 'border-slate-200 bg-white text-slate-400 hover:border-blue-300'}`}
                          >
                            {method}
                          </button>
                        ))}
                     </div>
                  </div>
                ) : (
                  <div className="bg-amber-50 p-4 rounded-2xl border-2 border-amber-200 text-center">
                    <div className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Piutang Pelanggan</div>
                    <div className="text-xs font-bold text-amber-600 mt-2">Transaksi akan dicatat sebagai kredit pelanggan.</div>
                  </div>
                )}
              </div>
              
              <button 
                type="button"
                disabled={isAmountShort}
                onClick={handleFinishTransaction} 
                className={`w-full py-4 md:py-4 text-white font-black text-sm md:text-base rounded-2xl md:rounded-2xl shadow-xl transition-all border-b-4 shrink-0 flex items-center justify-center gap-2 active:scale-95 ${
                  isAmountShort 
                    ? 'bg-slate-300 border-slate-400 cursor-not-allowed text-slate-500 shadow-none' 
                    : 'bg-emerald-600 hover:bg-emerald-700 border-emerald-800 shadow-emerald-200'
                }`}
              >
                {isAmountShort ? 'JUMLAH KURANG' : 'SELESAI & SIMPAN'} <ChevronRight size={20}/>
              </button>
           </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="fixed inset-0 bg-blue-950/95 backdrop-blur-2xl flex items-center justify-center z-[250] p-6 animate-in zoom-in duration-500">
           <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 md:p-8 shadow-2xl text-center space-y-6 md:space-y-8 border-4 md:border-8 border-white overflow-hidden relative">
              <div className="w-20 h-20 md:w-24 md:h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner ring-8 ring-emerald-50">
                 <CheckCircle2 size={48} className="md:w-12 md:h-12" />
              </div>
              <div>
                <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">TRANSAKSI BERHASIL</h3>
                <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px] md:text-[12px] mt-3">Data Penjualan Telah Diarsipkan</p>
              </div>
              
              <div className="space-y-3 md:space-y-3">
                 <button 
                    type="button"
                    onClick={handlePrint}
                    className="w-full py-4 md:py-4 bg-blue-600 text-white font-black text-sm md:text-base rounded-2xl md:rounded-2xl shadow-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 border-b-4 border-blue-800 active:scale-95"
                 >
                    <Printer size={18}/> CETAK STRUK
                 </button>
                 <button 
                   type="button"
                   onClick={finalizeAndReset}
                   className="w-full py-4 md:py-4 bg-slate-900 text-white font-black text-sm md:text-base rounded-2xl md:rounded-2xl hover:bg-black transition-all shadow-lg border-b-4 border-slate-950 active:scale-95"
                 >
                    PENJUALAN BARU
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default SalesPOS;
