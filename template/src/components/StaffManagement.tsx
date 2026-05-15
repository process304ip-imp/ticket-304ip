import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  Loader2,
  User,
  RefreshCw,
  Edit3,
  Save,
  XCircle,
  Building2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', badge: 'bg-red-50 text-red-700 border-red-200' },
  { value: 'crm', label: 'CRM Staff', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'technician', label: 'Technician', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'customer', label: 'Customer', badge: 'bg-slate-100 text-slate-600 border-slate-200' },
];

function RoleBadge({ role }: { role: string }) {
  const opt = ROLE_OPTIONS.find(r => r.value === role) ?? ROLE_OPTIONS[3];
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${opt.badge}`}>
      {opt.label}
    </span>
  );
}

export function StaffManagement() {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .neq('role', 'customer')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setStaff(data || []);
    } catch (error) {
      console.error('Error fetching staff:', error);
      toast.error('โหลดข้อมูลไม่สำเร็จ', 'กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleApprove = async (userId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole, status: 'active' })
        .eq('id', userId);
      if (error) throw error;
      toast.success('อนุมัติสิทธิ์สำเร็จ', `กำหนด Role: ${newRole} และเปิดใช้งานแล้ว`);
      fetchStaff();
    } catch (error) {
      console.error('Error approving staff:', error);
      toast.error('เกิดข้อผิดพลาด', 'ไม่สามารถอนุมัติได้');
    }
  };

  const handleReject = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ status: 'rejected' })
        .eq('id', userId);
      if (error) throw error;
      toast.success('ระงับการเข้าถึง', 'ระงับสิทธิ์ผู้ใช้งานนี้แล้ว');
      fetchStaff();
    } catch (error) {
      console.error('Error rejecting staff:', error);
      toast.error('เกิดข้อผิดพลาด', 'ไม่สามารถทำรายการได้');
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'rejected' ? 'active' : 'rejected';
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ status: newStatus })
        .eq('id', userId);
      if (error) throw error;
      toast.success(
        newStatus === 'active' ? 'เปิดใช้งานแล้ว' : 'ระงับการเข้าถึงแล้ว',
        `อัปเดตสถานะเรียบร้อย`
      );
      fetchStaff();
    } catch (error) {
      console.error('Error toggling status:', error);
      toast.error('เกิดข้อผิดพลาด', 'ไม่สามารถเปลี่ยนสถานะได้');
    }
  };

  const handleSaveRole = async (userId: string) => {
    setSavingId(userId);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: editRole })
        .eq('id', userId);
      if (error) throw error;
      toast.success('บันทึก Role สำเร็จ', `เปลี่ยนเป็น ${editRole} แล้ว`);
      setEditingId(null);
      fetchStaff();
    } catch (error) {
      console.error('Error saving role:', error);
      toast.error('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึก Role ได้');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500">
        <Loader2 className="animate-spin mb-4 text-primary" size={48} />
        <p className="font-bold animate-pulse">กำลังโหลดข้อมูลทีมงาน...</p>
      </div>
    );
  }

  const pendingStaff = staff.filter(s => s.status === 'pending' || s.role === 'pending');
  const activeStaff = staff.filter(s => s.status !== 'pending' && s.role !== 'pending');

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-blue-700 mb-1">Access Control</p>
          <h2 className="text-2xl font-black text-primary tracking-tight">Staff Management</h2>
          <p className="text-sm text-slate-500 mt-1">จัดการสิทธิ์การเข้าใช้งานและอนุมัติทีมงานจากระบบ HRMS</p>
        </div>
        <button
          onClick={fetchStaff}
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </section>

      {/* Pending Approvals */}
      {pendingStaff.length > 0 && (
        <section className="bg-orange-50 border border-orange-200 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-orange-200 bg-orange-100/50 flex items-center gap-2">
            <ShieldAlert className="text-orange-600" size={20} />
            <h3 className="font-black text-orange-800">รอดำเนินการอนุมัติสิทธิ์ ({pendingStaff.length})</h3>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingStaff.map(user => (
              <div key={user.id} className="bg-white p-4 rounded-xl shadow-sm border border-orange-100">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center overflow-hidden border border-slate-200 shrink-0">
                    {user.emp_id ? (
                      <img
                        src={`https://wms.advanceagro.net/WSVIS/api/Face/GetImage?CardID=${user.emp_id}`}
                        alt="Profile"
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <User size={20} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-black text-slate-800 truncate">{user.full_name || user.email}</h4>
                    <p className="text-xs font-bold text-slate-500 font-mono">EMP: {user.emp_id || '-'}</p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                    {user.department && (Array.isArray(user.department) ? user.department.length > 0 : !!user.department) && (
                      <div className="flex items-center gap-1 mt-1">
                        <Building2 size={12} className="text-slate-400" />
                        <p className="text-xs text-slate-500">
                          {Array.isArray(user.department) ? user.department.join(', ') : user.department}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <select
                    id={`role-${user.id}`}
                    className="form-field text-sm"
                    defaultValue="crm"
                  >
                    <option value="crm">CRM Staff</option>
                    <option value="technician">Technician</option>
                    <option value="admin">Administrator</option>
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(user.id, (document.getElementById(`role-${user.id}`) as HTMLSelectElement).value)}
                      className="flex-1 px-3 py-2 bg-primary text-white rounded-lg text-xs font-black hover:bg-primary/90 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <UserCheck size={14} /> อนุมัติสิทธิ์
                    </button>
                    <button
                      onClick={() => handleReject(user.id)}
                      className="flex-1 px-3 py-2 border border-red-200 text-red-600 bg-red-50 rounded-lg text-xs font-black hover:bg-red-100 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <UserX size={14} /> ปฏิเสธ
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active Staff Table */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-primary" size={20} />
            <h3 className="font-black text-slate-800">ทีมงานในระบบทั้งหมด</h3>
          </div>
          <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">{activeStaff.length} คน</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-5 py-3.5 text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">พนักงาน</th>
                <th className="px-5 py-3.5 text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">รหัส / แผนก</th>
                <th className="px-5 py-3.5 text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">อีเมล</th>
                <th className="px-5 py-3.5 text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">Role</th>
                <th className="px-5 py-3.5 text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">สถานะ</th>
                <th className="px-5 py-3.5 text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-200 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeStaff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-bold">
                    ยังไม่มีข้อมูลทีมงาน
                  </td>
                </tr>
              ) : activeStaff.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                  {/* Name + Photo */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-50 text-primary flex items-center justify-center overflow-hidden border border-slate-200 shrink-0">
                        {user.emp_id ? (
                          <img
                            src={`https://wms.advanceagro.net/WSVIS/api/Face/GetImage?CardID=${user.emp_id}`}
                            alt="Profile"
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <User size={16} />
                        )}
                      </div>
                      <span className="font-bold text-slate-800 text-sm">{user.full_name || '—'}</span>
                    </div>
                  </td>

                  {/* EMP ID + Department */}
                  <td className="px-5 py-3.5">
                    <p className="text-xs font-mono font-black text-slate-700">{user.emp_id || '—'}</p>
                    {user.department && (Array.isArray(user.department) ? user.department.length > 0 : !!user.department) && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Building2 size={12} className="text-slate-400" />
                        <p className="text-xs text-slate-500">
                          {Array.isArray(user.department) ? user.department.join(', ') : user.department}
                        </p>
                      </div>
                    )}
                  </td>

                  {/* Email */}
                  <td className="px-5 py-3.5 text-sm text-slate-600 max-w-[180px]">
                    <span className="truncate block">{user.email}</span>
                  </td>

                  {/* Role — inline edit */}
                  <td className="px-5 py-3.5">
                    {editingId === user.id ? (
                      <select
                        className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                        value={editRole}
                        onChange={e => setEditRole(e.target.value)}
                        autoFocus
                      >
                        {ROLE_OPTIONS.filter(r => r.value !== 'customer').map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    ) : (
                      <RoleBadge role={user.role} />
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-black flex items-center gap-1 w-fit border ${
                      user.status === 'rejected'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      <CheckCircle2 size={13} />
                      {user.status === 'rejected' ? 'ระงับ' : 'ใช้งานได้'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-3.5 text-right">
                    {editingId === user.id ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleSaveRole(user.id)}
                          disabled={savingId === user.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-white rounded-lg text-xs font-black hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                          {savingId === user.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                          บันทึก
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-black hover:bg-slate-50 transition-colors"
                        >
                          <XCircle size={14} /> ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1.5 transition-opacity">
                        <button
                          onClick={() => { setEditingId(user.id); setEditRole(user.role); }}
                          className="flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-black hover:bg-slate-50 transition-colors"
                        >
                          <Edit3 size={14} /> แก้ Role
                        </button>
                        <button
                          onClick={() => handleToggleStatus(user.id, user.status)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-black border transition-colors ${
                            user.status === 'rejected'
                              ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                              : 'border-red-200 text-red-600 hover:bg-red-50'
                          }`}
                        >
                          {user.status === 'rejected' ? (
                            <><UserCheck size={14} /> เปิดใช้</>
                          ) : (
                            <><UserX size={14} /> ระงับ</>
                          )}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
