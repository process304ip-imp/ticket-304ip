import React, { useMemo, useState, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import {
  Camera,
  CheckCircle,
  Clock,
  Edit3,
  ExternalLink,
  FileText,
  LogIn,
  MapPin,
  MessageSquare,
  Paperclip,
  Phone,
  Send,
  Star,
  X,
  Crosshair
} from 'lucide-react';
import { MapContainer, Marker, TileLayer, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Notification } from '../App';
import { api, Ticket, TicketLog, Company, ResponseTeam } from '../lib/api';
import { statusColors } from '../data';
import { Loader2 } from 'lucide-react';
import { Role } from '../App';
import { useToast } from './Toast';
import { useAuth } from '../hooks/useAuth';

const detailPin = L.divIcon({
  className: 'custom-pin',
  html: `<div style="color:#001e40;width:28px;height:28px;transform:translate(-14px,-28px)">
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="white" stroke-width="2"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3" fill="white"/></svg>
  </div>`,
  iconSize: [0, 0],
});

interface TicketDetailsProps {
  ticketId: string | null;
  role: Role;
  onAddNotification: (title: string, message: string, type?: Notification['type']) => void;
}

export function TicketDetails({ ticketId, role, onAddNotification }: TicketDetailsProps) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [teams, setTeams] = useState<ResponseTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'details' | 'logs'>('logs');
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [logText, setLogText] = useState('');
  const [feedback, setFeedback] = useState({ score: 0, comment: '' });
  const [localLogs, setLocalLogs] = useState<TicketLog[]>([]);
  
  const [isUploading, setIsUploading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isInternalLog, setIsInternalLog] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const isTechnician = role === 'technician';
  const isCustomer = role === 'customer';
  const { toast, confirm } = useToast();
  const { user, profile } = useAuth();

  const fetchData = async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const [tData, cData, teamsData] = await Promise.all([
        api.tickets.get(ticketId),
        api.companies.list(),
        api.teams.list()
      ]);
      setTicket(tData as any);
      // Sort logs newest-first (safe against null / invalid dates)
      const logs = (tData.ticket_logs || [])
        .filter((l: any) => role !== 'customer' || !l.is_internal)
        .sort((a: any, b: any) => {
            const ta = a.timestamp ? new Date(a.timestamp.replace(' ', 'T')).getTime() : 0;
            const tb = b.timestamp ? new Date(b.timestamp.replace(' ', 'T')).getTime() : 0;
            return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
          });
      setLocalLogs(logs as any);
      setCompanies(cData);
      setTeams(teamsData);
    } catch (error) {
      console.error('Error fetching ticket details:', error);
      onAddNotification('Error', 'ไม่สามารถดึงข้อมูล Ticket ได้', 'system');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
    
    if (ticketId) {
      const logsSub = api.tickets.subscribeLogs(ticketId, () => {
        fetchData();
      });
      
      // Subscribe to the ticket itself to catch status/assignee changes
      const ticketSub = api.tickets.subscribe(() => {
        fetchData();
      });

      return () => {
        logsSub.unsubscribe();
        ticketSub.unsubscribe();
      };
    }
  }, [ticketId]);

  const handleStatusUpdate = async (newStatus: string, skipConfirm = false) => {
    if (!ticket) return;

    if (!skipConfirm) {
      const actionLabel: Record<string, string> = {
        'In Progress': 'รับงาน / Check-in',
        'Resolved': 'Mark Resolved',
        'Closed': 'ปิดงาน',
      };
      const ok = await confirm({
        title: `ยืนยัน: ${actionLabel[newStatus] || newStatus}`,
        message: `เปลี่ยนสถานะ Ticket ${ticket.id} เป็น "${newStatus}" ใช่ไหม?`,
        confirmLabel: actionLabel[newStatus] || 'ยืนยัน',
        danger: newStatus === 'Closed',
      });
      if (!ok) return;
    }

    try {
      if (newStatus === 'Closed') {
        await api.tickets.closeWithTeamRelease(ticket.id);
      } else {
        await api.tickets.update(ticket.id, { status: newStatus }, {
          name: profile?.full_name || 'Staff',
          role: role,
          id: user?.id
        });
      }
      onAddNotification('อัปเดตสถานะสำเร็จ', `${ticket.id}: เปลี่ยนเป็น ${newStatus} แล้ว`, 'update');
      toast.success('อัปเดตสถานะสำเร็จ', `${ticket.id} → ${newStatus}`);
      fetchData();
    } catch (error) {
      toast.error('ไม่สามารถอัปเดตสถานะได้', 'กรุณาลองใหม่อีกครั้ง');
      onAddNotification('Error', 'ไม่สามารถอัปเดตสถานะได้', 'system');
    }
  };

  const handleSelfAssign = async () => {
    if (!ticket) return;
    const ok = await confirm({
      title: 'รับงาน (Self-Assign)',
      message: `คุณต้องการรับผิดชอบ Ticket ${ticket.id} นี้ใช่หรือไม่?`,
      confirmLabel: 'รับงาน',
    });
    if (!ok) return;

    try {
      const myName = profile?.full_name || user?.email || 'Technician';
      await api.tickets.assign(ticket.id, myName, role, '', {
        name: myName,
        role: role,
        id: user?.id
      });
      // Also set to In Progress if it was Open
      if (ticket.status === 'Open') {
        await api.tickets.update(ticket.id, { status: 'In Progress' }, {
          name: myName,
          role: role,
          id: user?.id
        });
      }
      toast.success('รับงานสำเร็จ', `คุณได้รับผิดชอบ Ticket ${ticket.id} แล้ว`);
      fetchData();
    } catch (error) {
      toast.error('ไม่สามารถรับงานได้', 'กรุณาลองใหม่อีกครั้ง');
    }
  };

  const handleAssignTeam = async (teamName: string) => {
    if (!ticket) return;
    const ok = await confirm({
      title: 'ยืนยันการมอบหมายงาน',
      message: `ต้องการมอบหมายงานให้ทีม ${teamName} ใช่หรือไม่?`,
      confirmLabel: 'ยืนยัน',
    });
    if (!ok) return;

    try {
      await api.tickets.assign(ticket.id, teamName, role, '', {
        name: profile?.full_name || 'Staff',
        role: role,
        id: user?.id
      });
      toast.success('Assigned', `มอบหมายงานให้ทีม ${teamName} แล้ว`);
      setIsAssignModalOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error assigning team:', error);
      toast.error('Error', 'ไม่สามารถมอบหมายงานได้');
    }
  };

  const handleAddLog = async () => {
    if (!logText.trim() || !ticket) return;
    try {
      setIsUploading(true);
      let mediaUrls: string[] = [];

      if (attachedFiles.length > 0) {
        const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
        for (const file of attachedFiles) {
          const compressedFile = await imageCompression(file, options);
          const url = await api.storage.uploadAttachment(ticket.id, compressedFile);
          mediaUrls.push(url);
        }
      }

      await api.tickets.addLog({
        ticket_id: ticket.id,
        message: logText,
        author_name: profile?.full_name || (role === 'technician' ? (ticket.assignee || 'Technician') : 'User'),
        author_id: user?.id || null,
        author_role: role as any,
        status_from: ticket.status,
        status_to: ticket.status,
        media_urls: mediaUrls,
        is_internal: isInternalLog
      });
      setLogText('');
      setAttachedFiles([]);
      setIsInternalLog(false);
      setIsLogModalOpen(false);
      toast.success('บันทึก Log สำเร็จ', `เพิ่ม Log ให้ ${ticket.id} เรียบร้อยแล้ว`);
      onAddNotification('เพิ่ม Log สำเร็จ', `${ticket.id}: บันทึกเหตุการณ์เรียบร้อยแล้ว`, 'update');
      fetchData();
    } catch (error) {
      toast.error('ไม่สามารถบันทึก Log ได้', 'กรุณาลองใหม่อีกครั้ง');
      onAddNotification('Error', 'ไม่สามารถบันทึก Log ได้', 'system');
    } finally {
      setIsUploading(false);
    }
  };

  const submitFeedback = async () => {
    if (!feedback.score || !ticket) {
      toast.warning('กรุณาให้คะแนนก่อน', 'กรุณาเลือกดาวก่อนส่ง Feedback');
      return;
    }
    try {
      setLoading(true);
      // 1. Insert Feedback while ticket is still Resolved for RLS validation
      await api.tickets.addFeedback({
        ticket_id: ticket.id,
        score: feedback.score,
        comment: feedback.comment || '',
        submitted_by: user?.id || null
      });

      // 2. Update status to Closed
      await api.tickets.closeWithTeamRelease(ticket.id);

      // 3. Add Log
      await api.tickets.addLog({
        ticket_id: ticket.id,
        message: `ลูกค้าให้ Feedback (${feedback.score} ดาว): ${feedback.comment || '-'}`,
        author_name: profile?.full_name || 'Customer',
        author_id: user?.id || null,
        author_role: 'customer',
        status_from: 'Resolved',
        status_to: 'Closed'
      });

      setIsFeedbackModalOpen(false);
      toast.success('ขอบคุณสำหรับ Feedback!', 'ปิดงานเรียบร้อยแล้ว');
      onAddNotification('ปิดงานสำเร็จ', 'ขอบคุณสำหรับ Feedback ครับ', 'system');
      fetchData();
    } catch (error) {
      console.error('Feedback error:', error);
      toast.error('ไม่สามารถส่ง feedback ได้', 'กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setAttachedFiles(prev => [...prev, ...files].slice(0, 2));
    }
  };

  if (loading || !ticket) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500">
        <Loader2 className="animate-spin mb-4 text-primary" size={48} />
        <p className="font-bold animate-pulse">กำลังดึงข้อมูล Ticket...</p>
      </div>
    );
  }

  const affectedCompanies = companies.filter((company) => 
    ticket.ticket_affected_companies?.some(ac => ac.company_id === company.id)
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <section className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="font-mono text-xs font-black text-primary">{ticket.id}</span>
            <span className={`px-2 py-1 rounded-full text-[10px] font-black ${statusColors[ticket.status as any]}`}>{ticket.status}</span>
            <span className="px-2 py-1 rounded-full text-[10px] font-black bg-slate-100 text-slate-700">{ticket.category}</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-primary tracking-tight">{ticket.sub_category}</h2>
          <p className="text-sm text-slate-500 mt-2">{ticket.companies?.name || ticket.company_name} • {ticket.area} • {ticket.location_text}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isTechnician && ticket.status === 'Open' && (
            <button onClick={() => handleStatusUpdate('In Progress')} className="action-primary">
              <LogIn size={16} />
              รับงาน / Check-in
            </button>
          )}
          
          {/* Display Feedback Summary if closed */}
          {ticket.status === 'Closed' && (ticket as any).ticket_feedback && (ticket as any).ticket_feedback.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex flex-col md:flex-row md:items-center gap-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-500">
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star 
                      key={star} 
                      size={18} 
                      className={star <= (ticket as any).ticket_feedback[0].score ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} 
                    />
                  ))}
                </div>
                <span className="text-sm font-black text-amber-900">{(ticket as any).ticket_feedback[0].score}/5</span>
              </div>
              <div className="flex-1">
                <p className="text-xs font-black text-amber-700 uppercase tracking-tighter">Customer Satisfaction</p>
                <p className="text-sm text-amber-900 font-medium italic">"{(ticket as any).ticket_feedback[0].comment || 'ไม่มีข้อความเพิ่มเติม'}"</p>
              </div>
            </div>
          )}

          {(role === 'technician' || role === 'crm' || role === 'admin') && ticket.status !== 'Closed' && (
            <button onClick={() => setIsLogModalOpen(true)} className="action-secondary">
              <Edit3 size={16} />
              Add Log
            </button>
          )}
          {isTechnician && ticket.status !== 'Resolved' && ticket.status !== 'Closed' && (
            <button onClick={() => handleStatusUpdate('Resolved')} className="action-success">
              <CheckCircle size={16} />
              Mark Resolved
            </button>
          )}
          {isCustomer && ticket.status === 'Resolved' && (
            <button onClick={() => setIsFeedbackModalOpen(true)} className="action-primary bg-indigo-600 hover:bg-indigo-700">
              <Star size={16} className="fill-white" />
              ให้ Feedback และปิดงาน
            </button>
          )}
        </div>
      </section>

      <section className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3 text-indigo-900">
          <div className="shrink-0 p-2 bg-indigo-100 rounded-lg">
            <Crosshair size={20} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-0.5">ทีมรับผิดชอบ (Assignee)</p>
            <p className="font-black text-base">{ticket.assignee || 'ยังไม่มีการมอบหมาย'}</p>
          </div>
        </div>
        
        {(role === 'crm' || role === 'admin') && ticket.status !== 'Closed' && (
          <div className="shrink-0 w-full sm:w-auto">
            <button
              onClick={() => setIsAssignModalOpen(true)}
              className="text-sm font-black py-2 px-4 border border-indigo-200 rounded-lg bg-white text-indigo-700 hover:bg-indigo-50 transition-colors w-full sm:w-auto"
            >
              {ticket.assignee ? 'เปลี่ยนทีมรับผิดชอบ' : 'เลือกทีมมอบหมาย'}
            </button>
          </div>
        )}

        {role === 'technician' && !ticket.assignee && ticket.status === 'Open' && (
          <div className="shrink-0 w-full sm:w-auto">
            <button
              onClick={handleSelfAssign}
              className="text-sm font-black py-2 px-6 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md transition-all w-full sm:w-auto flex items-center justify-center gap-2"
            >
              <LogIn size={16} />
              รับงาน (Self-Assign)
            </button>
          </div>
        )}
      </section>

      {ticket.status === 'Closed' && (
        <section className="bg-slate-100 border border-slate-300 rounded-xl px-5 py-3 flex items-center gap-3 text-slate-600">
          <span className="text-lg">🔒</span>
          <div>
            <p className="font-black text-base text-slate-700">Ticket ปิดแล้ว (Read-only)</p>
            <p className="text-sm text-slate-500">ไม่สามารถแก้ไขหรือเพิ่ม Log ได้อีก — หากต้องการดำเนินการต่อกรุณาเปิด Ticket ใหม่</p>
          </div>
        </section>
      )}

      {ticket.status === 'Resolved' && (
        <section className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="font-black text-emerald-800">งานถูก Resolved แล้ว</h3>
            <p className="text-sm text-emerald-700 mt-1">รอ feedback ลูกค้า หรือระบบจะ auto-close ภายใน 48 ชั่วโมง: {safeDate(ticket.auto_close_at)}</p>
          </div>
          {role !== 'customer' && (
            <button
              onClick={async () => {
                const ok = await confirm({
                  title: 'ปิดงานแทนลูกค้า',
                  message: `ยืนยันปิดงาน ${ticket?.id} โดยไม่รออยู่ feedback จากลูกค้า?`,
                  confirmLabel: 'ปิดงาน',
                  danger: true,
                });
                if (ok) handleStatusUpdate('Closed', true);
              }}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold"
            >
              ปิดงานแทนลูกค้า
            </button>
          )}
        </section>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex border-b border-slate-200">
              <button onClick={() => setActiveTab('logs')} className={`px-5 py-3 text-sm font-black border-b-2 ${activeTab === 'logs' ? 'border-primary text-primary' : 'border-transparent text-slate-500'}`}>
                รายละเอียดและ Log
              </button>
              <button onClick={() => setActiveTab('details')} className={`px-5 py-3 text-sm font-black border-b-2 ${activeTab === 'details' ? 'border-primary text-primary' : 'border-transparent text-slate-500'}`}>
                บริษัทที่ได้รับผลกระทบ
              </button>
            </div>

            <div className="p-5 md:p-6 space-y-8">
              {/* Core Details - Always visible or in first tab */}
              {activeTab === 'logs' && (
                <>
                  <div className="bg-slate-50 border-l-4 border-primary rounded-r-xl p-6">
                    <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-2 opacity-70">รายละเอียดปัญหา / หมายเหตุ</h3>
                    <p className="text-slate-800 leading-relaxed font-bold text-lg">{ticket.description || 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <InfoBlock label="Area / พื้นที่" value={ticket.area || '-'} />
                    <InfoBlock label="Location / ตำแหน่ง" value={ticket.location_text || '-'} />
                    <InfoBlock label="Service Type / ประเภท" value={ticket.type || '-'} />
                    <InfoBlock label="Channel / ช่องทาง" value={ticket.channel || '-'} />
                    <InfoBlock label="Contact / ผู้ติดต่อ" value={ticket.contact_name || '-'} />
                    <InfoBlock label="Phone / เบอร์ติดต่อ" value={ticket.contact_phone || '-'} />
                    <InfoBlock label="Created / วันที่สร้าง" value={safeDate(ticket.created_at)} />
                    <InfoBlock label="Duration / ระยะเวลา" value={ticket.duration_min ? `${ticket.duration_min} นาที` : '-'} />
                    <InfoBlock label="Impact / รัศมี" value={ticket.impact_radius_meters ? `${ticket.impact_radius_meters.toLocaleString()} เมตร` : '-'} />
                  </div>
                </>
              )}

              {activeTab === 'logs' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-black text-primary">บันทึกเหตุการณ์นาทีต่อนาที</h3>
                      <p className="text-xs text-slate-500 mt-1">ใช้สำหรับเคส Facility เช่น ไฟไหม้ น้ำเสียล้น หรือการเรียกรถดับเพลิง</p>
                    </div>
                    {(role === 'technician' || role === 'crm' || role === 'admin') && ticket.status !== 'Closed' && (
                      <button onClick={() => setIsLogModalOpen(true)} className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-black flex items-center gap-2">
                        <Edit3 size={14} />
                        Add Log
                      </button>
                    )}
                  </div>
                  
                  <div className="space-y-4">
                    {localLogs.length === 0 ? (
                      <p className="text-center py-10 text-slate-400 text-sm">ยังไม่มีบันทึกเหตุการณ์</p>
                    ) : localLogs.map((log, index) => (
                      <div key={log.id} className="flex gap-4 relative">
                        {index < localLogs.length - 1 && <div className="absolute left-[13px] top-8 bottom-[-18px] w-0.5 bg-slate-200" />}
                        <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center shrink-0 z-10">
                          <Clock size={14} />
                        </div>
                        <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-4">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <p className="font-black text-slate-900 text-sm">{log.author_name}</p>
                              {log.is_internal && (
                                <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-1.5 py-0.5 rounded uppercase">Internal</span>
                              )}
                            </div>
                            <span className="font-mono text-[11px] text-slate-500 bg-white border border-slate-200 rounded px-2 py-1">
                              {safeDate(log.timestamp)}
                            </span>
                          </div>
                          <p className={`text-sm leading-relaxed ${log.is_internal ? 'text-amber-900 italic' : 'text-slate-700'}`}>{log.message}</p>
                          {log.media_urls && log.media_urls.length > 0 && (
                            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {log.media_urls.map((url, i) => (
                                <button 
                                  key={i} 
                                  onClick={() => setSelectedImage(url)}
                                  className="group relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-white hover:ring-2 hover:ring-primary transition-all shadow-sm text-left"
                                >
                                  <img 
                                    src={url} 
                                    alt="Attachment" 
                                    className="w-full h-full object-cover transition-transform group-hover:scale-110" 
                                  />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                                    <ExternalLink size={16} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {affectedCompanies.length > 0 ? (
                    <div className="bg-red-50 border border-red-100 rounded-xl p-6">
                      <h4 className="text-sm font-black text-red-800 mb-4">บริษัทที่ได้รับผลกระทบจากเหตุการณ์นี้</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {affectedCompanies.map((company) => (
                          <div key={company.id} className="bg-white border border-red-100 rounded-lg p-3 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-red-50 text-red-600 flex items-center justify-center font-black text-xs shrink-0">
                              {company.name.charAt(0)}
                            </div>
                            <span className="text-sm font-bold text-slate-700 truncate">
                              {company.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-20 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <p className="text-slate-400 font-medium">ไม่ระบุบริษัทที่ได้รับผลกระทบ</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {isTechnician && ticket.status !== 'Closed' && (
            <div className="grid grid-cols-2 gap-4 md:hidden">
              <button onClick={() => setIsLogModalOpen(true)} className="bg-primary text-white p-5 rounded-xl flex flex-col items-center gap-3 font-black">
                <Edit3 size={26} />
                Add Log
              </button>
              <button className="bg-slate-200 text-primary p-5 rounded-xl flex flex-col items-center gap-3 font-black">
                <Camera size={26} />
                Upload Result
              </button>
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h4 className="text-xs font-black text-slate-400 uppercase mb-4">ผู้ประสานงาน</h4>
            <p className="font-black text-slate-900">{ticket.contact_name || 'ไม่ระบุ'}</p>
            <div className="flex items-center gap-2 text-sm text-slate-600 mt-2">
              <Phone size={15} />
              {ticket.contact_phone || 'ไม่ระบุ'}
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h4 className="text-xs font-black text-slate-400 uppercase mb-3">ตำแหน่งหน้างาน</h4>
            <div className="h-44 rounded-xl overflow-hidden border border-slate-200 mb-3">
              <MapContainer
                center={[Number(ticket.lat), Number(ticket.lng)] as L.LatLngExpression}
                zoom={15}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
                scrollWheelZoom={false}
                dragging={false}
                attributionControl={false}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={[Number(ticket.lat), Number(ticket.lng)] as L.LatLngExpression} icon={detailPin} />
                {ticket.impact_radius_meters && (
                  <Circle
                    center={[Number(ticket.lat), Number(ticket.lng)] as L.LatLngExpression}
                    radius={ticket.impact_radius_meters}
                    pathOptions={{ color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.1, weight: 2 }}
                  />
                )}
              </MapContainer>
            </div>
            <p className="text-sm font-bold text-slate-800">{ticket.location_text}</p>
            <p className="text-xs text-slate-500 mt-1 font-mono">{ticket.lat}, {ticket.lng}</p>
            <a
              href={`https://www.google.com/maps?q=${ticket.lat},${ticket.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
            >
              <ExternalLink size={13} />
              เปิดใน Google Maps
            </a>
          </div>

          <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
            <h4 className="text-xs font-black text-slate-400 uppercase mb-4">สถานะ Workflow</h4>
            {['Open', 'In Progress', 'Resolved', 'Closed'].map((step) => {
              const complete = ['Open', 'In Progress', 'Resolved', 'Closed'].indexOf(step) <= ['Open', 'In Progress', 'Resolved', 'Closed'].indexOf(ticket.status);
              return (
                <div key={step} className="flex items-center gap-3 py-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${complete ? 'bg-primary text-white' : 'bg-slate-200 text-slate-400'}`}>
                    <CheckCircle size={13} />
                  </div>
                  <span className={`text-sm font-bold ${complete ? 'text-slate-900' : 'text-slate-400'}`}>{step}</span>
                </div>
              );
            })}
          </div>
        </aside>
      </section>

      {isLogModalOpen && (
        <Modal title="Add Log พร้อม Timestamp" onClose={() => setIsLogModalOpen(false)}>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <p className="text-xs font-bold text-blue-800">ระบบจะจับเวลาปัจจุบันอัตโนมัติเมื่อกดบันทึก</p>
            </div>
            <textarea value={logText} onChange={(event) => setLogText(event.target.value)} rows={5} className="w-full form-field resize-none" placeholder="เช่น เวลา 18.28 น. ทีม Area Inspector ตรวจสอบพบว่า..." />
            
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <input type="file" accept="image/*" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                {attachedFiles.length < 2 && (
                  <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 transition-colors text-slate-700 rounded-lg text-xs font-bold flex items-center gap-2">
                    <Camera size={14} />
                    แนบรูปถ่าย {attachedFiles.length > 0 ? '(เพิ่ม)' : ''}
                  </button>
                )}
                
                {attachedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg">
                    <span className="text-[10px] font-bold text-slate-500 truncate max-w-[100px]">{file.name}</span>
                    <button onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-500">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {role !== 'customer' && (
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-10 h-5 rounded-full relative transition-colors ${isInternalLog ? 'bg-amber-500' : 'bg-slate-200'}`}>
                    <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${isInternalLog ? 'translate-x-5' : ''}`} />
                  </div>
                  <input type="checkbox" className="hidden" checked={isInternalLog} onChange={(e) => setIsInternalLog(e.target.checked)} />
                  <span className="text-xs font-black text-slate-600 group-hover:text-slate-900 transition-colors">Internal Note (ลูกค้ามองไม่เห็น)</span>
                </label>
              )}
            </div>

            <button onClick={handleAddLog} disabled={isUploading || !logText.trim()} className="w-full py-3 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              {isUploading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
              {isUploading ? 'กำลังอัปโหลดและบันทึก...' : 'บันทึก Log'}
            </button>
          </div>
        </Modal>
      )}

      {isFeedbackModalOpen && (
        <Modal title="Feedback ลูกค้า" onClose={() => setIsFeedbackModalOpen(false)}>
          <div className="space-y-5">
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((score) => (
                <button key={score} onClick={() => setFeedback({ ...feedback, score })} className="transition-transform hover:scale-110">
                  <Star size={34} className={score <= feedback.score ? 'fill-yellow-400 text-yellow-400' : 'text-slate-200'} />
                </button>
              ))}
            </div>
            <textarea value={feedback.comment} onChange={(event) => setFeedback({ ...feedback, comment: event.target.value })} rows={4} className="w-full form-field resize-none" placeholder="ความคิดเห็นเพิ่มเติม..." />
            <button onClick={submitFeedback} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2">
              <MessageSquare size={18} />
              ส่ง Feedback และ Closed
            </button>
          </div>
        </Modal>
      )}
      {/* ── Assign Team Modal ── */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <Crosshair size={18} className="text-primary" />
                เลือกทีมรับผิดชอบ
              </h3>
              <button onClick={() => setIsAssignModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
              {teams.length === 0 ? (
                <div className="text-center py-6 text-slate-500 font-bold text-sm">ไม่พบข้อมูลทีมรับผิดชอบ</div>
              ) : (
                teams.map(team => (
                  <button
                    key={team.id}
                    onClick={() => handleAssignTeam(team.name)}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-primary hover:bg-slate-50 transition-colors flex items-center justify-between"
                  >
                    <span className="font-black text-slate-700">{team.name}</span>
                    <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-md">Assign</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Image Lightbox ── */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={() => setSelectedImage(null)}
        >
          <button 
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-10"
            onClick={() => setSelectedImage(null)}
          >
            <X size={24} />
          </button>
          
          <div className="relative w-full max-w-5xl max-h-[90vh] flex items-center justify-center" onClick={e => e.stopPropagation()}>
            <img 
              src={selectedImage} 
              alt="Full view" 
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300" 
            />
            
            <a 
              href={selectedImage} 
              target="_blank" 
              rel="noopener noreferrer"
              className="absolute bottom-[-50px] left-1/2 -translate-x-1/2 flex items-center gap-2 text-white/70 hover:text-white text-sm font-bold transition-colors"
            >
              <ExternalLink size={16} />
              Open Original Image
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className="text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-primary" />
            <h3 className="text-lg font-black text-primary">{title}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** Format any Supabase/Postgres timestamp safely — returns '-' if invalid */
function safeDate(raw: string | null | undefined): string {
  if (!raw) return '-';
  // Postgres sometimes returns '2026-05-07 03:00:00+00' (space instead of T)
  const d = new Date(raw.replace(' ', 'T'));
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('th-TH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
