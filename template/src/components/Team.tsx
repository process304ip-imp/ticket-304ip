import React, { useState, useEffect } from 'react';
import { AlertTriangle, ClipboardList, Mail, MapPin, Phone, Plus, Radio, Search, Send, Users, X, Loader2 } from 'lucide-react';
import { Notification } from '../App';
import { priorityColors } from '../data';
import { api, Ticket, ResponseTeam } from '../lib/api';
import { useToast } from './Toast';
import { formatPhoneNumber } from '../lib/utils';

export function Team({ onAddNotification }: { onAddNotification: (title: string, message: string, type: Notification['type']) => void }) {
  const [teams, setTeams] = useState<ResponseTeam[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [selectedTicketId, setSelectedTicketId] = useState<string>('');
  const [dispatchNote, setDispatchNote] = useState('');

  const fetchData = async () => {
    const [teamsResult, ticketsResult] = await Promise.allSettled([
      api.teams.list(),
      api.tickets.list()
    ]);

    if (teamsResult.status === 'fulfilled') {
      const teamsData = teamsResult.value;
      setTeams(teamsData);
      if (teamsData.length > 0) setSelectedTeamId(teamsData[0].id);
    } else {
      console.error('Error fetching teams:', teamsResult.reason);
      toast.error('โหลดทีมตอบสนองไม่สำเร็จ', teamsResult.reason?.message || 'กรุณาตรวจสอบสิทธิ์หรือตาราง response_teams');
    }

    if (ticketsResult.status === 'fulfilled') {
      const ticketsData = ticketsResult.value;
      setTickets(ticketsData);
      const openTicket = ticketsData.find(t => t.status !== 'Closed');
      if (openTicket) setSelectedTicketId(openTicket.id);
    } else {
      console.error('Error fetching tickets:', ticketsResult.reason);
      toast.error('โหลด Ticket ไม่สำเร็จ', ticketsResult.reason?.message || 'กรุณาตรวจสอบสิทธิ์หรือตาราง tickets');
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    const teamsSub = api.teams.subscribe(() => {
      fetchData();
    });
    
    const ticketsSub = api.tickets.subscribe(() => {
      fetchData();
    });

    return () => {
      teamsSub.unsubscribe();
      ticketsSub.unsubscribe();
    };
  }, []);

  const handleAssign = async () => {
    try {
      const team = teams.find((item) => item.id === selectedTeamId);
      if (!team) return;
      await api.tickets.assign(selectedTicketId, team.name, 'crm', dispatchNote);
      onAddNotification('มอบหมายงานสำเร็จ', `${selectedTicketId} ถูกส่งให้ ${team?.name || 'ทีมตอบสนอง'} แล้ว`, 'assignment');
      toast.success('มอบหมายงานสำเร็จ', `${selectedTicketId} → ${team?.name}`);
      setAssignModalOpen(false);
      setDispatchNote('');
      fetchData(); // Refresh data
    } catch (error) {
      console.error('Error assigning ticket:', error);
      toast.error('มอบหมายงานไม่สำเร็จ', 'กรุณาลองใหม่อีกครั้ง');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500">
        <Loader2 className="animate-spin mb-4 text-primary" size={48} />
        <p className="font-bold animate-pulse">กำลังดึงข้อมูลทีมตอบสนอง...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-primary tracking-tight">Response Team Dispatch</h2>
          <p className="text-sm text-slate-500 mt-1">Assign งานให้ Area Inspector, Onduty, ทีมดับเพลิง 304IP และ Operation ตามพื้นที่/ประเภทปัญหา</p>
        </div>
        <button onClick={() => setAssignModalOpen(true)} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary-container shadow-sm">
          <ClipboardList size={16} />
          Assign Ticket
        </button>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="ค้นหาทีม, พื้นที่, ความเชี่ยวชาญ..." className="w-full bg-white border border-slate-300 rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
        </div>
        <div className="flex flex-wrap gap-4 text-sm font-bold">
          <Legend color="bg-green-500" label={`ว่าง (${teams.filter((team) => team.status === 'available').length})`} />
          <Legend color="bg-orange-500" label={`กำลังทำงาน (${teams.filter((team) => team.status === 'busy').length})`} />
          <Legend color="bg-slate-400" label={`ออฟไลน์ (${teams.filter((team) => team.status === 'offline').length})`} />
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {teams.map((team) => (
          <article key={team.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-5 flex-1">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-primary flex items-center justify-center border border-blue-100">
                  <Radio size={24} />
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5 ${
                  team.status === 'available' ? 'bg-green-50 text-green-700 border-green-200' :
                  team.status === 'busy' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                  'bg-slate-50 text-slate-600 border-slate-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${team.status === 'available' ? 'bg-green-500 animate-pulse' : team.status === 'busy' ? 'bg-orange-500' : 'bg-slate-400'}`} />
                  {team.status === 'available' ? 'ว่าง' : team.status === 'busy' ? 'กำลังทำงาน' : 'ออฟไลน์'}
                </span>
              </div>

              <h3 className="font-black text-lg text-slate-900 leading-tight">{team.name}</h3>
              <p className="text-sm text-primary font-bold mb-4">{team.role_label}</p>

              <div className="space-y-2 mb-4">
                <p className="flex items-center gap-2 text-xs text-slate-600"><MapPin size={14} className="text-slate-400" />{team.area}</p>
                <p className="flex items-center gap-2 text-xs text-slate-600"><Users size={14} className="text-slate-400" />{team.specialty}</p>
                <p className="flex items-center gap-2 text-xs text-slate-600"><Phone size={14} className="text-slate-400" />{formatPhoneNumber(team.phone)}</p>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Today's Workload</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-sm font-black text-slate-800">
                      {tickets.filter(t => t.assignee === team.name && t.status !== 'Closed').length} <span className="text-[10px] font-normal text-slate-500">Active</span>
                    </span>
                    <div className="w-px h-3 bg-slate-200" />
                    <span className="text-sm font-black text-emerald-600">
                      {tickets.filter(t => t.assignee === team.name && t.status === 'Closed').length} <span className="text-[10px] font-normal text-slate-500">Done</span>
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Load</p>
                  <p className="text-sm font-black text-primary">{(tickets.filter(t => t.assignee === team.name && t.status !== 'Closed').length * 20)}%</p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Active Tickets List</p>
                <div className="space-y-2">
                  {tickets.filter(t => t.assignee === team.name && t.status !== 'Closed').length ? tickets.filter(t => t.assignee === team.name && t.status !== 'Closed').map((ticket) => {
                    return (
                      <div key={ticket.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                        <div className="flex justify-between gap-2">
                          <span className="font-mono text-xs font-black text-primary">{ticket.id}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${priorityColors[ticket.priority]}`}>{ticket.priority}</span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{ticket.sub_category}</p>
                      </div>
                    );
                  }) : (
                    <p className="text-xs text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-lg p-3">ไม่มีงานค้าง</p>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50">
              <button onClick={() => { setSelectedTeamId(team.id); setAssignModalOpen(true); }} className="w-full py-2.5 bg-primary text-white rounded-lg font-bold text-sm hover:bg-primary-container flex items-center justify-center gap-2 mb-2 shadow-sm">
                <Send size={16} />
                Dispatch
              </button>
              <div className="grid grid-cols-2 gap-2">
                <a href={`tel:${(team.phone || '').replace(/[^0-9+]/g, '')}`} className="py-2 flex items-center justify-center gap-2 text-sm font-bold text-slate-600 hover:bg-slate-200/50 rounded-lg bg-white border border-slate-200 transition-colors">
                  <Phone size={14} /> โทร
                </a>
                <button onClick={() => {
                  onAddNotification('ส่งแจ้งเตือนสำเร็จ', `ระบบได้ส่งข้อความแจ้งเตือนไปที่ ${team.name} แล้ว`, 'system');
                  toast.success('ส่งแจ้งเตือนแล้ว', `แจ้งเตือนทีม ${team.name} เรียบร้อย`);
                }} className="py-2 flex items-center justify-center gap-2 text-sm font-bold text-slate-600 hover:bg-slate-200/50 rounded-lg bg-white border border-slate-200 transition-colors">
                  <Mail size={14} /> แจ้งเตือน
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="text-lg font-black text-primary">Assign Ticket ให้ทีมตอบสนอง</h3>
              <button onClick={() => setAssignModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="text-red-600 shrink-0" size={20} />
                <p className="text-sm text-red-800 font-bold">สำหรับเคสด่วน เช่น Safety: Fire สามารถโยนงานให้ Area Inspector หรือทีมดับเพลิงได้ทันที</p>
              </div>
              <Field label="Ticket">
                <select value={selectedTicketId} onChange={(event) => setSelectedTicketId(event.target.value)} className="w-full form-field">
                  {tickets.filter((ticket) => ticket.status !== 'Closed').map((ticket) => (
                    <option key={ticket.id} value={ticket.id}>{ticket.id} - {ticket.sub_category} ({ticket.area})</option>
                  ))}
                </select>
              </Field>
              <Field label="Response by">
                <select value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)} className="w-full form-field">
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>{team.name} - {team.status}</option>
                  ))}
                </select>
              </Field>
              <Field label="หมายเหตุการสั่งงาน">
                <textarea 
                  value={dispatchNote} 
                  onChange={(e) => setDispatchNote(e.target.value)} 
                  className="w-full form-field resize-none" 
                  rows={3} 
                  placeholder="เช่น เคสด่วน ให้เข้าพื้นที่ภายใน 10 นาที และอัปเดต Log ทุกขั้นตอน" 
                />
              </Field>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button onClick={() => setAssignModalOpen(false)} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-700">ยกเลิก</button>
              <button onClick={handleAssign} className="flex-[2] py-3 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2">
                <Send size={18} />
                Dispatch Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-600">
      <span className={`w-3 h-3 rounded-full ${color}`} />
      {label}
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
