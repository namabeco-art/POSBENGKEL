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
  ChevronLeft,
  Pause,
  ClipboardList,
  Gift,
  Wrench
} from 'lucide-react';
import { Item, User, Customer, Sale, SaleItem, PromotionCampaign, CashSession, StoreProfile, AppSettings, Mechanic, HeldCart, ServiceOrder } from '../types';
import { printReceipt } from '../services/printService';
import { printReceiptWebSerial, isThermalPrinterEnabled } from '../services/thermalPrinterService';
import { createDocumentNo, createId } from '../services/idService';
import { findStockShortage, getAvailableStock, getItemCost, getSellableStock, getSellPrice, getSellUnits, type SellUnit } from '../services/pricing';
import { parseLineDiscount } from '../services/discount';
import { computePromoGifts, computePromotionDiscount, getTransactionPromotions } from '../services/promotions';
import { computeLineCommission } from '../services/commission';
import { describeSalePayments, summarizePaymentType } from '../services/salePayments';
import { openCustomerDisplayWindow, publishCustomerDisplay } from '../services/customerDisplay';
import SplitPaymentPanel, { type SplitPaymentResult } from '../components/SplitPaymentPanel';

interface CartItem {
  /** Kunci baris: barang + satuan (satu barang bisa dijual per Botol dan per Dus sekaligus). */
  id: string;
  item: Item;
  unitName: string;
  /** Isi satuan dalam satuan dasar (Botol = 1, Dus (12) = 12). */
  conversion: number;
  /** Harga per satuan yang dipilih. */
  selectedPrice: number;
  /** Jumlah dalam satuan yang dipilih. */
  qty: number;
  /** Mode Lengkap: diskon baris ("10+5" atau "5000"). */
  discountText?: string;
  /** Mode Lengkap: mekanik/sales yang mengerjakan baris ini (komisi). */
  mechanicId?: string;
  /** Mode Lengkap: nomor seri dipisah koma. */
  serialText?: string;
  /** Harga hasil negosiasi Work Order — tidak ikut berubah saat harga master berubah. */
  priceOverride?: number;
}

const lineGross = (line: CartItem) => line.qty * line.selectedPrice;
const lineDiscount = (line: CartItem) => parseLineDiscount(line.discountText, lineGross(line));
const lineNet = (line: CartItem) => lineGross(line) - lineDiscount(line);
const parseSerials = (text?: string) => (text || '').split(/[,;\n]/).map(value => value.trim()).filter(Boolean);

const lineKey = (itemId: string, unitName: string) => `${itemId}|${unitName}`;

/** Kebutuhan stok riil per satuan baris (paket → komponen; Dus → isi dalam satuan dasar). */
const perUnitDemand = (line: CartItem): Array<[string, number]> =>
  line.item.itemType === 'JASA'
    ? []
    : line.item.isBundle && line.item.components?.length
      ? line.item.components.map(component => [component.itemId, component.qty * line.conversion])
      : [[line.item.id, line.conversion]];

/** Batasi qty tiap baris agar total kebutuhan stok (termasuk komponen paket) tidak melebihi stok. */
const clampCartToStock = (lines: CartItem[], items: Item[]): CartItem[] => {
  const remaining = new Map(items.map(item => [item.id, getSellableStock(item)]));
  return lines.map(line => {
    const demand = perUnitDemand(line);
    if (demand.length === 0) return line; // jasa
    const maxQty = Math.min(...demand.map(([itemId, perUnit]) => (perUnit > 0 ? Math.floor((remaining.get(itemId) ?? 0) / perUnit) : Infinity)));
    const qty = Math.max(0, Math.min(line.qty, maxQty));
    demand.forEach(([itemId, perUnit]) => remaining.set(itemId, (remaining.get(itemId) ?? 0) - perUnit * qty));
    return qty === line.qty ? line : { ...line, qty };
  });
};

interface SalesPOSProps {
  currentUser: User;
  items: Item[];
  customers: Customer[];
  promotions: PromotionCampaign[];
  cashSessions?: CashSession[];
  storeProfile?: StoreProfile;
  onCompleteSale: (sale: Sale, options?: { heldCartId?: string }) => Promise<Sale>;
  onNavigate?: (tab: string) => void;
  // ---- Mode Lengkap
  isFullMode?: boolean;
  appSettings?: AppSettings;
  mechanics?: Mechanic[];
  heldCarts?: HeldCart[];
  onHoldCart?: (cart: HeldCart) => void;
  onDeleteHeldCart?: (id: string) => void;
  /** Work Order yang dikirim dari menu Servis untuk difakturkan. */
  serviceOrder?: ServiceOrder | null;
  onServiceOrderConsumed?: () => void;
}

const formatRp = (value: number) => `Rp ${Math.round(value || 0).toLocaleString('id-ID')}`;

const SalesPOS: React.FC<SalesPOSProps> = ({
  currentUser, items, customers, promotions, cashSessions = [], storeProfile, onCompleteSale, onNavigate,
  isFullMode = false, appSettings, mechanics = [], heldCarts = [], onHoldCart, onDeleteHeldCart, serviceOrder, onServiceOrderConsumed,
}) => {
  const activeMechanics = useMemo(() => mechanics.filter(mechanic => mechanic.isActive), [mechanics]);
  /** Transaksi tahan yang sedang dilanjutkan (dihapus otomatis setelah terjual). */
  const [resumedHeldCartId, setResumedHeldCartId] = useState<string | null>(null);
  const [linkedServiceOrder, setLinkedServiceOrder] = useState<{ id: string; orderNo: string; dpAmount: number } | null>(null);
  const [showHeldList, setShowHeldList] = useState(false);
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
  const [isSaving, setIsSaving] = useState(false);
  /** Pemberitahuan harga/stok yang berubah saat barang sudah di keranjang (mis. owner update harga). */
  const [cartNotices, setCartNotices] = useState<string[]>([]);
  const hasOpenShift = useMemo(
    () => cashSessions.some(session => session.userId === currentUser.id && session.status === 'OPEN'),
    [cashSessions, currentUser.id],
  );
  
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

  // Nilai baris setelah diskon baris (diskon baris hanya ada di mode Lengkap).
  const subtotal = useMemo(() => {
    return cart.reduce((sum, c) => sum + lineNet(c), 0);
  }, [cart]);

  // Promo faktur yang berlaku sekarang (rentang tanggal, hari/jam, level, minimal belanja).
  const availablePromos = useMemo(
    () => getTransactionPromotions(promotions, new Date(), selectedCustomer.level, subtotal),
    [promotions, selectedCustomer.level, subtotal],
  );

  const selectedPromo = useMemo(
    () => availablePromos.find(promo => promo.id === promoName) || null,
    [availablePromos, promoName],
  );

  const promoDiscount = useMemo(() => computePromotionDiscount(selectedPromo, subtotal), [selectedPromo, subtotal]);

  /** Bonus Beli X Gratis Y (mode Lengkap) — ditambahkan otomatis sebagai baris bernilai Rp 0. */
  const promoGifts = useMemo(() => {
    if (!isFullMode) return [];
    const bought = new Map<string, number>();
    cart.forEach(line => bought.set(line.item.id, (bought.get(line.item.id) || 0) + line.qty * line.conversion));
    return computePromoGifts(promotions, bought, new Date(), selectedCustomer.level).flatMap(gift => {
      const item = items.find(entry => entry.id === gift.freeItemId);
      if (!item) return [];
      const shortage = findStockShortage([...cart.map(line => ({ item: line.item, baseQty: line.qty * line.conversion })), { item, baseQty: gift.freeQty }], items);
      const price = getSellPrice(item, 1);
      // Bonus butuh harga acuan (> 0) agar tercatat sebagai diskon 100%; stok harus cukup.
      return [{ ...gift, item, price, outOfStock: Boolean(shortage) || !(price > 0) }];
    });
  }, [isFullMode, cart, promotions, items, selectedCustomer.level]);

  const lineDiscountTotal = useMemo(() => cart.reduce((sum, line) => sum + lineDiscount(line), 0), [cart]);

  /** Peringatan harga di bawah modal / margin minimal per baris (mode Lengkap). */
  const marginWarnings = useMemo(() => {
    if (!isFullMode) return new Map<string, string>();
    const minMargin = appSettings?.minMarginPercent || 0;
    const warnings = new Map<string, string>();
    cart.forEach(line => {
      const baseQty = line.qty * line.conversion;
      if (baseQty <= 0 || line.item.itemType === 'JASA') return;
      const cost = getItemCost(line.item, items) * baseQty;
      const net = lineNet(line);
      if (cost > 0 && net < cost) warnings.set(line.id, `Di bawah modal (rugi ${formatRp(cost - net)})`);
      else if (minMargin > 0 && net > 0 && ((net - cost) / net) * 100 < minMargin) warnings.set(line.id, `Margin < ${minMargin}%`);
    });
    return warnings;
  }, [isFullMode, cart, items, appSettings?.minMarginPercent]);

  const appliedManualDiscount = Math.min(Math.max(0, manualDiscount), Math.max(0, subtotal - promoDiscount));
  const total = useMemo(() => {
    return Math.max(0, subtotal - promoDiscount - appliedManualDiscount);
  }, [appliedManualDiscount, promoDiscount, subtotal]);

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

  // Keranjang selalu mengikuti harga & stok master terbaru. Harga di toko bisa berubah kapan saja
  // (owner update harga / sinkron dari perangkat lain) — kasir diberi tahu jika ada yang berubah.
  useEffect(() => {
    // Saat menyimpan/menampilkan struk, stok baru saja berkurang karena transaksi ini sendiri — jangan sentuh keranjang.
    if (isSaving || showSuccessModal) return;
    setCart(prev => {
      if (prev.length === 0) return prev;
      const notices: string[] = [];
      let changed = false;
      const repriced = prev.flatMap(c => {
        const latest = items.find(item => item.id === c.item.id);
        if (!latest) {
          notices.push(`${c.item.name} dihapus dari master barang dan dikeluarkan dari keranjang.`);
          changed = true;
          return [];
        }
        const unit = getSellUnits(latest, selectedCustomer.level).find(entry => entry.name === c.unitName);
        if (!unit || unit.price <= 0) {
          notices.push(`Satuan ${c.unitName} untuk ${latest.name} tidak tersedia lagi; dikeluarkan dari keranjang.`);
          changed = true;
          return [];
        }
        if (c.priceOverride !== undefined) {
          // Harga hasil negosiasi Work Order dipertahankan; data barang tetap diperbarui.
          if (latest === c.item) return [c];
          changed = true;
          return [{ ...c, item: latest }];
        }
        if (unit.price !== c.selectedPrice && latest !== c.item) {
          // Perubahan level pelanggan saja tidak perlu notifikasi; perubahan harga master perlu.
          notices.push(`Harga ${latest.name} (${unit.name}) berubah: ${formatRp(c.selectedPrice)} → ${formatRp(unit.price)}.`);
        }
        if (latest === c.item && unit.price === c.selectedPrice && unit.conversion === c.conversion) return [c];
        changed = true;
        return [{ ...c, item: latest, selectedPrice: unit.price, conversion: unit.conversion }];
      });
      const clamped = clampCartToStock(repriced, items);
      const next = clamped.filter((line, index) => {
        if (line.qty === repriced[index].qty) return true;
        changed = true;
        notices.push(`Stok ${line.item.name} tidak cukup; qty ${line.unitName} disesuaikan menjadi ${line.qty}.`);
        return line.qty > 0;
      });
      if (notices.length > 0) setCartNotices(current => [...notices, ...current].slice(0, 5));
      return changed ? next : prev;
    });
  }, [items, selectedCustomer.level, isSaving, showSuccessModal]);

  useEffect(() => {
    if (promoName !== 'NONE' && !selectedPromo) {
      setPromoName('NONE');
    }
  }, [promoName, selectedPromo]);

  /** Terapkan keranjang baru hanya jika stok (termasuk komponen paket & isi Dus) mencukupi. */
  const commitCart = useCallback((next: CartItem[]) => {
    const shortage = findStockShortage(next.map(line => ({ item: line.item, baseQty: line.qty * line.conversion })), items);
    if (shortage) {
      alert(`Stok ${shortage.name} tidak mencukupi (butuh ${shortage.needed}, tersedia ${shortage.available}).`);
      return false;
    }
    setCart(next);
    return true;
  }, [items]);

  const addToCart = useCallback((item: Item, chosenUnit?: SellUnit) => {
    if (getAvailableStock(item, items) <= 0) {
      alert(`Stok ${item.name} habis!`);
      return;
    }
    const unit = chosenUnit || getSellUnits(item, selectedCustomer.level)[0];
    if (unit.price <= 0) {
      alert(`Harga jual ${item.name} belum diatur (Rp 0). Minta admin/owner mengisi harga di Master Barang.`);
      return;
    }
    const key = lineKey(item.id, unit.name);
    const existing = cart.find(c => c.id === key);
    commitCart(existing
      ? cart.map(c => (c.id === key ? { ...c, qty: c.qty + 1 } : c))
      : [...cart, { id: key, item, unitName: unit.name, conversion: unit.conversion, selectedPrice: unit.price, qty: 1 }]);
  }, [cart, commitCart, items, selectedCustomer.level]);

  /** Ganti satuan baris (mis. Botol → Dus). Baris dengan satuan sama digabung. */
  const changeUnit = (id: string, unitName: string) => {
    const line = cart.find(c => c.id === id);
    if (!line) return;
    const unit = getSellUnits(line.item, selectedCustomer.level).find(entry => entry.name === unitName);
    if (!unit) return;
    const key = lineKey(line.item.id, unit.name);
    const target = cart.find(c => c.id === key);
    const next = target
      ? cart.filter(c => c.id !== id).map(c => (c.id === key ? { ...c, qty: c.qty + line.qty } : c))
      : cart.map(c => (c.id === id ? { ...c, id: key, unitName: unit.name, conversion: unit.conversion, selectedPrice: unit.price } : c));
    commitCart(next);
  };

  useEffect(() => {
    let barcodeString = '';
    let timeoutId: any = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      try {
        const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
        const fullModeKeys = isFullMode && ['F3', 'F4', 'F7', 'F8', 'F9'].includes(e.key);
        if (isInput && document.activeElement !== inputRef.current && e.key !== 'F1' && e.key !== 'F2' && !fullModeKeys) return;

        // Mode Lengkap: F3 tahan, F4 daftar tahan, F7 layar pelanggan, F8 bayar, F9 transaksi baru.
        if (fullModeKeys && !showCheckout) {
          e.preventDefault();
          if (e.key === 'F3') holdCurrentCart();
          else if (e.key === 'F4') setShowHeldList(true);
          else if (e.key === 'F7') openCustomerDisplayWindow();
          else if (e.key === 'F8') openCheckout();
          else if (e.key === 'F9' && (cart.length === 0 || window.confirm('Kosongkan keranjang dan mulai transaksi baru?'))) finalizeAndReset();
          return;
        }

        if (e.key === 'F1') {
          e.preventDefault();
          if (!showCheckout) openCheckout();
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
          timeoutId = setTimeout(() => { barcodeString = ''; }, 150);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cart, total, showCheckout, addToCart, isFullMode]);

  const updateQty = (id: string, delta: number) => {
    commitCart(cart.map(c => (c.id === id ? { ...c, qty: Math.max(1, c.qty + delta) } : c)));
  };

  const setManualQty = (id: string, value: string) => {
    const num = Math.max(0, parseInt(value) || 0);
    const next = cart.map(c => (id === c.id ? { ...c, qty: num } : c));
    if (num === 0) setCart(next); // sementara kosong saat mengetik; dikembalikan ke 1 saat blur
    else commitCart(next);
  };

  const handleBlurQty = (id: string, value: number) => {
    if (value < 1) {
      setCart(cart.map(c => {
        if (c.id === id) return { ...c, qty: 1 };
        return c;
      }));
    }
  };

  /** Baris penjualan (termasuk diskon baris, mekanik, serial, dan bonus promo) untuk disimpan. */
  const buildSaleItems = (): SaleItem[] => {
    const storeDefault = appSettings?.defaultCommissionPercent || 0;
    const lines: SaleItem[] = cart.map(c => {
      const gross = lineGross(c);
      const discount = lineDiscount(c);
      const net = gross - discount;
      const baseQty = c.qty * c.conversion;
      const mechanic = c.mechanicId ? mechanics.find(entry => entry.id === c.mechanicId) : undefined;
      const serials = parseSerials(c.serialText);
      return {
        itemId: c.item.id,
        name: c.item.name,
        qty: baseQty, // satuan dasar untuk stok & retur
        price: c.selectedPrice / c.conversion,
        total: net,
        unitName: c.unitName,
        unitQty: c.qty,
        unitPrice: c.selectedPrice,
        conversion: c.conversion,
        ...(discount > 0 ? { grossTotal: gross, discountAmount: discount, discountText: c.discountText } : {}),
        ...(c.item.itemType === 'JASA' ? { isJasa: true } : {}),
        ...(mechanic ? {
          mechanicId: mechanic.id,
          mechanicName: mechanic.name,
          commissionAmount: computeLineCommission(c.item, { qty: baseQty, total: net }, mechanic, storeDefault),
        } : {}),
        ...(serials.length ? { serialNumbers: serials } : {}),
        ...(c.item.warrantyDays ? { warrantyDays: c.item.warrantyDays } : {}),
      };
    });
    promoGifts.filter(gift => !gift.outOfStock).forEach(gift => {
      const gross = Math.round(gift.price * gift.freeQty);
      lines.push({
        itemId: gift.item.id,
        name: `${gift.item.name} (Bonus ${gift.promoName})`,
        qty: gift.freeQty,
        price: gift.price,
        total: 0,
        grossTotal: gross,
        discountAmount: gross,
        discountText: '100%',
        isPromoGift: true,
      });
    });
    return lines;
  };

  /** Validasi khusus mode Lengkap sebelum bayar: nomor seri & konfirmasi harga di bawah modal. */
  const validateFullModeCart = (): boolean => {
    for (const line of cart) {
      if (!line.item.trackSerial) continue;
      const serials = parseSerials(line.serialText);
      const needed = line.qty * line.conversion;
      if (serials.length !== needed) {
        alert(`${line.item.name} wajib ${needed} nomor seri (terisi ${serials.length}). Pisahkan dengan koma.`);
        return false;
      }
    }
    if (marginWarnings.size > 0) {
      const list = cart.filter(line => marginWarnings.has(line.id)).map(line => `• ${line.item.name}: ${marginWarnings.get(line.id)}`).join('\n');
      if (!window.confirm(`Ada harga yang perlu dicek:\n${list}\n\nTetap lanjutkan?`)) return false;
    }
    return true;
  };

  const openCheckout = () => {
    if (cart.length === 0) return;
    if (isFullMode && !validateFullModeCart()) return;
    setPaymentType('TUNAI');
    setAmountReceived(total);
    setShowCheckout(true);
  };

  /** Simpan transaksi mode Lengkap (pembayaran campuran). */
  const handleFinishSplit = async (result: SplitPaymentResult) => {
    const invoiceId = createDocumentNo('INV');
    const saleData: Sale = {
      id: createId('SALE'),
      invoiceNo: invoiceId,
      date: new Date().toLocaleDateString('id-ID') + ' ' + new Date().toLocaleTimeString('id-ID'),
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      items: buildSaleItems(),
      subtotal,
      discountAmount: promoDiscount + appliedManualDiscount,
      promoName: selectedPromo?.name,
      pointsEarned: Math.floor(total / 10000),
      tax: 0,
      total,
      payments: result.payments,
      paymentType: summarizePaymentType(result.payments),
      paymentMethod: describeSalePayments({ payments: result.payments, paymentType: 'TUNAI', total }),
      amountReceived: result.cashReceived,
      changeAmount: result.change,
      operatorName: currentUser.name,
      ...(linkedServiceOrder ? { serviceOrderId: linkedServiceOrder.id, serviceOrderNo: linkedServiceOrder.orderNo } : {}),
    };
    setIsSaving(true);
    try {
      const savedSale = await onCompleteSale(saleData, { heldCartId: resumedHeldCartId || undefined });
      setLastCompletedSale(savedSale);
      setShowSuccessModal(true);
      publishCustomerDisplay({ storeName: storeProfile?.name || 'POS Hulio', customerName: selectedCustomer.name, lines: [], subtotal, discount: promoDiscount + appliedManualDiscount, total, paid: result.cashReceived || total, change: result.change, message: 'Terima kasih!', updatedAt: new Date().toISOString() });
    } catch (error: any) {
      alert(error?.message || 'Transaksi gagal disimpan.');
    } finally {
      setIsSaving(false);
    }
  };

  /** Tahan transaksi untuk dilanjutkan nanti (mode Lengkap). */
  const holdCurrentCart = () => {
    if (!onHoldCart || cart.length === 0) return;
    const label = window.prompt('Keterangan transaksi yang ditahan (mis. nama pelanggan / plat motor):', selectedCustomer.id === 'UMUM' ? '' : selectedCustomer.name);
    if (label === null) return;
    onHoldCart({
      id: resumedHeldCartId || createId('HOLD'),
      label: label.trim() || `Tahan ${new Date().toLocaleTimeString('id-ID')}`,
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      lines: cart.map(line => ({
        itemId: line.item.id, name: line.item.name, unitName: line.unitName, conversion: line.conversion, qty: line.qty,
        discountText: line.discountText, mechanicId: line.mechanicId, serialNumbers: parseSerials(line.serialText),
      })),
      serviceOrderId: linkedServiceOrder?.id,
      createdAt: new Date().toISOString(),
      operatorName: currentUser.name,
      operatorId: currentUser.id,
    });
    finalizeAndReset();
  };

  const resumeHeldCart = (held: HeldCart) => {
    if (cart.length > 0 && !window.confirm('Keranjang saat ini akan diganti. Lanjutkan?')) return;
    const customer = customers.find(entry => entry.id === held.customerId) || { ...UMUM_CUSTOMER, name: held.customerName || 'Umum' };
    const restored: CartItem[] = [];
    const missing: string[] = [];
    held.lines.forEach(line => {
      const item = items.find(entry => entry.id === line.itemId);
      const unit = item ? getSellUnits(item, customer.level).find(entry => entry.name === line.unitName) : undefined;
      if (!item || !unit || unit.price <= 0) { missing.push(line.name); return; }
      restored.push({
        id: lineKey(item.id, unit.name), item, unitName: unit.name, conversion: unit.conversion, selectedPrice: unit.price, qty: line.qty,
        discountText: line.discountText, mechanicId: line.mechanicId, serialText: line.serialNumbers?.join(', '),
      });
    });
    setSelectedCustomer(customer);
    setCart(clampCartToStock(restored, items));
    setResumedHeldCartId(held.id);
    const order = held.serviceOrderId ? { id: held.serviceOrderId, orderNo: '', dpAmount: 0 } : null;
    setLinkedServiceOrder(order);
    setShowHeldList(false);
    if (missing.length) setCartNotices([`Tidak bisa dipulihkan (barang/satuan tidak ada atau harga 0): ${missing.join(', ')}`]);
  };

  const handleFinishTransaction = async () => {
    if (paymentType === 'KREDIT' && (selectedCustomer.id === 'UMUM' || selectedCustomer.creditLimit <= 0)) {
      alert('Pilih pelanggan yang memiliki limit kredit.');
      return;
    }
    if (paymentType === 'KREDIT' && (selectedCustomer.currentDebt + total) > selectedCustomer.creditLimit) {
      alert('Limit kredit pelanggan terlampaui.');
      return;
    }
    const invoiceId = createDocumentNo('INV');
    const pointsToEarn = Math.floor(total / 10000); // 1 pt per Rp 10rb
    const saleData: Sale = {
      id: createId('SALE'),
      invoiceNo: invoiceId,
      date: new Date().toLocaleDateString('id-ID') + ' ' + new Date().toLocaleTimeString('id-ID'),
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      items: cart.map(c => ({
        itemId: c.item.id,
        name: c.item.name,
        qty: c.qty * c.conversion, // satuan dasar untuk stok & retur
        price: c.selectedPrice / c.conversion,
        total: c.qty * c.selectedPrice,
        unitName: c.unitName,
        unitQty: c.qty,
        unitPrice: c.selectedPrice,
        conversion: c.conversion,
      })),
      subtotal: subtotal,
      discountAmount: promoDiscount + appliedManualDiscount,
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

    setIsSaving(true);
    try {
      const savedSale = await onCompleteSale(saleData);
      setLastCompletedSale(savedSale);
      setShowSuccessModal(true);
    } catch (error: any) {
      alert(error?.message || 'Transaksi gagal disimpan.');
    } finally {
      setIsSaving(false);
    }
  };

  const finalizeAndReset = () => {
    setCart([]);
    setShowCheckout(false);
    setShowSuccessModal(false);
    setAmountReceived(0);
    setPromoName('NONE');
    setManualDiscount(0);
    setLastCompletedSale(null);
    setCartNotices([]);
    // Transaksi berikutnya kembali ke pelanggan umum & tunai — mencegah salah tagih ke pelanggan sebelumnya.
    setSelectedCustomer(UMUM_CUSTOMER);
    setPaymentType('TUNAI');
    setResumedHeldCartId(null);
    setLinkedServiceOrder(null);
    inputRef.current?.focus();
  };

  // Work Order dari menu Servis → isi keranjang dengan harga WO, pelanggan, dan mekanik.
  useEffect(() => {
    if (!serviceOrder) return;
    onServiceOrderConsumed?.();
    if (cart.length > 0 && !window.confirm(`Keranjang saat ini akan diganti dengan ${serviceOrder.orderNo}. Lanjutkan?`)) return;
    const customer = customers.find(entry => entry.id === serviceOrder.customerId) || { ...UMUM_CUSTOMER, name: serviceOrder.customerName || 'Umum' };
    const loaded: CartItem[] = [];
    const missing: string[] = [];
    serviceOrder.lines.forEach((line, index) => {
      const item = items.find(entry => entry.id === line.itemId);
      if (!item) { missing.push(line.name); return; }
      const baseUnit = getSellUnits(item, customer.level)[0];
      loaded.push({
        id: `${lineKey(item.id, baseUnit.name)}|wo${index}`,
        item, unitName: baseUnit.name, conversion: 1, selectedPrice: line.price, priceOverride: line.price, qty: line.qty,
        mechanicId: line.mechanicId || (item.itemType === 'JASA' ? serviceOrder.mechanicId : undefined),
      });
    });
    const clamped = clampCartToStock(loaded, items);
    const short = clamped.filter((line, index) => line.qty !== loaded[index].qty).map(line => line.item.name);
    setSelectedCustomer(customer);
    setCart(clamped.filter(line => line.qty > 0));
    setLinkedServiceOrder({ id: serviceOrder.id, orderNo: serviceOrder.orderNo, dpAmount: serviceOrder.dpAmount || 0 });
    setResumedHeldCartId(null);
    const notices = [`Faktur untuk ${serviceOrder.orderNo} (${serviceOrder.customerName}).`];
    if (missing.length) notices.push(`Barang tidak ditemukan: ${missing.join(', ')}`);
    if (short.length) notices.push(`Stok tidak cukup, qty disesuaikan: ${short.join(', ')}`);
    setCartNotices(notices);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceOrder]);

  // Layar pelanggan (monitor kedua) mengikuti isi keranjang.
  useEffect(() => {
    if (!isFullMode || showSuccessModal) return;
    publishCustomerDisplay({
      storeName: storeProfile?.name || 'POS Hulio',
      customerName: selectedCustomer.name,
      lines: [
        ...cart.map(line => ({ name: line.item.name, qtyText: `${line.qty} ${line.unitName} x ${formatRp(line.selectedPrice)}`, total: lineNet(line), discount: lineDiscount(line) || undefined })),
        ...promoGifts.filter(gift => !gift.outOfStock).map(gift => ({ name: `${gift.item.name} (bonus)`, qtyText: `${gift.freeQty} gratis`, total: 0 })),
      ],
      subtotal,
      discount: promoDiscount + appliedManualDiscount,
      total,
      updatedAt: new Date().toISOString(),
    });
  }, [isFullMode, showSuccessModal, cart, promoGifts, subtotal, promoDiscount, appliedManualDiscount, total, selectedCustomer.name, storeProfile?.name]);

  const handlePrint = async () => {
    if (!lastCompletedSale) return;
    // Printer thermal langsung (Web Serial) hanya jika diaktifkan di Pengaturan; default cetak via browser.
    if (isThermalPrinterEnabled()) {
      try {
        await printReceiptWebSerial(lastCompletedSale, storeProfile);
        return;
      } catch (err: any) {
        console.error("Direct print failed:", err);
        alert(`Printer thermal gagal: ${err?.message || 'tidak terhubung'}. Mencetak lewat browser.`);
      }
    }
    printReceipt(lastCompletedSale, storeProfile);
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
                          <span className="flex flex-col items-end gap-0.5">
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600">Lv.{cust.level}</span>
                            {isFullMode && (cust.depositBalance || 0) > 0 && <span className="text-[10px] font-semibold text-emerald-600">Deposit {formatRp(cust.depositBalance || 0)}</span>}
                          </span>
                       </button>
                     ))}
                  </div>
               </div>
             )}
          </div>
       </div>

       <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2 scrollbar-thin bg-white relative z-10 min-h-0">
         {!hasOpenShift && (
           <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2" role="status">
             <AlertTriangle size={14} className="shrink-0 mt-0.5" />
             <div>
               <p className="font-semibold">Shift kasir belum dibuka</p>
               <p>Penjualan tunai tidak akan masuk rekap setoran kas.{onNavigate && <> <button type="button" onClick={() => onNavigate('dashboard')} className="underline font-semibold">Buka shift di Dashboard</button></>}</p>
             </div>
           </div>
         )}
         {cartNotices.length > 0 && (
           <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 space-y-1" role="status">
             <div className="flex items-center justify-between">
               <p className="font-semibold">Harga/stok diperbarui</p>
               <button type="button" onClick={() => setCartNotices([])} className="text-blue-500 hover:text-blue-700" aria-label="Tutup pemberitahuan"><X size={14}/></button>
             </div>
             {cartNotices.map((notice, index) => <p key={index}>• {notice}</p>)}
           </div>
         )}
         {linkedServiceOrder && (
           <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-800 flex items-center gap-2" role="status">
             <Wrench size={14} className="shrink-0" />
             <span>Faktur Work Order <b>{linkedServiceOrder.orderNo || '(tahan)'}</b>{linkedServiceOrder.dpAmount > 0 ? ` • DP ${formatRp(linkedServiceOrder.dpAmount)} tersedia di deposit` : ''}</span>
           </div>
         )}
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
                        {(() => {
                          const units = getSellUnits(c.item, selectedCustomer.level);
                          if (units.length <= 1) return <p className="text-xs text-slate-400 mt-0.5">{c.item.brand}{c.item.brand ? ' • ' : ''}{c.unitName}</p>;
                          return (
                            <select
                              aria-label={`Satuan ${c.item.name}`}
                              className="mt-1 text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white text-slate-700"
                              value={c.unitName}
                              onChange={event => changeUnit(c.id, event.target.value)}
                            >
                              {units.map(unit => <option key={unit.name} value={unit.name}>{unit.name} — {formatRp(unit.price)}</option>)}
                            </select>
                          );
                        })()}
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
                      <div className="text-right">
                        <p className="font-semibold text-slate-900 text-sm">{formatRp(lineNet(c))}</p>
                        <p className="text-[10px] text-slate-400">@ {formatRp(c.selectedPrice)}{lineDiscount(c) > 0 ? ` • disk ${formatRp(lineDiscount(c))}` : ''}</p>
                      </div>
                   </div>
                   {isFullMode && (
                     <div className="mt-2 grid grid-cols-2 gap-1.5">
                       <input
                         aria-label={`Diskon ${c.item.name}`}
                         className="text-xs border border-slate-200 rounded-md px-2 py-1.5"
                         placeholder="Diskon: 10+5 / 5000"
                         value={c.discountText || ''}
                         onChange={event => setCart(cart.map(line => (line.id === c.id ? { ...line, discountText: event.target.value } : line)))}
                       />
                       {activeMechanics.length > 0 ? (
                         <select
                           aria-label={`Mekanik ${c.item.name}`}
                           className="text-xs border border-slate-200 rounded-md px-1.5 py-1.5 bg-white"
                           value={c.mechanicId || ''}
                           onChange={event => setCart(cart.map(line => (line.id === c.id ? { ...line, mechanicId: event.target.value || undefined } : line)))}
                         >
                           <option value="">Mekanik/Sales —</option>
                           {activeMechanics.map(mechanic => <option key={mechanic.id} value={mechanic.id}>{mechanic.name}</option>)}
                         </select>
                       ) : <span />}
                       {c.item.trackSerial && (
                         <input
                           aria-label={`Nomor seri ${c.item.name}`}
                           className={`col-span-2 text-xs border rounded-md px-2 py-1.5 ${parseSerials(c.serialText).length === c.qty * c.conversion ? 'border-emerald-300' : 'border-amber-400'}`}
                           placeholder={`Nomor seri (${c.qty * c.conversion}), pisahkan koma`}
                           value={c.serialText || ''}
                           onChange={event => setCart(cart.map(line => (line.id === c.id ? { ...line, serialText: event.target.value } : line)))}
                         />
                       )}
                       {marginWarnings.has(c.id) && <p className="col-span-2 text-[10px] font-semibold text-red-600 flex items-center gap-1"><AlertTriangle size={11} /> {marginWarnings.get(c.id)}</p>}
                     </div>
                   )}
                </div>
             </div>
           ))
         )}
         {promoGifts.map(gift => (
           <div key={gift.promoId} className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs ${gift.outOfStock ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
             <Gift size={14} className="shrink-0" />
             <span className="flex-1">Bonus {gift.promoName}: <b>{gift.freeQty} {gift.item.name}</b>{gift.outOfStock ? (gift.price > 0 ? ' — stok tidak cukup, bonus tidak diberikan' : ' — harga barang bonus belum diatur, bonus tidak diberikan') : ' (Rp 0)'}</span>
           </div>
         ))}
       </div>

       {/* Bottom total + pay button */}
       <div className="p-4 bg-slate-900 text-white rounded-t-2xl shadow-2xl space-y-3 shrink-0 safe-area-bottom">
          <div className="space-y-1.5">
             <div className="flex justify-between items-center text-xs text-slate-400">
                <span>Subtotal</span>
                <span>Rp {subtotal.toLocaleString('id-ID')}</span>
             </div>
             {isFullMode && lineDiscountTotal > 0 && (
               <div className="flex justify-between items-center text-xs text-emerald-300">
                 <span>Diskon barang (sudah di subtotal)</span>
                 <span>- Rp {lineDiscountTotal.toLocaleString('id-ID')}</span>
               </div>
             )}
             {(promoDiscount + appliedManualDiscount) > 0 && (
               <div className="flex justify-between items-center text-xs text-emerald-400">
                 <span>Diskon</span>
                 <span>- Rp {(promoDiscount + appliedManualDiscount).toLocaleString('id-ID')}</span>
               </div>
             )}
             <div className="pt-2 border-t border-white/10 flex justify-between items-end">
                <div>
                   <p className="text-[11px] text-indigo-300 font-medium">Total</p>
                   <p className="text-2xl font-bold tracking-tight">Rp {total.toLocaleString('id-ID')}</p>
                </div>
             </div>
          </div>
 {isFullMode && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={cart.length === 0} onClick={holdCurrentCart} className="py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 text-xs font-semibold flex items-center justify-center gap-1.5"><Pause size={14} /> Tahan (F3)</button>
              <button type="button" onClick={() => setShowHeldList(true)} className="py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center justify-center gap-1.5"><ClipboardList size={14} /> Ditahan ({heldCarts.length}) F4</button>
            </div>
          )}
          <button 
            type="button"
            disabled={cart.length === 0} 
            onClick={openCheckout} 
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
           {isFullMode && (
             <button type="button" onClick={openCustomerDisplayWindow} className="hidden md:flex p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-indigo-600" title="Layar pelanggan (F7)" aria-label="Buka layar pelanggan">
               <Monitor size={18} />
             </button>
           )}
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
                  const appliedPrice = getSellPrice(item, selectedCustomer.level);
                  const availableStock = getAvailableStock(item, items);
                  const isOutOfStock = availableStock <= 0;
                  const extraUnits = getSellUnits(item, selectedCustomer.level).slice(1);
                  const hasNoPrice = appliedPrice <= 0;
                  return (
                    <button 
                      key={item.id} 
                      type="button"
                      disabled={isOutOfStock}
                      onClick={() => addToCart(item)} 
                      className={`group flex transition-all active:scale-95 border-2 ${isOutOfStock ? 'opacity-60 cursor-not-allowed grayscale' : ''} ${viewMode === 'grid' ? "flex-col bg-white rounded-[1.5rem] md:rounded-[2rem] border-transparent overflow-hidden hover:border-blue-500 hover:shadow-xl shadow-sm" : "bg-white p-4 rounded-2xl border-transparent items-center gap-6 hover:border-blue-500 shadow-sm"}`}
                    >
                      <div className={`${viewMode === 'grid' ? 'w-full h-32 md:h-40' : 'w-20 h-20 md:w-24 md:h-24'} bg-slate-100 flex-shrink-0 relative overflow-hidden`}>
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300"><ShoppingBag size={32} /></div>
                        )}
                        <div className={`absolute top-2 right-2 md:top-3 md:right-3 backdrop-blur-md text-white text-[9px] md:text-[10px] font-bold px-2 py-0.5 md:px-3 md:py-1 rounded-full shadow-lg ${isOutOfStock ? 'bg-red-600' : 'bg-slate-900/80'}`}>
                          {isOutOfStock ? 'HABIS' : Number.isFinite(availableStock) ? availableStock : 'JASA'}
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
                            <span className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-tighter">LV {selectedCustomer.level}{item.isBundle ? ' • PAKET' : ''}</span>
                            <div className={`font-bold text-sm md:text-lg tracking-tight leading-none ${isOutOfStock || hasNoPrice ? 'text-slate-400' : 'text-blue-700'}`}>{hasNoPrice ? 'Harga belum diatur' : formatRp(appliedPrice)}</div>
                            {extraUnits.length > 0 && <div className="text-[9px] md:text-[10px] font-semibold text-slate-500 mt-1">{extraUnits.map(unit => `${unit.name}: ${formatRp(unit.price)}`).join(' • ')}</div>}
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
                   <div className="text-3xl md:text-3xl font-bold text-slate-900 tracking-tighter leading-none">Rp {total.toLocaleString('id-ID')}</div>
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
                  <input type="number" min={0} max={Math.max(0, subtotal - promoDiscount)} className="w-full p-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-black text-[10px] outline-none" placeholder="Diskon manual" value={manualDiscount} onChange={e => setManualDiscount(Math.min(Math.max(0, parseInt(e.target.value) || 0), Math.max(0, subtotal - promoDiscount)))} />
                </div>

                {isFullMode ? (
                  <SplitPaymentPanel
                    total={total}
                    customer={selectedCustomer}
                    defaultDeposit={linkedServiceOrder ? Math.min(linkedServiceOrder.dpAmount || selectedCustomer.depositBalance || 0, total) : 0}
                    isSaving={isSaving}
                    onSubmit={handleFinishSplit}
                  />
                ) : (<>
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
                           <button
                             type="button"
                             onClick={() => setAmountReceived(total)}
                             className="px-3 md:px-3 py-2 md:py-2 bg-emerald-600 text-white border-2 border-emerald-600 rounded-xl md:rounded-xl text-[10px] md:text-[11px] font-bold hover:bg-emerald-700 active:scale-95 transition-all shadow-md"
                           >PAS</button>
                           {[50000, 100000].map(val => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setAmountReceived(val)}
                                className="px-3 md:px-3 py-2 md:py-2 bg-slate-900 text-white border-2 border-slate-900 rounded-xl md:rounded-xl text-[10px] md:text-[11px] font-bold hover:bg-blue-600 hover:border-blue-700 active:scale-95 transition-all shadow-md"
                              >{val/1000}K</button>
                           ))}
                        </div>
                      </div>
                      {isAmountShort && (
                        <div className="flex items-center gap-2 text-red-600 px-3 py-2 bg-red-100/50 rounded-xl border border-red-200 animate-pulse">
                          <AlertTriangle size={16}/>
                          <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-widest leading-none">UANG KURANG Rp {(total - amountReceived).toLocaleString('id-ID')}</span>
                        </div>
                      )}
                    </div>
                    {!isAmountShort && (
                      <div className="bg-emerald-50 p-4 md:p-4 rounded-2xl border-2 border-emerald-400 flex justify-between items-center shadow-inner animate-in fade-in zoom-in duration-500">
                         <span className="text-[11px] md:text-sm font-bold text-emerald-600 uppercase tracking-widest">KEMBALIAN</span>
                         <span className="text-xl md:text-xl font-black text-emerald-700 tracking-tighter">Rp {changeAmount.toLocaleString('id-ID')}</span>
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
                </>)}
              </div>
              
              {!isFullMode && <button 
                type="button"
                disabled={isAmountShort || isSaving}
                onClick={handleFinishTransaction} 
                className={`w-full py-4 md:py-4 text-white font-black text-sm md:text-base rounded-2xl md:rounded-2xl shadow-xl transition-all border-b-4 shrink-0 flex items-center justify-center gap-2 active:scale-95 ${
                  isAmountShort 
                    ? 'bg-slate-300 border-slate-400 cursor-not-allowed text-slate-500 shadow-none' 
                    : 'bg-emerald-600 hover:bg-emerald-700 border-emerald-800 shadow-emerald-200'
                }`}
              >
                {isSaving ? 'MENYIMPAN...' : isAmountShort ? 'JUMLAH KURANG' : 'SELESAI & SIMPAN'} <ChevronRight size={20}/>
              </button>}
           </div>
        </div>
      )}

      {showHeldList && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-[220] p-4" role="dialog" aria-label="Transaksi ditahan">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Transaksi ditahan ({heldCarts.length})</h3>
              <button type="button" onClick={() => setShowHeldList(false)} className="p-2 text-slate-400 hover:text-slate-700" aria-label="Tutup"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto p-3 space-y-2">
              {heldCarts.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">Tidak ada transaksi yang ditahan.</p> : heldCarts.map(held => (
                <div key={held.id} className="flex items-center gap-3 p-3 border border-slate-100 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-800 truncate">{held.label}</p>
                    <p className="text-xs text-slate-500">{held.customerName} • {held.lines.length} baris • {new Date(held.createdAt).toLocaleString('id-ID')} • {held.operatorName}</p>
                  </div>
                  <button type="button" onClick={() => resumeHeldCart(held)} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold">Lanjutkan</button>
                  {onDeleteHeldCart && <button type="button" onClick={() => window.confirm(`Hapus transaksi tahan "${held.label}"?`) && onDeleteHeldCart(held.id)} className="p-2 text-slate-400 hover:text-red-600" aria-label={`Hapus ${held.label}`}><Trash2 size={16} /></button>}
                </div>
              ))}
            </div>
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
