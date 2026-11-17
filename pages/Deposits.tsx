import React, { useMemo, useState } from 'react';
import { Wallet, Plus, Undo2, Search } from 'lucide-react';
import { Customer, CustomerLedgerEntry } from '../types';
import { Button, Card, EmptyState, Field, formatDateTime, formatRp, inputClass, Modal, PageHeader, PAYMENT_METHOD_OPTIONS, StatTile, Table } from '../components/ui';

interface DepositsProps {
  customers: Customer[];
  ledger: CustomerLedgerEntry[];
  onTopup: (customerId: string, amount: number, method: string, note?: string) => Promise<void>;
  onRefund?: (customerId: string, amount: number, method: string, note?: string) => Promise<void>;
}

const TYPE_LABEL: Record<CustomerLedgerEntry['referenceType'], string> = {
  SALE: 'Dipakai belanja',
  SALE_VOID: 'Void faktur',
  RETURN: 'Retur ke deposit',
  PAYMENT: 'Pelunasan',
  DEPOSIT_TOPUP: 'Setor deposit',
  DEPOSIT_REFUND: 'Pengembalian',
  DP: 'Uang muka WO',
  OPENING: 'Saldo awal',
  ADJUST: 'Penyesuaian',
};

const Deposits: React.FC<DepositsProps> = ({ customers, ledger, onTopup, onRefund }) => {
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<{ mode: 'topup' | 'refund'; customerId: string } | null>(null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState('TUNAI');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const registered = useMemo(() => customers.filter(customer => customer.id !== 'UMUM'), [customers]);
  const filtered = useMemo(() => registered.filter(customer => customer.name.toLowerCase().includes(search.toLowerCase()) || customer.phone.includes(search)), [registered, search]);
  const totalDeposit = registered.reduce((sum, customer) => sum + (customer.depositBalance || 0), 0);
  const depositEntries = useMemo(() => ledger.filter(entry => entry.kind === 'DEPOSIT'), [ledger]);
  const history = historyFor ? depositEntries.filter(entry => entry.customerId === historyFor) : depositEntries.slice(0, 30);

  const openDialog = (mode: 'topup' | 'refund', customerId: string) => {
    setDialog({ mode, customerId });
    setAmount(0);
    setMethod('TUNAI');
    setNote('');
  };

  const submit = async () => {
    if (!dialog) return;
    setSaving(true);
    try {
      if (dialog.mode === 'topup') await onTopup(dialog.customerId, amount, method, note || undefined);
      else await onRefund?.(dialog.customerId, amount, method, note || undefined);
      setDialog(null);
    } catch (error: any) {
      alert(error?.message || 'Gagal menyimpan.');
    } finally {
      setSaving(false);
    }
  };

  const dialogCustomer = dialog ? registered.find(customer => customer.id === dialog.customerId) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="Deposit Pelanggan" subtitle="Titipan uang / uang muka pelanggan. Bisa dipakai sebagai metode bayar di kasir." icon={<Wallet size={20} />} />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatTile label="Total deposit tersimpan" value={formatRp(totalDeposit)} hint="Kewajiban toko ke pelanggan" />
        <StatTile label="Pelanggan punya deposit" value={String(registered.filter(customer => (customer.depositBalance || 0) > 0).length)} />
        <StatTile label="Transaksi deposit" value={String(depositEntries.length)} />
      </div>

      <Card title="Saldo per pelanggan" actions={
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${inputClass} pl-8 py-2 w-56`} placeholder="Cari pelanggan..." value={search} onChange={event => setSearch(event.target.value)} />
        </div>
      }>
        {filtered.length === 0 ? <EmptyState text="Belum ada pelanggan terdaftar." /> : (
          <Table headers={['Pelanggan', 'Telepon', 'Saldo deposit', '']} alignRight={[2, 3]}>
            {filtered.map(customer => (
              <tr key={customer.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-800">
                  <button type="button" className="hover:underline text-left" onClick={() => setHistoryFor(customer.id)}>{customer.name}</button>
                </td>
                <td className="px-5 py-3 text-slate-500">{customer.phone}</td>
                <td className="px-5 py-3 text-right font-semibold text-slate-900">{formatRp(customer.depositBalance || 0)}</td>
                <td className="px-5 py-3 text-right whitespace-nowrap space-x-2">
                  <Button variant="secondary" className="py-1.5 px-3" icon={<Plus size={14} />} onClick={() => openDialog('topup', customer.id)}>Setor</Button>
                  {onRefund && (customer.depositBalance || 0) > 0 && (
                    <Button variant="ghost" className="py-1.5 px-3" icon={<Undo2 size={14} />} onClick={() => openDialog('refund', customer.id)}>Kembalikan</Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title={historyFor ? `Riwayat deposit — ${registered.find(customer => customer.id === historyFor)?.name || ''}` : 'Riwayat deposit terbaru'} actions={historyFor ? <Button variant="ghost" className="py-1 px-2 text-xs" onClick={() => setHistoryFor(null)}>Semua</Button> : undefined}>
        {history.length === 0 ? <EmptyState text="Belum ada transaksi deposit." /> : (
          <Table headers={['Waktu', 'Pelanggan', 'Jenis', 'Referensi', 'Metode', 'Perubahan']} alignRight={[5]}>
            {history.map(entry => (
              <tr key={entry.id}>
                <td className="px-5 py-2.5 text-slate-500 whitespace-nowrap">{formatDateTime(entry.createdAt)}</td>
                <td className="px-5 py-2.5">{entry.customerName || entry.customerId}</td>
                <td className="px-5 py-2.5">{TYPE_LABEL[entry.referenceType] || entry.referenceType}</td>
                <td className="px-5 py-2.5 text-xs text-slate-500">{entry.referenceNo}</td>
                <td className="px-5 py-2.5 text-xs">{entry.method || '-'}</td>
                <td className={`px-5 py-2.5 text-right font-semibold ${entry.delta >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{entry.delta >= 0 ? '+' : ''}{formatRp(entry.delta)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {dialog && dialogCustomer && (
        <Modal
          title={`${dialog.mode === 'topup' ? 'Setor deposit' : 'Kembalikan deposit'} — ${dialogCustomer.name}`}
          onClose={() => setDialog(null)}
          footer={<>
            <Button variant="secondary" onClick={() => setDialog(null)}>Batal</Button>
            <Button disabled={saving || amount <= 0} onClick={submit}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
          </>}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Saldo saat ini: <b className="text-slate-800">{formatRp(dialogCustomer.depositBalance || 0)}</b></p>
            <Field label="Nominal (Rp)">
              <input type="number" min={0} autoFocus className={inputClass} value={amount || ''} onChange={event => setAmount(Math.max(0, Number(event.target.value) || 0))} />
            </Field>
            <Field label={dialog.mode === 'topup' ? 'Diterima via' : 'Dikembalikan via'} hint="Tunai akan masuk/keluar dari rekap shift kasir yang sedang dibuka.">
              <select className={inputClass} value={method} onChange={event => setMethod(event.target.value)}>
                {PAYMENT_METHOD_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>
            <Field label="Catatan (opsional)">
              <input className={inputClass} value={note} onChange={event => setNote(event.target.value)} />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Deposits;
