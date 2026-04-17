import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  History, Truck, PackageCheck, AlertCircle, Plus, Search, 
  X, CheckCircle2, ArrowRight, Package, Printer, FileSpreadsheet,
  Download, Filter, Layers, Zap, Info, ScanLine, Eye, Upload, ChevronRight, FileCheck, Camera,
  Scan
} from 'lucide-react';
import { Item, InventoryMovement } from '../types';

interface InventoryProps {
  items: Item[];
  logs: any[];
  movements?: InventoryMovement[];
  onAdjustStock: (log: any) => void;
  onAdjustStockBulk?: (logs: any[]) => void;
}

const Inventory: React.FC<InventoryProps> = ({ items, logs, movements = [], onAdjustStock, onAdjustStockBulk }) => {
  const [activeTab, setActiveTab] = useState('opname');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [opnameMode, setOpnameMode] = useState<'single' | 'bulk'>('single');
  const [searchTerm, setSearchTerm] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [physicalStock, setPhysicalStock] = useState<number>(0);
  const [notes, setNotes] = useState('');

  const [bulkEntries, setBulkEntries] = useState<{ [itemId: string]: number }>({});
  const [viewingRefId, setViewingRefId] = useState<string | null>(null);

  const fileImportRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanIntervalRef = useRef<any>(null);

  const groupedLogs = useMemo(() => {
    const groups: { [key: string]: { id: string, date: string, items: any[], totalVariance: number } } = {};
    logs.forEach(log => {
      const refId = log.id.includes('-') ? log.id.split('-').slice(0, 2).join('-') : log.id; 
      if (!groups[refId]) {
        groups[refId] = { id: refId, date: log.date, items: [], totalVariance: 0 };
      }
      groups[refId].items.push(log);
      groups[refId].totalVariance += log.difference;
    });
    return Object.values(groups).sort((a: any, b: any) => b.id.localeCompare(a.id));
  }, [logs]);

  const filteredItems = useMemo(() => items.filter(i => 
    i.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    i.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.barcode.includes(searchTerm)
  ), [items, searchTerm]);

  useEffect(() => {
    if (isCameraActive && videoRef.current) {
      const initCamera = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            
            if ('BarcodeDetector' in window) {
              const barcodeDetector = new (window as any).BarcodeDetector({
                formats: ['code_128', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'code_39']
              });

              scanIntervalRef.current = setInterval(async () => {
                if (!videoRef.current || videoRef.current.readyState !== 4) return;
                try {
                  const barcodes = await barcodeDetector.detect(videoRef.current);
                  if (barcodes.length > 0) {
                    handleDetectedCode(barcodes[0].rawValue);
                  }
                } catch (e) {}
              }, 300);
            }
          }
        } catch (err) {
          setIsCameraActive(false);
        }
      };
      initCamera();
    }
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, [isCameraActive]);

  const handleDetectedCode = (code: string) => {
    const found = items.find(i => i.barcode === code || i.code === code);
    if (found) {
      setSelectedItem(found);
      setBarcodeInput('');
      setIsCameraActive(false);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = "Kode Barang,Barcode,Nama Barang,Stok Sistem,Stok Fisik\n";
    const example = items.slice(0, 5).map(i => `${i.code},${i.barcode},${i.name},${i.stock},`).join("\n");
    const csvContent = "data:text/csv;charset=utf-8," + headers + example;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "template_opname_massal.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedItem(null);
    setPhysicalStock(0);
    setNotes('');
    setSearchTerm('');
    setBarcodeInput('');
    setBulkEntries({});
    setIsCameraActive(false);
  };

  const handleSubmitOpname = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    const diff = physicalStock - selectedItem.stock;
    onAdjustStock({
      id: `SO-${Date.now().toString().slice(-6)}`,
      date: new Date().toLocaleDateString('id-ID'),
      itemId: selectedItem.id,
      itemName: selectedItem.name,
      systemStock: selectedItem.stock,
      actualStock: physicalStock,
      difference: diff,
      notes: notes,
      status: 'SELESAI'
    });
    closeModal();
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex bg-white/80 p-1.5 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto scrollbar-hide">
        {[
          { id: 'opname', label: 'Opname' },
          { id: 'movements', label: 'Mutasi Stok' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'movements' ? (
        <div className="bg-white p-5 md:p-10 rounded-[2rem] md:rounded-[3rem] border-2 border-slate-200 shadow-sm space-y-6">
          <div>
            <h3 className="font-black text-xl md:text-2xl text-slate-900 uppercase tracking-tight leading-none">Kartu Stok</h3>
            <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">Riwayat masuk keluar barang</p>
          </div>
          <div className="overflow-x-auto border-2 border-slate-100 rounded-3xl">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b-2 border-slate-100 text-left">
                <tr className="whitespace-nowrap">
                  <th className="px-6 py-5 font-black text-slate-400 uppercase text-[9px] tracking-widest">Waktu</th>
                  <th className="px-6 py-5 font-black text-slate-400 uppercase text-[9px] tracking-widest">Barang</th>
                  <th className="px-6 py-5 font-black text-slate-400 uppercase text-[9px] tracking-widest">Tipe</th>
                  <th className="px-6 py-5 font-black text-slate-400 uppercase text-[9px] tracking-widest text-right">Qty</th>
                  <th className="px-6 py-5 font-black text-slate-400 uppercase text-[9px] tracking-widest text-right">Stok Baru</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                {movements.map(movement => (
                  <tr key={movement.id}>
                    <td className="px-6 py-4 text-slate-500">{new Date(movement.createdAt).toLocaleString('id-ID')}</td>
                    <td className="px-6 py-4 uppercase">{movement.itemName}</td>
                    <td className="px-6 py-4">{movement.type}</td>
                    <td className={`px-6 py-4 text-right ${movement.direction === 'OUT' ? 'text-red-600' : 'text-emerald-600'}`}>{movement.direction === 'OUT' ? '-' : '+'}{movement.quantity}</td>
                    <td className="px-6 py-4 text-right text-slate-900">{movement.newStock}</td>
                  </tr>
                ))}
                {movements.length === 0 && (
                  <tr><td colSpan={5} className="py-20 text-center opacity-20 font-black uppercase tracking-widest">Belum ada mutasi stok</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
      <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-6 rounded-[1.5rem] border-2 md:border-4 border-blue-600 bg-blue-50/50 shadow-lg flex items-center gap-4">
          <div className="p-4 rounded-xl bg-blue-600 text-white shadow-md shrink-0"><PackageCheck size={24} /></div>
          <div className="min-w-0">
            <div className="font-black text-slate-900 uppercase tracking-tight text-sm">Stok Opname</div>
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate">Audit Persediaan Live</div>
          </div>
        </div>
        <div className="hidden sm:flex p-6 rounded-[1.5rem] border-4 border-slate-100 bg-slate-50/50 opacity-50 items-center gap-4">
          <div className="p-4 rounded-xl bg-slate-200 text-slate-400 shrink-0"><Truck size={24} /></div>
          <div>
            <div className="font-black text-slate-400 uppercase tracking-tight text-sm">Logistik</div>
            <div className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-0.5">Inventory Management</div>
          </div>
        </div>
      </div>

      <div className="bg-white p-5 md:p-10 rounded-[2rem] md:rounded-[3rem] border-2 border-slate-200 shadow-sm space-y-8">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="min-w-0">
            <h3 className="font-black text-xl md:text-2xl text-slate-900 uppercase tracking-tight leading-none">Riwayat Opname</h3>
            <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">Daftar pemeriksaan fisik stok</p>
          </div>
          
          <div className="flex flex-wrap gap-2 md:gap-3 w-full lg:w-auto">
            <button onClick={handleDownloadTemplate} className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-white border-2 border-slate-300 text-slate-600 px-5 py-3.5 rounded-xl font-black text-[9px] md:text-[10px] uppercase hover:bg-slate-50 transition-all active:scale-95 shadow-sm">
              <Download size={16}/> Template
            </button>
            <button onClick={() => fileImportRef.current?.click()} className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-emerald-100 border-2 border-emerald-300 text-emerald-800 px-5 py-3.5 rounded-xl font-black text-[9px] md:text-[10px] uppercase hover:bg-emerald-200 transition-all active:scale-95 shadow-sm">
              <Upload size={16}/> Import
            </button>
            <button onClick={() => { setOpnameMode('single'); setIsModalOpen(true); }} className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-blue-700 text-white px-6 py-3.5 rounded-xl font-black shadow-lg hover:bg-blue-800 transition-all active:scale-95 uppercase text-[9px] md:text-[10px] tracking-widest">
              <Plus size={16}/> Opname Baru
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border-2 border-slate-100 rounded-3xl">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b-2 border-slate-100 text-left">
              <tr className="whitespace-nowrap">
                <th className="px-6 py-5 font-black text-slate-400 uppercase text-[9px] tracking-widest">No. Ref</th>
                <th className="px-6 py-5 font-black text-slate-400 uppercase text-[9px] tracking-widest">Tanggal</th>
                <th className="px-6 py-5 font-black text-slate-400 uppercase text-[9px] tracking-widest">Item</th>
                <th className="px-6 py-5 font-black text-slate-400 uppercase text-[9px] tracking-widest text-right">Selisih</th>
                <th className="px-6 py-5 font-black text-slate-400 uppercase text-[9px] tracking-widest text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
              {groupedLogs.map((group: any) => (
                <tr key={group.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-5 font-black text-blue-700">{group.id}</td>
                  <td className="px-6 py-5 text-slate-400">{group.date}</td>
                  <td className="px-6 py-5"><span className="bg-slate-100 px-2 py-1 rounded text-[9px] font-black">{group.items.length} SKU</span></td>
                  <td className={`px-6 py-5 text-right font-black ${group.totalVariance < 0 ? 'text-red-600' : group.totalVariance > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {group.totalVariance > 0 ? `+${group.totalVariance}` : group.totalVariance}
                  </td>
                  <td className="px-6 py-5 text-center">
                    <button onClick={() => setViewingRefId(group.id)} className="p-2.5 text-slate-400 hover:text-blue-600 active:scale-90 transition-all"><Eye size={18}/></button>
                  </td>
                </tr>
              ))}
              {groupedLogs.length === 0 && (
                <tr><td colSpan={5} className="py-20 text-center opacity-20 font-black uppercase tracking-widest">Belum ada data audit stok</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[200] flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-300">
          <div className={`bg-white w-full ${opnameMode === 'bulk' ? 'max-w-4xl' : 'max-w-lg'} h-full md:h-auto md:max-h-[90vh] md:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border-4 border-slate-100`}>
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
               <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl shadow-lg text-white ${opnameMode === 'bulk' ? 'bg-emerald-600' : 'bg-blue-600'}`}><PackageCheck size={20}/></div>
                  <div>
                     <h3 className="text-sm md:text-base font-black text-slate-900 uppercase tracking-tighter leading-none">{opnameMode === 'bulk' ? 'Audit Massal' : 'Input Opname'}</h3>
                     <p className="text-slate-400 font-bold text-[8px] uppercase tracking-widest mt-1">Smart Stock Accuracy</p>
                  </div>
               </div>
               <button onClick={closeModal} className="p-4 md:p-3 bg-slate-100 text-slate-400 rounded-2xl hover:bg-red-500 hover:text-white transition-all active:scale-90 border-2 border-slate-300"><X size={24}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 md:p-8 scrollbar-hide">
               {opnameMode === 'single' ? (
                 <div className="space-y-6">
                    {!selectedItem ? (
                      <div className="space-y-6">
                         <div className="space-y-3">
                           <div className="flex justify-between items-center px-1">
                             <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">SCAN ATAU KETIK KODE</label>
                             <button type="button" onClick={() => setIsCameraActive(!isCameraActive)} className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all ${isCameraActive ? 'bg-red-600 text-white' : 'bg-slate-900 text-white active:scale-95'}`}>
                                <Camera size={14}/> {isCameraActive ? 'MATIKAN' : 'SCAN KAMERA'}
                             </button>
                           </div>
                           {isCameraActive && (
                             <div className="relative w-full aspect-video bg-black rounded-[2rem] overflow-hidden border-4 border-blue-600 shadow-2xl animate-in zoom-in duration-300">
                                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                   <div className="w-[80%] h-[40%] border-2 border-white/50 rounded-3xl relative">
                                      <div className="absolute top-0 left-0 right-0 h-1 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-pulse"></div>
                                   </div>
                                </div>
                             </div>
                           )}
                           <input 
                              autoFocus
                              className="w-full p-5 bg-slate-50 border-4 border-slate-200 rounded-[1.5rem] font-black text-slate-900 focus:border-blue-600 outline-none transition-all shadow-inner text-sm"
                              placeholder="Barcode / Kode Barang..."
                              value={barcodeInput}
                              onChange={e => { setBarcodeInput(e.target.value); if(e.target.value.length >= 4) handleDetectedCode(e.target.value); }}
                           />
                         </div>
                         <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto scrollbar-hide pb-4">
                            {filteredItems.slice(0, 8).map(item => (
                              <button key={item.id} type="button" onClick={() => setSelectedItem(item)} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl hover:border-blue-500 transition-all text-left shadow-sm active:scale-[0.98]">
                                 <div className="flex items-center gap-3 min-w-0">
                                    <img src={item.imageUrl} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                                    <div className="min-w-0">
                                       <div className="font-black text-slate-800 uppercase text-[10px] truncate">{item.name}</div>
                                       <div className="text-[8px] font-bold text-slate-400 uppercase">{item.barcode}</div>
                                    </div>
                                 </div>
                                 <div className="text-right shrink-0">
                                    <div className="text-[7px] font-black text-slate-300 uppercase">SYS STOK</div>
                                    <div className="font-black text-blue-700 text-base">{item.stock}</div>
                                 </div>
                              </button>
                            ))}
                         </div>
                      </div>
                    ) : (
                      <form onSubmit={handleSubmitOpname} className="space-y-6 animate-in slide-in-from-bottom duration-500">
                         <div className="bg-blue-50 p-5 rounded-3xl border-2 border-blue-100 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4 min-w-0">
                               <img src={selectedItem.imageUrl} className="w-14 h-14 rounded-2xl object-cover border-2 border-white shadow-md" />
                               <div className="min-w-0">
                                  <div className="font-black text-blue-900 uppercase text-xs leading-tight truncate">{selectedItem.name}</div>
                                  <div className="text-[9px] font-bold text-blue-500 uppercase tracking-widest mt-1">Sistem: {selectedItem.stock} UNIT</div>
                               </div>
                            </div>
                            <button type="button" onClick={() => setSelectedItem(null)} className="text-blue-500 font-black text-[10px] uppercase hover:underline shrink-0">Ganti</button>
                         </div>
                         <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block ml-2">STOK FISIK</label>
                            <input type="number" required autoFocus className="w-full p-6 bg-slate-50 border-[6px] border-blue-600 rounded-[2.5rem] font-black text-5xl text-center text-blue-700 focus:border-blue-700 outline-none shadow-xl" value={physicalStock} onChange={e => setPhysicalStock(parseInt(e.target.value) || 0)} />
                         </div>
                         <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block ml-2">CATATAN</label>
                            <textarea className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-blue-600 min-h-[80px] resize-none" placeholder="Alasan selisih..." value={notes} onChange={e => setNotes(e.target.value)} />
                         </div>
                         <button type="submit" className="w-full py-5 bg-blue-700 text-white font-black text-base rounded-2xl shadow-xl hover:bg-blue-800 transition-all flex items-center justify-center gap-3 border-b-8 border-blue-900 active:scale-95 uppercase tracking-widest">
                            <CheckCircle2 size={20}/> SIMPAN AUDIT
                         </button>
                      </form>
                    )}
                 </div>
               ) : (
                 <div className="py-20 text-center opacity-20 font-black uppercase tracking-widest">Gunakan fitur Import dengan Template CSV</div>
               )}
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
};

export default Inventory;
