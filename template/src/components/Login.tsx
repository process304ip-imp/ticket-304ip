import React, { useState } from 'react';
import md5 from 'md5';
import { ArrowRight, Lock, Mail, Shield, Ticket, User, Users, Wrench, Building2, Briefcase, BadgeCheck } from 'lucide-react';
import { Role } from '../data';
import { supabase } from '../lib/supabase';

interface LoginProps {
  onLogin: (role: Role) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [loginMode, setLoginMode] = useState<'customer' | 'team'>('customer');
  const [email, setEmail] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roles = [
    {
      id: 'customer' as Role,
      title: 'Customer',
      description: 'สร้าง Ticket เฉพาะ Water Supply / Facility และติดตามสถานะ',
      icon: User,
      tone: 'bg-amber-50 text-amber-700 border-amber-200',
      active: 'ring-2 ring-amber-500 bg-amber-50 border-amber-500',
    },
    {
      id: 'crm' as Role,
      title: 'CRM Team',
      description: 'เปิด Ticket แทนลูกค้า, Power internal ticket และ assign งาน',
      icon: Users,
      tone: 'bg-blue-50 text-blue-700 border-blue-200',
      active: 'ring-2 ring-blue-600 bg-blue-50 border-blue-600',
    },
    {
      id: 'technician' as Role,
      title: 'Technician / Operation',
      description: 'รับงาน อัปเดต Log นาทีต่อนาที แนบรูป และส่งมอบงาน',
      icon: Wrench,
      tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      active: 'ring-2 ring-emerald-600 bg-emerald-50 border-emerald-600',
    },
    {
      id: 'admin' as Role,
      title: 'Admin / Management',
      description: 'วิเคราะห์ Service Performance, Area Impact และคุณภาพการให้บริการแบบ Real-time',
      icon: Shield,
      tone: 'bg-slate-100 text-slate-700 border-slate-200',
      active: 'ring-2 ring-slate-700 bg-slate-50 border-slate-700',
    },
  ];

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (loginMode === 'customer') {
        // Customer Login - Direct Supabase Auth
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      } else {
        // Team Login - Frontend IDMS Auth
        const agentId = 'SystemMango';
        const agentCode = 'Np4kfRh5';
        const hashedPassword = md5(password);
        
        // Use Vite Proxy endpoints instead of direct URLs to bypass browser HSTS/TLS blocks
        const idmsUrl = `/api/idms/authentication/?account=${encodeURIComponent(employeeId)}&password=${encodeURIComponent(hashedPassword)}&Service=0000&AgentId=${agentId}&AgentCode=${agentCode}`;
        
        // 1. Authenticate with IDMS
        let authText = '';
        try {
          const authRes = await fetch(idmsUrl);
          authText = await authRes.text();
        } catch (fetchErr: any) {
          throw new Error('ไม่สามารถเชื่อมต่อระบบ HRMS ได้ (Proxy Error)');
        }

        let empId = null;
        let isSuccess = false;
        
        try {
          const authData = JSON.parse(authText);
          isSuccess = authData.Result === 'OK' || authData.status === 'success' || authData.Status === 'Success' || authData.Code === 200 || authData.code === '200';
          empId = authData.EmpId || authData.emp_id || authData.EmpID || authData.EmpId?.trim() || null;
          if (empId === '0' || empId === 0) {
            isSuccess = false;
            empId = null;
          }
        } catch {
          if (authText.includes('OK') || authText.includes('Success') || authText.includes('true')) {
            isSuccess = true;
            const match = authText.match(/EmpId["']?\s*[:=]\s*["']?(\d+)/i);
            if (match) empId = match[1];
          }
        }

        if (!isSuccess || !empId) {
          console.error("IDMS Raw Response:", authText);
          throw new Error(`เข้าสู่ระบบไม่สำเร็จ (Raw: ${authText.substring(0, 150)})`);
        }

        // 2. Fetch Employee Data
        let employeeData: any = {};
        try {
          const hrmsRes = await fetch(`/api/hrms/employee/${empId}`);
          const hrmsText = await hrmsRes.text();
          const hrmsData = JSON.parse(hrmsText);
          employeeData = hrmsData?.data?.employee || hrmsData || {};
        } catch (err) {
          console.warn("Failed to fetch full employee profile", err);
        }

        // 3. Sync to Supabase via Edge Function
        const { data, error: fnError } = await supabase.functions.invoke('login-hrms', {
          body: { username: employeeId, password, empId, employeeData }
        });

        // Add robust error debugging
        if (fnError) {
          throw new Error(`Edge Function Invocation Error: ${fnError.message}`);
        }

        if (data?.success === false || data?.error) {
          const stepMsg = data?.step ? ` (ติดที่ขั้นตอน: ${data.step})` : '';
          throw new Error(`${data?.error || 'ไม่สามารถยืนยันตัวตนได้'}${stepMsg}`);
        }

        if (data?.status === 'rejected') {
          throw new Error('บัญชีนี้ถูกระงับสิทธิ์ กรุณาติดต่อผู้ดูแลระบบ');
        }

        if (data?.status === 'pending' || data?.role === 'pending') {
          throw new Error('บันทึกข้อมูล HRMS สำเร็จแล้ว กรุณารอ Admin อนุมัติสิทธิ์ก่อนเข้าใช้งาน');
        }

        // Auto-login after HRMS syncs password with Supabase
        if (data?.success && data?.email) {
          const { error: authError } = await supabase.auth.signInWithPassword({
            email: data.email,
            password,
          });
          
          if (authError) {
            throw new Error('รหัสผ่านถูกต้อง แต่ไม่สามารถเข้าสู่ระบบภายในได้ กรุณาติดต่อผู้ดูแลระบบ');
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (role: Role) => {
    setLoading(true);
    setError(null);
    const demoEmail = `demo_${role}@304ip.com`;
    const demoPassword = 'password1234';

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: demoEmail,
        password: demoPassword,
      });

      if (signInError) {
        // If account doesn't exist, try sign up
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: demoEmail,
          password: demoPassword,
        });

        if (signUpError) throw signUpError;

        if (signUpData.user) {
          // Create user profile for the demo user
          const { error: profileError } = await supabase
            .from('user_profiles')
            .upsert({
              id: signUpData.user.id,
              full_name: `Demo ${role.toUpperCase()}`,
              role: role,
              company_id: role === 'customer' ? 'wd' : null,
              department: role === 'customer' ? [] : [role]
            });
            
          if (profileError) throw profileError;
        }
      }
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ Demo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100">
        {/* Left Section - Hero/Info */}
        <section className="bg-primary p-8 md:p-10 text-white flex flex-col justify-between min-h-[360px]">
          <div>
            <div className="w-16 h-16 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-6">
              <Ticket size={34} />
            </div>
            <h1 className="text-3xl font-black tracking-tight">304IP CRM Ticket Tracking</h1>
            <p className="text-blue-100 text-sm mt-3 leading-relaxed max-w-sm">
              ระบบติดตามงานและบริการ (CRM Ticket) สำหรับนิคมอุตสาหกรรม 304 พร้อมระบบแจ้งเตือนและติดตามงาน Real-time
            </p>
          </div>

          <div className="mt-8 space-y-4">
             <div className="bg-white/10 border border-white/15 rounded-xl p-4">
              <p className="font-bold text-sm">ต้องการลงทะเบียนใหม่?</p>
              <p className="text-xs text-blue-100 mt-1 leading-relaxed">
                กรุณาติดต่อทีม CRM 304IP เพื่อขอรับ QR Code ลงทะเบียนสำหรับบริษัทของท่าน
              </p>
            </div>
          </div>
        </section>

        {/* Right Section - Login Form */}
        <section className="p-6 md:p-10 flex flex-col justify-center bg-white">
          <div className="mb-6 text-center lg:text-left">
            <h2 className="text-2xl font-black text-slate-900 italic uppercase tracking-wider">Welcome Back</h2>
            <p className="text-sm text-slate-500 mt-1">กรุณาเลือกระบบสำหรับเข้าใช้งาน</p>
          </div>

          {/* Mode Switcher */}
          <div className="flex bg-slate-100 p-1.5 rounded-xl mb-8">
            <button
              type="button"
              onClick={() => { setLoginMode('customer'); setError(null); }}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                loginMode === 'customer' 
                  ? 'bg-white text-primary shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Building2 size={16} />
              Customer
            </button>
            <button
              type="button"
              onClick={() => { setLoginMode('team'); setError(null); }}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                loginMode === 'team' 
                  ? 'bg-slate-800 text-white shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Briefcase size={16} />
              304IP Staff
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleAuth} className="space-y-4 mb-8">
            {loginMode === 'customer' ? (
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-12 pr-4 text-sm font-bold focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                    required
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase ml-1">USER ID (HRMS)</label>
                <div className="relative">
                  <BadgeCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    placeholder="ตัวอย่าง chatchawan_tu"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-12 pr-4 text-sm font-bold focus:ring-2 focus:ring-slate-800 focus:border-transparent outline-none transition-all"
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-400 uppercase ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-12 pr-4 text-sm font-bold focus:ring-2 focus:border-transparent outline-none transition-all ${
                    loginMode === 'team' ? 'focus:ring-slate-800' : 'focus:ring-primary'
                  }`}
                  required
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-xs font-bold px-1">{error}</p>}

            <button
              disabled={loading}
              type="submit"
              className={`w-full text-white py-4 rounded-xl font-black text-lg transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 ${
                loginMode === 'team' 
                  ? 'bg-slate-800 hover:bg-slate-900 shadow-slate-800/20' 
                  : 'bg-primary hover:bg-slate-900 shadow-primary/20'
              }`}
            >
              {loading ? 'Authenticating...' : 'Sign In'}
              <ArrowRight size={20} />
            </button>
            
            {loginMode === 'team' && (
              <p className="text-[10px] text-center text-slate-400 mt-2">
                * พนักงานเข้าสู่ระบบด้วย HRMS/IDMS ของบริษัท
              </p>
            )}
          </form>

          {/* Demo Roles Header */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
            <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-white px-3 text-slate-400 font-bold tracking-widest">ทดสอบด้วยระบบ Demo Roles</span></div>
          </div>

          {/* Demo Roles Grid */}
          <div className="grid grid-cols-2 gap-2">
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => handleDemoLogin(role.id)}
                className="group flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all text-left"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${role.tone} group-hover:scale-95 transition-transform`}>
                  <role.icon size={20} />
                </div>
                <span className="text-xs font-black text-slate-700 uppercase tracking-tight">{role.title}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <p className="text-slate-400 text-xs mt-8 font-bold uppercase tracking-widest opacity-50">Supabase Auth Integrated</p>
    </div>
  );
}
