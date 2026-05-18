import React, { useMemo, useState, useEffect, useRef } from 'react';
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
  Crosshair,
  Video,
  PlayCircle,
  Search,
  Zap,
  Droplets,
  Building2,
  User,
  Activity,
  AlertCircle
} from 'lucide-react';
import { MapContainer, Marker, TileLayer, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Notification } from '../App';
import { api, Ticket, TicketLog, Company, ResponseTeam } from '../lib/api';
import { statusColors, categoryColors, TicketCategory } from '../data';
import { Loader2 } from 'lucide-react';
import { Role } from '../App';
import { useToast } from './Toast';
import { uploadToR2, uploadWithProgress, deleteFromR2, detectStorageProvider } from '../lib/r2-upload';
import { useAuth } from '../hooks/useAuth';
import { formatPhoneNumber } from '../lib/utils';

const detailPin = L.divIcon({
  className: 'custom-pin',
  html: `<div style="color:#001e40;width:28px;height:28px;transform:translate(-14px,-28px)">
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="white" stroke-width="2"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3" fill="white"/></svg>
  </div>`,
  iconSize: [0, 0],
});

/**
 * Helper to get duration of a video file in seconds
 */
const getVideoDuration = (file: File): Promise<number> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => {
      resolve(0); // If fails to load or not supported, return 0
    };
    video.src = URL.createObjectURL(file);
  });
};

interface TicketDetailsProps {
  ticketId: string | null;
  role: Role;
  onAddNotification: (title: string, message: string, type?: Notification['type']) => void;
}

export function TicketDetails({ ticketId, role, onAddNotification }: TicketDetailsProps) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [teams, setTeams] = useState<ResponseTeam[]>([]);
  const [quickTemplates, setQuickTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'logs' | 'details'>('logs');
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [logText, setLogText] = useState('');
  const [feedback, setFeedback] = useState({ 
    fixScore: 0, 
    serviceScore: 0, 
    fixComment: '', 
    serviceComment: '' 
  });
  const [localLogs, setLocalLogs] = useState<TicketLog[]>([]);
  
  // Custom draft attachment states for progressive pre-uploads
  const [logAttachments, setLogAttachments] = useState<{
    id: string;
    file: File;
    previewUrl: string;
    status: 'compressing' | 'uploading' | 'done' | 'error';
    progress: number;
    publicUrl?: string;
    error?: string;
  }[]>([]);
  const [logDraftId, setLogDraftId] = useState<string>('');
  const [isInternalLog, setIsInternalLog] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isLogModalOpen) {
      const now = new Date();
      const yy = String(now.getFullYear()).substring(2, 4);
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const randomStr = Math.random().toString(36).substring(2, 6);
      const generatedDraftId = `draft-${yy}${mm}${dd}-${randomStr}`;
      setLogDraftId(generatedDraftId);
      setLogAttachments([]);
    } else {
      // Cleanup previews when closing
      logAttachments.forEach(att => {
        if (att.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(att.previewUrl);
        }
      });
    }
  }, [isLogModalOpen]);
  
  const isTechnician = role === 'technician';
  const isCustomer = role === 'customer';
  const { toast, confirm } = useToast();
  const { user, profile } = useAuth();

  const isVideo = (url: string) => {
    if (!url) return false;
    const videoExts = ['.mp4', '.webm', '.ogg', '.mov', '.quicktime'];
    return videoExts.some(ext => url.toLowerCase().split('?')[0].endsWith(ext)) || url.includes('/video');
  };

  const getAvatarUrl = (emp_id?: string | null) => {
    if (!emp_id) return null;
    return `https://wms.advanceagro.net/WSVIS/api/Face/GetImage?CardID=${emp_id}`;
  };


  const fetchData = async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const [tData, cData, teamsData, templatesData] = await Promise.all([
        api.tickets.get(ticketId),
        api.companies.list(),
        api.teams.list(),
        api.masterData.listQuickTemplates()
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
      const filteredTemplates = (templatesData as any[]).filter(t => {
        const matchesId = tData.category_id && t.category_id === tData.category_id;
        const matchesName = tData.category && t.categories?.name === tData.category;
        return matchesId || matchesName;
      });
      setQuickTemplates(filteredTemplates);
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
        'Resolved (Tech)': 'Mark Resolved (Tech)',
        'Resolved (CRM)': 'Confirm Resolve (CRM)',
        'Closed': 'ปิดงานและบันทึก Feedback',
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
      // 1. Gather pre-uploaded URLs
      const mediaUrls = logAttachments
        .filter(att => att.status === 'done' && att.publicUrl)
        .map(att => att.publicUrl as string);

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

      // Cleanup local blob objectURLs
      logAttachments.forEach(att => {
        if (att.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(att.previewUrl);
        }
      });

      setLogText('');
      setLogAttachments([]);
      setIsInternalLog(false);
      setIsLogModalOpen(false);
      toast.success('บันทึก Log สำเร็จ', `เพิ่ม Log ให้ ${ticket.id} เรียบร้อยแล้ว`);
      onAddNotification('เพิ่ม Log สำเร็จ', `${ticket.id}: บันทึกเหตุการณ์เรียบร้อยแล้ว`, 'update');
      fetchData();
    } catch (error) {
      toast.error('ไม่สามารถบันทึก Log ได้', 'กรุณาลองใหม่อีกครั้ง');
      onAddNotification('Error', 'ไม่สามารถบันทึก Log ได้', 'system');
    }
  };

  const submitFeedback = async () => {
    if (!feedback.fixScore || !feedback.serviceScore || !ticket) {
      toast.warning('กรุณาให้คะแนนให้ครบ', 'กรุณาให้คะแนนทั้งคุณภาพการซ่อมและการบริการ');
      return;
    }
    try {
      setLoading(true);
      // 1. Insert Feedback
      await api.tickets.addFeedback({
        ticket_id: ticket.id,
        score: Math.round((feedback.fixScore + feedback.serviceScore) / 2),
        fix_quality_score: feedback.fixScore,
        service_quality_score: feedback.serviceScore,
        fix_quality_comment: feedback.fixComment || '',
        service_quality_comment: feedback.serviceComment || '',
        submitted_by: user?.id || null
      });

      // 2. Update status to Closed
      await api.tickets.closeWithTeamRelease(ticket.id);

      // 3. Add Log
      await api.tickets.addLog({
        ticket_id: ticket.id,
        message: `ปิดงานพร้อม Feedback: คุณภาพการซ่อม ${feedback.fixScore}/5, การบริการ ${feedback.serviceScore}/5`,
        author_name: profile?.full_name || 'CRM Staff',
        author_id: user?.id || null,
        author_role: 'crm',
        status_from: 'Resolved (CRM)',
        status_to: 'Closed'
      });

      setIsFeedbackModalOpen(false);
      toast.success('ขอบคุณสำหรับ Feedback!', 'ปิดงานเรียบร้อยแล้ว');
      onAddNotification('ปิดงานสำเร็จ', 'ระบบบันทึก Feedback และปิดงานเรียบร้อย', 'system');
      fetchData();
    } catch (error) {
      console.error('Feedback error:', error);
      toast.error('ไม่สามารถส่ง feedback ได้', 'กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  // Triggered on file input selection
  const handleLogFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !ticket) return;
    const files = Array.from(e.target.files) as File[];
    
    for (const file of files) {
      const fileId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const isImg = file.type.startsWith('image/');
      const isVid = file.type.startsWith('video/');
      const previewUrl = URL.createObjectURL(file);

      // Create initial local attachment state
      const newAttachment = {
        id: fileId,
        file,
        previewUrl,
        status: (isImg ? 'compressing' : 'uploading') as any,
        progress: 0
      };

      setLogAttachments(prev => [...prev, newAttachment]);

      // 1. Validation for Videos (5 minutes maximum length, 50MB maximum size)
      if (isVid) {
        if (file.size > 50 * 1024 * 1024) {
          toast.warning('ไฟล์มีขนาดใหญ่เกินกำหนด', 'วิดีโอควรมีขนาดไม่เกิน 50MB');
          setLogAttachments(prev => prev.map(a => a.id === fileId ? { ...a, status: 'error', error: 'ไฟล์ใหญ่เกิน 50MB' } : a));
          continue;
        }

        const duration = await getVideoDuration(file);
        if (duration > 300) {
          toast.warning('ความยาววิดีโอเกินกำหนด', 'วิดีโอต้องยาวไม่เกิน 5 นาที (300 วินาที)');
          setLogAttachments(prev => prev.map(a => a.id === fileId ? { ...a, status: 'error', error: 'ความยาวเกิน 5 นาที' } : a));
          continue;
        }
      }

      // 2. Compression for Images
      let fileToUpload = file;
      if (isImg) {
        try {
          const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
          fileToUpload = await imageCompression(file, options);
          setLogAttachments(prev => prev.map(a => a.id === fileId ? { ...a, status: 'uploading' } : a));
        } catch (err) {
          console.error('Compression failed:', err);
          setLogAttachments(prev => prev.map(a => a.id === fileId ? { ...a, status: 'uploading' } : a));
        }
      }

      // 3. Progressive R2 upload directly to presigned URL
      try {
        const publicUrl = await uploadWithProgress(fileToUpload, ticket.id, (percent) => {
          setLogAttachments(prev => prev.map(a => a.id === fileId ? { ...a, progress: percent } : a));
        });

        // Set attachment status to 'done'
        setLogAttachments(prev => prev.map(a => a.id === fileId ? { ...a, status: 'done', progress: 100, publicUrl } : a));
      } catch (err: any) {
        console.error('R2 upload failed:', err);
        setLogAttachments(prev => prev.map(a => a.id === fileId ? { ...a, status: 'error', error: err.message || 'อัปโหลดล้มเหลว' } : a));
      }
    }

    // Reset input value so same files can be chosen again if deleted
    if (e.target.value) {
      e.target.value = '';
    }
  };

  // Triggered when deleting a pending/uploaded item
  const removeLogAttachment = async (id: string) => {
    const target = logAttachments.find(a => a.id === id);
    if (!target) return;

    // Revoke object URL
    if (target.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(target.previewUrl);
    }

    // Delete from R2 if uploaded successfully
    if (target.status === 'done' && target.publicUrl) {
      try {
        await deleteFromR2(target.publicUrl);
        toast.info('ลบไฟล์แล้ว', 'ลบไฟล์ออกจาก Storage สำเร็จ');
      } catch (err) {
        console.error('Failed to delete file from R2:', err);
      }
    }

    setLogAttachments(prev => prev.filter(a => a.id !== id));
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
            <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-widest border ${statusColors[ticket.status as any]}`}>
              {ticket.status}
            </span>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-widest border ${categoryColors[ticket.category as any] || 'bg-slate-50 text-slate-600 border-slate-100/50'}`}>
              {ticket.category === 'Power' && <Zap size={12} className="fill-amber-500 text-amber-500" />}
              {ticket.category === 'Water Supply' && <Droplets size={12} className="fill-sky-500 text-sky-500" />}
              {ticket.category === 'Facility' && <Building2 size={12} className="fill-indigo-500 text-indigo-500" />}
              {ticket.category}
            </span>
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
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-amber-700 uppercase">Repair</span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star 
                        key={star} 
                        size={12} 
                        className={star <= (ticket as any).ticket_feedback[0].fix_quality_score ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} 
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-amber-700 uppercase">Service</span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star 
                        key={star} 
                        size={12} 
                        className={star <= (ticket as any).ticket_feedback[0].service_quality_score ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} 
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex-1">
                <p className="text-xs font-black text-amber-700 uppercase tracking-tighter">CRM Confirmation Feedback</p>
                <p className="text-sm text-amber-900 font-medium italic">
                  { (ticket as any).ticket_feedback[0].fix_quality_comment || (ticket as any).ticket_feedback[0].service_quality_comment || 'ไม่มีข้อความเพิ่มเติม' }
                </p>
              </div>
            </div>
          )}

          {(role === 'technician' || role === 'crm' || role === 'admin') && ticket.status !== 'Closed' && (
            <button onClick={() => setIsLogModalOpen(true)} className="action-secondary">
              <Edit3 size={16} />
              Add Log
            </button>
          )}
          
          {isTechnician && ticket.status === 'In Progress' && (
            <button onClick={() => handleStatusUpdate('Resolved (Tech)')} className="action-success">
              <CheckCircle size={16} />
              Mark Resolved (Tech)
            </button>
          )}

          {(role === 'crm' || role === 'admin') && ticket.status === 'Resolved (Tech)' && (
            <button onClick={() => handleStatusUpdate('Resolved (CRM)')} className="action-primary bg-indigo-600 hover:bg-indigo-700">
              <CheckCircle size={16} />
              Confirm Resolve (CRM)
            </button>
          )}

          {(role === 'crm' || role === 'admin') && ticket.status === 'Resolved (CRM)' && (
            <button onClick={() => setIsFeedbackModalOpen(true)} className="action-success bg-emerald-600 hover:bg-emerald-700">
              <Star size={16} className="fill-white" />
              ปิดงาน (Submit Feedback)
            </button>
          )}
        </div>
      </section>

      <section className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex items-center gap-3 text-indigo-900">
            <div className="shrink-0 p-2 bg-indigo-100 rounded-lg">
              <Crosshair size={20} className="text-indigo-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-0.5">ทีมรับผิดชอบ (Assignee)</p>
              <p className="font-black text-base">{ticket.assignee || 'ยังไม่มีการมอบหมาย'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 text-indigo-900">
            <div className="shrink-0 p-2 bg-indigo-100 rounded-lg">
              <User size={20} className="text-indigo-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-0.5">ผู้ดูแล (Response)</p>
              <p className="font-black text-base">
                {ticket.responder_id 
                  ? ((ticket as any).responder?.full_name || 'System') 
                  : ((ticket as any).creator?.role !== 'customer' ? ((ticket as any).creator?.full_name || 'System') : 'Unassigned')}
              </p>
            </div>
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

      {ticket.status === 'Resolved (CRM)' && (
        <section className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="font-black text-emerald-800">งานถูก Confirm โดย CRM แล้ว</h3>
            <p className="text-sm text-emerald-700 mt-1">ระบบจะ auto-close ภายใน 48 ชั่วโมง (SLA หยุดนับแล้ว): {safeDate(ticket.auto_close_at)}</p>
          </div>
          {role === 'crm' && (
            <button
              onClick={() => setIsFeedbackModalOpen(true)}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-emerald-700"
            >
              ให้ Feedback และปิดงานทันที
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
                    <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-2 opacity-100">รายละเอียดปัญหา / หมายเหตุ</h3>
                    <p className="text-slate-950 leading-relaxed font-black text-lg">{ticket.description || 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <InfoBlock label="Area / พื้นที่" value={ticket.area || '-'} />
                    <InfoBlock label="Location / ตำแหน่ง" value={ticket.location_text || '-'} />
                    <InfoBlock label="Service Type / ประเภท" value={ticket.type || '-'} />
                    <InfoBlock label="Channel / ช่องทาง" value={ticket.channel || '-'} />
                    <InfoBlock label="Contact / ผู้ติดต่อ" value={ticket.contact_name || '-'} />
                    <InfoBlock label="Phone / เบอร์ติดต่อ" value={formatPhoneNumber(ticket.contact_phone) || '-'} />
                    <InfoBlock label="Created / วันที่สร้าง" value={safeDate(ticket.created_at)} />
                    <InfoBlock label="Duration / ระยะเวลา" value={ticket.duration_min ? `${ticket.duration_min} นาที` : '-'} />
                    <InfoBlock label="Impact / รัศมี" value={ticket.impact_radius_meters ? `${ticket.impact_radius_meters.toLocaleString()} เมตร` : '-'} />
                    {(ticket as any).creator && (
                      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-white border border-primary/20 shrink-0">
                          {(ticket as any).creator.emp_id ? (
                            <img src={getAvatarUrl((ticket as any).creator.emp_id)!} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-primary">
                              <User size={20} />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-primary/70 mb-0.5">Created By / ผู้แจ้ง</p>
                          <p className="text-sm font-black text-slate-900">{(ticket as any).creator.full_name}</p>
                          <p className="text-[10px] font-bold text-slate-500 uppercase">{(ticket as any).creator.role}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeTab === 'logs' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-black text-primary text-base">บันทึกเหตุการณ์นาทีต่อนาที</h3>
                      <p className="text-xs text-slate-600 font-bold mt-1">ใช้สำหรับเคส Facility เช่น ไฟไหม้ น้ำเสียล้น หรือการเรียกรถดับเพลิง</p>
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
                    ) : localLogs.map((log, index) => {
                      const isSystemUpdate = log.message.startsWith('[System Update]');
                      return (
                      <div key={log.id} className={`flex gap-4 relative ${isSystemUpdate ? 'py-1' : ''}`}>
                        {index < localLogs.length - 1 && <div className="absolute left-[13px] top-8 bottom-[-18px] w-0.5 bg-slate-200" />}
                        <div className={`rounded-full overflow-hidden flex items-center justify-center shrink-0 z-10 border ${isSystemUpdate ? 'w-7 h-7 bg-white border-slate-200 text-slate-400' : 'w-7 h-7 bg-slate-200 border-slate-200'}`}>
                          {isSystemUpdate ? (
                            <Activity size={14} />
                          ) : (log as any).author_profile?.emp_id ? (
                            <img 
                              src={getAvatarUrl((log as any).author_profile.emp_id)!} 
                              alt="" 
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-primary flex items-center justify-center text-white">
                              <Clock size={14} />
                            </div>
                          )}
                        </div>
                        {isSystemUpdate ? (
                          <div className="flex-1 py-1">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                              <p className="font-bold text-slate-500 text-xs">
                                System Audit by {log.author_name}
                                {(log as any).author_profile?.role && (
                                  <span className="ml-1 text-[9px] font-black uppercase text-slate-400">({(log as any).author_profile.role})</span>
                                )}
                              </p>
                              <span className="text-[10px] text-slate-400 font-medium">
                                {safeDate(log.timestamp)}
                              </span>
                            </div>
                            <div className="space-y-1">
                              {log.message.replace('[System Update] ', '').split('\n').map((change, i) => (
                                <p key={i} className="text-xs text-slate-600 font-medium">
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 mr-2 opacity-70"></span>
                                  {change}
                                </p>
                              ))}
                            </div>
                          </div>
                        ) : (
                        <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-4">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <p className="font-black text-primary text-sm">
                                {log.author_name}
                                {(log as any).author_profile?.role && (
                                  <span className="ml-2 text-[10px] text-slate-400 font-bold uppercase">{(log as any).author_profile.role}</span>
                                )}
                              </p>
                              {log.is_internal && (
                                <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-1.5 py-0.5 rounded uppercase">Internal</span>
                              )}
                            </div>
                            <span className="font-mono text-xs text-slate-600 font-black bg-white border border-slate-200 rounded px-2 py-1">
                              {safeDate(log.timestamp)}
                            </span>
                          </div>
                          <p className={`text-sm leading-relaxed ${log.is_internal ? 'text-amber-950 font-medium italic' : 'text-slate-800 font-bold'}`}>{log.message}</p>
                          {log.media_urls && log.media_urls.length > 0 && (
                            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {log.media_urls.map((url, i) => (
                                <button 
                                  key={i} 
                                  onClick={() => setSelectedMedia(url)}
                                  className="group relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-white hover:ring-2 hover:ring-primary transition-all shadow-sm text-left"
                                >
                                  {isVideo(url) ? (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900">
                                      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mb-1">
                                        <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-white border-b-[6px] border-b-transparent ml-1" />
                                      </div>
                                      <span className="text-[10px] text-white font-black uppercase">Video</span>
                                    </div>
                                  ) : (
                                    <img 
                                      src={url} 
                                      alt="Attachment" 
                                      className="w-full h-full object-cover transition-transform group-hover:scale-110" 
                                    />
                                  )}
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                                    <ExternalLink size={16} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        )}
                      </div>
                    )})}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {affectedCompanies.length > 0 ? (
                    <div className="space-y-6">
                      {Object.entries(
                        affectedCompanies.reduce((acc, company) => {
                          const area = company.area || 'ไม่ระบุโซน';
                          if (!acc[area]) acc[area] = [];
                          acc[area].push(company);
                          return acc;
                        }, {} as Record<string, typeof affectedCompanies>)
                      ).map(([area, rawCompaniesInArea]) => {
                        const companiesInArea = rawCompaniesInArea as typeof affectedCompanies;
                        return (
                          <div key={area} className="bg-red-50 border border-red-100 rounded-xl p-6">
                            <h4 className="text-sm font-black text-red-800 mb-4 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-red-500"></span>
                              โซน: {area} ({companiesInArea.length} บริษัท)
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {companiesInArea.map((company) => (
                              <div key={company.id} className="bg-white border border-red-100 rounded-xl p-4 flex flex-col gap-2">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-red-50 text-red-600 flex items-center justify-center font-black text-xs shrink-0">
                                    {company.name.charAt(0)}
                                  </div>
                                  <span className="text-sm font-bold text-slate-800 truncate">
                                    {company.name}
                                  </span>
                                </div>
                                <div className="pl-11 space-y-1">
                                  <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <User size={12} className="shrink-0" />
                                    <span className="truncate">{company.contact_name || 'ไม่ระบุผู้ติดต่อ'}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <Phone size={12} className="shrink-0" />
                                    <span>{company.phone || '-'}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        );
                      })}
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
              {formatPhoneNumber(ticket.contact_phone) || 'ไม่ระบุ'}
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
            {['Open', 'In Progress', 'Resolved (Tech)', 'Resolved (CRM)', 'Closed'].map((step) => {
              const statusOrder = ['Open', 'In Progress', 'Resolved (Tech)', 'Resolved (CRM)', 'Closed'];
              const currentIndex = statusOrder.indexOf(ticket.status);
              const stepIndex = statusOrder.indexOf(step);
              const complete = stepIndex <= currentIndex;
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
            {quickTemplates.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-amber-100 rounded-md flex items-center justify-center">
                    <Zap size={12} className="text-amber-600 fill-amber-600" />
                  </div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">ทางเลือกด่วน (Quick Response)</p>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
                  {quickTemplates.map((t) => {
                    const catName = t.categories?.name;
                    const colorClasses = categoryColors[catName as TicketCategory] || 'bg-white text-slate-600 border-slate-200';
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          setLogText(t.template_text);
                          toast.success('เลือก Template แล้ว', t.name || 'Quick Response');
                        }}
                        className={`shrink-0 flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all whitespace-nowrap shadow-sm hover:shadow-md active:scale-95 border-2 ${colorClasses.replace('bg-', 'hover:bg-').replace('border-', 'border-')}`}
                      >
                        {catName === 'Power' && <Zap size={14} className="fill-amber-500 text-amber-500" />}
                        {catName === 'Water Supply' && <Droplets size={14} className="fill-sky-500 text-sky-500" />}
                        {catName === 'Facility' && <Building2 size={14} className="fill-indigo-500 text-indigo-500" />}
                        {t.name || (t.template_text.length > 20 ? t.template_text.substring(0, 20) + '...' : t.template_text)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <textarea value={logText} onChange={(event) => setLogText(event.target.value)} rows={5} className="w-full form-field resize-none" placeholder="เช่น เวลา 18.28 น. ทีม Area Inspector ตรวจสอบพบว่า..." />
            
            <div className="space-y-3">
              <div className="flex flex-col gap-2">
                <input 
                  type="file" 
                  accept="image/*,video/*" 
                  multiple 
                  ref={fileInputRef} 
                  onChange={handleLogFileChange} 
                  className="hidden" 
                />
                
                {logAttachments.length < 5 && (
                  <div>
                    <button 
                      onClick={() => fileInputRef.current?.click()} 
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 transition-colors text-slate-700 rounded-lg text-xs font-extrabold flex items-center gap-2"
                    >
                      <Camera size={14} />
                      แนบไฟล์ภาพหรือวิดีโอ {logAttachments.length > 0 ? '(แนบเพิ่ม)' : ''}
                    </button>
                    <p className="text-[10px] text-slate-400 mt-1 font-medium">
                      * รองรับไฟล์ภาพและวิดีโอ (จำกัดวิดีโอไม่เกิน 50MB และความยาวไม่เกิน 5 นาทีต่อคลิป)
                    </p>
                  </div>
                )}

                {logAttachments.length > 0 && (
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    {logAttachments.map((item) => {
                      const isVid = item.file.type.startsWith('video/');
                      return (
                        <div key={item.id} className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-50 group flex flex-col items-center justify-center">
                          {/* Media preview */}
                          {isVid ? (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white relative">
                              <Video size={24} className="text-slate-400 mb-1" />
                              <span className="text-[9px] font-medium truncate max-w-[90%] px-1">{item.file.name}</span>
                            </div>
                          ) : (
                            <img 
                              src={item.previewUrl} 
                              alt="preview" 
                              className="w-full h-full object-cover" 
                            />
                          )}

                          {/* Status overlays */}
                          {item.status === 'compressing' && (
                            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white text-[10px] font-bold">
                              <Loader2 className="animate-spin text-white mb-1" size={16} />
                              <span>กำลังบีบอัด...</span>
                            </div>
                          )}

                          {item.status === 'uploading' && (
                            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white text-[10px] font-bold">
                              <div className="relative w-10 h-10 flex items-center justify-center mb-1">
                                <svg className="absolute w-full h-full transform -rotate-90">
                                  <circle cx="20" cy="20" r="16" stroke="rgba(255,255,255,0.2)" strokeWidth="3" fill="transparent" />
                                  <circle 
                                    cx="20" 
                                    cy="20" 
                                    r="16" 
                                    stroke="#f59e0b" 
                                    strokeWidth="3" 
                                    fill="transparent" 
                                    strokeDasharray={100} 
                                    strokeDashoffset={100 - item.progress} 
                                  />
                                </svg>
                                <span className="text-[9px] font-extrabold text-amber-400">{item.progress}%</span>
                              </div>
                              <span>กำลังอัปโหลด...</span>
                            </div>
                          )}

                          {item.status === 'error' && (
                            <div className="absolute inset-0 bg-red-50/95 flex flex-col items-center justify-center text-red-600 text-[9px] font-bold p-1 text-center">
                              <AlertCircle size={16} className="mb-0.5" />
                              <span className="line-clamp-2">{item.error || 'ล้มเหลว'}</span>
                            </div>
                          )}

                          {/* Delete button */}
                          <button 
                            onClick={() => removeLogAttachment(item.id)} 
                            className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-600 transition-colors text-white rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {role !== 'customer' && (
                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${isInternalLog ? 'bg-amber-500' : 'bg-slate-200'}`}>
                      <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${isInternalLog ? 'translate-x-5' : ''}`} />
                    </div>
                    <input type="checkbox" className="hidden" checked={isInternalLog} onChange={(e) => setIsInternalLog(e.target.checked)} />
                    <span className="text-xs font-black text-slate-600 group-hover:text-slate-900 transition-colors">Internal Note (ลูกค้ามองไม่เห็น)</span>
                  </label>
                </div>
              )}
            </div>

            {(() => {
              const isUploading = logAttachments.some(a => a.status === 'uploading');
              const isCompressing = logAttachments.some(a => a.status === 'compressing');
              const isBlocked = isUploading || isCompressing || !logText.trim();
              
              let buttonText = 'บันทึก Log';
              if (isCompressing) {
                buttonText = 'กำลังบีบอัดไฟล์ภาพ...';
              } else if (isUploading) {
                const total = logAttachments.length;
                const uploaded = logAttachments.filter(a => a.status === 'done').length;
                buttonText = `กำลังอัปโหลดไฟล์ (${uploaded}/${total})...`;
              }

              return (
                <button 
                  onClick={handleAddLog} 
                  disabled={isBlocked} 
                  className="w-full py-3 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-primary-dark transition-all shadow-md shadow-primary/10 active:scale-[0.98]"
                >
                  {isCompressing || isUploading ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <Send size={18} />
                  )}
                  {buttonText}
                </button>
              );
            })()}
          </div>
        </Modal>
      )}

      {isFeedbackModalOpen && (
        <Modal title="Confirm & Feedback (304IP Way)" onClose={() => setIsFeedbackModalOpen(false)}>
          <div className="space-y-6">
            <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
              <p className="text-xs font-bold text-amber-800 mb-2 uppercase tracking-wider">คุณภาพการแก้ไขงาน (Quality of Fix)</p>
              <div className="flex gap-2 mb-3">
                {[1, 2, 3, 4, 5].map((score) => (
                  <button key={score} onClick={() => setFeedback({ ...feedback, fixScore: score })} className="transition-transform hover:scale-110">
                    <Star size={30} className={score <= feedback.fixScore ? 'fill-yellow-400 text-yellow-400' : 'text-slate-200'} />
                  </button>
                ))}
              </div>
              <textarea 
                value={feedback.fixComment} 
                onChange={(e) => setFeedback({ ...feedback, fixComment: e.target.value })} 
                rows={2} 
                className="w-full form-field text-sm bg-white" 
                placeholder="คอมเมนต์เรื่องการซ่อมแซม..." 
              />
            </div>

            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
              <p className="text-xs font-bold text-blue-800 mb-2 uppercase tracking-wider">การประสานงานและการบริการ (Service Quality)</p>
              <div className="flex gap-2 mb-3">
                {[1, 2, 3, 4, 5].map((score) => (
                  <button key={score} onClick={() => setFeedback({ ...feedback, serviceScore: score })} className="transition-transform hover:scale-110">
                    <Star size={30} className={score <= feedback.serviceScore ? 'fill-yellow-400 text-yellow-400' : 'text-slate-200'} />
                  </button>
                ))}
              </div>
              <textarea 
                value={feedback.serviceComment} 
                onChange={(e) => setFeedback({ ...feedback, serviceComment: e.target.value })} 
                rows={2} 
                className="w-full form-field text-sm bg-white" 
                placeholder="คอมเมนต์เรื่องการให้บริการ/การสื่อสาร..." 
              />
            </div>

            <button onClick={submitFeedback} className="w-full py-4 bg-primary text-white rounded-xl font-black flex items-center justify-center gap-2 shadow-lg shadow-primary/20">
              <CheckCircle size={20} />
              บันทึก Feedback และปิดงาน (Closed)
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

      {/* ── Media Lightbox ── */}
      {selectedMedia && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={() => setSelectedMedia(null)}
        >
          <button 
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-10"
            onClick={() => setSelectedMedia(null)}
          >
            <X size={24} />
          </button>
          
          <div className="relative w-full max-w-5xl max-h-[90vh] flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
            {isVideo(selectedMedia) ? (
              <video 
                src={selectedMedia} 
                controls 
                autoPlay
                className="max-w-full max-h-[80vh] rounded-lg shadow-2xl"
              />
            ) : (
              <img 
                src={selectedMedia} 
                alt="Full view" 
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300" 
              />
            )}
            
            <a 
              href={selectedMedia} 
              target="_blank" 
              rel="noopener noreferrer"
              className="mt-6 flex items-center gap-2 text-white/70 hover:text-white text-sm font-bold transition-colors"
            >
              <ExternalLink size={16} />
              Open Original {isVideo(selectedMedia) ? 'Video' : 'Image'}
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
      <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">{label}</p>
      <p className="text-sm font-black text-slate-900">{value}</p>
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
