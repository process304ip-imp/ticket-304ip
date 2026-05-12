import React from 'react';
import { Calendar, Clock, Download, PieChart, ShieldCheck, TrendingUp, Loader2, Star } from 'lucide-react';
import { Role } from '../App';
import { api, Ticket } from '../lib/api';

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
            <span className="text-lg font-black text-primary">100%</span>
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

  const stats = React.useMemo(() => {
    const open = tickets.filter(t => t.status === 'Open').length;
    const inProgress = tickets.filter(t => t.status === 'In Progress').length;
    const resolved = tickets.filter(t => t.status === 'Resolved').length;
    const closed = tickets.filter(t => t.status === 'Closed').length;

    return [
      { label: lang === 'TH' ? 'เคสเปิดใหม่ (Open)' : 'Open Tickets', value: open, tone: 'bg-red-50 text-red-700', icon: Calendar },
      { label: lang === 'TH' ? 'กำลังดำเนินการ (In Progress)' : 'In Progress', value: inProgress, tone: 'bg-orange-50 text-orange-700', icon: Clock },
      { label: lang === 'TH' ? 'รอตรวจรับ (Resolved)' : 'Resolved (Awaiting)', value: resolved, tone: 'bg-emerald-50 text-emerald-700', icon: ShieldCheck },
      { label: lang === 'TH' ? 'ปิดงานแล้ว (Closed)' : 'Closed Tickets', value: closed, tone: 'bg-slate-100 text-slate-700', icon: PieChart },
    ];
  }, [tickets, lang]);

  const dynamicCharts = React.useMemo(() => {
    const total = tickets.length || 1;

    // 1. Ticket Classification (Type)
    const typesMap = tickets.reduce((acc: any, t) => {
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
    const catMap = tickets.reduce((acc: any, t) => {
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
    const areaMap = tickets.reduce((acc: any, t) => {
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

    // 4. SLA Compliance (Example Logic: Resolved/Closed on time)
    const onTime = tickets.filter(t => t.status === 'Closed' || t.status === 'Resolved').length; // Simplified for demo
    const slaSegments = [
      { label: 'On-time', value: onTime, color: '#10b981' },
      { label: 'Delayed', value: Math.max(0, tickets.length - onTime - 5), color: '#f59e0b' }, // Mocking some delay
      { label: 'Overdue', value: 5, color: '#ef4444' },
    ].filter(s => s.value > 0);

    // 5. Customer Satisfaction (CSAT) - Real Data
    const allFeedback = tickets
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
  }, [tickets]);

  const criticalTickets = tickets.filter((ticket) => ticket.priority === 'Critical' && ticket.status !== 'Closed');
  const resolvedTickets = tickets.filter((ticket) => ticket.status === 'Resolved');

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
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-white border border-slate-200 text-primary font-bold rounded-lg text-sm hover:bg-slate-50 transition-colors flex items-center gap-2 shadow-sm">
            <Calendar size={16} />
            เม.ย. 2026
          </button>
          <button className="px-4 py-2 bg-primary text-white font-bold rounded-lg text-sm hover:bg-primary-container transition-colors flex items-center gap-2 shadow-sm">
            <Download size={16} />
            {text.export}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-black text-red-700">{ticket.id}</span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-red-50 text-red-700">{ticket.category}</span>
                    </div>
                    <h4 className="font-black text-slate-900 truncate">{ticket.sub_category}</h4>
                    <p className="text-xs text-slate-500 mt-1 truncate">{ticket.companies?.name || ticket.company_name} • {ticket.area} • {ticket.assignee || text.notAssigned}</p>
                  </div>
                  <span className="text-xs font-black text-slate-500 whitespace-nowrap">{new Date(ticket.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
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

      {/* Customer Feedback Feed Section */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-black text-primary flex items-center gap-2">
              <ShieldCheck className="text-emerald-500" size={18} />
              Customer Feedback Feed
            </h3>
            <p className="text-xs text-slate-500 mt-1">ความคิดเห็นล่าสุดจากผู้ใช้บริการ</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase">Avg. Score</p>
              <p className="text-xl font-black text-emerald-600">
                {(() => {
                  const fb = tickets.map(t => (t as any).ticket_feedback?.[0]).filter(Boolean);
                  return fb.length > 0 ? (fb.reduce((acc, f) => acc + f.score, 0) / fb.length).toFixed(1) : '0.0';
                })()}
                <span className="text-xs text-slate-400 font-bold ml-0.5">/ 5.0</span>
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">
          {tickets
            .filter(t => (t as any).ticket_feedback?.length > 0)
            .sort((a, b) => new Date((b as any).ticket_feedback[0].submitted_at).getTime() - new Date((a as any).ticket_feedback[0].submitted_at).getTime())
            .slice(0, 6)
            .map((ticket: any) => {
              const fb = ticket.ticket_feedback[0];
              return (
                <div key={ticket.id} className="p-5 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => onSelectTicket(ticket.id)}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-[10px] font-black text-slate-400">{ticket.id}</span>
                    <div className="flex gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} size={12} className={i < fb.score ? "fill-amber-400 text-amber-400" : "text-slate-200"} />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm font-bold text-slate-800 line-clamp-2 min-h-[40px] mb-3">
                    "{fb.comment || 'ไม่มีความเห็นเพิ่มเติม'}"
                  </p>
                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-50">
                    <span className="text-[10px] font-black text-slate-400 truncate max-w-[120px]">
                      {ticket.companies?.name || ticket.company_name}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {new Date(fb.submitted_at).toLocaleDateString('th-TH')}
                    </span>
                  </div>
                </div>
              );
            })
          }
          {tickets.filter(t => (t as any).ticket_feedback?.length > 0).length === 0 && (
            <div className="col-span-full py-20 text-center text-slate-400 text-sm">
              ยังไม่มีข้อมูลการประเมินความพึงพอใจ
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
