import React, { useEffect, useState } from 'react';
import { HardDrive, FolderOpen, Download, Play } from 'lucide-react';
import { AppData } from '../../types';
import { BackupSlotInfo, chooseBackupFolder, getAutoBackupConfig, listBackupSlots, readBackupSlot, runBackup, saveAutoBackupConfig, supportsFolderBackup } from '../../services/autoBackup';

interface AutoBackupPanelProps {
  getSnapshot: () => AppData;
}

const formatSize = (bytes: number) => (bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`);

/** Backup otomatis per perangkat: 3 slot bergilir di browser + opsional ke folder komputer. */
const AutoBackupPanel: React.FC<AutoBackupPanelProps> = ({ getSnapshot }) => {
  const [config, setConfig] = useState(getAutoBackupConfig());
  const [slots, setSlots] = useState<BackupSlotInfo[]>([]);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    setConfig(getAutoBackupConfig());
    try { setSlots(await listBackupSlots()); } catch { setSlots([]); }
  };

  useEffect(() => { void refresh(); }, []);

  const update = (patch: Partial<typeof config>) => {
    const next = { ...getAutoBackupConfig(), ...patch };
    saveAutoBackupConfig(next);
    setConfig(next);
  };

  const backupNow = async () => {
    try {
      const outcome = await runBackup(getSnapshot());
      setMessage(`Backup tersimpan di slot ${outcome.slot}${outcome.wroteFolder ? ' dan folder' : ''}.`);
      await refresh();
    } catch (error: any) {
      setMessage(error?.message || 'Backup gagal.');
    }
  };

  const download = async (slot: number) => {
    const content = await readBackupSlot(slot);
    if (!content) return;
    const blob = new Blob([content], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `poshulio-autobackup-slot${slot}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  const pickFolder = async () => {
    try {
      const name = await chooseBackupFolder();
      if (name) setMessage(`Folder backup: ${name}`);
      await refresh();
    } catch {
      setMessage('Folder tidak dipilih.');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-emerald-600 text-white rounded-xl"><HardDrive size={18} /></div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">Backup Otomatis (perangkat ini)</h3>
          <p className="text-xs text-slate-400 mt-0.5">Disimpan bergilir di 3 slot selama aplikasi terbuka. File backup bisa dipulihkan lewat "Import Backup" di atas.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={config.enabled} onChange={event => update({ enabled: event.target.checked })} /> Aktif</label>
        <label className="flex items-center gap-2">Setiap
          <select className="border border-slate-300 rounded-lg px-2 py-1" value={config.intervalHours} onChange={event => update({ intervalHours: Number(event.target.value) })}>
            {[1, 2, 4, 8, 12, 24].map(hours => <option key={hours} value={hours}>{hours} jam</option>)}
          </select>
        </label>
        <button type="button" onClick={backupNow} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Play size={14} /> Backup sekarang</button>
        {supportsFolderBackup() && (
          <button type="button" onClick={pickFolder} className="px-4 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5"><FolderOpen size={14} /> {config.folderName ? `Folder: ${config.folderName}` : 'Simpan juga ke folder'}</button>
        )}
      </div>
      {config.lastBackupAt && <p className="text-xs text-slate-500">Backup terakhir: {new Date(config.lastBackupAt).toLocaleString('id-ID')}</p>}
      {message && <p className="text-xs text-emerald-700">{message}</p>}
      {slots.length > 0 && (
        <div className="space-y-2">
          {slots.map(slot => (
            <div key={slot.slot} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl text-xs">
              <span>Slot {slot.slot} • {new Date(slot.createdAt).toLocaleString('id-ID')} • {slot.items} barang, {slot.sales} penjualan • {formatSize(slot.sizeBytes)}</span>
              <button type="button" onClick={() => download(slot.slot)} className="flex items-center gap-1 text-indigo-600 font-semibold"><Download size={14} /> Unduh</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AutoBackupPanel;
