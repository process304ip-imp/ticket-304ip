import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { z } from 'zod';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Crosshair,
  Filter,
  Clock,
  Loader2,
  Map as MapIcon,
  MapPin,
  Navigation,
  Plus,
  Search,
  Send,
  X,
  ChevronDown,
  FileText,
  Trash2,
  Check,
  CheckCircle,
  PlayCircle,
  Star,
  User,
  Users,
  ChevronLeft,
  ChevronRight,
  Eye,
  Zap,
  Droplets,
  Building2,
  HelpCircle,
  XCircle,
  ShieldCheck,
  Phone,
  Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Circle, MapContainer, Marker, TileLayer, Popup, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  Role,
  TicketCategory,
  TicketStatus,
  categoryColors,
  priorityColors,
  statusColors,
} from '../data';
import { api, Ticket, Company, ResponseTeam, getAvatarUrl } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import { compressImage, formatPhoneNumber } from '../lib/utils';
import { deleteFromR2, detectStorageProvider } from '../lib/r2-upload';
import { playChime, ticketNotify } from '../lib/notify';
const getVideoDuration = (file: File): Promise<number> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => {
      resolve(0);
    };
    video.src = URL.createObjectURL(file);
  });
};

const generateDraftId = (): string => {
  const now = new Date();
  const yy = String(now.getFullYear()).substring(2, 4);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const randomStr = Math.random().toString(36).substring(2, 6);
  return `draft-${yy}${mm}${dd}-${randomStr}`;
};

interface TicketListProps {
  onSelectTicket: (id: string) => void;
  role: Role;
  initialMode?: 'board' | 'assigned';
  profile?: any;
  lang?: 'TH' | 'EN';
}

const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function MapBounds({ tickets }: { tickets: Ticket[] }) {
  const map = useMap();
  
  React.useEffect(() => {
    const validTickets = tickets.filter(t => t.lat && t.lng && !isNaN(Number(t.lat)) && !isNaN(Number(t.lng)));
    if (validTickets.length === 0) return;

    const lats = validTickets.map(t => Number(t.lat));
    const lngs = validTickets.map(t => Number(t.lng));
    
    const bounds = L.latLngBounds(
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)]
    );
    
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
  }, [tickets, map]);

  return null;
}

const customPinIcon = L.divIcon({
  className: 'custom-pin',
  html: `<div style="color:#ef4444;width:28px;height:28px;transform:translate(-14px,-28px)">
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="white" stroke-width="2"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3" fill="white"/></svg>
  </div>`,
  iconSize: [0, 0],
});

function LocationSelector({ setGpsLocation, setPinPos, pinPos }: { setGpsLocation: (loc: string) => void; setPinPos: (pos: L.LatLng | null) => void; pinPos: L.LatLng | null }) {
  useMapEvents({
    click(event) {
      setPinPos(event.latlng);
      setGpsLocation(`${event.latlng.lat.toFixed(6)}, ${event.latlng.lng.toFixed(6)}`);
    },
  });
  return pinPos ? <Marker position={pinPos} icon={customIcon} /> : null;
}

function MapController({ center }: { center: L.LatLngExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 16);
  }, [center, map]);
  return null;
}

function parseDate(raw: string | null | undefined) {
  if (!raw) return null;
  const parsed = new Date(raw.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatShortDateTime(raw: string | null | undefined) {
  const date = parseDate(raw);
  if (!date) return '-';
  return date.toLocaleString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}


function formatAge(raw: string | null | undefined) {
  const date = parseDate(raw);
  if (!date) return '-';
  const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) return 'เมื่อสักครู่';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function formatTimeUntil(raw: string | null | undefined) {
  const date = parseDate(raw);
  if (!date) return '-';
  const diffMinutes = Math.floor((date.getTime() - Date.now()) / 60000);
  if (diffMinutes <= 0) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
}

function getLastLogAt(ticket: any) {
  const timestamps = (ticket.ticket_logs || [])
    .map((log: any) => parseDate(log.timestamp)?.getTime() || 0)
    .filter(Boolean);
  if (timestamps.length === 0) return ticket.created_at;
  return new Date(Math.max(...timestamps)).toISOString();
}

function getSlaState(ticket: any, currentTime: number = Date.now()) {
  if (ticket.status === 'Closed') {
    return { label: 'Closed', className: 'bg-slate-100 text-slate-600 border-slate-200', isGlowing: false };
  }
  if (ticket.status === 'Resolved (Tech)' || ticket.status === 'Resolved (CRM)') {
    return { 
      label: ticket.status === 'Resolved (CRM)' && ticket.auto_close_at 
        ? `Auto-close ${formatTimeUntil(ticket.auto_close_at)}` 
        : (ticket.status === 'Resolved (Tech)' ? 'Waiting CRM Confirm' : 'Waiting Feedback'), 
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      isGlowing: false
    };
  }

  const due = parseDate(ticket.sla_due_at);
  if (!due) return { label: 'No SLA', className: 'bg-slate-50 text-slate-500 border-slate-200', isGlowing: false };

  const minutesLeft = Math.floor((due.getTime() - currentTime) / 60000);
  if (minutesLeft < 0) {
    const overdueMins = Math.abs(minutesLeft);
    const label = overdueMins > 60 ? `Overdue ${Math.floor(overdueMins/60)}h ${overdueMins%60}m` : `Overdue ${overdueMins}m`;
    return { label, className: 'bg-red-50 text-red-700 border-red-200', isGlowing: true };
  }
  
  if (minutesLeft <= 60) {
    return { label: `Due ${minutesLeft}m`, className: 'bg-amber-50 text-amber-700 border-amber-200', isGlowing: true };
  }

  const hoursLeft = Math.floor(minutesLeft / 60);
  const minsLeft = minutesLeft % 60;
  return { label: `Due ${hoursLeft}h ${minsLeft}m`, className: 'bg-blue-50 text-blue-700 border-blue-200', isGlowing: false };
}

function SlaBadge({ ticket, variant = 'card' }: { ticket: any; variant?: 'card' | 'list' }) {
  const [now, setNow] = useState(Date.now());
  
  useEffect(() => {
    if (ticket.status === 'Closed' || ticket.status?.startsWith('Resolved')) return;
    if (!ticket.sla_due_at) return;
    
    const interval = setInterval(() => setNow(Date.now()), 60000); // Update every minute
    return () => clearInterval(interval);
  }, [ticket.status, ticket.sla_due_at]);

  const slaState = getSlaState(ticket, now);
  
  const baseClasses = variant === 'card' 
    ? "px-2 py-0.5 rounded-md border text-[9px] font-black uppercase"
    : "inline-flex w-fit px-2 py-0.5 rounded-md text-[10px] font-black border";
    
  const glowingClasses = slaState.isGlowing 
    ? "animate-pulse ring-2 ring-offset-1 ring-red-500/50 shadow-[0_0_8px_rgba(239,68,68,0.5)]" 
    : "";
  
  return (
    <span className={`${baseClasses} ${slaState.className} ${glowingClasses}`}>
      {slaState.label}
    </span>
  );
}

function getChannelClass(channel: string | null | undefined) {
  if (channel === 'Customer Portal' || channel === 'QR Portal') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  if (channel === 'Line' || channel === 'WhatsApp') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (channel === 'Tel') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

export function TicketList({ onSelectTicket, role, initialMode = 'board' }: TicketListProps) {
  const { profile } = useAuth();
  const { toast, confirm } = useToast();
  const [tickets, setTickets] = useState<(Ticket & { companies: { name: string, area: string } | null })[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [teams, setTeams] = useState<ResponseTeam[]>([]);
  const [dbCategories, setDbCategories] = useState<any[]>([]);
  const [allSubCategories, setAllSubCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [assignModalTicketId, setAssignModalTicketId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number; openUp: boolean } | null>(null);
  const [gpsLocation, setGpsLocation] = useState('');
  const [pinPos, setPinPos] = useState<L.LatLng | null>(null);
  const [mapCenter, setMapCenter] = useState<L.LatLngExpression | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState('ทั้งหมด');
  const [categoryFilter, setCategoryFilter] = useState<'ทั้งหมด' | TicketCategory>('ทั้งหมด');
  const [statusFilter, setStatusFilter] = useState<'ทั้งหมด' | TicketStatus>('ทั้งหมด');
  const [channelFilter, setChannelFilter] = useState('ทั้งหมด');
  const [assigneeFilter, setAssigneeFilter] = useState('ทั้งหมด');
  const [slaFilter, setSlaFilter] = useState('ทั้งหมด');
  const [responderFilter, setResponderFilter] = useState('ทั้งหมด');
  const [myTicketsOnly, setMyTicketsOnly] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [showMap, setShowMap] = useState(() => {
    try { return localStorage.getItem('crm_showMap') !== 'false'; } catch { return true; }
  });
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [activeCardFilter, setActiveCardFilter] = useState<string | null>(null);

  // ── Module 3: Realtime Sync & Notifications ──
  const [isLive, setIsLive] = useState(false);
  const [realtimeFlash, setRealtimeFlash] = useState(false);
  const [newTicketIds, setNewTicketIds] = useState<Set<string>>(new Set());
  // Track last seen timestamp in localStorage to persist across page changes
  const lastSeenAtRef = useRef<number>(() => {
    try { return parseInt(localStorage.getItem('crm_lastSeenAt') || '0', 10); } catch { return 0; }
  });
  const updateLastSeen = () => {
    const now = Date.now();
    lastSeenAtRef.current = now as unknown as number;
    try { localStorage.setItem('crm_lastSeenAt', String(now)); } catch {}
  };

  
  // Create form state
  const [category, setCategory] = useState<TicketCategory>(role === 'customer' ? 'Water Supply' : 'Power');
  const [subCategory, setSubCategory] = useState('');
  const [description, setDescription] = useState('');
  const [impactRadiusMeters, setImpactRadiusMeters] = useState(800);
  const [affectedCompanyQuery, setAffectedCompanyQuery] = useState('');
  const [affectedCompanyIds, setAffectedCompanyIds] = useState<string[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [companySearch, setCompanySearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('ทั้งหมด');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [formChannel, setFormChannel] = useState('Tel');
  const [locationDetail, setLocationDetail] = useState('');
  const [durationMin, setDurationMin] = useState<number | ''>('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  
  // Feedback state
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackTicketId, setFeedbackTicketId] = useState<string | null>(null);
  const [confirmClaim, setConfirmClaim] = useState<{ type: 'claim' | 'unclaim', ticketId: string, previousStatus?: string } | null>(null);
  const [feedback, setFeedback] = useState({ score: 0, comment: '' });
  
  // Image Upload State
  interface TicketAttachment {
    id: string;
    file: File;
    previewUrl: string;
    progress: number;
    url?: string;
    error?: string;
    status: 'compressing' | 'uploading' | 'done' | 'error';
  }
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [draftId, setDraftId] = useState(() => generateDraftId());

  useEffect(() => {
    if (isCreateModalOpen) {
      setDraftId(generateDraftId());
      setAttachments([]);
    } else {
      attachments.forEach(item => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      setAttachments([]);
    }
  }, [isCreateModalOpen]);

  const zones = useMemo(() => {
    const set = new Set(companies.map(c => c.area).filter(Boolean));
    return ['ทั้งหมด', ...Array.from(set).sort()];
  }, [companies]);

  const searchableCompanies = useMemo(() => {
    return companies
      .filter(c => {
        const matchesZone = zoneFilter === 'ทั้งหมด' || c.area === zoneFilter;
        const matchesSearch = c.name.toLowerCase().includes(companySearch.toLowerCase());
        return matchesZone && matchesSearch;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }, [companies, zoneFilter, companySearch]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files) as File[];
      
      const newAttachments = files.map(file => {
        const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
        return {
          id,
          file,
          previewUrl: URL.createObjectURL(file),
          progress: 0,
          status: 'compressing' as const
        };
      });

      setAttachments(prev => [...prev, ...newAttachments]);

      // Start processing each attachment in parallel
      newAttachments.forEach(async (item) => {
        let fileToUpload = item.file;
        
        try {
          const isImg = item.file.type.startsWith('image/');
          const isVid = item.file.type.startsWith('video/');

          // 1. Validation for Videos (5 minutes maximum length, 50MB maximum size)
          if (isVid) {
            if (item.file.size > 50 * 1024 * 1024) {
              toast.warning('ไฟล์มีขนาดใหญ่เกินกำหนด', 'วิดีโอควรมีขนาดไม่เกิน 50MB');
              setAttachments(prev => prev.map(a => a.id === item.id ? { ...a, status: 'error' as const, error: 'ไฟล์ใหญ่เกิน 50MB' } : a));
              return;
            }

            const duration = await getVideoDuration(item.file);
            if (duration > 300) {
              toast.warning('ความยาววิดีโอเกินกำหนด', 'วิดีโอต้องยาวไม่เกิน 5 นาที (300 วินาที)');
              setAttachments(prev => prev.map(a => a.id === item.id ? { ...a, status: 'error' as const, error: 'ความยาวเกิน 5 นาที' } : a));
              return;
            }
          }

          // 2. Compression (only for images)
          if (isImg) {
            try {
              const blob = await compressImage(item.file);
              fileToUpload = new File([blob], item.file.name, { type: 'image/jpeg' });
            } catch (err) {
              console.error('Compression error:', err);
              // Fall back to original file if compression fails
            }
          }

          // Update status to uploading
          setAttachments(prev => prev.map(a => 
            a.id === item.id ? { ...a, file: fileToUpload, status: 'uploading' as const } : a
          ));

          // 3. Upload
          const publicUrl = await api.storage.uploadAttachmentProgress(
            draftId,
            fileToUpload,
            (pct) => {
              setAttachments(prev => prev.map(a => 
                a.id === item.id ? { ...a, progress: pct } : a
              ));
            }
          );

          // 4. Mark done
          setAttachments(prev => prev.map(a => 
            a.id === item.id ? { ...a, status: 'done' as const, progress: 100, url: publicUrl } : a
          ));

        } catch (error: any) {
          console.error('Pre-upload error:', error);
          setAttachments(prev => prev.map(a => 
            a.id === item.id ? { ...a, status: 'error' as const, error: error.message || 'อัปโหลดไม่สำเร็จ' } : a
          ));
          toast.error(`อัปโหลดไฟล์ ${item.file.name} ไม่สำเร็จ`, error.message || 'กรุณาลองใหม่อีกครั้ง');
        }
      });
    }
  };

  const removeAttachment = async (id: string) => {
    const item = attachments.find(a => a.id === id);
    if (item) {
      URL.revokeObjectURL(item.previewUrl);
      
      // If the file was successfully uploaded, delete it from storage in background
      if (item.status === 'done' && item.url) {
        const provider = detectStorageProvider(item.url);
        if (provider === 'r2') {
          deleteFromR2(item.url).catch(err => console.warn('Clean up of removed file failed:', err));
        }
      }
      
      setAttachments(prev => prev.filter(a => a.id !== id));
    }
  };

  useEffect(() => {
    if (profile) {
      if (profile.company_id && !selectedCompanyId) setSelectedCompanyId(profile.company_id);
      if (profile.full_name && !contactName) setContactName(profile.full_name);
      if (profile.phone && !contactPhone) setContactPhone(formatPhoneNumber(profile.phone));
    }
  }, [profile]);

  useEffect(() => {
    if (role === 'customer' && category === 'Power') {
      setCategory('Water Supply');
    }
  }, [role, category]);

  useEffect(() => {
    const options = getSubCategoryOptions();
    if (options.length > 0 && !options.includes(subCategory)) {
      setSubCategory(options[0]);
    }
  }, [category, allSubCategories, dbCategories]);

  useEffect(() => {
    const lastSeenAt = (() => {
      try { return parseInt(localStorage.getItem('crm_lastSeenAt') || '0', 10); } catch { return 0; }
    })();

    // Initial load — detect new tickets since last visit
    (async () => {
      const loadedTickets = await loadData();
      // Mark tickets created after lastSeenAt as NEW (badge)
      if (lastSeenAt > 0 && Array.isArray(loadedTickets) && loadedTickets.length > 0) {
        const newIds = new Set<string>(
          loadedTickets
            .filter((t: any) => t.created_at && new Date(t.created_at).getTime() > lastSeenAt)
            .map((t: any) => t.id)
        );
        if (newIds.size > 0) setNewTicketIds(newIds);
      }
      updateLastSeen();
    })();

    // Realtime subscription — Module 3 enhanced version
    const channel = supabase
      .channel('tickets_changes_m3')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tickets' },
        (payload) => {
          const newTicket = payload.new as any;
          // Mark as new badge
          setNewTicketIds(prev => new Set([...prev, newTicket.id]));
          // Flash indicator
          setRealtimeFlash(true);
          setTimeout(() => setRealtimeFlash(false), 1200);
          // Play chime & toast — only for non-self created (or always for admins/crm)
          const company = newTicket.company_name || 'Unknown';
          const priority = newTicket.priority || 'Low';
          if (priority === 'Critical') {
            ticketNotify.critical(newTicket.id, newTicket.sub_category || 'Critical Issue');
          } else {
            ticketNotify.newTicket(newTicket.id, company);
          }
          // Refresh data silently
          loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tickets' },
        (payload) => {
          const updated = payload.new as any;
          const old = payload.old as any;
          // Flash indicator for any update
          setRealtimeFlash(true);
          setTimeout(() => setRealtimeFlash(false), 800);
          // Play sound for status changes
          if (updated.status !== old?.status) {
            if (updated.status === 'Resolved (Tech)' || updated.status === 'Resolved (CRM)') {
              playChime('resolved');
            } else {
              playChime('update');
            }
          }
          loadData();
        }
      )
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
      setIsLive(false);
    };
  }, [role, profile?.id, profile?.department, initialMode]);

  async function loadData() {
    const [ticketsResult, companiesResult, teamsResult, categoriesResult, subCategoriesResult] = await Promise.allSettled([
      api.tickets.list({ role, profile, mode: initialMode }),
      api.companies.list(),
      api.teams.list(),
      api.masterData.listCategories(),
      api.masterData.listSubCategories()
    ]);

    if (ticketsResult.status === 'fulfilled') {
      setTickets(ticketsResult.value as any);
    } else {
      console.error('Error loading tickets:', ticketsResult.reason);
      toast.error('โหลด Ticket ไม่สำเร็จ', ticketsResult.reason?.message || 'กรุณาตรวจสอบสิทธิ์การเข้าถึง');
    }

    if (companiesResult.status === 'fulfilled') {
      const sorted = [...companiesResult.value].sort((a, b) => a.name.localeCompare(b.name, 'th'));
      setCompanies(sorted);
      if (!selectedCompanyId && role !== 'customer' && sorted.length > 0) {
        setSelectedCompanyId(sorted[0].id);
      }
    } else {
      console.error('Error loading companies:', companiesResult.reason);
      toast.error('โหลดรายชื่อบริษัทไม่สำเร็จ', companiesResult.reason?.message || 'กรุณาตรวจสอบตาราง companies');
    }

    if (teamsResult.status === 'fulfilled') {
      setTeams(teamsResult.value);
    } else {
      console.error('Error loading response teams:', teamsResult.reason);
      toast.error('โหลดทีมตอบสนองไม่สำเร็จ', teamsResult.reason?.message || 'กรุณาตรวจสอบตาราง response_teams');
    }

    if (categoriesResult.status === 'fulfilled') {
      setDbCategories(categoriesResult.value);
    }

    if (subCategoriesResult.status === 'fulfilled') {
      setAllSubCategories(subCategoriesResult.value);
    }

    setLoading(false);
    // Return tickets for badge detection on initial load
    return ticketsResult.status === 'fulfilled' ? (ticketsResult.value as any[]) : [];
  }

  const handleDeleteTicket = async (ticketId: string) => {
    const ok = await confirm({
      title: 'ลบ Ticket',
      message: `คุณต้องการลบ Ticket ${ticketId} ใช่หรือไม่? ข้อมูลประวัติและไฟล์แนบทั้งหมดจะถูกลบและไม่สามารถกู้คืนได้`,
      confirmLabel: 'ลบข้อมูล',
      danger: true
    });
    if (!ok) return;

    try {
      await api.tickets.delete(ticketId);
      toast.success('ลบสำเร็จ', `ลบข้อมูล Ticket ${ticketId} เรียบร้อยแล้ว`);
      loadData();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('ข้อผิดพลาด', 'ไม่สามารถลบ Ticket ได้ กรุณาลองใหม่อีกครั้ง');
    }
  };


  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const search = searchQuery.toLowerCase();
      const compName = ticket.companies?.name || ticket.company_name || '';
      const area = ticket.area || '';
      const matchesSearch = [ticket.id, compName, area, ticket.sub_category, ticket.location_text, ticket.assignee]
        .some((value) => (value || '').toLowerCase().includes(search));
      
      const matchesArea = areaFilter === 'ทั้งหมด' || ticket.area === areaFilter;
      const matchesCategory = categoryFilter === 'ทั้งหมด' || ticket.category === categoryFilter;
      const matchesStatus = statusFilter === 'ทั้งหมด' || ticket.status === statusFilter;
      const matchesChannel = channelFilter === 'ทั้งหมด' || ticket.channel === channelFilter;
      const matchesAssignee = assigneeFilter === 'ทั้งหมด' || ticket.assignee === assigneeFilter;
      const matchesSla = slaFilter === 'ทั้งหมด' || (slaFilter === 'เสี่ยง SLA' ? ticket.priority === 'Critical' || ticket.priority === 'High' : ticket.status === 'Resolved');
      const matchesResponder = responderFilter === 'ทั้งหมด'
        ? true
        : responderFilter === 'Unassigned'
          ? !(ticket as any).responder
          : (ticket as any).responder?.full_name === responderFilter;
      
      // Quick Card Filter Logic
      let matchesCard = true;
      if (activeCardFilter === 'Critical / High') {
        matchesCard = ['Critical', 'High'].includes(ticket.priority);
      } else if (activeCardFilter === 'In Progress') {
        matchesCard = ticket.status === 'In Progress';
      } else if (activeCardFilter === 'รอ Feedback') {
        matchesCard = ticket.status === 'Resolved (CRM)';
      } else if (activeCardFilter === 'Resolved (Tech)') {
        matchesCard = ticket.status === 'Resolved (Tech)';
      } else if (activeCardFilter === 'Closed') {
        matchesCard = ticket.status === 'Closed';
      }

      const matchesMyTickets = !myTicketsOnly || 
        ticket.created_by === profile?.id || 
        (ticket as any).responder_id === profile?.id;

      return matchesSearch && matchesArea && matchesCategory && matchesStatus && matchesChannel && matchesAssignee && matchesSla && matchesCard && matchesMyTickets && matchesResponder;

    });
  }, [tickets, searchQuery, areaFilter, categoryFilter, statusFilter, channelFilter, assigneeFilter, slaFilter, activeCardFilter, myTicketsOnly, profile?.id, responderFilter]);


  useEffect(() => {
    setPage(1);
  }, [searchQuery, areaFilter, categoryFilter, statusFilter, channelFilter, assigneeFilter, slaFilter, activeCardFilter, myTicketsOnly, responderFilter]);


  const paginatedTickets = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTickets.slice(start, start + pageSize);
  }, [filteredTickets, page]);
  
  const pageCount = Math.ceil(filteredTickets.length / pageSize);

  const areas: string[] = ['ทั้งหมด', ...Array.from(new Set<string>(tickets.map((t) => t.area || '').filter(Boolean)))];
  const assignees: string[] = ['ทั้งหมด', ...Array.from(new Set<string>(tickets.map((t) => t.assignee || '').filter(Boolean)))];
  const responders: string[] = ['ทั้งหมด', 'Unassigned', ...Array.from(new Set<string>(
    tickets.map((t) => (t as any).responder?.full_name || '').filter(Boolean)
  )).sort()];
  const channels = ['ทั้งหมด', 'Tel', 'E-mail', 'Letter', 'Line', 'WhatsApp', 'Walk-in', 'Customer Portal'];
  const allowedCategories: TicketCategory[] = role === 'customer' ? ['Water Supply', 'Facility'] : ['Power', 'Water Supply', 'Facility'];
  
  const affectedCompanies = companies.filter((company) => affectedCompanyIds.includes(company.id));
  const affectedSuggestions = companies.filter((company) => {
    const query = affectedCompanyQuery.trim().toLowerCase();
    const matchesQuery = !query || [company.name, company.area, company.contact_name].some((value) => (value || '').toLowerCase().includes(query));
    return matchesQuery;
  });

  const addAffectedCompany = (companyId: string) => {
    setAffectedCompanyIds((prev) => [...prev, companyId]);
    setAffectedCompanyQuery('');
  };

  const removeAffectedCompany = (companyId: string) => {
    setAffectedCompanyIds((prev) => prev.filter((id) => id !== companyId));
  };

  const handleGetCurrentLocation = () => {
    setIsLocating(true);
    if (!('geolocation' in navigator)) {
      toast.error('ไม่รองรับ Geolocation', 'เบราว์เซอร์นี้ไม่รองรับ Geolocation');
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setPinPos(new L.LatLng(lat, lng));
        setGpsLocation(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        setMapCenter([lat, lng]);
        setIsLocating(false);
      },
      () => {
        toast.warning('ไม่สามารถดึงตำแหน่งได้', 'กรุณาอนุญาตการเข้าถึง Location ในเบราว์เซอร์ก่อน');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const getSubCategoryOptions = () => {
    // If we have database data, use it
    if (allSubCategories.length > 0 && dbCategories.length > 0) {
      const cat = dbCategories.find(c => c.name === category);
      if (cat) {
        const subs = allSubCategories
          .filter(s => s.category_id === cat.id)
          .map(s => s.name);
        if (subs.length > 0) return subs;
      }
    }

    if (category === 'Power') return ['Voltage Drop', 'Blackout', 'Animal Fault', 'Unidentify'];
    if (category === 'Water Supply') return ['Slowly Water Flowing', 'No Water', 'Pipe Leakage', 'Water Quality'];
    return ['Safety: Fire', 'Waste Water Treatment', 'Road / Drainage', 'General Facility'];
  };

  /** Auto-calculate priority based on category, sub-category, affected scope */
  const calculatePriority = (
    cat: string,
    subCat: string,
    affectedCount: number,
    impactRadius: number | null
  ): 'Low' | 'Medium' | 'High' | 'Critical' => {
    // ── Critical: immediate danger / total outage ──
    const criticalSubs = ['Blackout', 'Safety: Fire'];
    if (criticalSubs.includes(subCat)) return 'Critical';
    if (cat === 'Power' && affectedCount >= 5) return 'Critical';
    if (cat === 'Power' && impactRadius && impactRadius >= 1000) return 'Critical';

    // ── High: significant disruption ──
    const highSubs = ['No Water', 'Animal Fault', 'Waste Water Treatment'];
    if (highSubs.includes(subCat)) return 'High';
    if (cat === 'Power' && affectedCount >= 2) return 'High';
    if (cat === 'Power' && impactRadius && impactRadius >= 300) return 'High';
    if (cat === 'Water Supply' && subCat === 'Pipe Leakage') return 'High';

    // ── Medium: standard service issues ──
    const mediumSubs = ['Voltage Drop', 'Slowly Water Flowing', 'Water Quality', 'Road / Drainage'];
    if (mediumSubs.includes(subCat)) return 'Medium';
    if (cat === 'Power') return 'Medium'; // Power default

    // ── Low: general / non-urgent ──
    return 'Low';
  };

  const handleCreateTicket = async () => {
    // 1. Zod Validation
    const schema = z.object({
      selectedCompanyId: z.string().min(1, 'กรุณาเลือกบริษัท/โรงงาน'),
      description: z.string().min(10, 'กรุณาระบุรายละเอียดปัญหาอย่างน้อย 10 ตัวอักษร'),
      contactName: z.string().min(2, 'กรุณาระบุชื่อผู้ติดต่อ'),
      contactPhone: z.string().regex(/^[0-9\-\s]{9,12}$/, 'กรุณาระบุเบอร์โทรให้ถูกต้อง (9-12 หลัก)'),
      lat: z.number({ message: 'กรุณาปักหมุดตำแหน่งที่เกิดเหตุบนแผนที่' })
    });

    const result = schema.safeParse({
      selectedCompanyId,
      description,
      contactName,
      contactPhone,
      lat: pinPos?.lat
    });

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach(err => {
        if (err.path[0]) {
          errors[err.path[0] as string] = err.message;
        }
      });
      setFormErrors(errors);
      // Auto-scroll to first error field
      setTimeout(() => {
        const firstErrorEl = document.querySelector('[data-field-error]');
        if (firstErrorEl) {
          firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
      return;
    }

    setFormErrors({});

    // ── Confirm before submitting ──
    const ok = await confirm({
      title: 'ยืนยันเปิด Ticket',
      message: `เปิด Ticket ประเภท "${category}" ให้บริษัทที่เลือกไว้ ยืนยันใช่ไหม?`,
      confirmLabel: 'เปิด Ticket',
    });
    if (!ok) return;
    
    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      const safeCompanyId = role === 'customer' ? profile?.company_id : selectedCompanyId;
      const safeCategory = role === 'customer' && category === 'Power' ? 'Water Supply' : category;
      const company = companies.find(c => c.id === safeCompanyId);

      const newTicket = {
        type: role === 'customer' ? 'Service Request' : (safeCategory === 'Power' ? 'Internal Ticket' : 'Operational Task'),
        category: safeCategory,
        sub_category: subCategory || getSubCategoryOptions()[0],
        description,
        channel: role === 'customer' ? 'Customer Portal' : formChannel,
        company_id: safeCompanyId || null,
        company_name: company?.name || null,
        area: company?.area || null,
        location_text: locationDetail || gpsLocation,
        lat: pinPos?.lat || null,
        lng: pinPos?.lng || null,
        impact_radius_meters: safeCategory === 'Power' ? impactRadiusMeters : null,
        duration_min: safeCategory === 'Power' ? (durationMin || null) : null,
        contact_name: contactName,
        contact_phone: contactPhone,
        created_by: user?.id || null,
        status: 'Open',
        priority: calculatePriority(
          safeCategory,
          subCategory || getSubCategoryOptions()[0],
          safeCategory === 'Power' ? affectedCompanyIds.length : 0,
          safeCategory === 'Power' ? impactRadiusMeters : null
        )
      };

      const ticket = await api.tickets.create(newTicket as any);

      // Add affected companies if Power
      if (safeCategory === 'Power' && affectedCompanyIds.length > 0) {
        await supabase.from('ticket_affected_companies').insert(
          affectedCompanyIds.map(cid => ({ ticket_id: ticket.id, company_id: cid }))
        );
      }

      // Grab pre-uploaded image URLs
      const preUploadedUrls = attachments
        .filter(a => a.status === 'done' && a.url)
        .map(a => a.url as string);

      let media_urls = preUploadedUrls;

      // Finalize attachments in R2: Move from drafts/draft-yymmdd-xxxx to T260518-xxxx
      if (preUploadedUrls.length > 0) {
        try {
          const finalizedUrls = await api.storage.finalizeAttachments(draftId, ticket.id);
          if (finalizedUrls && finalizedUrls.length > 0) {
            media_urls = finalizedUrls;
          }
        } catch (finalizeErr) {
          console.warn('Failed to finalize attachments to R2 ticket folder, using draft URLs:', finalizeErr);
        }
      }

      // Add initial log
      await api.tickets.addLog({
        ticket_id: ticket.id,
        message: `Ticket opened via ${newTicket.channel}`,
        author_role: role as any,
        author_name: user?.email || 'Anonymous',
        status_to: 'Open',
        media_urls
      });

      // Reset all form states
      setSubCategory('');
      setDescription('');
      setLocationDetail('');
      setDurationMin('');
      setContactName('');
      setContactPhone('');
      setSelectedCompanyId(profile?.company_id || '');
      setAffectedCompanyIds([]);
      setGpsLocation('');
      setPinPos(null);

      setIsCreateModalOpen(false);
      // Auto-refresh ticket table
      await loadData();
      toast.success('เปิด Ticket สำเร็จ', `${ticket.id} • ${safeCategory} • สถานะ Open`);
    } catch (err: any) {
      toast.error('บันทึกไม่สำเร็จ', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignTeam = async (ticketId: string, teamName: string) => {
    const ok = await confirm({
      title: 'ยืนยันการมอบหมายงาน',
      message: `ต้องการมอบหมายงานให้ทีม ${teamName} ใช่หรือไม่?`,
      confirmLabel: 'ยืนยัน',
    });
    if (!ok) return;

    try {
      await api.tickets.assign(ticketId, teamName, role);
      toast.success('Assigned', `มอบหมายงานให้ทีม ${teamName} แล้ว`);
      setAssignModalTicketId(null);
      loadData();
    } catch (error) {
      console.error('Error assigning team:', error);
      toast.error('Error', 'ไม่สามารถมอบหมายงานได้');
    }
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackTicketId || !feedback.score) {
      toast.warning('กรุณาให้คะแนนก่อน', 'กรุณาเลือกดาวก่อนส่ง Feedback');
      return;
    }

    try {
      setSubmitting(true);
      // 0. Get current ticket to check for assignee
      const ticket = (await api.tickets.get(feedbackTicketId)) as any;

      // 1. Insert Feedback while ticket is still Resolved for RLS validation
      await api.tickets.addFeedback({
        ticket_id: feedbackTicketId,
        score: feedback.score,
        comment: feedback.comment || '',
        submitted_by: profile?.id
      });

      // 2. Update ticket to Closed
      await api.tickets.closeWithTeamRelease(feedbackTicketId);

      // 3. Add log for record
      await api.tickets.addLog({
        ticket_id: feedbackTicketId,
        message: `ลูกค้าให้ Feedback (${feedback.score} ดาว): ${feedback.comment || '-'}`,
        author_name: profile?.full_name || 'Customer',
        author_role: 'customer',
        status_from: 'Resolved',
        status_to: 'Closed'
      });

      toast.success('ขอบคุณสำหรับ Feedback!', 'ปิดงานเรียบร้อยแล้ว');
      setIsFeedbackModalOpen(false);
      setFeedback({ score: 0, comment: '' });
      setFeedbackTicketId(null);
      loadData();
    } catch (error: any) {
      console.error('Feedback error detail:', error);
      const errorMsg = error.message || error.details || 'กรุณาลองใหม่อีกครั้ง';
      toast.error('ไม่สามารถส่ง Feedback ได้', errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaimToggle = (ticket: Ticket) => {
    if (!profile || (role !== 'admin' && role !== 'crm' && role !== 'technician')) return;

    const isCustomerOpened = (ticket as any).creator?.role === 'customer';
    const responder = (ticket as any).responder;
    const isClaimedByMe = responder && profile.emp_id && responder.emp_id === profile.emp_id;

    if (!isCustomerOpened) return; // Only allow claim/unclaim on customer-opened tickets

    if (!responder) {
      // No one has claimed — show claim confirm
      setConfirmClaim({ type: 'claim', ticketId: ticket.id, previousStatus: ticket.status });
    } else if (isClaimedByMe) {
      // I claimed it — show unclaim confirm
      setConfirmClaim({ type: 'unclaim', ticketId: ticket.id, previousStatus: ticket.status });
    }
    // Someone else claimed it — do nothing
  };

  const executeClaimToggle = async () => {
    if (!confirmClaim || !profile) return;
    setSubmitting(true);
    try {
      const isClaim = confirmClaim.type === 'claim';
      const newResponderId = isClaim ? profile.id : null;
      const currentStatus = confirmClaim.previousStatus || 'Open';

      // 1. Update ticket: responder_id ONLY
      await api.tickets.update(
        confirmClaim.ticketId,
        { responder_id: newResponderId } as any,
        { name: profile.full_name || 'User', role: profile.role, id: profile.id }
      );

      // 2. Write audit log
      await api.tickets.addLog({
        ticket_id: confirmClaim.ticketId,
        message: isClaim
          ? `${profile.full_name} รับเป็น Response เคสนี้`
          : `${profile.full_name} ยกเลิก Response เคสนี้`,
        author_id: profile.id,
        author_name: profile.full_name || 'User',
        author_role: profile.role as any,
        status_from: currentStatus,
        status_to: currentStatus,
        is_internal: true,
      });

      toast.success(
        isClaim ? 'รับเป็น Response เรียบร้อยแล้ว' : 'ยกเลิก Response เรียบร้อยแล้ว',
        isClaim ? 'ระบบบันทึกการรับเคสแล้ว' : 'ระบบบันทึกการยกเลิกเคสแล้ว'
      );
      loadData();
    } catch (error: any) {
      toast.error('เกิดข้อผิดพลาด', error.message);
    } finally {
      setSubmitting(false);
      setConfirmClaim(null);
    }
  };

  const SkeletonCard = () => (
    <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm animate-pulse">
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <div className="h-3 w-20 bg-slate-100 rounded" />
          <div className="h-8 w-12 bg-slate-100 rounded" />
        </div>
        <div className="w-10 h-10 bg-slate-50 rounded-lg" />
      </div>
    </div>
  );

  const TableSkeleton = () => (
    <div className="space-y-4 p-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 py-4 border-b border-slate-50 animate-pulse">
          <div className="h-4 w-8 bg-slate-100 rounded" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 bg-slate-100 rounded" />
            <div className="h-3 w-24 bg-slate-50 rounded" />
          </div>
          <div className="h-6 w-20 bg-slate-100 rounded-full" />
          <div className="h-8 w-24 bg-slate-50 rounded-lg" />
        </div>
      ))}
    </div>
  );

  return (
    <>
    <div className="max-w-[1800px] mx-auto space-y-6">
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {loading && filteredTickets.length === 0 ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          [
            { label: initialMode === 'assigned' ? 'งานที่รับผิดชอบ' : 'Ticket ทั้งหมด', value: tickets.length, tone: 'border-primary', icon: CheckCircle2, filter: null },
            { label: 'Critical / High', value: tickets.filter((ticket) => ['Critical', 'High'].includes(ticket.priority)).length, tone: 'border-red-400', icon: AlertTriangle, filter: 'Critical / High' },
            { label: 'รอตรวจรับ (Tech)', value: tickets.filter((ticket) => ticket.status === 'Resolved (Tech)').length, tone: 'border-amber-400', icon: Loader2, filter: 'Resolved (Tech)' },
            { label: 'รอ Feedback (CRM)', value: tickets.filter((ticket) => ticket.status === 'Resolved (CRM)').length, tone: 'border-emerald-400', icon: Send, filter: 'รอ Feedback' },
            { label: 'Closed', value: tickets.filter((ticket) => ticket.status === 'Closed').length, tone: 'border-slate-400', icon: CheckCircle2, filter: 'Closed' },
          ].map((card) => {
            const Icon = card.icon;
            const isActive = activeCardFilter === card.filter;
            return (
              <div 
                key={card.label} 
                onClick={() => setActiveCardFilter(isActive ? null : card.filter)}
                className={`bg-white p-5 rounded-xl shadow-sm border-l-4 transition-all cursor-pointer hover:shadow-md active:scale-[0.98] ${card.tone} ${isActive ? 'ring-2 ring-primary ring-offset-2' : ''}`}
              >
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500">{card.label}</p>
                    <p className="text-3xl font-black text-primary mt-1">{card.value}</p>
                  </div>
                  <Icon size={20} className={isActive ? 'text-primary' : 'text-slate-400'} />
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="ค้นหา Ticket ID, บริษัท, พื้นที่, ทีม..."
                value={searchQuery}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
            
            <button
              onClick={() => {
                const newState = !showMap;
                setShowMap(newState);
                localStorage.setItem('crm_showMap', String(newState));
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-sm font-medium ${showMap ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              <MapIcon size={16} />
              <span className="hidden sm:inline">{showMap ? 'ซ่อนแผนที่' : 'แสดงแผนที่'}</span>
            </button>
            
            <button
              onClick={() => setMyTicketsOnly(!myTicketsOnly)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-sm font-black tracking-tight ${myTicketsOnly ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              <User size={16} className={myTicketsOnly ? 'text-white' : 'text-slate-400'} />
              <span className="hidden sm:inline">เฉพาะงานของฉัน</span>
            </button>

            <button
              onClick={() => setShowMoreFilters(!showMoreFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-sm font-medium ${showMoreFilters ? 'bg-slate-100 text-slate-900 border-slate-300' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              <Filter size={16} />
              <span className="hidden sm:inline">{showMoreFilters ? 'ซ่อนตัวกรอง' : 'ตัวกรอง'}</span>
              {(areaFilter !== 'ทั้งหมด' || categoryFilter !== 'ทั้งหมด' || statusFilter !== 'ทั้งหมด' || channelFilter !== 'ทั้งหมด' || slaFilter !== 'ทั้งหมด' || assigneeFilter !== 'ทั้งหมด' || responderFilter !== 'ทั้งหมด') && (
                <span className="w-2 h-2 rounded-full bg-primary" />
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* ── Module 3: Live Status Indicator ── */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-black transition-all duration-300 ${
                isLive
                  ? realtimeFlash
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.4)] scale-105'
                    : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                  : 'bg-slate-50 text-slate-400 border-slate-200'
              }`}
              title={isLive ? 'Supabase Realtime: Connected — auto-refreshing' : 'Realtime: Connecting...'}
            >
              <span className={`w-2 h-2 rounded-full ${isLive ? (realtimeFlash ? 'bg-emerald-400 animate-ping' : 'bg-emerald-400 animate-pulse') : 'bg-slate-300'}`} />
              <span className="hidden sm:inline">{isLive ? 'LIVE' : 'OFFLINE'}</span>
            </div>
            {role !== 'technician' && (
              <button onClick={() => setIsCreateModalOpen(true)} className="px-5 py-2.5 bg-primary text-white text-sm font-black rounded-lg hover:bg-primary-container shadow-sm flex items-center gap-2">
                <Plus size={16} />
                {role === 'customer' ? 'ขอรับบริการ / แจ้งงาน' : 'เปิด Ticket ใหม่'}
              </button>
            )}
          </div>
        </div>

        {/* Active Filter Chips */}
        {(areaFilter !== 'ทั้งหมด' || categoryFilter !== 'ทั้งหมด' || statusFilter !== 'ทั้งหมด' || channelFilter !== 'ทั้งหมด' || slaFilter !== 'ทั้งหมด' || assigneeFilter !== 'ทั้งหมด' || responderFilter !== 'ทั้งหมด' || activeCardFilter) && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Active Filters:</span>
            {activeCardFilter && (
              <span className="flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold">
                Card: {activeCardFilter}
                <button onClick={() => setActiveCardFilter(null)}><X size={12} /></button>
              </span>
            )}
            {areaFilter !== 'ทั้งหมด' && (
              <span className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">
                Area: {areaFilter}
                <button onClick={() => setAreaFilter('ทั้งหมด')}><X size={12} /></button>
              </span>
            )}
            {myTicketsOnly && (
              <span className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-[10px] font-black border border-indigo-100">
                Ticket ของฉัน
                <button onClick={() => setMyTicketsOnly(false)}><X size={12} /></button>
              </span>
            )}
            {categoryFilter !== 'ทั้งหมด' && (
              <span className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">
                Category: {categoryFilter}
                <button onClick={() => setCategoryFilter('ทั้งหมด')}><X size={12} /></button>
              </span>
            )}
            {statusFilter !== 'ทั้งหมด' && (
              <span className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">
                Status: {statusFilter}
                <button onClick={() => setStatusFilter('ทั้งหมด')}><X size={12} /></button>
              </span>
            )}
            {responderFilter !== 'ทั้งหมด' && (
              <span className="flex items-center gap-1 px-2 py-1 bg-violet-50 text-violet-700 rounded-full text-[10px] font-bold border border-violet-100">
                Response: {responderFilter}
                <button onClick={() => setResponderFilter('ทั้งหมด')}><X size={12} /></button>
              </span>
            )}
              <button 
                onClick={() => {
                  setAreaFilter('ทั้งหมด');
                  setCategoryFilter('ทั้งหมด');
                  setStatusFilter('ทั้งหมด');
                  setChannelFilter('ทั้งหมด');
                  setSlaFilter('ทั้งหมด');
                  setAssigneeFilter('ทั้งหมด');
                  setResponderFilter('ทั้งหมด');
                  setActiveCardFilter(null);
                  setSearchQuery('');
                }}
                className="text-xs font-bold text-primary hover:underline ml-2"
              >
              ล้างทั้งหมด
            </button>
          </div>
        )}

        <AnimatePresence>
          {showMoreFilters && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 pt-4 border-t border-slate-100">
                <FilterSelect label="Area" value={areaFilter} onChange={setAreaFilter} options={areas} />
                <FilterSelect label="Category" value={categoryFilter} onChange={(value) => setCategoryFilter(value as typeof categoryFilter)} options={['ทั้งหมด', ...allowedCategories]} />
                <FilterSelect label="Status" value={statusFilter} onChange={(value) => setStatusFilter(value as typeof statusFilter)} options={['ทั้งหมด', 'Open', 'In Progress', 'Resolved', 'Closed']} />
                <FilterSelect label="Channel" value={channelFilter} onChange={setChannelFilter} options={channels} />
                <FilterSelect label="SLA" value={slaFilter} onChange={setSlaFilter} options={['ทั้งหมด', 'เสี่ยง SLA', 'รอ Auto-close']} />
                <FilterSelect label="Assignee (Team)" value={assigneeFilter} onChange={setAssigneeFilter} options={assignees} />
                <FilterSelect label="Response (Staff)" value={responderFilter} onChange={setResponderFilter} options={responders} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-12 2xl:grid-cols-12 gap-6 items-start" style={{ isolation: 'isolate' }}>
        <div className={`${showMap ? 'xl:col-span-8 2xl:col-span-9' : 'xl:col-span-12 2xl:col-span-12'} bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col max-h-[calc(100vh-180px)] overflow-hidden transition-all duration-300`}>
          {/* ... table content ... */}
          {/* ── Mobile Card View (hidden on md+) ── */}
          <div className="md:hidden p-4 space-y-3 overflow-y-auto flex-1 scroll-smooth">
            {loading ? (
              <div className="py-16 text-center">
                <Loader2 className="mx-auto animate-spin text-primary mb-2" size={28} />
                <p className="text-sm font-bold text-slate-500 animate-pulse">กำลังโหลด...</p>
              </div>
            ) : paginatedTickets.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-sm">ไม่พบรายการที่ตรงกับการค้นหา</div>
            ) : paginatedTickets.map((ticket, index) => {
              const displayNo = (page - 1) * pageSize + index + 1;
// slaState removed from card level to let SlaBadge manage it
              const lastLogAt = getLastLogAt(ticket);
              return (
                <motion.div 
                  key={ticket.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onSelectTicket(ticket.id)}
                  className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all active:bg-slate-50 relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-primary/20" />
                  
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">#{displayNo}</span>
                        <span className="font-mono text-xs font-black text-blue-600">
                          {ticket.id}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tight ${statusColors[ticket.status as TicketStatus]}`}>{ticket.status}</span>
                        {/* Module 3: New Ticket Badge */}
                        {newTicketIds.has(ticket.id) && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500 text-white rounded-full text-[9px] font-black uppercase tracking-wider animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-white" />
                            NEW
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-black text-slate-800 leading-tight mb-1">{ticket.sub_category}</p>
                      <p className="text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
                        <MapPin size={12} className="text-slate-400" />
                        {ticket.companies?.name || ticket.company_name}
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium line-clamp-1">
                        {ticket.area}{ticket.location_text ? ` • ${ticket.location_text}` : ''} {ticket.contact_name ? `• ${ticket.contact_name}` : ''}
                      </p>
                      {(ticket as any).creator && (
                        <div className="flex items-center gap-2 mt-2 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                          <div className="w-6 h-6 rounded-full overflow-hidden bg-white border border-slate-200 shrink-0">
                            {(ticket as any).creator.emp_id ? (
                              <img src={getAvatarUrl((ticket as any).creator.emp_id)!} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-400">
                                <User size={12} />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black text-slate-700 truncate">{(ticket as any).creator.full_name}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 w-9 h-9 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center border border-slate-100">
                      <Navigation size={16} />
                    </div>
                  </div>

	                  <div className="flex items-center justify-between pt-3 border-t border-dashed border-slate-200">
	                    <div className="flex flex-wrap items-center gap-2">
	                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${priorityColors[ticket.priority as any]}`}>{ticket.priority}</span>
                        {ticket.channel && <span className={`px-2 py-0.5 rounded-md border text-[9px] font-black uppercase ${getChannelClass(ticket.channel)}`}>{ticket.channel}</span>}
                        <SlaBadge ticket={ticket} variant="card" />
	                    </div>
	                    <div className="flex items-center gap-2">
                        {(() => {
                          const isCustomerOpened = (ticket as any).creator?.role === 'customer';
                          const responder = (ticket as any).responder || (!isCustomerOpened ? (ticket as any).creator : null);
                          return responder ? (
                            <div className="flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-1 rounded-lg text-[9px] font-black" title="Response">
                              <User size={10} />
                              {responder.full_name.split(' ')[0]}
                            </div>
                          ) : ticket.assignee ? (
                            <div className="flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-1 rounded-lg text-[9px] font-black" title="Assignee Team">
                              <Users size={10} />
                              {ticket.assignee.split(' ')[0]}
                            </div>
                          ) : (
                            <span className="text-[9px] text-slate-400 font-bold">Unassigned</span>
                          );
                        })()}
	                    </div>
	                  </div>
                    <p className="mt-2 text-[10px] font-bold text-slate-400 flex items-center gap-1">
                      <Clock size={10} /> Last update {formatAge(lastLogAt)}
                    </p>

                  {role === 'customer' && ticket.status === 'Resolved' && (
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setFeedbackTicketId(ticket.id); 
                        setIsFeedbackModalOpen(true); 
                      }} 
                      className="mt-4 w-full py-3 bg-indigo-600 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 active:scale-[0.98] transition-transform"
                    >
                      <Star size={14} className="fill-white" />
                      ให้ Feedback และปิดงาน
                    </button>
                  )}
                </motion.div>
              );
            })}
            {pageCount > 1 && (
              <div className="p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <p className="text-xs font-semibold text-slate-500">
                   หน้า {page} / {pageCount}
                 </p>
                 <div className="flex gap-1">
                   <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 border border-slate-300 rounded-md text-xs font-bold disabled:opacity-50 hover:bg-white">
                     ก่อนหน้า
                   </button>
                   <button disabled={page === pageCount} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 border border-slate-300 rounded-md text-xs font-bold disabled:opacity-50 hover:bg-white">
                     ถัดไป
                   </button>
                 </div>
              </div>
            )}
          </div>

          {/* ── Desktop Table View (hidden on mobile) ── */}
          <div className="hidden md:block overflow-x-auto overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent flex-1 scroll-smooth">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead className="sticky top-0 z-30">
                <tr className="bg-slate-50/90 backdrop-blur-md border-b border-slate-200">
                  <th className="sticky left-0 z-50 bg-slate-50/90 backdrop-blur-md px-4 py-4 text-xs font-black uppercase tracking-wider text-slate-500 min-w-[210px] border-b border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">Ticket / Issue</th>
                  <th className="px-3 py-4 text-xs font-black uppercase tracking-wider text-slate-500 min-w-[260px] border-b border-slate-200">Customer / Location</th>
                  <th className="px-3 py-4 text-xs font-black uppercase tracking-wider text-slate-500 min-w-[165px] border-b border-slate-200">Status / SLA</th>
                  <th className="px-3 py-4 text-xs font-black uppercase tracking-wider text-slate-500 min-w-[170px] border-b border-slate-200">Response / Team</th>
                  <th className="px-3 py-4 text-xs font-black uppercase tracking-wider text-slate-500 min-w-[150px] border-b border-slate-200">Last Update</th>
                  <th className="sticky right-0 z-40 bg-slate-50/90 backdrop-blur-md px-4 py-4 text-xs font-black uppercase tracking-wider text-slate-500 text-right min-w-[100px] border-b border-slate-200 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.05)]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && tickets.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <TableSkeleton />
                    </td>
                  </tr>
                ) : paginatedTickets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-20 text-center text-slate-400">ไม่พบรายการที่ตรงกับการค้นหา</td>
                  </tr>
                ) : paginatedTickets.map((ticket, index) => {
                  const isNearBottom = index > paginatedTickets.length - 4 && paginatedTickets.length > 5;
                  // slaState managed by SlaBadge
                  const lastLogAt = getLastLogAt(ticket);
                  
                  return (
                    <tr
                      key={ticket.id}
                      className={`hover:bg-primary/5 transition-colors group ${
                        newTicketIds.has(ticket.id) ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <td className="sticky left-0 z-20 bg-white group-hover:bg-slate-50 px-4 py-4 border-b border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        <div className="flex items-center gap-2 mb-1">
                          <button 
                            onClick={() => onSelectTicket(ticket.id)} 
                            className="font-mono text-sm font-black text-blue-600 hover:underline transition-colors"
                          >
                            {ticket.id}
                          </button>
                          {/* Module 3: New Ticket Badge (Desktop) */}
                          {newTicketIds.has(ticket.id) && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500 text-white rounded-full text-[9px] font-black uppercase animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-white" />
                              NEW
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-black text-slate-800 leading-tight max-w-[180px] truncate">{ticket.sub_category || 'General request'}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-black uppercase tracking-widest ${categoryColors[ticket.category as TicketCategory] || 'bg-slate-50 text-slate-600 border-slate-100/50'}`}>
                            {ticket.category === 'Power' && <Zap size={12} className="fill-amber-500 text-amber-500" />}
                            {ticket.category === 'Water Supply' && <Droplets size={12} className="fill-sky-500 text-sky-500" />}
                            {ticket.category === 'Facility' && <Building2 size={12} className="fill-indigo-500 text-indigo-500" />}
                            {ticket.category}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-4 border-b border-slate-100">
                        <p className="text-sm font-black text-slate-700 text-left truncate max-w-[320px]">
                          {ticket.companies?.name || ticket.company_name}
                        </p>
                        <div className="flex flex-col gap-1 mt-1.5">
                          <p className="text-xs text-slate-600 font-bold flex items-center gap-1.5">
                            <MapPin size={14} className="text-slate-500" /> {ticket.area || '-'}{ticket.location_text ? ` • ${ticket.location_text}` : ''}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <User size={14} className="text-slate-400 shrink-0" /> 
                              <span className="text-xs text-slate-700 font-black truncate">{ticket.contact_name || 'N/A'}</span>
                              {ticket.contact_phone ? <span className="text-blue-600 font-black text-[11px] bg-blue-50 px-1.5 py-0.5 rounded ml-1 truncate">📞 {formatPhoneNumber(ticket.contact_phone)}</span> : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 border-b border-slate-100">
                        <div className="flex flex-col gap-2">
                          <span className={`inline-flex w-fit px-3 py-1 rounded-lg text-xs font-black uppercase tracking-widest border ${statusColors[ticket.status as TicketStatus]}`}>
                            {ticket.status}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${
                              ticket.priority === 'Critical' ? 'bg-red-500' : 
                              ticket.priority === 'High' ? 'bg-orange-500' : 
                              ticket.priority === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'
                            } animate-pulse`} />
                            <span className="text-xs font-black text-slate-500 uppercase">{ticket.priority}</span>
                          </div>
                          <SlaBadge ticket={ticket} variant="list" />
                        </div>
                      </td>
                      <td className="px-3 py-4 border-b border-slate-100">
                        <div className="space-y-3">
                          {/* Response */}
                          {(() => {
                            const isCustomerOpened = (ticket as any).creator?.role === 'customer';
                            const responder = (ticket as any).responder || (!isCustomerOpened ? (ticket as any).creator : null);
                            const hasPermission = profile && (role === 'admin' || role === 'crm' || role === 'technician');
                            
                            return (
                              <div className={`flex items-center gap-2 ${!responder && hasPermission ? 'cursor-pointer hover:bg-slate-50/50 rounded-md transition-colors' : ''}`}
                                onClick={(e) => {
                                  if (hasPermission && (!responder || responder.emp_id === profile.emp_id)) {
                                    e.stopPropagation();
                                    handleClaimToggle(ticket);
                                  }
                                }}
                              >
                                <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-100 border border-slate-200 shrink-0 shadow-sm flex items-center justify-center">
                                  {responder?.emp_id ? (
                                    <img src={getAvatarUrl(responder.emp_id)!} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <User size={14} className="text-slate-400" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider leading-none mb-1">Response</p>
                                  {responder ? (
                                    <p className="text-xs font-black text-slate-800 truncate">{responder.full_name || 'System'}</p>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] font-bold text-amber-600 italic">Unassigned</span>
                                      {hasPermission && (
                                        <span className="text-[9px] font-black text-white bg-amber-500 px-1.5 py-0.5 rounded uppercase animate-pulse">Claim</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                {responder?.emp_id === profile?.emp_id && isCustomerOpened && (
                                  <XCircle size={14} className="text-red-400 hover:text-red-600 ml-1 cursor-pointer shrink-0" 
                                    onClick={(e) => { e.stopPropagation(); handleClaimToggle(ticket); }} 
                                  />
                                )}
                              </div>
                            );
                          })()}

                          {/* Team/Assignee */}
                          <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-[10px] font-black text-indigo-600 border border-indigo-100 shrink-0 shadow-sm">
                              {ticket.assignee ? ticket.assignee.charAt(0) : '?'}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-wider leading-none mb-1">Team</p>
                              {ticket.assignee ? (
                                <p className="text-xs font-black text-slate-700 truncate">{ticket.assignee}</p>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-400 italic">Not Assigned</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 border-b border-slate-100">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-black text-slate-700 flex items-center gap-1">
                            <Clock size={12} className="text-slate-400" /> {formatAge(lastLogAt)}
                          </span>
                          <span className="text-[11px] font-bold text-slate-400">Created {formatShortDateTime(ticket.created_at)}</span>
                          {lastLogAt !== ticket.created_at && (
                            <span className="text-[11px] font-bold text-slate-400">Last log {formatShortDateTime(lastLogAt)}</span>
                          )}
                        </div>
                      </td>
                      <td className={`sticky right-0 ${activeMenuId === ticket.id ? 'z-50' : 'z-20'} bg-white group-hover:bg-slate-50 px-4 py-4 text-right border-b border-slate-100 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.05)]`}>
                        <div className="flex items-center justify-end gap-2 relative">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (activeMenuId === ticket.id) {
                                setActiveMenuId(null);
                                setMenuAnchor(null);
                              } else {
                                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                const openUp = rect.bottom + 200 > window.innerHeight;
                                setMenuAnchor({
                                  top: openUp ? rect.top : rect.bottom + 4,
                                  right: window.innerWidth - rect.right,
                                  openUp,
                                });
                                setActiveMenuId(ticket.id);
                              }
                            }}
                            className="px-4 py-2 text-xs font-black text-primary bg-primary/5 border border-primary/10 rounded-lg hover:bg-primary/10 flex items-center gap-1.5 transition-all shadow-sm"
                          >
                            จัดการ <ChevronDown size={14} />
                          </button>

                          <AnimatePresence>
                            {activeMenuId === ticket.id && menuAnchor && (
                              <motion.div
                                key="backdrop"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[9998]"
                                onClick={() => { setActiveMenuId(null); setMenuAnchor(null); }}
                              />
                            )}
                          </AnimatePresence>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pageCount > 1 && (
              <div className="p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <p className="text-xs font-semibold text-slate-500">
                   หน้า {page} / {pageCount}
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
          </div>
        </div>

        {/* ── Map Sidebar ── */}
        <div className="xl:col-span-4 2xl:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col sticky top-24">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-black text-primary flex items-center gap-2">
              <MapIcon size={18} />
              Ticket Map
            </h3>
            <span className="text-[10px] font-black text-slate-500">{filteredTickets.length} รายการ</span>
          </div>
          <div className="h-[420px]">
            <MapContainer center={[13.7563, 101.568]} zoom={13} style={{ height: '100%', width: '100%' }}>
              <MapBounds tickets={filteredTickets} />
              <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {filteredTickets.map((ticket) => (
                <Marker key={ticket.id} position={[Number(ticket.lat), Number(ticket.lng)] as L.LatLngExpression} icon={customIcon}>
                  <Popup>
                    <div className="font-sans">
                      <button 
                        onClick={() => onSelectTicket(ticket.id)}
                        className="text-primary block font-bold text-left hover:underline w-full cursor-pointer"
                      >
                        {ticket.id}
                      </button>
                      <span className="text-xs">{ticket.companies?.name || ticket.company_name}</span>
                      <br />
                      <span className="text-xs text-slate-500">{ticket.location_text}</span>
                      {ticket.category === 'Power' && ticket.impact_radius_meters && (
                        <>
                          <br />
                          <span className="text-xs text-red-700 font-bold">Impact radius: {ticket.impact_radius_meters.toLocaleString()} m</span>
                        </>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
              {filteredTickets
                .filter((ticket) => ticket.category === 'Power' && ticket.impact_radius_meters)
                .map((ticket) => (
                  <Circle
                    key={`${ticket.id}-radius`}
                    center={[Number(ticket.lat), Number(ticket.lng)] as L.LatLngExpression}
                    radius={ticket.impact_radius_meters || 0}
                    pathOptions={{ color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.12, weight: 2 }}
                  />
                ))}
            </MapContainer>
          </div>
        </div>
      </section>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-lg font-black text-primary">{role === 'customer' ? 'ขอรับบริการ / แจ้งงาน' : 'เปิด Ticket ใหม่'}</h3>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              <form className="space-y-4">
                <div className={`grid gap-3 ${allowedCategories.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {allowedCategories.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCategory(item)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${category === item ? 'border-primary bg-blue-50 text-primary shadow-sm' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}
                    >
                      <p className="font-black text-sm">{item}</p>
                      <p className="text-[11px] mt-1 opacity-70">{item === 'Power' ? 'Internal only' : item === 'Water Supply' ? 'น้ำประปา / แรงดันน้ำ' : 'Facility / Safety / Waste water'}</p>
                    </button>
                  ))}
                </div>

                <Field label="ปัญหาย่อย (Sub-category)">
                  <select value={subCategory} onChange={(e) => setSubCategory(e.target.value)} className="w-full form-field h-[42px] font-bold text-slate-800">
                    {getSubCategoryOptions().map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>

                {role !== 'customer' && (
                  <ChannelSelector value={formChannel} onChange={setFormChannel} />
                )}

                <FieldWithError label="ชื่อบริษัท / โรงงาน (เลือกโซนก่อนเพื่อหาได้ง่ายขึ้น)" error={formErrors.selectedCompanyId}>
                  {role === 'customer' ? (
                    <div className="w-full form-field bg-slate-50 text-slate-500 cursor-not-allowed">
                      {companies.find(c => c.id === selectedCompanyId)?.name || 'กำลังดึงข้อมูลบริษัท...'}
                    </div>
                  ) : (
                    <div className="space-y-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                      <div className="flex flex-wrap gap-1.5">
                        {zones.map(zone => (
                          <button
                            key={zone}
                            type="button"
                            onClick={() => setZoneFilter(zone)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
                              zoneFilter === zone 
                              ? 'bg-indigo-600 text-white shadow-md' 
                              : 'bg-white text-slate-500 hover:text-slate-700 border border-slate-200'
                            }`}
                          >
                            {zone}
                          </button>
                        ))}
                      </div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input
                          type="text"
                          placeholder="ค้นหาชื่อบริษัท / โรงงาน..."
                          value={companySearch}
                          onChange={(e) => setCompanySearch(e.target.value)}
                          className="w-full form-field pl-9 text-sm border-slate-200 focus:bg-white transition-colors"
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y bg-white shadow-inner">
                        {searchableCompanies.length > 0 ? (
                          searchableCompanies.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setSelectedCompanyId(c.id)}
                              className={`w-full text-left px-4 py-3 hover:bg-indigo-50 transition-all flex items-center justify-between border-l-4 ${
                                selectedCompanyId === c.id 
                                ? 'bg-indigo-50 border-indigo-500' 
                                : 'border-transparent'
                              }`}
                            >
                              <div>
                                <p className={`text-sm font-black transition-colors ${selectedCompanyId === c.id ? 'text-indigo-900' : 'text-slate-800'}`}>
                                  {c.name}
                                </p>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">
                                  {c.area || 'ไม่ระบุโซน'}
                                </p>
                              </div>
                              {selectedCompanyId === c.id && (
                                <div className="bg-indigo-500 rounded-full p-1 shadow-sm">
                                  <Check size={10} className="text-white" strokeWidth={4} />
                                </div>
                              )}
                            </button>
                          ))
                        ) : (
                          <div className="p-6 text-center">
                            <p className="text-xs text-slate-400 font-medium">ไม่พบรายชื่อบริษัทในเงื่อนไขที่เลือก</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </FieldWithError>

                {category === 'Power' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Duration (Min.)">
                      <input 
                        type="number" 
                        className="w-full form-field" 
                        placeholder="เช่น 38" 
                        value={durationMin}
                        onChange={(e) => setDurationMin(Number(e.target.value) || '')}
                      />
                    </Field>
                    <Field label="รัศมีผลกระทบไฟฟ้า (เมตร)">
                      <div className="space-y-2">
                        <input
                          type="number"
                          min={100}
                          max={5000}
                          step={50}
                          value={impactRadiusMeters}
                          onChange={(event) => setImpactRadiusMeters(Number(event.target.value))}
                          className="w-full form-field"
                        />
                        <input
                          type="range"
                          min={100}
                          max={5000}
                          step={50}
                          value={impactRadiusMeters}
                          onChange={(event) => setImpactRadiusMeters(Number(event.target.value))}
                          className="w-full accent-red-600"
                        />
                      </div>
                    </Field>
                  </div>
                )}

                {/* ── แผนที่ปักหมุด อยู่ถัดจากรัศมี ให้เห็นวงกลมเปลี่ยนทันที ── */}
                <div {...(formErrors.lat ? { 'data-field-error': 'true' } : {})}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-slate-600 uppercase flex items-center gap-1.5">
                      <MapPin size={13} />
                      ปักหมุดตำแหน่งที่เกิดเหตุ
                    </span>
                    <button
                      type="button"
                      onClick={handleGetCurrentLocation}
                      disabled={isLocating}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                    >
                      {isLocating ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />}
                      {isLocating ? 'กำลังค้นหา...' : 'ตำแหน่งปัจจุบัน'}
                    </button>
                  </div>
                  <div className={`h-56 rounded-xl overflow-hidden border-2 ${formErrors.lat ? 'border-red-400' : 'border-slate-300'}`}>
                    <MapContainer center={[13.7563, 101.568]} zoom={13} style={{ height: '100%', width: '100%' }}>
                      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <LocationSelector setGpsLocation={setGpsLocation} setPinPos={setPinPos} pinPos={pinPos} />
                      {category === 'Power' && pinPos && (
                        <Circle
                          center={pinPos}
                          radius={impactRadiusMeters}
                          pathOptions={{ color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.14, weight: 2 }}
                        />
                      )}
                      <MapController center={mapCenter} />
                    </MapContainer>
                  </div>
                  {gpsLocation ? (
                    <p className="mt-1.5 text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 size={12} /> พิกัด: {gpsLocation}
                    </p>
                  ) : formErrors.lat ? (
                    <p className="mt-1.5 text-[11px] text-red-600 font-bold flex items-center gap-1">
                      <span>⚠</span> {formErrors.lat}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-[11px] text-slate-400">คลิกบนแผนที่เพื่อปักหมุดตำแหน่ง</p>
                  )}
                </div>

                {category === 'Power' && (
                  <Field label={`บริษัทที่ได้รับผลกระทบเพิ่ม (${affectedCompanyIds.length})`}>
                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                          value={affectedCompanyQuery}
                          onChange={(event) => setAffectedCompanyQuery(event.target.value)}
                          className="w-full form-field pl-10"
                          placeholder="ค้นหาชื่อบริษัท..."
                        />
                      </div>

                      {affectedCompanyIds.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {affectedCompanies.map((company) => (
                            <span key={company.id} className="inline-flex items-center gap-2 rounded-full bg-red-50 border border-red-200 px-3 py-1.5 text-xs font-bold text-red-800">
                              #{company.name.replace(/^บริษัท\s*/, '')}
                              <button type="button" onClick={() => removeAffectedCompany(company.id)} className="text-red-500 hover:text-red-800">
                                <X size={13} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y bg-white shadow-inner">
                        {affectedSuggestions.length > 0 ? (
                          affectedSuggestions.map((company) => {
                            const isSelected = affectedCompanyIds.includes(company.id);
                            return (
                              <button
                                key={company.id}
                                type="button"
                                onClick={() => isSelected ? removeAffectedCompany(company.id) : addAffectedCompany(company.id)}
                                className={`w-full text-left px-4 py-3 hover:bg-indigo-50 transition-all flex items-center justify-between border-l-4 ${
                                  isSelected 
                                  ? 'bg-indigo-50 border-indigo-500' 
                                  : 'border-transparent'
                                }`}
                              >
                                <div>
                                  <p className={`text-sm font-black transition-colors ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                                    {company.name}
                                  </p>
                                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">
                                    {company.area || 'ไม่ระบุโซน'}
                                  </p>
                                </div>
                                {isSelected && (
                                  <div className="bg-indigo-500 rounded-full p-1 shadow-sm">
                                    <Check size={10} className="text-white" strokeWidth={4} />
                                  </div>
                                )}
                              </button>
                            );
                          })
                        ) : (
                          <div className="p-6 text-center">
                            <p className="text-xs text-slate-400 font-medium">ไม่พบผลลัพธ์การค้นหา</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </Field>
                )}



                {/* ── ชื่อ + เบอร์ติดต่อ: แสดงทุก category ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FieldWithError label="ชื่อผู้แจ้ง" error={formErrors.contactName}>
                    <input
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className={`w-full form-field ${formErrors.contactName ? 'border-red-400 bg-red-50' : ''}`}
                      placeholder="ชื่อผู้ประสานงาน"
                    />
                  </FieldWithError>
                  <FieldWithError label="เบอร์ติดต่อ" error={formErrors.contactPhone}>
                    <input
                      value={contactPhone}
                      onChange={(e) => setContactPhone(formatPhoneNumber(e.target.value))}
                      className={`w-full form-field ${formErrors.contactPhone ? 'border-red-400 bg-red-50' : ''}`}
                      placeholder="08X-XXX-XXXX"
                      inputMode="tel"
                    />
                  </FieldWithError>
                </div>

                <FieldWithError label="รายละเอียดปัญหา / หมายเหตุ" error={formErrors.description}>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={`w-full form-field resize-none ${formErrors.description ? 'border-red-400 bg-red-50' : ''}`}
                    rows={3}
                    placeholder="อธิบายเหตุการณ์... (อย่างน้อย 10 ตัวอักษร)"
                  />
                </FieldWithError>

                <FieldWithError label="ตำแหน่ง / พื้นที่ (โปรดระบุให้ชัดเจน)" error={formErrors.locationDetail}>
                  <input 
                    className={`w-full form-field ${formErrors.locationDetail ? 'border-red-400 bg-red-50' : ''}`} 
                    placeholder="ระบุจุดเกิดเหตุให้ชัดเจน เช่น หน้าอาคารผลิต D2, IP7 Phase 5" 
                    value={locationDetail}
                    onChange={(e) => setLocationDetail(e.target.value)}
                  />
                </FieldWithError>

                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*,video/*" 
                  multiple 
                  onChange={handleFileChange}
                />

                {attachments.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {attachments.map((item) => (
                      <div key={item.id} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group bg-slate-50 flex items-center justify-center">
                        {item.file.type.startsWith('video/') ? (
                          <>
                            <video src={item.previewUrl} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20 transition-colors">
                              <div className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow-sm">
                                <Play size={16} className="text-slate-800 fill-slate-800 ml-0.5" />
                              </div>
                            </div>
                          </>
                        ) : (
                          <img src={item.previewUrl} alt="Preview" className="w-full h-full object-cover" />
                        )}
                        
                        {/* Progress overlay */}
                        {(item.status === 'compressing' || item.status === 'uploading') && (
                          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white px-2">
                            <Loader2 size={16} className="animate-spin mb-1 text-primary" />
                            <span className="text-[10px] font-black">
                              {item.status === 'compressing' ? 'ย่อรูป...' : `${item.progress}%`}
                            </span>
                            <div className="w-full bg-slate-700 rounded-full h-1 mt-1 overflow-hidden">
                              <div 
                                className="bg-primary h-1 rounded-full transition-all duration-300"
                                style={{ width: `${item.status === 'compressing' ? 15 : item.progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                        
                        {/* Error state */}
                        {item.status === 'error' && (
                          <div className="absolute inset-0 bg-red-900/80 flex flex-col items-center justify-center text-white px-1 text-center">
                            <span className="text-[10px] font-bold">อัปโหลดล้มเหลว</span>
                            <span className="text-[8px] opacity-80 line-clamp-2">{item.error || 'กรุณาลองใหม่'}</span>
                          </div>
                        )}

                        <button 
                          type="button"
                          onClick={() => removeAttachment(item.id)}
                          className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-300 rounded-xl p-5 text-slate-500 hover:bg-slate-50 hover:border-primary transition-colors flex flex-col items-center gap-2"
                >
                  <Camera size={24} />
                  <span className="text-sm font-bold">อัปโหลดรูปภาพจากหน้างาน</span>
                </button>
                <p className="text-[11px] text-slate-400 mt-2 text-center">
                  * รองรับไฟล์ภาพและวิดีโอ (จำกัดวิดีโอไม่เกิน 50MB และความยาวไม่เกิน 5 นาทีต่อคลิป)
                </p>
              </form>
            </div>

            <div className="p-5 border-t border-slate-100 shrink-0 flex gap-3">
              <button onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50">
                ยกเลิก
              </button>
              <button 
                onClick={handleCreateTicket} 
                disabled={submitting || attachments.some(a => a.status === 'compressing' || a.status === 'uploading')}
                className="flex-[2] py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-container flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>กำลังเปิด Ticket...</span>
                  </>
                ) : attachments.some(a => a.status === 'compressing' || a.status === 'uploading') ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>กำลังอัปโหลดรูป ({attachments.filter(a => a.status === 'done').length}/{attachments.length})...</span>
                  </>
                ) : (
                  <>
                    <Navigation size={18} />
                    <span>บันทึกและส่งให้ CRM</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign Team Modal ── */}
      {assignModalTicketId && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <Crosshair size={18} className="text-primary" />
                เลือกทีมรับผิดชอบ
              </h3>
              <button onClick={() => setAssignModalTicketId(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
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
                    onClick={() => handleAssignTeam(assignModalTicketId, team.name)}
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

      {/* ── Feedback Modal ── */}
      {isFeedbackModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Star size={20} className="text-indigo-600 fill-indigo-600" />
                <h3 className="text-lg font-black text-indigo-900 text-primary">ให้ Feedback การบริการ</h3>
              </div>
              <button onClick={() => setIsFeedbackModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="text-center">
                <p className="text-sm font-bold text-slate-600 mb-4">ความพึงพอใจของคุณต่อการแก้ปัญหานี้</p>
                <div className="flex justify-center gap-3">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button 
                      key={score} 
                      onClick={() => setFeedback({ ...feedback, score })} 
                      className="transition-all transform hover:scale-125"
                    >
                      <Star 
                        size={40} 
                        className={score <= feedback.score ? 'fill-yellow-400 text-yellow-400' : 'text-slate-200'} 
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-wider">ความคิดเห็นเพิ่มเติม</label>
                <textarea 
                  value={feedback.comment} 
                  onChange={(event) => setFeedback({ ...feedback, comment: event.target.value })} 
                  rows={4} 
                  className="w-full form-field resize-none bg-slate-50 focus:bg-white transition-colors" 
                  placeholder="เขียนแชร์ความประทับใจ หรือสิ่งที่ควรปรับปรุง..." 
                />
              </div>

              <button 
                onClick={handleSubmitFeedback} 
                disabled={submitting || !feedback.score}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 transition-all disabled:opacity-50 disabled:shadow-none"
              >
                {submitting ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                ส่ง Feedback และปิดงานทันที
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Claim / Unclaim Modal ── */}
      {confirmClaim && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setConfirmClaim(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`p-5 border-b ${confirmClaim.type === 'claim' ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${confirmClaim.type === 'claim' ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-base leading-tight">
                    {confirmClaim.type === 'claim' ? 'ยืนยันการรับเคส' : 'ยืนยันการยกเลิก'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {confirmClaim.type === 'claim' ? 'คุณจะเป็นผู้รับผิดชอบ Response เคสนี้' : 'คุณต้องการยกเลิกการรับเคสนี้'}
                  </p>
                </div>
              </div>
            </div>
            {/* Body */}
            <div className="p-5">
              <p className="text-sm text-slate-600">
                {confirmClaim.type === 'claim'
                  ? 'เมื่อกด "Confirm" คุณจะถูกบันทึกเป็นผู้ Response เคสนี้ และสถานะจะเปลี่ยนเป็น In Progress'
                  : 'เมื่อกด "Confirm" ระบบจะนำชื่อคุณออกจาก Response เคสนี้'}
              </p>
            </div>
            {/* Actions */}
            <div className="px-5 pb-5 flex gap-3">
              <button
                onClick={() => setConfirmClaim(null)}
                className="flex-1 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-black text-slate-600 hover:bg-slate-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={executeClaimToggle}
                disabled={submitting}
                className={`flex-1 py-2.5 rounded-xl text-sm font-black text-white transition-all shadow-md disabled:opacity-60 flex items-center justify-center gap-2 ${
                  confirmClaim.type === 'claim'
                    ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200'
                    : 'bg-red-500 hover:bg-red-600 shadow-red-200'
                }`}
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* ── Floating action menu portal ── */}
    {activeMenuId && menuAnchor && (() => {
      const t = paginatedTickets.find(tk => tk.id === activeMenuId);
      if (!t) return null;
      return ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            right: menuAnchor.right,
            ...(menuAnchor.openUp
              ? { bottom: window.innerHeight - menuAnchor.top + 4 }
              : { top: menuAnchor.top }),
            zIndex: 9999,
          }}
          className="w-52 bg-white border border-slate-200 shadow-2xl rounded-xl overflow-hidden flex flex-col py-1"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => { onSelectTicket(t.id); setActiveMenuId(null); setMenuAnchor(null); }}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors w-full text-left"
          >
            <Eye size={14} className="text-primary" /> ดูรายละเอียด
          </button>
          {role === 'customer' && t.status === 'Resolved' && (
            <button
              onClick={() => { setFeedbackTicketId(t.id); setIsFeedbackModalOpen(true); setActiveMenuId(null); setMenuAnchor(null); }}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition-colors w-full text-left border-t border-slate-100"
            >
              <Star size={14} className="fill-indigo-600" /> ให้ Feedback และปิดงาน
            </button>
          )}
          {t.status !== 'Closed' && (role === 'crm' || role === 'admin') && (
            <button
              onClick={() => { setAssignModalTicketId(t.id); setActiveMenuId(null); setMenuAnchor(null); }}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors w-full text-left border-t border-slate-100"
            >
              <Crosshair size={14} className="text-indigo-600" /> เปลี่ยนทีมมอบหมาย
            </button>
          )}
          {role === 'admin' && (
            <button
              onClick={() => { handleDeleteTicket(t.id); setActiveMenuId(null); setMenuAnchor(null); }}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors w-full text-left border-t border-slate-100"
            >
              <Trash2 size={14} /> ลบ Ticket
            </button>
          )}
        </div>,
        document.body
      );
    })()}
    </>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20">
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 block">
      <span className="text-xs font-black text-slate-600 uppercase">{label}</span>
      {children}
    </label>
  );
}

function FieldWithError({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="space-y-1.5" {...(error ? { 'data-field-error': 'true' } : {})}>
      <span className="text-xs font-black text-slate-600 uppercase block">{label}</span>
      {children}
      {error && (
        <p className="text-xs text-red-600 font-bold flex items-center gap-1">
          <span>⚠</span> {error}
        </p>
      )}
    </div>
  );
}

const CHANNELS = [
  { value: 'Tel',       label: 'โทรศัพท์', emoji: '📞' },
  { value: 'Line',      label: 'Line',      emoji: '💬' },
  { value: 'E-mail',    label: 'E-mail',    emoji: '📧' },
  { value: 'WhatsApp',  label: 'WhatsApp',  emoji: '🟢' },
  { value: 'Walk-in',   label: 'Walk-in',   emoji: '🚶' },
  { value: 'Letter',    label: 'จดหมาย',   emoji: '📄' },
];

function ChannelSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <span className="text-xs font-black text-slate-600 uppercase block">ช่องทางที่รับเรื่อง</span>
      <div className="grid grid-cols-3 gap-2">
        {CHANNELS.map((ch) => {
          const active = value === ch.value;
          return (
            <button
              key={ch.value}
              type="button"
              onClick={() => onChange(ch.value)}
              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-black border-2 transition-all duration-150
                ${active
                  ? 'bg-primary text-white border-primary shadow-md'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary'
                }`}
            >
              <span className="text-sm leading-none">{ch.emoji}</span>
              {ch.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
