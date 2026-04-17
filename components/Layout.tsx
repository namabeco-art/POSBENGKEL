
import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Store, 
  History, 
  BarChart3, 
  Settings as SettingsIcon,
  Menu,
  X,
  ChevronRight,
  ChevronLeft,
  Truck,
  Database,
  Calculator,
  Warehouse,
  Users,
  LogOut,
  ShieldCheck,
  ShieldAlert,
  FileText,
  PieChart,
  ClipboardList,
  Menu as MenuIcon,
  RotateCcw,
  Sparkles,
  Bot,
  MessageSquare,
  CloudLightning,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  CloudOff,
  Clock
} from 'lucide-react';
import { User, UserRole } from '../types';
import FloatingAIChat from './FloatingAIChat';
import { getCloudConfig } from '../services/syncService';
import { canAccessTab, hasPermission } from '../services/permissions';

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  collapsed?: boolean;
  isSpecial?: boolean;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, active, onClick, collapsed, isSpecial }) => (
  <button
    onClick={onClick}
    className={`flex items-center w-full p-3.5 rounded-xl transition-all active:scale-95 ${
      active 
        ? isSpecial ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-200 font-bold' : 'bg-slate-900 text-white shadow-lg shadow-slate-200 font-bold' 
        : isSpecial ? 'text-indigo-600 hover:bg-indigo-50 font-bold' : 'text-slate-600 hover:bg-slate-100 font-semibold'
    } ${collapsed ? 'justify-center' : ''}`}
  >
    <div className="flex-shrink-0">{icon}</div>
    {(!collapsed) && <span className="ml-3 text-sm whitespace-nowrap tracking-tight">{label}</span>}
  </button>
);

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: User;
  onLogout: () => void;
  items: any[];
  sales: any[];
  accounts: any[];
  floatingMessages: any[];
  // Fix: Rename to match usage in App.tsx
  onUpdateMessages: (messages: any[]) => void;
  isSyncing: boolean;
  onManualSync: () => void;
  lastSyncTime?: string | null;
  syncError?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeTab, 
  setActiveTab, 
  currentUser, 
  onLogout, 
  items, 
  sales, 
  accounts, 
  floatingMessages, 
  // Fix: Rename destructured prop
  onUpdateMessages, 
  isSyncing,
  onManualSync,
  lastSyncTime,
  syncError
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isFloatingChatOpen, setIsFloatingChatOpen] = useState(false);

  const allNavigation = [
    { section: 'Intelligence', items: [
      { id: 'ai-consultant', label: 'Business Consultant', icon: <Sparkles size={20} />, isSpecial: true },
      { id: 'media-vault', label: 'Media Vault', icon: <FileText size={20} /> },
    ]},
    { section: 'Main', items: [
      { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    ]},
    { section: 'Master Data', items: [
      { id: 'master-items', label: 'Master Barang', icon: <Database size={20} /> },
      { id: 'master-contacts', label: 'Pelanggan & Supplier', icon: <Users size={20} /> },
    ]},
    { section: 'Transaksi', items: [
      { id: 'pos', label: 'Point of Sale (Kasir)', icon: <Store size={20} /> },
      { id: 'sales-list', label: 'Daftar Penjualan', icon: <ClipboardList size={20} /> },
      { id: 'returns', label: 'Retur Penjualan', icon: <RotateCcw size={20} /> },
      { id: 'purchasing', label: 'Pembelian', icon: <ShoppingCart size={20} /> },
    ]},
    { section: 'Inventory', items: [
      { id: 'stock-opname', label: 'Stok Opname', icon: <History size={20} /> },
    ]},
    { section: 'Keuangan', items: [
      { id: 'accounting', label: 'Akuntansi', icon: <Calculator size={20} /> },
      { id: 'reporting', label: 'Laporan (Report)', icon: <PieChart size={20} /> },
    ]},
    { section: 'Sistem', items: [
      { id: 'user-management', label: 'Manajemen User', icon: <ShieldAlert size={20} /> },
      { id: 'settings', label: 'Pengaturan API', icon: <SettingsIcon size={20} /> },
    ] }
  ];

  const filteredNavigation = allNavigation
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        const hasTabPermission = canAccessTab(currentUser, item.id);
        const isSettings = item.id === 'settings';
        const isManager = currentUser.role === UserRole.MANAGER || currentUser.role === UserRole.OWNER;
        
        if (isSettings && !isManager) return false;
        return hasTabPermission;
      })
    }))
    .filter(section => section.items.length > 0);

  const SyncStatusSubtext = () => {
    const config = getCloudConfig();
    const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

    useEffect(() => {
      const timer = setInterval(() => {
        setCurrentTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }, 1000);
      return () => clearInterval(timer);
    }, []);

    if (!config.enabled) return (
      <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-full shadow-sm">
        <CloudOff size={10} className="text-slate-400" />
        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider leading-none">Offline Mode</span>
      </div>
    );

    if (syncError) return (
      <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 bg-red-50 border border-red-200 rounded-full animate-pulse">
        <AlertCircle size={10} className="text-red-500"/>
        <span className="text-[9px] font-bold text-red-600 uppercase tracking-wider leading-none">Sync Error</span>
      </div>
    );

    if (isSyncing) return (
      <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-full">
        <RefreshCw size={10} className="animate-spin text-blue-600"/>
        <span className="text-[9px] font-bold text-blue-700 uppercase tracking-wider leading-none">Syncing...</span>
      </div>
    );

    return (
      <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-full group">
        <div className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </div>
        <div className="flex items-center gap-1.5 overflow-hidden">
          <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider leading-none border-r border-emerald-200 pr-1.5">Cloud Active</span>
          <span className="text-[9px] font-bold text-emerald-600/80 tracking-wide leading-none font-mono">{currentTime}</span>
        </div>
      </div>
    );
  };

  const NavigationMenu = ({ isMobile = false }) => (
    <div className="flex-1 overflow-y-auto scrollbar-hide py-4">
      {filteredNavigation.map((section) => (
        <div key={section.section} className="mb-6">
          {(!collapsed || isMobile) && <h3 className="px-5 mb-2 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{section.section}</h3>}
          <div className="space-y-1 px-2">
            {section.items.map((item) => (
              <SidebarItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activeTab === item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  if (isMobile) setMobileMenuOpen(false);
                }}
                collapsed={isMobile ? false : collapsed}
                /* Fixed: Cast item to any to bypass inferred type limitation for optional 'isSpecial' property */
                isSpecial={(item as any).isSpecial}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans relative">
      <aside className={`hidden md:flex flex-col bg-white border-r border-slate-200 transition-all duration-500 ease-in-out z-40 ${collapsed ? 'w-20' : 'w-64'}`}>
        <div className={`flex items-center h-24 border-b border-slate-50 transition-all ${collapsed ? 'justify-center p-2' : 'justify-between px-6'}`}>
          {!collapsed && (
            <div className="flex items-center gap-4 overflow-hidden animate-in fade-in duration-300">
              <div className="w-11 h-11 bg-slate-900 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-slate-200 border border-slate-100 bg-gradient-to-br from-slate-800 to-slate-950">
                <span className="text-white font-bold text-xl italic">H</span>
              </div>
              <div className="flex flex-col min-w-0">
                <h1 className="text-lg font-bold text-black tracking-tight leading-none">HGroup</h1>
                <SyncStatusSubtext />
              </div>
            </div>
          )}
          <button 
            onClick={() => setCollapsed(!collapsed)} 
            className={`p-3 md:p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-all active:scale-90 shrink-0 ${collapsed ? 'bg-slate-50' : ''}`}
            aria-label="Toggle Sidebar"
          >
            {collapsed ? <MenuIcon size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>

        <NavigationMenu />

        <div className="p-4 border-t border-slate-100 space-y-2">
          <div className={`flex items-center gap-3 p-3 rounded-2xl bg-slate-50 ${collapsed ? 'justify-center' : ''}`}>
             <div className={`p-2 rounded-xl flex-shrink-0 ${currentUser.role === UserRole.MANAGER ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-900 text-white'}`}>
                {currentUser.role === UserRole.MANAGER ? <ShieldCheck size={18} /> : <Store size={18} />}
             </div>
             {!collapsed && (
               <div className="overflow-hidden animate-in fade-in duration-300">
                 <div className="text-sm font-bold text-slate-800 truncate leading-none mb-1">{currentUser.name}</div>
                 <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{currentUser.role}</div>
               </div>
             )}
          </div>
          <button onClick={onLogout} className={`flex items-center w-full p-3.5 text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-95 group ${collapsed ? 'justify-center' : ''}`}>
            <LogOut size={20} className="group-hover:rotate-12 transition-transform" />
            {!collapsed && <span className="ml-3 font-bold text-sm">Keluar</span>}
          </button>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setMobileMenuOpen(false)}>
          <aside className="w-72 h-full bg-white flex flex-col shadow-2xl animate-in slide-in-from-left duration-300 relative z-[60]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-4 p-6 h-24 border-b border-slate-100">
              <div className="w-11 h-11 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg border border-slate-50 bg-gradient-to-br from-slate-800 to-slate-950">
                <span className="text-white font-bold text-xl italic">H</span>
              </div>
              <div className="flex flex-col min-w-0">
                <h1 className="text-lg font-bold text-black tracking-tight leading-none">HGroup</h1>
                <SyncStatusSubtext />
              </div>
              <button 
                onClick={() => setMobileMenuOpen(false)} 
                className="ml-auto p-4 bg-slate-100 rounded-2xl text-slate-500 active:scale-90 transition-all border border-slate-200"
                aria-label="Close Menu"
              >
                <X size={24} />
              </button>
            </div>
            
            <NavigationMenu isMobile={true} />

            <div className="p-5 border-t border-slate-100 space-y-3">
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50">
                <div className={`p-3 rounded-2xl text-white shadow-lg ${currentUser.role === UserRole.MANAGER ? 'bg-indigo-600 shadow-indigo-100' : 'bg-slate-900 shadow-slate-100'}`}>
                   {currentUser.role === UserRole.MANAGER ? <ShieldCheck size={20} /> : <Store size={20} />}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800 uppercase tracking-tight leading-none mb-1">{currentUser.name}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{currentUser.role}</div>
                </div>
              </div>
              <button onClick={onLogout} className="flex items-center justify-center w-full p-5 bg-red-50 text-red-600 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all active:scale-95 border border-red-100">
                <LogOut size={20} className="mr-2" /> Keluar Sistem
              </button>
            </div>
          </aside>
        </div>
      )}

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="h-16 md:h-20 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shrink-0 z-30">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-3.5 bg-slate-50 text-slate-600 rounded-xl border-2 border-slate-200 active:scale-90 transition-all shadow-sm"
              aria-label="Open Menu"
            >
              <Menu size={24} />
            </button>
            <h2 className="text-base md:text-lg font-bold text-slate-800 uppercase tracking-tight leading-none truncate max-w-[150px] md:max-w-none">
              {activeTab === 'dashboard' ? 'Dashboard' : filteredNavigation.flatMap(s => s.items).find(i => i.id === activeTab)?.label || 'Dashboard'}
            </h2>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
             <div className="hidden sm:flex items-center gap-2">
                <button 
                  onClick={onManualSync}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 transition-all active:scale-95 ${
                    syncError ? 'bg-red-50 border-red-200 text-red-600' : isSyncing ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-blue-400 hover:text-blue-600'
                  }`}
                >
                  {isSyncing ? <RefreshCw size={16} className="animate-spin"/> : <CloudLightning size={16}/>}
                  <span className="text-[10px] font-bold uppercase tracking-widest">Manual Sync</span>
                </button>
             </div>
             <div className="flex md:hidden bg-slate-900 text-white p-2.5 rounded-xl shadow-lg border border-slate-800">
                <ShieldCheck size={20} />
             </div>
          </div>
        </header>

        <div className={`flex-1 overflow-y-auto scrollbar-hide bg-slate-50/50 ${activeTab === 'pos' ? 'p-0' : 'p-4 md:p-8'}`}>
          <div className={activeTab === 'pos' ? "h-full w-full" : "max-w-7xl mx-auto"}>
            {children}
          </div>
        </div>
      </main>

      {hasPermission(currentUser, 'ai.use') && (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-4">
          {isFloatingChatOpen && (
            <div className="w-[85vw] md:w-[400px] h-[450px] md:h-[500px] bg-white/95 backdrop-blur-xl rounded-[2rem] md:rounded-[2.5rem] shadow-2xl border-4 border-slate-100 overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 zoom-in-95 duration-300">
              <FloatingAIChat 
                onClose={() => setIsFloatingChatOpen(false)} 
                items={items}
                sales={sales}
                accounts={accounts}
                messages={floatingMessages}
                // Fix: Use renamed prop
                onUpdateMessages={onUpdateMessages}
              />
            </div>
          )}
          <button 
            onClick={() => setIsFloatingChatOpen(!isFloatingChatOpen)}
            className={`px-6 h-16 rounded-full flex items-center justify-center text-white shadow-2xl transition-all active:scale-95 gap-3 border-b-4 ${
              isFloatingChatOpen ? 'bg-slate-900 w-16 border-slate-950' : 'bg-gradient-to-br from-indigo-600 to-purple-700 hover:shadow-indigo-300 border-indigo-900'
            }`}
          >
            {isFloatingChatOpen ? <X size={32}/> : (
              <>
                <Bot size={28}/>
                <span className="font-bold text-[11px] uppercase tracking-widest whitespace-nowrap hidden sm:inline">AI Assistant</span>
                <span className="font-bold text-[11px] uppercase tracking-widest whitespace-nowrap sm:hidden">H-AI</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default Layout;
