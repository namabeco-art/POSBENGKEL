import React, { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Factory, Landmark, PlayCircle, ReceiptText, ShieldCheck, Store, Truck, Users, XCircle } from 'lucide-react';
import { CashSession, Customer, Item, PurchaseOrder, Sale, SaleReturn, Supplier, User } from '../types';

type StageKey = 'stage1' | 'stage2' | 'stage3';

interface ERPControlTowerProps {
  currentUser: User;
  sales: Sale[];
  purchaseOrders: PurchaseOrder[];
  returns: SaleReturn[];
  items: Item[];
  customers: Customer[];
  suppliers: Supplier[];
  cashSessions: CashSession[];
  onNavigate: (tabId: string) => void;
}

interface StageStatus {
  executed: boolean;
  executedAt?: string;
}

const formatCurrency = (amount: number): string => `Rp ${amount.toLocaleString('id-ID')}`;

const ERPControlTower: React.FC<ERPControlTowerProps> = ({
  currentUser,
  sales,
  purchaseOrders,
  returns,
  items,
  customers,
  suppliers,
  cashSessions,
  onNavigate,
}) => {
  const [status, setStatus] = useState<Record<StageKey, StageStatus>>({
    stage1: { executed: false },
    stage2: { executed: false },
    stage3: { executed: false },
  });

  const [executionLog, setExecutionLog] = useState<string[]>([]);

  const openShiftCount = useMemo(
    () => cashSessions.filter((session) => session.status === 'OPEN').length,
    [cashSessions],
  );

  const pendingPO = useMemo(
    () => purchaseOrders.filter((po) => po.status === 'PENDING').length,
    [purchaseOrders],
  );

  const payableAmount = useMemo(
    () => purchaseOrders.reduce((sum, po) => sum + Math.max(0, po.total - (po.paidAmount || 0)), 0),
    [purchaseOrders],
  );

  const receivableAmount = useMemo(
    () => sales
      .filter((sale) => sale.paymentType === 'KREDIT')
      .reduce((sum, sale) => sum + sale.total, 0),
    [sales],
  );

  const lowStockCount = useMemo(
    () => items.filter((item) => item.stock <= (item.reorderLevel || 10)).length,
    [items],
  );

  const pendingReturns = useMemo(
    () => returns.filter((ret) => (ret.status || 'PENDING') === 'PENDING').length,
    [returns],
  );

  const totalRevenue = useMemo(
    () => sales.reduce((sum, sale) => sum + sale.total, 0),
    [sales],
  );

  const executeStage = (stage: StageKey, label: string) => {
    const timestamp = new Date().toLocaleString('id-ID');
    setStatus((prev) => ({ ...prev, [stage]: { executed: true, executedAt: timestamp } }));
    setExecutionLog((prev) => [`${timestamp} - ${label} dieksekusi oleh ${currentUser.name}`, ...prev].slice(0, 12));
  };

  const StatusPill = ({ stage }: { stage: StageKey }) => (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${status[stage].executed ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-orange-100 text-orange-700 border border-orange-200'}`}>
      {status[stage].executed ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      {status[stage].executed ? `Executed ${status[stage].executedAt}` : 'Belum dieksekusi'}
    </span>
  );

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6 md:p-8 rounded-3xl shadow-xl border border-slate-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight uppercase">ERP Control Tower</h2>
            <p className="text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] text-slate-300 mt-2">
              Eksekusi Profesional Tahap 1, 2, dan 3
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-black">Total Omzet Tercatat</div>
            <div className="text-2xl font-black text-emerald-400">{formatCurrency(totalRevenue)}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Shift Kasir Aktif</div>
          <div className="text-2xl font-black text-slate-900 mt-2">{openShiftCount}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest">PO Pending</div>
          <div className="text-2xl font-black text-slate-900 mt-2">{pendingPO}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Piutang Dagang</div>
          <div className="text-xl font-black text-orange-600 mt-2">{formatCurrency(receivableAmount)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Hutang Dagang</div>
          <div className="text-xl font-black text-red-600 mt-2">{formatCurrency(payableAmount)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <section className="bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-sm" data-testid="stage-1-card">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Store className="text-blue-600" size={20} />
              <h3 className="text-sm font-black uppercase tracking-tight">Tahap 1 - POS Pro</h3>
            </div>
            <StatusPill stage="stage1" />
          </div>
          <ul className="space-y-2 text-xs font-semibold text-slate-700">
            <li className="flex items-center gap-2"><ClipboardCheck size={14} className="text-blue-600" /> Transaksi kasir realtime</li>
            <li className="flex items-center gap-2"><Truck size={14} className="text-blue-600" /> Stok otomatis berkurang saat penjualan</li>
            <li className="flex items-center gap-2"><Users size={14} className="text-blue-600" /> Customer tier pricing siap dipakai</li>
          </ul>
          <div className="flex gap-2">
            <button onClick={() => onNavigate('pos')} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-black uppercase">Buka POS</button>
            <button
              onClick={() => executeStage('stage1', 'Tahap 1 POS Pro')}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black uppercase flex items-center justify-center gap-1"
            >
              <PlayCircle size={14} /> Eksekusi
            </button>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-sm" data-testid="stage-2-card">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Factory className="text-emerald-600" size={20} />
              <h3 className="text-sm font-black uppercase tracking-tight">Tahap 2 - ERP Lite</h3>
            </div>
            <StatusPill stage="stage2" />
          </div>
          <ul className="space-y-2 text-xs font-semibold text-slate-700">
            <li className="flex items-center gap-2"><ReceiptText size={14} className="text-emerald-600" /> Pengadaan & penerimaan barang</li>
            <li className="flex items-center gap-2"><Landmark size={14} className="text-emerald-600" /> Kontrol hutang & piutang</li>
            <li className="flex items-center gap-2"><ClipboardCheck size={14} className="text-emerald-600" /> Monitoring stok kritis: {lowStockCount} item</li>
          </ul>
          <div className="flex gap-2">
            <button onClick={() => onNavigate('purchasing')} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-black uppercase">Pembelian</button>
            <button
              onClick={() => executeStage('stage2', 'Tahap 2 ERP Lite')}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase flex items-center justify-center gap-1"
            >
              <PlayCircle size={14} /> Eksekusi
            </button>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-sm" data-testid="stage-3-card">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-violet-600" size={20} />
              <h3 className="text-sm font-black uppercase tracking-tight">Tahap 3 - ERP Full</h3>
            </div>
            <StatusPill stage="stage3" />
          </div>
          <ul className="space-y-2 text-xs font-semibold text-slate-700">
            <li className="flex items-center gap-2"><ClipboardCheck size={14} className="text-violet-600" /> Approval retur pending: {pendingReturns}</li>
            <li className="flex items-center gap-2"><Landmark size={14} className="text-violet-600" /> Closing keuangan terpadu</li>
            <li className="flex items-center gap-2"><Users size={14} className="text-violet-600" /> Governance user & audit trail</li>
          </ul>
          <div className="flex gap-2">
            <button onClick={() => onNavigate('reporting')} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-black uppercase">Laporan</button>
            <button
              onClick={() => executeStage('stage3', 'Tahap 3 ERP Full')}
              className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-black uppercase flex items-center justify-center gap-1"
            >
              <PlayCircle size={14} /> Eksekusi
            </button>
          </div>
        </section>
      </div>

      <section className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardCheck size={18} className="text-slate-600" />
          <h3 className="font-black text-sm uppercase tracking-wider">Log Eksekusi Manual</h3>
        </div>
        {executionLog.length === 0 ? (
          <p className="text-xs font-semibold text-slate-500">Belum ada eksekusi. Klik tombol Eksekusi pada Tahap 1, 2, dan 3.</p>
        ) : (
          <ul className="space-y-2">
            {executionLog.map((entry) => (
              <li key={entry} className="text-xs font-semibold text-slate-700 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">{entry}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default ERPControlTower;
