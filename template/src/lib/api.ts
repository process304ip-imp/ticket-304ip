import { supabase } from './supabase';
import type { Database } from '../types/supabase';
import { uploadToR2, uploadWithProgress, deleteFromR2, detectStorageProvider, finalizeR2Attachments } from './r2-upload';

export type Ticket = Database['public']['Tables']['tickets']['Row'];
export type TicketLog = Database['public']['Tables']['ticket_logs']['Row'];
export type Company = Database['public']['Tables']['companies']['Row'];
export interface CompanyWithStatus extends Company {
  isRegistered?: boolean;
}
export type ResponseTeam = Database['public']['Tables']['response_teams']['Row'];

export function getAvatarUrl(empId?: string | null) {
  if (!empId) return null;
  return `https://wms.advanceagro.net/WSVIS/api/Face/GetImage?CardID=${empId}`;
}


type TicketListOptions = {
  role?: string;
  profile?: {
    id?: string;
    full_name?: string | null;
    department?: string[] | null;
    teams?: string[] | null;
  } | null;
  mode?: 'board' | 'assigned';
};

const isTicketAssignedToProfile = (ticket: any, teams: ResponseTeam[], profile?: TicketListOptions['profile']) => {
  if (!profile) return true;
  
  // 1. Direct responder assignment check (using name or id if available)
  if (ticket.responder === profile.full_name) return true;

  // 2. Team-based assignment check
  if (ticket.assignee && profile.teams && profile.teams.length > 0) {
    const assignedTeam = teams.find((team) => team.name === ticket.assignee);
    if (assignedTeam && profile.teams.includes(assignedTeam.id)) return true;
    if (profile.teams.includes(ticket.assignee)) return true;
  }
  
  // Legacy logic fallback (using departments)
  const profileDepts = Array.isArray(profile.department) ? profile.department : (profile.department ? [profile.department] : []);
  
  const values = new Set([
    profile.full_name,
    ...profileDepts
  ].filter(Boolean).map(String));

  if (!ticket.assignee) return false;
  if (values.has(ticket.assignee)) return true;

  const assignedTeam = teams.find((team) => team.name === ticket.assignee);
  if (!assignedTeam || profileDepts.length === 0) return false;

  const teamAttributes = [
    assignedTeam.id,
    assignedTeam.name,
    assignedTeam.role_label,
    ...(assignedTeam.specialty ? assignedTeam.specialty.split(',').map((s: string) => s.trim()) : []),
    assignedTeam.area,
  ].filter(Boolean);

  // Check if any of user's departments match any of the team's attributes
  return profileDepts.some(dept => teamAttributes.includes(dept));
};

/**
 * Terminal/active ticket status helper — used to decide if a team can be released.
 * A team is "busy" while any assigned ticket is still in a non-terminal state.
 * Terminal states: 'Closed' only. All others (including Resolved variants) are active
 * because they may still require CRM verification or customer feedback.
 */
const TERMINAL_STATUSES = new Set(['Closed']);
const isTicketActive = (status: string) => !TERMINAL_STATUSES.has(status);

export const api = {
  tickets: {
    async list(options: TicketListOptions = {}) {
      const { data, error } = await supabase
        .from('tickets')
        .select('*, companies!tickets_company_id_fkey(name, area), creator:user_profiles!tickets_created_by_fkey(full_name, emp_id, role), responder:user_profiles!tickets_responder_id_fkey(full_name, emp_id, role), ticket_affected_companies(company_id), ticket_feedback(*), ticket_logs(timestamp)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (options.role === 'technician') {
        const teams = await api.teams.list().catch(() => []);
        return (data || []).filter((ticket: any) => {
          // 1. Show if assigned to me
          if (isTicketAssignedToProfile(ticket, teams, options.profile)) return true;
          
          // 2. Show if Open and matches my specialty/department
          if (ticket.status === 'Open' && !ticket.assignee) {
            const profileDepts = Array.isArray(options.profile?.department) 
              ? options.profile?.department 
              : (options.profile?.department ? [options.profile.department] : []);
              
            const profileTeams = Array.isArray(options.profile?.teams) ? options.profile?.teams : [];

            if (profileDepts.length === 0 && profileTeams.length === 0) return true; // Show all unassigned if no department/team set
            
            // Check if any of technician's departments match the ticket category
            const cat = (ticket.category || '').toLowerCase();
            
            // Check legacy departments
            const matchesDept = profileDepts.some(dept => {
              const d = (dept || '').toLowerCase();
              // Generic technician/staff can see all open unassigned tickets
              if (d === 'technician' || d === 'staff' || d === 'all') return true;
              return d.includes(cat) || cat.includes(d);
            });
            
            if (matchesDept) return true;
            
            // Check team specialties
            if (profileTeams.length > 0) {
              const myTeams = teams.filter(t => profileTeams.includes(t.id) || profileTeams.includes(t.name));
              const mySpecialties = myTeams.flatMap(t => t.specialty ? t.specialty.split(',').map(s => s.trim().toLowerCase()) : []);
              if (mySpecialties.some(s => s.includes(cat) || cat.includes(s))) return true;
            }
          }
          
          return false;
        }) as Ticket[];
      }
      if (options.mode === 'assigned') {
        const teams = await api.teams.list().catch(() => []);
        return (data || []).filter((ticket: any) => isTicketAssignedToProfile(ticket, teams, options.profile)) as Ticket[];
      }
      return data as Ticket[];
    },
    async get(id: string) {
      const { data, error } = await supabase
        .from('tickets')
        .select('*, companies!tickets_company_id_fkey(name, area), creator:user_profiles!tickets_created_by_fkey(full_name, emp_id, role), responder:user_profiles!tickets_responder_id_fkey(full_name, emp_id, role), ticket_affected_companies(company_id), ticket_logs(*, author_profile:user_profiles!ticket_logs_author_id_fkey(full_name, emp_id, role)), ticket_feedback(*)')
        .eq('id', id);
      if (error) throw error;
      return (data && data.length > 0) ? data[0] : null;
    },
    async create(ticket: any) {
      const { data, error } = await supabase
        .from('tickets')
        .insert(ticket)
        .select()
        .single();
      if (error) throw error;
      return data as Ticket;
    },
    async update(id: string, updates: any, actor?: { name: string; role: any; id?: string }) {
      // 1. Get current state for audit log
      const { data: currentTicket } = await supabase.from('tickets').select('*').eq('id', id).single();
      
      // 2. Perform update
      const { data, error } = await supabase
        .from('tickets')
        .update(updates)
        .eq('id', id)
        .select();
      if (error) throw error;

      // 3. Auto-generate audit logs for important field changes
      if (currentTicket && actor) {
        const changes: string[] = [];
        const fieldsToTrack = ['status', 'priority', 'category', 'sub_category', 'assignee'];
        
        fieldsToTrack.forEach(field => {
          if (updates[field] !== undefined && updates[field] !== currentTicket[field]) {
            let fromVal = currentTicket[field];
            let toVal = updates[field];
            
            // Handle field value display if needed
            if (field === 'category_id' || field === 'sub_category_id') {
              // We could fetch names here, but for now we'll just log the update
              changes.push(`เปลี่ยน ${field.replace('_id', '')}`);
            } else {
              changes.push(`เปลี่ยน ${field} จาก "${fromVal || 'ว่าง'}" เป็น "${toVal}"`);
            }
          }
        });

        if (changes.length > 0) {
          await api.tickets.addLog({
            ticket_id: id,
            message: `[System Update] ${changes.join('\n')}`,
            author_name: actor.name || 'System',
            author_id: actor.id || null,
            author_role: actor.role,
            status_from: currentTicket.status,
            status_to: updates.status || currentTicket.status,
            is_internal: false // System updates are usually public
          });
        }
      }

      return (data && data.length > 0) ? data[0] : null;
    },
    async delete(id: string) {
      // ── 1. Release assigned team BEFORE deleting (prevent team stuck at 'busy') ──
      try {
        const ticketToDelete = await api.tickets.get(id) as any;
        if (ticketToDelete?.assignee) {
          const teams = await api.teams.list();
          const team = teams.find((t) => t.name === ticketToDelete.assignee);
          if (team) {
            const otherActive = (await api.tickets.list()).filter((t: any) =>
              t.id !== id && t.assignee === ticketToDelete.assignee && isTicketActive(t.status)
            );
            if (otherActive.length === 0) {
              await api.teams.update(team.id, { status: 'available' });
            }
          }
        }
      } catch (releaseErr) {
        console.warn('[Delete] Could not auto-release team (non-critical):', releaseErr);
      }

      // ── 2. Collect all media URLs from logs (covers both creation & log attachments) ──
      const { data: logs } = await supabase.from('ticket_logs').select('media_urls').eq('ticket_id', id);

      const supabasePaths: string[] = [];
      const r2Urls: string[] = [];

      if (logs) {
        logs.forEach(log => {
          (log.media_urls || []).forEach((url: string) => {
            const provider = detectStorageProvider(url);
            if (provider === 'supabase') {
              const parts = url.split('/ticket-attachments/');
              if (parts.length > 1) supabasePaths.push(parts[1]);
            } else if (provider === 'r2') {
              r2Urls.push(url);
            }
          });
        });
      }

      // ── 3. Delete files in parallel for speed ──
      await Promise.all([
        supabasePaths.length > 0
          ? supabase.storage.from('ticket-attachments').remove(supabasePaths)
          : Promise.resolve(),
        ...r2Urls.map(url =>
          deleteFromR2(url).catch(err =>
            console.warn('[Delete] R2 file delete failed (non-critical):', url, err)
          )
        ),
      ]);

      // ── 4. Delete child rows then ticket ──
      await supabase.from('ticket_logs').delete().eq('ticket_id', id);
      const { error } = await supabase.from('tickets').delete().eq('id', id);
      if (error) throw error;
    },
    async addLog(log: {
      ticket_id: string;
      message: string;
      author_name: string;
      author_id?: string | null;
      author_role: 'customer' | 'crm' | 'technician' | 'admin';
      status_from?: string | null;
      status_to?: string | null;
      media_urls?: string[];
      is_internal?: boolean;
    }) {
      const { data, error } = await supabase
        .from('ticket_logs')
        .insert(log)
        .select();
      if (error) throw error;
      return (data && data.length > 0) ? data[0] : null;
    },
    subscribe(callback: () => void) {
      return supabase
        .channel('public:tickets')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, callback)
        .subscribe();
    },
    subscribeLogs(ticketId: string, callback: () => void) {
      return supabase
        .channel(`public:ticket_logs:${ticketId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_logs', filter: `ticket_id=eq.${ticketId}` }, callback)
        .subscribe();
    },
    async addFeedback(feedback: any) {
      const { data, error } = await supabase
        .from('ticket_feedback')
        .insert(feedback)
        .select();
      if (error) throw error;
      return (data && data.length > 0) ? data[0] : null;
    },
    async getLeaderboardData() {
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          assignee,
          status,
          ticket_feedback (
            fix_quality_score,
            service_quality_score,
            score
          )
        `)
        .not('assignee', 'is', null);
      if (error) throw error;
      return data;
    },
    async getIndividualLeaderboardData() {
      // 1. Get all staff/admin/technician profiles
      const { data: profiles, error: pError } = await supabase
        .from('user_profiles')
        .select('*')
        .in('role', ['crm', 'admin', 'technician']);
      if (pError) throw pError;

      // 2. Get tickets and their feedback for staff scores
      const { data: tickets, error: tError } = await supabase
        .from('tickets')
        .select(`
          id,
          created_by,
          status,
          ticket_feedback (score)
        `);
      if (tError) throw tError;

      // 3. Get logs for technician activity
      const { data: logs, error: lError } = await supabase
        .from('ticket_logs')
        .select('author_id, status_to')
        .in('status_to', ['In Progress', 'Resolved', 'Resolved (Tech)']);
      if (lError) throw lError;

      return { profiles, tickets, logs };
    },
    async getRecentFeedback(limit = 5) {
      const { data, error } = await supabase
        .from('ticket_feedback')
        .select('*, tickets(assignee, category, sub_category)')
        .not('fix_quality_comment', 'is', null)
        .order('submitted_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
    async assign(ticketId: string, teamName: string, actorRole: string, note?: string, actor?: { name: string; role: any; id?: string }) {
      const teams = await api.teams.list();
      const team = teams.find((item) => item.name === teamName);
      const ticket = await api.tickets.get(ticketId) as any;
      const previousAssignee = ticket?.assignee;

      await api.tickets.update(ticketId, { assignee: teamName }, {
        name: actor?.name || 'System',
        role: actorRole,
        id: actor?.id
      });

      // Mark new team as busy
      if (team && team.status !== 'busy') {
        await api.teams.update(team.id, { status: 'busy' });
      }

      // Release previous team if they have no other active tickets
      if (previousAssignee && previousAssignee !== teamName) {
        const previousTeam = teams.find((item) => item.name === previousAssignee);
        if (previousTeam) {
          const activeTickets = (await api.tickets.list()).filter((item: any) =>
            item.id !== ticketId &&
            item.assignee === previousAssignee &&
            isTicketActive(item.status)
          );
          if (activeTickets.length === 0) {
            await api.teams.update(previousTeam.id, { status: 'available' });
          }
        }
      }
    },
    async closeWithTeamRelease(ticketId: string, updates: any = {}) {
      const ticket = await api.tickets.get(ticketId) as any;
      const data = await api.tickets.update(ticketId, { ...updates, status: 'Closed' });
      if (ticket?.assignee) {
        try {
          const teams = await api.teams.list();
          const team = teams.find((item) => item.name === ticket.assignee);
          if (team) {
            const activeTickets = (await api.tickets.list()).filter((item: any) =>
              item.id !== ticketId &&
              item.assignee === ticket.assignee &&
              isTicketActive(item.status)
            );
            if (activeTickets.length === 0) {
              await api.teams.update(team.id, { status: 'available' });
            }
          }
        } catch (error) {
          console.warn('Unable to auto-release team from current role:', error);
        }
      }
      return data;
    }
  },
  companies: {
    async list(options: { includeRegistration?: boolean } = {}) {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name');
      if (error) throw error;

      const companies = (data || []) as CompanyWithStatus[];
      if (!options.includeRegistration || companies.length === 0) return companies;

      const { data: profiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('company_id')
        .not('company_id', 'is', null);

      if (profileError) {
        console.warn('Unable to load registration status:', profileError);
        return companies;
      }

      const registeredCompanyIds = new Set((profiles || []).map((profile) => profile.company_id).filter(Boolean));
      return companies.map((company) => {
        return { ...company, isRegistered: registeredCompanyIds.has(company.id) };
      });
    },
    async get(id: string) {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    async create(company: Database['public']['Tables']['companies']['Insert']) {
      const { data, error } = await supabase
        .from('companies')
        .insert(company)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    async update(id: string, updates: Partial<Company>) {
      const { data, error } = await supabase
        .from('companies')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    async delete(id: string) {
      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', id);
      if (error) throw error;
    }
  },
  teams: {
    async list() {
      const { data, error } = await supabase
        .from('response_teams')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as ResponseTeam[];
    },
    async listAll() {
      const { data, error } = await supabase
        .from('response_teams')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as ResponseTeam[];
    },
    async create(team: any) {
      const { data, error } = await supabase.from('response_teams').insert(team).select().single();
      if (error) throw error;
      return data as ResponseTeam;
    },
    async update(id: string, updates: Partial<ResponseTeam>) {
      const { data, error } = await supabase.from('response_teams').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data as ResponseTeam;
    },
    subscribe(callback: () => void) {
      return supabase
        .channel('public:response_teams')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'response_teams' }, callback)
        .subscribe();
    }
  },
  storage: {
    async uploadAttachment(ticketId: string, file: File): Promise<string> {
      // Try R2 first (primary storage)
      try {
        const url = await uploadToR2(file, ticketId);
        console.log('[Upload] provider: r2', file.type, `${Math.round(file.size / 1024)}KB`);
        return url;
      } catch (r2Error) {
        console.warn('[Upload] R2 failed, falling back to Supabase:', r2Error);
      }

      // Fallback: Supabase Storage (legacy bucket)
      const fileExt = file.name.split('.').pop();
      const fileName = `${ticketId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const { error } = await supabase.storage
        .from('ticket-attachments')
        .upload(fileName, file);
      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('ticket-attachments')
        .getPublicUrl(fileName);

      console.log('[Upload] provider: supabase (fallback)', file.type);
      return publicUrl;
    },
    async uploadAttachmentProgress(
      ticketId: string,
      file: File,
      onProgress: (percent: number) => void
    ): Promise<string> {
      // Try R2 first (primary storage)
      try {
        const url = await uploadWithProgress(file, ticketId, onProgress);
        console.log('[Upload] provider: r2 (presigned)', file.type, `${Math.round(file.size / 1024)}KB`);
        return url;
      } catch (r2Error) {
        console.warn('[Upload] R2 presigned failed, falling back to Supabase (simulated progress):', r2Error);
      }

      // Fallback: Supabase Storage (legacy bucket)
      const fileExt = file.name.split('.').pop();
      const fileName = `${ticketId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      onProgress(10);
      const { error } = await supabase.storage
        .from('ticket-attachments')
        .upload(fileName, file);
      if (error) throw error;
      onProgress(90);

      const { data: { publicUrl } } = supabase.storage
        .from('ticket-attachments')
        .getPublicUrl(fileName);

      onProgress(100);
      console.log('[Upload] provider: supabase (fallback)', file.type);
      return publicUrl;
    },
    async finalizeAttachments(draftId: string, ticketId: string): Promise<string[]> {
      try {
        const urls = await finalizeR2Attachments(draftId, ticketId);
        console.log('[Storage] Finalized attachments from R2 draft:', draftId, 'to ticket:', ticketId);
        return urls;
      } catch (err) {
        console.warn('[Storage] R2 finalize failed, returning empty array to fallback to original URLs:', err);
        return [];
      }
    }
  },
  notifications: {
    async list() {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('is_read', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    async markAsRead(id: string) {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);
      if (error) throw error;
    },
    subscribe(userId: string, callback: (payload: any) => void) {
      return supabase
        .channel(`public:notifications:${userId}`)
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        }, callback)
        .subscribe();
    }
  },
  masterData: {
    async listCategories() {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
    async listSubCategories(categoryId?: string) {
      let query = supabase
        .from('sub_categories')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    async listQuickTemplates(categoryId?: string) {
      let query = supabase
        .from('quick_templates')
        .select('*, categories(name)')
        .eq('is_active', true);
      
      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  }
};
