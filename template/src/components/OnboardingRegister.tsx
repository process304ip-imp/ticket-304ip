import React, { useMemo, useState, useEffect } from 'react';
import { CheckCircle2, Lock, Mail, Phone, QrCode, User, Loader2, AlertCircle, KeyRound, ArrowLeft } from 'lucide-react';
import { api, Company } from '../lib/api';
import { supabase } from '../lib/supabase';

interface OnboardingRegisterProps {
  onGoToLogin: () => void;
}

export function OnboardingRegister({ onGoToLogin }: OnboardingRegisterProps) {
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<Company | null>(null);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [phone, setPhone] = useState('');

  // Reset mode
  const [isResetMode, setIsResetMode] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState('');
  const [last4Digits, setLast4Digits] = useState('');
  const [correctLast4, setCorrectLast4] = useState('');
  const [isVerified, setIsVerified] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const companyParam = params.get('company');
  const areaParam = params.get('area');

  useEffect(() => {
    async function fetchCompany() {
      if (companyParam) {
        try {
          const data = await api.companies.get(companyParam);
          setCompany(data);
          if (data) {
            setFullName(data.contact_name || '');
            setEmail(data.email || '');
            setPhone(data.phone || '');

            // SMART DETECTION: Check if this company already has a registered user
            const { data: exists } = await (supabase.rpc as any)('check_user_exists_by_company', { 
              cid: data.id 
            });
            
            if (exists) {
              await switchToResetMode(data.email || '', data.id);
            }
          }
        } catch (err) {
          console.error('Error fetching company:', err);
        }
      }
      setLoading(false);
    }
    fetchCompany();
  }, [companyParam]);

  // Real-time verification of 4 digits
  useEffect(() => {
    if (isResetMode && last4Digits.length === 4) {
      if (last4Digits === correctLast4) {
        setIsVerified(true);
        setError(null);
      } else {
        setIsVerified(false);
        setError('4 ตัวท้ายไม่ถูกต้อง กรุณาลองใหม่');
      }
    } else {
      setIsVerified(false);
    }
  }, [last4Digits, correctLast4, isResetMode]);

  const normalizeArea = (a: string) => a.replace(/-/g, ' ');
  const area = areaParam ? normalizeArea(areaParam) : (company?.area || '-');

  const switchToResetMode = async (emailAddr: string, cid?: string) => {
    const { data: p } = await (supabase.rpc as any)('get_masked_profile_by_company', { 
      cid: cid || company?.id 
    });

    const profile = p && p[0];

    if (profile) {
      const clean = (profile.masked_phone || '').replace(/[^0-9]/g, '');
      
      if (clean.length >= 7) {
        setMaskedPhone(`${clean.substring(0, 3)}-${clean.substring(3, 6)}-XXXX`);
        setCorrectLast4(clean.slice(-4));
      } else {
        setMaskedPhone('XXX-XXX-XXXX');
        setCorrectLast4(clean.slice(-4));
      }
      
      if (profile.user_email) setEmail(profile.user_email);
      if (profile.user_full_name) setFullName(profile.user_full_name);
      
      // Store ID for submission
      if (profile.user_id) {
        (window as any)._resetUserId = profile.user_id;
      }
    }

    setIsResetMode(true);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('รหัสผ่านไม่ตรงกัน กรุณากรอกให้ตรงกันทั้งสองช่อง');
      return;
    }
    if (password.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }

    setLoading(true);

    try {
      // ---- RESET MODE ----
      if (isResetMode) {
        if (!isVerified) {
          throw new Error('กรุณายืนยันตัวตนด้วยเบอร์โทรศัพท์ก่อน');
        }

        const userId = (window as any)._resetUserId;
        if (!userId) {
          throw new Error('ไม่พบข้อมูลบัญชีนี้ในระบบ กรุณาติดต่อเจ้าหน้าที่');
        }

        const { data, error: resetError } = await supabase.functions.invoke('reset-password-admin', {
          body: {
            userId,
            newPassword: password,
            companyId: company?.id,
            phoneLast4: last4Digits,
          },
        });

        if (resetError || !data?.success) {
          throw new Error(data?.error || resetError?.message || 'เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน');
        }

        setIsComplete(true);
        return;
      }

      // ---- REGISTER MODE ----
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role: 'customer' },
        },
      });

      if (authError) {
        if (
          authError.message.toLowerCase().includes('already registered') ||
          authError.message.toLowerCase().includes('already been registered') ||
          authError.message.toLowerCase().includes('user already')
        ) {
          await switchToResetMode(email);
          return;
        }
        throw authError;
      }

      if (authData.user) {
        const createdAt = new Date(authData.user.created_at).getTime();
        const lastSignIn = authData.user.last_sign_in_at
          ? new Date(authData.user.last_sign_in_at).getTime()
          : null;
        const isExistingUser = lastSignIn !== null && Math.abs(lastSignIn - createdAt) > 5000;

        if (isExistingUser) {
          await supabase.auth.signOut();
          await switchToResetMode(email);
          return;
        }

        // Truly new user — insert profile
        const { error: profileError } = await supabase.from('user_profiles').insert({
          id: authData.user.id,
          full_name: fullName,
          role: 'customer',
          company_id: company?.id || null,
          department: department,
          phone: phone,
          email: email,
        });

        if (profileError) {
          if (profileError.code === '23505') {
            await supabase.auth.signOut();
            await switchToResetMode(email);
            return;
          }
          throw profileError;
        }
        setIsComplete(true);
      }
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  // ---- LOADING SCREEN ----
  if (loading && !company) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  // ---- SUCCESS SCREEN ----
  if (isComplete) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 size={34} />
          </div>
          <h1 className="text-2xl font-black text-primary">
            {isResetMode ? 'รีเซ็ตรหัสผ่านสำเร็จ' : 'ลงทะเบียนสำเร็จ'}
          </h1>
          <p className="text-sm text-slate-500 mt-3 leading-relaxed">
            {isResetMode
              ? 'รหัสผ่านของคุณถูกเปลี่ยนเรียบร้อยแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่'
              : 'ระบบบันทึก profile เบื้องต้นของคุณแล้ว กรุณาเข้าสู่หน้า Login เพื่อใช้งานระบบ Ticket'}
          </p>
          <button
            onClick={onGoToLogin}
            className="w-full mt-7 bg-primary text-white py-3.5 rounded-xl font-bold hover:bg-primary-container transition-colors"
          >
            ไปหน้า Login
          </button>
        </div>
      </div>
    );
  }

  // ---- MAIN FORM ----
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">

        {/* ---- LEFT PANEL ---- */}
        <section className={`text-white p-8 md:p-10 flex flex-col justify-between transition-colors duration-300 ${isResetMode ? 'bg-blue-700' : 'bg-primary'}`}>
          <div>
            <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center mb-6">
              {isResetMode ? <KeyRound size={30} /> : <QrCode size={30} />}
            </div>
            <h1 className="text-3xl font-black tracking-tight">
              {isResetMode ? 'ยืนยันตัวตน' : 'Customer Onboarding'}
            </h1>
            <p className="text-blue-100 text-sm mt-3 leading-relaxed">
              {isResetMode
                ? `ระบุ 4 ตัวท้ายของเบอร์โทรศัพท์${maskedPhone ? ' ' + maskedPhone : ''} ที่เคยลงทะเบียนไว้ เพื่อตั้งรหัสผ่านใหม่`
                : 'หน้านี้ใช้สำหรับลงทะเบียนครั้งแรกจาก QR / Link เท่านั้น ไม่ใช่หน้า Login'}
            </p>
          </div>

          <div className="mt-8 space-y-3">
            <KnownInfo label="บริษัท" value={company?.name || 'ไม่พบข้อมูล'} />
            <KnownInfo label="พื้นที่" value={area} />
            {!isResetMode && (
              <KnownInfo
                label="Registration Code"
                value={company ? company.id : '-'}
              />
            )}
          </div>
        </section>

        {/* ---- RIGHT PANEL / FORM ---- */}
        <section className="p-6 md:p-8 overflow-y-auto">
          <div className="mb-6">
            <h2 className="text-xl font-black text-slate-900">
              {isResetMode ? 'Reset Password' : 'Complete Profile'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {isResetMode
                ? 'ระบุ 4 ตัวท้ายเบอร์โทรเพื่อปลดล็อคการตั้งรหัสผ่าน'
                : 'ระบบรู้ข้อมูลบริษัทแล้ว กรุณากรอกข้อมูลส่วนตัวที่เหลือ'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Error / Info Banner */}
            {error && (
              <div className={`border p-3.5 rounded-xl text-sm font-bold flex items-start gap-2.5 ${
                isVerified
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                  : isResetMode
                  ? 'bg-blue-50 border-blue-200 text-blue-800'
                  : 'bg-red-50 border-red-100 text-red-600'
              }`}>
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p>{error}</p>
                </div>
              </div>
            )}

            {/* EMAIL — always shown */}
            <Field label={isResetMode ? 'Email ที่เคยลงทะเบียน' : 'Email'} icon={<Mail size={16} />}>
              <input
                type="email"
                required
                readOnly={isResetMode}
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={`w-full form-field pl-10 ${isResetMode ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed' : ''}`}
                placeholder="name@company.com"
              />
            </Field>

            {/* NAME — read only in reset mode */}
            {isResetMode && (
              <Field label="ชื่อผู้ลงทะเบียน" icon={<User size={16} />}>
                <input
                  type="text"
                  readOnly
                  value={fullName}
                  className="w-full form-field pl-10 bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                />
              </Field>
            )}

            {/* REGISTER MODE FIELDS */}
            {!isResetMode && (
              <>
                <label className="space-y-1.5 block">
                  <span className="text-xs font-black text-slate-600 uppercase">ชื่อ-สกุล</span>
                  <div className="flex">
                    <div className="px-3 rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 text-slate-600 text-sm font-bold flex items-center">
                      คุณ
                    </div>
                    <input
                      required
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      className="w-full form-field rounded-l-none"
                      placeholder="ชื่อและนามสกุล"
                    />
                  </div>
                </label>

                <label className="space-y-1.5 block">
                  <span className="text-xs font-black text-slate-600 uppercase">ฝ่าย-ตำแหน่ง (optional)</span>
                  <input
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    className="w-full form-field"
                    placeholder="เช่น Facility Manager, Admin"
                  />
                </label>

                <Field label="เบอร์ติดต่อ" icon={<Phone size={16} />}>
                  <input
                    required
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full form-field pl-10"
                    placeholder="08X-XXX-XXXX"
                  />
                </Field>
              </>
            )}

            {/* RESET MODE — Phone verification */}
            {isResetMode && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-inner">
                <p className="text-xs font-black text-amber-700 uppercase mb-3 flex items-center gap-2">
                  <Phone size={14} /> ยืนยันตัวตนด้วยเบอร์โทรศัพท์
                </p>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 px-4 py-3 bg-white border-2 border-amber-100 rounded-xl flex items-center justify-center">
                    <span className="text-lg font-mono font-bold text-slate-400 tracking-wider">
                      {maskedPhone || 'XXX-XXX-XXXX'}
                    </span>
                  </div>
                  
                  <div className="relative group">
                    <input
                      required
                      maxLength={4}
                      inputMode="numeric"
                      value={last4Digits}
                      onChange={e => setLast4Digits(e.target.value.replace(/[^0-9]/g, ''))}
                      className={`w-full sm:w-32 px-4 py-3 border-2 rounded-xl text-center text-xl font-black focus:outline-none transition-all ${
                        isVerified 
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700' 
                          : 'border-blue-500 focus:ring-4 focus:ring-blue-100 placeholder:text-slate-300'
                      }`}
                      placeholder="4 ตัวท้าย"
                    />
                    {isVerified && (
                      <div className="absolute -top-2 -right-2 bg-emerald-500 text-white rounded-full p-1 shadow-lg">
                        <CheckCircle2 size={12} />
                      </div>
                    )}
                  </div>
                </div>
                
                {!isVerified && (
                  <p className="mt-3 text-[11px] text-amber-600 font-medium">
                    * กรุณาระบุเลข 4 ตัวสุดท้ายของเบอร์โทรศัพท์ที่เคยลงทะเบียนไว้เพื่อปลดล็อค
                  </p>
                )}
              </div>
            )}

            {/* PASSWORD FIELDS — Locked until verified in reset mode */}
            <div className={`grid grid-cols-2 gap-3 transition-opacity duration-300 ${isResetMode && !isVerified ? 'opacity-40 grayscale pointer-events-none' : 'opacity-100'}`}>
              <Field label={isResetMode ? 'รหัสผ่านใหม่' : 'รหัสผ่าน'} icon={<Lock size={16} />}>
                <input
                  type="password"
                  required={!isResetMode || isVerified}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full form-field pl-10"
                  placeholder="••••••••"
                />
              </Field>
              <Field label="ยืนยันรหัสผ่าน" icon={<Lock size={16} />}>
                <input
                  type="password"
                  required={!isResetMode || isVerified}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full form-field pl-10"
                  placeholder="••••••••"
                />
              </Field>
            </div>

            {/* SUBMIT BUTTON */}
            <button
              type="submit"
              disabled={loading || (isResetMode && !isVerified)}
              className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-[0.98] shadow-sm mt-2 ${
                loading || (isResetMode && !isVerified)
                  ? 'bg-slate-300 text-slate-500 shadow-none'
                  : isResetMode
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'
                  : 'bg-primary hover:bg-primary-container text-white shadow-slate-200'
              }`}
            >
              {loading
                ? <Loader2 className="animate-spin" size={18} />
                : isResetMode
                  ? <KeyRound size={18} />
                  : <User size={18} />}
              {isResetMode ? 'ยืนยันและรีเซ็ตรหัสผ่าน' : 'Complete Profile & Register'}
            </button>

            {/* BACK LINK (reset mode) */}
            {isResetMode && (
              <button
                type="button"
                onClick={() => {
                  setIsResetMode(false);
                  setIsVerified(false);
                  setError(null);
                  setLast4Digits('');
                  setPassword('');
                  setConfirmPassword('');
                }}
                className="w-full py-2 flex items-center justify-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
              >
                <ArrowLeft size={12} /> กลับสู่หน้าลงทะเบียนใหม่
              </button>
            )}
          </form>
        </section>
      </div>
    </div>
  );
}

function KnownInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/10 border border-white/15 rounded-xl p-4">
      <p className="text-[11px] font-black uppercase tracking-wider text-blue-200 mb-1">{label}</p>
      <p className="font-bold text-white">{value}</p>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 block">
      <span className="text-xs font-black text-slate-600 uppercase">{label}</span>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
        {children}
      </div>
    </label>
  );
}

function normalizeArea(value: string) {
  const map: Record<string, string> = {
    ip1: 'IP1',
    ip2: 'IP2',
    ip7p3: 'IP7 Phase 3',
    ip7p5: 'IP7 Phase 5',
    nps: 'NPS',
  };
  return map[value.toLowerCase()] || value.toUpperCase();
}
