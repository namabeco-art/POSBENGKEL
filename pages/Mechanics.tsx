import React, { useMemo, useState } from 'react';
import { HardHat, Plus, Banknote } from 'lucide-react';
import { AppSettings, CommissionPayment, Mechanic, Sale, SaleReturn } from '../types';
import { Button, Card, EmptyState, Field, formatDateTime, formatRp, inputClass, Modal, PageHeader, PAYMENT_METHOD_OPTIONS, rangeToIso, Table, todayKey } from '../components/ui';
import { summarizeCommissions } from '../services/commission';
import { createId } from '../services/idService';

interface MechanicsProps {
  mechanics: Mechanic[];
  sales: Sale[];
  returns: SaleReturn[];
  payments: CommissionPayment[];
  appSettings?: AppSettings;
  onSaveMechanic?: (mechanic: Mechanic) => void;
  onPayCommission?: (mechanicId: string, amount: number, method: string, note?: string) => Promise<void>;
}

const firstOfMonth = () => `${todayKey().slice(0, 8)}01`;

const Mechanics: React.FC<MechanicsProps> = ({ mechanics, sales, returns, payments, appSettings, onSaveMechanic, onPayCommission }) => {
  const [editing, setEditing] = useState<Mechanic | null>(null);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayKey());
  const [paying, setPaying] = useState<{ mechanicId: string; name: string; outstanding: number } | null>(null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState('TUNAI');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const allTime = useMemo(() => summarizeCommissions(sales, returns, payments, mechanics), [sales, returns, payments, mechanics]);
  const period = useMemo(() => summarizeCommissions(sales, returns, payments, mechanics, rangeToIso(from, to)), [sales, returns, payments, mechanics, from, to]);
  const outstandingById = new Map(allTime.map(row => [row.mechanicId, row.outstanding]));

  const submitPay = async () => {
    if (!paying || !onPayCommission) return;
    setSaving(true);
    try {
      await onPayCommission(paying.mechanicId, amount, method, note || `Komisi ${from} s/d ${to}`);
      setPaying(null);
    } catch (error: any) {
      alert(error?.message || 'Gagal membayar komisi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mekanik & Komisi"
        subtitle="Komisi dihitung dari baris penjualan yang diberi mekanik (jasa atau barang berkomisi). Retur mengurangi komisi."
        icon={<HardHat size={20} />}
        actions={onSaveMechanic && <Button icon={<Plus size={16} />} onClick={() => setEditing({ id: createId('MEK'), name: '', phone: '', defaultCommissionPercent: appSettings?.defaultCommissionPercent ?? 10, isActive: true })}>Tambah Mekanik</Button>}
      />

      <Card title="Rekap komisi" actions={
        <div className="flex items-center gap-2 text-xs">
          <input type="date" className={`${inputClass} py-1.5 w-36`} value={from} onChange={event => setFrom(event.target.value)} aria-label="Dari tanggal" />
          <span>s/d</span>
          <input type="date" className={`${inputClass} py-1.5 w-36`} value={to} onChange={event => setTo(event.target.value)} aria-label="Sampai tanggal" />
        </div>
      }>
        {period.length === 0 ? <EmptyState text="Belum ada mekanik. Tambahkan mekanik lalu pilih mekanik di baris jasa saat transaksi kasir." /> : (
          <Table headers={['Mekanik', 'Baris', 'Nilai jual', 'Komisi periode', 'Dibayar periode', 'Sisa (semua waktu)', '']} alignRight={[1, 2, 3, 4, 5, 6]}>
            {period.map(row => {
              const outstanding = outstandingById.get(row.mechanicId) || 0;
              return (
                <tr key={row.mechanicId}>
                  <td className="px-5 py-3 font-medium">{row.mechanicName}</td>
                  <td className="px-5 py-3 text-right">{row.lines}</td>
                  <td className="px-5 py-3 text-right">{formatRp(row.salesValue)}</td>
                  <td className="px-5 py-3 text-right">{formatRp(row.earned - row.returned)}{row.returned > 0 && <span className="block text-[11px] text-red-500">retur −{formatRp(row.returned)}</span>}</td>
                  <td className="px-5 py-3 text-right">{formatRp(row.paid)}</td>
                  <td className={`px-5 py-3 text-right font-semibold ${outstanding > 0 ? 'text-amber-700' : 'text-slate-500'}`}>{formatRp(outstanding)}</td>
                  <td className="px-5 py-3 text-right">
                    {onPayCommission && outstanding > 0 && (
                      <Button className="py-1.5 px-3 text-xs" icon={<Banknote size={14} />} onClick={() => { setPaying({ mechanicId: row.mechanicId, name: row.mechanicName, outstanding }); setAmount(outstanding); setMethod('TUNAI'); setNote(''); }}>Bayar</Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Daftar mekanik">
          {mechanics.length === 0 ? <EmptyState text="Belum ada mekanik." /> : (
            <Table headers={['Nama', 'Telepon', 'Komisi jasa', 'Status', '']} alignRight={[2, 4]}>
              {mechanics.map(mechanic => (
                <tr key={mechanic.id}>
                  <td className="px-5 py-3 font-medium">{mechanic.name}</td>
                  <td className="px-5 py-3 text-slate-500">{mechanic.phone || '-'}</td>
                  <td className="px-5 py-3 text-right">{mechanic.defaultCommissionPercent}%</td>
                  <td className="px-5 py-3">{mechanic.isActive ? <span className="text-emerald-700 text-xs font-semibold">Aktif</span> : <span className="text-slate-400 text-xs">Nonaktif</span>}</td>
                  <td className="px-5 py-3 text-right">{onSaveMechanic && <Button variant="ghost" className="py-1 px-2 text-xs" onClick={() => setEditing(mechanic)}>Edit</Button>}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="Riwayat pembayaran komisi">
          {payments.length === 0 ? <EmptyState text="Belum ada pembayaran." /> : (
            <Table headers={['Waktu', 'Mekanik', 'Metode', 'Nominal']} alignRight={[3]}>
              {payments.slice(0, 50).map(payment => (
                <tr key={payment.id}>
                  <td className="px-5 py-2.5 text-xs text-slate-500">{formatDateTime(payment.createdAt)}</td>
                  <td className="px-5 py-2.5">{payment.mechanicName}</td>
                  <td className="px-5 py-2.5 text-xs">{payment.method}</td>
                  <td className="px-5 py-2.5 text-right font-semibold">{formatRp(payment.amount)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      {editing && onSaveMechanic && (
        <Modal title={mechanics.some(entry => entry.id === editing.id) ? 'Edit mekanik' : 'Tambah mekanik'} onClose={() => setEditing(null)} footer={<>
          <Button variant="secondary" onClick={() => setEditing(null)}>Batal</Button>
          <Button disabled={!editing.name.trim()} onClick={() => { onSaveMechanic({ ...editing, name: editing.name.trim() }); setEditing(null); }}>Simpan</Button>
        </>}>
          <div className="space-y-4">
            <Field label="Nama"><input autoFocus className={inputClass} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} /></Field>
            <Field label="Telepon"><input className={inputClass} value={editing.phone || ''} onChange={event => setEditing({ ...editing, phone: event.target.value })} /></Field>
            <Field label="Komisi default untuk jasa (%)" hint="Dipakai jika barang/jasa tidak punya pengaturan komisi sendiri.">
              <input type="number" min={0} max={100} className={inputClass} value={editing.defaultCommissionPercent} onChange={event => setEditing({ ...editing, defaultCommissionPercent: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })} />
            </Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.isActive} onChange={event => setEditing({ ...editing, isActive: event.target.checked })} /> Aktif (muncul di kasir & WO)</label>
          </div>
        </Modal>
      )}

      {paying && (
        <Modal title={`Bayar komisi — ${paying.name}`} onClose={() => setPaying(null)} footer={<>
          <Button variant="secondary" onClick={() => setPaying(null)}>Batal</Button>
          <Button disabled={saving || amount <= 0} onClick={submitPay}>{saving ? 'Menyimpan...' : 'Bayar'}</Button>
        </>}>
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Sisa komisi belum dibayar: <b className="text-slate-900">{formatRp(paying.outstanding)}</b></p>
            <Field label="Nominal (Rp)"><input type="number" min={0} className={inputClass} value={amount || ''} onChange={event => setAmount(Math.max(0, Number(event.target.value) || 0))} /></Field>
            <Field label="Dibayar via" hint="Tunai keluar dari rekap shift kasir yang sedang dibuka.">
              <select className={inputClass} value={method} onChange={event => setMethod(event.target.value)}>{PAYMENT_METHOD_OPTIONS.filter(option => option !== 'QRIS').map(option => <option key={option} value={option}>{option}</option>)}</select>
            </Field>
            <Field label="Catatan"><input className={inputClass} value={note} onChange={event => setNote(event.target.value)} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Mechanics;
