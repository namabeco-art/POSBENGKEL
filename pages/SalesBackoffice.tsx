
import React, { useState } from 'react';
import { Package, Plus, Search, FileText, ClipboardList, Wallet, Receipt } from 'lucide-react';

const SalesBackoffice: React.FC = () => {
  const [activeTab, setActiveTab] = useState('so');

  const subTabs = [
    { id: 'so', label: 'Sales Order (SO)', icon: <ClipboardList size={18} /> },
    { id: 'invoice', label: 'Invoice Penjualan', icon: <FileText size={18} /> },
    { id: 'payment', label: 'Pelunasan Piutang', icon: <Wallet size={18} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex border-b border-slate-200">
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3 font-medium transition-all border-b-2 ${
              activeTab === tab.id 
                ? 'border-blue-600 text-blue-600 bg-blue-50/50' 
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border-2 border-slate-300 flex items-center gap-4 shadow-sm">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><Receipt size={24}/></div>
          <div>
            <div className="text-xs text-slate-400 font-bold uppercase">Total Tagihan</div>
            <div className="text-xl font-black text-slate-800">Rp 125.400.000</div>
          </div>
        </div>
        {/* Simple search and add */}
        <div className="md:col-span-3 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="Cari invoice atau pelanggan..." className="w-full pl-10 pr-4 py-2 border-2 border-slate-400 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none focus:border-blue-600" />
          </div>
          <button className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 whitespace-nowrap shadow-md hover:bg-blue-700 transition-all"><Plus size={18}/> Buat Invoice</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-xs text-slate-400 uppercase font-black">
              <th className="px-6 py-4">No. Invoice</th>
              <th className="px-6 py-4">Pelanggan</th>
              <th className="px-6 py-4">Jatuh Tempo</th>
              <th className="px-6 py-4 text-right">Saldo Tagihan</th>
              <th className="px-6 py-4 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[1, 2, 3].map(i => (
              <tr key={i} className="hover:bg-blue-50/30">
                <td className="px-6 py-4 font-bold text-slate-800 tracking-tight">INV/2024/XI/00{i}</td>
                <td className="px-6 py-4">
                   <div className="font-bold text-slate-700">Toko Berkah Sejahtera</div>
                   <div className="text-[10px] text-blue-500 font-medium">S-00{i} | Bpk. Ahmad</div>
                </td>
                <td className="px-6 py-4 text-slate-500 font-medium">25/11/2024</td>
                <td className="px-6 py-4 text-right font-black text-red-600">Rp 1.200.000</td>
                <td className="px-6 py-4">
                  <div className="flex justify-center">
                    <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-[10px] font-black uppercase">Belum Lunas</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SalesBackoffice;
