
import React, { useState } from 'react';
import { Account } from '../types';
import { Calculator, BookOpen, Receipt, ArrowUpRight, ArrowDownLeft, Plus, X, Landmark } from 'lucide-react';

interface AccountingProps {
  accounts: Account[];
}

const Accounting: React.FC<AccountingProps> = ({ accounts }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [journals, setJournals] = useState([
    { id: 1, date: '14 Nov 2024', desc: 'Biaya Listrik Kantor', amount: 450000, type: 'EXPENSE' },
    { id: 2, date: '14 Nov 2024', desc: 'Setoran Bank BCA', amount: 15000000, type: 'ASSET' }
  ]);

  const [newEntry, setNewEntry] = useState({ desc: '', amount: 0, account: '6-1100' });

  const handleAddJournal = (e: React.FormEvent) => {
    e.preventDefault();
    setJournals([{
      id: Date.now(),
      date: new Date().toLocaleDateString('id-ID'),
      desc: newEntry.desc,
      amount: newEntry.amount,
      type: 'EXPENSE'
    }, ...journals]);
    setIsModalOpen(false);
    setNewEntry({ desc: '', amount: 0, account: '6-1100' });
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-blue-600 p-8 rounded-[2rem] text-white shadow-2xl shadow-blue-500/20">
          <div className="flex justify-between items-start mb-6">
            <div className="p-3 bg-white/20 rounded-2xl"><Landmark size={24} /></div>
            <span className="text-[10px] font-black bg-white/20 px-3 py-1 rounded-full uppercase">SINKRON</span>
          </div>
          <div className="text-blue-100 text-xs font-black uppercase tracking-widest mb-1">Total Saldo Kas & Bank</div>
          <div className="text-4xl font-black tracking-tighter">Rp 52.500.000</div>
        </div>

        <div className="bg-white p-8 rounded-[2rem] border-2 border-slate-300 shadow-sm">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl w-fit mb-6"><ArrowDownLeft size={24} /></div>
          <div className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Pendapatan Bersih (MTD)</div>
          <div className="text-4xl font-black text-slate-800 tracking-tighter">Rp 12.840.000</div>
        </div>

        <div className="bg-white p-8 rounded-[2rem] border-2 border-slate-300 shadow-sm flex flex-col justify-center items-center text-center cursor-pointer hover:border-blue-500 group transition-all" onClick={() => setIsModalOpen(true)}>
           <div className="p-4 bg-blue-50 text-blue-600 rounded-3xl group-hover:scale-110 transition-transform mb-4">
              <Plus size={32} />
           </div>
           <div className="font-black text-slate-800 uppercase tracking-tighter">BUAT JURNAL BARU</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              <BookOpen size={24} className="text-blue-600" /> DAFTAR PERKIRAAN (COA)
            </h3>
          </div>
          <div className="bg-white rounded-[2rem] border-2 border-slate-300 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-left">
                <tr>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Kode Akun</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nama Perkiraan</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Saldo Akhir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((acc) => (
                  <tr key={acc.code} className="hover:bg-slate-50 transition-colors">
                    <td className="px-8 py-4 font-mono font-bold text-blue-600">{acc.code}</td>
                    <td className="px-8 py-4 font-bold text-slate-800">{acc.name}</td>
                    <td className="px-8 py-4 text-right font-black text-slate-700">Rp {acc.balance.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
           <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2 px-2">
              <Receipt size={24} className="text-purple-600" /> JURNAL UMUM
           </h3>
           <div className="bg-white rounded-[2rem] border-2 border-slate-300 shadow-sm p-6 space-y-4">
              {journals.map(j => (
                <div key={j.id} className="p-4 rounded-2xl bg-slate-50 border-2 border-slate-300 flex justify-between items-center group cursor-pointer hover:bg-white hover:shadow-lg transition-all">
                  <div>
                    <div className="text-[10px] font-black text-slate-400 uppercase mb-1">{j.date}</div>
                    <div className="font-bold text-slate-800 leading-tight">{j.desc}</div>
                  </div>
                  <div className="font-black text-blue-600 text-sm">Rp {j.amount.toLocaleString()}</div>
                </div>
              ))}
           </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
           <form onSubmit={handleAddJournal} className="bg-white w-full max-w-lg rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in duration-300 border-4 border-slate-200">
              <div className="flex justify-between items-center mb-8">
                 <h3 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">INPUT JURNAL UMUM</h3>
                 <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 bg-slate-100 rounded-full border-2 border-slate-300 hover:bg-red-500 hover:text-white transition-all"><X/></button>
              </div>
              <div className="space-y-6">
                 <div>
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Pilih Akun</label>
                    <select className="w-full bg-slate-50 border-2 border-slate-400 rounded-2xl p-4 font-bold focus:border-blue-600 outline-none" value={newEntry.account} onChange={e => setNewEntry({...newEntry, account: e.target.value})}>
                       {accounts.map(acc => <option key={acc.code} value={acc.code}>{acc.code} - {acc.name}</option>)}
                    </select>
                 </div>
                 <div>
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Keterangan Transaksi</label>
                    <input required className="w-full bg-slate-50 border-2 border-slate-400 rounded-2xl p-4 font-bold text-slate-700 focus:border-blue-600 outline-none" value={newEntry.desc} onChange={e => setNewEntry({...newEntry, desc: e.target.value})} />
                 </div>
                 <div>
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Nilai Nominal (Rp)</label>
                    <input type="number" required className="w-full bg-slate-50 border-2 border-slate-400 rounded-2xl p-4 font-black text-blue-600 text-2xl focus:border-blue-600 outline-none" value={newEntry.amount} onChange={e => setNewEntry({...newEntry, amount: parseInt(e.target.value) || 0})} />
                 </div>
              </div>
              <button type="submit" className="w-full mt-10 py-5 bg-blue-600 text-white font-black text-xl rounded-2xl shadow-xl hover:bg-blue-700 border-b-4 border-blue-800 transition-all active:scale-95">POSTING KE BUKU BESAR</button>
           </form>
        </div>
      )}
    </div>
  );
};

export default Accounting;
