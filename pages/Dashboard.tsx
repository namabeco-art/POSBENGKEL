import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, ShoppingBag, PackageCheck, AlertTriangle, Users, BarChart3, Calendar, Sparkles, Loader2, RefreshCw, Wallet, ShieldAlert, ClipboardList } from 'lucide-react';
import { Item, Sale, Customer, Account, PurchaseOrder, InventoryMovement, CashSession, User } from '../types';
import { getResolvedOpenRouterApiKey, getResolvedOpenRouterModel } from '../services/appConfig';
import { getCloudConfig } from '../services/syncService';
import { parseOpenRouterError, requestOpenRouterReply } from '../services/aiService';
import ShiftManagementModal from '../components/ShiftManagementModal';

interface DashboardProps {
  items: Item[];
  sales: Sale[];
  customers: Customer[];
  accounts: Account[];
  purchaseOrders: PurchaseOrder[];
  inventoryMovements: InventoryMovement[];
  cashSessions: CashSession[];
  currentUser: User;
  onOpenCashSession: (openingCash: number) => void;
  onCloseCashSession: (closingCash: number, notes: string) => void;
}

const StatCard: React.FC<{ icon: React.ReactNode, label: string, value: string, trend: string, color: string }> = ({
  icon, label, value, trend, color
}) => (
  <div className="bg-white p-5 md:p-6 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between mb-4">
      <div className={`p-3 rounded-2xl ${color} text-white shadow-lg shadow-blue-100`}>{icon}</div>
      <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg uppercase tracking-wider">{trend}</span>
    </div>
    <div>
      <div className="text-slate-400 text-[10px] md:text-xs font-black uppercase tracking-widest mb-1">{label}</div>
      <div className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter leading-none truncate">{value}</div>
    </div>
  </div>
);

const Dashboard: React.FC<DashboardProps> = ({ items, sales, customers, accounts, purchaseOrders, inventoryMovements, cashSessions, currentUser, onOpenCashSession, onCloseCashSession }) => {
  const [range, setRange] = useState<'today' | '7days' | '1month'>('7days');
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [aiStrategy, setAiStrategy] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [lastError, setLastError] = useState<string>('');
  const [openingCashInput, setOpeningCashInput] = useState(0);
  const [closingCashInput, setClosingCashInput] = useState(0);

  // Logika Filter Data Berdasarkan Tanggal
  const filteredSalesData = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return sales.filter(s => {
      try {
        const parts = s.date.split(' ');
        const dateParts = parts[0].split('/');
        // Format: DD/MM/YYYY
        const saleDate = new Date(parseInt(dateParts[2]), parseInt(dateParts[1]) - 1, parseInt(dateParts[0]));
        
        if (range === 'today') {
          return saleDate.getTime() >= startOfToday.getTime();
        } else if (range === '7days') {
          const limit = new Date(startOfToday);
          limit.setDate(limit.getDate() - 7);
          return saleDate.getTime() >= limit.getTime();
        } else if (range === '1month') {
          const limit = new Date(startOfToday);
          limit.setMonth(limit.getMonth() - 1);
          return saleDate.getTime() >= limit.getTime();
        }
      } catch (e) {
        return false;
      }
      return true;
    });
  }, [sales, range]);

  // Kalkulasi data riil dari data yang sudah difilter
  const metrics = useMemo(() => {
    const totalOmzet = filteredSalesData.reduce((sum, s) => sum + s.total, 0);
    const totalSalesCount = filteredSalesData.length;
    const totalItemsOut = filteredSalesData.reduce((sum, s) => 
      sum + s.items.reduce((iSum, item) => iSum + item.qty, 0), 0
    );
    const totalCustomersCount = customers.length; // Pelanggan dihitung total master data

    return {
      totalOmzet: `Rp ${totalOmzet.toLocaleString()}`,
      salesCount: `${totalSalesCount} Transaksi`,
      itemsOut: `${totalItemsOut} Unit`,
      customersCount: `${totalCustomersCount} Org`
    };
  }, [filteredSalesData, customers]);

  const openCashSession = useMemo(
    () => cashSessions.find(session => session.userId === currentUser.id && session.status === 'OPEN') || null,
    [cashSessions, currentUser.id],
  );

  const lowStockItems = useMemo(() => items.filter(item => item.stock <= (item.reorderLevel || 10)).slice(0, 5), [items]);
  const payableSummary = useMemo(() => purchaseOrders.filter(po => !po.isPaid).reduce((sum, po) => sum + (po.total - (po.paidAmount || 0)), 0), [purchaseOrders]);
  const movementSummary = useMemo(() => inventoryMovements.slice(0, 5), [inventoryMovements]);

  const fetchAiStrategy = useCallback(async () => {
    const config = getCloudConfig();
    const apiKey = getResolvedOpenRouterApiKey(config.openRouterApiKey).trim();
    const model = getResolvedOpenRouterModel(config.aiModel);
    
    if (!apiKey || apiKey.length < 10) {
      setAiStrategy('AI_MISSING');
      return;
    }

    setIsAiLoading(true);
    setLastError('');
    try {
      const response = await requestOpenRouterReply({
        apiKey,
        userMessage: `Analisis data periode ${range.toUpperCase()}: Omzet ${metrics.totalOmzet}, Total Transaksi ${metrics.salesCount}, Item Keluar ${metrics.itemsOut}. Beri 3 poin strategi operasional singkat. Gunakan simbol '*' dan judul tebal.`,
        primaryModel: model,
        fallbackModel: 'openrouter/auto',
        appName: 'POSHULIO Dashboard Insight',
        systemPrompt: 'Anda adalah Konsultan Senior HGroup. Berikan jawaban padat dalam Bahasa Indonesia.',
      });

      setAiStrategy(response || 'Gagal menghasilkan strategi.');
    } catch (error: any) {
      console.error("AI Dash Error:", error);
      const parsed = parseOpenRouterError(error?.message || '');
      let nextError = 'Masalah koneksi AI. Coba lagi.';
      if (parsed.code === 'OPENROUTER_RATE_LIMIT') {
        nextError = 'RATE LIMIT OPENROUTER: Permintaan AI sedang dibatasi. Silakan coba lagi beberapa saat lagi.';
      } else if (parsed.code === 'OPENROUTER_CREDIT_ERROR' || parsed.code === 'OPENROUTER_PAYMENT_REQUIRED') {
        nextError = 'LIMIT PROVIDER/KREDIT: Model tujuan menolak request karena limit billing/quota. Coba model lain atau cek limit provider OpenRouter.';
      } else if (parsed.code === 'OPENROUTER_AUTH_ERROR') {
        nextError = 'API KEY OPENROUTER TIDAK VALID: Simpan ulang API key di Pengaturan API.';
      }
      if (parsed.detail) nextError += ` Detail: ${parsed.detail}`;
      setLastError(nextError);
      setAiStrategy('AI_ERROR');
    } finally {
      setIsAiLoading(false);
    }
  }, [metrics, range]);

  useEffect(() => {
    fetchAiStrategy();
  }, [fetchAiStrategy]);

  useEffect(() => {
    const handleFocus = () => {
      fetchAiStrategy();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchAiStrategy]);

  const renderAiContent = () => {
    if (aiStrategy === 'AI_MISSING') {
      return (
        <div className="flex flex-col items-center py-8 text-center animate-in fade-in">
          <div className="p-4 bg-orange-50 rounded-full mb-4">
            <AlertTriangle className="text-orange-500" size={32}/>
          </div>
          <span className="text-white font-black uppercase text-[10px] tracking-widest">H-AI Offline</span>
          <p className="text-slate-500 text-[10px] mt-2 font-bold max-w-xs mx-auto">API Key OpenRouter tidak ditemukan. Atur di menu Pengaturan API dan klik Simpan.</p>
          <button onClick={fetchAiStrategy} className="mt-6 flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-[10px] font-black rounded-xl uppercase shadow-lg active:scale-95 transition-all">
            <RefreshCw size={14}/> Coba Hubungkan Lagi
          </button>
        </div>
      );
    }

    if (aiStrategy === 'AI_ERROR') {
      return (
        <div className="flex flex-col items-center py-8 text-center animate-in fade-in px-4">
          <AlertTriangle className="text-red-500 mb-2" size={32}/>
          <span className="text-white font-black uppercase text-[10px] tracking-widest">Koneksi AI Terhambat</span>
          <p className="text-slate-500 text-[9px] mt-2 font-bold leading-relaxed max-sm mx-auto">
            {lastError.includes('KUOTA') ? lastError : 'Masalah pada Kunci API atau Jaringan.'}
          </p>
          <button onClick={fetchAiStrategy} className="mt-6 px-8 py-3 bg-slate-800 text-white text-[9px] font-black rounded-xl uppercase hover:bg-slate-700 transition-colors border border-white/10">Refresh Koneksi</button>
        </div>
      );
    }
    
    const points = aiStrategy.split('\n').filter(line => line.trim().startsWith('*'));
    if (points.length === 0) return <p className="text-slate-200 font-bold text-xs leading-relaxed">{aiStrategy}</p>;

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {points.map((point, idx) => {
          const cleanPoint = point.replace(/^\*\s*/, '');
          const [title, ...desc] = cleanPoint.split(':');
          return (
            <div key={idx} className="bg-white/5 border border-white/10 p-6 rounded-[1.5rem] backdrop-blur-md hover:bg-white/10 transition-all group">
               <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center text-xs font-black shadow-lg group-hover:scale-110 transition-transform">0{idx+1}</div>
                  <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-tight">{title.replace(/\*\*/g, '')}</div>
               </div>
               <p className="text-[11px] font-bold text-slate-300 leading-relaxed">{desc.join(':').trim() || "Menganalisis data harian..."}</p>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4 md:space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase leading-none">Dashboard Hulio Group</h2>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-2 flex items-center gap-2">
            <Calendar size={12}/> Analisis Sistem iPOS 5 Pro
          </p>
        </div>
        <div className="flex bg-slate-200/50 p-1 rounded-xl border border-slate-300 shadow-inner">
          {['today', '7days', '1month'].map((id) => (
            <button key={id} onClick={() => setRange(id as any)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${range === id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{id.toUpperCase()}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard icon={<TrendingUp size={22}/>} label="Total Omzet" value={metrics.totalOmzet} trend={range.toUpperCase()} color="bg-blue-600" />
        <StatCard icon={<ShoppingBag size={22}/>} label="Total Sales" value={metrics.salesCount} trend="VOLUME" color="bg-emerald-600" />
        <StatCard icon={<PackageCheck size={22}/>} label="Item Keluar" value={metrics.itemsOut} trend="STOCK" color="bg-orange-600" />
        <StatCard icon={<Users size={22}/>} label="Pelanggan" value={metrics.customersCount} trend="ASET" color="bg-purple-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-white p-6 rounded-[2rem] border-2 border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <Wallet className="text-emerald-600" size={20} />
            <h3 className="font-black text-slate-900 uppercase text-sm">Shift Kasir</h3>
          </div>
          {openCashSession ? (
            <>
              <div className="text-[11px] font-bold text-slate-500 uppercase">Shift aktif sejak {new Date(openCashSession.openedAt).toLocaleString('id-ID')}</div>
              <div className="text-sm font-black text-slate-900">Modal awal Rp {openCashSession.openingCash.toLocaleString()}</div>
              <button onClick={() => setShowShiftModal(true)} className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-xs uppercase tracking-widest mt-2 active:scale-95 transition-all shadow-md">Tutup Shift</button>
            </>
          ) : (
            <>
              <div className="text-[11px] font-bold text-slate-500 uppercase">Belum ada shift aktif</div>
              <div className="text-sm font-black text-slate-400">Siap berjualan hari ini?</div>
              <button onClick={() => setShowShiftModal(true)} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-widest mt-2 active:scale-95 transition-all shadow-md">Buka Shift Kasir</button>
            </>
          )}

          {showShiftModal && (
            <ShiftManagementModal 
               currentUser={currentUser} 
               activeSession={openCashSession || undefined} 
               onClose={() => setShowShiftModal(false)}
               onStartShift={(cash) => { onOpenCashSession(cash); setShowShiftModal(false); }}
               onEndShift={(cash, notes) => { onCloseCashSession(cash, notes); setShowShiftModal(false); }}
            />
          )}
        </div>

        <div className="bg-white p-6 rounded-[2rem] border-2 border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="text-red-600" size={20} />
            <h3 className="font-black text-slate-900 uppercase text-sm">Alert Operasional</h3>
          </div>
          <div className="text-sm font-black text-slate-900">Stok minimum: {lowStockItems.length} SKU</div>
          <div className="text-sm font-black text-slate-900">Hutang supplier: Rp {payableSummary.toLocaleString()}</div>
          <div className="space-y-2">
            {lowStockItems.length === 0 ? (
              <div className="text-xs font-bold text-slate-400 uppercase">Tidak ada stok kritis</div>
            ) : lowStockItems.map(item => (
              <div key={item.id} className="flex items-center justify-between bg-red-50 rounded-xl px-3 py-2">
                <span className="font-bold text-xs text-slate-800 uppercase">{item.name}</span>
                <span className="font-black text-red-600 text-xs">{item.stock}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border-2 border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <ClipboardList className="text-blue-600" size={20} />
            <h3 className="font-black text-slate-900 uppercase text-sm">Mutasi Terakhir</h3>
          </div>
          <div className="space-y-2">
            {movementSummary.length === 0 ? (
              <div className="text-xs font-bold text-slate-400 uppercase">Belum ada mutasi stok</div>
            ) : movementSummary.map(movement => (
              <div key={movement.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                <span className="font-bold text-xs text-slate-800 uppercase">{movement.itemName}</span>
                <span className={`font-black text-xs ${movement.direction === 'OUT' ? 'text-red-600' : 'text-emerald-600'}`}>{movement.direction === 'OUT' ? '-' : '+'}{movement.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border-2 border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between mb-8">
           <div className="flex items-center gap-4">
              <div className="p-4 bg-indigo-600 text-white rounded-2xl shadow-xl"><BarChart3 size={24}/></div>
              <div>
                 <h3 className="text-sm md:text-xl font-black text-slate-800 uppercase tracking-tighter">BUSINESS INSIGHT ANALYTICS</h3>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Intelligence Module • Berdasarkan Data Periode Ini</p>
              </div>
           </div>
           {aiStrategy && aiStrategy !== 'AI_MISSING' && !isAiLoading && (
             <button onClick={fetchAiStrategy} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors" title="Refresh Analisis">
               <RefreshCw size={18}/>
             </button>
           )}
        </div>
        
        {isAiLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="animate-spin text-indigo-600" size={40} />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">H-AI sedang menganalisis data riil bisnis...</p>
          </div>
        ) : (
          <div className="p-6 md:p-8 bg-slate-900 rounded-[2rem] shadow-2xl border-t-8 border-indigo-600">
            <div className="flex items-center gap-3 mb-6">
              <Sparkles className="text-indigo-400" size={20} />
            <h4 className="text-xs font-black text-white uppercase tracking-widest">H-AI Strategic Recommendations</h4>
            </div>
            {renderAiContent()}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
