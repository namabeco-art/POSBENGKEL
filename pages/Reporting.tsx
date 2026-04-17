import React, { useState, useMemo } from 'react';
/* Added missing icons to imports */
import { 
  FileText, Download, Printer, PieChart, TrendingUp, 
  Package, DollarSign, Users, Calendar, Filter, 
  Search, FileSpreadsheet, X, Clock, Info, ChevronRight,
  ChevronDown, ArrowUpRight, ArrowDownRight, LayoutDashboard,
  BarChart3, AlertCircle, Sparkles, Receipt, Hash, CreditCard, User as UserIcon, Wallet, Landmark,
  Notebook, Layers, ShieldCheck, RefreshCw, ArrowDownLeft, AlertTriangle
} from 'lucide-react';
import { Item, Customer, Supplier, Account, Sale, PurchaseOrder } from '../types';
import { printSimpleReport, exportToExcel } from '../services/printService';

interface ReportingProps {
  items: Item[];
  customers: Customer[];
  suppliers: Supplier[];
  accounts: Account[];
  sales: Sale[];
  purchaseOrders: PurchaseOrder[];
  onAnalyzeWithAI?: () => void;
}

const Reporting: React.FC<ReportingProps> = ({ items, customers, suppliers, accounts, sales, purchaseOrders, onAnalyzeWithAI }) => {
  const [activeReport, setActiveReport] = useState<'stok' | 'penjualan' | 'kas' | 'buku'>('stok');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Helper to parse DD/MM/YYYY string to Date
  const parseDate = (dateStr: string) => {
    const parts = dateStr.split(' ')[0].split('/');
    return new Date(+parts[2], +parts[1] - 1, +parts[0]);
  };

  // Helper to calculate profit for a sale
  const calculateSaleProfit = (sale: Sale) => {
    return sale.items.reduce((totalProfit, saleItem) => {
      const masterItem = items.find(i => i.id === saleItem.itemId);
      const costPrice = masterItem ? masterItem.basePrice : 0;
      const itemProfit = (saleItem.price - costPrice) * saleItem.qty;
      return totalProfit + itemProfit;
    }, 0);
  };

  // 1. Data Aggregation for Stock Report
  const stockMetrics = useMemo(() => {
    const totalValuation = items.reduce((s, i) => s + (i.basePrice * i.stock), 0);
    const totalPotentialRevenue = items.reduce((s, i) => s + (i.memberPrices[0] * i.stock), 0);
    const criticallyLow = items.filter(i => i.stock < 10).length;
    const stagnantItems = items.filter(i => i.stock > 100).length; // Barang jarang laku
    return { totalValuation, totalPotentialRevenue, criticallyLow, stagnantItems };
  }, [items]);

  // 2. Data Aggregation for Sales Report
  const salesMetrics = useMemo(() => {
    const revenue = sales.reduce((sum, x) => sum + x.total, 0);
    const count = sales.length;
    const cashShare = sales.filter(s => s.paymentType === 'TUNAI').reduce((sum, x) => sum + x.total, 0);
    const nonCashShare = revenue - cashShare;
    const totalProfit = sales.reduce((sum, s) => sum + calculateSaleProfit(s), 0);
    return { revenue, count, cashShare, nonCashShare, totalProfit };
  }, [sales, items]);

  // 3. Data Aggregation for Cash/Bank Report
  const cashMetrics = useMemo(() => {
    const bankAccounts = accounts.filter(a => a.name.toLowerCase().includes('bank') || a.name.toLowerCase().includes('kas'));
    const totalBalance = bankAccounts.reduce((sum, a) => sum + a.balance, 0);
    return { bankAccounts, totalBalance };
  }, [accounts]);

  // 4. Data Aggregation for Ledgers (Buku Hutang/Piutang)
  const ledgerMetrics = useMemo(() => {
    const totalReceivable = customers.reduce((sum, c) => sum + c.currentDebt, 0);
    const totalPayable = purchaseOrders.filter(po => !po.isPaid).reduce((sum, po) => sum + (po.total - (po.paidAmount || 0)), 0);
    return { totalReceivable, totalPayable };
  }, [customers, purchaseOrders]);

  const categories = [
    { id: 'stok', label: 'Persediaan', icon: <Package size={18}/>, desc: 'Aset Barang' },
    { id: 'penjualan', label: 'Sales & Laba', icon: <TrendingUp size={18}/>, desc: 'Pencapaian' },
    { id: 'kas', label: 'Kas & Bank', icon: <Landmark size={18}/>, desc: 'Likuiditas' },
    { id: 'buku', label: 'Buku Besar', icon: <Notebook size={18}/>, desc: 'Hutang/Piutang' }
  ];

  const getFilteredData = () => {
    let baseData: any[] = [];
    switch (activeReport) {
      case 'stok': baseData = items; break;
      case 'penjualan': baseData = sales; break;
      case 'kas': baseData = accounts.filter(a => a.type === 'ASSET' && (a.name.includes('Kas') || a.name.includes('Bank'))); break;
      case 'buku': baseData = customers; break;
    }

    return baseData.filter(item => {
      // Search Filter
      const searchLower = searchTerm.toLowerCase();
      let matchesSearch = true;
      if (activeReport === 'stok') matchesSearch = item.name.toLowerCase().includes(searchLower) || item.code.toLowerCase().includes(searchLower);
      if (activeReport === 'penjualan') matchesSearch = item.invoiceNo.toLowerCase().includes(searchLower) || item.customerName.toLowerCase().includes(searchLower);
      if (activeReport === 'kas') matchesSearch = item.name.toLowerCase().includes(searchLower) || item.code.toLowerCase().includes(searchLower);
      if (activeReport === 'buku') matchesSearch = item.name.toLowerCase().includes(searchLower);

      // Date Filter (Hanya jika item memiliki properti date)
      let matchesDate = true;
      if (item.date && (startDate || endDate)) {
        const itemDate = parseDate(item.date);
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (itemDate < start) matchesDate = false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (itemDate > end) matchesDate = false;
        }
      }

      return matchesSearch && matchesDate;
    });
  };

  const getReportData = () => {
    let title = '';
    let columns: string[] = [];
    let data: any[][] = [];
    const filtered = getFilteredData();

    switch (activeReport) {
      case 'stok':
        title = 'Laporan Persediaan Barang';
        columns = ['Kode', 'Nama Barang', 'Harga Beli', 'Stok', 'Nilai Aset'];
        data = (filtered as Item[]).map(i => [i.code, i.name, i.basePrice, i.stock, i.basePrice * i.stock]);
        break;
      case 'penjualan':
        title = 'Laporan Penjualan & Laba';
        columns = ['No Faktur', 'Tanggal', 'Pelanggan', 'Total Omzet', 'Total Laba', 'Metode'];
        data = (filtered as Sale[]).map(s => {
          const profit = calculateSaleProfit(s);
          return [s.invoiceNo, s.date, s.customerName, s.total, profit, s.paymentType];
        });
        break;
      case 'kas':
        title = 'Laporan Saldo Kas & Bank';
        columns = ['Kode Akun', 'Nama Perkiraan', 'Saldo Terakhir'];
        data = (filtered as Account[]).map(a => [a.code, a.name, a.balance]);
        break;
      case 'buku':
        title = 'Laporan Piutang Pelanggan';
        columns = ['Nama Pelanggan', 'Sisa Hutang', 'Limit Kredit'];
        data = (filtered as Customer[]).map(c => [c.name, c.currentDebt, c.creditLimit]);
        break;
    }
    return { title, columns, data };
  };

  const handlePrintReport = () => {
    const { title, columns, data } = getReportData();
    const formattedData = data.map(row => row.map((cell, idx) => {
      if (typeof cell === 'number') {
        if (activeReport === 'stok' && columns[idx] === 'Stok') return `${cell} Unit`;
        return `Rp ${cell.toLocaleString()}`;
      }
      return cell;
    }));
    printSimpleReport(title, columns, formattedData);
  };

  const handleExportExcel = () => {
    const { title, columns, data } = getReportData();
    exportToExcel(title, columns, data);
  };

  const SummaryCard = ({ label, value, icon, color, subText }: any) => (
    <div className="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm flex flex-col justify-between hover:border-blue-400 transition-all group overflow-hidden">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3.5 rounded-2xl text-white ${color} shadow-lg shrink-0 group-hover:scale-110 transition-transform`}>{icon}</div>
        {subText && <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{subText}</span>}
      </div>
      <div>
        <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{label}</div>
        <div className="text-base md:text-lg font-black text-slate-900 tracking-tighter truncate">{value}</div>
      </div>
    </div>
  );

  const filteredData = getFilteredData();

  return (
    <div className="space-y-8 pb-32 animate-in fade-in duration-500">
      {/* Header Report */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-slate-900 text-white rounded-3xl shadow-xl border-4 border-white shrink-0"><BarChart3 size={32}/></div>
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Pusat Laporan</h2>
            <p className="text-slate-400 font-bold uppercase text-[9px] md:text-[10px] tracking-[0.2em] mt-2 flex items-center gap-2">
              <Sparkles size={14} className="text-indigo-500 animate-pulse"/> Hulio Group Intelligence Sync
            </p>
          </div>
        </div>
        <div className="flex gap-3 w-full lg:w-auto overflow-x-auto pb-2 scrollbar-hide">
          <button onClick={onAnalyzeWithAI} className="flex items-center justify-center gap-2 px-6 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all active:scale-95 shadow-md whitespace-nowrap"><Sparkles size={16}/> ANALISIS AI</button>
          <button onClick={handlePrintReport} className="flex items-center justify-center gap-2 px-6 py-4 bg-white border-2 border-slate-300 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-700 hover:bg-slate-50 transition-all whitespace-nowrap"><Printer size={16}/> CETAK</button>
          <button onClick={handleExportExcel} className="flex items-center justify-center gap-2 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg whitespace-nowrap"><Download size={16}/> EXCEL</button>
        </div>
      </div>

      {/* Tabs Professional */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => { setActiveReport(cat.id as any); setStartDate(''); setEndDate(''); }}
            className={`p-4 md:p-6 rounded-[2rem] border-4 transition-all text-left flex flex-col md:flex-row items-center gap-4 ${
              activeReport === cat.id 
                ? 'bg-slate-900 border-blue-500 text-white shadow-2xl scale-[1.02]' 
                : 'bg-white border-slate-50 text-slate-500 hover:border-slate-200'
            }`}
          >
            <div className={`p-3 rounded-2xl shrink-0 ${activeReport === cat.id ? 'bg-white/10' : 'bg-slate-100'}`}>{cat.icon}</div>
            <div className="min-w-0 text-center md:text-left">
               <div className="font-black text-[10px] md:text-xs uppercase tracking-tight truncate">{cat.label}</div>
               <div className={`text-[8px] font-bold uppercase tracking-widest truncate ${activeReport === cat.id ? 'text-indigo-300' : 'text-slate-400'}`}>{cat.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {activeReport === 'stok' && (
          <>
            <SummaryCard label="Nilai Inventory (HPP)" value={`Rp ${stockMetrics.totalValuation.toLocaleString()}`} icon={<Package/>} color="bg-indigo-600" subText="ASET AKTIF"/>
            <SummaryCard label="Estimasi Omzet" value={`Rp ${stockMetrics.totalPotentialRevenue.toLocaleString()}`} icon={<TrendingUp/>} color="bg-emerald-600" subText="POTENSIAL"/>
            <SummaryCard label="Item Kritis" value={`${stockMetrics.criticallyLow} SKU`} icon={<AlertCircle/>} color="bg-red-600" subText="BUTUH PO"/>
            <SummaryCard label="Stok Berlebih" value={`${stockMetrics.stagnantItems} SKU`} icon={<Layers/>} color="bg-orange-600" subText="SLOW MOVING"/>
          </>
        )}
        {activeReport === 'penjualan' && (
          <>
            <SummaryCard label="Total Omzet" value={`Rp ${salesMetrics.revenue.toLocaleString()}`} icon={<DollarSign/>} color="bg-blue-700" subText="BRUTO"/>
            <SummaryCard label="Total Profit" value={`Rp ${salesMetrics.totalProfit.toLocaleString()}`} icon={<ArrowUpRight/>} color="bg-emerald-700" subText="REAL PROFIT"/>
            <SummaryCard label="Volume" value={`${salesMetrics.count} Faktur`} icon={<FileText/>} color="bg-purple-600" subText="TRANSAKSI"/>
            <SummaryCard label="Tunai / Non-Tunai" value={`${Math.round(salesMetrics.cashShare/(salesMetrics.revenue || 1)*100)}% / ${Math.round(salesMetrics.nonCashShare/(salesMetrics.revenue || 1)*100)}%`} icon={<CreditCard/>} color="bg-slate-900" subText="METODE BAYAR"/>
          </>
        )}
        {activeReport === 'kas' && (
          <>
            <SummaryCard label="Saldo Gabungan" value={`Rp ${cashMetrics.totalBalance.toLocaleString()}`} icon={<Landmark/>} color="bg-blue-600" subText="CASH ON HAND"/>
            <SummaryCard label="Jumlah Akun" value={`${cashMetrics.bankAccounts.length} Akun`} icon={<Hash/>} color="bg-slate-800" subText="BANK & KAS"/>
            <SummaryCard label="Alokasi Kas" value="Induk" icon={<ShieldCheck/>} color="bg-indigo-500" subText="HIERARKI"/>
            <SummaryCard label="Mutasi" value="Live" icon={<RefreshCw/>} color="bg-emerald-600" subText="SYNCED"/>
          </>
        )}
        {activeReport === 'buku' && (
          <>
            <SummaryCard label="Total Piutang" value={`Rp ${ledgerMetrics.totalReceivable.toLocaleString()}`} icon={<ArrowDownLeft/>} color="bg-emerald-600" subText="DARI PELANGGAN"/>
            <SummaryCard label="Total Hutang" value={`Rp ${ledgerMetrics.totalPayable.toLocaleString()}`} icon={<ArrowUpRight/>} color="bg-red-600" subText="KE SUPPLIER"/>
            <SummaryCard label="Debt Ratio" value={`${Math.round(ledgerMetrics.totalPayable / (ledgerMetrics.totalReceivable || 1) * 100)}%`} icon={<PieChart/>} color="bg-slate-900" subText="HEALTH CHECK"/>
            <SummaryCard label="Limit Terpakai" value="Medium" icon={<AlertTriangle/>} color="bg-orange-600" subText="RISIKO"/>
          </>
        )}
      </div>

      {/* Detail Table */}
      <div className="bg-white rounded-[2rem] md:rounded-[3rem] border-2 md:border-4 border-slate-100 shadow-2xl overflow-hidden">
        <div className="p-6 md:p-8 bg-slate-50 border-b-2 border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
           <div className="flex items-center gap-3">
              <div className="p-2.5 bg-slate-900 text-white rounded-xl shadow-lg"><Hash size={18}/></div>
              <h4 className="font-black text-slate-800 uppercase tracking-tighter text-sm md:text-lg">Detailed Breakdown</h4>
           </div>
           <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-2 bg-white border-2 border-slate-200 rounded-xl px-3 py-1 shadow-sm">
                <Calendar size={14} className="text-slate-400" />
                <input 
                  type="date" 
                  className="text-[10px] font-bold outline-none bg-transparent"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
                <span className="text-slate-300 font-bold">-</span>
                <input 
                  type="date" 
                  className="text-[10px] font-bold outline-none bg-transparent"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                <input 
                  className="w-full pl-11 pr-4 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-xs font-black outline-none focus:border-blue-600"
                  placeholder="Cari data..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
           </div>
        </div>

        <div className="overflow-x-auto scrollbar-hide">
           <table className="w-full text-[10px] md:text-xs">
              <thead className="bg-slate-50 border-b-2 border-slate-200 text-left">
                 <tr className="whitespace-nowrap">
                    {activeReport === 'stok' && (
                      <>
                        <th className="px-8 py-6 font-black text-slate-400 uppercase tracking-widest">Barang</th>
                        <th className="px-8 py-6 font-black text-slate-400 uppercase tracking-widest text-right">HPP</th>
                        <th className="px-8 py-6 font-black text-slate-400 uppercase tracking-widest text-right">Stok</th>
                        <th className="px-8 py-6 font-black text-slate-400 uppercase tracking-widest text-right">Nilai Aset</th>
                      </>
                    )}
                    {activeReport === 'penjualan' && (
                      <>
                        <th className="px-8 py-6 font-black text-slate-400 uppercase tracking-widest">No Faktur</th>
                        <th className="px-8 py-6 font-black text-slate-400 uppercase tracking-widest">Waktu</th>
                        <th className="px-8 py-6 font-black text-slate-400 uppercase tracking-widest">Pelanggan</th>
                        <th className="px-8 py-6 font-black text-slate-400 uppercase tracking-widest text-right">Omzet</th>
                        <th className="px-8 py-6 font-black text-slate-400 uppercase tracking-widest text-right">Laba</th>
                        <th className="px-8 py-6 font-black text-slate-400 uppercase tracking-widest text-center">Metode</th>
                      </>
                    )}
                    {activeReport === 'kas' && (
                      <>
                        <th className="px-8 py-6 font-black text-slate-400 uppercase tracking-widest">Kode Akun</th>
                        <th className="px-8 py-6 font-black text-slate-400 uppercase tracking-widest">Nama Perkiraan</th>
                        <th className="px-8 py-6 font-black text-slate-400 uppercase tracking-widest text-right">Saldo Saat Ini</th>
                        <th className="px-8 py-6 font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                      </>
                    )}
                    {activeReport === 'buku' && (
                      <>
                        <th className="px-8 py-6 font-black text-slate-400 uppercase tracking-widest">Kontak / Entitas</th>
                        <th className="px-8 py-6 font-black text-slate-400 uppercase tracking-widest text-right">Hutang</th>
                        <th className="px-8 py-6 font-black text-slate-400 uppercase tracking-widest text-right">Piutang</th>
                        <th className="px-8 py-6 font-black text-slate-400 uppercase tracking-widest text-center">Limit</th>
                      </>
                    )}
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                 {activeReport === 'stok' && (filteredData as Item[]).map(i => (
                   <tr key={i.id} className="hover:bg-slate-50">
                      <td className="px-8 py-5 min-w-[200px]"><div className="uppercase font-black leading-tight">{i.name}</div><div className="text-[9px] text-slate-400 font-mono mt-1">{i.code}</div></td>
                      <td className="px-8 py-5 text-right">Rp {i.basePrice.toLocaleString()}</td>
                      <td className="px-8 py-5 text-right"><span className={i.stock < 10 ? 'text-red-600' : 'text-blue-700'}>{i.stock} Unit</span></td>
                      <td className="px-8 py-5 text-right font-black text-slate-900">Rp {(i.basePrice * i.stock).toLocaleString()}</td>
                   </tr>
                 ))}
                 {activeReport === 'penjualan' && (filteredData as Sale[]).map(s => (
                   <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-8 py-5 font-black text-blue-700">{s.invoiceNo}</td>
                      <td className="px-8 py-5 text-slate-400">{s.date}</td>
                      <td className="px-8 py-5 uppercase">{s.customerName}</td>
                      <td className="px-8 py-5 text-right text-slate-900">Rp {s.total.toLocaleString()}</td>
                      <td className="px-8 py-5 text-right text-emerald-600">Rp {calculateSaleProfit(s).toLocaleString()}</td>
                      <td className="px-8 py-5 text-center"><span className="bg-slate-100 px-2 py-0.5 rounded text-[8px] font-black uppercase">{s.paymentType}</span></td>
                   </tr>
                 ))}
                 {activeReport === 'kas' && (filteredData as Account[]).filter(a => a.type === 'ASSET' && (a.name.includes('Kas') || a.name.includes('Bank'))).map(a => (
                   <tr key={a.code} className="hover:bg-slate-50">
                      <td className="px-8 py-5 font-mono text-indigo-600">{a.code}</td>
                      <td className="px-8 py-5 uppercase font-black">{a.name}</td>
                      <td className="px-8 py-5 text-right text-slate-900 text-sm">Rp {a.balance.toLocaleString()}</td>
                      <td className="px-8 py-5 text-center"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span></td>
                   </tr>
                 ))}
                 {activeReport === 'buku' && (filteredData as Customer[]).map(c => (
                   <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-8 py-5 uppercase font-black">{c.name} <span className="text-[8px] text-slate-400 ml-2">(PELANGGAN)</span></td>
                      <td className="px-8 py-5 text-right text-slate-300">-</td>
                      <td className="px-8 py-5 text-right text-red-600">Rp {c.currentDebt.toLocaleString()}</td>
                      <td className="px-8 py-5 text-center"><span className="text-slate-400 text-[9px]">Limit: Rp {c.creditLimit.toLocaleString()}</span></td>
                   </tr>
                 ))}
              </tbody>
           </table>
        </div>
      </div>
    </div>
  );
};

export default Reporting;
