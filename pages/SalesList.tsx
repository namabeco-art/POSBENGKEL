import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Eye, 
  Printer, 
  X, 
  Calendar, 
  Filter, 
  FileText, 
  User as UserIcon, 
  CreditCard, 
  Banknote,
  ChevronRight,
  ArrowRight,
  RotateCcw,
  Clock,
  Hash,
  ArrowRightLeft
} from 'lucide-react';
import { Sale } from '../types';
import { printReceipt } from '../services/printService';

interface SalesListProps {
  sales: Sale[];
  onInitiateReturn?: (invoiceNo: string) => void;
}

const SalesList: React.FC<SalesListProps> = ({ sales, onInitiateReturn }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [filterType, setFilterType] = useState<'SEMUA' | 'TUNAI' | 'NON-TUNAI'>('SEMUA');
  
  // Date filter states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      const matchesSearch = s.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           s.customerName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = filterType === 'SEMUA' || s.paymentType === filterType;
      
      // Date filter logic
      let matchesDate = true;
      if (startDate || endDate) {
        // Parsing date format DD/MM/YYYY HH:mm:ss to Date object
        const parts = s.date.split(' ')[0].split('/');
        const saleDate = new Date(+parts[2], +parts[1] - 1, +parts[0]);
        
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0,0,0,0);
          if (saleDate < start) matchesDate = false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23,59,59,999);
          if (saleDate > end) matchesDate = false;
        }
      }

      return matchesSearch && matchesFilter && matchesDate;
    });
  }, [sales, searchTerm, filterType, startDate, endDate]);

  const resetFilters = () => {
    setSearchTerm('');
    setFilterType('SEMUA');
    setStartDate('');
    setEndDate('');
  };

  const handlePrint = () => {
    if (selectedSale) {
      printReceipt(selectedSale);
    }
  };

  return (
    <div className="space-y-6">
      {/* FILTER HEADER */}
      <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
         <div className="flex flex-col xl:flex-row gap-6">
            {/* Search Input */}
            <div className="flex-1 relative">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
               <input 
                 type="text" 
                 placeholder="Cari No. Invoice atau Nama Pelanggan..."
                 className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-2xl text-xs md:text-sm font-black text-slate-800 focus:border-blue-700 focus:bg-white outline-none transition-all shadow-inner"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
            </div>

            {/* Date Range Inputs */}
            <div className="flex flex-col sm:flex-row gap-4 items-end">
               <div className="w-full sm:w-auto space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">MULAI TANGGAL</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                    <input 
                      type="date"
                      className="w-full sm:w-[180px] pl-11 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl font-bold text-[11px] outline-none focus:border-blue-600 cursor-pointer"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                    />
                  </div>
               </div>
               <div className="hidden sm:flex items-center justify-center pb-3 text-slate-300">
                  <ArrowRightLeft size={16}/>
               </div>
               <div className="w-full sm:w-auto space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">SAMPAI TANGGAL</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                    <input 
                      type="date"
                      className="w-full sm:w-[180px] pl-11 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl font-bold text-[11px] outline-none focus:border-blue-600 cursor-pointer"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                    />
                  </div>
               </div>
            </div>
         </div>

         <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <div className="flex bg-slate-200/50 p-1 rounded-xl border border-slate-300 shadow-inner overflow-x-auto scrollbar-hide max-w-full">
               {['SEMUA', 'TUNAI', 'NON-TUNAI'].map(type => (
                 <button
                   key={type}
                   onClick={() => setFilterType(type as any)}
                   className={`px-6 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                     filterType === type ? 'bg-white text-blue-700 shadow-md' : 'text-slate-500 hover:text-slate-700'
                   }`}
                 >
                   {type}
                 </button>
               ))}
            </div>

            <button 
              onClick={resetFilters}
              className="px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all active:scale-95 shadow-lg"
            >
               Reset Filter
            </button>
         </div>
      </div>

      <div className="bg-white rounded-[1.5rem] md:rounded-[2rem] border border-slate-200 shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-left">
              <tr>
                <th className="px-5 md:px-8 py-4 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Faktur</th>
                <th className="hidden md:table-cell px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Waktu</th>
                <th className="px-5 md:px-8 py-4 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Pelanggan</th>
                <th className="px-5 md:px-8 py-4 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Total</th>
                <th className="hidden lg:table-cell px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">Metode</th>
                <th className="px-5 md:px-8 py-4 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.map(sale => (
                <tr key={sale.id} className="hover:bg-blue-50/50 transition-colors group">
                  <td className="px-5 md:px-8 py-4 md:py-5">
                    <button 
                      onClick={() => setSelectedSale(sale)}
                      className="font-black text-blue-700 text-xs md:text-base leading-tight hover:underline cursor-pointer"
                    >
                      {sale.invoiceNo}
                    </button>
                    <div className="md:hidden text-[8px] font-bold text-slate-400 uppercase mt-0.5">{sale.date}</div>
                    <div className="hidden md:block text-[9px] font-bold text-slate-400 uppercase mt-0.5 tracking-widest">OP: {sale.operatorName}</div>
                  </td>
                  <td className="hidden md:table-cell px-8 py-5">
                    <div className="flex items-center gap-2 text-slate-600 font-bold text-xs">
                      <Calendar size={14} className="text-slate-300" />
                      {sale.date}
                    </div>
                  </td>
                  <td className="px-5 md:px-8 py-4 md:py-5">
                    <div className="font-black text-slate-800 uppercase tracking-tight text-[10px] md:text-sm truncate max-w-[100px] md:max-w-none">{sale.customerName}</div>
                    <div className="md:hidden text-[8px] font-black text-blue-500 uppercase mt-0.5">{sale.paymentType}</div>
                  </td>
                  <td className="px-5 md:px-8 py-4 md:py-5 text-right">
                    <div className="font-black text-slate-900 text-xs md:text-base tracking-tighter">Rp {sale.total.toLocaleString()}</div>
                  </td>
                  <td className="hidden lg:table-cell px-8 py-5">
                    <div className="flex justify-center">
                       <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-2 border ${
                         sale.paymentType === 'TUNAI' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'
                       }`}>
                         {sale.paymentType === 'TUNAI' ? <Banknote size={12}/> : <CreditCard size={12}/>}
                         {sale.paymentMethod || sale.paymentType}
                       </span>
                    </div>
                  </td>
                  <td className="px-5 md:px-8 py-4 md:py-5">
                    <div className="flex justify-center gap-1.5 md:gap-2">
                      <button 
                        onClick={() => setSelectedSale(sale)}
                        className="p-2 md:p-2.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-blue-100 shadow-sm"
                      >
                        <Eye size={16} />
                      </button>
                      <button 
                        onClick={() => onInitiateReturn && onInitiateReturn(sale.invoiceNo)}
                        className="p-2 md:p-2.5 text-orange-600 hover:bg-orange-50 rounded-xl transition-all border border-orange-100 flex items-center gap-2"
                      >
                        <RotateCcw size={16} />
                        <span className="text-[9px] font-black uppercase hidden lg:inline">RETUR</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredSales.length === 0 && (
                <tr>
                   <td colSpan={6} className="py-24 text-center opacity-30 flex flex-col items-center gap-4">
                      <FileText size={60} />
                      <p className="font-black text-xs uppercase tracking-widest">Tidak ada transaksi ditemukan</p>
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSale && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[200] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-[2rem] md:rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-300 border-4 border-slate-100">
              {/* Modal Header */}
              <div className="p-5 md:p-8 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                 <div className="flex items-center gap-3 md:gap-4">
                    <div className="p-2 md:p-3 bg-blue-600 text-white rounded-xl md:rounded-2xl shadow-lg"><FileText size={20}/></div>
                    <div className="min-w-0">
                       <h3 className="text-base md:text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none truncate">{selectedSale.invoiceNo}</h3>
                       <p className="text-slate-400 font-bold text-[8px] md:text-[10px] uppercase tracking-widest mt-1.5 truncate">{selectedSale.date}</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedSale(null)} className="p-2 md:p-3 bg-slate-50 text-slate-400 rounded-xl md:rounded-2xl hover:bg-red-500 hover:text-white transition-all active:scale-90"><X size={20}/></button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-5 md:p-10 space-y-6 md:space-y-8 scrollbar-hide bg-slate-50/20">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                    <div className="bg-slate-50 p-5 md:p-6 rounded-[1.5rem] md:rounded-3xl border border-slate-200 space-y-2 md:space-y-3">
                       <div className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><UserIcon size={12}/> Info Pelanggan</div>
                       <div className="font-black text-slate-800 text-sm md:text-lg uppercase leading-tight">{selectedSale.customerName}</div>
                       <div className="text-[8px] md:text-[10px] font-bold text-blue-600 uppercase tracking-tight">OPERATOR: {selectedSale.operatorName}</div>
                    </div>
                    <div className="bg-slate-50 p-5 md:p-6 rounded-[1.5rem] md:rounded-3xl border border-slate-200 space-y-2 md:space-y-3">
                       <div className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><CreditCard size={12}/> Metode Bayar</div>
                       <div className="font-black text-slate-800 text-sm md:text-lg uppercase leading-tight flex items-center gap-2">
                         {selectedSale.paymentType} 
                         {selectedSale.paymentMethod && <span className="text-[10px] md:text-xs font-bold text-blue-500">({selectedSale.paymentMethod})</span>}
                       </div>
                       <div className="flex items-center justify-between pt-2 border-t border-slate-200/50">
                          <span className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase">Diterima</span>
                          <span className="font-bold text-slate-800 text-xs md:text-sm">Rp {selectedSale.amountReceived.toLocaleString()}</span>
                       </div>
                    </div>
                 </div>

                 {/* Items List */}
                 <div className="space-y-4">
                    <div className="flex items-center gap-2 ml-1">
                      <Hash size={14} className="text-slate-300"/>
                      <h4 className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Rincian Item Penjualan</h4>
                    </div>
                    <div className="space-y-2.5 md:space-y-3">
                       {selectedSale.items.map((item, idx) => (
                         <div key={idx} className="flex items-center justify-between p-4 md:p-5 bg-white border border-slate-200 rounded-[1.2rem] md:rounded-2xl hover:border-blue-300 transition-all shadow-sm group">
                            <div className="flex items-center gap-3 md:gap-4 min-w-0">
                               <div className="w-8 h-8 md:w-10 md:h-10 bg-slate-50 rounded-lg md:rounded-xl flex items-center justify-center font-black text-slate-400 text-[10px] md:text-xs border border-slate-100 group-hover:bg-blue-600 group-hover:text-white transition-colors">#{idx+1}</div>
                               <div className="min-w-0">
                                  <div className="font-black text-slate-800 uppercase tracking-tight text-xs md:text-sm truncate">{item.name}</div>
                                  <div className="text-[9px] font-bold text-slate-400 mt-0.5">{item.qty} Unit x Rp {item.price.toLocaleString()}</div>
                               </div>
                            </div>
                            <div className="font-black text-slate-900 text-xs md:text-lg tracking-tighter shrink-0 ml-3">Rp {item.total.toLocaleString()}</div>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>

              <div className="p-6 md:p-8 bg-slate-900 text-white shrink-0 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8 rounded-t-[2.5rem] md:rounded-t-[3rem] shadow-2xl relative">
                 <div className="flex flex-col items-center md:items-start text-center md:text-left">
                    <span className="text-[8px] md:text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1 leading-none">Netto Total Pembayaran</span>
                    <div className="text-2xl md:text-4xl font-black tracking-tighter">Rp {selectedSale.total.toLocaleString()}</div>
                 </div>
                 <div className="flex gap-3 w-full md:w-auto">
                    <button onClick={handlePrint} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 md:px-8 py-3.5 md:py-4 bg-blue-600 text-white rounded-xl md:rounded-2xl font-black text-xs hover:bg-blue-700 transition-all shadow-xl active:scale-95 uppercase border-b-4 border-blue-800">
                       <Printer size={18}/> CETAK NOTA
                    </button>
                    <button onClick={() => setSelectedSale(null)} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 md:px-8 py-3.5 md:py-4 bg-white/10 text-white rounded-xl md:rounded-2xl font-black text-xs hover:bg-white/20 transition-all border border-white/20 uppercase">
                       TUTUP
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default SalesList;