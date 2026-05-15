import {
  AlertTriangle,
  Droplet,
  Flame,
  LucideIcon,
  ShieldCheck,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';

export type Role = 'customer' | 'crm' | 'technician' | 'admin';
export type TicketCategory = 'Power' | 'Water Supply' | 'Facility';
export type TicketStatus = 'Open' | 'In Progress' | 'Resolved (Tech)' | 'Resolved (CRM)' | 'Closed';
export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type TicketChannel = 'Tel' | 'E-mail' | 'Letter' | 'Line' | 'WhatsApp' | 'Walk-in' | 'Customer Portal';
export type TicketType = 'Service Issue' | 'Service Request' | 'Operational Task';

export interface Ticket {
  id: string;
  type: TicketType;
  category: TicketCategory;
  subCategory: string;
  channel: TicketChannel;
  company: string;
  area: string;
  locationText: string;
  latLng: [number, number];
  status: TicketStatus;
  priority: TicketPriority;
  assignee: string;
  createdAt: string;
  resolvedAt?: string;
  slaDueAt: string;
  description: string;
  contactName: string;
  contactPhone: string;
  durationMin?: number;
  impactRadiusMeters?: number;
  affectedCompanyIds?: string[];
  autoCloseAt?: string;
  icon: LucideIcon;
}

export interface TicketLog {
  id: string;
  ticketId: string;
  timestamp: string;
  authorRole: Role;
  authorName: string;
  message: string;
  statusFrom?: TicketStatus;
  statusTo?: TicketStatus;
  mediaUrls: string[];
}

export interface Company {
  id: string;
  name: string;
  area: string;
  contactName: string;
  phone: string;
  email: string;
  registrationLink: string;
}

export interface ResponseTeam {
  id: string;
  name: string;
  role: string;
  status: 'available' | 'busy' | 'offline';
  area: string;
  specialty: TicketCategory | 'Emergency';
  activeTicketIds: string[];
  phone: string;
}

export const companies: Company[] = [
  {
    id: 'dynamic',
    name: 'บริษัท Dynamic Manufacturing',
    area: 'IP7 Phase 5',
    contactName: 'คุณกิตติพงศ์',
    phone: '081-304-7001',
    email: 'facility@dynamic.co.th',
    registrationLink: 'https://304ip.example/register?company=dynamic&area=ip7p5',
  },
  {
    id: 'wd',
    name: 'บริษัท WD Components',
    area: 'IP1',
    contactName: 'คุณศิริพร',
    phone: '081-304-7002',
    email: 'admin@wd-components.co.th',
    registrationLink: 'https://304ip.example/register?company=wd&area=ip1',
  },
  {
    id: 'comform',
    name: 'บริษัท Comform Technology',
    area: 'IP2',
    contactName: 'คุณพิชญ์',
    phone: '081-304-7003',
    email: 'service@comform.co.th',
    registrationLink: 'https://304ip.example/register?company=comform&area=ip2',
  },
  {
    id: 'xinggaosheng',
    name: 'บริษัท Xinggaosheng',
    area: 'IP7 Phase 3',
    contactName: 'Mr. Chen Wei',
    phone: '081-304-7004',
    email: 'ops@xinggaosheng.cn',
    registrationLink: 'https://304ip.example/register?company=xinggaosheng&area=ip7p3',
  },
];

export const tickets: Ticket[] = [
  {
    id: 'TK-304-8842',
    type: 'Operational Task',
    category: 'Power',
    subCategory: 'Voltage Drop',
    channel: 'Tel',
    company: 'CRM Internal',
    area: 'IP7 Phase 5',
    locationText: 'Feeder P7-F05 ใกล้โรงงาน Dynamic',
    latLng: [13.7559, 101.5691],
    status: 'In Progress',
    priority: 'Critical',
    assignee: 'Area Inspector (AIS)',
    createdAt: '28 เม.ย. 2026 08:12',
    slaDueAt: '28 เม.ย. 2026 10:12',
    description: 'ลูกค้าหลายโรงงานแจ้งแรงดันตกต่อเนื่อง ต้องตรวจสอบ feeder และ duration สำหรับรายงานผู้บริหาร',
    contactName: 'คุณชลิตา (CRM)',
    contactPhone: '038-304-100',
    durationMin: 38,
    impactRadiusMeters: 850,
    affectedCompanyIds: ['dynamic', 'xinggaosheng'],
    icon: Zap,
  },
  {
    id: 'TK-304-8843',
    type: 'Service Issue',
    category: 'Water Supply',
    subCategory: 'Slowly Water Flowing',
    channel: 'Customer Portal',
    company: 'บริษัท Dynamic Manufacturing',
    area: 'IP7 Phase 5',
    locationText: 'หน้าอาคารผลิต D2',
    latLng: [13.758, 101.571],
    status: 'Open',
    priority: 'High',
    assignee: 'Onduty Water Team',
    createdAt: '28 เม.ย. 2026 09:18',
    slaDueAt: '28 เม.ย. 2026 13:18',
    description: 'แรงดันน้ำอ่อนมาก กระทบสายการผลิตช่วงเช้า ต้องการตรวจสอบวาล์วหลัก',
    contactName: 'คุณกิตติพงศ์',
    contactPhone: '081-304-7001',
    icon: Droplet,
  },
  {
    id: 'TK-304-8844',
    type: 'Service Issue',
    category: 'Facility',
    subCategory: 'Safety: Fire',
    channel: 'Line',
    company: 'บริษัท WD Components',
    area: 'IP1',
    locationText: 'คลังสินค้า W1 หลังอาคาร QC',
    latLng: [13.7542, 101.565],
    status: 'In Progress',
    priority: 'Critical',
    assignee: 'ทีมดับเพลิง 304IP',
    createdAt: '28 เม.ย. 2026 10:03',
    slaDueAt: '28 เม.ย. 2026 10:33',
    description: 'พบกลุ่มควันใกล้พื้นที่เก็บวัสดุ ทีมหน้างานต้องบันทึกเหตุการณ์นาทีต่อนาที',
    contactName: 'คุณศิริพร',
    contactPhone: '081-304-7002',
    icon: Flame,
  },
  {
    id: 'TK-304-8839',
    type: 'Service Request',
    category: 'Facility',
    subCategory: 'Waste Water Treatment',
    channel: 'E-mail',
    company: 'บริษัท Comform Technology',
    area: 'IP2',
    locationText: 'บ่อพักน้ำเสีย C-zone',
    latLng: [13.762, 101.5723],
    status: 'Resolved (CRM)',
    priority: 'Medium',
    assignee: 'Facility Response Team',
    createdAt: '27 เม.ย. 2026 14:40',
    resolvedAt: '28 เม.ย. 2026 08:55',
    slaDueAt: '28 เม.ย. 2026 18:40',
    autoCloseAt: '30 เม.ย. 2026 08:55',
    description: 'น้ำเสียล้นบริเวณบ่อพัก ต้องลดวาล์วและติดตามกลิ่นในพื้นที่',
    contactName: 'คุณพิชญ์',
    contactPhone: '081-304-7003',
    icon: Wrench,
  },
  {
    id: 'TK-304-8834',
    type: 'Operational Task',
    category: 'Power',
    subCategory: 'Blackout',
    channel: 'Letter',
    company: 'CRM Internal',
    area: 'NPS',
    locationText: 'Main substation NPS link',
    latLng: [13.7518, 101.5632],
    status: 'Closed',
    priority: 'High',
    assignee: 'Power Operation',
    createdAt: '26 เม.ย. 2026 16:00',
    resolvedAt: '26 เม.ย. 2026 17:22',
    slaDueAt: '26 เม.ย. 2026 20:00',
    description: 'ไฟดับชั่วคราวจาก upstream trip บันทึก duration และ cause เพื่อใช้รายงานผู้บริหารและวิเคราะห์ผลกระทบ',
    contactName: 'คุณพิชวัลดา (CRM)',
    contactPhone: '038-304-101',
    durationMin: 82,
    impactRadiusMeters: 1200,
    affectedCompanyIds: ['dynamic', 'wd', 'comform'],
    icon: Zap,
  },
];

export const ticketLogs: TicketLog[] = [
  {
    id: 'LOG-1',
    ticketId: 'TK-304-8844',
    timestamp: '28 เม.ย. 2026 10:03',
    authorRole: 'crm',
    authorName: 'คุณพัชรากร',
    message: 'รับแจ้งผ่าน Line ว่ามีกลุ่มควันในคลังสินค้า W1 และเปิด ticket ระดับ Critical',
    statusFrom: 'Open',
    statusTo: 'Open',
    mediaUrls: [],
  },
  {
    id: 'LOG-2',
    ticketId: 'TK-304-8844',
    timestamp: '28 เม.ย. 2026 10:05',
    authorRole: 'crm',
    authorName: 'คุณพัชรากร',
    message: 'Assign ให้ทีมดับเพลิง 304IP และแจ้ง Area Inspector เข้าประเมินพื้นที่',
    statusFrom: 'Open',
    statusTo: 'In Progress',
    mediaUrls: [],
  },
  {
    id: 'LOG-3',
    ticketId: 'TK-304-8844',
    timestamp: '28 เม.ย. 2026 10:11',
    authorRole: 'technician',
    authorName: 'ทีมดับเพลิง 304IP',
    message: 'ถึงหน้างาน พบควันจาก motor pump ฝั่งหลังอาคาร ตัดไฟเฉพาะจุดแล้ว',
    statusFrom: 'In Progress',
    statusTo: 'In Progress',
    mediaUrls: ['photo-before.jpg'],
  },
  {
    id: 'LOG-4',
    ticketId: 'TK-304-8839',
    timestamp: '28 เม.ย. 2026 08:55',
    authorRole: 'technician',
    authorName: 'Facility Response Team',
    message: 'ปรับลดวาล์วน้ำเสียและล้างพื้นที่เสร็จ รอ feedback ลูกค้าภายใน 48 ชั่วโมง',
    statusFrom: 'In Progress',
    statusTo: 'Resolved (Tech)',
    mediaUrls: ['photo-after.jpg'],
  },
];

export const responseTeams: ResponseTeam[] = [
  {
    id: 'AIS',
    name: 'Area Inspector (AIS)',
    role: 'ทีมตรวจสอบพื้นที่',
    status: 'busy',
    area: 'IP7 Phase 5',
    specialty: 'Emergency',
    activeTicketIds: ['TK-304-8842'],
    phone: '038-304-201',
  },
  {
    id: 'WATER',
    name: 'Onduty Water Team',
    role: 'ทีมระบบน้ำประปา',
    status: 'available',
    area: 'IP7 Phase 5',
    specialty: 'Water Supply',
    activeTicketIds: [],
    phone: '038-304-202',
  },
  {
    id: 'FIRE',
    name: 'ทีมดับเพลิง 304IP',
    role: 'หน่วยตอบสนองเหตุฉุกเฉิน',
    status: 'busy',
    area: 'IP1',
    specialty: 'Facility',
    activeTicketIds: ['TK-304-8844'],
    phone: '038-304-199',
  },
  {
    id: 'POWER',
    name: 'Power Operation',
    role: 'ทีมระบบไฟฟ้า',
    status: 'offline',
    area: 'NPS',
    specialty: 'Power',
    activeTicketIds: [],
    phone: '038-304-203',
  },
];

export const categoryColors: Record<TicketCategory, string> = {
  Power: 'bg-amber-50 text-amber-600 border-amber-100/50',
  'Water Supply': 'bg-sky-50 text-sky-600 border-sky-100/50',
  Facility: 'bg-indigo-50 text-indigo-600 border-indigo-100/50',
};

export const statusColors: Record<TicketStatus, string> = {
  Open: 'bg-amber-50 text-amber-600 border-amber-100/50',
  'In Progress': 'bg-blue-50 text-blue-600 border-blue-100/50',
  'Resolved (Tech)': 'bg-indigo-50 text-indigo-600 border-indigo-100/50',
  'Resolved (CRM)': 'bg-emerald-50 text-emerald-600 border-emerald-100/50',
  Closed: 'bg-slate-50 text-slate-600 border-slate-100/50',
};

export const priorityColors: Record<TicketPriority, string> = {
  Low: 'bg-slate-50 text-slate-600 border-slate-100/50',
  Medium: 'bg-blue-50 text-blue-600 border-blue-100/50',
  High: 'bg-orange-50 text-orange-600 border-orange-100/50',
  Critical: 'bg-red-50 text-red-600 border-red-100/50',
};

export const visibleTicketsForRole = (role: Role) => {
  if (role === 'customer') {
    return tickets.filter((ticket) => ticket.company !== 'CRM Internal' && ticket.category !== 'Power');
  }

  if (role === 'technician') {
    return tickets.filter((ticket) => ['Area Inspector (AIS)', 'Onduty Water Team', 'ทีมดับเพลิง 304IP', 'Facility Response Team'].includes(ticket.assignee));
  }

  return tickets;
};

export const roleLabel: Record<Role, string> = {
  customer: 'Customer',
  crm: 'CRM Team',
  technician: 'Technician / Operation',
  admin: 'Admin / Management',
};

export const getDefaultView = (role: Role) => {
  if (role === 'customer') return 'tickets';
  if (role === 'technician') return 'assigned';
  if (role === 'crm') return 'tickets';
  return 'dashboard';
};

export const reportCards = [
  { label: 'Open', value: '12', icon: AlertTriangle, tone: 'text-amber-700 bg-amber-50' },
  { label: 'In Progress', value: '18', icon: Users, tone: 'text-blue-700 bg-blue-50' },
  { label: 'Resolved (CRM)', value: '09', icon: ShieldCheck, tone: 'text-emerald-700 bg-emerald-50' },
  { label: 'Auto-close Pending', value: '04', icon: Wrench, tone: 'text-slate-700 bg-slate-100' },
];
