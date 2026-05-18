import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, Copy, Mail, Phone, Plus, QrCode, Search, Send, UserPlus, X, Loader2, Edit, Save, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api, CompanyWithStatus } from '../lib/api';
import { useToast } from './Toast';
import { formatPhoneNumber } from '../lib/utils';

const generateId = () => {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude 0, 1, O, I for clarity
  return Array.from({ length: 8 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
};

export function CustomerList() {
  const [companies, setCompanies] = useState<CompanyWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast, confirm } = useToast();
  
  // Modals & Forms
  const [formData, setFormData] = useState<Partial<CompanyWithStatus> | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [qrCompany, setQrCompany] = useState<CompanyWithStatus | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Filters & Paging
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const fetchData = async () => {
    try {
      const data = await api.companies.list({ includeRegistration: true });
      setCompanies(data);
    } catch (error) {
      console.error('Error fetching companies:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCopy = (company: CompanyWithStatus) => {
    const link = company.registration_link || `${window.location.origin}/register?company=${company.id}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(company.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleOpenAdd = () => {
    setIsEditMode(false);
    setFormData({ id: generateId(), name: '', area: '', contact_name: '', phone: '', email: '' });
  };

  const handleOpenEdit = (company: CompanyWithStatus) => {
    setIsEditMode(true);
    setFormData({ ...company });
  };

  const handleSave = async () => {
    if (!formData || !formData.name) return;

    const ok = await confirm({
      title: isEditMode ? 'ยืนยันการแก้ไขข้อมูล?' : 'ยืนยันการเพิ่มลูกค้าและสร้างรหัส?',
      message: isEditMode 
        ? `คุณต้องการบันทึกการเปลี่ยนแปลงของ "${formData.name}" ใช่หรือไม่?`
        : `คุณกำลังจะเพิ่มลูกค้า "${formData.name}" และสร้างรหัสลงทะเบียนใหม่ ใช่หรือไม่?`,
      confirmLabel: 'ตกลง',
    });

    if (!ok) return;

    try {
       if (isEditMode && formData.id) {
         await api.companies.update(formData.id, {
           name: formData.name,
           area: formData.area,
           contact_name: formData.contact_name,
           phone: formData.phone,
           email: formData.email,
         });
         toast.success('อัปเดตข้อมูลสำเร็จ', `แก้ไขข้อมูลบริษัท ${formData.name} เรียบร้อยแล้ว`);
       } else {
         await api.companies.create({
           id: formData.id, // Include the generated ID
           name: formData.name,
           area: formData.area || '',
           contact_name: formData.contact_name,
           phone: formData.phone,
           email: formData.email,
         } as any);
         toast.success('สร้างบริษัทสำเร็จ', `เพิ่มบริษัท ${formData.name} และสร้าง QR เรียบร้อยแล้ว`);
       }
       setFormData(null);
       fetchData();
     } catch (e) {
       console.error('Failed to save company:', e);
       toast.error('บันทึกข้อมูลไม่สำเร็จ', 'กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง');
     }
   };

  const handleDelete = async (company: CompanyWithStatus) => {
    const ok = await confirm({
      title: 'ยืนยันการลบข้อมูล?',
      message: `คุณกำลังจะลบบริษัท "${company.name}" การดำเนินการนี้ไม่สามารถย้อนกลับได้และข้อมูลที่เกี่ยวข้องจะถูกลบทั้งหมด`,
      confirmLabel: 'ยืนยันการลบ',
      danger: true
    });

    if (!ok) return;

    try {
      await api.companies.delete(company.id);
      toast.success('ลบข้อมูลสำเร็จ', `ลบบริษัท ${company.name} เรียบร้อยแล้ว`);
      fetchData();
    } catch (e) {
      console.error('Failed to delete company:', e);
      toast.error('ลบไม่สำเร็จ', 'อาจมีข้อมูลอื่นที่ผูกกับบริษัทนี้อยู่ กรุณาลองใหม่อีกครั้ง');
    }
  };

  const filtered = useMemo(() => {
    let list = companies;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => 
        c.name.toLowerCase().includes(q) || 
        c.id.toLowerCase().includes(q) ||
        (c.contact_name && c.contact_name.toLowerCase().includes(q))
      );
    }
    if (areaFilter !== 'all') {
      list = list.filter(c => c.area === areaFilter);
    }
    if (statusFilter !== 'all') {
      const isReg = statusFilter === 'registered';
      list = list.filter(c => c.isRegistered === isReg);
    }
    return list;
  }, [companies, search, areaFilter, statusFilter]);

  const pageCount = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
  const areas = Array.from(new Set(companies.map((c) => c.area))).filter(Boolean).sort();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500">
        <Loader2 className="animate-spin mb-4 text-primary" size={48} />
        <p className="font-bold animate-pulse">กำลังดึงข้อมูลลูกค้า...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-primary tracking-tight">Customer Portal Management</h2>
          <p className="text-sm text-slate-500 mt-1">จัดการบัญชีลูกค้าและ Portal Link สำหรับลงทะเบียน (Pre-fill ข้อมูลบริษัท)</p>
        </div>
        <button onClick={handleOpenAdd} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary-container shadow-sm">
          <UserPlus size={16} />
          เพิ่มลูกค้า / สร้าง Portal Link
        </button>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Metric label="บริษัททั้งหมด" value={companies.length.toString()} />
        <Metric label="พื้นที่ active" value={areas.length.toString()} />
        <Metric label="ลงทะเบียนแล้ว" value={companies.filter(c => c.isRegistered).length.toString()} />
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50/50">
          <div className="relative w-full md:w-96 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="ค้นหาบริษัท, รหัส, ผู้ติดต่อ..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none" 
            />
          </div>
          <div className="flex w-full md:w-auto gap-2 overflow-x-auto pb-1 md:pb-0">
            <select className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 min-w-[140px] outline-none focus:border-primary" value={areaFilter} onChange={e => { setAreaFilter(e.target.value); setPage(1); }}>
              <option value="all">ทุกพื้นที่ (All Areas)</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 min-w-[140px] outline-none focus:border-primary" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="all">ทุกสถานะ (All Status)</option>
              <option value="registered">ลงทะเบียนแล้ว</option>
              <option value="unregistered">ยังไม่ลงทะเบียน</option>
            </select>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto min-h-[400px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <th className="p-4 font-black w-12 text-center">#</th>
                <th className="p-4 font-black">Company</th>
                <th className="p-4 font-black">Area</th>
                <th className="p-4 font-black">Contact</th>
                <th className="p-4 font-black text-sm">Status</th>
                <th className="p-4 font-black text-sm text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map((company, index) => {
                const displayNo = (page - 1) * pageSize + index + 1;
                return (
                  <tr key={company.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 text-center text-sm font-bold text-slate-400">{displayNo}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-black shrink-0">
                          {company.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-black text-slate-900 truncate" title={company.name}>{company.name}</p>
                          <p className="font-mono text-[11px] text-slate-400">{company.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm font-bold text-slate-700">{company.area}</td>
                    <td className="p-4">
                      <p className="text-sm font-bold text-slate-800">{company.contact_name || '-'}</p>
                      <div className="flex flex-col gap-1 mt-1 text-xs text-slate-500">
                        {company.phone && <span className="flex items-center gap-1.5"><Phone size={12} />{formatPhoneNumber(company.phone)}</span>}
                        {company.email && <span className="flex items-center gap-1.5"><Mail size={12} />{company.email}</span>}
                      </div>
                    </td>
                    <td className="p-4">
                      {company.isRegistered ? (
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold uppercase rounded-md tracking-wide">Registered</span>
                      ) : (
                        <span className="px-2 py-1 bg-slate-100 text-slate-500 text-xs font-bold uppercase rounded-md tracking-wide">Pending</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleOpenEdit(company)} className="px-2 py-1.5 text-xs font-bold text-slate-400 hover:text-primary transition-colors" title="Edit">
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleCopy(company)}
                          className={`px-3 py-1.5 text-xs font-bold border rounded-lg flex items-center gap-1.5 transition-all ${
                            copiedId === company.id ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {copiedId === company.id ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                          {copiedId === company.id ? 'Copied' : 'Link'}
                        </button>
                        <button onClick={() => setQrCompany(company)} className="px-3 py-1.5 text-xs font-bold bg-primary text-white rounded-lg hover:bg-primary-container flex items-center gap-1.5">
                          <QrCode size={13} /> QR
                        </button>
                        <button onClick={() => handleDelete(company)} className="px-2 py-1.5 text-xs font-bold text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 font-medium">ไม่พบข้อมูลลูกค้าที่ตรงกับเงื่อนไข</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-slate-100">
          {paginated.map((company, index) => {
             const displayNo = (page - 1) * pageSize + index + 1;
             return (
              <div key={company.id} className="p-4 space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-slate-400">#{displayNo}</span>
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-black shrink-0 text-sm">
                      {company.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-black text-slate-900 leading-tight">{company.name}</p>
                      <p className="font-mono text-[10px] text-slate-400">{company.id}</p>
                    </div>
                  </div>
                  {company.isRegistered ? (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-bold uppercase rounded tracking-wide shrink-0">Registered</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-bold uppercase rounded tracking-wide shrink-0">Pending</span>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm bg-slate-50 rounded-lg p-3">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400">Area</p>
                    <p className="font-bold text-slate-700">{company.area}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400">Contact</p>
                    <p className="font-bold text-slate-800 truncate">{company.contact_name || '-'}</p>
                  </div>
                  {(company.phone || company.email) && (
                    <div className="col-span-2 pt-1 mt-1 border-t border-slate-200">
                      {company.phone && <p className="text-xs text-slate-600 flex items-center gap-1.5"><Phone size={10} />{formatPhoneNumber(company.phone)}</p>}
                      {company.email && <p className="text-xs text-slate-600 flex items-center gap-1.5 mt-0.5"><Mail size={10} />{company.email}</p>}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => handleOpenEdit(company)} className="flex-1 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs font-bold flex justify-center items-center gap-1.5">
                    <Edit size={14} /> Edit
                  </button>
                  <button onClick={() => handleCopy(company)} className={`flex-1 py-2 rounded-lg text-xs font-bold flex justify-center items-center gap-1.5 border transition-all ${copiedId === company.id ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-300 text-slate-600 hover:bg-slate-100'}`}>
                    {copiedId === company.id ? <CheckCircle2 size={14} /> : <Copy size={14} />} Link
                  </button>
                  <button onClick={() => setQrCompany(company)} className="flex-1 py-2 bg-primary text-white rounded-lg text-xs font-bold flex justify-center items-center gap-1.5">
                    <QrCode size={14} /> QR
                  </button>
                  <button onClick={() => handleDelete(company)} className="py-2 px-3 text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 rounded-lg text-xs font-bold flex justify-center items-center transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
             );
          })}
          {paginated.length === 0 && (
             <div className="p-8 text-center text-slate-500 font-medium">ไม่พบข้อมูลลูกค้า</div>
          )}
        </div>

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="p-4 border-t border-slate-200 flex justify-between items-center bg-slate-50/50">
             <p className="text-xs font-semibold text-slate-500">
               หน้า {page} จาก {pageCount} ({filtered.length} รายการ)
             </p>
             <div className="flex gap-1">
               <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 border border-slate-300 rounded-md text-xs font-bold disabled:opacity-50 hover:bg-white transition-colors">
                 ก่อนหน้า
               </button>
               <button disabled={page === pageCount} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 border border-slate-300 rounded-md text-xs font-bold disabled:opacity-50 hover:bg-white transition-colors">
                 ถัดไป
               </button>
             </div>
          </div>
        )}
      </section>

      {/* Edit / Add Modal */}
      {formData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h3 className="text-lg font-black text-primary">
                {isEditMode ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มลูกค้าและสร้าง Registration Link'}
              </h3>
              <button onClick={() => setFormData(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Company name">
                  <input className="w-full form-field" placeholder="ชื่อบริษัท..." value={formData.name || ''} onChange={e => setFormData(p => p ? {...p, name: e.target.value} : p)} />
                </Field>
                <Field label="Area">
                  <select className="w-full form-field" value={formData.area || ''} onChange={e => setFormData(p => p ? {...p, area: e.target.value} : p)}>
                    <option value="">เลือกพื้นที่</option>
                    <option value="IP1">IP1</option>
                    <option value="IP2">IP2</option>
                    <option value="IP7 Phase 3">IP7 Phase 3</option>
                    <option value="IP7 Phase 5">IP7 Phase 5</option>
                    <option value="NPS">NPS</option>
                  </select>
                </Field>
                <Field label="Contact person">
                  <input className="w-full form-field" placeholder="ชื่อผู้ติดต่อ" value={formData.contact_name || ''} onChange={e => setFormData(p => p ? {...p, contact_name: e.target.value} : p)} />
                </Field>
                <Field label="Phone">
                  <input className="w-full form-field" placeholder="08X-XXX-XXXX" value={formData.phone || ''} onChange={e => setFormData(p => p ? {...p, phone: formatPhoneNumber(e.target.value)} : p)} />
                </Field>
                <Field label="EMAIL">
                  <input type="email" value={formData.email || ''} onChange={(e) => setFormData(p => p ? {...p, email: e.target.value} : p)} className="w-full form-field" placeholder="example@email.com" />
                </Field>
                <Field label="CUSTOMER UNIQUE ID (AUTO)">
                  <input type="text" value={formData.id || ''} readOnly className="w-full form-field bg-slate-50 text-slate-500 font-mono font-bold" />
                </Field>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3 sticky bottom-0 bg-white rounded-b-2xl z-10">
              <button onClick={() => setFormData(null)} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-700">ยกเลิก</button>
              <button onClick={handleSave} disabled={!formData.name} className="flex-[2] py-3 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-primary-container">
                {isEditMode ? <Save size={18} /> : <Plus size={18} />}
                {isEditMode ? 'บันทึกการแก้ไข' : 'บันทึกและสร้าง'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrCompany && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <div>
                <h3 className="font-black text-primary">Customer Portal Access</h3>
                <p className="text-xs text-slate-500 mt-0.5">{qrCompany.name}</p>
              </div>
              <button onClick={() => setQrCompany(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 flex flex-col items-center gap-5">
              <div className="p-4 bg-white border-2 border-slate-100 rounded-xl shadow-inner">
                <QRCodeSVG
                  value={qrCompany.registration_link || `${window.location.origin}/register?company=${qrCompany.id}`}
                  size={200}
                  fgColor="#001e40"
                  level="H"
                  includeMargin
                  id="qr-modal-svg"
                />
              </div>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => handleCopy(qrCompany)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border transition-all ${
                    copiedId === qrCompany.id ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {copiedId === qrCompany.id ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                  {copiedId === qrCompany.id ? 'Copied!' : 'Copy Link'}
                </button>
                <button
                  onClick={() => {
                    const svg = document.querySelector('#qr-modal-svg');
                    if (svg) {
                      const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `qr-${qrCompany.id}.svg`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }
                  }}
                  className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary-container"
                >
                  <Send size={16} />
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-2xl font-black text-primary mt-1">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 block">
      <span className="text-xs font-black uppercase text-slate-600">{label}</span>
      {children}
    </label>
  );
}
