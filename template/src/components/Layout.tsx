import React from 'react';
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronLeft,
  ClipboardList,
  HelpCircle,
  Info,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  QrCode,
  Search,
  Settings,
  ShieldCheck,
  Ticket,
  Trophy,
  User,
  Users,
  Wrench,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Notification } from '../App';
import { Role, roleLabel } from '../data';

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  setCurrentView: (view: string) => void;
  role: Role;
  onLogout: () => void;
  notifications: Notification[];
  onMarkRead: () => void;
  profile?: any;
  lang?: 'TH' | 'EN';
  setLang?: (lang: 'TH' | 'EN') => void;
}

const viewTitles: Record<string, string> = {
  dashboard: 'Performance Tracking Dashboard',
  tickets: 'CRM Workspace / Ticket Board',
  assigned: 'Assigned Jobs',
  'ticket-details': 'Resolution Details & Logs',
  customers: 'Customer & Registration Management',
  team: 'Response Team Dispatch',
  staff: 'Staff Management',
  'master-data': 'Master Data Management (304IP Way)',
  leaderboard: 'Performance Leaderboard',
};

export function Layout({ children, currentView, setCurrentView, role, onLogout, notifications, onMarkRead, profile, lang = 'TH', setLang }: LayoutProps) {
  const [isSidebarExpanded, setIsSidebarExpanded] = React.useState(window.innerWidth > 1280);
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [showProfileMenu, setShowProfileMenu] = React.useState(false);

  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarExpanded(false);
      } else {
        setIsSidebarExpanded(true);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial check
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const navItems = [
    { id: 'dashboard', label: 'รายงานผู้บริหาร', icon: LayoutDashboard, roles: ['admin'] },
    { id: 'tickets', label: role === 'customer' ? 'ตั๋วของฉัน' : 'Ticket Board', icon: Ticket, roles: ['admin', 'crm', 'customer'] },
    { id: 'assigned', label: 'งานของฉัน', icon: ClipboardList, roles: ['technician'] },
    { id: 'customers', label: 'ลูกค้า', icon: QrCode, roles: ['crm', 'admin'] },
    { id: 'team', label: 'ทีมช่าง', icon: Users, roles: ['crm', 'admin'] },
    { id: 'staff', label: 'ผู้ใช้งาน', icon: ShieldCheck, roles: ['admin'] },
    { id: 'master-data', label: 'Master Data', icon: Settings, roles: ['admin', 'crm'] },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy, roles: ['admin', 'crm'] },
  ].filter((item) => item.roles.includes(role));

  const userDetails = {
    admin: { name: profile?.full_name || 'ผู้บริหาร 304IP', title: roleLabel.admin, initials: 'AD', icon: ShieldCheck },
    crm: { name: profile?.full_name || 'คุณชลิตา CRM', title: roleLabel.crm, initials: 'CRM', icon: Users },
    technician: { name: profile?.full_name || 'ทีมหน้างาน Onduty', title: roleLabel.technician, initials: 'OP', icon: Wrench },
    customer: { 
      name: profile?.company?.name || profile?.full_name || 'Customer', 
      title: profile?.company?.area ? `พื้นที่: ${profile.company.area}` : 'Customer', 
      initials: (profile?.company?.name || profile?.full_name || 'DY').substring(0, 2).toUpperCase(), 
      icon: User 
    },
  }[role];
  const UserIcon = userDetails.icon;

  const goCreateTicket = () => {
    setCurrentView(role === 'technician' ? 'assigned' : 'tickets');
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col md:flex-row">
      <aside className={`hidden md:flex fixed left-0 top-0 h-full ${isSidebarExpanded ? 'w-56' : 'w-20'} bg-white flex-col border-r border-slate-200 z-50 transition-all duration-300`}>
        <div className="p-4 py-6">
          <div className={`flex items-center ${isSidebarExpanded ? 'gap-3 mb-8' : 'justify-center mb-8'}`}>
            <div className="w-10 h-10 bg-primary rounded flex items-center justify-center text-white shrink-0">
              <Ticket size={22} />
            </div>
            {isSidebarExpanded && (
              <div className="overflow-hidden whitespace-nowrap">
                <h1 className="text-sm font-black text-blue-950 leading-none">304IP CRM</h1>
                <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">Ticket System</p>
              </div>
            )}
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id || (currentView === 'ticket-details' && ['tickets', 'assigned'].includes(item.id));
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={`w-full flex items-center ${isSidebarExpanded ? 'gap-3 px-4' : 'justify-center px-0'} py-3 rounded-md text-sm transition-all ${
                    isActive ? 'text-blue-950 font-extrabold bg-blue-50 border-r-4 border-primary' : 'text-slate-600 hover:bg-slate-100 font-semibold'
                  }`}
                  title={!isSidebarExpanded ? item.label : ''}
                >
                  <Icon size={19} />
                  {isSidebarExpanded && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-4 pb-6 space-y-4">
          <div className="pt-4 border-t border-slate-200 space-y-1">
            <button className={`w-full flex items-center ${isSidebarExpanded ? 'gap-3 px-4' : 'justify-center px-0'} py-2 text-slate-600 hover:bg-slate-100 rounded-md text-sm`}>
              <HelpCircle size={19} />
              {isSidebarExpanded && <span>คู่มือการใช้งาน</span>}
            </button>
            <button onClick={onLogout} className={`w-full flex items-center ${isSidebarExpanded ? 'gap-3 px-4' : 'justify-center px-0'} py-2 text-error hover:bg-error/10 rounded-md text-sm`}>
              <LogOut size={19} />
              {isSidebarExpanded && <span>ออกจากระบบ</span>}
            </button>
          </div>
        </div>
      </aside>

      <header className="md:hidden fixed top-0 w-full bg-white text-primary flex justify-between items-center px-4 h-16 z-40 border-b border-slate-200">
        <div className="flex items-center gap-3 min-w-0">
          {currentView === 'ticket-details' ? (
            <button onClick={() => setCurrentView(role === 'technician' ? 'assigned' : 'tickets')} className="active:scale-95 transition-transform">
              <ArrowLeft size={24} />
            </button>
          ) : (
            <Ticket size={23} />
          )}
          <h1 className="font-black tracking-tight text-base truncate">{viewTitles[currentView] || '304IP CRM System'}</h1>
        </div>
        <div className="w-10 h-10 rounded-lg overflow-hidden bg-blue-50 text-primary flex items-center justify-center font-black text-xs">
          {userDetails.initials}
        </div>
      </header>

      <header className={`hidden md:flex fixed top-0 right-0 ${isSidebarExpanded ? 'left-56' : 'left-20'} bg-slate-50/90 backdrop-blur-md z-40 justify-between items-center px-8 py-3 border-b border-slate-200 transition-all duration-300`}>
        <div className="flex items-center gap-6 min-w-0">
          <button onClick={() => setIsSidebarExpanded(!isSidebarExpanded)} className="p-2 text-slate-500 hover:bg-slate-200/70 rounded-lg transition-colors">
            {isSidebarExpanded ? <ChevronLeft size={24} /> : <Menu size={24} />}
          </button>
          {currentView === 'ticket-details' ? (
            <div className="flex items-center gap-4 min-w-0">
              <button onClick={() => setCurrentView(role === 'technician' ? 'assigned' : 'tickets')} className="text-slate-500 hover:text-primary transition-colors">
                <ArrowLeft size={23} />
              </button>
              <div className="flex items-center gap-2 text-sm truncate">
                <span className="text-slate-400">Ticket Board</span>
                <span className="text-slate-300">/</span>
                <span className="text-primary font-bold">รายละเอียดและ Log</span>
              </div>
            </div>
          ) : (
            <h2 className="text-xl font-black tracking-tight text-blue-950 truncate">{viewTitles[currentView] || '304IP CRM System'}</h2>
          )}
          <div className="relative hidden lg:block w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder="ค้นหา Ticket, บริษัท, พื้นที่..." className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <button onClick={() => setShowNotifications(!showNotifications)} className="p-2 text-slate-500 hover:bg-slate-200/70 rounded-full transition-colors relative">
              <Bell size={20} />
              {unreadCount > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full ring-2 ring-white" />}
            </button>
            <AnimatePresence>
              {showNotifications && (
                <>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowNotifications(false)} className="fixed inset-0 z-40" />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden"
                  >
                    <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex justify-between items-center">
                      <h3 className="font-bold text-slate-800 text-sm">การแจ้งเตือน ({unreadCount})</h3>
                      <button onClick={() => { onMarkRead(); setShowNotifications(false); }} className="text-[10px] font-bold text-primary hover:underline uppercase tracking-wider">
                        Mark all read
                      </button>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.map((notification) => (
                        <div key={notification.id} className={`p-4 border-b border-slate-50 flex gap-3 hover:bg-slate-50 transition-colors ${!notification.read ? 'bg-blue-50/30' : ''}`}>
                          <div className="mt-0.5 w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                            {notification.type === 'assignment' ? <Check size={16} /> : notification.type === 'update' ? <Info size={16} /> : <Bell size={16} />}
                          </div>
                          <div>
                            <p className={`text-sm leading-tight mb-1 ${!notification.read ? 'font-bold text-slate-900' : 'text-slate-700'}`}>{notification.title}</p>
                            <p className="text-xs text-slate-500 line-clamp-2 mb-1">{notification.message}</p>
                            <p className="text-[10px] text-slate-400 font-medium">{notification.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button className="p-2 text-slate-500 hover:bg-slate-200/70 rounded-full transition-colors">
            <Settings size={20} />
          </button>
          {setLang && (
            <button 
              onClick={() => setLang(lang === 'TH' ? 'EN' : 'TH')}
              className="px-2 py-1 text-xs font-black text-slate-500 hover:text-primary hover:bg-slate-200/70 rounded-md transition-colors border border-slate-200"
            >
              {lang}
            </button>
          )}
          <div className="h-8 w-px bg-slate-200" />
          <div className="relative">
            <button onClick={() => setShowProfileMenu(!showProfileMenu)} className="flex items-center gap-3 text-left hover:bg-slate-100 p-1.5 rounded-xl transition-colors">
              <div className="text-right hidden xl:block">
                <p className="text-sm font-black text-blue-950">{userDetails.name}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{userDetails.title}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-primary flex items-center justify-center shrink-0 overflow-hidden border border-slate-200">
                {profile?.emp_id ? (
                  <img src={`https://wms.advanceagro.net/WSVIS/api/Face/GetImage?CardID=${profile.emp_id}`} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon size={20} />
                )}
              </div>
            </button>
            <AnimatePresence>
              {showProfileMenu && (
                <>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowProfileMenu(false)} className="fixed inset-0 z-40" />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden"
                  >
                    <div className="p-2 space-y-1">
                      <button 
                        onClick={() => { setCurrentView('profile'); setShowProfileMenu(false); }} 
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors font-bold"
                      >
                        <User size={16} />
                        ข้อมูลส่วนตัว
                      </button>
                      <button 
                        onClick={onLogout} 
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-error hover:bg-error/10 rounded-lg transition-colors font-bold"
                      >
                        <LogOut size={16} />
                        ออกจากระบบ
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <main className={`flex-1 ${isSidebarExpanded ? 'md:ml-56' : 'md:ml-20'} pt-16 md:pt-20 pb-24 md:pb-8 px-4 md:px-8 overflow-x-hidden transition-all duration-300`}>
        {children}
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-2 pb-5 pt-2 bg-white/95 backdrop-blur-lg shadow-[0_-4px_12px_rgba(0,0,0,0.05)] border-t border-slate-100">
        {navItems.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id || (currentView === 'ticket-details' && ['tickets', 'assigned'].includes(item.id));
          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={`flex flex-col items-center justify-center p-3 transition-all duration-150 flex-1 min-w-0 ${
                isActive ? 'bg-primary-container text-white rounded-lg scale-105' : 'text-slate-400 hover:text-primary-container'
              }`}
            >
              <Icon size={23} />
              <span className="text-[10px] font-bold mt-1 truncate w-full text-center">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
