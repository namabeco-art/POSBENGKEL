import React, { useState, useEffect } from 'react';
import { 
  Save, Globe, RefreshCw, Info, CheckCircle2, 
  AlertCircle, Bot, Key, HelpCircle, Loader2, Database,
  HardDrive, ExternalLink, BookOpen, Wifi, WifiOff, Shield,
  ChevronDown, Copy, Download, Upload
} from 'lucide-react';
import { getEnvConfig, getResolvedOpenRouterApiKey, getResolvedOpenRouterModel, getResolvedSupabaseAnonKey, getResolvedSupabaseBucket, getResolvedSupabaseUrl, hasEnvCloudConfig, isRuntimeSettingsAllowed } from '../services/appConfig';
import { 
  getCloudConfig, saveCloudConfig, smartTestConnection, pushConfigToCloud
} from '../services/syncService';
import { parseOpenRouterError, requestOpenRouterReply } from '../services/aiService';

interface SettingsProps {
  onCloudConfigChange?: () => void;
  onExportBackup?: () => void;
  onImportBackup?: (file: File) => Promise<void> | void;
}

const Settings: React.FC<SettingsProps> = ({ onCloudConfigChange, onExportBackup, onImportBackup }) => {
  const [cloudConfig, setCloudConfig] = useState<any>(getCloudConfig());
  const [aiStatus, setAiStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [cloudStatus, setCloudStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
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
  const hasCloudDb = Boolean(
    (cloudConfig.supabaseUrl || cloudConfig.url) && 
    (cloudConfig.supabaseAnonKey || cloudConfig.token) && 
    cloudConfig.storeId
  );
  const isEnvManaged = hasEnvCloudConfig();

  useEffect(() => {
    addLog('Halaman pengaturan dimuat', 'info');
    if (hasAiKey) addLog('API Key OpenRouter terdeteksi', 'ok');
    if (isEnvManaged) addLog('Konfigurasi dari .env server aktif', 'ok');
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
      const persistedDraft = { ...getCloudConfig(), ...cloudConfig, openRouterApiKey: resolvedApiKey, aiModel: resolvedModel };
      saveCloudConfig(persistedDraft);
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
    const url = (cloudConfig.supabaseUrl || cloudConfig.url || '').trim();
    const key = (cloudConfig.supabaseAnonKey || cloudConfig.token || '').trim();
    if (!url || !key) { setCloudStatus('error'); addLog('URL atau Key Supabase kosong', 'err'); return; }
    setCloudStatus('testing');
    addLog(`Tes koneksi ke ${url.slice(0, 30)}...`, 'info');
    const result = await smartTestConnection(url, key);
    if (result.success) {
      setCloudStatus('connected');
      addLog('Supabase terhubung — cloud sync aktif', 'ok');
    } else {
      setCloudStatus('error');
      addLog(`Supabase gagal: ${result.message}`, 'err');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    addLog('Menyimpan pengaturan...', 'info');
    try {
      const finalConfig = { ...cloudConfig, supabaseUrl: cloudConfig.supabaseUrl || cloudConfig.url || '', supabaseAnonKey: cloudConfig.supabaseAnonKey || cloudConfig.token || '', supabaseBucket: cloudConfig.supabaseBucket || 'erp-media', enabled: hasCloudDb };
      saveCloudConfig(finalConfig);
      if (hasCloudDb) await pushConfigToCloud(finalConfig).catch(() => {});
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

      {/* Section 2: Cloud Sync */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${hasCloudDb ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
              {hasCloudDb ? <Wifi size={20}/> : <WifiOff size={20}/>}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Cloud Sync</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isEnvManaged ? 'Dikelola dari file .env server' : hasCloudDb ? 'Data tersinkron antar perangkat' : 'Opsional — untuk sinkron data antar komputer/tablet'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasCloudDb && cloudStatus !== 'connected' && (
              <button onClick={handleTestCloud} className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">
                {cloudStatus === 'testing' ? <RefreshCw size={14} className="animate-spin" /> : 'Tes'}
              </button>
            )}
            {cloudStatus === 'connected' && <CheckCircle2 size={18} className="text-emerald-500" />}
            <button onClick={() => setShowTutorial(showTutorial === 'cloud' ? 'none' : 'cloud')} className="p-2 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-50">
              <HelpCircle size={16} />
            </button>
          </div>
        </div>

        {showTutorial === 'cloud' && (
          <div className="px-6 pb-4 space-y-3">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-blue-800 flex items-center gap-2"><BookOpen size={14}/> Kapan Perlu Cloud Sync?</h4>
              <p className="text-xs text-blue-700 leading-relaxed">Cloud sync berguna jika Anda punya 2+ perangkat (misal: komputer kasir + laptop belakang) yang perlu data sama.</p>
              <ol className="text-xs text-blue-700 space-y-2 list-decimal list-inside leading-relaxed">
                <li>Buka <a href="https://supabase.com" target="_blank" rel="noreferrer" className="underline font-bold">supabase.com</a> → daftar gratis</li>
                <li>Buat project baru (pilih region Singapore untuk Indonesia)</li>
                <li>Buka Settings → API → copy <b>Project URL</b> dan <b>anon public key</b></li>
                <li>Buka Storage → buat bucket bernama <b>erp-media</b> (set public)</li>
                <li>Paste URL dan Key di kolom bawah → klik Simpan</li>
              </ol>
              <p className="text-xs text-blue-500 italic">Supabase free tier: 500MB database + 1GB storage. Cukup untuk bengkel kecil-menengah.</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-bold text-amber-800">⚡ Perbedaan: Isi di sini vs di .env (Vercel/VPS)</h4>
              <div className="text-xs text-amber-700 leading-relaxed space-y-1.5">
                <p><b>• Isi di halaman ini</b> → untuk pakai lokal (npm run dev di komputer toko). Data disimpan di browser.</p>
                <p><b>• Isi di .env / Vercel Environment Variables</b> → untuk deploy online. Tidak perlu isi di halaman ini karena sistem otomatis baca dari server.</p>
                <p className="text-amber-600 italic pt-1">Kalau sudah deploy ke Vercel dengan env variables, bagian ini bisa diabaikan — checklist "Env Server (.env)" di atas akan hijau otomatis.</p>
              </div>
            </div>
          </div>
        )}

        {!isEnvManaged && (
          <div className="px-6 pb-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500">Store ID <span className="text-slate-300 font-normal">(nama unik toko)</span></label>
                <input className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:border-blue-500 outline-none" placeholder="bengkel_saya" value={cloudConfig.storeId || ''} onChange={(e) => setCloudConfig({...cloudConfig, storeId: e.target.value.toLowerCase().replace(/\s+/g, '_')})} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500">Supabase Bucket <span className="text-slate-300 font-normal">(biarkan default)</span></label>
                <input className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:border-blue-500 outline-none" placeholder="erp-media" value={(cloudConfig as any).supabaseBucket || 'erp-media'} onChange={(e) => setCloudConfig({...cloudConfig, supabaseBucket: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500">Supabase URL <span className="text-slate-300 font-normal">(dari Settings → API di Supabase)</span></label>
              <input className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:border-blue-500 outline-none" placeholder="https://xxxxx.supabase.co" value={cloudConfig.supabaseUrl || cloudConfig.url || ''} onChange={(e) => setCloudConfig({...cloudConfig, supabaseUrl: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500">Supabase Anon Key <span className="text-slate-300 font-normal">(dari Settings → API di Supabase)</span></label>
              <input type="password" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:border-blue-500 outline-none" placeholder="eyJhbGciOiJIUzI1NiIs..." value={cloudConfig.supabaseAnonKey || cloudConfig.token || ''} onChange={(e) => setCloudConfig({...cloudConfig, supabaseAnonKey: e.target.value})} />
            </div>
          </div>
        )}

        {isEnvManaged && (
          <div className="px-6 pb-6">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-emerald-700">Sudah Terhubung via Environment Server</p>
                <p className="text-xs text-emerald-600 mt-1">Konfigurasi cloud diambil otomatis dari file .env di server (Vercel/VPS). Tidak perlu isi manual di sini.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 3: Deploy Tutorial */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <button onClick={() => setShowTutorial(showTutorial === 'deploy' ? 'none' : 'deploy')} className="w-full p-6 flex items-center justify-between text-left hover:bg-slate-50 transition-all">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 text-purple-600 rounded-xl"><Globe size={20}/></div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Panduan Deploy Online</h3>
              <p className="text-xs text-slate-400 mt-0.5">Cara pasang POS ini di VPS atau Vercel agar bisa diakses dari mana saja</p>
            </div>
          </div>
          <ChevronDown size={18} className={`text-slate-400 transition-transform ${showTutorial === 'deploy' ? 'rotate-180' : ''}`} />
        </button>

        {showTutorial === 'deploy' && (
          <div className="px-6 pb-6 space-y-4">
            {/* Vercel */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-5 text-white space-y-3">
              <h4 className="text-sm font-bold flex items-center gap-2">▲ Deploy ke Vercel <span className="text-xs font-normal text-slate-300">(Gratis, paling mudah)</span></h4>
              <ol className="text-xs space-y-1.5 list-decimal list-inside text-slate-200 leading-relaxed">
                <li>Push kode ke GitHub</li>
                <li>Buka <a href="https://vercel.com" target="_blank" rel="noreferrer" className="underline text-blue-300">vercel.com</a> → Import project dari GitHub</li>
                <li>Di tab Environment Variables, isi VITE_OPENROUTER_API_KEY (dan cloud vars jika perlu)</li>
                <li>Klik Deploy — selesai! Dapat URL seperti <code className="bg-white/10 px-1 rounded">pos-bengkel.vercel.app</code></li>
              </ol>
            </div>

            {/* VPS */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">🖥️ Deploy ke VPS <span className="text-xs font-normal text-slate-400">(Lebih fleksibel)</span></h4>
              <ol className="text-xs space-y-1.5 list-decimal list-inside text-slate-600 leading-relaxed">
                <li>SSH ke VPS, install Node.js 18+</li>
                <li><code className="bg-slate-200 px-1 rounded">git clone</code> repo → <code className="bg-slate-200 px-1 rounded">npm install</code></li>
                <li>Buat file <code className="bg-slate-200 px-1 rounded">.env.local</code> → isi variabel yang diperlukan</li>
                <li><code className="bg-slate-200 px-1 rounded">npm run build</code> → serve folder <code className="bg-slate-200 px-1 rounded">dist/</code> pakai Nginx atau Caddy</li>
              </ol>
              <p className="text-xs text-slate-400 italic">Rekomendasi VPS murah: IDCloudHost (30rb/bln), DigitalOcean ($4/bln), atau Hetzner (€4/bln)</p>
            </div>

            {/* Lokal */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-3">
              <h4 className="text-sm font-bold text-emerald-800 flex items-center gap-2">💻 Pakai Lokal Saja</h4>
              <p className="text-xs text-emerald-700 leading-relaxed">
                Tidak perlu deploy ke mana-mana! Cukup jalankan <code className="bg-emerald-100 px-1 rounded">npm run dev</code> di komputer toko. 
                Buka browser ke <code className="bg-emerald-100 px-1 rounded">localhost:3000</code>. Data tersimpan di browser — aman selama tidak clear browser data.
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
            if (file && onImportBackup) { await onImportBackup(file); alert('Backup berhasil diimport!'); }
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
