import React, { useMemo, useState } from 'react';
import { Undo2, Plus, Trash2, Search } from 'lucide-react';
import { Item, PurchaseOrder, PurchaseReturn, Supplier, Warehouse } from '../types';
import { Button, Card, EmptyState, Field, formatDateTime, formatRp, inputClass, Modal, PageHeader, Table } from '../components/ui';
import { DEFAULT_WAREHOUSE_ID, getWarehouseStock, withDefaultWarehouse } from '../services/warehouses';
import { getPurchaseOrderOutstanding } from '../services/fullOps';

type NewReturn = Omit<PurchaseReturn, 'id' | 'returnNo' | 'total' | 'createdAt' | 'operatorName' | 'operatorId'>;

interface PurchaseReturnsProps {
  suppliers: Supplier[];
  items: Item[];
  purchaseOrders: PurchaseOrder[];
  purchaseReturns: PurchaseReturn[];
  warehouses: Warehouse[];
  onCreate?: (input: NewReturn) => Promise<void>;
}

const SETTLEMENT_LABEL: Record<PurchaseReturn['settlement'], string> = {
  POTONG_HUTANG: 'Potong hutang',
  REFUND_TUNAI: 'Refund tunai',
  REFUND_BANK: 'Refund transfer',
};

const PurchaseReturns: React.FC<PurchaseReturnsProps> = ({ suppliers, items, purchaseOrders, purchaseReturns, warehouses, onCreate }) => {
  const allWarehouses = withDefaultWarehouse(warehouses);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<NewReturn>({ supplierId: '', supplierName: '', warehouseId: DEFAULT_WAREHOUSE_ID, items: [], settlement: 'POTONG_HUTANG' });
  const [lineSearch, setLineSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const supplierPos = useMemo(() => purchaseOrders.filter(po => po.supplierId === draft.supplierId && po.items.some(line => line.receivedQty > 0)), [purchaseOrders, draft.supplierId]);
  const selectedPo = purchaseOrders.find(po => po.id === draft.purchaseOrderId);
  const candidateItems = selectedPo
    ? items.filter(item => selectedPo.items.some(line => line.itemId === item.id && line.receivedQty > 0))
    : items.filter(item => item.itemType !== 'JASA' && !item.isBundle);
  const lineMatches = lineSearch.trim()
    ? candidateItems.filter(item => (item.name.toLowerCase().includes(lineSearch.toLowerCase()) || item.code.toLowerCase().includes(lineSearch.toLowerCase())) && !draft.items.some(line => line.itemId === item.id)).slice(0, 8)
    : [];
  const total = draft.items.reduce((sum, line) => sum + line.qty * line.cost, 0);
  const outstanding = selectedPo ? getPurchaseOrderOutstanding(selectedPo, purchaseReturns) : null;

  const costFor = (item: Item) => {
    const poLine = selectedPo?.items.find(line => line.itemId === item.id);
    if (poLine) return Math.round(poLine.cost * (1 - Math.min(100, Math.max(0, selectedPo?.discount || 0)) / 100));
    return item.basePrice || 0;
  };

  const start = () => {
    setDraft({ supplierId: suppliers[0]?.id || '', supplierName: suppliers[0]?.name || '', warehouseId: DEFAULT_WAREHOUSE_ID, items: [], settlement: 'POTONG_HUTANG' });
    setOpen(true);
  };

  const submit = async () => {
    if (!onCreate) return;
    setSaving(true);
    try {
      await onCreate(draft);
      setOpen(false);
    } catch (error: any) {
      alert(error?.message || 'Retur beli gagal.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Retur Pembelian"
        subtitle="Kembalikan barang cacat/salah kirim ke supplier: stok berkurang, hutang dipotong atau supplier mengembalikan uang."
        icon={<Undo2 size={20} />}
        actions={onCreate && <Button icon={<Plus size={16} />} disabled={suppliers.length === 0} onClick={start}>Retur Baru</Button>}
      />
      <Card title="Riwayat retur pembelian">
        {purchaseReturns.length === 0 ? <EmptyState text="Belum ada retur pembelian." /> : (
          <Table headers={['Waktu', 'No', 'Supplier', 'PO', 'Barang', 'Penyelesaian', 'Nilai']} alignRight={[6]}>
            {purchaseReturns.map(ret => (
              <tr key={ret.id}>
                <td className="px-5 py-2.5 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(ret.createdAt)}</td>
                <td className="px-5 py-2.5 text-xs">{ret.returnNo}</td>
                <td className="px-5 py-2.5">{ret.supplierName}</td>
                <td className="px-5 py-2.5 text-xs">{ret.purchaseOrderId || '-'}</td>
                <td className="px-5 py-2.5 text-xs">{ret.items.map(line => `${line.name} (${line.qty})`).join(', ')}</td>
                <td className="px-5 py-2.5 text-xs">{SETTLEMENT_LABEL[ret.settlement]}</td>
                <td className="px-5 py-2.5 text-right font-semibold">{formatRp(ret.total)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {open && onCreate && (
        <Modal wide title="Retur pembelian baru" onClose={() => setOpen(false)} footer={<>
          <span className="mr-auto text-sm text-slate-500 self-center">Nilai retur: <b className="text-slate-900">{formatRp(total)}</b></span>
          <Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
          <Button disabled={saving || !draft.supplierId || draft.items.length === 0} onClick={submit}>{saving ? 'Memproses...' : 'Simpan Retur'}</Button>
        </>}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Field label="Supplier">
              <select className={inputClass} value={draft.supplierId} onChange={event => {
                const supplier = suppliers.find(entry => entry.id === event.target.value);
                setDraft({ ...draft, supplierId: event.target.value, supplierName: supplier?.name || '', purchaseOrderId: undefined, items: [] });
              }}>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>
            </Field>
            <Field label="Dari PO (opsional)" hint={outstanding !== null ? `Sisa hutang PO: ${formatRp(outstanding)}` : undefined}>
              <select className={inputClass} value={draft.purchaseOrderId || ''} onChange={event => setDraft({ ...draft, purchaseOrderId: event.target.value || undefined, items: [] })}>
                <option value="">— Tanpa PO —</option>
                {supplierPos.map(po => <option key={po.id} value={po.id}>{po.id} ({formatRp(po.total)})</option>)}
              </select>
            </Field>
            <Field label="Ambil dari gudang">
              <select className={inputClass} value={draft.warehouseId} onChange={event => setDraft({ ...draft, warehouseId: event.target.value })}>{allWarehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
            </Field>
            <Field label="Penyelesaian">
              <select className={inputClass} value={draft.settlement} onChange={event => setDraft({ ...draft, settlement: event.target.value as PurchaseReturn['settlement'] })}>
                {(Object.keys(SETTLEMENT_LABEL) as PurchaseReturn['settlement'][]).map(key => <option key={key} value={key}>{SETTLEMENT_LABEL[key]}</option>)}
              </select>
            </Field>
          </div>
          <div className="relative mt-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClass} pl-8`} placeholder="Tambah barang yang diretur..." value={lineSearch} onChange={event => setLineSearch(event.target.value)} />
            {lineMatches.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg">
                {lineMatches.map(item => (
                  <button key={item.id} type="button" className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm flex justify-between" onClick={() => { setDraft({ ...draft, items: [...draft.items, { itemId: item.id, name: item.name, qty: 1, cost: costFor(item) }] }); setLineSearch(''); }}>
                    <span>{item.name}</span><span className="text-xs text-slate-500">stok gudang {getWarehouseStock(item, draft.warehouseId)} • modal {formatRp(costFor(item))}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mt-3 space-y-2">
            {draft.items.map((line, index) => (
              <div key={line.itemId} className="grid grid-cols-12 gap-2 items-center p-2 border border-slate-100 rounded-xl">
                <span className="col-span-12 md:col-span-5 text-sm">{line.name}</span>
                <input aria-label={`Qty ${line.name}`} type="number" min={1} className={`${inputClass} col-span-4 md:col-span-2`} value={line.qty} onChange={event => setDraft({ ...draft, items: draft.items.map((entry, i) => (i === index ? { ...entry, qty: Math.max(1, Number(event.target.value) || 1) } : entry)) })} />
                <input aria-label={`Harga ${line.name}`} type="number" min={0} className={`${inputClass} col-span-5 md:col-span-2`} value={line.cost} onChange={event => setDraft({ ...draft, items: draft.items.map((entry, i) => (i === index ? { ...entry, cost: Math.max(0, Number(event.target.value) || 0) } : entry)) })} />
                <span className="col-span-2 md:col-span-2 text-right text-sm font-semibold">{formatRp(line.qty * line.cost)}</span>
                <button type="button" className="col-span-1 justify-self-end p-2 text-slate-400 hover:text-red-600" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })} aria-label={`Hapus ${line.name}`}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default PurchaseReturns;
