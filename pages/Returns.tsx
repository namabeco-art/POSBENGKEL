
import React, { useState, useEffect, useMemo } from 'react';
import { 
  RotateCcw, Search, User as UserIcon, Calendar, 
  Trash2, Plus, Minus, CheckCircle, X,
  AlertTriangle, Receipt, Info, PackageOpen, ArrowRight,
  History, ClipboardList, Clock, FileText, ChevronRight,
  ShoppingBag
} from 'lucide-react';
import { Sale, SaleReturn, ReturnItem, User } from '../types';

interface ReturnsProps {
  sales: Sale[];
  returns: SaleReturn[];
  currentUser: User;
  onCompleteReturn: (ret: SaleReturn) => void;
  onApproveReturn?: (returnId: string) => void;
  preselectedInvoiceNo?: string;
}

const Returns: React.FC<ReturnsProps> = ({ sales, returns, currentUser, onCompleteReturn, onApproveReturn, preselectedInvoiceNo }) => {
  const [activeSubTab, setActiveSubTab] = useState<'input' | 'log'>('input');
  const [invoiceSearch, setInvoiceSearch] = useState(preselectedInvoiceNo || '');
  const [logSearch, setLogSearch] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [returnItems, setReturnItems] = useState<{ [itemId: string]: { qty: number, reason: string } }>({});
  const [viewingReturnDetail, setViewingReturnDetail] = useState<SaleReturn | null>(null);

  useEffect(() => {
    if (preselectedInvoiceNo) {
      const found = sales.find(s => s.invoiceNo === preselectedInvoiceNo);
      if (found) {
        setInvoiceSearch(preselectedInvoiceNo);
        setSelectedSale(found);
        setActiveSubTab('input');
      }
    }
  }, [preselectedInvoiceNo, sales]);

  const handleSearchInvoice = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const found = sales.find(s => s.invoiceNo.toLowerCase() === invoiceSearch.toLowerCase());
    if (found) {
      setSelectedSale(found);
    } else {
      alert("Faktur tidak ditemukan! Mohon periksa kembali nomor invoice.");
    }
  };

  const updateReturnQty = (itemId: string, soldQty: number, delta: number) => {
    setReturnItems((prev: any) => {
      const current = prev[itemId]?.qty || 0;
      const next = Math.max(0, Math.min(soldQty, current + delta));
      if (next === 0) {
        const newState = { ...prev };
        delete newState[itemId];
        return newState;
      }
      return { ...prev, [itemId]: { ...prev[itemId], qty: next } };
    });
  };

  const updateReason = (itemId: string, reason: string) => {
    setReturnItems(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], reason }
    }));
  };

  const totalReturnAmount = useMemo(() => {
    if (!selectedSale) return 0;
    return (Object.entries(returnItems) as any).reduce((sum: number, [itemId, data]: any) => {
      const saleItem = selectedSale.items.find(i => i.itemId === itemId);
      return sum + (data.qty * (saleItem?.price || 0));
    }, 0);
  }, [selectedSale, returnItems]);

  const filteredReturns = useMemo(() => {
    return returns.filter(r => 
      r.returnNo.toLowerCase().includes(logSearch.toLowerCase()) || 
      r.originalInvoiceNo.toLowerCase().includes(logSearch.toLowerCase()) ||
      r.customerName.toLowerCase().includes(logSearch.toLowerCase())
    );
  }, [returns, logSearch]);

  const handleSubmitReturn = () => {
    if (!selectedSale || Object.keys(returnItems).length === 0) return;

    const returnData: SaleReturn = {
      id: Math.random().toString(36).substr(2, 9),
      returnNo: `RET-${Date.now().toString().slice(-6)}`,
      originalInvoiceNo: selectedSale.invoiceNo,
      date: new Date().toLocaleDateString('id-ID') + ' ' + new Date().toLocaleTimeString('id-ID'),
      customerId: selectedSale.customerId,
      customerName: selectedSale.customerName,
      items: (Object.entries(returnItems) as any).map(([itemId, data]: any) => ({
        itemId,
        name: selectedSale.items.find(i => i.itemId === itemId)?.name || '',
        qty: data.qty,
        price: selectedSale.items.find(i => i.itemId === itemId)?.price || 0,
        reason: data.reason || 'Salah Beli / Rusak'
      })),
      totalReturn: totalReturnAmount,
      operatorName: currentUser.name
    };

    onCompleteReturn(returnData);
    setSelectedSale(null);
    setReturnItems({});
    setInvoiceSearch('');
    setActiveSubTab('log');
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-orange-600 text-white rounded-3xl shadow-xl shadow-orange-100 border-4 border-white"><RotateCcw size={32}/></div>
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Manajemen Retur</h2>
            <p className="text-slate-400 font-bold uppercase text-[9px] md:text-[10px] tracking-[0.2em] mt-2 flex items-center gap-2">
              <span className="text-orange-500">•</span> Audit & Pengembalian iPOS 5
            </p>
          </div>
        </div>

        <div className="flex bg-slate-200 p-1.5 rounded-2xl border-2 border-slate-300 shadow-inner w-full md:w-auto">
          <button 
            onClick={() => setActiveSubTab('input')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'input' ? 'bg-white text-orange-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Plus size={16}/> Input
          </button>
          <button 
            onClick={() => setActiveSubTab('log')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'log' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <History size={16}/> Log ({returns.length})
          </button>
        </div>
      </div>

      {activeSubTab === 'input' ? (
        <div className="space-y-8">
          <div className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] border-[4px] md:border-[6px] border-orange-200 shadow-2xl space-y-6 relative overflow-hidden">
            <div className="relative z-10">
              <label className="text-[10px] md:text-xs font-black text-slate-800 uppercase tracking-[0.2em] block mb-4 ml-1 md:ml-2">Cari Nomor Faktur Penjualan</label>
              <form onSubmit={handleSearchInvoice} className="flex flex-col md:flex-row gap-4">
                 <div className="relative flex-1">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input 
                      type="text" 
                      placeholder="Contoh: INV-123456..."
                      className="w-full pl-14 pr-4 py-4 md:py-5 bg-slate-50 border-4 border-slate-300 md:border-slate-400 rounded-2xl md:rounded-[2rem] outline-none focus:border-orange-600 font-black text-slate-800 transition-all text-xs md:text-sm placeholder:text-slate-300 shadow-inner"
                      value={invoiceSearch}
                      onChange={e => setInvoiceSearch(e.target.value)}
                    />
                 </div>
                 <button 
                   type="submit" 
                   className="w-full md:w-auto px-10 py-4 md:py-5 bg-slate-900 text-white rounded-2xl md:rounded-[1.5rem] font-black uppercase text-xs tracking-widest shadow-xl hover:bg-black transition-all active:scale-95"
                 >
                    Cari Faktur
                 </button>
              </form>
            </div>
          </div>

          {!selectedSale ? (
            <div className="space-y-6 animate-in fade-in duration-700">
               <div className="flex items-center gap-3 px-2">
                 <ShoppingBag size={20} className="text-slate-400"/>
                 <h4 className="font-black text-slate-800 uppercase tracking-tighter text-sm md:text-lg">Atau Pilih Dari Faktur Terakhir</h4>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sales.slice(0, 6).map(sale => (
                    <button 
                      key={sale.id}
                      onClick={() => {
                        setSelectedSale(sale);
                        setInvoiceSearch(sale.invoiceNo);
                      }}
                      className="bg-white p-5 rounded-[1.5rem] border-2 border-slate-200 hover:border-orange-500 hover:bg-orange-50/30 transition-all text-left flex flex-col justify-between gap-4 group shadow-sm active:scale-[0.98]"
                    >
                       <div>
                          <div className="flex justify-between items-start mb-2">
                             <span className="text-[10px] font-black text-blue-700 uppercase tracking-tighter bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">{sale.invoiceNo}</span>
                             <span className="text-[8px] font-bold text-slate-400 uppercase">{sale.date.split(' ')[0]}</span>
                          </div>
                          <div className="font-black text-slate-800 uppercase text-sm truncate mb-1">{sale.customerName}</div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Faktur: Rp {sale.total.toLocaleString()}</div>
                       </div>
                       <div className="flex items-center justify-between text-[9px] font-black text-orange-600 uppercase tracking-widest pt-3 border-t border-slate-100">
                          <span>Klik Untuk Pilih</span>
                          <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                       </div>
                    </button>
                  ))}
                  {sales.length === 0 && (
                    <div className="col-span-full py-20 text-center opacity-20 flex flex-col items-center gap-4">
                       <ShoppingBag size={60} />
                       <p className="font-black text-xs uppercase tracking-widest">Belum ada transaksi penjualan</p>
                    </div>
                  )}
               </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in slide-in-from-bottom-6 duration-500">
              <div className="lg:col-span-2 space-y-6">
                 <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] border-4 border-slate-200 shadow-xl overflow-hidden">
                    <div className="p-5 md:p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                       <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-blue-600 text-white rounded-xl"><PackageOpen size={20}/></div>
                          <h4 className="font-black text-slate-800 uppercase text-[10px] md:text-sm tracking-tight">Daftar Barang Faktur</h4>
                       </div>
                       <button onClick={() => setSelectedSale(null)} className="text-red-500 font-black text-[9px] uppercase hover:underline">Batal</button>
                    </div>
                    <div className="p-4 md:p-6 space-y-4">
                       {selectedSale.items.map(item => (
                         <div key={item.itemId} className="flex flex-col md:flex-row items-center justify-between p-4 md:p-5 bg-white border-2 border-slate-100 rounded-2xl md:rounded-3xl hover:border-orange-200 transition-all gap-4">
                            <div className="flex-1 min-w-0">
                               <div className="font-black text-slate-800 uppercase text-xs md:text-sm truncate">{item.name}</div>
                               <div className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Terjual: {item.qty} PCS @ Rp {item.price.toLocaleString()}</div>
                            </div>

                            <div className="flex items-center gap-4 md:gap-8 w-full md:w-auto justify-between">
                               <div className="flex flex-col items-center gap-1.5">
                                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Qty Retur</span>
                                  <div className="flex items-center bg-slate-100 p-1 rounded-xl border-2 border-slate-200 shadow-inner">
                                     <button onClick={() => updateReturnQty(item.itemId, item.qty, -1)} className="p-1.5 text-slate-400 hover:text-red-500 transition-all"><Minus size={14}/></button>
                                     <span className="w-10 text-center font-black text-slate-900 text-sm md:text-lg">{returnItems[item.itemId]?.qty || 0}</span>
                                     <button onClick={() => updateReturnQty(item.itemId, item.qty, 1)} className="p-1.5 text-slate-400 hover:text-blue-600 transition-all"><Plus size={14}/></button>
                                  </div>
                               </div>
                               
                               <div className="flex-1 md:flex-none">
                                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Alasan</label>
                                  <input 
                                    className="w-full md:w-40 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[9px] md:text-[10px] font-bold outline-none focus:border-orange-500"
                                    placeholder="Alasan..."
                                    value={returnItems[item.itemId]?.reason || ''}
                                    onChange={e => updateReason(item.itemId, e.target.value)}
                                  />
                               </div>
                            </div>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>

              <div className="space-y-6">
                 <div className="bg-slate-900 text-white p-6 md:p-8 rounded-[2.5rem] md:rounded-[3rem] shadow-2xl space-y-8 border-t-[8px] border-orange-600">
                    <div className="space-y-4">
                       <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                          <div className="p-2 bg-white/10 rounded-lg"><UserIcon size={20}/></div>
                          <div className="min-w-0">
                             <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">DATA PELANGGAN</div>
                             <div className="font-black text-sm md:text-base uppercase truncate leading-tight">{selectedSale.customerName}</div>
                          </div>
                       </div>
                    </div>

                    <div className="bg-white/5 p-5 md:p-6 rounded-3xl border border-white/10 space-y-4">
                       <div className="flex justify-between items-center text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400">
                          <span>Total Item Retur</span>
                          <span>{(Object.values(returnItems) as any).reduce((s: number, i: any) => s + i.qty, 0)} Pcs</span>
                       </div>
                       <div className="pt-4 border-t border-white/10 flex justify-between items-end">
                          <div className="flex flex-col">
                             <span className="text-[9px] md:text-[10px] font-black text-orange-500 uppercase tracking-widest leading-none mb-1">Total Dana Kembali</span>
                             <span className="text-2xl md:text-3xl font-black tracking-tighter">Rp {totalReturnAmount.toLocaleString()}</span>
                          </div>
                       </div>
                    </div>

                    <button 
                      disabled={totalReturnAmount === 0}
                      onClick={handleSubmitReturn}
                      className="w-full py-4 md:py-5 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black text-sm md:text-lg rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 border-b-8 border-orange-800 active:scale-95 uppercase tracking-widest"
                    >
                       <CheckCircle size={20}/> PROSES RETUR
                    </button>
                 </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in duration-500">
          <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
             <input 
               type="text" 
               placeholder="Cari no. retur, faktur, atau pelanggan..."
               className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-400 text-sm"
               value={logSearch}
               onChange={e => setLogSearch(e.target.value)}
             />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">No. Retur</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 hidden sm:table-cell">Faktur Asal</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Pelanggan</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Nilai</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-500">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-500">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReturns.map(ret => (
                    <tr key={ret.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                         <p className="font-medium text-slate-800 text-sm">{ret.returnNo}</p>
                         <p className="text-xs text-slate-400">{ret.date?.split(' ')[0]}</p>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                         <span className="text-xs text-indigo-600 font-medium">{ret.originalInvoiceNo}</span>
                      </td>
                      <td className="px-4 py-3">
                         <span className="text-sm text-slate-700">{ret.customerName}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-red-600">
                         Rp {ret.totalReturn.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                         <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ret.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                           {ret.status === 'APPROVED' ? 'Selesai' : 'Pending'}
                         </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                         <div className="flex justify-center gap-1">
                           <button onClick={() => setViewingReturnDetail(ret)} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-indigo-50 transition-all">
                              <FileText size={15}/>
                           </button>
                           {ret.status === 'PENDING' && onApproveReturn && (
                             <button onClick={() => onApproveReturn(ret.id)} className="px-2 py-1 bg-emerald-600 text-white rounded-md text-[10px] font-medium hover:bg-emerald-700">
                               Approve
                             </button>
                           )}
                         </div>
                      </td>
                    </tr>
                  ))}
                  {filteredReturns.length === 0 && (
                    <tr><td colSpan={6} className="py-12 text-center text-slate-400 text-sm">Belum ada riwayat retur</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Return Detail Modal */}
      {viewingReturnDetail && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[200] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-2xl rounded-[2.5rem] md:rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-300 border-4 border-slate-100">
              <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                 <div className="flex items-center gap-3 md:gap-4">
                    <div className="p-2 md:p-3 bg-orange-600 text-white rounded-xl md:rounded-2xl shadow-lg"><Receipt size={20}/></div>
                    <div className="min-w-0">
                       <h3 className="text-base md:text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none truncate">{viewingReturnDetail.returnNo}</h3>
                       <p className="text-slate-400 font-bold text-[8px] md:text-[10px] uppercase tracking-widest mt-1.5 truncate">{viewingReturnDetail.date}</p>
                    </div>
                 </div>
                 <button onClick={() => setViewingReturnDetail(null)} className="p-2.5 md:p-3 bg-slate-50 text-slate-400 rounded-xl md:rounded-2xl hover:bg-red-500 hover:text-white transition-all"><X size={20}/></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 md:space-y-8 scrollbar-hide">
                 <div className="bg-slate-50 p-5 md:p-6 rounded-[1.5rem] md:rounded-3xl border border-slate-200 space-y-3">
                    <div className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><UserIcon size={12}/> Pelanggan & Audit</div>
                    <div className="font-black text-slate-800 text-sm md:text-base uppercase leading-tight">{viewingReturnDetail.customerName}</div>
                    <div className="flex justify-between items-center pt-2 border-t border-slate-200/50">
                       <span className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase">Faktur Asal</span>
                       <span className="font-black text-blue-700 text-xs md:text-sm">{viewingReturnDetail.originalInvoiceNo}</span>
                    </div>
                 </div>

                 <div className="space-y-4">
                    <h4 className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Rincian Barang Retur</h4>
                    <div className="space-y-2">
                       {viewingReturnDetail.items.map((item, idx) => (
                         <div key={idx} className="p-4 md:p-5 bg-white border border-slate-200 rounded-[1.2rem] md:rounded-2xl hover:border-orange-300 transition-all shadow-sm">
                            <div className="flex items-center justify-between mb-2 gap-3">
                               <div className="font-black text-slate-800 uppercase tracking-tight text-xs md:text-sm truncate">{item.name}</div>
                               <div className="font-black text-red-600 text-xs md:text-sm whitespace-nowrap">Rp {(item.qty * item.price).toLocaleString()}</div>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                               <span className="text-[9px] md:text-[10px] font-bold text-slate-400 whitespace-nowrap">{item.qty} Pcs x Rp {item.price.toLocaleString()}</span>
                               <span className="bg-orange-50 text-orange-600 px-3 py-1 rounded-lg text-[8px] md:text-[9px] font-black uppercase tracking-widest border border-orange-100 truncate">Sebab: {item.reason}</span>
                            </div>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>

              <div className="p-6 md:p-8 bg-slate-900 text-white shrink-0 flex items-center justify-between gap-6 md:gap-8 rounded-t-[2.5rem] md:rounded-t-[3rem]">
                 <div className="flex flex-col">
                    <span className="text-[8px] md:text-[10px] font-black text-orange-500 uppercase tracking-widest mb-1 leading-none">Dana Dikembalikan</span>
                    <div className="text-2xl md:text-3xl font-black tracking-tighter">Rp {viewingReturnDetail.totalReturn.toLocaleString()}</div>
                 </div>
                 <button onClick={() => setViewingReturnDetail(null)} className="flex items-center gap-2 px-6 md:px-10 py-3.5 md:py-4 bg-white/10 text-white rounded-xl md:rounded-2xl font-black text-xs hover:bg-white/20 transition-all border border-white/20 uppercase tracking-widest">
                    TUTUP
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Returns;
