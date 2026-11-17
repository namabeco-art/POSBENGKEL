import React, { useMemo, useState } from 'react';
import { Warehouse as WarehouseIcon, Plus, ArrowRightLeft, Trash2, Search } from 'lucide-react';
import { Item, StockTransfer, Warehouse } from '../types';
import { Button, Card, EmptyState, Field, formatDateTime, inputClass, Modal, PageHeader, Table } from '../components/ui';
import { DEFAULT_WAREHOUSE_ID, getWarehouseStock, withDefaultWarehouse } from '../services/warehouses';
import { createId } from '../services/idService';

interface WarehousesProps {
  warehouses: Warehouse[];
  items: Item[];
  transfers: StockTransfer[];
  onSaveWarehouse?: (warehouse: Warehouse) => void;
  onTransfer?: (input: { fromWarehouseId: string; toWarehouseId: string; items: StockTransfer['items']; note?: string }) => Promise<void>;
}

const Warehouses: React.FC<WarehousesProps> = ({ warehouses, items, transfers, onSaveWarehouse, onTransfer }) => {
  const allWarehouses = useMemo(() => withDefaultWarehouse(warehouses).filter(warehouse => warehouse.isActive !== false || warehouse.id === DEFAULT_WAREHOUSE_ID), [warehouses]);
  const nameOf = (id: string) => withDefaultWarehouse(warehouses).find(warehouse => warehouse.id === id)?.name || id;
  const stockItems = useMemo(() => items.filter(item => item.itemType !== 'JASA' && !item.isBundle), [items]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [fromId, setFromId] = useState(DEFAULT_WAREHOUSE_ID);
  const [toId, setToId] = useState('');
  const [lines, setLines] = useState<StockTransfer['items']>([]);
  const [lineSearch, setLineSearch] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const visibleItems = stockItems.filter(item => item.name.toLowerCase().includes(search.toLowerCase()) || item.code.toLowerCase().includes(search.toLowerCase())).slice(0, 200);
  const lineMatches = lineSearch.trim()
    ? stockItems.filter(item => (item.name.toLowerCase().includes(lineSearch.toLowerCase()) || item.code.toLowerCase().includes(lineSearch.toLowerCase())) && !lines.some(line => line.itemId === item.id)).slice(0, 8)
    : [];

  const openTransfer = () => {
    setFromId(DEFAULT_WAREHOUSE_ID);
    setToId(allWarehouses.find(warehouse => warehouse.id !== DEFAULT_WAREHOUSE_ID)?.id || '');
    setLines([]);
    setNote('');
    setShowTransfer(true);
  };

  const submitTransfer = async () => {
    if (!onTransfer) return;
    setSaving(true);
    try {
      await onTransfer({ fromWarehouseId: fromId, toWarehouseId: toId, items: lines, note: note || undefined });
      setShowTransfer(false);
    } catch (error: any) {
      alert(error?.message || 'Transfer gagal.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gudang & Transfer Stok"
        subtitle="Kasir menjual dari Gudang Utama. Pindahkan stok dari gudang/cabang lain ke Gudang Utama sebelum dijual."
        icon={<WarehouseIcon size={20} />}
        actions={<>
          {onSaveWarehouse && <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setEditing({ id: createId('W'), name: '', location: '', isActive: true })}>Tambah Gudang</Button>}
          {onTransfer && allWarehouses.length > 1 && <Button icon={<ArrowRightLeft size={16} />} onClick={openTransfer}>Transfer Stok</Button>}
        </>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {withDefaultWarehouse(warehouses).map(warehouse => (
          <div key={warehouse.id} className={`bg-white border rounded-2xl p-4 ${warehouse.isActive === false ? 'opacity-50' : ''}`}>
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-slate-800">{warehouse.name}</p>
                <p className="text-xs text-slate-400">{warehouse.location || '-'}{warehouse.id === DEFAULT_WAREHOUSE_ID ? ' • gudang jual' : ''}</p>
              </div>
              {onSaveWarehouse && warehouse.id !== DEFAULT_WAREHOUSE_ID && <Button variant="ghost" className="py-1 px-2 text-xs" onClick={() => setEditing(warehouse)}>Edit</Button>}
            </div>
            <p className="text-sm mt-3 text-slate-600">{stockItems.reduce((sum, item) => sum + Math.max(0, getWarehouseStock(item, warehouse.id)), 0).toLocaleString('id-ID')} unit</p>
          </div>
        ))}
      </div>

      <Card title="Stok per gudang" actions={
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${inputClass} pl-8 py-2 w-56`} placeholder="Cari barang..." value={search} onChange={event => setSearch(event.target.value)} />
        </div>
      }>
        {visibleItems.length === 0 ? <EmptyState text="Tidak ada barang." /> : (
          <Table headers={['Barang', ...allWarehouses.map(warehouse => warehouse.name), 'Total']} alignRight={allWarehouses.map((_, index) => index + 1).concat(allWarehouses.length + 1)}>
            {visibleItems.map(item => (
              <tr key={item.id}>
                <td className="px-5 py-2.5"><p className="font-medium">{item.name}</p><p className="text-xs text-slate-400">{item.code}</p></td>
                {allWarehouses.map(warehouse => {
                  const qty = getWarehouseStock(item, warehouse.id);
                  return <td key={warehouse.id} className={`px-5 py-2.5 text-right ${qty < 0 ? 'text-red-600 font-semibold' : ''}`}>{qty}</td>;
                })}
                <td className="px-5 py-2.5 text-right font-semibold">{item.stock}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Riwayat transfer">
        {transfers.length === 0 ? <EmptyState text="Belum ada transfer stok." /> : (
          <Table headers={['Waktu', 'No', 'Dari → Ke', 'Barang', 'Oleh']}>
            {transfers.slice(0, 50).map(transfer => (
              <tr key={transfer.id}>
                <td className="px-5 py-2.5 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(transfer.createdAt)}</td>
                <td className="px-5 py-2.5 text-xs">{transfer.transferNo}</td>
                <td className="px-5 py-2.5">{nameOf(transfer.fromWarehouseId)} → {nameOf(transfer.toWarehouseId)}</td>
                <td className="px-5 py-2.5 text-xs">{transfer.items.map(line => `${line.name} (${line.qty})`).join(', ')}</td>
                <td className="px-5 py-2.5 text-xs">{transfer.operatorName}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {editing && onSaveWarehouse && (
        <Modal title={warehouses.some(entry => entry.id === editing.id) ? 'Edit gudang' : 'Tambah gudang'} onClose={() => setEditing(null)} footer={<>
          <Button variant="secondary" onClick={() => setEditing(null)}>Batal</Button>
          <Button disabled={!editing.name.trim()} onClick={() => { onSaveWarehouse({ ...editing, name: editing.name.trim() }); setEditing(null); }}>Simpan</Button>
        </>}>
          <div className="space-y-4">
            <Field label="Nama gudang / cabang"><input autoFocus className={inputClass} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} /></Field>
            <Field label="Lokasi"><input className={inputClass} value={editing.location} onChange={event => setEditing({ ...editing, location: event.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.isActive !== false} onChange={event => setEditing({ ...editing, isActive: event.target.checked })} /> Aktif</label>
            {editing.isActive === false && stockItems.some(item => getWarehouseStock(item, editing.id) !== 0) && (
              <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg">Gudang ini masih menyimpan stok. Pindahkan stoknya dulu sebelum dinonaktifkan.</p>
            )}
          </div>
        </Modal>
      )}

      {showTransfer && onTransfer && (
        <Modal wide title="Transfer stok antar gudang" onClose={() => setShowTransfer(false)} footer={<>
          <Button variant="secondary" onClick={() => setShowTransfer(false)}>Batal</Button>
          <Button disabled={saving || !toId || fromId === toId || lines.length === 0} onClick={submitTransfer}>{saving ? 'Memproses...' : 'Pindahkan'}</Button>
        </>}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Dari gudang"><select className={inputClass} value={fromId} onChange={event => { setFromId(event.target.value); setLines([]); }}>{allWarehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></Field>
            <Field label="Ke gudang"><select className={inputClass} value={toId} onChange={event => setToId(event.target.value)}><option value="">—</option>{allWarehouses.filter(warehouse => warehouse.id !== fromId).map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></Field>
            <Field label="Catatan"><input className={inputClass} value={note} onChange={event => setNote(event.target.value)} /></Field>
          </div>
          <div className="relative mt-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClass} pl-8`} placeholder="Tambah barang..." value={lineSearch} onChange={event => setLineSearch(event.target.value)} />
            {lineMatches.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg">
                {lineMatches.map(item => (
                  <button key={item.id} type="button" className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm flex justify-between" onClick={() => { setLines([...lines, { itemId: item.id, name: item.name, qty: 1 }]); setLineSearch(''); }}>
                    <span>{item.name}</span><span className="text-xs text-slate-500">tersedia {getWarehouseStock(item, fromId)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mt-3 space-y-2">
            {lines.map((line, index) => {
              const item = items.find(entry => entry.id === line.itemId);
              const available = item ? getWarehouseStock(item, fromId) : 0;
              return (
                <div key={line.itemId} className="flex items-center gap-3 p-2 border border-slate-100 rounded-xl">
                  <span className="flex-1 text-sm">{line.name} <span className="text-xs text-slate-400">(tersedia {available})</span></span>
                  <input aria-label={`Qty ${line.name}`} type="number" min={1} max={available} className={`${inputClass} w-24 ${line.qty > available ? 'border-red-400' : ''}`} value={line.qty} onChange={event => setLines(lines.map((entry, i) => (i === index ? { ...entry, qty: Math.max(1, Number(event.target.value) || 1) } : entry)))} />
                  <button type="button" className="p-2 text-slate-400 hover:text-red-600" onClick={() => setLines(lines.filter((_, i) => i !== index))} aria-label={`Hapus ${line.name}`}><Trash2 size={16} /></button>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Warehouses;
