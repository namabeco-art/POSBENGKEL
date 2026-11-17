import React, { useEffect, useState } from 'react';
import { CheckCircle2, Cloud, KeyRound, Lock, LogOut, ShieldAlert, Store } from 'lucide-react';
import { getCloudConfig, hasCloudConfig } from '../services/syncService';
import { changeCloudPassword, CloudSession, getCloudSession, onCloudSessionChange, registerCloudStore, signInCloud, signOutCloud } from '../services/cloudAuth';

interface CloudConnectPanelProps {
  /** Dipanggil setelah perangkat berhasil login cloud (untuk menarik data toko). */
  onConnected?: () => void | Promise<void>;
  /** Cloud menolak akses (perangkat belum login / sesi dicabut) — tampilkan peringatan menonjol. */
  authRequired?: boolean;
  compact?: boolean;
}

const inputClass = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400';

/**
 * Hubungkan perangkat ke cloud toko (Cloudflare) dengan akun cloud toko (email + password).
 * Toko baru didaftarkan sekali oleh owner memakai kode pendaftaran dari server.
 */
const CloudConnectPanel: React.FC<CloudConnectPanelProps> = ({ onConnected, authRequired = false, compact = false }) => {
  const config = getCloudConfig();
  const apiBase = config.apiBaseUrl || '';
  const [session, setSession] = useState<CloudSession | null>(() => getCloudSession(config.storeId));
  const [expanded, setExpanded] = useState(authRequired);
  const [mode, setMode] = useState<'login' | 'register' | 'password'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [setupKey, setSetupKey] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => onCloudSessionChange(next => setSession(next && next.storeId === config.storeId ? next : null)), [config.storeId]);
  useEffect(() => { if (authRequired) setExpanded(true); }, [authRequired]);

  if (!hasCloudConfig()) return null;

  const run = async (action: () => Promise<void>) => {
    setError('');
    setNotice('');
    setIsBusy(true);
    try {
      await action();
    } catch (caught: any) {
      setError(caught?.message || 'Gagal.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (mode === 'password') {
        if (password.length < 8) throw new Error('Password baru minimal 8 karakter.');
        if (password !== confirm) throw new Error('Konfirmasi password tidak sama.');
        await changeCloudPassword(apiBase, currentPassword, password);
        setNotice('Password diganti. Perangkat lain harus login ulang.');
        setCurrentPassword('');
        setPassword('');
        setConfirm('');
        setMode('login');
        return;
      }
      if (mode === 'register') {
        if (password.length < 8) throw new Error('Password minimal 8 karakter.');
        if (password !== confirm) throw new Error('Konfirmasi password tidak sama.');
        await registerCloudStore(apiBase, config.storeId, email, password, setupKey);
      } else {
        await signInCloud(apiBase, config.storeId, email, password);
      }
      setPassword('');
      setConfirm('');
      setSetupKey('');
      setExpanded(false);
      await onConnected?.();
    });
  };

  const workspace = config.displayName || config.storeId;

  if (session && mode !== 'password') {
    return (
      <div className="space-y-2">
        <div className={`flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 ${compact ? 'p-2.5' : 'p-3'}`}>
          <div className="flex items-center gap-2 min-w-0 text-emerald-800">
            <CheckCircle2 size={16} className="shrink-0" />
            <p className="text-xs truncate">Cloud <b>{workspace}</b> terhubung sebagai {session.email}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {!compact && (
              <button type="button" onClick={() => { setMode('password'); setError(''); }} className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-indigo-600">
                <KeyRound size={13} /> Ganti password
              </button>
            )}
            <button
              type="button"
              onClick={() => { if (window.confirm('Putuskan perangkat ini dari cloud toko? Data tetap tersimpan di perangkat, tetapi tidak tersinkron.')) void signOutCloud(apiBase); }}
              className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-red-600"
            >
              <LogOut size={13} /> Putuskan
            </button>
          </div>
        </div>
        {notice && <p className="text-xs text-emerald-700">{notice}</p>}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${authRequired ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'} ${compact ? 'p-2.5' : 'p-3'} space-y-2`}>
      <button type="button" onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-2 text-left">
        {authRequired ? <ShieldAlert size={16} className="text-amber-600 shrink-0" /> : <Cloud size={16} className="text-slate-500 shrink-0" />}
        <span className={`text-xs ${authRequired ? 'text-amber-800 font-semibold' : 'text-slate-600'}`}>
          {mode === 'password'
            ? 'Ganti password akun cloud toko'
            : authRequired
              ? `Cloud ${workspace} menolak perangkat ini — login cloud toko agar data tersinkron.`
              : `Hubungkan perangkat ke cloud toko ${workspace}`}
        </span>
      </button>
      {(expanded || mode === 'password') && (
        <form onSubmit={handleSubmit} className="space-y-2">
          {mode !== 'password' && (
            <div className="flex gap-1 p-1 bg-white rounded-lg border border-slate-200 text-[11px] font-semibold">
              <button type="button" onClick={() => setMode('login')} className={`flex-1 py-1.5 rounded-md ${mode === 'login' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>Login perangkat</button>
              <button type="button" onClick={() => setMode('register')} className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1 ${mode === 'register' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}><Store size={12} /> Daftarkan toko baru</button>
            </div>
          )}
          {mode === 'password' ? (
            <input type="password" required autoComplete="current-password" aria-label="Password lama" placeholder="Password lama" className={inputClass} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} />
          ) : (
            <input type="email" required autoComplete="username" aria-label="Email akun cloud toko" placeholder="Email akun cloud toko" className={inputClass} value={email} onChange={event => setEmail(event.target.value)} />
          )}
          <input
            type="password"
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            aria-label={mode === 'password' ? 'Password baru' : 'Password akun cloud toko'}
            placeholder={mode === 'login' ? 'Password akun cloud toko' : 'Password baru (min. 8 karakter)'}
            className={inputClass}
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
          {mode !== 'login' && (
            <input type="password" required autoComplete="new-password" aria-label="Ulangi password" placeholder="Ulangi password" className={inputClass} value={confirm} onChange={event => setConfirm(event.target.value)} />
          )}
          {mode === 'register' && (
            <input type="password" required autoComplete="off" aria-label="Kode pendaftaran toko" placeholder="Kode pendaftaran toko (dari pemilik server)" className={inputClass} value={setupKey} onChange={event => setSetupKey(event.target.value)} />
          )}
          {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
          <div className="flex gap-2">
            {mode === 'password' && (
              <button type="button" onClick={() => { setMode('login'); setError(''); }} className="flex-1 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-600">Batal</button>
            )}
            <button type="submit" disabled={isBusy} className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-900 hover:bg-black disabled:opacity-50 text-white rounded-lg text-xs font-semibold">
              <Lock size={13} /> {isBusy ? 'Memproses...' : mode === 'register' ? 'Daftarkan & Hubungkan' : mode === 'password' ? 'Simpan password baru' : 'Hubungkan ke Cloud'}
            </button>
          </div>
          <p className="text-[10px] text-slate-500">
            {mode === 'register'
              ? `Store ID: ${config.storeId}. Akun ini dipakai semua perangkat toko untuk login cloud (bukan akun kasir).`
              : 'Akun cloud milik toko (bukan akun kasir). Cukup sekali per perangkat.'}
          </p>
        </form>
      )}
    </div>
  );
};

export default CloudConnectPanel;
