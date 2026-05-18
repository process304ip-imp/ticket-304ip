/**
 * StatusStepper — Ticket Lifecycle Progress Bar
 * แสดง pipeline สถานะ Ticket แบบ visual ลดความ confused
 * Open → In Progress → Resolved (Tech) → Resolved (CRM) → Closed
 */
import React from 'react';
import { CheckCircle2, Circle, Clock, AlertCircle, Zap, ClipboardCheck, Star, XCircle } from 'lucide-react';

export type TicketStatus =
  | 'Open'
  | 'In Progress'
  | 'Resolved (Tech)'
  | 'Resolved (CRM)'
  | 'Closed';

interface StepMeta {
  status: TicketStatus;
  label: string;
  labelEn: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  ringColor: string;
  lineColor: string;
}

const STEPS: StepMeta[] = [
  {
    status: 'Open',
    label: 'เปิดงาน',
    labelEn: 'Open',
    description: 'รับแจ้งปัญหา รอ CRM ตรวจสอบ',
    icon: <AlertCircle size={16} />,
    color: 'text-red-600',
    bgColor: 'bg-red-500',
    ringColor: 'ring-red-300',
    lineColor: 'bg-red-400',
  },
  {
    status: 'In Progress',
    label: 'กำลังดำเนินการ',
    labelEn: 'In Progress',
    description: 'ทีมรับผิดชอบกำลังแก้ไขปัญหา',
    icon: <Zap size={16} />,
    color: 'text-amber-600',
    bgColor: 'bg-amber-500',
    ringColor: 'ring-amber-300',
    lineColor: 'bg-amber-400',
  },
  {
    status: 'Resolved (Tech)',
    label: 'ช่างตรวจรับแล้ว',
    labelEn: 'Resolved (Tech)',
    description: 'ทีมช่างยืนยันงานเสร็จ รอ CRM ตรวจสอบ',
    icon: <ClipboardCheck size={16} />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-500',
    ringColor: 'ring-blue-300',
    lineColor: 'bg-blue-400',
  },
  {
    status: 'Resolved (CRM)',
    label: 'CRM ยืนยันแล้ว',
    labelEn: 'Resolved (CRM)',
    description: 'CRM ตรวจรับงาน รอ Feedback จากลูกค้า',
    icon: <Star size={16} />,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-500',
    ringColor: 'ring-emerald-300',
    lineColor: 'bg-emerald-400',
  },
  {
    status: 'Closed',
    label: 'ปิดงาน',
    labelEn: 'Closed',
    description: 'งานเสร็จสมบูรณ์ ลูกค้าพึงพอใจ',
    icon: <CheckCircle2 size={16} />,
    color: 'text-slate-500',
    bgColor: 'bg-slate-500',
    ringColor: 'ring-slate-300',
    lineColor: 'bg-slate-300',
  },
];

const STATUS_ORDER: TicketStatus[] = [
  'Open',
  'In Progress',
  'Resolved (Tech)',
  'Resolved (CRM)',
  'Closed',
];

interface StatusStepperProps {
  currentStatus: string;
  /** ticket_logs sorted oldest-first for timestamps */
  logs?: Array<{ status_to?: string | null; timestamp?: string | null; author_name?: string | null }>;
  compact?: boolean;
}

export function StatusStepper({ currentStatus, logs = [], compact = false }: StatusStepperProps) {
  const currentIndex = STATUS_ORDER.indexOf(currentStatus as TicketStatus);

  // Build a map: status → first time it was entered + who changed it
  const statusHistory = React.useMemo(() => {
    const map: Record<string, { time: string; actor: string }> = {};
    // Sort oldest first for history building
    const sorted = [...logs].sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return ta - tb;
    });
    sorted.forEach((log) => {
      if (log.status_to && !map[log.status_to]) {
        map[log.status_to] = {
          time: log.timestamp
            ? new Date(log.timestamp).toLocaleString('th-TH', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '',
          actor: log.author_name || '',
        };
      }
    });
    return map;
  }, [logs]);

  if (compact) {
    // Compact horizontal pill version for ticket cards
    return (
      <div className="flex items-center gap-1">
        {STEPS.map((step, idx) => {
          const isPast = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          return (
            <React.Fragment key={step.status}>
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  idx === 0 ? 'w-6' : isCurrent ? 'w-10' : 'w-6'
                } ${
                  isPast
                    ? step.bgColor
                    : isCurrent
                    ? `${step.bgColor} animate-pulse`
                    : 'bg-slate-200'
                }`}
                title={step.label}
              />
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-5">
        <Clock size={16} className="text-slate-400" />
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">
          Ticket Progress
        </h3>
      </div>

      {/* Desktop: Horizontal stepper */}
      <div className="hidden sm:block">
        <div className="flex items-start">
          {STEPS.map((step, idx) => {
            const isPast = idx < currentIndex;
            const isCurrent = idx === currentIndex;
            const isFuture = idx > currentIndex;
            const hist = statusHistory[step.status];
            const isLast = idx === STEPS.length - 1;

            return (
              <React.Fragment key={step.status}>
                <div className="flex flex-col items-center min-w-0 flex-1">
                  {/* Circle indicator */}
                  <div className="relative flex items-center justify-center mb-2">
                    {isCurrent && (
                      <span className={`absolute w-10 h-10 rounded-full ${step.bgColor} opacity-20 animate-ping`} />
                    )}
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-500 z-10 ${
                        isPast
                          ? `${step.bgColor} border-transparent text-white shadow-sm`
                          : isCurrent
                          ? `${step.bgColor} border-white ring-4 ${step.ringColor} text-white shadow-lg`
                          : 'bg-slate-100 border-slate-200 text-slate-400'
                      }`}
                    >
                      {isPast ? <CheckCircle2 size={16} /> : step.icon}
                    </div>
                  </div>

                  {/* Label */}
                  <p
                    className={`text-[10px] font-black text-center leading-tight px-1 ${
                      isCurrent ? step.color : isPast ? 'text-slate-600' : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </p>

                  {/* Timestamp + actor */}
                  {hist ? (
                    <div className="mt-1 text-center">
                      <p className="text-[9px] font-bold text-slate-500 leading-tight">{hist.time}</p>
                      {hist.actor && (
                        <p className="text-[9px] text-slate-400 truncate max-w-[80px]">{hist.actor}</p>
                      )}
                    </div>
                  ) : isFuture ? (
                    <p className="mt-1 text-[9px] text-slate-300 font-medium">รอดำเนินการ</p>
                  ) : null}
                </div>

                {/* Connector line */}
                {!isLast && (
                  <div className="flex-shrink-0 w-full max-w-[40px] mt-4 px-1">
                    <div
                      className={`h-0.5 w-full rounded-full transition-all duration-700 ${
                        idx < currentIndex ? step.lineColor : 'bg-slate-200'
                      }`}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Mobile: Vertical stepper */}
      <div className="sm:hidden space-y-0">
        {STEPS.map((step, idx) => {
          const isPast = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          const hist = statusHistory[step.status];
          const isLast = idx === STEPS.length - 1;

          return (
            <div key={step.status} className="flex gap-3">
              {/* Left: dot + line */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${
                    isPast
                      ? `${step.bgColor} border-transparent text-white`
                      : isCurrent
                      ? `${step.bgColor} border-white ring-2 ${step.ringColor} text-white`
                      : 'bg-slate-100 border-slate-200 text-slate-400'
                  }`}
                >
                  {isPast ? <CheckCircle2 size={12} /> : step.icon}
                </div>
                {!isLast && (
                  <div className={`w-0.5 flex-1 min-h-[24px] my-1 rounded-full ${idx < currentIndex ? step.lineColor : 'bg-slate-100'}`} />
                )}
              </div>

              {/* Right: content */}
              <div className={`pb-4 min-w-0 ${isLast ? '' : ''}`}>
                <p className={`text-xs font-black ${isCurrent ? step.color : isPast ? 'text-slate-700' : 'text-slate-400'}`}>
                  {step.label}
                </p>
                {hist ? (
                  <p className="text-[10px] text-slate-400 mt-0.5">{hist.time} · {hist.actor}</p>
                ) : (
                  <p className="text-[10px] text-slate-300 mt-0.5">{step.description}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
