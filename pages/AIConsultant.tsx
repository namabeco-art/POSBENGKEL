import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BrainCircuit, CheckCircle2, Loader2, Paperclip, RefreshCw, Send, Upload, X } from 'lucide-react';
import { Account, AIPriceUpdateDraft, AIUndoEntry, Item, MediaAsset, PromotionCampaign, PurchaseOrder, Sale, Supplier } from '../types';
import { getResolvedOpenRouterApiKey, getResolvedOpenRouterModel } from '../services/appConfig';
import { getCloudConfig } from '../services/syncService';
import { parseOpenRouterError, requestOpenRouterReply } from '../services/aiService';

interface AIConsultantProps {
  items: Item[];
  sales: Sale[];
  accounts: Account[];
  suppliers: Supplier[];
  messages: any[];
  onUpdateMessages: (messages: any[]) => void;
  onApplyPriceUpdates: (updates: AIPriceUpdateDraft[]) => void;
  onCreatePromotions: (promos: PromotionCampaign[]) => void;
  onCreatePurchaseOrders: (orders: PurchaseOrder[]) => void;
  undoHistory: AIUndoEntry[];
  onUndoAction: (undoId: string) => void;
  mediaAssets: MediaAsset[];
  canEditPrices: boolean;
  canCreatePromotions: boolean;
  canCreatePurchaseOrders: boolean;
}

interface AttachmentDraft {
  id: string;
  name: string;
  type: string;
  size: number;
  previewUrl?: string;
  extractedText?: string;
}

interface PriceUpdateProposal {
  match?: string;
  itemId?: string;
  itemCode?: string;
  itemName?: string;
  basePrice: number;
  memberPrices?: number[];
  reason?: string;
}

interface PromoProposal {
  name: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  minCustomerLevel?: number;
  startAt?: string;
  endAt?: string;
  notes?: string;
}

interface POItemProposal {
  match: string;
  qty: number;
  cost?: number;
}

interface POProposal {
  supplierMatch: string;
  termOfPayment?: number;
  discount?: number;
  items: POItemProposal[];
  note?: string;
}

type ParsedAction =
  | { type: 'price_update'; updates: PriceUpdateProposal[]; note?: string }
  | { type: 'create_promo'; promos: PromoProposal[]; note?: string }
  | { type: 'create_po'; orders: POProposal[]; note?: string };

const MAX_ATTACHMENT_TEXT = 5000;

const stripJsonBlock = (text: string): string => text.replace(/```json[\s\S]*?```/gi, '').trim();

const parseActions = (responseText: string): ParsedAction[] => {
  const match = responseText.match(/```json\s*([\s\S]*?)```/i);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed?.actions)) {
      return parsed.actions.filter((action: any) => typeof action?.type === 'string');
    }
    if (parsed?.action === 'price_update' && Array.isArray(parsed?.updates)) {
      return [{ type: 'price_update', updates: parsed.updates, note: parsed.note }];
    }
    if (parsed?.action === 'create_promo' && Array.isArray(parsed?.promos)) {
      return [{ type: 'create_promo', promos: parsed.promos, note: parsed.note }];
    }
    if (parsed?.action === 'create_po' && Array.isArray(parsed?.orders)) {
      return [{ type: 'create_po', orders: parsed.orders, note: parsed.note }];
    }
    return [];
  } catch {
    return [];
  }
};

const normalizeText = (value?: string) => (value || '').trim().toLowerCase();

const resolvePriceUpdates = (updates: PriceUpdateProposal[], items: Item[], note?: string) => {
  const resolved: AIPriceUpdateDraft[] = [];
  const unresolved: string[] = [];

  for (const proposal of updates) {
    const query = (proposal.match || proposal.itemCode || proposal.itemId || proposal.itemName || '').trim();
    const newBasePrice = Number(proposal.basePrice);
    if (!query || !Number.isFinite(newBasePrice) || newBasePrice <= 0) {
      unresolved.push(query || 'proposal-tanpa-target');
      continue;
    }

    const lower = normalizeText(query);
    const target =
      items.find(item => item.id === proposal.itemId) ||
      items.find(item => normalizeText(item.code) === lower) ||
      items.find(item => item.barcode === query) ||
      items.find(item => normalizeText(item.name) === lower) ||
      items.find(item => normalizeText(item.name).includes(lower) || normalizeText(item.code).includes(lower) || item.barcode.includes(query));

    if (!target) {
      unresolved.push(query);
      continue;
    }

    const newMemberPrices = Array.isArray(proposal.memberPrices) && proposal.memberPrices.length === 4
      ? proposal.memberPrices.map(v => Number(v))
      : target.memberPrices;

    if (newMemberPrices.some(v => !Number.isFinite(v) || v <= 0)) {
      unresolved.push(query);
      continue;
    }

    resolved.push({
      itemId: target.id,
      itemName: target.name,
      itemCode: target.code,
      oldBasePrice: target.basePrice,
      newBasePrice: Math.round(newBasePrice),
      oldMemberPrices: target.memberPrices,
      newMemberPrices: newMemberPrices.map(v => Math.round(v)),
      reason: proposal.reason || note,
    });
  }

  return { resolved, unresolved };
};

const resolvePromotions = (promos: PromoProposal[], note?: string) => {
  const resolved: PromotionCampaign[] = [];
  const unresolved: string[] = [];

  promos.forEach((promo, idx) => {
    const name = (promo.name || '').trim();
    const value = Number(promo.value);
    const type = promo.type;
    if (!name || !['PERCENT', 'FIXED'].includes(type) || !Number.isFinite(value) || value <= 0) {
      unresolved.push(name || `promo-${idx + 1}`);
      return;
    }
    if (type === 'PERCENT' && value > 100) {
      unresolved.push(name || `promo-${idx + 1}`);
      return;
    }

    const startAt = promo.startAt ? new Date(promo.startAt) : new Date();
    const endAt = promo.endAt ? new Date(promo.endAt) : undefined;
    if (Number.isNaN(startAt.getTime()) || (endAt && Number.isNaN(endAt.getTime()))) {
      unresolved.push(name || `promo-${idx + 1}`);
      return;
    }

    resolved.push({
      id: `PROMO-AI-${Date.now()}-${idx}`,
      name,
      type,
      value,
      minCustomerLevel: Math.max(1, Math.min(4, Number(promo.minCustomerLevel || 1))),
      startAt: startAt.toISOString(),
      endAt: endAt?.toISOString(),
      isActive: true,
      createdBy: 'AI Consultant',
      notes: promo.notes || note,
    });
  });

  return { resolved, unresolved };
};

const resolvePurchaseOrders = (orders: POProposal[], suppliers: Supplier[], items: Item[]) => {
  const resolved: PurchaseOrder[] = [];
  const unresolved: string[] = [];

  orders.forEach((proposal, index) => {
    const supplierMatch = normalizeText(proposal.supplierMatch);
    const supplier =
      suppliers.find(item => item.id === proposal.supplierMatch) ||
      suppliers.find(item => normalizeText(item.name) === supplierMatch) ||
      suppliers.find(item => normalizeText(item.name).includes(supplierMatch));

    if (!supplier || !Array.isArray(proposal.items) || proposal.items.length === 0) {
      unresolved.push(proposal.supplierMatch || `po-${index + 1}`);
      return;
    }

    const orderItems: PurchaseOrder['items'] = [];
    for (const poItem of proposal.items) {
      const query = normalizeText(poItem.match);
      const qty = Number(poItem.qty);
      const item =
        items.find(candidate => candidate.id === poItem.match) ||
        items.find(candidate => normalizeText(candidate.code) === query) ||
        items.find(candidate => candidate.barcode === poItem.match) ||
        items.find(candidate => normalizeText(candidate.name) === query) ||
        items.find(candidate => normalizeText(candidate.name).includes(query) || normalizeText(candidate.code).includes(query));
      if (!item || !Number.isFinite(qty) || qty <= 0) {
        unresolved.push(`${proposal.supplierMatch} -> ${poItem.match}`);
        continue;
      }
      const cost = Number.isFinite(Number(poItem.cost)) && Number(poItem.cost) > 0 ? Number(poItem.cost) : item.basePrice;
      orderItems.push({
        itemId: item.id,
        name: item.name,
        orderedQty: Math.round(qty),
        receivedQty: 0,
        cost: Math.round(cost),
      });
    }

    if (orderItems.length === 0) {
      unresolved.push(`${proposal.supplierMatch} (tanpa item valid)`);
      return;
    }

    const subtotal = orderItems.reduce((sum, item) => sum + (item.orderedQty * item.cost), 0);
    const discount = Math.max(0, Math.min(100, Number(proposal.discount || 0)));
    const total = Math.round(subtotal * (1 - (discount / 100)));
    const termOfPayment = Math.max(0, Number(proposal.termOfPayment || 14));
    const now = new Date();
    const due = new Date(now);
    due.setDate(now.getDate() + termOfPayment);

    resolved.push({
      id: `PO-AI-${Date.now().toString().slice(-6)}-${index + 1}`,
      date: now.toLocaleDateString('id-ID'),
      dueDate: due.toLocaleDateString('id-ID'),
      termOfPayment,
      discount,
      supplierId: supplier.id,
      supplierName: supplier.name,
      items: orderItems,
      subtotal,
      total,
      status: 'PENDING',
      isPaid: false,
      paidAmount: 0,
      paymentNotes: proposal.note ? [proposal.note] : [],
    });
  });

  return { resolved, unresolved };
};

const renderMessageContent = (content: string) => {
  const lines = String(content || '').split('\n');
  return lines.map((line, i) => {
    if (!line.trim()) return <div key={i} className="h-2" />;
    const parts = line.split(/(\*\*.*?\*\*)/g);
    return (
      <div key={i}>
        {parts.map((part, idx) => (
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={idx}>{part.slice(2, -2)}</strong>
            : <React.Fragment key={idx}>{part}</React.Fragment>
        ))}
      </div>
    );
  });
};

const AIConsultant: React.FC<AIConsultantProps> = ({
  items,
  sales,
  accounts,
  suppliers,
  messages,
  onUpdateMessages,
  onApplyPriceUpdates,
  onCreatePromotions,
  onCreatePurchaseOrders,
  undoHistory,
  onUndoAction,
  mediaAssets,
  canEditPrices,
  canCreatePromotions,
  canCreatePurchaseOrders,
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [pendingPriceUpdates, setPendingPriceUpdates] = useState<AIPriceUpdateDraft[]>([]);
  const [pendingPromotions, setPendingPromotions] = useState<PromotionCampaign[]>([]);
  const [pendingPurchaseOrders, setPendingPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const displayMessages = messages && messages.length > 0 ? messages : [
    {
      role: 'assistant',
      content: 'Halo! Saya **H-AI**. Saya bisa menyiapkan aksi multi-modul (harga, promo, PO). Semua aksi wajib konfirmasi sebelum dieksekusi.',
    },
  ];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, pendingPriceUpdates.length, pendingPromotions.length, pendingPurchaseOrders.length]);

  useEffect(() => () => {
    attachments.forEach(file => {
      if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
    });
  }, [attachments]);

  const businessContext = useMemo(() => {
    const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
    return [
      `RINGKASAN: total_penjualan=${sales.length}, omzet=${revenue}, akun=${accounts.length}, item=${items.length}, supplier=${suppliers.length}.`,
      'KATALOG_BARANG (maks 150):',
      items.slice(0, 150).map(item => `${item.code}|${item.name}|${item.barcode}|base:${item.basePrice}|member:${item.memberPrices.join('/')}`).join('\n'),
      'DAFTAR_SUPPLIER:',
      suppliers.map(supplier => `${supplier.id}|${supplier.name}`).join('\n'),
    ].join('\n');
  }, [sales, accounts, items, suppliers]);

  const mediaKnowledgeContext = useMemo(() => {
    const activeSources = mediaAssets.filter(asset => asset.useAsKnowledge);
    if (activeSources.length === 0) return 'MEDIA_SOURCES: tidak ada media aktif.';
    const lines: string[] = ['MEDIA_SOURCES (aktif):'];
    activeSources.slice(0, 25).forEach(asset => {
      lines.push(
        `- ${asset.name} | category=${asset.category || 'OTHER'} | supplier=${asset.supplierName || '-'} | effective=${asset.effectiveDate || '-'} | uploadedAt=${asset.uploadedAt}`,
      );
      if (asset.notes) lines.push(`  notes: ${asset.notes}`);
      if (asset.extractedText) lines.push(`  extracted_text: ${asset.extractedText.slice(0, 2000)}`);
    });
    if (activeSources.length > 25) lines.push(`... ${activeSources.length - 25} sumber lainnya tidak ditampilkan.`);
    return lines.join('\n');
  }, [mediaAssets]);

  const priceImpactPreview = useMemo(() => {
    const salesQtyByItem = new Map<string, number>();
    sales.forEach(sale => {
      sale.items.forEach(saleItem => {
        salesQtyByItem.set(saleItem.itemId, (salesQtyByItem.get(saleItem.itemId) || 0) + saleItem.qty);
      });
    });

    const totalDelta = pendingPriceUpdates.reduce((sum, update) => sum + (update.newBasePrice - update.oldBasePrice), 0);
    const avgPct = pendingPriceUpdates.length === 0
      ? 0
      : pendingPriceUpdates.reduce((sum, update) => sum + (((update.newBasePrice - update.oldBasePrice) / Math.max(1, update.oldBasePrice)) * 100), 0) / pendingPriceUpdates.length;
    const estimatedRevenueShift = pendingPriceUpdates.reduce((sum, update) => {
      const qty = salesQtyByItem.get(update.itemId) || 0;
      return sum + qty * (update.newBasePrice - update.oldBasePrice);
    }, 0);

    return { totalDelta, avgPct, estimatedRevenueShift };
  }, [pendingPriceUpdates, sales]);

  const promoImpactPreview = useMemo(() => {
    const activeDraftCount = pendingPromotions.filter(item => item.isActive).length;
    const avgValue = pendingPromotions.length === 0
      ? 0
      : pendingPromotions.reduce((sum, item) => sum + item.value, 0) / pendingPromotions.length;
    return { activeDraftCount, avgValue };
  }, [pendingPromotions]);

  const poImpactPreview = useMemo(() => {
    const totalValue = pendingPurchaseOrders.reduce((sum, po) => sum + po.total, 0);
    const totalLines = pendingPurchaseOrders.reduce((sum, po) => sum + po.items.length, 0);
    const totalQty = pendingPurchaseOrders.reduce((sum, po) => sum + po.items.reduce((lineSum, line) => lineSum + line.orderedQty, 0), 0);
    return { totalValue, totalLines, totalQty };
  }, [pendingPurchaseOrders]);

  const readAttachment = async (file: File): Promise<AttachmentDraft> => {
    const id = `${file.name}-${file.size}-${Date.now()}`;
    const base: AttachmentDraft = { id, name: file.name, type: file.type || 'application/octet-stream', size: file.size };
    if (file.type.startsWith('image/')) return { ...base, previewUrl: URL.createObjectURL(file) };

    const textFriendly = file.type.startsWith('text/') || file.name.match(/\.(txt|csv|json|md)$/i);
    if (textFriendly) {
      const raw = await file.text();
      return { ...base, extractedText: raw.slice(0, MAX_ATTACHMENT_TEXT) };
    }
    return base;
  };

  const handleFilePick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const parsed = await Promise.all(Array.from(files).map(readAttachment));
    setAttachments(prev => [...prev, ...parsed]);
    event.target.value = '';
  };

  const pushAssistantMessage = (content: string) => onUpdateMessages([...displayMessages, { role: 'assistant', content }]);

  const executePrice = () => {
    if (pendingPriceUpdates.length === 0) return 'Tidak ada draft harga.';
    if (!canEditPrices) return '❌ Izin `item.edit` tidak tersedia.';
    onApplyPriceUpdates(pendingPriceUpdates);
    const count = pendingPriceUpdates.length;
    setPendingPriceUpdates([]);
    return `✅ ${count} perubahan harga berhasil dieksekusi.`;
  };

  const executePromo = () => {
    if (pendingPromotions.length === 0) return 'Tidak ada draft promo.';
    if (!canCreatePromotions) return '❌ Izin membuat promo tidak tersedia.';
    onCreatePromotions(pendingPromotions);
    const count = pendingPromotions.length;
    setPendingPromotions([]);
    return `✅ ${count} campaign promo berhasil dibuat.`;
  };

  const executePO = () => {
    if (pendingPurchaseOrders.length === 0) return 'Tidak ada draft PO.';
    if (!canCreatePurchaseOrders) return '❌ Izin `purchase.create` tidak tersedia.';
    onCreatePurchaseOrders(pendingPurchaseOrders);
    const count = pendingPurchaseOrders.length;
    setPendingPurchaseOrders([]);
    return `✅ ${count} draft PO berhasil dibuat.`;
  };

  const handleCommand = (message: string): string | null => {
    const cmd = normalizeText(message);
    if (!cmd) return null;

    if (['batal', 'cancel', 'batalkan', 'jangan jadi'].includes(cmd)) {
      setPendingPriceUpdates([]);
      setPendingPromotions([]);
      setPendingPurchaseOrders([]);
      return '🛑 Semua draft aksi dibatalkan. Tidak ada data yang diubah.';
    }

    if (['eksekusi', 'execute', 'konfirmasi', 'eksekusi semua'].includes(cmd)) {
      const result = [executePrice(), executePromo(), executePO()];
      return result.join('\n');
    }

    if (cmd.includes('eksekusi harga')) return executePrice();
    if (cmd.includes('eksekusi promo')) return executePromo();
    if (cmd.includes('eksekusi po')) return executePO();
    if (cmd.includes('batal harga')) {
      setPendingPriceUpdates([]);
      return '🛑 Draft harga dibatalkan.';
    }
    if (cmd.includes('batal promo')) {
      setPendingPromotions([]);
      return '🛑 Draft promo dibatalkan.';
    }
    if (cmd.includes('batal po')) {
      setPendingPurchaseOrders([]);
      return '🛑 Draft PO dibatalkan.';
    }

    return null;
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const userMessage = input.trim();
    if ((!userMessage && attachments.length === 0) || isLoading) return;

    const renderedUserText = [userMessage, ...attachments.map(file => `[Lampiran] ${file.name}`)].filter(Boolean).join('\n');
    const newMessages = [...displayMessages, { role: 'user', content: renderedUserText }];
    onUpdateMessages(newMessages);
    setInput('');

    const commandResult = handleCommand(userMessage);
    if (commandResult) {
      onUpdateMessages([...newMessages, { role: 'assistant', content: commandResult }]);
      return;
    }

    const config = getCloudConfig();
    const apiKey = getResolvedOpenRouterApiKey(config.openRouterApiKey).trim();
    const model = getResolvedOpenRouterModel(config.aiModel);
    if (!apiKey || apiKey.length < 10) {
      onUpdateMessages([...newMessages, { role: 'assistant', content: '⚠️ **API Key OpenRouter tidak ditemukan.** Simpan dulu di Pengaturan API.' }]);
      return;
    }

    const attachmentContext = attachments.length === 0
      ? 'LAMPIRAN: tidak ada.'
      : [
          'LAMPIRAN:',
          ...attachments.map(file => `- ${file.name} (${file.type}, ${file.size} bytes)`),
          ...attachments.filter(file => file.extractedText).map(file => `KONTEN_${file.name}:\n${file.extractedText}`),
          ...attachments.filter(file => file.type.startsWith('image/')).map(file => `IMAGE_NOTE_${file.name}: user mengirim gambar untuk konteks.`),
        ].join('\n');

    const prompt = [
      `PERMINTAAN_USER: ${userMessage || 'Analisis berdasarkan lampiran.'}`,
      attachmentContext,
      mediaKnowledgeContext,
      businessContext,
      'Jika user minta aksi data, selalu berikan ringkasan dan blok ```json``` dengan schema:',
      '{"actions":[{"type":"price_update","note":"...","updates":[{"match":"kode/nama/barcode","basePrice":3200,"memberPrices":[3300,3250,3200,3150],"reason":"..."}]},{"type":"create_promo","promos":[{"name":"Promo Pagi","type":"PERCENT","value":5,"minCustomerLevel":1,"startAt":"2026-04-14T00:00:00.000Z","endAt":"2026-04-30T23:59:59.000Z","notes":"..."}]},{"type":"create_po","orders":[{"supplierMatch":"Indofood","termOfPayment":14,"discount":2,"note":"Restock mingguan","items":[{"match":"Indomie","qty":200,"cost":2750}]}]}]}',
      'Jangan klaim perubahan sudah dieksekusi. Semua aksi harus menunggu konfirmasi user.',
    ].join('\n\n');

    setIsLoading(true);
    try {
      const aiResponse = await requestOpenRouterReply({
        apiKey,
        userMessage: prompt,
        primaryModel: model,
        fallbackModel: 'openrouter/auto',
        appName: 'POSHULIO AI Consultant AGI',
        systemPrompt: 'Anda adalah H-AI, asisten operasional POS untuk toko retail (bengkel, toko kelontong, toko susu, toko bangunan, dll). BATASAN KETAT: Anda HANYA boleh menjawab pertanyaan tentang: (1) penjualan & transaksi, (2) stok & inventory barang, (3) harga & margin, (4) pelanggan & piutang, (5) supplier & pembelian, (6) laporan keuangan & pajak, (7) strategi bisnis toko/retail. TOLAK semua pertanyaan di luar topik tersebut dengan: "Maaf, saya hanya membantu soal operasional toko Anda. Ada yang bisa saya bantu terkait penjualan, stok, atau keuangan?" Jangan pernah membantu membuat website, coding, gosip, politik, atau topik non-bisnis. Fokus pada akurasi data dan keamanan. Perubahan data wajib via konfirmasi user.',
      });

      const actions = parseActions(aiResponse);
      const cleanText = stripJsonBlock(aiResponse) || 'Rencana aksi siap.';
      let postText = cleanText;
      const notes: string[] = [];

      actions.forEach(action => {
        if (action.type === 'price_update') {
          const { resolved, unresolved } = resolvePriceUpdates(action.updates, items, action.note);
          if (resolved.length > 0) {
            setPendingPriceUpdates(resolved);
            notes.push(`Draft harga: ${resolved.length} item siap.`);
          }
          if (unresolved.length > 0) notes.push(`Harga unresolved: ${unresolved.join(', ')}`);
        }
        if (action.type === 'create_promo') {
          const { resolved, unresolved } = resolvePromotions(action.promos, action.note);
          if (resolved.length > 0) {
            setPendingPromotions(resolved);
            notes.push(`Draft promo: ${resolved.length} campaign siap.`);
          }
          if (unresolved.length > 0) notes.push(`Promo unresolved: ${unresolved.join(', ')}`);
        }
        if (action.type === 'create_po') {
          const { resolved, unresolved } = resolvePurchaseOrders(action.orders, suppliers, items);
          if (resolved.length > 0) {
            setPendingPurchaseOrders(resolved);
            notes.push(`Draft PO: ${resolved.length} dokumen siap.`);
          }
          if (unresolved.length > 0) notes.push(`PO unresolved: ${unresolved.join(', ')}`);
        }
      });

      if (notes.length > 0) {
        postText += `\n\n${notes.join('\n')}\nKetik \`eksekusi\` untuk menjalankan semua, atau \`eksekusi harga/promo/po\` untuk parsial.`;
      }

      onUpdateMessages([...newMessages, { role: 'assistant', content: postText }]);
      setAttachments([]);
    } catch (error: any) {
      const parsedErr = parseOpenRouterError(error?.message || '');
      const msg = parsedErr.code;
      const detail = parsedErr.detail;
      let errorMsg = '⚠️ **Gagal Terhubung ke AI.**';
      if (msg.includes('OPENROUTER_AUTH_ERROR')) errorMsg = '❌ **API Key OpenRouter tidak valid.**';
      else if (msg.includes('OPENROUTER_CREDIT_ERROR') || msg.includes('OPENROUTER_PAYMENT_REQUIRED')) errorMsg = '❌ **Billing/OpenRouter payment issue.**';
      else if (msg.includes('OPENROUTER_RATE_LIMIT')) errorMsg = '⚠️ **Rate limit OpenRouter.** Coba lagi sebentar.';
      else if (msg.includes('OPENROUTER_TIMEOUT')) errorMsg = '⚠️ **Request timeout.** Coba lagi atau gunakan model lebih ringan.';
      if (detail) errorMsg += `\n\nDetail: ${detail}`;
      onUpdateMessages([...newMessages, { role: 'assistant', content: errorMsg }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0 px-2">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-indigo-600 text-white rounded-[1.5rem] shadow-xl border-4 border-white"><BrainCircuit size={32} /></div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">AI Consultant</h2>
            <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mt-2">AGI Multi-Modul • Konfirmasi wajib per aksi</p>
          </div>
        </div>
        <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 text-[10px] font-black text-slate-500 flex items-center gap-2">
          <RefreshCw size={12} className={isLoading ? 'animate-spin text-blue-600' : ''} />
          STATUS: {isLoading ? 'PROCESSING' : 'READY'}
          <span className="text-slate-300">|</span>
          MEDIA AI: {mediaAssets.filter(asset => asset.useAsKnowledge).length}
        </div>
      </div>

      {(pendingPriceUpdates.length > 0 || pendingPromotions.length > 0 || pendingPurchaseOrders.length > 0) && (
        <div className="space-y-3">
          {pendingPriceUpdates.length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-black uppercase tracking-widest text-amber-800">Draft Harga ({pendingPriceUpdates.length})</div>
                <div className="flex gap-2">
                  <button onClick={() => setPendingPriceUpdates([])} className="px-3 py-1 rounded-lg border border-amber-300 text-[10px] font-black uppercase">Batal</button>
                  <button onClick={() => pushAssistantMessage(executePrice())} className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase">Konfirmasi</button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 text-[11px] font-bold text-amber-900">
                <div className="bg-white/80 border border-amber-200 rounded-lg px-3 py-2">Total delta base price: Rp {priceImpactPreview.totalDelta.toLocaleString('id-ID')}</div>
                <div className="bg-white/80 border border-amber-200 rounded-lg px-3 py-2">Rata-rata perubahan: {priceImpactPreview.avgPct.toFixed(2)}%</div>
                <div className="bg-white/80 border border-amber-200 rounded-lg px-3 py-2">Estimasi dampak omzet historis: Rp {priceImpactPreview.estimatedRevenueShift.toLocaleString('id-ID')}</div>
              </div>
            </div>
          )}
          {pendingPromotions.length > 0 && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-black uppercase tracking-widest text-blue-800">Draft Promo ({pendingPromotions.length})</div>
                <div className="flex gap-2">
                  <button onClick={() => setPendingPromotions([])} className="px-3 py-1 rounded-lg border border-blue-300 text-[10px] font-black uppercase">Batal</button>
                  <button onClick={() => pushAssistantMessage(executePromo())} className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase">Konfirmasi</button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3 text-[11px] font-bold text-blue-900">
                <div className="bg-white/80 border border-blue-200 rounded-lg px-3 py-2">Draft promo aktif: {promoImpactPreview.activeDraftCount}</div>
                <div className="bg-white/80 border border-blue-200 rounded-lg px-3 py-2">Rata-rata nilai promo: {promoImpactPreview.avgValue.toFixed(2)} ({pendingPromotions[0]?.type === 'FIXED' ? 'nominal' : '%'})</div>
              </div>
            </div>
          )}
          {pendingPurchaseOrders.length > 0 && (
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-black uppercase tracking-widest text-emerald-800">Draft PO ({pendingPurchaseOrders.length})</div>
                <div className="flex gap-2">
                  <button onClick={() => setPendingPurchaseOrders([])} className="px-3 py-1 rounded-lg border border-emerald-300 text-[10px] font-black uppercase">Batal</button>
                  <button onClick={() => pushAssistantMessage(executePO())} className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase">Konfirmasi</button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 text-[11px] font-bold text-emerald-900">
                <div className="bg-white/80 border border-emerald-200 rounded-lg px-3 py-2">Total nilai PO: Rp {poImpactPreview.totalValue.toLocaleString('id-ID')}</div>
                <div className="bg-white/80 border border-emerald-200 rounded-lg px-3 py-2">Jumlah line item: {poImpactPreview.totalLines}</div>
                <div className="bg-white/80 border border-emerald-200 rounded-lg px-3 py-2">Total kuantitas order: {poImpactPreview.totalQty}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {undoHistory.length > 0 && (
        <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4">
          <div className="text-xs font-black uppercase tracking-widest text-slate-700 mb-3">Undo Center (3 langkah terakhir)</div>
          <div className="space-y-2">
            {undoHistory.map(entry => (
              <div key={entry.id} className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-black text-slate-800 truncate">{entry.label}</div>
                  <div className="text-[10px] font-bold text-slate-500">{new Date(entry.createdAt).toLocaleString('id-ID')}</div>
                </div>
                <button onClick={() => onUndoAction(entry.id)} className="px-3 py-1 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase">
                  Undo
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 bg-white rounded-[3rem] border-4 border-slate-100 shadow-2xl flex flex-col overflow-hidden relative">
          <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 scrollbar-hide bg-slate-50/20">
            {displayMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] md:max-w-[85%] p-6 rounded-[2rem] text-sm md:text-base shadow-sm border-2 ${
                  msg.role === 'user' ? 'bg-indigo-50 border-indigo-200 text-slate-800' : 'bg-white border-white text-slate-700'
                }`}>
                  {renderMessageContent(String(msg.content || ''))}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex gap-4 items-center bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                  <Loader2 size={24} className="animate-spin text-indigo-600" />
                  <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] animate-pulse">H-AI memproses perintah...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-6 md:p-8 bg-white border-t-4 border-slate-50 space-y-3">
            {attachments.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {attachments.map(file => (
                  <div key={file.id} className="border border-slate-200 rounded-xl p-2 bg-slate-50 flex items-center gap-2">
                    {file.previewUrl ? <img src={file.previewUrl} alt={file.name} className="w-12 h-12 rounded object-cover border border-slate-200" /> : <Paperclip size={16} className="text-slate-500" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-black truncate">{file.name}</div>
                      <div className="text-[10px] text-slate-500">{Math.round(file.size / 1024)} KB</div>
                    </div>
                    <button type="button" onClick={() => setAttachments(prev => prev.filter(item => item.id !== file.id))} className="p-1 text-slate-400 hover:text-red-500">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="relative max-w-4xl mx-auto">
              <textarea
                className="w-full bg-slate-100 border-4 border-transparent rounded-[1.5rem] p-4 pr-32 min-h-[80px] focus:border-indigo-600 focus:bg-white outline-none font-bold text-slate-800 transition-all shadow-inner resize-none"
                placeholder="Contoh: Naikkan harga Indomie 5%, buat promo akhir pekan 7%, dan generate PO restock 200 pcs."
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={isLoading}
              />
              <div className="absolute right-3 bottom-3 flex items-center gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2.5 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300 transition-all" title="Lampirkan file/gambar">
                  <Upload size={16} />
                </button>
                <button type="submit" disabled={isLoading || (!input.trim() && attachments.length === 0)} className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xl hover:bg-indigo-700 transition-all active:scale-90">
                  <Send size={18} />
                </button>
              </div>
            </div>
            <input ref={fileInputRef} type="file" multiple accept="image/*,.txt,.csv,.json,.md" className="hidden" onChange={handleFilePick} />
          </form>
        </div>
      </div>
    </div>
  );
};

export default AIConsultant;
