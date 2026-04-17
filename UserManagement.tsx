import React, { useState } from 'react';
import { 
  UserPlus, Shield, User as UserIcon, Trash2, Key, 
  X, CheckSquare, Square, Clock, Lock, ShieldCheck, 
  LayoutDashboard, Database, Users, Store, ClipboardList, 
  RotateCcw, ShoppingCart, History, Calculator, PieChart, Info,
  Edit3, Search, ChevronRight, CheckCircle2, AlertCircle,
  Sparkles, Settings as SettingsIcon
} from 'lucide-react';
import { User, UserRole } from './types';
import { MODULE_ACTIONS } from './services/permissions';

type UserDraft = {
  id: string;
  name: string;
  username: string;
  password?: string;
  role: UserRole;
  permissions: User['permissions'];
  schedule: User['schedule'];
  isActive?: boolean;
};

interface UserManagementProps {
  users: User[];
  onAddUser: (user: UserDraft) => void | Promise<void>;
  onUpdateUser: (user: UserDraft) => void | Promise<void>;
  onDeleteUser: (id: string) => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ users, onAddUser, onUpdateUser, onDeleteUser }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [formData, setFormData] = useState({ 
    name: '', 
    username: '', 
    password: '', 
    role: UserRole.KASIR 
  });

  const [permissions, setPermissions] = useState<User['permissions']>(['dashboard.view']);
  const [schedule, setSchedule] = useState({
    enabled: false,
    startTime: '08:00',
    endTime: '17:00'
  });

  const handleEdit = (user: User) => {
    setEditingId(user.id);
    setFormData({
      name: user.name,
      username: user.username,
      password: '',
      role: user.role
    });
    // Create new array references to avoid state issues
    setPermissions([...(user.permissions || [])]);
    setSchedule({ ...(user.schedule || { enabled: false, startTime: '08:00', endTime: '17:00' }) });
    setIsModalOpen(true);
  };

  const togglePermission = (permission: User['permissions'][number]) => {
    setPermissions(prev => prev.includes(permission) ? prev.filter(p => p !== permission) : [...prev, permission]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const userData: UserDraft = {
      id: editingId || Math.random().toString(36).substr(2, 9),
      name: formData.name,
      username: formData.username,
      password: formData.password || undefined,
      role: formData.role,
      permissions: [...permissions],
      schedule: { ...schedule },
      isActive: true,
    };

    if (editingId) {
      await onUpdateUser(userData);
    } else {
      await onAddUser(userData);
    }
    
    resetForm();
    setIsModalOpen(false);
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({ name: '', username: '', password: '', role: UserRole.KASIR });
    setPermissions(['dashboard.view']);
    setSchedule({ enabled: false, startTime: '08:00', endTime: '17:00' });
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-6">
          <div className="p-5 bg-slate-900 text-white rounded-[2rem] shadow-2xl border-4 border-white shrink-0"><ShieldCheck size={40}/></div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Security Center</h2>
            <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mt-3 flex items-center gap-2">
              <Lock size={12} className="text-blue-500" /> Kontrol Akses & Kredensial Staf
            </p>
          </div>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
           <div className="relative flex-1 md:w-64">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Cari akun..."
                className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-200 rounded-2xl outline-none focus:border-blue-600 font-bold text-sm transition-all"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
           </div>
           <button 
             onClick={() => { resetForm(); setIsModalOpen(true); }}
             className="flex items-center justify-center gap-3 bg-blue-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all border-b-4 border-blue-800 uppercase text-xs tracking-widest"
           >
             <UserPlus size={20} /> Tambah Akun
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredUsers.map(user => (
          <div key={user.id} className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-sm flex flex-col justify-between group relative overflow-hidden transition-all hover:shadow-xl hover:border-blue-100">
            <div className="absolute -top-4 -right-4 p-8 opacity-[0.03] rotate-12 transition-transform group-hover:scale-110"><Shield size={140}/></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className={`p-4 rounded-2xl shadow-lg ${user.role === UserRole.MANAGER ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white' : 'bg-gradient-to-br from-blue-600 to-cyan-600 text-white'}`}>
                    {user.role === UserRole.MANAGER ? <Shield size={24} /> : <UserIcon size={24} />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-slate-800 text-lg uppercase tracking-tight truncate leading-none">{user.name}</div>
                    <div className="flex items-center gap-2 mt-2">
                       <span className="text-[9px] font-black uppercase bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md border border-slate-200">@{user.username}</span>
                       <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${user.role === UserRole.MANAGER ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                          {user.role}
                       </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center justify-between">
                       <span className="flex items-center gap-1.5"><Shield size={10}/> Hak Akses Modul</span>
                       <span className="text-blue-600">{user.permissions.length} Aksi</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                       {user.permissions.slice(0, 4).map(p => (
                          <span key={p} className="px-2 py-0.5 bg-white text-slate-600 text-[8px] font-bold uppercase rounded border border-slate-200">{p.replace('.', ' ')}</span>
                       ))}
                       {user.permissions.length > 4 && <span className="text-[8px] font-bold text-slate-400 self-center">+{user.permissions.length - 4} Aksi</span>}
                    </div>
                 </div>
                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                       <div className={`p-2.5 rounded-xl ${user.schedule.enabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
                          <Clock size={16}/>
                       </div>
                       <div>
                          <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Jadwal Operasional</div>
                          <div className={`text-[11px] font-black uppercase ${user.schedule.enabled ? 'text-emerald-700' : 'text-slate-400'}`}>
                             {user.schedule.enabled ? `${user.schedule.startTime} - ${user.schedule.endTime}` : 'Akses Bebas (24/7)'}
                          </div>
                       </div>
                    </div>
                    {user.schedule.enabled && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>}
                 </div>
              </div>
            </div>
            <div className="mt-8 flex gap-3 relative z-10">
               <button onClick={() => handleEdit(user)} className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-white text-blue-600 border-2 border-blue-100 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-sm">
                 <Edit3 size={14}/> Edit Akun
               </button>
               <button onClick={() => onDeleteUser(user.id)} className="p-3.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border-2 border-transparent hover:border-red-100">
                 <Trash2 size={18} />
               </button>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[200] flex items-center justify-center p-0 md:p-4">
          <form onSubmit={handleSubmit} className="bg-white w-full max-w-5xl h-full md:h-auto md:max-h-[90vh] md:rounded-[3rem] shadow-2xl animate-in zoom-in duration-300 md:border-[10px] border-slate-100 flex flex-col overflow-hidden">
            <div className="p-6 md:p-8 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-4 md:gap-5">
                  <div className="p-3 md:p-4 bg-blue-600 text-white rounded-2xl shadow-xl"><UserPlus size={24}/></div>
                  <div>
                    <h3 className="text-lg md:text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">{editingId ? 'Edit Akun' : 'Akun Baru'}</h3>
                    <p className="hidden md:flex text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 items-center gap-2"><Shield size={12}/> Hak Akses Hulio Group iPOS 5 Pro</p>
                  </div>
               </div>
               <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 md:p-3 bg-white border-2 border-slate-200 text-slate-400 rounded-xl md:rounded-2xl hover:bg-red-500 hover:text-white hover:border-red-600 transition-all active:scale-90"><X size={24}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 md:p-12 space-y-8 md:space-y-12 scrollbar-hide">
               <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12">
                  <div className="lg:col-span-5 space-y-8 md:space-y-10">
                    <div className="space-y-4 md:space-y-6">
                      <h4 className="text-[10px] md:text-xs font-black text-blue-600 uppercase tracking-[0.2em] border-l-4 border-blue-600 pl-4">Identitas Login</h4>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Nama Lengkap Staf</label>
                          <input required type="text" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-3.5 md:p-4 focus:border-blue-600 focus:bg-white outline-none font-bold text-slate-800 transition-all shadow-inner" placeholder="Ahmad Subardjo" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <div className="space-y-2">
                             <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Username</label>
                             <input required type="text" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-3.5 md:p-4 focus:border-blue-600 focus:bg-white outline-none font-bold text-slate-800 transition-all shadow-inner" placeholder="kasir1" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value.toLowerCase().trim()})} />
                           </div>
                           <div className="space-y-2">
                             <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Password</label>
                             <input required type="password" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-3.5 md:p-4 focus:border-blue-600 focus:bg-white outline-none font-bold text-slate-800 transition-all shadow-inner" placeholder="••••••••" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                           </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Tingkatan Role</label>
                          <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-3.5 md:p-4 focus:border-blue-600 focus:bg-white outline-none font-black text-slate-800 transition-all cursor-pointer appearance-none shadow-inner" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})}>
                            <option value={UserRole.KASIR}>KASIR (Staf Operasional)</option>
                            <option value={UserRole.WAREHOUSE}>WAREHOUSE (Admin Gudang)</option>
                            <option value={UserRole.SUPERVISOR}>SUPERVISOR (Persetujuan)</option>
                            <option value={UserRole.MANAGER}>MANAGER (Superadmin)</option>
                            <option value={UserRole.OWNER}>OWNER (Full Access)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4 md:space-y-6">
                      <h4 className="text-[10px] md:text-xs font-black text-blue-600 uppercase tracking-[0.2em] border-l-4 border-blue-600 pl-4">Batasan Operasional</h4>
                      <div className="bg-slate-50 p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] border-2 border-slate-100 space-y-6 md:space-y-8 shadow-inner">
                         <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 md:gap-4">
                               <div className={`p-2.5 md:p-3 rounded-xl ${schedule.enabled ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-500'}`}><Clock size={18}/></div>
                               <div><span className="text-[9px] md:text-[10px] font-black text-slate-800 uppercase tracking-widest block">Access Schedule</span><span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Wajib Login Jam Kerja</span></div>
                            </div>
                            <button type="button" onClick={() => setSchedule({...schedule, enabled: !schedule.enabled})} className={`w-12 md:w-14 h-7 md:h-8 rounded-full p-1 transition-all flex items-center ${schedule.enabled ? 'bg-emerald-600' : 'bg-slate-300'}`}><div className={`w-5 md:w-6 h-5 md:h-6 bg-white rounded-full shadow-lg transition-all ${schedule.enabled ? 'translate-x-5 md:translate-x-6' : 'translate-x-0'}`} /></button>
                         </div>
                         <div className={`grid grid-cols-2 gap-4 md:gap-6 transition-all duration-500 ${schedule.enabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                            <div className="space-y-2"><label className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest block ml-1">Jam Mulai</label><input type="time" className="w-full p-3 md:p-4 bg-white border-2 border-slate-200 rounded-2xl font-black text-slate-800 focus:border-emerald-600 outline-none shadow-sm" value={schedule.startTime} onChange={e => setSchedule({...schedule, startTime: e.target.value})} /></div>
                            <div className="space-y-2"><label className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest block ml-1">Jam Selesai</label><input type="time" className="w-full p-3 md:p-4 bg-white border-2 border-slate-200 rounded-2xl font-black text-slate-800 focus:border-emerald-600 outline-none shadow-sm" value={schedule.endTime} onChange={e => setSchedule({...schedule, endTime: e.target.value})} /></div>
                         </div>
                      </div>
                    </div>
                  </div>
                  <div className="lg:col-span-7 space-y-4 md:space-y-6">
                    <h4 className="text-[10px] md:text-xs font-black text-blue-600 uppercase tracking-[0.2em] border-l-4 border-blue-600 pl-4">Hak Akses Panel (Checklist)</h4>
                    <div className="bg-slate-50 p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] border-2 border-slate-100 shadow-inner">
                       <div className="space-y-6 md:space-y-8">
                          {['Intelligence', 'Utama', 'Master', 'Transaksi', 'Inventory', 'Keuangan', 'Sistem'].map(group => {
                             const modulesInGroup = MODULE_ACTIONS.filter(m => m.group === group);
                             return (
                               <div key={group} className="space-y-3 md:space-y-4">
                                  <div className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3"><span>GROUP: {group}</span><div className="flex-1 h-px bg-slate-200"></div></div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
                                     {modulesInGroup.map(mod => (
                                        <button key={mod.id} type="button" onClick={() => togglePermission(mod.permission)} className={`flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl md:rounded-2xl border-2 transition-all text-left group/btn ${permissions.includes(mod.permission) ? 'bg-blue-600 border-blue-700 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400 hover:border-blue-300'}`}>
                                           <div className={`p-1.5 md:p-2.5 rounded-lg md:rounded-xl transition-colors ${permissions.includes(mod.permission) ? 'bg-white/20' : 'bg-slate-50 text-slate-400 group-hover/btn:bg-blue-50 group-hover/btn:text-blue-500'}`}>{permissions.includes(mod.permission) ? <CheckCircle2 size={16}/> : <Square size={16}/>}</div>
                                           <div className="min-w-0"><div className="font-black text-[9px] md:text-[10px] uppercase tracking-tight leading-none mb-0.5 md:mb-1">{mod.label}</div><div className={`text-[7px] font-bold uppercase tracking-widest ${permissions.includes(mod.permission) ? 'text-blue-100' : 'text-slate-300'}`}>{mod.permission}</div></div>
                                        </button>
                                     ))}
                                  </div>
                               </div>
                             )
                          })}
                       </div>
                    </div>
                  </div>
               </div>
            </div>
            <div className="p-6 md:p-10 bg-slate-900 border-t border-slate-200 shrink-0 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6">
               <div className="hidden md:flex items-center gap-4"><div className="p-3 bg-white/10 rounded-2xl"><ShieldCheck size={24} className="text-emerald-500"/></div><div><span className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1 block leading-none">Security Encryption</span><span className="text-white font-black tracking-tight text-sm">PROTOCOL ACTIVE</span></div></div>
               <div className="flex gap-3 md:gap-4 w-full md:w-auto">
                 <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 md:flex-none px-6 md:px-10 py-4 md:py-5 bg-white/5 text-white font-black text-[10px] md:text-xs uppercase tracking-widest rounded-xl md:rounded-2xl border border-white/10 hover:bg-white/10 transition-all active:scale-95">Batal</button>
                 <button type="submit" className="flex-[2] md:flex-none px-10 md:px-16 py-4 md:py-5 bg-blue-600 text-white font-black text-[10px] md:text-xs uppercase tracking-widest rounded-xl md:rounded-2xl shadow-2xl shadow-blue-500/30 hover:bg-blue-700 transition-all border-b-4 md:border-b-8 border-blue-800 active:scale-95">{editingId ? 'Simpan' : 'Buat Akun'}</button>
               </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
