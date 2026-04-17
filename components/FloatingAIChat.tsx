import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Loader2, X } from 'lucide-react';
import { Item, Sale, Account } from '../types';
import { getResolvedOpenRouterApiKey, getResolvedOpenRouterModel } from '../services/appConfig';
import { getCloudConfig } from '../services/syncService';
import { parseOpenRouterError, requestOpenRouterReply } from '../services/aiService';

interface FloatingAIChatProps {
  onClose: () => void;
  items: Item[];
  sales: Sale[];
  accounts: Account[];
  messages: any[];
  onUpdateMessages: (messages: any[]) => void;
}

const FloatingAIChat: React.FC<FloatingAIChatProps> = ({ onClose, items, sales, accounts, messages, onUpdateMessages }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const displayMessages = messages && messages.length > 0
    ? messages
    : [{ role: 'assistant', content: 'Halo! Saya H-AI Lite. Apa yang bisa saya bantu terkait strategi toko hari ini?' }];

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const handleSendMessage = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    const userMessage = input.trim();
    if (!userMessage || isLoading) return;

    const config = getCloudConfig();
    const apiKey = getResolvedOpenRouterApiKey(config.openRouterApiKey).trim();
    const model = getResolvedOpenRouterModel(config.aiModel);

    setInput('');
    setIsLoading(true);

    const nextMessages = [...displayMessages, { role: 'user', content: userMessage }];
    onUpdateMessages(nextMessages);

    if (!apiKey || apiKey.length < 10) {
      onUpdateMessages([
        ...nextMessages,
        {
          role: 'assistant',
          content: 'Kunci API kosong. Buka menu Pengaturan API lalu simpan kunci OpenRouter Anda.',
        },
      ]);
      setIsLoading(false);
      return;
    }

    try {
      const aiText = await requestOpenRouterReply({
        apiKey,
        userMessage,
        primaryModel: model,
        fallbackModel: 'openrouter/auto',
        appName: 'POSHULIO Floating AI',
        systemPrompt: 'Anda adalah H-AI Lite, asisten cerdas iPOS 5. Jawaban maksimal 2 kalimat, padat, dan praktis. Bahasa Indonesia.',
      });

      onUpdateMessages([...nextMessages, { role: 'assistant', content: aiText }]);
    } catch (error: any) {
      console.error('Floating AI Error:', error);
      const parsed = parseOpenRouterError(error?.message || '');
      let errMsg = 'Masalah koneksi AI. Gagal menghubungi engine OpenRouter.';
      if (parsed.code === 'OPENROUTER_RATE_LIMIT') {
        errMsg = 'Limit tercapai. OpenRouter sedang membatasi permintaan, coba lagi beberapa saat.';
      } else if (parsed.code === 'OPENROUTER_AUTH_ERROR') {
        errMsg = 'API key tidak valid. Perbarui kunci OpenRouter Anda di Pengaturan API.';
      } else if (parsed.code === 'OPENROUTER_CREDIT_ERROR' || parsed.code === 'OPENROUTER_PAYMENT_REQUIRED') {
        errMsg = 'Limit provider atau billing model tercapai. Coba ganti model routing atau cek limit provider di OpenRouter.';
      } else if (parsed.code === 'OPENROUTER_TIMEOUT') {
        errMsg = 'Koneksi timeout. Coba lagi atau gunakan model yang lebih ringan.';
      }
      if (parsed.detail) errMsg += ` Detail: ${parsed.detail}`;
      onUpdateMessages([...nextMessages, { role: 'assistant', content: errMsg }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white overflow-hidden relative">
      <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0 shadow-lg border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-xl">
            <Bot size={16} className="text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-black text-[10px] uppercase tracking-widest leading-none mb-1">H-AI Lite</span>
            <span className="text-[7px] font-bold text-blue-400 uppercase tracking-tighter">OpenRouter Active</span>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-all active:scale-90"><X size={18} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-slate-50/30">
        {displayMessages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
            <div
              className={`max-w-[90%] p-3.5 rounded-2xl text-[11px] font-bold shadow-sm border ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white border-indigo-700 rounded-tr-none'
                  : 'bg-white text-slate-700 border-slate-200 rounded-tl-none'
              }`}
            >
              {String(m.content || '').replace(/\*\*/g, '')}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start animate-in fade-in">
            <div className="bg-white p-3 rounded-2xl border border-slate-200 flex items-center gap-2 shadow-sm">
              <Loader2 size={12} className="animate-spin text-indigo-600" />
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest animate-pulse">H-AI merespon...</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-3 border-t border-slate-100 bg-white">
        <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
          <input
            className="flex-1 bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-[11px] font-bold outline-none focus:border-indigo-600 focus:bg-white transition-all shadow-inner"
            placeholder="Tanya strategi toko..."
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={isLoading}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={`p-3 rounded-xl shadow-lg transition-all active:scale-90 flex items-center justify-center min-w-[48px] ${
              isLoading || !input.trim() ? 'bg-slate-200 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          </button>
        </form>
      </div>
    </div>
  );
};

export default FloatingAIChat;
