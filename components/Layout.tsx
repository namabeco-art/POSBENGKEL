import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Package, ShoppingCart, Store, History, 
  Settings as SettingsIcon, Menu, X, ChevronLeft,
  Database, Calculator, Users, LogOut, ShieldCheck,
  PieChart, ClipboardList, RotateCcw, Sparkles, Bot,
  MessageSquare, RefreshCw, AlertCircle, CheckCircle2, 
  CloudOff, FileText, Truck
} from 'lucide-react';
import { User, UserRole } from '../types';
import FloatingAIChat from './FloatingAIChat';
import { getCloudConfig } from '../services/syncService';
import { canAccessTab, hasPermission } from '../services/permissions';

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
  onUpdateMessages: (messages: any[]) => void;
  isSyncing: boolean;
  onManualSync: () => void;
  lastSyncTime?: string | null;
  syncError?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ 
  children, activeTab, setActiveTab, currentUser, onLogout, 
  items, sales, accounts, floatingMessages, onUpdateMessages, 
  isSyncing, onManualSync, lastSyncTime, syncError
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isFloatingChatOpen, setIsFloatingChatOpen] = useState(false);

  const navigation = [
    { section: 'Menu Utama', items: [
      { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
      { id: 'pos', label: 'Kasir', icon: <Store size={18} />, highlight: true },
    ]},
    { section: 'Data', items: [
      { id: 'master-items', label: 'Barang', icon: <Package size={18} /> },
      { id: 'master-contacts', label: 'Kontak', icon: <Users size={18} /> },
    ]},
    { section: 'Transaksi', items: [
      { id: 'sales-list', label: 'Penjualan', icon: <ClipboardList size={18} /> },
      { id: 'returns', label: 'Retur', icon: <RotateCcw size={18} /> },
      { id: 'purchasing', label: 'Pembelian', icon: <Truck size={18} /> },
      { id: 'stock-opname', label: 'Stok Opname', icon: <History size={18} /> },
    ]},
    { section: 'Laporan', items: [
      { id: 'accounting', label: 'Akuntansi', icon: <Calculator size={18} /> },
      { id: 'reporting', label: 'Laporan', icon: <PieChart size={18} /> },
    ]},
    { section: 'AI & Media', items: [
      { id: 'ai-consultant', label: 'AI Consultant', icon: <Sparkles size={18} />, special: true },
      { id: 'media-vault', label: 'Media', icon: <FileText size={18} /> },
    ]},
    { section: 'Sistem', items: [
      { id: 'user-management', label: 'User', icon: <ShieldCheck size={18} /> },
      { id: 'settings', label: 'Pengaturan', icon: <SettingsIcon size={18} /> },
    ]}
  ];

  const filteredNav = navigation
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        if (item.id === 'settings' && currentUser.role !== UserRole.MANAGER && currentUser.role !== UserRole.OWNER) return false;
        return canAccessTab(currentUser, item.id);
      })
    }))
    .filter(section => section.items.length > 0);

  const SyncBadge = () => {
    const config = getCloudConfig();
    if (!config.enabled) return <span className="text-xs text-slate-400 flex items-center gap-1"><CloudOff size={12}/> Lokal</span>;
    if (syncError) return <span className="text-xs text-amber-500 flex items-center gap-1"><AlertCircle size={12}/> Offline</span>;
    if (isSyncing) return <span className="text-xs text-blue-500 flex items-center gap-1"><RefreshCw size={12} className="animate-spin"/> Sync...</span>;
    return <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 size={12}/> Online</span>;
  };

  const NavItem = ({ item, mobile = false }: { item: any; mobile?: boolean }) => {
    const isActive = activeTab === item.id;
    return (
      <button
        onClick={() => { setActiveTab(item.id); if (mobile) setMobileMenuOpen(false); }}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200
          ${isActive 
            ? item.special 
              ? 'bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 border border-indigo-100/80 shadow-sm' 
              : 'bg-gradient-to-r from-slate-800 to-slate-900 text-white shadow-md shadow-slate-200/50' 
            : item.special
              ? 'text-indigo-500 hover:bg-indigo-50/50'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
          }
          ${collapsed && !mobile ? 'justify-center px-2' : ''}
        `}
        title={collapsed ? item.label : undefined}
      >
        <span className={`shrink-0 ${isActive && !item.special ? 'text-white' : ''}`}>{item.icon}</span>
        {(!collapsed || mobile) && <span className="truncate">{item.label}</span>}
        {item.highlight && !collapsed && !mobile && !isActive && (
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
        )}
      </button>
    );
  };

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-5">
      {filteredNav.map(section => (
        <div key={section.section}>
          {(!collapsed || mobile) && (
            <p className="px-3 mb-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{section.section}</p>
          )}
          <div className="space-y-0.5">
            {section.items.map(item => <NavItem key={item.id} item={item} mobile={mobile} />)}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100/50 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex flex-col bg-white/80 backdrop-blur-sm border-r border-slate-200/60 transition-all duration-300 ${collapsed ? 'w-[68px]' : 'w-60'}`}>
        {/* Logo */}
        <div className={`flex items-center h-16 border-b border-slate-100/60 shrink-0 ${collapsed ? 'justify-center px-2' : 'px-4 justify-between'}`}>
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-sm shadow-indigo-200/50">
                <span className="text-white font-bold text-sm">H</span>
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-800 leading-none">POS Hulio</h1>
                <SyncBadge />
              </div>
            </div>
          )}
          {collapsed && (
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-sm">H</span>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all" aria-label="Toggle sidebar">
            {collapsed ? <Menu size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <SidebarContent />

        {/* User footer */}
        <div className="p-3 border-t border-slate-100/60 space-y-2">
          <div className={`flex items-center gap-2.5 p-2.5 rounded-xl bg-gradient-to-r from-slate-50 to-indigo-50/30 ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">{currentUser.name}</p>
                <p className="text-[11px] text-slate-400 capitalize">{currentUser.role.toLowerCase()}</p>
              </div>
            )}
          </div>
          <button onClick={onLogout} className={`flex items-center gap-2 w-full p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg text-xs font-medium transition-all ${collapsed ? 'justify-center' : ''}`}>
            <LogOut size={15} />
            {!collapsed && <span>Keluar</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <aside className="relative w-72 h-full bg-white flex flex-col shadow-xl animate-slideInLeft" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between h-16 px-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">H</span>
                </div>
                <h1 className="text-sm font-bold text-slate-900">POS Hulio</h1>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg" aria-label="Close menu">
                <X size={20} />
              </button>
            </div>
            <SidebarContent mobile={true} />
            <div className="p-4 border-t border-slate-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold">
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{currentUser.name}</p>
                  <p className="text-xs text-slate-400 capitalize">{currentUser.role.toLowerCase()}</p>
                </div>
              </div>
              <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 p-3 text-red-600 bg-red-50 rounded-lg text-sm font-medium hover:bg-red-100 transition-all">
                <LogOut size={16} /> Keluar
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 bg-white/70 backdrop-blur-sm border-b border-slate-200/60 flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileMenuOpen(true)} className="md:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-all" aria-label="Open menu">
              <Menu size={20} />
            </button>
            <h2 className="text-sm md:text-base font-semibold text-slate-700 truncate">
              {filteredNav.flatMap(s => s.items).find(i => i.id === activeTab)?.label || 'Dashboard'}
            </h2>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={onManualSync}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${syncError ? 'bg-red-50 text-red-500 border border-red-100' : isSyncing ? 'bg-blue-50 text-blue-500 border border-blue-100' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
            >
              {isSyncing ? <RefreshCw size={13} className="animate-spin"/> : <RefreshCw size={13}/>}
              Sync
            </button>
            <div className="md:hidden"><SyncBadge /></div>
          </div>
        </header>

        {/* Page Content */}
        <div className={`flex-1 overflow-y-auto scrollbar-thin ${activeTab === 'pos' ? '' : 'p-4 md:p-6'}`}>
          <div className={`${activeTab === 'pos' ? 'h-full w-full' : 'max-w-7xl mx-auto animate-fadeIn'}`}>
            {children}
          </div>
        </div>
      </main>

      {/* Floating AI Chat */}
      {hasPermission(currentUser, 'ai.use') && (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-3">
          {isFloatingChatOpen && (
            <div className="w-[88vw] md:w-[380px] h-[420px] md:h-[480px] bg-white rounded-2xl shadow-soft-lg border border-slate-200 overflow-hidden flex flex-col animate-slideUp">
              <FloatingAIChat 
                onClose={() => setIsFloatingChatOpen(false)} 
                items={items} sales={sales} accounts={accounts}
                messages={floatingMessages} onUpdateMessages={onUpdateMessages}
              />
            </div>
          )}
          <button 
            onClick={() => setIsFloatingChatOpen(!isFloatingChatOpen)}
            className={`w-12 h-12 rounded-full flex items-center justify-center shadow-soft-lg transition-all active:scale-90
              ${isFloatingChatOpen ? 'bg-slate-800 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
            aria-label="Toggle AI Chat"
          >
            {isFloatingChatOpen ? <X size={20}/> : <MessageSquare size={20}/>}
          </button>
        </div>
      )}
    </div>
  );
};

export default Layout;
