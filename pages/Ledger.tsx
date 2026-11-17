import React, { useMemo, useState } from 'react';
import { BookOpen, Plus, Trash2, Lock, Download, AlertTriangle } from 'lucide-react';
import { Account, AppSettings, JournalLine } from '../types';
import { Button, Card, EmptyState, Field, formatDateTime, formatRp, inputClass, Modal, PageHeader, rangeToIso, StatTile, Table, todayKey } from '../components/ui';
import { computeAccountBalances, computeProfitAndLoss, DerivedJournal, journalTotals, validateJournalLines } from '../services/ledger';
import { downloadCsv } from '../services/csv';

interface LedgerProps {
  /** Bagan akun dengan saldo awal (bukan saldo berjalan). */
  accounts: Account[];
  journals: DerivedJournal[];
  appSettings?: AppSettings;
  onPostJournal: (input: { date: string; description: string; lines: JournalLine[] }) => Promise<void>;
  onSaveAppSettings?: (patch: Partial<AppSettings>) => boolean;
}

type Tab = 'jurnal' | 'buku-besar' | 'neraca' | 'laba-rugi' | 'tutup-buku';
const TYPE_LABEL: Record<Account['type'], string> = { ASSET: 'Aset', LIABILITY: 'Kewajiban', EQUITY: 'Ekuitas', INCOME: 'Pendapatan', EXPENSE: 'Beban' };
const firstOfMonth = () => `${todayKey().slice(0, 8)}01`;

const Ledger: React.FC<LedgerProps> = ({ accounts, journals, appSettings, onPostJournal, onSaveAppSettings }) => {
  const [tab, setTab] = useState<Tab>('jurnal');
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayKey());
  const [asOf, setAsOf] = useState(todayKey());
  const [accountCode, setAccountCode] = useState(accounts[0]?.code || '');
  const [showManual, setShowManual] = useState(false);
  const [manualDate, setManualDate] = useState(todayKey());
  const [manualDesc, setManualDesc] = useState('');
  const [manualLines, setManualLines] = useState<JournalLine[]>([{ accountCode: '', debit: 0, credit: 0 }, { accountCode: '', debit: 0, credit: 0 }]);
  const [saving, setSaving] = useState(false);
  const [lockInput, setLockInput] = useState(appSettings?.lockDate || '');

  const accountName = (code: string) => accounts.find(account => account.code === code)?.name || code;
  const range = rangeToIso(from, to);
  const periodJournals = useMemo(() => journals.filter(journal => journal.date >= range.from && journal.date <= range.to).reverse(), [journals, range.from, range.to]);
  const unbalanced = useMemo(() => journals.filter(journal => { const totals = journalTotals(journal.lines); return totals.debit !== totals.credit; }), [journals]);

  const balanceSheet = useMemo(() => computeAccountBalances(accounts, journals, rangeToIso(asOf, asOf).to), [accounts, journals, asOf]);
  const sumType = (type: Account['type']) => balanceSheet.filter(account => account.type === type).reduce((sum, account) => sum + account.balance, 0);
  const currentEarnings = sumType('INCOME') - sumType('EXPENSE');
  const assets = sumType('ASSET');
  const liabilities = sumType('LIABILITY');
  const equity = sumType('EQUITY') + currentEarnings;

  const pnl = useMemo(() => computeProfitAndLoss(accounts, journals, range.from, range.to), [accounts, journals, range.from, range.to]);

  const ledgerRows = useMemo(() => {
    const account = accounts.find(entry => entry.code === accountCode);
    if (!account) return { opening: 0, rows: [] as Array<{ journal: DerivedJournal; debit: number; credit: number; balance: number }> };
    const debitNormal = account.type === 'ASSET' || account.type === 'EXPENSE';
    const sign = (debit: number, credit: number) => (debitNormal ? debit - credit : credit - debit);
    let balance = account.balance || 0;
    journals.forEach(journal => {
      if (journal.date >= range.from) return;
      journal.lines.filter(line => line.accountCode === accountCode).forEach(line => { balance += sign(line.debit, line.credit); });
    });
    const opening = balance;
    const rows: Array<{ journal: DerivedJournal; debit: number; credit: number; balance: number }> = [];
    journals.forEach(journal => {
      if (journal.date < range.from || journal.date > range.to) return;
      journal.lines.filter(line => line.accountCode === accountCode).forEach(line => {
        balance += sign(line.debit, line.credit);
        rows.push({ journal, debit: line.debit, credit: line.credit, balance });
      });
    });
    return { opening, rows };
  }, [accounts, journals, accountCode, range.from, range.to]);

  const manualTotals = journalTotals(manualLines);
  const manualError = validateJournalLines(manualLines);

  const submitManual = async () => {
    setSaving(true);
    try {
      await onPostJournal({ date: manualDate, description: manualDesc, lines: manualLines });
      setShowManual(false);
      setManualDesc('');
      setManualLines([{ accountCode: '', debit: 0, credit: 0 }, { accountCode: '', debit: 0, credit: 0 }]);
    } catch (error: any) {
      alert(error?.message || 'Jurnal gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const exportJournals = () => downloadCsv(`jurnal-${from}-${to}.csv`, [
    ['Tanggal', 'Referensi', 'Jenis', 'Keterangan', 'Akun', 'Nama Akun', 'Debit', 'Kredit'],
    ...periodJournals.flatMap(journal => journal.lines.map(line => [formatDateTime(journal.date), journal.referenceNo, journal.referenceType, journal.description, line.accountCode, accountName(line.accountCode), line.debit, line.credit])),
  ]);

  const DateRange = (
    <div className="flex items-center gap-2 text-xs">
      <input type="date" aria-label="Dari tanggal" className={`${inputClass} py-1.5 w-36`} value={from} onChange={event => setFrom(event.target.value)} />
      <span>s/d</span>
      <input type="date" aria-label="Sampai tanggal" className={`${inputClass} py-1.5 w-36`} value={to} onChange={event => setTo(event.target.value)} />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jurnal & Neraca"
        subtitle="Jurnal double-entry dibuat otomatis dari setiap transaksi. Saldo akun lama menjadi saldo awal."
        icon={<BookOpen size={20} />}
        actions={<Button icon={<Plus size={16} />} onClick={() => setShowManual(true)}>Jurnal Manual</Button>}
      />

      {unbalanced.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2"><AlertTriangle size={16} /> {unbalanced.length} jurnal tidak seimbang. Periksa tab Jurnal.</div>
      )}
      {appSettings?.lockDate && <div className="p-3 bg-slate-100 rounded-xl text-xs text-slate-600 flex items-center gap-2"><Lock size={14} /> Buku ditutup s/d {appSettings.lockDate}: transaksi di periode itu tidak bisa di-void/dihapus.</div>}

      <div className="flex flex-wrap gap-2">
        {([['jurnal', 'Jurnal'], ['buku-besar', 'Buku Besar'], ['neraca', 'Neraca'], ['laba-rugi', 'Laba Rugi'], ['tutup-buku', 'Tutup Buku']] as Array<[Tab, string]>).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`px-4 py-2 rounded-xl text-sm font-semibold ${tab === id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{label}</button>
        ))}
      </div>

      {tab === 'jurnal' && (
        <Card title={`Jurnal (${periodJournals.length})`} actions={<div className="flex items-center gap-2">{DateRange}<Button variant="secondary" className="py-1.5 px-3 text-xs" icon={<Download size={14} />} onClick={exportJournals}>CSV</Button></div>}>
          {periodJournals.length === 0 ? <EmptyState text="Tidak ada jurnal di periode ini." /> : (
            <div className="space-y-3">
              {periodJournals.slice(0, 300).map(journal => {
                const totals = journalTotals(journal.lines);
                return (
                  <div key={journal.id} className={`border rounded-xl p-3 ${totals.debit !== totals.credit ? 'border-red-300 bg-red-50' : 'border-slate-100'}`}>
                    <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500 mb-2">
                      <span><b className="text-slate-800">{journal.description}</b> • {journal.referenceNo}</span>
                      <span>{formatDateTime(journal.date)} • {journal.referenceType}{journal.isManual ? ' (manual)' : ''}</span>
                    </div>
                    <table className="w-full text-xs">
                      <tbody>
                        {journal.lines.map((line, index) => (
                          <tr key={index}>
                            <td className={`py-0.5 ${line.credit > 0 ? 'pl-6' : ''}`}>{line.accountCode} {accountName(line.accountCode)}</td>
                            <td className="py-0.5 text-right w-32">{line.debit ? formatRp(line.debit) : ''}</td>
                            <td className="py-0.5 text-right w-32">{line.credit ? formatRp(line.credit) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab === 'buku-besar' && (
        <Card title="Buku besar per akun" actions={<div className="flex flex-wrap items-center gap-2">
          <select aria-label="Akun" className={`${inputClass} py-1.5 w-64`} value={accountCode} onChange={event => setAccountCode(event.target.value)}>
            {accounts.map(account => <option key={account.code} value={account.code}>{account.code} {account.name}</option>)}
          </select>{DateRange}</div>}>
          <p className="text-sm text-slate-500 mb-3">Saldo awal periode: <b className="text-slate-800">{formatRp(ledgerRows.opening)}</b></p>
          {ledgerRows.rows.length === 0 ? <EmptyState text="Tidak ada mutasi." /> : (
            <Table headers={['Tanggal', 'Keterangan', 'Debit', 'Kredit', 'Saldo']} alignRight={[2, 3, 4]}>
              {ledgerRows.rows.map((row, index) => (
                <tr key={`${row.journal.id}-${index}`}>
                  <td className="px-5 py-2 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(row.journal.date)}</td>
                  <td className="px-5 py-2 text-xs">{row.journal.description}</td>
                  <td className="px-5 py-2 text-right">{row.debit ? formatRp(row.debit) : ''}</td>
                  <td className="px-5 py-2 text-right">{row.credit ? formatRp(row.credit) : ''}</td>
                  <td className="px-5 py-2 text-right font-semibold">{formatRp(row.balance)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {tab === 'neraca' && (
        <>
          <div className="flex items-center gap-2"><span className="text-sm text-slate-600">Per tanggal</span><input type="date" aria-label="Per tanggal" className={`${inputClass} w-40`} value={asOf} onChange={event => setAsOf(event.target.value)} /></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatTile label="Total Aset" value={formatRp(assets)} />
            <StatTile label="Kewajiban + Ekuitas" value={formatRp(liabilities + equity)} />
            <StatTile label="Selisih" value={formatRp(assets - liabilities - equity)} tone={Math.round(assets - liabilities - equity) === 0 ? 'good' : 'bad'} hint={Math.round(assets - liabilities - equity) === 0 ? 'Neraca seimbang' : 'Periksa saldo awal akun'} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Aset">
              <Table headers={['Akun', 'Saldo']} alignRight={[1]}>
                {balanceSheet.filter(account => account.type === 'ASSET').map(account => <tr key={account.code}><td className="px-5 py-2">{account.code} {account.name}</td><td className="px-5 py-2 text-right">{formatRp(account.balance)}</td></tr>)}
                <tr className="font-bold"><td className="px-5 py-2">Total Aset</td><td className="px-5 py-2 text-right">{formatRp(assets)}</td></tr>
              </Table>
            </Card>
            <Card title="Kewajiban & Ekuitas">
              <Table headers={['Akun', 'Saldo']} alignRight={[1]}>
                {balanceSheet.filter(account => account.type === 'LIABILITY' || account.type === 'EQUITY').map(account => <tr key={account.code}><td className="px-5 py-2">{account.code} {account.name} <span className="text-[10px] text-slate-400">{TYPE_LABEL[account.type]}</span></td><td className="px-5 py-2 text-right">{formatRp(account.balance)}</td></tr>)}
                <tr><td className="px-5 py-2">Laba (rugi) berjalan</td><td className="px-5 py-2 text-right">{formatRp(currentEarnings)}</td></tr>
                <tr className="font-bold"><td className="px-5 py-2">Total</td><td className="px-5 py-2 text-right">{formatRp(liabilities + equity)}</td></tr>
              </Table>
            </Card>
          </div>
        </>
      )}

      {tab === 'laba-rugi' && (
        <Card title="Laba rugi" actions={DateRange}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <StatTile label="Pendapatan" value={formatRp(pnl.income)} tone="good" />
            <StatTile label="Beban (termasuk HPP)" value={formatRp(pnl.expense)} tone="warn" />
            <StatTile label="Laba bersih" value={formatRp(pnl.net)} tone={pnl.net >= 0 ? 'good' : 'bad'} />
          </div>
          <Table headers={['Akun', 'Jenis', 'Jumlah']} alignRight={[2]}>
            {pnl.rows.map(row => <tr key={row.account.code}><td className="px-5 py-2">{row.account.code} {row.account.name}</td><td className="px-5 py-2 text-xs text-slate-500">{TYPE_LABEL[row.account.type]}</td><td className="px-5 py-2 text-right">{formatRp(row.amount)}</td></tr>)}
          </Table>
        </Card>
      )}

      {tab === 'tutup-buku' && (
        <Card title="Tutup buku (kunci periode)">
          <div className="space-y-4 max-w-lg">
            <p className="text-sm text-slate-600">Transaksi bertanggal sampai dengan tanggal ini tidak bisa di-void, dihapus, atau diberi jurnal manual. Gunakan setelah laporan bulanan/tahunan final. Retur tetap bisa dibuat (tercatat di periode berjalan).</p>
            <Field label="Tutup buku s/d tanggal" hint="Harus sebelum hari ini. Kosongkan untuk membuka kunci.">
              <input type="date" className={inputClass} value={lockInput} max={todayKey()} onChange={event => setLockInput(event.target.value)} />
            </Field>
            <Button icon={<Lock size={16} />} disabled={!onSaveAppSettings} onClick={() => onSaveAppSettings?.({ lockDate: lockInput || undefined })}>{lockInput ? 'Kunci periode' : 'Buka kunci'}</Button>
            {!onSaveAppSettings && <p className="text-xs text-slate-400">Hanya owner/manager yang bisa mengubah tutup buku.</p>}
          </div>
        </Card>
      )}

      {showManual && (
        <Modal wide title="Jurnal manual" onClose={() => setShowManual(false)} footer={<>
          <span className={`mr-auto text-sm self-center ${manualError ? 'text-red-600' : 'text-emerald-700'}`}>Debit {formatRp(manualTotals.debit)} • Kredit {formatRp(manualTotals.credit)}{manualError ? ` — ${manualError}` : ' — seimbang'}</span>
          <Button variant="secondary" onClick={() => setShowManual(false)}>Batal</Button>
          <Button disabled={saving || Boolean(manualError) || !manualDesc.trim()} onClick={submitManual}>{saving ? 'Menyimpan...' : 'Posting'}</Button>
        </>}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Tanggal"><input type="date" className={inputClass} value={manualDate} onChange={event => setManualDate(event.target.value)} /></Field>
            <Field label="Keterangan" className="md:col-span-2"><input className={inputClass} value={manualDesc} onChange={event => setManualDesc(event.target.value)} placeholder="Mis. Setoran modal, penyesuaian saldo awal bank" /></Field>
          </div>
          <div className="mt-4 space-y-2">
            {manualLines.map((line, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-center">
                <select aria-label={`Akun baris ${index + 1}`} className={`${inputClass} col-span-12 md:col-span-6`} value={line.accountCode} onChange={event => setManualLines(manualLines.map((entry, i) => (i === index ? { ...entry, accountCode: event.target.value } : entry)))}>
                  <option value="">Pilih akun</option>
                  {accounts.map(account => <option key={account.code} value={account.code}>{account.code} {account.name}</option>)}
                </select>
                <input aria-label={`Debit baris ${index + 1}`} type="number" min={0} placeholder="Debit" className={`${inputClass} col-span-5 md:col-span-2`} value={line.debit || ''} onChange={event => setManualLines(manualLines.map((entry, i) => (i === index ? { ...entry, debit: Math.max(0, Number(event.target.value) || 0), credit: 0 } : entry)))} />
                <input aria-label={`Kredit baris ${index + 1}`} type="number" min={0} placeholder="Kredit" className={`${inputClass} col-span-5 md:col-span-2`} value={line.credit || ''} onChange={event => setManualLines(manualLines.map((entry, i) => (i === index ? { ...entry, credit: Math.max(0, Number(event.target.value) || 0), debit: 0 } : entry)))} />
                <button type="button" className="col-span-2 md:col-span-2 justify-self-end p-2 text-slate-400 hover:text-red-600 disabled:opacity-30" disabled={manualLines.length <= 2} onClick={() => setManualLines(manualLines.filter((_, i) => i !== index))} aria-label={`Hapus baris ${index + 1}`}><Trash2 size={16} /></button>
              </div>
            ))}
            <Button variant="ghost" icon={<Plus size={14} />} onClick={() => setManualLines([...manualLines, { accountCode: '', debit: 0, credit: 0 }])}>Baris</Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Ledger;
