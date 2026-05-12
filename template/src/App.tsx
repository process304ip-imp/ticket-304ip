import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { OnboardingRegister } from './components/OnboardingRegister';
import { PwaBanner } from './components/PwaBanner';
import { Role, getDefaultView } from './data';
import { requestNotificationPermission, ticketNotify, notify } from './lib/notify';
import { useAuth } from './hooks/useAuth';
import { api } from './lib/api';
import './index.css';

export type { Role } from './data';

const Dashboard = lazy(() => import('./components/Dashboard').then((module) => ({ default: module.Dashboard })));
const TicketList = lazy(() => import('./components/TicketList').then((module) => ({ default: module.TicketList })));
const TicketDetails = lazy(() => import('./components/TicketDetails').then((module) => ({ default: module.TicketDetails })));
const CustomerList = lazy(() => import('./components/CustomerList').then((module) => ({ default: module.CustomerList })));
const Team = lazy(() => import('./components/Team').then((module) => ({ default: module.Team })));
const StaffManagement = lazy(() => import('./components/StaffManagement').then((module) => ({ default: module.StaffManagement })));
const UserProfile = lazy(() => import('./components/UserProfile').then((module) => ({ default: module.UserProfile })));

export interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'assignment' | 'update' | 'system';
}

function PageLoading() {
  return (
    <div className="min-h-[400px] bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">Loading view...</p>
      </div>
    </div>
  );
}

export default function App() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const [showRegister, setShowRegister] = useState(() => window.location.pathname === '/register');
  const [currentView, setCurrentView] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [lang, setLang] = useState<'TH'|'EN'>('TH');

  // Sync role-based default view when profile loads
  useEffect(() => {
    if (profile?.role) {
      setCurrentView(getDefaultView(profile.role as Role));
      requestNotificationPermission();
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    
    // Load initial notifications
    api.notifications.list().then(data => {
      setNotifications(data.map((n: any) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        time: new Date(n.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        read: n.is_read,
        type: n.type as 'assignment' | 'update' | 'system'
      })));
    }).catch(console.error);

    // Subscribe to new notifications
    const sub = api.notifications.subscribe(user.id, (payload) => {
      const newNotif = payload.new;
      const n: Notification = {
        id: newNotif.id,
        title: newNotif.title,
        message: newNotif.message,
        time: 'เมื่อสักครู่',
        read: newNotif.is_read,
        type: newNotif.type as any
      };
      setNotifications(prev => [n, ...prev]);
      
      // Use raw title/body from DB
      notify({
        title: n.title,
        body: n.message,
        tag: `notif-${n.id}`
      });
    });

    return () => {
      sub.unsubscribe();
    };
  }, [user]);

  const addNotification = (title: string, message: string, type: Notification['type'] = 'assignment') => {
    // If we wanted to manually add local ones, we still can
    // but typically we should let Supabase trigger handle it now
  };

  const markAllAsRead = async () => {
    // Optimistic UI update
    setNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })));
    // Real DB update
    for (const n of notifications) {
      if (!n.read) await api.notifications.markAsRead(n.id).catch(console.error);
    }
  };

  const handleSelectTicket = (id: string) => {
    setSelectedTicketId(id);
    setCurrentView('ticket-details');
  };

  const handleLogout = async () => {
    await signOut();
    setCurrentView('dashboard');
    setSelectedTicketId(null);
  };

  const handleGoToLogin = () => {
    window.history.pushState({}, '', '/');
    setShowRegister(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">Loading 304IP System...</p>
        </div>
      </div>
    );
  }

  if (showRegister) {
    return <OnboardingRegister onGoToLogin={handleGoToLogin} />;
  }

  // Fallback to mock login if no user for now (or strictly require auth)
  if (!user && !profile) {
    return <Login onLogin={(r) => {
       // This is for the "Demo Roles" buttons
       // We'll just fake it for the demo if user clicks them
       // but in best practice, we'd sign them into a demo account
       window.location.reload(); // Simple way to reset for now if they used demo
    }} />;
  }

  if (profile?.status === 'pending' || profile?.role === 'pending') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-8 text-center">
          <h1 className="text-2xl font-black text-primary">รออนุมัติสิทธิ์</h1>
          <p className="text-sm text-slate-500 mt-3 leading-relaxed">
            ระบบบันทึกข้อมูลผู้ใช้งานแล้ว กรุณารอ Admin กำหนด Role ก่อนเข้าใช้งาน
          </p>
          <button onClick={handleLogout} className="w-full mt-7 bg-primary text-white py-3.5 rounded-xl font-bold hover:bg-primary-container transition-colors">
            ออกจากระบบ
          </button>
        </div>
      </div>
    );
  }

  if (profile?.status === 'rejected') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-red-100 shadow-xl p-8 text-center">
          <h1 className="text-2xl font-black text-red-700">บัญชีถูกระงับ</h1>
          <p className="text-sm text-slate-500 mt-3 leading-relaxed">กรุณาติดต่อผู้ดูแลระบบเพื่อขอเปิดสิทธิ์ใช้งานอีกครั้ง</p>
          <button onClick={handleLogout} className="w-full mt-7 bg-slate-900 text-white py-3.5 rounded-xl font-bold hover:bg-slate-800 transition-colors">
            ออกจากระบบ
          </button>
        </div>
      </div>
    );
  }

  const role = (profile?.role as Role) || 'customer';
  const viewToShow = currentView || getDefaultView(role);

  return (
    <Layout
      currentView={viewToShow}
      setCurrentView={setCurrentView}
      role={role}
      profile={profile}
      onLogout={handleLogout}
      notifications={notifications}
      onMarkRead={markAllAsRead}
      lang={lang}
      setLang={setLang}
    >
      <Suspense fallback={<PageLoading />}>
        {viewToShow === 'dashboard' && <Dashboard role={role} onSelectTicket={handleSelectTicket} lang={lang} />}
        {(viewToShow === 'tickets' || viewToShow === 'assigned') && (
          <TicketList onSelectTicket={handleSelectTicket} role={role} initialMode={viewToShow === 'assigned' ? 'assigned' : 'board'} profile={profile} />
        )}
        {viewToShow === 'ticket-details' && <TicketDetails ticketId={selectedTicketId} role={role} onAddNotification={addNotification} />}
        {viewToShow === 'customers' && <CustomerList />}
        {viewToShow === 'team' && <Team onAddNotification={addNotification} />}
        {viewToShow === 'staff' && <StaffManagement />}
        {viewToShow === 'profile' && <UserProfile />}
      </Suspense>
      <PwaBanner />
    </Layout>
  );
}
