import React from 'react';
import { Calendar, Clock, Download, PieChart, ShieldCheck, TrendingUp, Loader2, Star, Zap, Droplets, Building2, User, ChevronDown } from 'lucide-react';
import { Role } from '../App';
import { api, Ticket, getAvatarUrl } from '../lib/api';
import { categoryColors, TicketCategory } from '../data';

interface DashboardProps {
  role: Role;
  onSelectTicket: (id: string) => void;
  lang?: 'TH' | 'EN';
}

const t = {
  TH: {
    loading: 'กำลังเตรียมรายงาน...',
    subtitle: 'Service Performance Insights',
    title: 'แดชบอร์ดติดตามงาน CRM Ticket 304IP',
    description: 'สรุปสถานะการให้บริการ (Open, In Progress, Resolved, Closed) พร้อมวิเคราะห์ประเภทงาน พื้นที่ที่ได้รับผลกระทบ และสัดส่วนหมวดหมู่บริการ',
    export: 'Export Report',
    criticalTickets: 'Critical Tickets',
    criticalMonitor: 'รายการที่ต้อง monitor นาทีต่อนาที',
    noCritical: 'ไม่มีเคสวิกฤตในขณะนี้',
    autoClose: 'Auto-close 48 ชั่วโมง',
    autoCloseDesc: 'Resolved ticket จะรอ feedback ก่อนปิดงานอัตโนมัติ',
    noAutoClose: 'ยังไม่มีเคสที่รอปิดงาน',
    notAssigned: 'ยังไม่มอบหมาย',
  },
  EN: {
    loading: 'Preparing report...',
    subtitle: 'Service Performance Insights',
    title: '304IP CRM Ticket Tracking Dashboard',
    description: 'Overview of service requests status (Open, In Progress, Resolved, Closed) with ticket type, area impact, and service category distribution.',
    export: 'Export Report',
    criticalTickets: 'Critical Tickets',
    criticalMonitor: 'Cases requiring minute-by-minute monitoring',
    noCritical: 'No critical cases at the moment',
    autoClose: '48-Hour Auto-close',
    autoCloseDesc: 'Resolved tickets awaiting feedback before auto-closing',
    noAutoClose: 'No tickets waiting to close',
    notAssigned: 'Unassigned',
  }
};

interface ChartSegment {
  label: string;
  value: number;
  color: string;
}

interface DynamicChart {
  title: string;
  subtitle: { TH: string; EN: string };
  segments: ChartSegment[];
}

function Donut({ chart, lang }: { chart: DynamicChart; lang: 'TH' | 'EN' }) {
  let offset = 0;
  const totalValue = chart.segments.reduce((acc, s) => acc + s.value, 0) || 1;
  const gradientStops = chart.segments
    .map((segment) => {
      const start = offset;
      const percentage = (segment.value / totalValue) * 100;
      offset += percentage;
      return `${segment.color} ${start}% ${offset}%`;
    })
    .join(', ');

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h3 className="font-black text-slate-900 leading-tight">{chart.title}</h3>
          <p className="text-xs text-slate-500 mt-1">{chart.subtitle[lang]}</p>
        </div>
        <PieChart size={20} className="text-slate-400" />
      </div>
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
        <div
          className="w-28 h-28 rounded-full shrink-0 relative"
          style={{ background: chart.segments.length > 0 ? `conic-gradient(${gradientStops})` : '#f1f5f9' }}
          aria-hidden="true"
        >
          <div className="absolute inset-5 rounded-full bg-white flex items-center justify-center">
            <span className="text-lg font-black text-primary">
              {chart.segments.length > 0 ? totalValue : 0}
            </span>
          </div>
        </div>
        <div className="space-y-3 min-w-0">
          {chart.segments.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No data available</p>
          ) : (
            chart.segments.map((segment) => (
              <div key={segment.label} className="flex items-center justify-between gap-4 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: segment.color }} />
                  <span className="text-slate-600 truncate">{segment.label}</span>
                </div>
                <span className="font-black text-slate-900">{Math.round((segment.value / totalValue) * 100)}%</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function Dashboard({ role, onSelectTicket, lang = 'TH' }: DashboardProps) {
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dateRangeFilter, setDateRangeFilter] = React.useState<'All'|'ThisMonth'|'LastMonth'|'ThisQuarter'|'Custom'>('ThisMonth');
  const [customStartDate, setCustomStartDate] = React.useState('');
  const [customEndDate, setCustomEndDate] = React.useState('');
  const [isDatePickerOpen, setIsDatePickerOpen] = React.useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = React.useState(false);
  const text = t[lang];

  React.useEffect(() => {
    async function fetchTickets() {
      try {
        const data = await api.tickets.list();
        setTickets(data);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchTickets();
    
    const sub = api.tickets.subscribe(() => {
      fetchTickets();
    });
    
    return () => {
      sub.unsubscribe();
    };
  }, []);

  const filteredTickets = React.useMemo(() => {
    let start = new Date(0);
    let end = new Date();
    
    const now = new Date();
    if (dateRangeFilter === 'ThisMonth') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (dateRangeFilter === 'LastMonth') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (dateRangeFilter === 'ThisQuarter') {
      const quarter = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), quarter * 3, 1);
    } else if (dateRangeFilter === 'Custom' && customStartDate && customEndDate) {
      start = new Date(customStartDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(customEndDate);
      end.setHours(23, 59, 59, 999);
    }
    
    if (dateRangeFilter === 'All') return tickets;
    
    return tickets.filter(t => {
      const d = new Date(t.created_at);
      return d >= start && d <= end;
    });
  }, [tickets, dateRangeFilter, customStartDate, customEndDate]);

  const handleExport = (type: 'csv' | 'sla') => {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    
    if (type === 'csv') {
      csvContent += "ID,Category,Type,Status,Priority,Area,Created At,SLA Deadline\n";
      filteredTickets.forEach(t => {
        csvContent += `"${t.id}","${t.category}","${t.type}","${t.status}","${t.priority}","${t.area || ''}","${new Date(t.created_at).toLocaleString()}","${t.sla_deadline ? new Date(t.sla_deadline).toLocaleString() : ''}"\n`;
      });
    } else if (type === 'sla') {
      csvContent += "ID,Category,Priority,Status,Created At,SLA Deadline,Is Overdue\n";
      filteredTickets.forEach(t => {
        const isPastSla = t.sla_deadline ? new Date() > new Date(t.sla_deadline) : false;
        csvContent += `"${t.id}","${t.category}","${t.priority}","${t.status}","${new Date(t.created_at).toLocaleString()}","${t.sla_deadline ? new Date(t.sla_deadline).toLocaleString() : ''}","${isPastSla ? 'Yes' : 'No'}"\n`;
      });
    }
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `304ip_export_${type}_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportMenuOpen(false);
  };

  const stats = React.useMemo(() => {
    const open = filteredTickets.filter(t => t.status === 'Open').length;
    const inProgress = filteredTickets.filter(t => t.status === 'In Progress').length;
    const resolved = filteredTickets.filter(t => t.status === 'Resolved (Tech)' || t.status === 'Resolved (CRM)').length;
    const closed = filteredTickets.filter(t => t.status === 'Closed').length;
    const allFeedback = filteredTickets.map(t => (t as any).ticket_feedback?.[0]).filter(Boolean);
    const avgFix = allFeedback.length > 0 ? (allFeedback.reduce((acc, f) => acc + (f.fix_quality_score || f.score), 0) / allFeedback.length).toFixed(1) : '0.0';
    const avgService = allFeedback.length > 0 ? (allFeedback.reduce((acc, f) => acc + (f.service_quality_score || f.score), 0) / allFeedback.length).toFixed(1) : '0.0';

    return [
      { label: lang === 'TH' ? 'เคสเปิดใหม่ (Open)' : 'Open Tickets', value: open, tone: 'bg-red-50 text-red-700', icon: Calendar },
      { label: lang === 'TH' ? 'กำลังดำเนินการ (In Progress)' : 'In Progress', value: inProgress, tone: 'bg-orange-50 text-orange-700', icon: Clock },
      { label: lang === 'TH' ? 'รอตรวจรับ (Resolved)' : 'Resolved (Awaiting)', value: resolved, tone: 'bg-emerald-50 text-emerald-700', icon: ShieldCheck },
      { label: lang === 'TH' ? 'ปิดงานแล้ว (Closed)' : 'Closed Tickets', value: closed, tone: 'bg-slate-100 text-slate-700', icon: PieChart },
      { label: lang === 'TH' ? 'Fix Quality' : 'Avg. Fix Quality', value: avgFix, tone: 'bg-amber-50 text-amber-700', icon: Star },
      { label: lang === 'TH' ? 'Service Quality' : 'Avg. Service Quality', value: avgService, tone: 'bg-blue-50 text-blue-700', icon: Star },
    ];
  }, [filteredTickets, lang]);

  const dynamicCharts = React.useMemo(() => {
    const total = filteredTickets.length || 1;

    // 1. Ticket Classification (Type)
    const typesMap = filteredTickets.reduce((acc: any, t) => {
      const type = t.type || 'Other';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    
    const classificationSegments = [
      { label: 'Service Issue', value: typesMap['Service Issue'] || 0, color: '#001e40' },
      { label: 'Service Request', value: typesMap['Service Request'] || 0, color: '#22c55e' },
      { label: 'Operational Task', value: typesMap['Operational Task'] || 0, color: '#64748b' },
    ].filter(s => s.value > 0);

    // 2. Service Category
    const catMap = filteredTickets.reduce((acc: any, t) => {
      const cat = t.category || 'Other';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    const categorySegments = [
      { label: 'Power', value: catMap['Power'] || 0, color: '#dc2626' },
      { label: 'Water', value: catMap['Water Supply'] || 0, color: '#2563eb' },
      { label: 'Facility', value: catMap['Facility'] || 0, color: '#14b8a6' },
    ].filter(s => s.value > 0);

    // 3. Area Impact
    const areaMap = filteredTickets.reduce((acc: any, t) => {
      const area = t.area || 'N/A';
      acc[area] = (acc[area] || 0) + 1;
      return acc;
    }, {});

    const topAreas = Object.entries(areaMap)
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, 4);
    
    const areaColors = ['#2563eb', '#0ea5e9', '#14b8a6', '#94a3b8'];
    const areaSegments = topAreas.map(([label, val], idx) => ({
      label,
      value: val as number,
      color: areaColors[idx] || '#cbd5e1'
    }));

    // 4. SLA Compliance (Real Data Logic)
    let onTime = 0;
    let overdue = 0;
    let pending = 0;
    
    filteredTickets.forEach(t => {
      const isResolved = t.status === 'Closed' || t.status.startsWith('Resolved');
      const isPastSla = t.sla_deadline ? new Date() > new Date(t.sla_deadline) : false;
      
      if (isResolved) {
        onTime++;
      } else {
        if (isPastSla) overdue++;
        else pending++;
      }
    });

    const slaSegments = [
      { label: 'Resolved (On-time)', value: onTime, color: '#10b981' },
      { label: 'In Progress (Within SLA)', value: pending, color: '#3b82f6' },
      { label: 'SLA Overdue', value: overdue, color: '#ef4444' },
    ].filter(s => s.value > 0);

    // 5. Customer Satisfaction (CSAT) - Real Data
    const allFeedback = filteredTickets
      .map(t => (t as any).ticket_feedback?.[0])
      .filter(Boolean);

    const csatSegments = [
      { label: '5 Stars', value: allFeedback.filter((f: any) => f.score === 5).length, color: '#059669' },
      { label: '4 Stars', value: allFeedback.filter((f: any) => f.score === 4).length, color: '#10b981' },
      { label: '3 Stars', value: allFeedback.filter((f: any) => f.score === 3).length, color: '#fbbf24' },
      { label: '1-2 Stars', value: allFeedback.filter((f: any) => f.score <= 2).length, color: '#ef4444' },
    ].filter(s => s.value > 0);

    return [
      {
        title: 'SLA Performance',
        subtitle: { TH: 'ประสิทธิภาพการให้บริการตาม SLA', EN: 'SLA Compliance' },
        segments: slaSegments,
      },
      {
        title: 'Customer Satisfaction',
        subtitle: { TH: 'ระดับความพึงพอใจ (CSAT)', EN: 'Customer Feedback Score' },
        segments: csatSegments,
      },
      {
        title: 'Ticket Classification',
        subtitle: { TH: 'จำแนกตามประเภทงาน', EN: 'By Ticket Type' },
        segments: classificationSegments,
      },
      {
        title: 'Service Distribution',
        subtitle: { TH: 'สัดส่วนหมวดหมู่บริการ', EN: 'By Service Category' },
        segments: categorySegments,
      },
      {
        title: 'Area Impact Analysis',
        subtitle: { TH: 'วิเคราะห์พื้นที่ที่เกิดงาน', EN: 'Top 4 Affected Areas' },
        segments: areaSegments,
      },
    ];
  }, [filteredTickets]);

  const criticalTickets = filteredTickets.filter((ticket) => ticket.priority === 'Critical' && ticket.status !== 'Closed');
  const resolvedTickets = filteredTickets.filter((ticket) => ticket.status === 'Resolved (Tech)' || ticket.status === 'Resolved (CRM)');

  if (role === 'customer') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="w-20 h-20 bg-primary/5 text-primary rounded-full flex items-center justify-center mb-6">
          <ShieldCheck size={40} />
        </div>
        <h2 className="text-2xl font-black text-primary">ยินดีต้อนรับสู่ 304IP CRM</h2>
        <p className="text-slate-500 mt-2 max-w-md">ระบบกำลังเปิดหน้าจัดการ Ticket ของคุณ... กรุณารอสักครู่</p>
        <div className="mt-8 flex gap-4">
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500">
        <Loader2 className="animate-spin mb-4 text-primary" size={48} />
        <p className="font-bold animate-pulse">{text.loading}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-blue-700 mb-2">{text.subtitle}</p>
          <h2 className="text-2xl md:text-3xl font-black text-primary tracking-tight">{text.title}</h2>
          <p className="text-sm text-slate-500 mt-2 max-w-2xl">{text.description}</p>
        </div>
        <div className="flex gap-3 relative z-40">
          {/* Date Picker Dropdown */}
          <div className="relative">
            <button 
              onClick={() => { setIsDatePickerOpen(!isDatePickerOpen); setIsExportMenuOpen(false); }}
              className="px-4 py-2 bg-white border border-slate-200 text-primary font-bold rounded-lg text-sm hover:bg-slate-50 transition-colors flex items-center gap-2 shadow-sm"
            >
              <Calendar size={16} />
              {dateRangeFilter === 'All' && 'ทั้งหมด'}
              {dateRangeFilter === 'ThisMonth' && 'เดือนนี้'}
              {dateRangeFilter === 'LastMonth' && 'เดือนที่แล้ว'}
              {dateRangeFilter === 'ThisQuarter' && 'ไตรมาสนี้'}
              {dateRangeFilter === 'Custom' && 'กำหนดเอง'}
              <ChevronDown size={14} className="ml-1" />
            </button>

            {isDatePickerOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-100 p-2">
                <div className="space-y-1">
                  <button onClick={() => { setDateRangeFilter('All'); setIsDatePickerOpen(false); }} className={`w-full text-left px-4 py-2 text-sm rounded-lg hover:bg-slate-50 ${dateRangeFilter === 'All' ? 'bg-primary/5 text-primary font-bold' : 'text-slate-700'}`}>ทั้งหมด</button>
                  <button onClick={() => { setDateRangeFilter('ThisMonth'); setIsDatePickerOpen(false); }} className={`w-full text-left px-4 py-2 text-sm rounded-lg hover:bg-slate-50 ${dateRangeFilter === 'ThisMonth' ? 'bg-primary/5 text-primary font-bold' : 'text-slate-700'}`}>เดือนนี้</button>
                  <button onClick={() => { setDateRangeFilter('LastMonth'); setIsDatePickerOpen(false); }} className={`w-full text-left px-4 py-2 text-sm rounded-lg hover:bg-slate-50 ${dateRangeFilter === 'LastMonth' ? 'bg-primary/5 text-primary font-bold' : 'text-slate-700'}`}>เดือนที่แล้ว</button>
                  <button onClick={() => { setDateRangeFilter('ThisQuarter'); setIsDatePickerOpen(false); }} className={`w-full text-left px-4 py-2 text-sm rounded-lg hover:bg-slate-50 ${dateRangeFilter === 'ThisQuarter' ? 'bg-primary/5 text-primary font-bold' : 'text-slate-700'}`}>ไตรมาสนี้</button>
                  <button onClick={() => setDateRangeFilter('Custom')} className={`w-full text-left px-4 py-2 text-sm rounded-lg hover:bg-slate-50 ${dateRangeFilter === 'Custom' ? 'bg-primary/5 text-primary font-bold' : 'text-slate-700'}`}>กำหนดเอง...</button>
                </div>
                {dateRangeFilter === 'Custom' && (
                  <div className="mt-3 pt-3 border-t border-slate-100 px-2 space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">เริ่มวันที่</label>
                      <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="w-full form-field text-sm p-2" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">ถึงวันที่</label>
                      <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="w-full form-field text-sm p-2" />
                    </div>
                    <button onClick={() => setIsDatePickerOpen(false)} className="w-full btn-primary py-2 text-sm">นำไปใช้</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Export Dropdown */}
          <div className="relative">
            <button 
              onClick={() => { setIsExportMenuOpen(!isExportMenuOpen); setIsDatePickerOpen(false); }}
              className="px-4 py-2 bg-primary text-white font-bold rounded-lg text-sm hover:bg-primary-container transition-colors flex items-center gap-2 shadow-sm"
            >
              <Download size={16} />
              {text.export}
              <ChevronDown size={14} className="ml-1" />
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 p-2 space-y-1">
                <button onClick={() => handleExport('csv')} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-primary rounded-lg font-medium transition-colors">
                  Export ข้อมูล Ticket
                </button>
                <button onClick={() => handleExport('sla')} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-primary rounded-lg font-medium transition-colors">
                  Export รายงาน SLA
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.tone}`}>
                  <Icon size={20} />
                </div>
                <TrendingUp size={16} className="text-emerald-500" />
              </div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{card.label}</p>
              <p className="text-3xl font-black text-primary mt-1">{card.value}</p>
            </div>
          );
        })}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {dynamicCharts.map((chart) => (
          <React.Fragment key={chart.title}>
            <Donut chart={chart} lang={lang} />
          </React.Fragment>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-black text-primary">{text.criticalTickets}</h3>
              <p className="text-xs text-slate-500 mt-1">{text.criticalMonitor}</p>
            </div>
            <span className="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-black rounded">LIVE</span>
          </div>
          <div className="divide-y divide-slate-100">
            {criticalTickets.length === 0 ? (
              <p className="p-10 text-center text-slate-400 text-sm">{text.noCritical}</p>
            ) : criticalTickets.map((ticket) => (
              <button key={ticket.id} onClick={() => onSelectTicket(ticket.id)} className="w-full p-5 text-left hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-xs font-black text-red-700">{ticket.id}</span>
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-black rounded-lg uppercase border ${categoryColors[ticket.category as TicketCategory] || 'bg-slate-50 text-slate-600 border-slate-100/50'}`}>
                          {ticket.category === 'Power' && <Zap size={10} className="fill-amber-500 text-amber-500" />}
                          {ticket.category === 'Water Supply' && <Droplets size={10} className="fill-sky-500 text-sky-500" />}
                          {ticket.category === 'Facility' && <Building2 size={10} className="fill-indigo-500 text-indigo-500" />}
                          {ticket.category}
                        </span>
                      </div>
                      <h4 className="font-black text-slate-900 truncate leading-tight mb-1">{ticket.sub_category}</h4>
                      <p className="text-xs text-slate-500 truncate">{ticket.companies?.name || ticket.company_name} • {ticket.area} • {ticket.assignee || text.notAssigned}</p>
                      
                      {(ticket as any).creator && (
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-50">
                          <div className="w-6 h-6 rounded-full overflow-hidden bg-slate-50 border border-slate-200 shrink-0">
                            {(ticket as any).creator.emp_id ? (
                              <img src={getAvatarUrl((ticket as any).creator.emp_id)!} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-400">
                                <User size={12} />
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] font-black text-slate-700 truncate">{(ticket as any).creator.full_name}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Created At</span>
                      <span className="text-xs font-black text-slate-900 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                        {new Date(ticket.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-blue-50 rounded-xl border border-blue-100 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-lg bg-white text-primary flex items-center justify-center">
              <Clock size={22} />
            </div>
            <div>
              <h3 className="font-black text-primary">{text.autoClose}</h3>
              <p className="text-xs text-slate-600">{text.autoCloseDesc}</p>
            </div>
          </div>
          <div className="space-y-3">
            {resolvedTickets.length === 0 ? (
              <p className="p-10 text-center text-slate-400 text-sm">{text.noAutoClose}</p>
            ) : resolvedTickets.map((ticket) => (
              <div key={ticket.id} className="bg-white rounded-lg border border-blue-100 p-4">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-900 text-sm">{ticket.id}</p>
                    <p className="text-xs text-slate-500 mt-1">{ticket.companies?.name || ticket.company_name}</p>
                  </div>
                  <ShieldCheck size={18} className="text-emerald-600" />
                </div>
                <p className="text-[11px] text-blue-700 font-bold mt-3">Auto-close: {ticket.auto_close_at ? new Date(ticket.auto_close_at).toLocaleString('th-TH') : '-'}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Customer Voice & Feedback Section */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="font-black text-primary text-lg flex items-center gap-2">
                <Star className="text-amber-400 fill-amber-400" size={20} />
                Customer Voice Feed
              </h3>
              <p className="text-xs text-slate-600 font-bold mt-1">Real-time feedback from our customers</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Overall CSAT</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-black text-emerald-600">
                    {(() => {
                      const fb = tickets.map(t => (t as any).ticket_feedback?.[0]).filter(Boolean);
                      return fb.length > 0 ? (fb.reduce((acc, f) => acc + f.score, 0) / fb.length).toFixed(1) : '0.0';
                    })()}
                  </p>
                  <div className="flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} size={14} className={i < 4 ? "fill-emerald-500 text-emerald-500" : "text-slate-200"} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 flex-1">
            {tickets
              .filter(t => (t as any).ticket_feedback?.length > 0)
              .sort((a, b) => new Date((b as any).ticket_feedback[0].submitted_at).getTime() - new Date((a as any).ticket_feedback[0].submitted_at).getTime())
              .slice(0, 4)
              .map((ticket: any) => {
                const fb = ticket.ticket_feedback[0];
                return (
                  <div key={ticket.id} className="p-6 hover:bg-slate-50 transition-all cursor-pointer group" onClick={() => onSelectTicket(ticket.id)}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-[10px]">
                          {ticket.id.split('-').pop()?.slice(-2)}
                        </div>
                        <span className="font-mono text-xs font-black text-slate-500 group-hover:text-primary transition-colors">{ticket.id}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 mb-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black text-slate-600 uppercase w-12">Repair</span>
                        <div className="flex gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} size={10} className={i < (fb.fix_quality_score || fb.score) ? "fill-amber-400 text-amber-400" : "text-slate-200"} />
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black text-slate-600 uppercase w-12">Service</span>
                        <div className="flex gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} size={10} className={i < (fb.service_quality_score || fb.score) ? "fill-blue-400 text-blue-400" : "text-slate-200"} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-xs text-slate-700 font-semibold mb-4 italic">
                      {fb.fix_quality_comment && (
                        <p>
                          <span className="font-bold text-slate-500 not-italic">งานซ่อม:</span> "{fb.fix_quality_comment}"
                        </p>
                      )}
                      {fb.service_quality_comment && (
                        <p>
                          <span className="font-bold text-slate-500 not-italic">บริการ:</span> "{fb.service_quality_comment}"
                        </p>
                      )}
                      {!fb.fix_quality_comment && !fb.service_quality_comment && (
                        <p>
                          "{fb.comment || (fb.score >= 4 ? 'ยอดเยี่ยมมากครับ' : 'ขอบคุณครับ')}"
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-50">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black text-slate-900 truncate">
                          {ticket.companies?.name || ticket.company_name}
                        </p>
                        <p className="text-[9px] text-slate-400 font-bold">{ticket.area}</p>
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-full">
                        {new Date(fb.submitted_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                );
              })
            }
            {tickets.filter(t => (t as any).ticket_feedback?.length > 0).length === 0 && (
              <div className="col-span-full py-20 text-center flex flex-col items-center justify-center space-y-3">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                  <Star size={32} />
                </div>
                <p className="text-slate-400 text-sm font-medium">ยังไม่มีข้อมูลการประเมินความพึงพอใจในรอบนี้</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-emerald-600 rounded-2xl p-8 text-white shadow-lg shadow-emerald-200 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-48 h-48 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700" />
          <div className="relative z-10">
            <h3 className="text-emerald-100 text-xs font-black uppercase tracking-[0.2em] mb-4">Customer Sentiment</h3>
            <p className="text-4xl font-black mb-2">
              {(() => {
                const fb = tickets.map(t => (t as any).ticket_feedback?.[0]).filter(Boolean);
                const happy = fb.filter((f: any) => f.score >= 4).length;
                return fb.length > 0 ? Math.round((happy / fb.length) * 100) : 0;
              })()}%
            </p>
            <p className="text-emerald-100 text-sm font-medium leading-relaxed">
              ของผู้ใช้บริการมีความพึงพอใจในระดับ <span className="text-white font-black">ดีมาก (4-5 ดาว)</span> จากการประเมินทั้งหมด
            </p>
          </div>
          
          <div className="relative z-10 mt-8 pt-8 border-t border-white/20">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-emerald-100">Performance Index</span>
              <span className="text-xs font-black">High</span>
            </div>
            <div className="w-full h-2 bg-emerald-700/50 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white rounded-full transition-all duration-1000" 
                style={{ width: `${(() => {
                  const fb = tickets.map(t => (t as any).ticket_feedback?.[0]).filter(Boolean);
                  const happy = fb.filter((f: any) => f.score >= 4).length;
                  return fb.length > 0 ? (happy / fb.length) * 100 : 0;
                })()}%` }} 
              />
            </div>
            <p className="mt-4 text-[10px] text-emerald-100 italic">
              * ข้อมูลอัปเดตแบบ Real-time จากฐานข้อมูล Ticket Feedback
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
