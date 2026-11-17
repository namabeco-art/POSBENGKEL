import React, { useMemo, useState } from 'react';
import { Wrench, Plus, Trash2, Send, Printer, Wallet, Search } from 'lucide-react';
import { Customer, Item, Mechanic, ServiceOrder, ServiceOrderLine, ServiceOrderStatus, User } from '../types';
import { Button, Card, EmptyState, Field, formatDateTime, formatRp, inputClass, Modal, PageHeader, PAYMENT_METHOD_OPTIONS, Table } from '../components/ui';
import { createDocumentNo, createId } from '../services/idService';
import { getSellPrice } from '../services/pricing';

interface ServiceOrdersProps {
  orders: ServiceOrder[];
  customers: Customer[];
  items: Item[];
  mechanics: Mechanic[];
  currentUser: User;
  onSave: (order: ServiceOrder) => Promise<void>;
  onReceiveDp: (orderId: string, amount: number, method: string) => Promise<void>;
  onSendToPos: (order: ServiceOrder) => void;
}

const STATUS_STYLE: Record<ServiceOrderStatus, string> = {
  ESTIMASI: 'bg-slate-100 text-slate-700',
  DIKERJAKAN: 'bg-amber-100 text-amber-800',
  SELESAI: 'bg-emerald-100 text-emerald-800',
  DIFAKTURKAN: 'bg-indigo-100 text-indigo-800',
  BATAL: 'bg-red-100 text-red-700',
};

const NEXT_STATUS: Partial<Record<ServiceOrderStatus, ServiceOrderStatus>> = { ESTIMASI: 'DIKERJAKAN', DIKERJAKAN: 'SELESAI' };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

const printOrder = (order: ServiceOrder) => {
  const rows = order.lines.map(line => `<tr><td>${escapeHtml(line.name)}${line.isJasa ? ' (jasa)' : ''}</td><td style="text-align:right">${line.qty}</td><td style="text-align:right">${Math.round(line.price).toLocaleString('id-ID')}</td><td style="text-align:right">${Math.round(line.qty * line.price).toLocaleString('id-ID')}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(order.orderNo)}</title>
  <style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:6px}th{text-align:left}</style></head><body>
  <h2>${order.status === 'ESTIMASI' ? 'ESTIMASI BIAYA SERVIS' : 'WORK ORDER SERVIS'}</h2>
  <p>No: <b>${escapeHtml(order.orderNo)}</b> &nbsp; Tanggal: ${escapeHtml(formatDateTime(order.createdAt))}</p>
  <p>Pelanggan: <b>${escapeHtml(order.customerName)}</b> &nbsp; Kendaraan: ${escapeHtml([order.vehiclePlate, order.vehicleModel].filter(Boolean).join(' / ') || '-')} &nbsp; KM: ${order.odometer || '-'}</p>
  <p>Keluhan: ${escapeHtml(order.complaint || '-')} &nbsp; Mekanik: ${escapeHtml(order.mechanicName || '-')}</p>
  <table><thead><tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Harga</th><th style="text-align:right">Jumlah</th></tr></thead><tbody>${rows}</tbody></table>
  <p style="text-align:right;font-size:14px">Total estimasi: <b>Rp ${Math.round(order.estimatedTotal).toLocaleString('id-ID')}</b>${order.dpAmount ? `<br/>Uang muka: Rp ${Math.round(order.dpAmount).toLocaleString('id-ID')}` : ''}</p>
  <p style="margin-top:40px">Tanda tangan pelanggan: ____________________</p>
  <script>window.onload=()=>{window.print();}</script></body></html>`;
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) return alert('Pop-up diblokir browser. Izinkan pop-up untuk mencetak.');
  win.document.write(html);
  win.document.close();
};

const emptyOrder = (user: User): ServiceOrder => ({
  id: createId('WO'),
  orderNo: createDocumentNo('WO'),
  status: 'ESTIMASI',
  customerId: 'UMUM',
  customerName: '',
  lines: [],
  estimatedTotal: 0,
  createdAt: new Date().toISOString(),
  operatorName: user.name,
  operatorId: user.id,
});

const ServiceOrders: React.FC<ServiceOrdersProps> = ({ orders, customers, items, mechanics, currentUser, onSave, onReceiveDp, onSendToPos }) => {
  const [filter, setFilter] = useState<'AKTIF' | ServiceOrderStatus | 'SEMUA'>('AKTIF');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ServiceOrder | null>(null);
  const [itemSearch, setItemSearch] = useState('');
  const [dpOrder, setDpOrder] = useState<ServiceOrder | null>(null);
  const [dpAmount, setDpAmount] = useState(0);
  const [dpMethod, setDpMethod] = useState('TUNAI');
  const [saving, setSaving] = useState(false);
  const activeMechanics = mechanics.filter(mechanic => mechanic.isActive);

  const visible = useMemo(() => orders
    .filter(order => filter === 'SEMUA' || (filter === 'AKTIF' ? !['DIFAKTURKAN', 'BATAL'].includes(order.status) : order.status === filter))
    .filter(order => [order.orderNo, order.customerName, order.vehiclePlate || ''].some(text => text.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [orders, filter, search]);

  const customer = editing ? customers.find(entry => entry.id === editing.customerId) : undefined;
  const itemMatches = useMemo(() => {
    if (!itemSearch.trim()) return [];
    const term = itemSearch.toLowerCase();
    return items.filter(item => item.isActive !== false && (item.name.toLowerCase().includes(term) || item.code.toLowerCase().includes(term) || item.barcode.includes(itemSearch))).slice(0, 8);
  }, [items, itemSearch]);

  const updateLine = (index: number, patch: Partial<ServiceOrderLine>) => {
    if (!editing) return;
    setEditing({ ...editing, lines: editing.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) });
  };

  const addItem = (item: Item) => {
    if (!editing) return;
    const price = getSellPrice(item, customer?.level || 1);
    setEditing({ ...editing, lines: [...editing.lines, { itemId: item.id, name: item.name, qty: 1, price, isJasa: item.itemType === 'JASA', mechanicId: item.itemType === 'JASA' ? editing.mechanicId : undefined }] });
    setItemSearch('');
  };

  const save = async (order: ServiceOrder) => {
    setSaving(true);
    try {
      const mechanic = mechanics.find(entry => entry.id === order.mechanicId);
      await onSave({ ...order, mechanicName: mechanic?.name });
      setEditing(null);
    } catch (error: any) {
      alert(error?.message || 'Gagal menyimpan WO.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (order: ServiceOrder, status: ServiceOrderStatus) => {
    if (status === 'BATAL' && !window.confirm(`Batalkan ${order.orderNo}?${order.dpAmount ? ' DP tetap tersimpan sebagai deposit pelanggan (kembalikan lewat menu Deposit bila perlu).' : ''}`)) return;
    try {
      await onSave({ ...order, status });
    } catch (error: any) {
      alert(error?.message || 'Gagal mengubah status.');
    }
  };

  const submitDp = async () => {
    if (!dpOrder) return;
    setSaving(true);
    try {
      await onReceiveDp(dpOrder.id, dpAmount, dpMethod);
      setDpOrder(null);
    } catch (error: any) {
      alert(error?.message || 'Gagal menerima DP.');
    } finally {
      setSaving(false);
    }
  };

  const editingTotal = editing ? editing.lines.reduce((sum, line) => sum + line.qty * line.price, 0) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Servis / Work Order"
        subtitle="Estimasi biaya → dikerjakan → selesai → dibuatkan faktur di kasir. DP masuk ke deposit pelanggan."
        icon={<Wrench size={20} />}
        actions={<Button icon={<Plus size={16} />} onClick={() => setEditing(emptyOrder(currentUser))}>WO Baru</Button>}
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {(['AKTIF', 'ESTIMASI', 'DIKERJAKAN', 'SELESAI', 'DIFAKTURKAN', 'BATAL', 'SEMUA'] as const).map(status => (
            <button key={status} type="button" onClick={() => setFilter(status)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filter === status ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{status}</button>
          ))}
          <div className="relative ml-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClass} pl-8 py-2 w-56`} placeholder="No WO / pelanggan / plat" value={search} onChange={event => setSearch(event.target.value)} />
          </div>
        </div>
        {visible.length === 0 ? <EmptyState text="Belum ada Work Order." /> : (
          <Table headers={['No / Tanggal', 'Pelanggan & Kendaraan', 'Mekanik', 'Status', 'Estimasi', 'DP', '']} alignRight={[4, 5, 6]}>
            {visible.map(order => (
              <tr key={order.id} className="hover:bg-slate-50 align-top">
                <td className="px-5 py-3"><p className="font-semibold text-slate-800">{order.orderNo}</p><p className="text-xs text-slate-400">{formatDateTime(order.createdAt)}</p></td>
                <td className="px-5 py-3"><p className="font-medium">{order.customerName}</p><p className="text-xs text-slate-500">{[order.vehiclePlate, order.vehicleModel].filter(Boolean).join(' • ') || '-'}</p>{order.complaint && <p className="text-xs text-slate-400 mt-0.5">{order.complaint}</p>}</td>
                <td className="px-5 py-3 text-slate-600">{order.mechanicName || '-'}</td>
                <td className="px-5 py-3"><span className={`px-2 py-1 rounded-md text-[11px] font-bold ${STATUS_STYLE[order.status]}`}>{order.status}</span>{order.invoiceNo && <p className="text-[11px] text-slate-400 mt-1">{order.invoiceNo}</p>}</td>
                <td className="px-5 py-3 text-right font-semibold">{formatRp(order.estimatedTotal)}</td>
                <td className="px-5 py-3 text-right">{order.dpAmount ? formatRp(order.dpAmount) : '-'}</td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {!['DIFAKTURKAN', 'BATAL'].includes(order.status) && <Button variant="secondary" className="py-1.5 px-2.5 text-xs" onClick={() => setEditing(order)}>Edit</Button>}
                    {NEXT_STATUS[order.status] && <Button variant="secondary" className="py-1.5 px-2.5 text-xs" onClick={() => changeStatus(order, NEXT_STATUS[order.status]!)}>→ {NEXT_STATUS[order.status]}</Button>}
                    {!['DIFAKTURKAN', 'BATAL'].includes(order.status) && <Button variant="secondary" className="py-1.5 px-2.5 text-xs" icon={<Wallet size={12} />} onClick={() => { setDpOrder(order); setDpAmount(0); setDpMethod('TUNAI'); }}>DP</Button>}
                    {!['DIFAKTURKAN', 'BATAL'].includes(order.status) && order.lines.length > 0 && <Button className="py-1.5 px-2.5 text-xs" icon={<Send size={12} />} onClick={() => onSendToPos(order)}>Faktur di Kasir</Button>}
                    <Button variant="ghost" className="py-1.5 px-2 text-xs" icon={<Printer size={12} />} onClick={() => printOrder(order)} aria-label={`Cetak ${order.orderNo}`} />
                    {['ESTIMASI', 'DIKERJAKAN', 'SELESAI'].includes(order.status) && <Button variant="ghost" className="py-1.5 px-2 text-xs text-red-600" onClick={() => changeStatus(order, 'BATAL')}>Batal</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {editing && (
        <Modal
          wide
          title={`${orders.some(order => order.id === editing.id) ? 'Edit' : 'Buat'} ${editing.orderNo}`}
          onClose={() => setEditing(null)}
          footer={<>
            <span className="mr-auto text-sm text-slate-500 self-center">Total estimasi: <b className="text-slate-900">{formatRp(editingTotal)}</b></span>
            <Button variant="secondary" onClick={() => setEditing(null)}>Batal</Button>
            <Button disabled={saving} onClick={() => save(editing)}>{saving ? 'Menyimpan...' : 'Simpan WO'}</Button>
          </>}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Pelanggan terdaftar" hint="Wajib pelanggan terdaftar jika menerima DP.">
              <select className={inputClass} value={editing.customerId} onChange={event => {
                const picked = customers.find(entry => entry.id === event.target.value);
                setEditing({ ...editing, customerId: event.target.value, customerName: picked ? picked.name : editing.customerName });
              }}>
                <option value="UMUM">— Umum / belum terdaftar —</option>
                {customers.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            </Field>
            <Field label="Nama pelanggan">
              <input className={inputClass} value={editing.customerName} onChange={event => setEditing({ ...editing, customerName: event.target.value })} />
            </Field>
            <Field label="Mekanik utama">
              <select className={inputClass} value={editing.mechanicId || ''} onChange={event => setEditing({ ...editing, mechanicId: event.target.value || undefined })}>
                <option value="">—</option>
                {activeMechanics.map(mechanic => <option key={mechanic.id} value={mechanic.id}>{mechanic.name}</option>)}
              </select>
            </Field>
            <Field label="No. polisi"><input className={inputClass} value={editing.vehiclePlate || ''} onChange={event => setEditing({ ...editing, vehiclePlate: event.target.value.toUpperCase() })} /></Field>
            <Field label="Kendaraan / tipe"><input className={inputClass} value={editing.vehicleModel || ''} onChange={event => setEditing({ ...editing, vehicleModel: event.target.value })} /></Field>
            <Field label="Kilometer"><input type="number" min={0} className={inputClass} value={editing.odometer || ''} onChange={event => setEditing({ ...editing, odometer: Number(event.target.value) || undefined })} /></Field>
            <Field label="Keluhan / pekerjaan" className="md:col-span-3"><textarea rows={2} className={inputClass} value={editing.complaint || ''} onChange={event => setEditing({ ...editing, complaint: event.target.value })} /></Field>
          </div>

          <div className="mt-5">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={`${inputClass} pl-8`} placeholder="Tambah sparepart / jasa (cari nama, kode, barcode)" value={itemSearch} onChange={event => setItemSearch(event.target.value)} />
              {itemMatches.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                  {itemMatches.map(item => (
                    <button key={item.id} type="button" onClick={() => addItem(item)} className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex justify-between text-sm">
                      <span>{item.name} <span className="text-xs text-slate-400">{item.code}{item.itemType === 'JASA' ? ' • JASA' : ` • stok ${item.stock}`}</span></span>
                      <span className="font-semibold">{formatRp(getSellPrice(item, customer?.level || 1))}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {editing.lines.length === 0 ? <EmptyState text="Belum ada item." /> : (
              <div className="mt-3 space-y-2">
                {editing.lines.map((line, index) => (
                  <div key={`${line.itemId}-${index}`} className="grid grid-cols-12 gap-2 items-center p-2 border border-slate-100 rounded-xl">
                    <div className="col-span-12 md:col-span-4 text-sm font-medium">{line.name}{line.isJasa && <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">JASA</span>}</div>
                    <input aria-label={`Qty ${line.name}`} type="number" min={1} className={`${inputClass} col-span-3 md:col-span-1`} value={line.qty} onChange={event => updateLine(index, { qty: Math.max(1, Number(event.target.value) || 1) })} />
                    <input aria-label={`Harga ${line.name}`} type="number" min={0} className={`${inputClass} col-span-4 md:col-span-2`} value={line.price} onChange={event => updateLine(index, { price: Math.max(0, Number(event.target.value) || 0) })} />
                    <select aria-label={`Mekanik ${line.name}`} className={`${inputClass} col-span-5 md:col-span-3`} value={line.mechanicId || ''} onChange={event => updateLine(index, { mechanicId: event.target.value || undefined })}>
                      <option value="">Mekanik —</option>
                      {activeMechanics.map(mechanic => <option key={mechanic.id} value={mechanic.id}>{mechanic.name}</option>)}
                    </select>
                    <div className="col-span-10 md:col-span-1 text-right text-sm font-semibold">{formatRp(line.qty * line.price)}</div>
                    <button type="button" className="col-span-2 md:col-span-1 justify-self-end p-2 text-slate-400 hover:text-red-600" onClick={() => setEditing({ ...editing, lines: editing.lines.filter((_, i) => i !== index) })} aria-label={`Hapus ${line.name}`}><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {dpOrder && (
        <Modal title={`Terima DP — ${dpOrder.orderNo}`} onClose={() => setDpOrder(null)} footer={<>
          <Button variant="secondary" onClick={() => setDpOrder(null)}>Batal</Button>
          <Button disabled={saving || dpAmount <= 0} onClick={submitDp}>{saving ? 'Menyimpan...' : 'Simpan DP'}</Button>
        </>}>
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Estimasi {formatRp(dpOrder.estimatedTotal)} • DP sebelumnya {formatRp(dpOrder.dpAmount || 0)}. DP masuk ke deposit {dpOrder.customerName} dan otomatis dipakai saat faktur dibuat.</p>
            <Field label="Nominal DP (Rp)"><input type="number" min={0} autoFocus className={inputClass} value={dpAmount || ''} onChange={event => setDpAmount(Math.max(0, Number(event.target.value) || 0))} /></Field>
            <Field label="Diterima via">
              <select className={inputClass} value={dpMethod} onChange={event => setDpMethod(event.target.value)}>
                {PAYMENT_METHOD_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ServiceOrders;
