import React, { useState, useMemo } from 'react';
import { Account, Sale, CashSession } from '../types';
import { Calculator, BookOpen, Receipt, ArrowUpRight, ArrowDownLeft, Plus, X, Landmark, Wallet, FileText, DollarSign } from 'lucide-react';
import KasHarian from '../components/KasHarian';
import LaporanPajak from '../components/LaporanPajak';

interface AccountingProps {
  accounts: Account[];
  sales?: Sale[];
  cashSessions?: CashSession[];
}

const Accounting: React.FC<AccountingProps> = ({ accounts, sales = [], cashSessions = [] }) => {
  const [activeTab, setActiveTab] = useState<'coa' | 'kas-harian' | 'pajak'>('coa');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [journals, setJournals] = useState([
    { id: 1, date: '14 Nov 2024', desc: 'Biaya Listrik Kantor', amount: 450000, type: 'EXPENSE' },
    { id: 2, date: '14 Nov 2024', desc: 'Setoran Bank BCA', amount: 15000000, type: 'ASSET' }
  ]);
  const [newEntry, setNewEntry] = useState({ desc: '', amount: 0, account: '6-1100' });

  // Calculate today's cash sales for KasHarian
  const todayCashData = useMemo(() => {
    const today = new Date().toLocaleDateString('id-ID');
    const todaySales = sales.filter(s => s.date.startsWith(today) && s.paymentType === 'TUNAI');
    const salesCashToday = todaySales.reduce((sum, s) => sum + s.total, 0);
    const openSession = cashSessions.find(cs => cs.status === 'OPEN');
    const openingCash = openSession?.openingCash || 0;
    return { openingCash, salesCashToday };
  }, [sales, cashSessions]);

  const handleAddJournal = (e: React.FormEvent) => {
    e.preventDefault();
    setJournals([{ id: Date.now(), date: new Date().toLocaleDateString('id-ID'), desc: newEntry.desc, amount: newEntry.amount, type: 'EXPENSE' }, ...journals]);
    setIsModalOpen(false);
    setNewEntry({ desc: '', amount: 0, account: '6-1100' });
  };

  const totalSaldo = accounts.filter(a => a.type === 'ASSET').reduce((sum, a) => sum + a.balance, 0);

  const tabs = [
    { id: 'coa', label: 'Buku Besar', icon: <BookOpen size={16}/> },
    { id: 'kas-harian', label: 'Kas Harian', icon: <Wallet size={16}/> },
    { id: 'pajak', label: 'Pajak UMKM', icon: <FileText size={16}/> },
  ];

  return (
    <div className="space-y-6">
      {/* Header with summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 p-6 rounded-2xl text-white shadow-lg">
          <div className="flex items-center gap-2 mb-3"><Landmark size={18} className="text-indigo-200"/><span className="text-xs font-medium text-indigo-200">Total Saldo</span></div>
          <p className="text-2xl font-bold">Rp {totalSaldo.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-3"><ArrowDownLeft size={18} className="text-emerald-500"/><span className="text-xs font-medium text-slate-500">Pendapatan (MTD)</span></div>
          <p className="text-2xl font-bold text-slate-800">Rp {sales.filter(s => { try { const p = s.date.split(' ')[0].split('/'); return +p[1] === new Date().getMonth() + 1; } catch { return false; } }).reduce((sum, s) => sum + s.total, 0).toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-center cursor-pointer hover:border-indigo-300 transition-all group" onClick={() => setIsModalOpen(true)}>
          <div className="text-center">
            <Plus size={24} className="mx-auto text-indigo-400 group-hover:scale-110 transition-transform mb-2" />
            <p className="text-sm font-semibold text-slate-700">Jurnal Baru</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'coa' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Kode</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Nama Akun</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Tipe</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accounts.map(acc => (
                    <tr key={acc.code} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 font-mono text-indigo-600 font-medium">{acc.code}</td>
                      <td className="px-5 py-3 font-medium text-slate-800">{acc.name}</td>
                      <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${acc.type === 'ASSET' ? 'bg-blue-100 text-blue-700' : acc.type === 'INCOME' ? 'bg-emerald-100 text-emerald-700' : acc.type === 'EXPENSE' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{acc.type}</span></td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-800">Rp {acc.balance.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><Receipt size={16} className="text-indigo-500"/> Jurnal Terakhir</h4>
            <div className="space-y-2">
              {journals.slice(0, 8).map(j => (
                <div key={j.id} className="p-3 bg-white border border-slate-200 rounded-xl flex justify-between items-center hover:border-slate-300 transition-all">
                  <div>
                    <p className="text-xs text-slate-400">{j.date}</p>
                    <p className="text-sm font-medium text-slate-800">{j.desc}</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">Rp {j.amount.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'kas-harian' && (
        <KasHarian openingCash={todayCashData.openingCash} salesCashToday={todayCashData.salesCashToday} />
      )}

      {activeTab === 'pajak' && (
        <LaporanPajak sales={sales} />
      )}

      {/* Journal Entry Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form onSubmit={handleAddJournal} className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 shadow-2xl space-y-4 animate-slideUp">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-slate-900">Jurnal Baru</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg"><X size={20}/></button>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500">Akun</label>
              <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-400" value={newEntry.account} onChange={e => setNewEntry({...newEntry, account: e.target.value})}>
                {accounts.map(acc => <option key={acc.code} value={acc.code}>{acc.code} - {acc.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500">Keterangan</label>
              <input required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400" placeholder="Bayar listrik, beli ATK, dll" value={newEntry.desc} onChange={e => setNewEntry({...newEntry, desc: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500">Nominal (Rp)</label>
              <input type="number" required min="1" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-semibold outline-none focus:border-indigo-400" value={newEntry.amount || ''} onChange={e => setNewEntry({...newEntry, amount: parseInt(e.target.value) || 0})} />
            </div>
            <button type="submit" className="w-full py-3.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all">Posting</button>
          </form>
        </div>
      )}
    </div>
  );
};

export default Accounting;
