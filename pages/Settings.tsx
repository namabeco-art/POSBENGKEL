import React, { useState, useEffect } from 'react';
import { 
  Save, Globe, RefreshCw, Info, CheckCircle2, 
  AlertCircle, Bot, Key, HelpCircle, Loader2, Database,
  HardDrive, ExternalLink, BookOpen, Wifi, WifiOff, Shield,
  ChevronDown, Copy, Download, Upload
} from 'lucide-react';
import { CLOUD_AI_PROXY_KEY, getEnvConfig, getResolvedOpenRouterApiKey, getResolvedOpenRouterModel, hasEnvCloudConfig, isRuntimeSettingsAllowed } from '../services/appConfig';
import { generateActivationCodeForConfig, getCloudConfig, saveCloudConfig, testCloudConnection } from '../services/syncService';
import { isValidStoreId, normalizeStoreId } from '../services/cloudAuth';
import { parseOpenRouterError, requestOpenRouterReply } from '../services/aiService';
import { AppData, AppSettings, Customer, Item, StoreProfile, Supplier } from '../types';
import ModeSettingsPanel from '../components/settings/ModeSettingsPanel';
import IposImportPanel from '../components/settings/IposImportPanel';
import AutoBackupPanel from '../components/settings/AutoBackupPanel';
import { isThermalPrinterEnabled, isWebSerialSupported, setThermalPrinterEnabled } from '../services/thermalPrinterService';
import CloudConnectPanel from '../components/CloudConnectPanel';

interface SettingsProps {
  onCloudConfigChange?: () => void;
  onExportBackup?: () => void;
  onImportBackup?: (file: File) => Promise<void> | void;
  storeProfile?: StoreProfile;
  onSaveStoreProfile?: (profile: StoreProfile) => void;
  cloudAuthRequired?: boolean;
  onCloudConnected?: () => void | Promise<void>;
  // ---- Mode aplikasi & fitur mode Lengkap
  appSettings?: AppSettings;
  onSaveAppSettings?: (patch: Partial<AppSettings>) => boolean;
  getSnapshot?: () => AppData;
  onImportItems?: (rows: Item[]) => { added: number; updated: number; errors: string[] };
  onImportContacts?: (customers: Customer[], suppliers: Supplier[]) => { customers: number; suppliers: number };
  onImportOpeningReceivables?: (rows: Array<{ customerName: string; amount: number }>) => Promise<{ applied: number; missing: string[] }>;
}

const Settings: React.FC<SettingsProps> = ({
  onCloudConfigChange, onExportBackup, onImportBackup, storeProfile, onSaveStoreProfile, cloudAuthRequired = false, onCloudConnected,
  appSettings, onSaveAppSettings, getSnapshot, onImportItems, onImportContacts, onImportOpeningReceivables,
}) => {
  const isFullMode = appSettings?.mode === 'LENGKAP';
  const [profileForm, setProfileForm] = useState<StoreProfile>({
    name: storeProfile?.name || '',
    address: storeProfile?.address || '',
    phone: storeProfile?.phone || '',
    receiptFooter: storeProfile?.receiptFooter || '',
  });
  const [thermalEnabled, setThermalEnabled] = useState(isThermalPrinterEnabled());

  const handleSaveProfile = (event: React.FormEvent) => {
    event.preventDefault();
    if (!onSaveStoreProfile) return;
    if (!profileForm.name.trim()) return alert('Nama toko wajib diisi.');
    onSaveStoreProfile({
      name: profileForm.name.trim(),
      address: profileForm.address?.trim() || undefined,
      phone: profileForm.phone?.trim() || undefined,
      receiptFooter: profileForm.receiptFooter?.trim() || undefined,
    });
    alert('Profil toko disimpan. Struk berikutnya memakai data ini.');
  };
  const [cloudConfig, setCloudConfig] = useState<any>(getCloudConfig());
  const [aiStatus, setAiStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [cloudStatus, setCloudStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [showTutorial, setShowTutorial] = useState<'none' | 'ai' | 'cloud' | 'deploy'>('none');
  const [logs, setLogs] = useState<{ time: string; msg: string; type: 'info' | 'ok' | 'err' }[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const envConfig = getEnvConfig();
  const allowRuntimeSettings = isRuntimeSettingsAllowed();

  const addLog = (msg: string, type: 'info' | 'ok' | 'err' = 'info') => {
    setLogs(prev => [{ time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), msg, type }, ...prev].slice(0, 20));
  };

  // Auto-detect status on load
  const hasAiKey = Boolean(getResolvedOpenRouterApiKey(cloudConfig.openRouterApiKey)?.trim());
  const storeIdDraft = normalizeStoreId(cloudConfig.storeId || '');
  const hasCloudDb = isValidStoreId(storeIdDraft);
  const isEnvManaged = hasEnvCloudConfig();

  useEffect(() => {
    addLog('Halaman pengaturan dimuat', 'info');
    if (hasAiKey) addLog(getResolvedOpenRouterApiKey(cloudConfig.openRouterApiKey) === CLOUD_AI_PROXY_KEY ? 'AI memakai proxy server Cloudflare' : 'API Key OpenRouter terdeteksi', 'ok');
    if (isEnvManaged) addLog('Toko ditetapkan dari env build', 'ok');
    if (hasCloudDb && cloudConfig.enabled) {
      addLog('Menguji koneksi cloud...', 'info');
      handleTestCloud();
    }
  }, []);

  const handleTestAI = async () => {
    const resolvedApiKey = getResolvedOpenRouterApiKey(cloudConfig.openRouterApiKey).trim();
    const resolvedModel = getResolvedOpenRouterModel(cloudConfig.aiModel);
    if (!resolvedApiKey || resolvedApiKey.length < 10) { setAiStatus('error'); addLog('API Key kosong atau terlalu pendek', 'err'); return; }
    setAiStatus('testing');
    addLog(`Tes OpenRouter (model: ${resolvedModel})...`, 'info');
    try {
      // Simpan nilai yang diketik (bukan penanda proxy) agar tidak terkunci ke proxy.
      saveCloudConfig({ ...getCloudConfig(), ...cloudConfig, openRouterApiKey: cloudConfig.openRouterApiKey || '', aiModel: cloudConfig.aiModel || '' });
      if (onCloudConfigChange) onCloudConfigChange();
      await requestOpenRouterReply({ apiKey: resolvedApiKey, userMessage: 'Balas hanya: OK', systemPrompt: 'Connectivity check.', primaryModel: resolvedModel, appName: 'POSHULIO' });
      setAiStatus('connected');
      addLog('OpenRouter terhubung — AI siap dipakai', 'ok');
    } catch (e: any) {
      setAiStatus('error');
      addLog(`OpenRouter gagal: ${e?.message?.slice(0, 60) || 'Unknown error'}`, 'err');
    }
  };

  const handleTestCloud = async () => {
    setCloudStatus('testing');
    addLog('Tes koneksi ke server cloud Cloudflare...', 'info');
    const result = await testCloudConnection((cloudConfig.apiBaseUrl || '').trim());
    if (result.success) {
      setCloudStatus('connected');
      addLog(`${result.message}${result.ai ? ' Proxy AI server tersedia.' : ''}`, 'ok');
    } else {
      setCloudStatus('error');
      addLog(`Cloud gagal: ${result.message}`, 'err');
    }
  };

  const handleSave = async () => {
    if (cloudConfig.enabled && !hasCloudDb) {
      alert('Store ID hanya huruf kecil, angka, - atau _ (3–64 karakter).');
      return;
    }
    setIsSaving(true);
    addLog('Menyimpan pengaturan...', 'info');
    try {
      saveCloudConfig({ ...cloudConfig, storeId: storeIdDraft, enabled: Boolean(cloudConfig.enabled) && hasCloudDb });
      setCloudConfig(getCloudConfig());
      if (onCloudConfigChange) onCloudConfigChange();
      addLog('Pengaturan berhasil disimpan', 'ok');
      alert('Pengaturan berhasil disimpan!');
    } catch {
      addLog('Gagal menyimpan pengaturan', 'err');
      alert('Gagal menyimpan. Coba lagi.');
    }
    finally { setIsSaving(false); }
  };

  const StatusBadge = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
      {ok ? <CheckCircle2 size={16} /> : <div className="w-4 h-4 rounded-full border-2 border-slate-300" />}
      <span className="text-xs font-bold">{label}</span>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24 px-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-lg"><Database size={24}/></div>
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Pengaturan</h2>
          <p className="text-slate-400 text-sm font-medium mt-0.5">Kelola koneksi, AI, dan backup data</p>
        </div>
      </div>

      {/* Status Checklist */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700 mb-4">Status Sistem</h3>
        <div className="flex flex-wrap gap-3">
          <StatusBadge ok={true} label="Data Lokal Aktif" />
          <StatusBadge ok={hasAiKey} label="AI Consultant" />
          <StatusBadge ok={hasCloudDb && cloudStatus === 'connected'} label="Cloud Sync" />
          <StatusBadge ok={isEnvManaged} label="Env Server (.env)" />
        </div>
        {!hasAiKey && !hasCloudDb && (
          <p className="mt-4 text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-xl p-3">
            💡 Sistem sudah bisa dipakai tanpa AI dan Cloud. Fitur tersebut opsional — aktifkan kapan saja.
          </p>
        )}
      </div>

      {/* Mode aplikasi: Simple / Lengkap */}
      <ModeSettingsPanel appSettings={appSettings} onSave={onSaveAppSettings} />

      {/* Keamanan cloud: login perangkat ke akun cloud toko */}
      {hasCloudDb && getCloudConfig().enabled && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Keamanan Cloud</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Data toko di Cloudflare hanya bisa dibaca/ditulis perangkat yang login dengan akun cloud toko. Jika perangkat hilang, ganti password — semua perangkat lain otomatis keluar.
            </p>
          </div>
          <CloudConnectPanel authRequired={cloudAuthRequired} onConnected={onCloudConnected} />
        </div>
      )}

      {/* Profil toko & struk */}
      {onSaveStoreProfile && (
        <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Profil Toko & Struk</h3>
            <p className="text-xs text-slate-400 mt-0.5">Ditampilkan di kepala/kaki struk. Tersinkron ke semua perangkat.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-500">Nama toko *
              <input className="mt-1 w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:border-indigo-500" value={profileForm.name} onChange={e => setProfileForm({ ...profileForm, name: e.target.value })} placeholder="Toko Sumber Rejeki" />
            </label>
            <label className="block text-xs font-medium text-slate-500">Telepon
              <input className="mt-1 w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:border-indigo-500" value={profileForm.phone} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="0812..." />
            </label>
            <label className="block text-xs font-medium text-slate-500 md:col-span-2">Alamat
              <input className="mt-1 w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:border-indigo-500" value={profileForm.address} onChange={e => setProfileForm({ ...profileForm, address: e.target.value })} />
            </label>
            <label className="block text-xs font-medium text-slate-500 md:col-span-2">Catatan kaki struk
              <input className="mt-1 w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:border-indigo-500" value={profileForm.receiptFooter} onChange={e => setProfileForm({ ...profileForm, receiptFooter: e.target.value })} placeholder="Barang yang sudah dibeli tidak dapat ditukar" />
            </label>
          </div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <label className={`flex items-center gap-2 text-xs ${isWebSerialSupported() ? 'text-slate-700' : 'text-slate-400'}`}>
              <input
                type="checkbox"
                disabled={!isWebSerialSupported()}
                checked={thermalEnabled}
                onChange={e => { setThermalPrinterEnabled(e.target.checked); setThermalEnabled(e.target.checked); }}
              />
              Cetak langsung ke printer thermal USB (perangkat ini){!isWebSerialSupported() && ' — butuh Chrome/Edge desktop'}
            </label>
            <button type="submit" className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold">Simpan Profil</button>
          </div>
        </form>
      )}

      {/* Section 1: AI Setup */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${hasAiKey ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}><Bot size={20}/></div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">AI Consultant</h3>
              <p className="text-xs text-slate-400 mt-0.5">{hasAiKey ? 'Terhubung — AI siap dipakai' : 'Belum aktif — isi API key untuk mengaktifkan'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasAiKey && aiStatus !== 'connected' && (
              <button onClick={handleTestAI} className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-all">
                {aiStatus === 'testing' ? <RefreshCw size={14} className="animate-spin" /> : 'Tes Koneksi'}
              </button>
            )}
            {aiStatus === 'connected' && <CheckCircle2 size={18} className="text-emerald-500" />}
            <button onClick={() => setShowTutorial(showTutorial === 'ai' ? 'none' : 'ai')} className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-50">
              <HelpCircle size={16} />
            </button>
          </div>
        </div>

        {showTutorial === 'ai' && (
          <div className="px-6 pb-4">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-indigo-800 flex items-center gap-2"><BookOpen size={14}/> Cara Aktifkan AI</h4>
              <ol className="text-xs text-indigo-700 space-y-2 list-decimal list-inside leading-relaxed">
                <li>Buka <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer" className="underline font-bold">openrouter.ai/settings/keys</a></li>
                <li>Daftar gratis (pakai Google/GitHub)</li>
                <li>Klik "Create Key" → copy key yang muncul</li>
                <li>Paste di kolom API Key di bawah → klik Simpan</li>
              </ol>
              <p className="text-xs text-indigo-500 italic">OpenRouter punya free tier. Untuk pemakaian ringan (tanya-tanya bisnis) biasanya gratis.</p>
            </div>
          </div>
        )}

        <div className="px-6 pb-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500">API Key OpenRouter</label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16}/>
              <input 
                type="password"
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:border-indigo-500 focus:bg-white outline-none transition-all"
                placeholder="sk-or-v1-xxxxxxxxxxxx"
                value={cloudConfig.openRouterApiKey || ''}
                disabled={!allowRuntimeSettings && Boolean(envConfig.openRouterApiKey)}
                onChange={(e) => setCloudConfig({...cloudConfig, openRouterApiKey: e.target.value})}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500">Model AI <span className="text-slate-300 font-normal">(biarkan default jika tidak yakin)</span></label>
            <input
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:border-indigo-500 outline-none"
              placeholder="openrouter/auto"
              value={cloudConfig.aiModel || 'openrouter/auto'}
              onChange={(e) => setCloudConfig({...cloudConfig, aiModel: e.target.value})}
            />
          </div>
        </div>
      </div>

      {/* Section 2: Cloud Sync (Cloudflare) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${hasCloudDb && cloudConfig.enabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
              {hasCloudDb && cloudConfig.enabled ? <Wifi size={20}/> : <WifiOff size={20}/>}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Cloud Sync (Cloudflare)</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isEnvManaged ? 'Toko ditetapkan dari env build' : hasCloudDb && cloudConfig.enabled ? 'Data tersinkron antar perangkat' : 'Opsional — untuk sinkron data antar komputer/tablet'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleTestCloud} className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">
              {cloudStatus === 'testing' ? <RefreshCw size={14} className="animate-spin" /> : 'Tes'}
            </button>
            {cloudStatus === 'connected' && <CheckCircle2 size={18} className="text-emerald-500" />}
            <button onClick={() => setShowTutorial(showTutorial === 'cloud' ? 'none' : 'cloud')} className="p-2 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-50" aria-label="Panduan cloud sync">
              <HelpCircle size={16} />
            </button>
          </div>
        </div>

        {showTutorial === 'cloud' && (
          <div className="px-6 pb-4">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-blue-800 flex items-center gap-2"><BookOpen size={14}/> Cara Pakai Cloud Sync</h4>
              <ol className="text-xs text-blue-700 space-y-2 list-decimal list-inside leading-relaxed">
                <li>Isi <b>Store ID</b> unik untuk toko (mis. <code>bengkel_jaya</code>), centang <b>Aktifkan</b>, lalu Simpan.</li>
                <li>Perangkat pertama (owner): <b>Daftarkan toko baru</b> di panel Keamanan Cloud memakai kode pendaftaran dari pemilik server.</li>
                <li>Perangkat lain: isi Store ID yang sama (atau tempel kode aktivasi), lalu <b>Login perangkat</b> dengan email & password cloud toko.</li>
              </ol>
              <p className="text-xs text-blue-500 italic">Data tersimpan di Cloudflare (Durable Object per toko) dan tetap bisa dipakai offline — sinkron otomatis saat online.</p>
            </div>
          </div>
        )}

        {!isEnvManaged ? (
          <div className="px-6 pb-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500" htmlFor="cloud-store-id">Store ID <span className="text-slate-300 font-normal">(nama unik toko)</span></label>
                <input id="cloud-store-id" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:border-blue-500 outline-none" placeholder="bengkel_saya" value={cloudConfig.storeId || ''} onChange={(e) => setCloudConfig({...cloudConfig, storeId: e.target.value.toLowerCase().replace(/\s+/g, '_')})} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500" htmlFor="cloud-display-name">Nama tampilan <span className="text-slate-300 font-normal">(opsional)</span></label>
                <input id="cloud-display-name" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:border-blue-500 outline-none" placeholder="Bengkel Jaya Pusat" value={cloudConfig.displayName || ''} onChange={(e) => setCloudConfig({...cloudConfig, displayName: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500" htmlFor="cloud-api-url">Alamat API <span className="text-slate-300 font-normal">(kosongkan bila aplikasi dibuka dari domain Cloudflare-nya sendiri)</span></label>
              <input id="cloud-api-url" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:border-blue-500 outline-none" placeholder="https://poshulio.namaanda.workers.dev" value={cloudConfig.apiBaseUrl || ''} onChange={(e) => setCloudConfig({...cloudConfig, apiBaseUrl: e.target.value.trim()})} />
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={Boolean(cloudConfig.enabled)} onChange={(e) => setCloudConfig({...cloudConfig, enabled: e.target.checked})} /> Aktifkan cloud sync di perangkat ini
            </label>
            {hasCloudDb && cloudConfig.enabled && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Kode aktivasi untuk perangkat lain (tanpa rahasia):</span>
                <code className="px-2 py-1 bg-slate-100 rounded-lg break-all">{generateActivationCodeForConfig({ ...cloudConfig, storeId: storeIdDraft })}</code>
                <button type="button" onClick={() => navigator.clipboard?.writeText(generateActivationCodeForConfig({ ...cloudConfig, storeId: storeIdDraft }))} className="flex items-center gap-1 text-blue-600 font-semibold"><Copy size={12}/> Salin</button>
              </div>
            )}
          </div>
        ) : (
          <div className="px-6 pb-6">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-emerald-700">Toko: {cloudConfig.displayName || cloudConfig.storeId}</p>
                <p className="text-xs text-emerald-600 mt-1">Store ID ditetapkan saat build (VITE_STORE_ID). Cukup login perangkat di panel Keamanan Cloud.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 3: Deploy Tutorial */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <button onClick={() => setShowTutorial(showTutorial === 'deploy' ? 'none' : 'deploy')} className="w-full p-6 flex items-center justify-between text-left hover:bg-slate-50 transition-all">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 text-orange-600 rounded-xl"><Globe size={20}/></div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Panduan Deploy ke Cloudflare</h3>
              <p className="text-xs text-slate-400 mt-0.5">Aplikasi, API, data toko, dan file — semuanya di Cloudflare</p>
            </div>
          </div>
          <ChevronDown size={18} className={`text-slate-400 transition-transform ${showTutorial === 'deploy' ? 'rotate-180' : ''}`} />
        </button>

        {showTutorial === 'deploy' && (
          <div className="px-6 pb-6 space-y-4">
            <div className="bg-gradient-to-r from-orange-600 to-amber-500 rounded-xl p-5 text-white space-y-3">
              <h4 className="text-sm font-bold">Deploy ke Cloudflare Workers <span className="text-xs font-normal text-orange-100">(paket gratis cukup)</span></h4>
              <ol className="text-xs space-y-1.5 list-decimal list-inside text-orange-50 leading-relaxed">
                <li><code className="bg-white/15 px-1 rounded">npx wrangler login</code></li>
                <li><code className="bg-white/15 px-1 rounded">npx wrangler r2 bucket create poshulio-media</code> (sekali)</li>
                <li><code className="bg-white/15 px-1 rounded">npx wrangler secret put SETUP_KEY</code> dan <code className="bg-white/15 px-1 rounded">MEDIA_SIGNING_SECRET</code> (opsional <code className="bg-white/15 px-1 rounded">OPENROUTER_API_KEY</code>)</li>
                <li><code className="bg-white/15 px-1 rounded">npm run deploy</code> → dapat URL <code className="bg-white/15 px-1 rounded">https://poshulio.&lt;akun&gt;.workers.dev</code></li>
              </ol>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-2">
              <h4 className="text-sm font-bold text-emerald-800">💻 Pakai Lokal Saja</h4>
              <p className="text-xs text-emerald-700 leading-relaxed">
                Jalankan <code className="bg-emerald-100 px-1 rounded">npm run dev</code> dan buka <code className="bg-emerald-100 px-1 rounded">localhost:3000</code>. Backend Cloudflare ikut berjalan lokal; tanpa cloud sync data tetap tersimpan di browser.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex flex-wrap gap-3">
        <button 
          disabled={isSaving}
          onClick={handleSave} 
          className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>}
          {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
        </button>
      </div>

      {isFullMode && getSnapshot && <AutoBackupPanel getSnapshot={getSnapshot} />}
      {isFullMode && (onImportItems || onImportContacts || onImportOpeningReceivables) && (
        <IposImportPanel onImportItems={onImportItems} onImportContacts={onImportContacts} onImportOpeningReceivables={onImportOpeningReceivables} />
      )}

      {/* Section 4: Backup & Restore */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700 mb-2">Backup & Restore</h3>
        <p className="text-xs text-slate-400 mb-4">Export semua data (barang, penjualan, pelanggan) ke file JSON. Bisa diimport kembali kapan saja.</p>
        <div className="flex flex-wrap gap-3">
          <button onClick={onExportBackup} className="px-5 py-3 bg-emerald-600 text-white rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-emerald-700 transition-all">
            <Download size={16}/> Export Backup
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="px-5 py-3 bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-slate-900 transition-all">
            <Upload size={16}/> Import Backup
          </button>
          <input type="file" ref={fileInputRef} className="hidden" accept="application/json" onChange={async e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file || !onImportBackup) return;
            if (!window.confirm('Import backup akan MENGGANTI data di perangkat ini. Lanjutkan?')) return;
            try {
              await onImportBackup(file);
              alert('Backup berhasil diimport!');
            } catch (error: any) {
              alert(`Import gagal: ${error?.message || 'file tidak valid'}`);
            }
          }} />
        </div>
      </div>

      {/* Diagnostic Log */}
      {logs.length > 0 && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Log Diagnostik</span>
            <button onClick={() => setLogs([])} className="text-[10px] text-slate-500 hover:text-slate-300">Clear</button>
          </div>
          <div className="max-h-48 overflow-y-auto p-3 space-y-1.5">
            {logs.map((log, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-slate-600 font-mono shrink-0">{log.time}</span>
                <span className={`${log.type === 'ok' ? 'text-emerald-400' : log.type === 'err' ? 'text-red-400' : 'text-slate-400'}`}>
                  {log.type === 'ok' ? '✓' : log.type === 'err' ? '✗' : '→'} {log.msg}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer info */}
      <div className="text-center py-4">
        <p className="text-xs text-slate-300">POS Hulio v5 • Data tersimpan di {hasCloudDb ? 'Cloud + Lokal' : 'Browser (Lokal)'}</p>
      </div>
    </div>
  );
};

export default Settings;
