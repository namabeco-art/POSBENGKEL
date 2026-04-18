import React, { useState, useEffect } from 'react';
import { 
  Save, Globe, RefreshCw, Terminal, Store, Share2, Info, CheckCircle2, 
  AlertCircle, Bot, Lock, Trash2, Key, HelpCircle, Loader2, Database,
  ArrowRight, HardDrive
} from 'lucide-react';
import { getEnvConfig, getResolvedOpenRouterApiKey, getResolvedOpenRouterModel, getResolvedSupabaseAnonKey, getResolvedSupabaseBucket, getResolvedSupabaseUrl, hasEnvCloudConfig, isRuntimeSettingsAllowed } from '../services/appConfig';
import { 
  getCloudConfig, saveCloudConfig, smartTestConnection, 
  generateActivationCode, pushConfigToCloud,
  deleteFromDbList, generateActivationCodeForConfig 
} from '../services/syncService';
import { getCloudProfileLabel, getCloudProfileRegion, getCloudProfiles } from '../services/cloudProfiles';
import { parseOpenRouterError, requestOpenRouterReply } from '../services/aiService';

interface SettingsProps {
  onCloudConfigChange?: () => void;
  onExportBackup?: () => void;
  onImportBackup?: (file: File) => Promise<void> | void;
}

const Settings: React.FC<SettingsProps> = ({ onCloudConfigChange, onExportBackup, onImportBackup }) => {
  const [cloudConfig, setCloudConfig] = useState<any>(getCloudConfig());
  const [dbList, setDbList] = useState<any[]>(getCloudProfiles());
  const [kvStatus, setKvStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [aiStatus, setAiStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [mediaStatus, setMediaStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<{time: string, msg: string, type: 'info' | 'success' | 'error', details?: string}[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const envConfig = getEnvConfig();
  const usingEnvCloud = hasEnvCloudConfig();
  const allowRuntimeSettings = isRuntimeSettingsAllowed();

  const addLog = (msg: string, type: 'info' | 'success' | 'error' = 'info', details?: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [{ time, msg, type, details }, ...prev].slice(0, 15));
  };

  const checkAiStatus = () => {
    const currentApiKey = getResolvedOpenRouterApiKey(getCloudConfig().openRouterApiKey).trim();
    const currentModel = getResolvedOpenRouterModel(getCloudConfig().aiModel);
    const currentSupabaseUrl = getResolvedSupabaseUrl((getCloudConfig() as any).supabaseUrl).trim();
    const currentSupabaseKey = getResolvedSupabaseAnonKey((getCloudConfig() as any).supabaseAnonKey).trim();
    const currentSupabaseBucket = getResolvedSupabaseBucket((getCloudConfig() as any).supabaseBucket).trim();
    if (currentApiKey && currentApiKey.length > 10) {
      addLog('AI Core Status: Kunci API OpenRouter terdeteksi.', 'success', `Model routing aktif: ${currentModel} | Key: ${currentApiKey.substring(0, 12)}...`);
    } else {
      addLog('AI Core Status: Kunci API OpenRouter kosong.', 'error', 'AI tidak akan berfungsi tanpa API Key OpenRouter yang disimpan di sistem.');
    }
    if (currentSupabaseUrl && currentSupabaseKey && currentSupabaseBucket) {
      addLog('Media Vault: Supabase Storage siap dipakai.', 'success', `Bucket: ${currentSupabaseBucket}`);
    } else {
      addLog('Media Vault: Konfigurasi Supabase belum lengkap.', 'info', 'Isi Supabase URL, Anon Key, dan Bucket untuk fitur setor media.');
    }
  };

  useEffect(() => {
    if ((cloudConfig.supabaseUrl || cloudConfig.url) && (cloudConfig.supabaseAnonKey || cloudConfig.token) && cloudConfig.enabled) handleTestDB();
    addLog('Sistem pengaturan dimuat. Engine: OpenRouter', 'info');
    checkAiStatus();
  }, []);

  const refreshList = () => setDbList(getCloudProfiles());

  const handleCopyItemCode = (config: any) => {
    if (usingEnvCloud) {
      addLog(`Deployment ini memakai environment server. Activation code tidak diperlukan.`, 'info');
      return;
    }
    const code = generateActivationCodeForConfig(config);
    navigator.clipboard.writeText(code);
    addLog(`Kode Aktivasi untuk ${config.storeId} disalin.`, 'success');
    alert(`Kode Aktivasi ${config.storeId} Disalin!`);
  };

  const handleDeleteDb = (storeId: string) => {
    if (!allowRuntimeSettings) {
      addLog(`Perubahan database lokal dikunci oleh environment server.`, 'info');
      return;
    }
    if (window.confirm(`Hapus database ${storeId} dari daftar lokal?`)) {
      deleteFromDbList(storeId);
      refreshList();
      addLog(`Database ${storeId} dihapus dari direktori.`, 'info');
    }
  };

  const handleSwitchDb = (config: any) => {
    if (!allowRuntimeSettings && usingEnvCloud) {
      addLog(`Workspace aktif dikunci oleh environment server.`, 'info');
      return;
    }
    setCloudConfig(config);
    saveCloudConfig(config);
    if (onCloudConfigChange) onCloudConfigChange();
    addLog(`Berpindah ke database: ${config.storeId}`, 'success');
    handleTestDB();
    setTimeout(checkAiStatus, 500);
  };

  const handleTestDB = async () => {
    const supabaseUrl = (cloudConfig.supabaseUrl || cloudConfig.url || '').trim();
    const supabaseAnonKey = (cloudConfig.supabaseAnonKey || cloudConfig.token || '').trim();
    if (!supabaseUrl || !supabaseAnonKey) {
      setKvStatus('error');
      addLog("Pengujian Gagal: Input Kosong", 'error');
      return;
    }
    setKvStatus('testing');
    const result = await smartTestConnection(supabaseUrl, supabaseAnonKey);
    if (result.success) {
      setKvStatus('connected');
      addLog(result.message, 'success');
    } else {
      setKvStatus('error');
      addLog("Gagal terhubung ke Supabase.", 'error', result.message);
    }
  };

  const handleTestAI = async () => {
    const resolvedApiKey = getResolvedOpenRouterApiKey(cloudConfig.openRouterApiKey).trim();
    const resolvedModel = getResolvedOpenRouterModel(cloudConfig.aiModel);

    if (!resolvedApiKey || resolvedApiKey.length < 10) {
      setAiStatus('error');
      addLog('Tes OpenRouter gagal: API key kosong/invalid.', 'error');
      return;
    }

    setAiStatus('testing');
    addLog(`Tes OpenRouter dimulai (model: ${resolvedModel})...`, 'info');

    try {
      // Persist draft AI config first so other modules (chatbot/consultant) read the same key immediately.
      const persistedDraft = {
        ...getCloudConfig(),
        ...cloudConfig,
        openRouterApiKey: resolvedApiKey,
        aiModel: resolvedModel,
      };
      saveCloudConfig(persistedDraft);
      if (onCloudConfigChange) onCloudConfigChange();

      const reply = await requestOpenRouterReply({
        apiKey: resolvedApiKey,
        userMessage: 'Balas hanya: OPENROUTER_OK',
        systemPrompt: 'You are a connectivity check endpoint.',
        primaryModel: resolvedModel,
        fallbackModel: 'openrouter/auto',
        appName: 'POSHULIO Settings Test',
      });

      setAiStatus('connected');
      addLog('Tes OpenRouter berhasil.', 'success', `Respons: ${reply.slice(0, 60)}`);
    } catch (error: any) {
      setAiStatus('error');
      const parsed = parseOpenRouterError(error?.message || '');
      let message = 'Tes OpenRouter gagal.';
      if (parsed.code === 'OPENROUTER_AUTH_ERROR') message = 'Tes OpenRouter gagal: API key tidak valid.';
      else if (parsed.code === 'OPENROUTER_RATE_LIMIT') message = 'Tes OpenRouter gagal: rate limit aktif.';
      else if (parsed.code === 'OPENROUTER_CREDIT_ERROR' || parsed.code === 'OPENROUTER_PAYMENT_REQUIRED') message = 'Tes OpenRouter gagal: limit billing/quota provider.';
      else if (parsed.code === 'OPENROUTER_TIMEOUT') message = 'Tes OpenRouter gagal: timeout.';
      addLog(message, 'error', parsed.detail || error?.message || 'Unknown OpenRouter error');
    }
  };

  const handleTestMedia = async () => {
    const resolvedSupabaseUrl = getResolvedSupabaseUrl((cloudConfig as any).supabaseUrl).trim();
    const resolvedSupabaseKey = getResolvedSupabaseAnonKey((cloudConfig as any).supabaseAnonKey).trim();
    const resolvedSupabaseBucket = getResolvedSupabaseBucket((cloudConfig as any).supabaseBucket).trim();

    if (!resolvedSupabaseUrl || !resolvedSupabaseKey || !resolvedSupabaseBucket) {
      setMediaStatus('error');
      addLog('Tes Supabase Media gagal: konfigurasi belum lengkap.', 'error');
      return;
    }

    setMediaStatus('testing');
    addLog(`Tes Supabase Media dimulai (bucket: ${resolvedSupabaseBucket})...`, 'info');
    try {
      const cleanUrl = resolvedSupabaseUrl.replace(/\/+$/, '');
      const resp = await fetch(`${cleanUrl}/storage/v1/bucket/${encodeURIComponent(resolvedSupabaseBucket)}`, {
        headers: {
          apikey: resolvedSupabaseKey,
          Authorization: `Bearer ${resolvedSupabaseKey}`,
        },
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        throw new Error(`HTTP_${resp.status} ${detail}`);
      }
      setMediaStatus('connected');
      addLog('Tes Supabase Media berhasil.', 'success', `Bucket ${resolvedSupabaseBucket} dapat diakses.`);
    } catch (error: any) {
      setMediaStatus('error');
      addLog('Tes Supabase Media gagal.', 'error', error?.message || 'Unknown Supabase media error');
    }
  };

  const handleSaveAllConfig = async () => {
    if (!allowRuntimeSettings && (usingEnvCloud || envConfig.openRouterApiKey)) {
      alert("Konfigurasi dikunci oleh environment server. Ubah file .env di host deployment.");
      return;
    }
    setIsSaving(true);
    addLog('Sinkronisasi konfigurasi Supabase + OpenRouter...', 'info');

    try {
      const hasDbCreds = Boolean((cloudConfig.supabaseUrl || cloudConfig.url) && (cloudConfig.supabaseAnonKey || cloudConfig.token) && cloudConfig.storeId);
      // Step 1: Save locally first (AI key/model can work without DB cloud)
      const finalConfig = {
        ...cloudConfig,
        supabaseUrl: cloudConfig.supabaseUrl || cloudConfig.url || '',
        supabaseAnonKey: cloudConfig.supabaseAnonKey || cloudConfig.token || '',
        supabaseBucket: cloudConfig.supabaseBucket || 'erp-media',
        enabled: hasDbCreds ? true : false,
      };
      saveCloudConfig(finalConfig);
      
      // Step 2: Push ke Cloud hanya jika kredensial DB lengkap
      if (hasDbCreds) {
        await pushConfigToCloud(finalConfig);
      }
      
      if (onCloudConfigChange) onCloudConfigChange();
      refreshList();
      
      if (hasDbCreds) {
        addLog('Konfigurasi Berhasil Disimpan.', 'success', 'OpenRouter + Supabase aktif dan tersinkron ke cloud.');
        alert('Konfigurasi Supabase dan OpenRouter berhasil disimpan.');
      } else {
        addLog('Konfigurasi AI tersimpan lokal tanpa cloud.', 'info', 'Isi Supabase URL/Anon Key/Store ID jika ingin sinkron cloud.');
        alert('Konfigurasi tersimpan lokal. Sinkron cloud belum aktif.');
      }
      
      if (hasDbCreds) handleTestDB();
      setTimeout(checkAiStatus, 1000); 
    } catch (e: any) {
      addLog("Sinkronisasi Cloud Gagal!", 'error', "Data tersimpan lokal tapi gagal sinkron ke Cloud.");
      alert("Berhasil disimpan di lokal, namun gagal kirim ke cloud. Periksa koneksi internet.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-24 px-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-5">
           <div className="p-4 bg-slate-900 text-white rounded-[2rem] shadow-xl border-4 border-white shrink-0"><Database size={32}/></div>
           <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">PENGATURAN API & CLOUD</h2>
              <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-2">Hulio Group Ecosystem Configuration</p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        <div className="lg:col-span-7 space-y-8">
          <div className="bg-amber-50 rounded-[2rem] border-2 border-amber-200 p-6">
            <div className="flex gap-4">
              <div className="p-3 bg-amber-100 text-amber-600 rounded-xl h-fit shadow-sm"><Database size={20}/></div>
              <div className="min-w-0">
                <div className="font-black text-amber-800 uppercase tracking-widest text-sm">Deployment Terkelola (Environment)</div>
                <p className="mt-2 text-amber-700 font-bold text-xs leading-relaxed">
                  Konfigurasi database unit/toko ditarik secara otomatis dari file `.env` server. Pengubahan manual via menu ini dinonaktifkan untuk menjaga stabilitas sistem pusat dan cabang.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {envConfig.stores.map((s, i) => (
                    <span key={s.storeId} className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase border ${i === 0 ? 'bg-indigo-600 border-indigo-700 text-white' : 'bg-white border-amber-300 text-amber-800'}`}>
                      {i === 0 ? 'PUSAT: ' : ''}{s.displayName}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-[2.5rem] border-4 border-slate-100 overflow-hidden shadow-2xl">
             <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <Globe size={24} className="text-blue-400"/>
                  <h3 className="text-xl font-black uppercase tracking-tight">KREDENSIAL SUPABASE</h3>
                </div>
                <div className={`w-3 h-3 rounded-full ${kvStatus === 'connected' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]' : 'bg-red-500'}`}></div>
             </div>
             
             <div className="p-10 space-y-8">
                {!usingEnvCloud ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">STORE ID</label>
                          <input 
                             className="w-full p-4 bg-slate-50 border-4 border-slate-100 rounded-2xl font-black text-slate-800 focus:border-blue-600 outline-none"
                             placeholder="nama_toko"
                             value={cloudConfig.storeId}
                             onChange={(e) => setCloudConfig({...cloudConfig, storeId: e.target.value.toLowerCase().replace(/\s+/g, '_')})}
                           />
                       </div>
                       <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">SUPABASE URL</label>
                          <input 
                             className="w-full p-4 bg-slate-50 border-4 border-slate-100 rounded-2xl font-black text-slate-800 focus:border-blue-600 outline-none"
                             placeholder="https://xxxxx.supabase.co"
                             value={cloudConfig.supabaseUrl || cloudConfig.url || ''}
                             onChange={(e) => setCloudConfig({...cloudConfig, supabaseUrl: e.target.value})}
                           />
                       </div>
                    </div>
                    <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">SUPABASE ANON KEY</label>
                       <input 
                          type="password"
                          className="w-full p-4 bg-slate-50 border-4 border-slate-100 rounded-2xl font-black text-slate-800 focus:border-blue-600 outline-none"
                          placeholder="eyJ..."
                          value={cloudConfig.supabaseAnonKey || cloudConfig.token || ''}
                          onChange={(e) => setCloudConfig({...cloudConfig, supabaseAnonKey: e.target.value})}
                       />
                    </div>
                  </>
                ) : (
                  <div className="p-8 bg-slate-50 rounded-[2rem] border-4 border-dashed border-slate-100 text-center space-y-3">
                    <Database size={32} className="mx-auto text-slate-300" />
                    <div className="font-black text-slate-400 uppercase tracking-widest text-xs">Konfigurasi DB Dikunci</div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed max-w-xs mx-auto">Database Unit sedang menggunakan kredensial server. Pengubahan hanya bisa dilakukan melalui file .env</p>
                  </div>
                )}

                <div className="pt-8 border-t-4 border-slate-100 space-y-6">
                   <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-600 text-white rounded-lg"><Bot size={18}/></div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">OpenRouter AI Routing</h4>
                      </div>
                      <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer" className="text-[9px] font-black text-indigo-600 uppercase flex items-center gap-1"><HelpCircle size={10}/> Dapatkan API Key</a>
                   </div>

                   <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">OPENROUTER API KEY</label>
                      <div className="relative group">
                         <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18}/>
                         <input 
                            type="password"
                            className="w-full pl-12 pr-4 py-4 bg-indigo-50/50 border-4 border-slate-100 rounded-2xl font-black text-slate-800 focus:border-indigo-600 outline-none transition-all shadow-inner"
                            placeholder="Tempel Kunci OpenRouter di sini..."
                            value={cloudConfig.openRouterApiKey || ''}
                            disabled={!allowRuntimeSettings && Boolean(envConfig.openRouterApiKey)}
                            onChange={(e) => setCloudConfig({...cloudConfig, openRouterApiKey: e.target.value})}
                         />
                      </div>
                   </div>
                   <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">MODEL ROUTING</label>
                      <input
                        className="w-full p-4 bg-slate-50 border-4 border-slate-100 rounded-2xl font-black text-slate-800 focus:border-indigo-600 outline-none"
                        placeholder="openrouter/auto"
                        value={cloudConfig.aiModel || 'openrouter/auto'}
                        disabled={!allowRuntimeSettings && Boolean(envConfig.openRouterModel)}
                        onChange={(e) => setCloudConfig({...cloudConfig, aiModel: e.target.value})}
                      />
                   </div>
                   <div className="pt-6 border-t-2 border-slate-100 space-y-3">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">SUPABASE BUCKET MEDIA</label>
                      <input
                        className="w-full p-4 bg-slate-50 border-4 border-slate-100 rounded-2xl font-black text-slate-800 focus:border-emerald-600 outline-none"
                        placeholder="erp-media"
                        value={(cloudConfig as any).supabaseBucket || 'erp-media'}
                        onChange={(e) => setCloudConfig({...cloudConfig, supabaseBucket: e.target.value})}
                      />
                   </div>
                </div>

                <div className="flex flex-wrap gap-4 pt-4">
                   <button 
                    disabled={isSaving || (!allowRuntimeSettings && (usingEnvCloud || Boolean(envConfig.openRouterApiKey)))}
                    onClick={handleSaveAllConfig} 
                    className="flex-1 py-5 bg-blue-700 text-white font-black rounded-2xl shadow-xl hover:bg-blue-800 uppercase text-xs tracking-widest flex items-center justify-center gap-3 active:scale-95 border-b-8 border-blue-900"
                   >
                     {isSaving ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>}
                     {isSaving ? "SEDANG MENYIMPAN..." : "SIMPAN & TERAPKAN"}
                   </button>
                   <button onClick={handleTestDB} className="px-6 py-5 bg-slate-100 text-slate-700 font-black rounded-2xl border-4 border-slate-200 hover:bg-slate-200 uppercase text-xs tracking-widest">
                     {kvStatus === 'testing' ? <RefreshCw size={18} className="animate-spin"/> : "TES SUPABASE"}
                   </button>
                   <button onClick={handleTestAI} className="px-6 py-5 bg-indigo-100 text-indigo-700 font-black rounded-2xl border-4 border-indigo-200 hover:bg-indigo-200 uppercase text-xs tracking-widest flex items-center gap-2">
                     {aiStatus === 'testing' ? <RefreshCw size={18} className="animate-spin"/> : <Bot size={16} />}
                     TES OPENROUTER
                   </button>
                   <button onClick={handleTestMedia} className="px-6 py-5 bg-emerald-100 text-emerald-700 font-black rounded-2xl border-4 border-emerald-200 hover:bg-emerald-200 uppercase text-xs tracking-widest flex items-center gap-2">
                     {mediaStatus === 'testing' ? <RefreshCw size={18} className="animate-spin"/> : <Database size={16} />}
                     TES SUPABASE MEDIA
                   </button>
                </div>
             </div>
          </div>

          <div className="bg-white rounded-[2.5rem] border-4 border-slate-100 overflow-hidden shadow-xl">
             <div className="p-8 border-b-4 border-slate-50 flex items-center gap-4">
                <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl"><HardDrive size={24}/></div>
                <div>
                   <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">BACKUP & RESTORE</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Migrasi cepat antar server/perangkat</p>
                </div>
             </div>
             <div className="p-8 flex flex-wrap gap-4">
                <button onClick={onExportBackup} className="px-6 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest">Export Backup</button>
                <button onClick={() => fileInputRef.current?.click()} className="px-6 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest">Import Backup</button>
                <input type="file" ref={fileInputRef} className="hidden" accept="application/json" onChange={async e => {
                  const file = e.target.files?.[0];
                  if (file && onImportBackup) {
                    await onImportBackup(file);
                    addLog('Backup berhasil diimport.', 'success');
                  }
                }} />
             </div>
          </div>

          <div className="bg-white rounded-[2.5rem] border-4 border-slate-100 overflow-hidden shadow-xl">
             <div className="p-8 border-b-4 border-slate-50 flex items-center gap-4">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl"><HardDrive size={24}/></div>
                <div>
                   <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">DAFTAR KONEKSI AKTIF</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Multi-Database Switcher</p>
                </div>
             </div>
             
             <div className="p-8 space-y-4">
                {dbList.length === 0 ? (
                  <div className="py-12 text-center opacity-30 flex flex-col items-center gap-4">
                     <Database size={40}/>
                     <p className="font-black text-xs uppercase tracking-widest">Belum ada database</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                     {dbList.map((db, idx) => {
                        const isActive = cloudConfig.storeId === db.storeId;
                        return (
                          <div key={idx} className={`p-6 rounded-[2rem] border-4 transition-all flex flex-col md:flex-row items-center justify-between gap-6 ${isActive ? 'bg-blue-50 border-blue-600' : 'bg-white border-slate-50 hover:border-slate-200'}`}>
                             <div className="flex items-center gap-5 min-w-0 flex-1">
                                <div className={`p-4 rounded-2xl ${isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                   <Store size={24}/>
                                </div>
                                <div className="min-w-0">
                                   <div className="flex items-center gap-2 mb-1">
                                      <span className="font-black text-slate-800 uppercase text-sm md:text-lg truncate">{getCloudProfileLabel(db)}</span>
                                      {isActive && <span className="px-2 py-0.5 bg-blue-600 text-white text-[8px] font-black uppercase rounded">AKTIF</span>}
                                   </div>
                                   <div className="font-black text-[9px] text-slate-500 uppercase tracking-[0.2em]">{getCloudProfileRegion(db)} • {db.storeId}</div>
                                   <div className="font-mono text-[9px] text-slate-400 truncate max-w-xs mt-1">{db.url}</div>
                                </div>
                             </div>

                             <div className="flex items-center gap-2">
                                <button onClick={() => handleCopyItemCode(db)} className="p-3 bg-white border-2 border-slate-200 text-slate-500 rounded-xl hover:text-blue-600 transition-all"><Share2 size={18}/></button>
                                {!isActive && (
                                   <button onClick={() => handleSwitchDb(db)} className="p-3 bg-slate-900 text-white rounded-xl hover:bg-blue-700 transition-all flex items-center gap-2"><ArrowRight size={18}/> <span className="text-[9px] font-black uppercase">Hubungkan</span></button>
                                )}
                                <button onClick={() => handleDeleteDb(db.storeId)} className="p-3 text-slate-300 hover:text-red-500 transition-all"><Trash2 size={18}/></button>
                             </div>
                          </div>
                        );
                     })}
                  </div>
                )}
             </div>
          </div>
        </div>

        <div className="lg:col-span-5 bg-slate-950 rounded-[2.5rem] p-8 border-4 border-slate-900 shadow-2xl h-fit">
           <div className="flex items-center gap-4 mb-8">
             <div className="p-3 bg-white/5 rounded-xl border border-white/10"><Terminal size={20} className="text-emerald-500"/></div>
             <h4 className="text-sm font-black text-white uppercase tracking-[0.2em]">Diagnostic Audit Log</h4>
           </div>
           
           <div className="space-y-4 max-h-[800px] overflow-y-auto scrollbar-hide pr-2">
              {logs.map((log, i) => (
                <div key={i} className={`p-5 rounded-2xl border-l-[6px] bg-white/5 flex items-start gap-4 transition-all ${log.type === 'success' ? 'border-emerald-500' : log.type === 'error' ? 'border-red-500' : 'border-blue-600'}`}>
                   <div className={`mt-1 shrink-0 ${log.type === 'success' ? 'text-emerald-500' : log.type === 'error' ? 'text-red-500' : 'text-blue-400'}`}>
                      {log.type === 'success' ? <CheckCircle2 size={16}/> : log.type === 'error' ? <AlertCircle size={16}/> : <Info size={16}/>}
                   </div>
                   <div className="flex-1 min-w-0">
                      <div className="text-[8px] font-black uppercase tracking-[0.2em] mb-1 text-slate-500">{log.time}</div>
                      <div className="font-black tracking-tight uppercase text-[11px] text-slate-300">{log.msg}</div>
                      {log.details && <div className="mt-2 p-2 bg-black/40 rounded border border-white/5 text-[9px] font-bold text-slate-500 italic uppercase">{log.details}</div>}
                   </div>
                </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;



