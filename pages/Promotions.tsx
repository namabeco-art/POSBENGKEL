import React, { useState } from 'react';
import { Tag, Plus, Trash2 } from 'lucide-react';
import { Item, PromotionCampaign, User } from '../types';
import { Button, Card, EmptyState, Field, formatRp, inputClass, Modal, PageHeader, Table } from '../components/ui';
import { createId } from '../services/idService';
import { isPromotionActiveAt } from '../services/promotions';

interface PromotionsProps {
  promotions: PromotionCampaign[];
  items: Item[];
  currentUser: User;
  onSave?: (promo: PromotionCampaign) => void;
  onDelete?: (id: string) => void;
}

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const describe = (promo: PromotionCampaign, items: Item[]) => {
  const name = (id?: string) => items.find(item => item.id === id)?.name || '?';
  if (promo.kind === 'BUY_X_GET_Y') return `Beli ${promo.buyQty} ${name(promo.buyItemId)} gratis ${promo.freeQty} ${name(promo.freeItemId)}${promo.isMultiple ? ' (kelipatan)' : ''}`;
  return `${promo.type === 'PERCENT' ? `${promo.value}%` : formatRp(promo.value)} dari total${promo.minSubtotal ? `, min. belanja ${formatRp(promo.minSubtotal)}` : ''}`;
};

const schedule = (promo: PromotionCampaign) => {
  const days = promo.daysOfWeek?.length ? promo.daysOfWeek.map(day => DAYS[day]).join(', ') : 'Setiap hari';
  const hours = promo.timeStart && promo.timeEnd ? ` ${promo.timeStart}–${promo.timeEnd}` : '';
  return `${days}${hours}`;
};

const Promotions: React.FC<PromotionsProps> = ({ promotions, items, currentUser, onSave, onDelete }) => {
  const [editing, setEditing] = useState<PromotionCampaign | null>(null);
  const now = new Date();
  const sellable = items.filter(item => item.isActive !== false);

  const startNew = (kind: PromotionCampaign['kind']) => setEditing({
    id: createId('PROMO'), name: '', kind, type: 'PERCENT', value: kind === 'BUY_X_GET_Y' ? 0 : 5, startAt: new Date().toISOString(), isActive: true,
    priority: 10, createdBy: currentUser.name, buyQty: 2, freeQty: 1, isMultiple: true,
  });

  const save = () => {
    if (!editing || !onSave) return;
    if (!editing.name.trim()) return alert('Nama promo wajib diisi.');
    if (editing.kind === 'BUY_X_GET_Y') {
      if (!editing.buyItemId || !editing.freeItemId) return alert('Pilih barang yang dibeli dan barang bonus.');
      if (!(editing.buyQty && editing.buyQty > 0) || !(editing.freeQty && editing.freeQty > 0)) return alert('Jumlah beli dan bonus harus lebih dari 0.');
    } else if (!(editing.value > 0) || (editing.type === 'PERCENT' && editing.value > 100)) {
      return alert('Nilai diskon tidak valid.');
    }
    if ((editing.timeStart && !editing.timeEnd) || (!editing.timeStart && editing.timeEnd)) return alert('Isi jam mulai dan jam selesai, atau kosongkan keduanya.');
    onSave({ ...editing, name: editing.name.trim() });
    setEditing(null);
  };

  const toggleDay = (day: number) => {
    if (!editing) return;
    const current = new Set(editing.daysOfWeek || []);
    if (current.has(day)) current.delete(day); else current.add(day);
    setEditing({ ...editing, daysOfWeek: Array.from(current).sort() });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promo"
        subtitle="Diskon faktur terjadwal (hari & jam tertentu) dan Beli X Gratis Y yang otomatis masuk di kasir."
        icon={<Tag size={20} />}
        actions={onSave && <>
          <Button variant="secondary" icon={<Plus size={16} />} onClick={() => startNew('TRANSACTION')}>Diskon Faktur</Button>
          <Button icon={<Plus size={16} />} onClick={() => startNew('BUY_X_GET_Y')}>Beli X Gratis Y</Button>
        </>}
      />
      <Card>
        {promotions.length === 0 ? <EmptyState text="Belum ada promo." /> : (
          <Table headers={['Promo', 'Aturan', 'Jadwal', 'Level min.', 'Prioritas', 'Status', '']}>
            {[...promotions].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)).map(promo => {
              const live = isPromotionActiveAt(promo, now, 4);
              return (
                <tr key={promo.id}>
                  <td className="px-5 py-3 font-medium">{promo.name}<span className="block text-[11px] text-slate-400">{promo.kind === 'BUY_X_GET_Y' ? 'Beli X Gratis Y (otomatis)' : 'Diskon faktur (dipilih kasir)'}</span></td>
                  <td className="px-5 py-3 text-xs">{describe(promo, items)}</td>
                  <td className="px-5 py-3 text-xs">{schedule(promo)}<span className="block text-slate-400">{toLocalInput(promo.startAt).replace('T', ' ')}{promo.endAt ? ` s/d ${toLocalInput(promo.endAt).replace('T', ' ')}` : ''}</span></td>
                  <td className="px-5 py-3 text-xs">Lv.{promo.minCustomerLevel || 1}</td>
                  <td className="px-5 py-3 text-xs">{promo.priority ?? '-'}</td>
                  <td className="px-5 py-3 text-xs">{!promo.isActive ? <span className="text-slate-400">Nonaktif</span> : live ? <span className="text-emerald-700 font-semibold">Berlaku sekarang</span> : <span className="text-amber-700">Di luar jadwal</span>}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {onSave && <Button variant="ghost" className="py-1 px-2 text-xs" onClick={() => setEditing(promo)}>Edit</Button>}
                    {onDelete && <button type="button" className="p-2 text-slate-400 hover:text-red-600" aria-label={`Hapus ${promo.name}`} onClick={() => window.confirm(`Hapus promo "${promo.name}"?`) && onDelete(promo.id)}><Trash2 size={15} /></button>}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {editing && (
        <Modal wide title={promotions.some(promo => promo.id === editing.id) ? 'Edit promo' : 'Promo baru'} onClose={() => setEditing(null)} footer={<>
          <Button variant="secondary" onClick={() => setEditing(null)}>Batal</Button>
          <Button onClick={save}>Simpan</Button>
        </>}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nama promo"><input autoFocus className={inputClass} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} /></Field>
            <Field label="Prioritas" hint="Angka kecil diutamakan bila ada promo yang bentrok."><input type="number" min={1} className={inputClass} value={editing.priority ?? 10} onChange={event => setEditing({ ...editing, priority: Math.max(1, Number(event.target.value) || 1) })} /></Field>
            {editing.kind === 'BUY_X_GET_Y' ? (<>
              <Field label="Barang yang dibeli"><select className={inputClass} value={editing.buyItemId || ''} onChange={event => setEditing({ ...editing, buyItemId: event.target.value })}><option value="">—</option>{sellable.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="Jumlah beli (satuan dasar)"><input type="number" min={1} className={inputClass} value={editing.buyQty || ''} onChange={event => setEditing({ ...editing, buyQty: Math.max(1, Number(event.target.value) || 1) })} /></Field>
              <Field label="Barang bonus"><select className={inputClass} value={editing.freeItemId || ''} onChange={event => setEditing({ ...editing, freeItemId: event.target.value })}><option value="">—</option>{sellable.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="Jumlah bonus"><input type="number" min={1} className={inputClass} value={editing.freeQty || ''} onChange={event => setEditing({ ...editing, freeQty: Math.max(1, Number(event.target.value) || 1) })} /></Field>
              <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={Boolean(editing.isMultiple)} onChange={event => setEditing({ ...editing, isMultiple: event.target.checked })} /> Berlaku kelipatan (beli 4 gratis 2, dst.)</label>
            </>) : (<>
              <Field label="Jenis diskon"><select className={inputClass} value={editing.type} onChange={event => setEditing({ ...editing, type: event.target.value as PromotionCampaign['type'] })}><option value="PERCENT">Persen (%)</option><option value="FIXED">Rupiah</option></select></Field>
              <Field label={editing.type === 'PERCENT' ? 'Diskon (%)' : 'Diskon (Rp)'}><input type="number" min={0} className={inputClass} value={editing.value || ''} onChange={event => setEditing({ ...editing, value: Math.max(0, Number(event.target.value) || 0) })} /></Field>
              <Field label="Minimal belanja (Rp)"><input type="number" min={0} className={inputClass} value={editing.minSubtotal || ''} onChange={event => setEditing({ ...editing, minSubtotal: Math.max(0, Number(event.target.value) || 0) || undefined })} /></Field>
            </>)}
            <Field label="Level pelanggan minimal"><select className={inputClass} value={editing.minCustomerLevel || 1} onChange={event => setEditing({ ...editing, minCustomerLevel: Number(event.target.value) })}>{[1, 2, 3, 4].map(level => <option key={level} value={level}>Level {level}{level === 1 ? ' (semua)' : '+'}</option>)}</select></Field>
            <Field label="Mulai"><input type="datetime-local" className={inputClass} value={toLocalInput(editing.startAt)} onChange={event => event.target.value && setEditing({ ...editing, startAt: new Date(event.target.value).toISOString() })} /></Field>
            <Field label="Berakhir (opsional)"><input type="datetime-local" className={inputClass} value={toLocalInput(editing.endAt)} onChange={event => setEditing({ ...editing, endAt: event.target.value ? new Date(event.target.value).toISOString() : undefined })} /></Field>
            <div className="md:col-span-2">
              <span className="text-xs font-semibold text-slate-600 block mb-1.5">Hari berlaku (kosong = setiap hari)</span>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((label, day) => (
                  <button key={label} type="button" onClick={() => toggleDay(day)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${editing.daysOfWeek?.includes(day) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>
                ))}
              </div>
            </div>
            <Field label="Jam mulai (opsional)"><input type="time" className={inputClass} value={editing.timeStart || ''} onChange={event => setEditing({ ...editing, timeStart: event.target.value || undefined })} /></Field>
            <Field label="Jam selesai (opsional)"><input type="time" className={inputClass} value={editing.timeEnd || ''} onChange={event => setEditing({ ...editing, timeEnd: event.target.value || undefined })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.isActive} onChange={event => setEditing({ ...editing, isActive: event.target.checked })} /> Aktif</label>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Promotions;
