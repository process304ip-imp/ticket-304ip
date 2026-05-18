import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Settings, 
  Trash2, 
  Edit2, 
  ChevronRight, 
  Layers, 
  MessageSquare, 
  Save,
  X,
  Search,
  Filter,
  Users,
  ChevronLeft,
  ArrowRight,
  Zap,
  Droplets,
  Building2,
  BookOpen,
  Clock,
  AlertTriangle,
  TrendingUp,
  Info
} from 'lucide-react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { useAuth } from '../hooks/useAuth';
import { categoryColors, TicketCategory } from '../data';
import { formatPhoneNumber } from '../lib/utils';

export default function MasterDataAdmin() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const role = profile?.role;
  
  const [activeTab, setActiveTab] = useState<'categories' | 'sub_categories' | 'templates' | 'teams' | 'rules'>('categories');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const [data, setData] = useState<{
    categories: any[];
    sub_categories: any[];
    templates: any[];
    teams: any[];
  }>({
    categories: [],
    sub_categories: [],
    templates: [],
    teams: []
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    fetchData();
    setCurrentPage(1); // Reset page on tab change
    setSearchTerm(''); // Reset search on tab change
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'categories') {
        const res = await api.masterData.listCategories();
        setData(prev => ({ ...prev, categories: res }));
      } else if (activeTab === 'sub_categories') {
        const cats = await api.masterData.listCategories();
        const subs = await api.masterData.listSubCategories();
        setData(prev => ({ ...prev, categories: cats, sub_categories: subs }));
      } else if (activeTab === 'templates') {
        const cats = await api.masterData.listCategories();
        const temps = await api.masterData.listQuickTemplates();
        setData(prev => ({ ...prev, categories: cats, templates: temps }));
      } else if (activeTab === 'teams') {
        const teamsRes = await api.teams.listAll();
        setData(prev => ({ ...prev, teams: teamsRes.filter((t: any) => t.is_active !== false) }));
      }
    } catch (err) {
      toast.error('ไม่สามารถดึงข้อมูลได้', 'กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    const list = data[activeTab] || [];
    if (!searchTerm) return list;
    
    const s = searchTerm.toLowerCase();
    return list.filter((item: any) => {
      const name = (item.name || item.template_text || '').toLowerCase();
      const role = (item.role_label || '').toLowerCase();
      const area = (item.area || '').toLowerCase();
      const specialty = (item.specialty || '').toLowerCase();
      return name.includes(s) || role.includes(s) || area.includes(s) || specialty.includes(s);
    });
  }, [data, activeTab, searchTerm]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage]);

  const totalPages = Math.ceil(filteredData.length / pageSize);

  const handleSave = async () => {
    setLoading(true);
    try {
      const tableMap: Record<string, string> = {
        categories: 'categories',
        sub_categories: 'sub_categories',
        templates: 'quick_templates',
        teams: 'response_teams',
      };
      const table = tableMap[activeTab];

      if (editingItem) {
        const { error } = await (supabase as any)
          .from(table)
          .update(formData)
          .eq('id', editingItem.id);
        if (error) throw error;
        toast.success('อัปเดตสำเร็จ', 'ข้อมูลถูกบันทึกเรียบร้อยแล้ว');
      } else {
        const insertData = { ...formData, is_active: true };
        if (activeTab === 'teams' && !insertData.id) {
          insertData.id = Math.random().toString(36).substring(7).toUpperCase();
        }

        const { error } = await (supabase as any)
          .from(table)
          .insert(insertData);
        if (error) throw error;
        toast.success('เพิ่มข้อมูลสำเร็จ', 'รายการใหม่ถูกบันทึกเรียบร้อยแล้ว');
      }

      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error('บันทึกไม่สำเร็จ', err.message || 'กรุณาตรวจสอบข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('ยืนยันการลบ? ข้อมูลจะถูกซ่อน (Soft Delete)')) return;
    const tableMap: Record<string, string> = {
      categories: 'categories',
      sub_categories: 'sub_categories',
      templates: 'quick_templates',
      teams: 'response_teams',
    };
    try {
      const { error } = await (supabase as any)
        .from(tableMap[activeTab])
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
      toast.success('ลบข้อมูลสำเร็จ', 'รายการถูกซ่อนจากระบบแล้ว');
      fetchData();
    } catch (err: any) {
      toast.error('ลบไม่สำเร็จ', err.message || 'กรุณาลองใหม่');
    }
  };

  if (role !== 'admin' && role !== 'crm') {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-slate-400">Access Denied</h2>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Settings className="text-primary" size={28} />
            </div>
            Master Data
          </h1>
          <p className="text-slate-500 font-medium">จัดการโครงสร้างข้อมูล หมวดหมู่ และการตั้งค่าระบบ</p>
        </div>
        
        <button 
          onClick={() => {
            setEditingItem(null);
            setFormData({});
            setModalOpen(true);
          }}
          className="bg-primary text-white h-12 px-8 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-105 transition-transform flex items-center gap-2"
        >
          <Plus size={20} />
          เพิ่มรายการ
        </button>
      </header>

      {/* Tabs & Search Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit flex-wrap gap-1">
          {[
            { id: 'categories', label: 'หมวดหมู่', icon: Layers },
            { id: 'sub_categories', label: 'ปัญหาย่อย', icon: Filter },
            { id: 'templates', label: 'ข้อความตอบกลับ', icon: MessageSquare },
            { id: 'teams', label: 'ทีมตอบสนอง', icon: Users },
            { id: 'rules', label: 'หลักการ Priority & SLA', icon: BookOpen },
          ].map((tab) => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-white shadow-md text-primary scale-105' : 'text-slate-500 hover:text-slate-900'}`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative group min-w-[300px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="ค้นหาข้อมูล..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full h-12 pl-12 pr-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all shadow-sm"
          />
        </div>
      </div>

      {/* ── Business Rules Tab ───────────────────────────────── */}
      {activeTab === 'rules' ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">

          {/* Backward Compatibility Notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-4">
            <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-black text-amber-800 text-sm">หมายเหตุสำหรับทีมงาน — การปรับ Priority/SLA Rules</p>
              <p className="text-amber-700 text-sm mt-1 leading-relaxed">
                การแก้ไขหลักการ Priority และ SLA <strong>จะมีผลเฉพาะกับ Ticket ที่เปิดใหม่</strong> หลังจากวันที่อัปเดตเท่านั้น
                Ticket เก่าที่มี <code className="bg-amber-100 px-1 rounded text-xs">sla_due_at</code> อยู่แล้วจะไม่ถูกเปลี่ยนแปลง
                เพราะ SLA Trigger ทำงานเฉพาะตอนสร้าง Ticket ใหม่ (INSERT) หรือเมื่อมีการเปลี่ยน priority เท่านั้น
              </p>
              <p className="text-amber-600 text-xs mt-2 font-bold">→ หากต้องการปรับให้แจ้ง Dev Team เพื่ออัปเดต DB Trigger Function: <code className="bg-amber-100 px-1 rounded">trg_calculate_sla()</code> และ Client Function: <code className="bg-amber-100 px-1 rounded">calculatePriority()</code> พร้อมกัน</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

            {/* Priority Decision Matrix */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                <TrendingUp size={18} className="text-primary" />
                <div>
                  <h3 className="font-black text-slate-800">Priority Decision Matrix</h3>
                  <p className="text-xs text-slate-500 mt-0.5">ระบบกำหนด Priority อัตโนมัติตอนเปิด Ticket</p>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {[
                  {
                    priority: 'Critical',
                    color: 'bg-red-500',
                    textColor: 'text-red-700',
                    bgColor: 'bg-red-50 border-red-100',
                    rules: [
                      'Sub-category: Blackout (ไฟดับทั้งหมด)',
                      'Sub-category: Safety: Fire (เพลิงไหม้)',
                      'Power: บริษัทที่ได้รับผลกระทบ ≥ 5 แห่ง',
                      'Power: รัศมีผลกระทบ ≥ 1,000 เมตร',
                    ]
                  },
                  {
                    priority: 'High',
                    color: 'bg-orange-500',
                    textColor: 'text-orange-700',
                    bgColor: 'bg-orange-50 border-orange-100',
                    rules: [
                      'Sub-category: No Water (น้ำไม่ไหล)',
                      'Sub-category: Animal Fault (สัตว์รบกวน)',
                      'Sub-category: Waste Water Treatment',
                      'Power: บริษัทที่ได้รับผลกระทบ ≥ 2 แห่ง',
                      'Power: รัศมีผลกระทบ ≥ 300 เมตร',
                      'Water Supply: Pipe Leakage (ท่อแตก)',
                    ]
                  },
                  {
                    priority: 'Medium',
                    color: 'bg-amber-500',
                    textColor: 'text-amber-700',
                    bgColor: 'bg-amber-50 border-amber-100',
                    rules: [
                      'Sub-category: Voltage Drop (ไฟตก)',
                      'Sub-category: Slowly Water Flowing (น้ำไหลช้า)',
                      'Sub-category: Water Quality (คุณภาพน้ำ)',
                      'Sub-category: Road / Drainage (ถนน/ระบบระบายน้ำ)',
                      'Power: กรณีอื่นๆ ที่ไม่ตรงเงื่อนไขข้างต้น (Default)',
                    ]
                  },
                  {
                    priority: 'Low',
                    color: 'bg-slate-400',
                    textColor: 'text-slate-600',
                    bgColor: 'bg-slate-50 border-slate-100',
                    rules: [
                      'ทุก Category/Sub-category อื่นๆ ที่ไม่ตรงเงื่อนไขข้างต้น',
                      'Facility, General Request, ฯลฯ',
                    ]
                  },
                ].map((item) => (
                  <div key={item.priority} className={`p-4 border-l-4 ${item.bgColor}`} style={{borderLeftColor: ''}}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                      <span className={`text-sm font-black uppercase tracking-wider ${item.textColor}`}>{item.priority}</span>
                    </div>
                    <ul className="space-y-1">
                      {item.rules.map((rule, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                          <span className="text-slate-400 mt-0.5 shrink-0">·</span>
                          {rule}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* SLA Hours Table */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                  <Clock size={18} className="text-primary" />
                  <div>
                    <h3 className="font-black text-slate-800">SLA Countdown (DB Trigger)</h3>
                    <p className="text-xs text-slate-500 mt-0.5">เวลา SLA คำนวณจาก created_at ของ Ticket</p>
                  </div>
                </div>
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Priority</th>
                      <th className="px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">SLA เวลา</th>
                      <th className="px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {[
                      { p: 'Critical', hours: '4 ชั่วโมง', note: 'ต้องตอบสนองทันที', color: 'text-red-600 bg-red-50', dot: 'bg-red-500' },
                      { p: 'High',     hours: '12 ชั่วโมง', note: 'ก่อนสิ้นวันทำการ', color: 'text-orange-600 bg-orange-50', dot: 'bg-orange-500' },
                      { p: 'Medium',   hours: '24 ชั่วโมง', note: 'ภายใน 1 วัน', color: 'text-amber-600 bg-amber-50', dot: 'bg-amber-500' },
                      { p: 'Low',      hours: 'ไม่มี SLA', note: 'Best effort basis', color: 'text-slate-500 bg-slate-50', dot: 'bg-slate-300' },
                    ].map((row) => (
                      <tr key={row.p} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3">
                          <span className={`flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-full w-fit ${row.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${row.dot}`} />
                            {row.p}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-black text-slate-800 text-sm">{row.hours}</td>
                        <td className="px-5 py-3 text-xs text-slate-500">{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="p-4 bg-blue-50 border-t border-blue-100">
                  <p className="text-xs text-blue-700 font-bold flex items-start gap-1.5">
                    <Info size={13} className="mt-0.5 shrink-0" />
                    SLA นับเวลาแบบ Calendar Hours (24/7) ยังไม่รองรับ Business Hours
                    — หากต้องการให้หยุดนับช่วงกลางคืน/วันหยุด แจ้ง Dev เพื่อปรับ Trigger
                  </p>
                </div>
              </div>

              {/* Where it's calculated */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h4 className="font-black text-slate-700 text-sm mb-3 flex items-center gap-2">
                  <BookOpen size={16} className="text-slate-400" />
                  Logic อยู่ที่ไหนในระบบ
                </h4>
                <div className="space-y-3">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Priority (Client-side)</p>
                    <code className="text-xs text-primary font-mono">TicketList.tsx → calculatePriority()</code>
                    <p className="text-xs text-slate-500 mt-1">คำนวณ Priority ณ เวลาสร้าง Ticket ก่อน Submit ไป DB</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1">SLA (DB Trigger)</p>
                    <code className="text-xs text-primary font-mono">trg_calculate_sla() → trg_set_sla</code>
                    <p className="text-xs text-slate-500 mt-1">Trigger ทำงานอัตโนมัติหลัง INSERT และเมื่อ priority เปลี่ยน</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">ข้อมูลรายการ</th>
                {['sub_categories', 'templates'].includes(activeTab) && <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">หมวดหมู่หลัก</th>}
                {activeTab === 'teams' && (
                  <>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">บทบาท & พื้นที่</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">ความเชี่ยวชาญ & ติดต่อ</th>
                  </>
                )}
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">เครื่องมือ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                      <span className="text-sm font-black text-slate-400 animate-pulse uppercase tracking-widest">กำลังดึงข้อมูล...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-2 opacity-30">
                      <Search size={48} className="mb-2 text-slate-400" />
                      <p className="text-lg font-black text-slate-500">ไม่พบข้อมูลที่ค้นหา</p>
                      <p className="text-sm font-medium text-slate-400">ลองใช้คำค้นหาอื่น หรือตรวจสอบแท็บที่เลือก</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedData.map((item: any) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-black text-slate-800 leading-snug">
                          {activeTab === 'templates' ? (
                            <span className="line-clamp-2 italic font-medium">"{item.template_text}"</span>
                          ) : item.name}
                        </span>
                        {activeTab === 'templates' && item.name && (
                          <span className="text-[10px] font-black text-primary uppercase">{item.name}</span>
                        )}
                      </div>
                    </td>
                    {['sub_categories', 'templates'].includes(activeTab) && (
                      <td className="px-8 py-5">
                        {(() => {
                          const cat = data.categories.find(c => c.id === item.category_id);
                          const colorClass = cat ? (categoryColors[cat.name as TicketCategory] || 'bg-indigo-50 text-indigo-600 border-indigo-100/50') : 'bg-slate-50 text-slate-600 border-slate-100/50';
                          return (
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-black rounded-lg uppercase border ${colorClass}`}>
                              {cat?.name === 'Power' && <Zap size={12} className="fill-amber-500 text-amber-500" />}
                              {cat?.name === 'Water Supply' && <Droplets size={12} className="fill-sky-500 text-sky-500" />}
                              {cat?.name === 'Facility' && <Building2 size={12} className="fill-indigo-500 text-indigo-500" />}
                              {cat?.name || 'Unknown'}
                            </span>
                          );
                        })()}
                      </td>
                    )}
                    {activeTab === 'teams' && (
                      <>
                        <td className="px-8 py-5">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">{item.role_label || '-'}</span>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{item.area || '-'}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">{item.specialty || '-'}</span>
                            <span className="text-[10px] font-black text-primary uppercase tracking-tighter">{formatPhoneNumber(item.phone) || '-'}</span>
                          </div>
                        </td>
                      </>
                    )}
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => {
                            setEditingItem(item);
                            setFormData(item);
                            setModalOpen(true);
                          }}
                          className="p-2.5 text-slate-400 hover:text-primary hover:bg-white rounded-xl shadow-sm transition-all border border-transparent hover:border-slate-100"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-white rounded-xl shadow-sm transition-all border border-transparent hover:border-slate-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="px-8 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500">
              Showing <span className="text-slate-900">{(currentPage - 1) * pageSize + 1}</span> to <span className="text-slate-900">{Math.min(currentPage * pageSize, filteredData.length)}</span> of <span className="text-slate-900">{filteredData.length}</span> entries
            </p>
            <div className="flex items-center gap-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => prev - 1)}
                className="p-2 rounded-lg hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 disabled:opacity-30 transition-all"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="flex gap-1">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${currentPage === i + 1 ? 'bg-primary text-white shadow-md' : 'hover:bg-white text-slate-500'}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="p-2 rounded-lg hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 disabled:opacity-30 transition-all"
              >
                <ArrowRight size={18} className="rotate-[-45deg] group-hover:rotate-0 transition-transform" />
              </button>
            </div>
          </div>
        )}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 border border-white/20">
            <div className="p-10 space-y-8">
              <header className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                    {editingItem ? 'แก้ไขข้อมูล' : 'เพิ่มรายการใหม่'}
                  </h2>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                    {activeTab.replace('_', ' ')} Registry
                  </p>
                </div>
                <button onClick={() => setModalOpen(false)} className="p-3 text-slate-400 hover:bg-slate-50 rounded-2xl transition-colors">
                  <X size={20} />
                </button>
              </header>

              <div className="space-y-6">
                {activeTab === 'teams' && !editingItem && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Team Code (ID)</label>
                    <input 
                      type="text" 
                      value={formData.id || ''} 
                      onChange={e => setFormData({ ...formData, id: e.target.value.toUpperCase() })}
                      className="w-full h-14 bg-slate-50 border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-2xl px-5 text-sm font-bold transition-all outline-none"
                      placeholder="เช่น AIS, FIRE, WATER"
                    />
                  </div>
                )}
                {['sub_categories', 'templates'].includes(activeTab) && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Parent Category</label>
                    <div className="relative">
                      <select 
                        value={formData.category_id || ''} 
                        onChange={e => setFormData({ ...formData, category_id: e.target.value })}
                        className="w-full h-14 bg-slate-50 border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-2xl px-5 text-sm font-bold transition-all outline-none appearance-none"
                      >
                        <option value="">เลือกหมวดหมู่หลัก</option>
                        {data.categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <ChevronRight size={18} className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    {activeTab === 'templates' ? 'Template Text' : 'Name'}
                  </label>
                  {activeTab === 'templates' ? (
                    <textarea 
                      value={formData.template_text || ''} 
                      onChange={e => setFormData({ ...formData, template_text: e.target.value })}
                      rows={4}
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-2xl p-5 text-sm font-bold transition-all outline-none resize-none"
                      placeholder="กรอกข้อความที่ต้องการใช้ตอบ..."
                    />
                  ) : (
                    <input 
                      type="text" 
                      value={formData.name || ''} 
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className="w-full h-14 bg-slate-50 border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-2xl px-5 text-sm font-bold transition-all outline-none"
                      placeholder={activeTab === 'teams' ? 'เช่น Area Inspector (AIS)' : 'กรอกชื่อ...'}
                    />
                  )}
                </div>

                {activeTab === 'teams' && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Role Label (ชื่อทีมภาษาไทย)</label>
                      <input 
                        type="text" 
                        value={formData.role_label || ''} 
                        onChange={e => setFormData({ ...formData, role_label: e.target.value })}
                        className="w-full h-14 bg-slate-50 border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-2xl px-5 text-sm font-bold transition-all outline-none"
                        placeholder="เช่น ทีมตรวจสอบพื้นที่"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Area</label>
                        <input 
                          type="text" 
                          value={formData.area || ''} 
                          onChange={e => setFormData({ ...formData, area: e.target.value })}
                          className="w-full h-14 bg-slate-50 border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-2xl px-5 text-sm font-bold transition-all outline-none"
                          placeholder="เช่น IP7 Phase 5"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone Number</label>
                        <input 
                          type="text" 
                          value={formData.phone || ''} 
                          onChange={e => setFormData({ ...formData, phone: formatPhoneNumber(e.target.value) })}
                          className="w-full h-14 bg-slate-50 border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-2xl px-5 text-sm font-bold transition-all outline-none"
                          placeholder="เช่น 038-304-201"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Specialty (ความเชี่ยวชาญ / หมวดหมู่ที่รับผิดชอบ)</label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {data.categories.map((cat: any) => {
                          const selectedSpecialties = formData.specialty ? formData.specialty.split(',').map((s: string) => s.trim()) : [];
                          const isChecked = selectedSpecialties.includes(cat.name);
                          return (
                            <label key={cat.id} className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer bg-white">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData({ ...formData, specialty: [...selectedSpecialties, cat.name].join(', ') });
                                  } else {
                                    setFormData({ ...formData, specialty: selectedSpecialties.filter((s: string) => s !== cat.name).join(', ') });
                                  }
                                }}
                                className="w-4 h-4 text-primary rounded border-slate-300 focus:ring-primary"
                              />
                              <span className="text-sm font-bold text-slate-700">{cat.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <footer className="flex gap-4 pt-4">
                <button 
                  onClick={() => setModalOpen(false)} 
                  className="flex-1 h-14 rounded-2xl text-sm font-black text-slate-400 hover:bg-slate-50 transition-all uppercase tracking-widest"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={handleSave} 
                  className="flex-[2] h-14 bg-primary text-white rounded-2xl text-sm font-black shadow-xl shadow-primary/20 hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                >
                  <Save size={20} />
                  บันทึกข้อมูล
                </button>
              </footer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
