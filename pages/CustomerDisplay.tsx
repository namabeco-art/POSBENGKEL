import React, { useEffect, useState } from 'react';
import { CustomerDisplayState, subscribeCustomerDisplay } from '../services/customerDisplay';

const rp = (value: number) => `Rp ${Math.round(value || 0).toLocaleString('id-ID')}`;

/** Jendela layar pelanggan: hanya menampilkan isi keranjang yang dikirim dari kasir di perangkat yang sama. */
const CustomerDisplay: React.FC = () => {
  const [state, setState] = useState<CustomerDisplayState | null>(null);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => subscribeCustomerDisplay(setState), []);
  useEffect(() => {
    document.title = 'Layar Pelanggan';
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const lines = state?.lines || [];
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="px-8 py-5 flex justify-between items-center border-b border-white/10">
        <h1 className="text-2xl font-bold">{state?.storeName || 'Selamat Datang'}</h1>
        <span className="text-lg text-slate-300 tabular-nums">{clock.toLocaleTimeString('id-ID')}</span>
      </header>
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3">
        <section className="lg:col-span-2 p-8 overflow-y-auto">
          {lines.length === 0 ? (
            <div className="h-full flex items-center justify-center text-3xl text-slate-500">{state?.message || 'Terima kasih telah berbelanja'}</div>
          ) : (
            <table className="w-full text-xl">
              <tbody>
                {lines.map((line, index) => (
                  <tr key={index} className="border-b border-white/10">
                    <td className="py-3">{line.name}<span className="block text-base text-slate-400">{line.qtyText}{line.discount ? ` • diskon ${rp(line.discount)}` : ''}</span></td>
                    <td className="py-3 text-right tabular-nums">{rp(line.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <aside className="bg-indigo-700 p-8 flex flex-col justify-end gap-3">
          <p className="text-lg text-indigo-200">Pelanggan: {state?.customerName || 'Umum'}</p>
          <div className="flex justify-between text-xl"><span>Subtotal</span><span className="tabular-nums">{rp(state?.subtotal || 0)}</span></div>
          {(state?.discount || 0) > 0 && <div className="flex justify-between text-xl text-emerald-300"><span>Diskon</span><span className="tabular-nums">−{rp(state?.discount || 0)}</span></div>}
          <div className="flex justify-between items-end border-t border-white/20 pt-3"><span className="text-2xl">TOTAL</span><span className="text-5xl font-bold tabular-nums">{rp(state?.total || 0)}</span></div>
          {state?.paid !== undefined && (
            <>
              <div className="flex justify-between text-xl"><span>Bayar</span><span className="tabular-nums">{rp(state.paid)}</span></div>
              <div className="flex justify-between text-2xl font-bold text-emerald-300"><span>Kembali</span><span className="tabular-nums">{rp(state.change || 0)}</span></div>
            </>
          )}
        </aside>
      </main>
    </div>
  );
};

export default CustomerDisplay;
