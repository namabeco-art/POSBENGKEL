import React, { useMemo, useState } from 'react';
import { BarChart3, Download, Search, ShieldCheck } from 'lucide-react';
import { InventoryMovement, Item, Mechanic, PurchaseOrder, Sale, SaleReturn, Supplier, Warehouse } from '../types';
import { Button, Card, EmptyState, formatDateTime, formatRp, inputClass, PageHeader, rangeToIso, StatTile, Table, todayKey } from '../components/ui';
import { downloadCsv } from '../services/csv';
import { movementDelta } from '../services/mergeService';

interface AdvancedReportsProps {
  items: Item[];
  /** Penjualan aktif (tanpa void). */
  sales: Sale[];
  returns: SaleReturn[];
  movements: InventoryMovement[];
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
  mechanics: Mechanic[];
  warehouses: Warehouse[];
}

type Tab = 'laba-item' | 'tidak-laku' | 'kelompok' | 'jam-ramai' | 'mutasi' | 'garansi';
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const daysAgoKey = (days: number) => {
  const date = new Date(Date.now() - days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const pct = (value: number) => `${(Math.round(value * 10) / 10).toLocaleString('id-ID')}%`;

const AdvancedReports: React.FC<AdvancedReportsProps> = ({ items, sales, returns, movements, purchaseOrders, suppliers, mechanics }) => {
  const [tab, setTab] = useState<Tab>('laba-item');
  const [from, setFrom] = useState(daysAgoKey(29));
  const [to, setTo] = useState(todayKey());
  const [groupBy, setGroupBy] = useState<'kategori' | 'merek' | 'mekanik' | 'supplier'>('kategori');
  const [idleDays, setIdleDays] = useState(60);
  const [serialQuery, setSerialQuery] = useState('');
  const range = rangeToIso(from, to);
  const itemById = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);

  const periodSales = useMemo(() => sales.filter(sale => (sale.createdAt || '') >= range.from && (sale.createdAt || '') <= range.to), [sales, range.from, range.to]);

  /** Baris penjualan dengan nilai bersih (setelah diskon faktur), modal, dan laba. */
  const lineFacts = useMemo(() => periodSales.flatMap(sale => {
    const ratio = sale.subtotal > 0 ? sale.total / sale.subtotal : 1;
    return sale.items.map(line => {
      const revenue = line.total * ratio;
      const cost = line.isJasa ? 0 : (line.costPrice || 0) * line.qty;
      return { sale, line, revenue, cost, profit: revenue - cost };
    });
  }), [periodSales]);

  const returnedValue = useMemo(() => returns
    .filter(ret => ret.status === 'APPROVED' && (ret.approvedAt || ret.createdAt || '') >= range.from && (ret.approvedAt || ret.createdAt || '') <= range.to)
    .reduce((sum, ret) => sum + ret.totalReturn, 0), [returns, range.from, range.to]);

  const profitByItem = useMemo(() => {
    const map = new Map<string, { itemId: string; name: string; qty: number; revenue: number; cost: number; profit: number }>();
    lineFacts.forEach(fact => {
      const row = map.get(fact.line.itemId) || { itemId: fact.line.itemId, name: fact.line.name, qty: 0, revenue: 0, cost: 0, profit: 0 };
      row.qty += fact.line.qty;
      row.revenue += fact.revenue;
      row.cost += fact.cost;
      row.profit += fact.profit;
      map.set(fact.line.itemId, row);
    });
    return Array.from(map.values()).sort((a, b) => b.profit - a.profit);
  }, [lineFacts]);

  const lastSupplierByItem = useMemo(() => {
    const map = new Map<string, string>();
    [...purchaseOrders].sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(po => po.items.forEach(line => map.set(line.itemId, po.supplierName)));
    return map;
  }, [purchaseOrders]);

  const grouped = useMemo(() => {
    const keyOf = (fact: typeof lineFacts[number]) => {
      const item = itemById.get(fact.line.itemId);
      if (groupBy === 'kategori') return item?.category || '(tanpa kategori)';
      if (groupBy === 'merek') return item?.brand || '(tanpa merek)';
      if (groupBy === 'mekanik') return fact.line.mechanicName || mechanics.find(mechanic => mechanic.id === fact.line.mechanicId)?.name || '(tanpa mekanik)';
      return lastSupplierByItem.get(fact.line.itemId) || '(belum pernah dibeli lewat PO)';
    };
    const map = new Map<string, { key: string; lines: number; qty: number; revenue: number; profit: number }>();
    lineFacts.forEach(fact => {
      const key = keyOf(fact);
      const row = map.get(key) || { key, lines: 0, qty: 0, revenue: 0, profit: 0 };
      row.lines += 1;
      row.qty += fact.line.qty;
      row.revenue += fact.revenue;
      row.profit += fact.profit;
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [lineFacts, groupBy, itemById, mechanics, lastSupplierByItem]);

  const idleItems = useMemo(() => {
    const cutoff = new Date(Date.now() - idleDays * 86_400_000).toISOString();
    const lastSold = new Map<string, string>();
    sales.forEach(sale => sale.items.forEach(line => {
      const at = sale.createdAt || '';
      if (at > (lastSold.get(line.itemId) || '')) lastSold.set(line.itemId, at);
    }));
    return items
      .filter(item => item.itemType !== 'JASA' && !item.isBundle && item.stock > 0)
      .map(item => ({ item, lastSoldAt: lastSold.get(item.id), value: item.stock * (item.basePrice || 0) }))
      .filter(row => !row.lastSoldAt || row.lastSoldAt < cutoff)
      .sort((a, b) => b.value - a.value);
  }, [items, sales, idleDays]);

  const busyHours = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, value: 0 }));
    const days = DAY_NAMES.map((name, day) => ({ name, day, count: 0, value: 0 }));
    periodSales.forEach(sale => {
      const date = new Date(sale.createdAt || '');
      if (Number.isNaN(date.getTime())) return;
      hours[date.getHours()].count += 1;
      hours[date.getHours()].value += sale.total;
      days[date.getDay()].count += 1;
      days[date.getDay()].value += sale.total;
    });
    return { hours: hours.filter(hour => hour.count > 0), days, maxHour: Math.max(1, ...hours.map(hour => hour.count)), maxDay: Math.max(1, ...days.map(day => day.count)) };
  }, [periodSales]);

  const stockMutation = useMemo(() => {
    const rows = new Map<string, { item: Item; inQty: number; outQty: number; after: number; afterTo: number }>();
    items.filter(item => item.itemType !== 'JASA' && !item.isBundle).forEach(item => rows.set(item.id, { item, inQty: 0, outQty: 0, after: 0, afterTo: 0 }));
    movements.forEach(movement => {
      const row = rows.get(movement.itemId);
      if (!row || movement.type === 'TRANSFER') return;
      const delta = movementDelta(movement);
      if (movement.createdAt >= range.from) row.after += delta;
      if (movement.createdAt > range.to) row.afterTo += delta;
      if (movement.createdAt >= range.from && movement.createdAt <= range.to) {
        if (delta > 0) row.inQty += delta; else row.outQty += -delta;
      }
    });
    return Array.from(rows.values())
      .map(row => ({ ...row, opening: row.item.stock - row.after, closing: row.item.stock - row.afterTo }))
      .filter(row => row.inQty || row.outQty)
      .sort((a, b) => b.outQty - a.outQty);
  }, [items, movements, range.from, range.to]);

  const serialResults = useMemo(() => {
    const query = serialQuery.trim().toLowerCase();
    if (!query) return [];
    return sales.flatMap(sale => sale.items
      .filter(line => line.serialNumbers?.some(serial => serial.toLowerCase().includes(query)))
      .map(line => {
        const soldAt = new Date(sale.createdAt || Date.now());
        const days = line.warrantyDays || itemById.get(line.itemId)?.warrantyDays || 0;
        const expiresAt = days > 0 ? new Date(soldAt.getTime() + days * 86_400_000) : null;
        return { sale, line, expiresAt, active: expiresAt ? expiresAt.getTime() >= Date.now() : false };
      }));
  }, [serialQuery, sales, itemById]);

  const totals = lineFacts.reduce((acc, fact) => ({ revenue: acc.revenue + fact.revenue, cost: acc.cost + fact.cost, profit: acc.profit + fact.profit }), { revenue: 0, cost: 0, profit: 0 });

  const DateRange = (
    <div className="flex items-center gap-2 text-xs">
      <input type="date" aria-label="Dari tanggal" className={`${inputClass} py-1.5 w-36`} value={from} onChange={event => setFrom(event.target.value)} />
      <span>s/d</span>
      <input type="date" aria-label="Sampai tanggal" className={`${inputClass} py-1.5 w-36`} value={to} onChange={event => setTo(event.target.value)} />
    </div>
  );
  const csvButton = (onClick: () => void) => <Button variant="secondary" className="py-1.5 px-3 text-xs" icon={<Download size={14} />} onClick={onClick}>CSV</Button>;

  return (
    <div className="space-y-6">
      <PageHeader title="Laporan Lengkap" subtitle="Analisa laba per barang, barang tidak laku, jam ramai, mutasi stok, dan cek garansi." icon={<BarChart3 size={20} />} />
      <div className="flex flex-wrap gap-2">
        {([['laba-item', 'Laba per Barang'], ['kelompok', 'Per Kategori/Merek/Mekanik/Supplier'], ['tidak-laku', 'Barang Tidak Laku'], ['jam-ramai', 'Jam & Hari Ramai'], ['mutasi', 'Mutasi Stok'], ['garansi', 'Cek Garansi / Serial']] as Array<[Tab, string]>).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`px-4 py-2 rounded-xl text-sm font-semibold ${tab === id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{label}</button>
        ))}
      </div>

      {tab === 'laba-item' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile label="Penjualan bersih" value={formatRp(totals.revenue)} />
            <StatTile label="Modal (HPP)" value={formatRp(totals.cost)} />
            <StatTile label="Laba kotor" value={formatRp(totals.profit)} tone={totals.profit >= 0 ? 'good' : 'bad'} hint={totals.revenue > 0 ? `Margin ${pct(totals.profit / totals.revenue * 100)}` : undefined} />
            <StatTile label="Retur disetujui" value={formatRp(returnedValue)} tone="warn" />
          </div>
          <Card title="Laba per barang" actions={<div className="flex items-center gap-2">{DateRange}{csvButton(() => downloadCsv(`laba-per-barang-${from}-${to}.csv`, [['Barang', 'Qty', 'Penjualan', 'Modal', 'Laba', 'Margin %'], ...profitByItem.map(row => [row.name, row.qty, Math.round(row.revenue), Math.round(row.cost), Math.round(row.profit), row.revenue > 0 ? Math.round(row.profit / row.revenue * 1000) / 10 : 0])]))}</div>}>
            {profitByItem.length === 0 ? <EmptyState text="Tidak ada penjualan di periode ini." /> : (
              <Table headers={['Barang', 'Qty', 'Penjualan', 'Modal', 'Laba', 'Margin']} alignRight={[1, 2, 3, 4, 5]}>
                {profitByItem.map(row => (
                  <tr key={row.itemId}>
                    <td className="px-5 py-2.5">{row.name}</td>
                    <td className="px-5 py-2.5 text-right">{row.qty.toLocaleString('id-ID')}</td>
                    <td className="px-5 py-2.5 text-right">{formatRp(row.revenue)}</td>
                    <td className="px-5 py-2.5 text-right">{formatRp(row.cost)}</td>
                    <td className={`px-5 py-2.5 text-right font-semibold ${row.profit < 0 ? 'text-red-600' : ''}`}>{formatRp(row.profit)}</td>
                    <td className="px-5 py-2.5 text-right">{row.revenue > 0 ? pct(row.profit / row.revenue * 100) : '-'}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}

      {tab === 'kelompok' && (
        <Card title="Penjualan per kelompok" actions={<div className="flex flex-wrap items-center gap-2">
          <select aria-label="Kelompokkan" className={`${inputClass} py-1.5 w-40`} value={groupBy} onChange={event => setGroupBy(event.target.value as typeof groupBy)}>
            <option value="kategori">Kategori</option><option value="merek">Merek</option><option value="mekanik">Mekanik/Sales</option><option value="supplier">Supplier terakhir</option>
          </select>{DateRange}{csvButton(() => downloadCsv(`penjualan-per-${groupBy}-${from}-${to}.csv`, [[groupBy, 'Baris', 'Qty', 'Penjualan', 'Laba'], ...grouped.map(row => [row.key, row.lines, row.qty, Math.round(row.revenue), Math.round(row.profit)])]))}</div>}>
          {grouped.length === 0 ? <EmptyState text="Tidak ada penjualan di periode ini." /> : (
            <Table headers={[groupBy[0].toUpperCase() + groupBy.slice(1), 'Baris', 'Qty', 'Penjualan', 'Laba', 'Porsi']} alignRight={[1, 2, 3, 4, 5]}>
              {grouped.map(row => (
                <tr key={row.key}>
                  <td className="px-5 py-2.5 font-medium">{row.key}</td>
                  <td className="px-5 py-2.5 text-right">{row.lines}</td>
                  <td className="px-5 py-2.5 text-right">{row.qty.toLocaleString('id-ID')}</td>
                  <td className="px-5 py-2.5 text-right">{formatRp(row.revenue)}</td>
                  <td className="px-5 py-2.5 text-right">{formatRp(row.profit)}</td>
                  <td className="px-5 py-2.5 text-right">{totals.revenue > 0 ? pct(row.revenue / totals.revenue * 100) : '-'}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {tab === 'tidak-laku' && (
        <Card title={`Barang tidak laku (${idleItems.length})`} actions={<div className="flex items-center gap-2 text-xs">
          <span>Tidak terjual</span>
          <select aria-label="Lama tidak terjual" className={`${inputClass} py-1.5 w-28`} value={idleDays} onChange={event => setIdleDays(Number(event.target.value))}>{[30, 60, 90, 180, 365].map(days => <option key={days} value={days}>{days} hari</option>)}</select>
          {csvButton(() => downloadCsv(`barang-tidak-laku-${idleDays}hari.csv`, [['Kode', 'Barang', 'Stok', 'Nilai Modal', 'Terakhir Terjual'], ...idleItems.map(row => [row.item.code, row.item.name, row.item.stock, Math.round(row.value), row.lastSoldAt ? formatDateTime(row.lastSoldAt) : 'Belum pernah'])]))}
        </div>}>
          <p className="text-sm text-slate-500 mb-3">Modal tertahan: <b className="text-slate-800">{formatRp(idleItems.reduce((sum, row) => sum + row.value, 0))}</b></p>
          {idleItems.length === 0 ? <EmptyState text="Semua barang ber-stok terjual dalam periode ini." /> : (
            <Table headers={['Barang', 'Stok', 'Nilai modal', 'Terakhir terjual']} alignRight={[1, 2]}>
              {idleItems.slice(0, 300).map(row => (
                <tr key={row.item.id}>
                  <td className="px-5 py-2.5"><p>{row.item.name}</p><p className="text-xs text-slate-400">{row.item.code}</p></td>
                  <td className="px-5 py-2.5 text-right">{row.item.stock}</td>
                  <td className="px-5 py-2.5 text-right">{formatRp(row.value)}</td>
                  <td className="px-5 py-2.5 text-xs text-slate-500">{row.lastSoldAt ? formatDateTime(row.lastSoldAt) : 'Belum pernah'}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {tab === 'jam-ramai' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Transaksi per jam" actions={DateRange}>
            {busyHours.hours.length === 0 ? <EmptyState text="Tidak ada transaksi." /> : (
              <div className="space-y-1.5">
                {busyHours.hours.map(hour => (
                  <div key={hour.hour} className="flex items-center gap-3 text-xs">
                    <span className="w-12 text-slate-500">{String(hour.hour).padStart(2, '0')}:00</span>
                    <div className="flex-1 h-4 bg-slate-100 rounded"><div className="h-4 bg-indigo-500 rounded" style={{ width: `${(hour.count / busyHours.maxHour) * 100}%` }} /></div>
                    <span className="w-28 text-right">{hour.count} trx • {formatRp(hour.value)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Transaksi per hari">
            <div className="space-y-1.5">
              {busyHours.days.map(day => (
                <div key={day.day} className="flex items-center gap-3 text-xs">
                  <span className="w-14 text-slate-500">{day.name}</span>
                  <div className="flex-1 h-4 bg-slate-100 rounded"><div className="h-4 bg-emerald-500 rounded" style={{ width: `${(day.count / busyHours.maxDay) * 100}%` }} /></div>
                  <span className="w-28 text-right">{day.count} trx • {formatRp(day.value)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'mutasi' && (
        <Card title="Mutasi stok (kartu stok ringkas)" actions={<div className="flex items-center gap-2">{DateRange}{csvButton(() => downloadCsv(`mutasi-stok-${from}-${to}.csv`, [['Kode', 'Barang', 'Awal', 'Masuk', 'Keluar', 'Akhir'], ...stockMutation.map(row => [row.item.code, row.item.name, row.opening, row.inQty, row.outQty, row.closing])]))}</div>}>
          {stockMutation.length === 0 ? <EmptyState text="Tidak ada mutasi di periode ini." /> : (
            <Table headers={['Barang', 'Awal', 'Masuk', 'Keluar', 'Akhir']} alignRight={[1, 2, 3, 4]}>
              {stockMutation.map(row => (
                <tr key={row.item.id}>
                  <td className="px-5 py-2.5"><p>{row.item.name}</p><p className="text-xs text-slate-400">{row.item.code}</p></td>
                  <td className="px-5 py-2.5 text-right">{row.opening}</td>
                  <td className="px-5 py-2.5 text-right text-emerald-700">+{row.inQty}</td>
                  <td className="px-5 py-2.5 text-right text-red-600">−{row.outQty}</td>
                  <td className="px-5 py-2.5 text-right font-semibold">{row.closing}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {tab === 'garansi' && (
        <Card title="Cek garansi berdasarkan nomor seri">
          <div className="relative max-w-md mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input autoFocus className={`${inputClass} pl-8`} placeholder="Ketik / scan nomor seri..." value={serialQuery} onChange={event => setSerialQuery(event.target.value)} />
          </div>
          {serialQuery.trim() === '' ? <EmptyState text="Nomor seri dicatat di kasir untuk barang yang ditandai 'wajib nomor seri' (mode Lengkap)." /> : serialResults.length === 0 ? <EmptyState text="Nomor seri tidak ditemukan." /> : (
            <Table headers={['Nomor seri', 'Barang', 'Faktur', 'Pelanggan', 'Tanggal jual', 'Garansi']}>
              {serialResults.map(result => (
                <tr key={`${result.sale.id}-${result.line.itemId}`}>
                  <td className="px-5 py-2.5 text-xs font-mono">{result.line.serialNumbers?.filter(serial => serial.toLowerCase().includes(serialQuery.trim().toLowerCase())).join(', ')}</td>
                  <td className="px-5 py-2.5">{result.line.name}</td>
                  <td className="px-5 py-2.5 text-xs">{result.sale.invoiceNo}</td>
                  <td className="px-5 py-2.5">{result.sale.customerName}</td>
                  <td className="px-5 py-2.5 text-xs">{formatDateTime(result.sale.createdAt)}</td>
                  <td className="px-5 py-2.5 text-xs">{result.expiresAt
                    ? <span className={result.active ? 'text-emerald-700 font-semibold' : 'text-red-600'}><ShieldCheck size={12} className="inline mr-1" />{result.active ? 'Aktif' : 'Habis'} s/d {result.expiresAt.toLocaleDateString('id-ID')}</span>
                    : 'Tanpa garansi'}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}
    </div>
  );
};

export default AdvancedReports;
