import React, { useState, useEffect } from 'react';
import { 
  Trophy, 
  Medal, 
  Star, 
  TrendingUp, 
  Users, 
  CheckCircle2, 
  Clock,
  ArrowUpRight,
  Filter,
  RefreshCw,
  Loader2,
  Award,
  User as UserIcon,
  UserCheck,
  Zap
} from 'lucide-react';
import { api, ResponseTeam } from '../lib/api';

interface TeamStats {
  team: ResponseTeam;
  avgFixQuality: number;
  avgServiceQuality: number;
  avgOverall: number;
  totalResolved: number;
  totalFeedback: number;
  rank: number;
}

interface UserStats {
  profile: any;
  score: number;
  totalAction: number; // For tech: resolved, For staff: opened
  checkins?: number; // For tech only
  rank: number;
}

export function Leaderboard() {
  const [stats, setStats] = useState<TeamStats[]>([]);
  const [staffStats, setStaffStats] = useState<UserStats[]>([]);
  const [techStats, setTechStats] = useState<UserStats[]>([]);
  const [recentFeedback, setRecentFeedback] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'teams' | 'individuals'>('individuals');
  const [timeFilter, setTimeFilter] = useState<'all' | 'month' | 'week'>('all');

  const getAvatarUrl = (emp_id?: string | null) => {
    if (!emp_id) return null;
    return `https://wms.advanceagro.net/WSVIS/api/Face/GetImage?CardID=${emp_id}`;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [teams, rawData, feedback, individualData] = await Promise.all([
        api.teams.list(),
        api.tickets.getLeaderboardData(),
        api.tickets.getRecentFeedback(6),
        api.tickets.getIndividualLeaderboardData()
      ]);

      setRecentFeedback(feedback || []);

      // 1. Process Team Stats
      const teamStatsMap = new Map<string, {
        fixScores: number[],
        serviceScores: number[],
        overallScores: number[],
        resolvedCount: number
      }>();

      teams.forEach(t => {
        teamStatsMap.set(t.name, {
          fixScores: [],
          serviceScores: [],
          overallScores: [],
          resolvedCount: 0
        });
      });

      rawData?.forEach((ticket: any) => {
        const teamName = ticket.assignee;
        const entry = teamStatsMap.get(teamName);
        if (!entry) return;

        if (ticket.status === 'Closed' || ticket.status === 'Resolved' || ticket.status === 'Resolved (Tech)' || ticket.status === 'Resolved (CRM)') {
          entry.resolvedCount++;
        }

        const fb = ticket.ticket_feedback;
        if (fb && fb.length > 0) {
          const f = fb[0];
          if (f.fix_quality_score) entry.fixScores.push(f.fix_quality_score);
          if (f.service_quality_score) entry.serviceScores.push(f.service_quality_score);
          if (f.score) entry.overallScores.push(f.score);
        }
      });

      const calculatedTeamStats: TeamStats[] = teams.map(team => {
        const s = teamStatsMap.get(team.name)!;
        const avgFix = s.fixScores.length ? s.fixScores.reduce((a, b) => a + b, 0) / s.fixScores.length : 0;
        const avgService = s.serviceScores.length ? s.serviceScores.reduce((a, b) => a + b, 0) / s.serviceScores.length : 0;
        const avgOverall = s.overallScores.length ? s.overallScores.reduce((a, b) => a + b, 0) / s.overallScores.length : 0;
        
        return {
          team,
          avgFixQuality: avgFix,
          avgServiceQuality: avgService,
          avgOverall: avgOverall,
          totalResolved: s.resolvedCount,
          totalFeedback: s.overallScores.length,
          rank: 0
        };
      });

      calculatedTeamStats.sort((a, b) => {
        if (b.avgOverall !== a.avgOverall) return b.avgOverall - a.avgOverall;
        return b.totalResolved - a.totalResolved;
      });
      calculatedTeamStats.forEach((s, i) => s.rank = i + 1);
      setStats(calculatedTeamStats);

      // 2. Process Individual Stats (Staff & Tech)
      const { profiles, tickets, logs } = individualData;

      // Staff stats: Score based on tickets they opened
      const processedStaff: UserStats[] = profiles
        .filter((p: any) => p.role === 'crm' || p.role === 'admin')
        .map((p: any) => {
          const opened = tickets.filter((t: any) => t.created_by === p.id);
          const scores = opened.map((t: any) => t.ticket_feedback?.[0]?.score).filter((s: any) => s !== undefined);
          const avgScore = scores.length ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
          return {
            profile: p,
            score: avgScore,
            totalAction: opened.length,
            rank: 0
          };
        })
        .sort((a: any, b: any) => (b.totalAction * 100 + b.score) - (a.totalAction * 100 + a.score));
      processedStaff.forEach((s, i) => s.rank = i + 1);
      setStaffStats(processedStaff);

      // Tech stats: Count checkins and resolved logs
      const processedTech: UserStats[] = profiles
        .filter((p: any) => p.role === 'technician')
        .map((p: any) => {
          const userLogs = logs.filter((l: any) => l.author_id === p.id);
          const resolvedCount = userLogs.filter((l: any) => l.status_to === 'Resolved' || l.status_to === 'Resolved (Tech)').length;
          const checkinCount = userLogs.filter((l: any) => l.status_to === 'In Progress').length;
          
          return {
            profile: p,
            score: 0,
            totalAction: resolvedCount,
            checkins: checkinCount,
            rank: 0
          };
        })
        .sort((a: any, b: any) => (b.totalAction * 10 + (b.checkins || 0)) - (a.totalAction * 10 + (a.checkins || 0)));
      processedTech.forEach((s, i) => s.rank = i + 1);
      setTechStats(processedTech);

    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeFilter]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500">
        <Loader2 className="animate-spin mb-4 text-primary" size={48} />
        <p className="font-bold animate-pulse text-lg">กำลังประมวลผลอันดับ...</p>
      </div>
    );
  }

  const RenderPodium = ({ item, color, icon: Icon, label }: { item: UserStats, color: string, icon: any, label: string }) => (
    <div className={`flex flex-col items-center space-y-4 animate-in slide-in-from-bottom-8 duration-700 w-full max-w-[200px]`}>
      <div className="relative">
        <div className={`w-24 h-24 rounded-[2rem] ${color === 'amber' ? 'bg-amber-50 border-amber-200' : color === 'slate' ? 'bg-slate-50 border-slate-200' : 'bg-orange-50 border-orange-200'} flex items-center justify-center border-4 rotate-3 shadow-lg overflow-hidden`}>
          {item.profile.emp_id ? (
            <img src={getAvatarUrl(item.profile.emp_id)!} alt={item.profile.full_name} className="w-full h-full object-cover" />
          ) : (
            <UserIcon className={`${color === 'amber' ? 'text-amber-400' : color === 'slate' ? 'text-slate-400' : 'text-orange-400'}`} size={32} />
          )}
        </div>
        <div className={`absolute -bottom-2 -right-2 w-10 h-10 rounded-full ${color === 'amber' ? 'bg-amber-400' : color === 'slate' ? 'bg-slate-400' : 'bg-orange-400'} border-4 border-white flex items-center justify-center shadow-lg`}>
          <Icon size={16} className="text-white" />
        </div>
      </div>
      <div className="text-center w-full">
        <h3 className="font-black text-slate-900 line-clamp-1 text-sm">{item.profile.full_name}</h3>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
      </div>
      <div className="w-full bg-white rounded-2xl p-4 shadow-xl border border-slate-100 text-center">
        <div className="text-2xl font-black text-slate-900">{item.totalAction}</div>
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.profile.role === 'technician' ? 'Resolved' : 'Opened'}</div>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Header Section */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary font-black uppercase tracking-[0.2em] text-[10px]">
            <Award size={14} />
            Performance Rankings
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Leaderboard</h1>
          <p className="text-slate-500 font-medium">ตารางอันดับพนักงานและทีม แยกตามผลงานและความพึงพอใจ</p>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <button
              onClick={() => setView('individuals')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${
                view === 'individuals' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              รายบุคคล (Individuals)
            </button>
            <button
              onClick={() => setView('teams')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${
                view === 'teams' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              รายทีม (Teams)
            </button>
          </div>
          
          <div className="flex items-center gap-2 bg-white p-1 rounded-2xl shadow-sm border border-slate-200">
            {(['week', 'month', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setTimeFilter(f)}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all ${
                  timeFilter === f 
                    ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {f === 'week' ? 'สัปดาห์นี้' : f === 'month' ? 'เดือนนี้' : 'ทั้งหมด'}
              </button>
            ))}
            <div className="w-px h-4 bg-slate-200 mx-1" />
            <button onClick={fetchData} className="p-2 text-slate-400 hover:text-primary transition-colors">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      </section>

      {view === 'individuals' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 pt-8">
          {/* Staff Leaderboard */}
          <div className="space-y-8 bg-slate-50/50 p-6 rounded-[2.5rem] border border-slate-100">
            <div className="flex items-center gap-3 border-b-4 border-primary/20 pb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <UserCheck size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">Staff CRM / Admin</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">วัดจากจำนวนการเปิด Ticket</p>
              </div>
            </div>

            {staffStats.length > 0 ? (
              <div className="space-y-8">
                <div className="flex justify-center">
                  <RenderPodium item={staffStats[0]} color="amber" icon={Trophy} label="Top Creator" />
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <tbody className="divide-y divide-slate-100">
                      {staffStats.slice(1, 6).map((s) => (
                        <tr key={s.profile.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-6 py-4 w-12 text-center">
                            <span className="text-xs font-black text-slate-400">#{s.rank}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                                {s.profile.emp_id ? (
                                  <img src={getAvatarUrl(s.profile.emp_id)!} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <UserIcon className="m-auto text-slate-400" size={16} />
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-black text-slate-800 line-clamp-1">{s.profile.full_name}</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{s.profile.role}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="text-sm font-black text-slate-900">{s.totalAction}</div>
                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-slate-400">Tickets</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-slate-400 font-bold">ไม่มีข้อมูลพนักงาน</div>
            )}
          </div>

          {/* Technician Leaderboard */}
          <div className="space-y-8 bg-slate-50/50 p-6 rounded-[2.5rem] border border-slate-100">
            <div className="flex items-center gap-3 border-b-4 border-orange-200 pb-4">
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-500">
                <Zap size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">Technicians</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">วัดจากจำนวนการปิดงาน</p>
              </div>
            </div>

            {techStats.length > 0 ? (
              <div className="space-y-8">
                <div className="flex justify-center">
                  <RenderPodium item={techStats[0]} color="orange" icon={Zap} label="Top Resolver" />
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <tbody className="divide-y divide-slate-100">
                      {techStats.slice(1, 6).map((s) => (
                        <tr key={s.profile.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-6 py-4 w-12 text-center">
                            <span className="text-xs font-black text-slate-400">#{s.rank}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                                {s.profile.emp_id ? (
                                  <img src={getAvatarUrl(s.profile.emp_id)!} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <UserIcon className="m-auto text-slate-400" size={16} />
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-black text-slate-800 line-clamp-1">{s.profile.full_name}</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{s.profile.department?.[0] || 'Technician'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-4">
                              <div className="text-right">
                                <div className="text-sm font-black text-slate-900">{s.checkins}</div>
                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Check-in</div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-black text-orange-500">{s.totalAction}</div>
                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Resolved</div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-slate-400 font-bold">ไม่มีข้อมูลช่าง</div>
            )}
          </div>
        </div>
      ) : (
        /* Team Leaderboard View */
        <>
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end pt-12">
            {[1, 0, 2].map((idx) => {
              const displayItem = stats[idx];
              if (!displayItem) return null;
              
              const isFirst = displayItem.rank === 1;
              return (
                <div key={displayItem.team.id} className={`flex flex-col items-center space-y-4 animate-in slide-in-from-bottom-8 duration-700 ${isFirst ? 'md:mb-8' : ''}`}>
                  <div className="relative">
                    <div className={`w-24 h-24 rounded-3xl bg-white flex items-center justify-center border-4 ${isFirst ? 'w-32 h-32 border-amber-200 bg-amber-50' : 'border-slate-200'} rotate-3 shadow-lg`}>
                      <span className={`font-black ${isFirst ? 'text-4xl text-amber-500' : 'text-2xl text-slate-400'}`}>{displayItem.team.id}</span>
                    </div>
                    {isFirst && <div className="absolute -top-8 left-1/2 -translate-x-1/2 animate-bounce"><Trophy size={48} className="text-amber-400" /></div>}
                  </div>
                  <div className="text-center">
                    <h3 className="text-lg font-black text-slate-900">{displayItem.team.role_label}</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{displayItem.team.name}</p>
                  </div>
                  <div className={`w-full bg-white rounded-[2rem] p-6 shadow-xl border ${isFirst ? 'border-amber-100 ring-4 ring-amber-50' : 'border-slate-100'} space-y-3 text-center`}>
                    <div className="text-3xl font-black text-slate-900">{displayItem.avgOverall.toFixed(1)}</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Average Score</div>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/30">
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Rank</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Team</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Activity</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.map((item) => (
                    <tr key={item.team.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-6">
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${
                          item.rank === 1 ? 'bg-amber-100 text-amber-700' :
                          item.rank === 2 ? 'bg-slate-100 text-slate-700' :
                          item.rank === 3 ? 'bg-orange-100 text-orange-700' :
                          'text-slate-400'
                        }`}>
                          {item.rank}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 font-black text-slate-400">
                            {item.team.id}
                          </div>
                          <div>
                            <h4 className="font-black text-slate-900">{item.team.role_label}</h4>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.team.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-6">
                           <div className="text-center">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Resolved</p>
                             <div className="flex items-center gap-1 justify-center">
                               <CheckCircle2 size={12} className="text-emerald-500" />
                               <span className="font-black text-slate-700">{item.totalResolved}</span>
                             </div>
                           </div>
                           <div className="text-center">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Feedback</p>
                             <div className="flex items-center gap-1 justify-center">
                               <Star size={12} className="text-amber-400" />
                               <span className="font-black text-slate-700">{item.totalFeedback}</span>
                             </div>
                           </div>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <span className="text-2xl font-black text-slate-900">{item.avgOverall.toFixed(2)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Customer Voice Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-6 bg-primary rounded-full" />
          <h3 className="text-2xl font-black text-slate-900 tracking-tight">Customer Voice</h3>
          <p className="text-sm text-slate-500 font-medium ml-2">— ความเห็นล่าสุดจากผู้ใช้บริการ</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recentFeedback.map((f) => (
            <div key={f.id} className="bg-white p-6 rounded-[2rem] shadow-lg border border-slate-100 flex flex-col justify-between hover:shadow-xl transition-shadow group">
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Customer Evaluation
                  </span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {new Date(f.submitted_at).toLocaleDateString('th-TH')}
                  </span>
                </div>
                
                <div className="flex flex-col gap-1 text-[11px] font-black text-slate-500 mb-3">
                  <div className="flex items-center justify-between">
                    <span>Repair Quality:</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} size={10} className={star <= (f.fix_quality_score || f.score) ? 'fill-amber-400 text-amber-400' : 'text-slate-100'} />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Staff Service:</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} size={10} className={star <= (f.service_quality_score || f.score) ? 'fill-blue-400 text-blue-400' : 'text-slate-100'} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="text-slate-700 font-bold leading-relaxed line-clamp-4 group-hover:line-clamp-none transition-all space-y-1.5 mt-2">
                  {f.fix_quality_comment && (
                    <p className="text-xs">
                      <span className="font-bold text-slate-500">ซ่อม:</span> "{f.fix_quality_comment}"
                    </p>
                  )}
                  {f.service_quality_comment && (
                    <p className="text-xs">
                      <span className="font-bold text-slate-500">บริการ:</span> "{f.service_quality_comment}"
                    </p>
                  )}
                  {!f.fix_quality_comment && !f.service_quality_comment && (
                    <p className="text-xs">
                      "{f.comment || 'ไม่มีข้อความเพิ่มเติม'}"
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-50 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-[10px]">
                  {f.tickets?.assignee?.substring(0, 2)}
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Team</p>
                  <p className="text-xs font-bold text-slate-900">{f.tickets?.assignee || 'Unassigned'}</p>
                </div>
                <ArrowUpRight size={14} className="ml-auto text-slate-300 group-hover:text-primary transition-colors" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
