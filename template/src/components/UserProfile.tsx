import React, { useState } from 'react';
import { User, Lock, Building, MapPin, Mail, Phone, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { formatPhoneNumber } from '../lib/utils';

export function UserProfile() {
  const { profile, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ text: 'รหัสผ่านไม่ตรงกัน', type: 'error' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ text: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });
    
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setMessage({ text: 'เปลี่ยนรหัสผ่านสำเร็จ', type: 'success' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-xl font-black text-blue-950 flex items-center gap-2">
            <User className="text-primary" />
            {profile.role === 'customer' ? 'ข้อมูลผู้ใช้งาน (Customer Profile)' : `ข้อมูลผู้ใช้งาน (${profile.role === 'admin' ? 'Administrator' : profile.role === 'crm' ? 'CRM Staff' : 'Technician Profile'})`}
          </h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4">ข้อมูลส่วนตัว</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-blue-50 text-primary flex items-center justify-center shrink-0 overflow-hidden border-2 border-slate-100">
                    {profile.emp_id ? (
                      <img src={`https://wms.advanceagro.net/WSVIS/api/Face/GetImage?CardID=${profile.emp_id}`} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <User size={28} />
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-bold">ชื่อ - นามสกุล</p>
                    <p className="text-sm font-black text-slate-800">{profile.full_name || '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-50 text-primary flex items-center justify-center shrink-0">
                    <Mail size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-bold">อีเมล</p>
                    <p className="text-sm font-black text-slate-800">{user?.email || '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-50 text-primary flex items-center justify-center shrink-0">
                    <Phone size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-bold">เบอร์ติดต่อ</p>
                    <p className="text-sm font-black text-slate-800">{formatPhoneNumber(profile.phone) || '-'}</p>
                  </div>
                </div>
              </div>
            </div>

            {profile.role === 'customer' ? (
              <div>
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4">ข้อมูลบริษัท</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-primary flex items-center justify-center shrink-0">
                      <Building size={20} />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-bold">ชื่อบริษัท</p>
                      <p className="text-sm font-black text-slate-800">{(profile as any).company?.name || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-primary flex items-center justify-center shrink-0">
                      <MapPin size={20} />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-bold">พื้นที่</p>
                      <p className="text-sm font-black text-slate-800">{(profile as any).company?.area || '-'}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4">ตำแหน่งและหน้าที่</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-primary flex items-center justify-center shrink-0">
                      <User size={20} />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-bold">รหัสพนักงาน</p>
                      <p className="text-sm font-black text-slate-800">{profile.emp_id || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-primary flex items-center justify-center shrink-0">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-bold">บทบาทในระบบ</p>
                      <p className="text-sm font-black text-slate-800 capitalize">{profile.role}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {profile.role === 'customer' && (
            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <h3 className="text-sm font-black text-slate-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Lock size={16} />
                เปลี่ยนรหัสผ่าน
              </h3>
              <form onSubmit={handleChangePassword} className="space-y-4">
                {message.text && (
                  <div className={`p-3 rounded-lg text-sm font-bold ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {message.text}
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-500 uppercase">รหัสผ่านใหม่</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full form-field"
                    placeholder="อย่างน้อย 6 ตัวอักษร"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-500 uppercase">ยืนยันรหัสผ่านใหม่</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full form-field"
                    placeholder="กรอกรหัสผ่านอีกครั้ง"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-primary text-white rounded-lg font-bold hover:bg-primary-container transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
                  บันทึกรหัสผ่าน
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
