import React, { useMemo, useState } from 'react';
import { CheckCircle2, FileText, Loader2, RefreshCw, Trash2, Upload, XCircle, Eye, Sparkles } from 'lucide-react';
import { MediaAsset, User } from '../types';
import { deleteSupabaseMedia, isSupabaseMediaConfigured, refreshSupabaseSignedUrl, uploadMediaToSupabase } from '../services/mediaService';
import { extractTextFromImage, fileToBase64 } from '../services/aiService';
import { getResolvedOpenRouterApiKey } from '../services/appConfig';
import { getCloudConfig } from '../services/syncService';

interface MediaVaultProps {
  currentUser: User;
  mediaAssets: MediaAsset[];
  onAddMediaAsset: (asset: MediaAsset) => void;
  onPatchMediaAsset: (id: string, patch: Partial<MediaAsset>) => void;
  onRemoveMediaAsset: (id: string) => void;
}

const MAX_TEXT_EXTRACT = 12000;

const MediaVault: React.FC<MediaVaultProps> = ({
  currentUser,
  mediaAssets,
  onAddMediaAsset,
  onPatchMediaAsset,
  onRemoveMediaAsset,
}) => {
  const [supplierName, setSupplierName] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [category, setCategory] = useState<MediaAsset['category']>('PRICE_LIST');
  const [notes, setNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });

  const aiSourceCount = useMemo(() => mediaAssets.filter(asset => asset.useAsKnowledge).length, [mediaAssets]);
  const sortedAssets = useMemo(
    () => [...mediaAssets].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()),
    [mediaAssets],
  );

  const readExtractedText = async (file: File): Promise<string> => {
    // Text-based files: read directly
    const isTextFile = file.type.startsWith('text/') || file.name.match(/\.(txt|csv|json|md)$/i);
    if (isTextFile) {
      const content = await file.text();
      return content.slice(0, MAX_TEXT_EXTRACT);
    }

    // Images & PDFs: use AI Vision OCR
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    
    if (isImage) {
      const apiKey = getResolvedOpenRouterApiKey(getCloudConfig().openRouterApiKey)?.trim();
      if (!apiKey) return '';
      
      try {
        setOcrProgress(`Membaca teks dari ${file.name}...`);
        const base64 = await fileToBase64(file);
        const extracted = await extractTextFromImage({
          apiKey,
          imageBase64: base64,
          mimeType: file.type,
          prompt: 'Extract ALL text from this price list image. Output product names, codes/SKU, and prices in a structured format. Preserve all numbers accurately.',
        });
        setOcrProgress('');
        return extracted.slice(0, MAX_TEXT_EXTRACT);
      } catch (e) {
        setOcrProgress('');
        console.warn('OCR failed:', e);
        return '';
      }
    }

    // PDF: convert first page to image is not possible in browser without library
    // For now, inform user to use image format
    if (isPdf) {
      setOcrProgress('');
      return '[PDF detected — untuk hasil terbaik, foto/screenshot halaman price list dan upload sebagai gambar (JPG/PNG)]';
    }

    return '';
  };

  const handleUpload: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    if (!isSupabaseMediaConfigured()) {
      setStatus({ type: 'error', message: 'Konfigurasi Supabase belum lengkap di Pengaturan API.' });
      event.target.value = '';
      return;
    }

    setIsUploading(true);
    setStatus({ type: 'idle', message: '' });
    try {
      for (const file of Array.from(files)) {
        const extractedText = await readExtractedText(file);
        const asset = await uploadMediaToSupabase(file, currentUser.name, {
          supplierName: supplierName || undefined,
          effectiveDate: effectiveDate || undefined,
          category: category || 'OTHER',
          notes: notes || undefined,
          extractedText: extractedText || undefined,
          useAsKnowledge: true,
        });
        onAddMediaAsset(asset);
      }
      setStatus({ type: 'success', message: `${files.length} file berhasil diunggah ke Supabase Storage.` });
    } catch (error: any) {
      setStatus({ type: 'error', message: error?.message || 'Upload media gagal.' });
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleDelete = async (asset: MediaAsset) => {
    if (!window.confirm(`Hapus media "${asset.name}"?`)) return;
    await deleteSupabaseMedia(asset);
    onRemoveMediaAsset(asset.id);
  };

  const handleOpenFile = async (asset: MediaAsset) => {
    let url = asset.signedUrl;
    if (!url && asset.storagePath) {
      url = await refreshSupabaseSignedUrl(asset);
      if (url) onPatchMediaAsset(asset.id, { signedUrl: url });
    }
    if (url) window.open(url, '_blank');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Media Vault</h2>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">
            Setor PDF/Gambar/CSV sebagai sumber informasi AI
          </p>
        </div>
        <div className="text-[10px] font-black px-4 py-2 rounded-xl border border-slate-200 bg-white">
          AI Sources Aktif: {aiSourceCount}
        </div>
      </div>

      <div className="bg-white border-2 border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            className="px-3 py-2 rounded-xl border-2 border-slate-200 bg-slate-50 text-[12px] font-bold"
            placeholder="Supplier (opsional)"
            value={supplierName}
            onChange={e => setSupplierName(e.target.value)}
          />
          <input
            type="date"
            className="px-3 py-2 rounded-xl border-2 border-slate-200 bg-slate-50 text-[12px] font-bold"
            value={effectiveDate}
            onChange={e => setEffectiveDate(e.target.value)}
          />
          <select
            className="px-3 py-2 rounded-xl border-2 border-slate-200 bg-slate-50 text-[12px] font-bold"
            value={category}
            onChange={e => setCategory(e.target.value as MediaAsset['category'])}
          >
            <option value="PRICE_LIST">PRICE_LIST</option>
            <option value="INVOICE">INVOICE</option>
            <option value="CATALOG">CATALOG</option>
            <option value="PROMO">PROMO</option>
            <option value="OTHER">OTHER</option>
          </select>
          <label className="px-4 py-2 rounded-xl border-2 border-indigo-200 bg-indigo-50 text-indigo-700 text-[11px] font-black uppercase tracking-widest cursor-pointer flex items-center justify-center gap-2">
            {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {isUploading ? 'Uploading...' : 'Setor Media'}
            <input type="file" className="hidden" multiple onChange={handleUpload} disabled={isUploading} />
          </label>
        </div>
        <textarea
          className="w-full min-h-[90px] px-3 py-2 rounded-xl border-2 border-slate-200 bg-slate-50 text-[12px] font-bold"
          placeholder="Catatan media (mis. price list pabrik April 2026)"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
        {ocrProgress && (
          <div className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 flex items-center gap-2">
            <Sparkles size={14} className="animate-pulse" /> {ocrProgress}
          </div>
        )}
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
          💡 Upload foto/screenshot price list supplier (JPG/PNG) — AI akan otomatis baca dan extract harga. Lalu tanya di AI Consultant: "Berapa harga terbaru dari supplier X?"
        </div>
        {status.type !== 'idle' && (
          <div className={`text-[11px] font-black rounded-xl px-3 py-2 border flex items-center gap-2 ${status.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {status.type === 'success' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {status.message}
          </div>
        )}
      </div>

      <div className="bg-white border-2 border-slate-200 rounded-3xl p-4 md:p-6 shadow-sm">
        <div className="text-[11px] font-black uppercase tracking-widest text-slate-600 mb-4">Daftar Media</div>
        <div className="space-y-3">
          {sortedAssets.length === 0 ? (
            <div className="text-center text-[12px] font-bold text-slate-400 py-10">Belum ada media. Upload price list pertama Anda.</div>
          ) : sortedAssets.map(asset => (
            <div key={asset.id} className="border border-slate-200 rounded-2xl p-3 md:p-4 bg-slate-50/50">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-slate-500" />
                    <div className="font-black text-slate-800 text-[12px] truncate">{asset.name}</div>
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 mt-1">
                    {asset.category || 'OTHER'} • {asset.supplierName || 'Unknown supplier'} • {new Date(asset.uploadedAt).toLocaleString('id-ID')}
                  </div>
                  {asset.notes && <div className="text-[10px] font-bold text-slate-500 mt-1">Catatan: {asset.notes}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onPatchMediaAsset(asset.id, { useAsKnowledge: !asset.useAsKnowledge })}
                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase border ${asset.useAsKnowledge ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-slate-600 border-slate-300'}`}
                  >
                    {asset.useAsKnowledge ? 'AI Source: ON' : 'AI Source: OFF'}
                  </button>
                  <button
                    onClick={() => handleOpenFile(asset)}
                    className="px-3 py-1 rounded-lg text-[10px] font-black uppercase border border-blue-300 bg-blue-50 text-blue-700"
                  >
                    Buka
                  </button>
                  <button
                    onClick={async () => {
                      const newUrl = await refreshSupabaseSignedUrl(asset);
                      if (newUrl) onPatchMediaAsset(asset.id, { signedUrl: newUrl });
                    }}
                    className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600"
                    title="Refresh URL"
                  >
                    <RefreshCw size={13} />
                  </button>
                  <button onClick={() => handleDelete(asset)} className="p-2 rounded-lg border border-red-200 bg-red-50 text-red-600" title="Hapus">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MediaVault;
