import React, { useEffect, useState } from 'react';
import { CheckCircle2, Cloud, Lock, LogOut, ShieldAlert } from 'lucide-react';
import { getCloudConfig, hasCloudConfig } from '../services/syncService';
import { CloudSession, getCloudSession, onCloudSessionChange, signInCloud, signOutCloud } from '../services/cloudAuth';

interface CloudConnectPanelProps {
  /** Dipanggil setelah perangkat berhasil login cloud (untuk menarik data toko). */
  onConnected?: () => void | Promise<void>;
  /** Cloud menolak akses (RLS) — tampilkan peringatan menonjol. */
  authRequired?: boolean;
  compact?: boolean;
}

/**
 * Hubungkan perangkat ke cloud toko memakai akun Supabase (email + password toko).
 * Diperlukan bila bucket sudah dijadikan private dengan RLS (lihat supabase/setup.sql).
 */
const CloudConnectPanel: React.FC<CloudConnectPanelProps> = ({ onConnected, authRequired = false, compact = false }) => {
  const config = getCloudConfig();
  const url = config.supabaseUrl || config.url || '';
  const anonKey = config.supabaseAnonKey || config.token || '';
  const [session, setSession] = useState<CloudSession | null>(() => getCloudSession(url));
  const [expanded, setExpanded] = useState(authRequired);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => onCloudSessionChange(next => setSession(next && url && next.url === url.trim().replace(/\/+$/, '') ? next : null)), [url]);
  useEffect(() => { if (authRequired) setExpanded(true); }, [authRequired]);

  if (!hasCloudConfig() || /upstash\.io/i.test(url)) return null;

  const handleConnect = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsBusy(true);
    try {
      await signInCloud(url, anonKey, email, password);
      setPassword('');
      setExpanded(false);
      await onConnected?.();
    } catch (connectError: any) {
      setError(connectError?.message || 'Login cloud gagal.');
    } finally {
      setIsBusy(false);
    }
  };

  const workspace = config.displayName || config.storeId;

  if (session) {
    return (
      <div className={`flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 ${compact ? 'p-2.5' : 'p-3'}`}>
        <div className="flex items-center gap-2 min-w-0 text-emerald-800">
          <CheckCircle2 size={16} className="shrink-0" />
          <p className="text-xs truncate">Cloud <b>{workspace}</b> terhubung sebagai {session.email}</p>
        </div>
        <button
          type="button"
          onClick={() => { if (window.confirm('Putuskan perangkat ini dari cloud toko? Data tetap tersimpan di perangkat, tetapi tidak tersinkron.')) void signOutCloud(anonKey); }}
          className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-red-600"
        >
          <LogOut size={13} /> Putuskan
        </button>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${authRequired ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'} ${compact ? 'p-2.5' : 'p-3'} space-y-2`}>
      <button type="button" onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-2 text-left">
        {authRequired ? <ShieldAlert size={16} className="text-amber-600 shrink-0" /> : <Cloud size={16} className="text-slate-500 shrink-0" />}
        <span className={`text-xs ${authRequired ? 'text-amber-800 font-semibold' : 'text-slate-600'}`}>
          {authRequired
            ? `Cloud ${workspace} menolak perangkat ini — login cloud toko agar data tersinkron.`
            : `Hubungkan perangkat ke cloud toko ${workspace}`}
        </span>
      </button>
      {expanded && (
        <form onSubmit={handleConnect} className="space-y-2">
          <input
            type="email"
            required
            autoComplete="username"
            aria-label="Email akun cloud toko"
            placeholder="Email akun cloud toko"
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400"
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
          <input
            type="password"
            required
            autoComplete="current-password"
            aria-label="Password akun cloud toko"
            placeholder="Password akun cloud toko"
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400"
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
          {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
          <button type="submit" disabled={isBusy} className="w-full flex items-center justify-center gap-2 py-2 bg-slate-900 hover:bg-black disabled:opacity-50 text-white rounded-lg text-xs font-semibold">
            <Lock size={13} /> {isBusy ? 'Menghubungkan...' : 'Hubungkan ke Cloud'}
          </button>
          <p className="text-[10px] text-slate-500">Ini akun cloud milik toko (dibuat owner di Supabase), bukan akun kasir. Cukup sekali per perangkat.</p>
        </form>
      )}
    </div>
  );
};

export default CloudConnectPanel;
