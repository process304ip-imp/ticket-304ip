import { supabase } from './supabase';
import type { Database } from '../types/supabase';

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
    full_name?: string | null;
    department?: string[] | null;
  } | null;
  mode?: 'board' | 'assigned';
};

const isTicketAssignedToProfile = (ticket: any, teams: ResponseTeam[], profile?: TicketListOptions['profile']) => {
  if (!profile) return true;
  
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
    assignedTeam.specialty,
    assignedTeam.area,
  ].filter(Boolean);

  // Check if any of user's departments match any of the team's attributes
  return profileDepts.some(dept => teamAttributes.includes(dept));
};

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

            if (profileDepts.length === 0) return true; // Show all unassigned if no department set
            
            // Check if any of technician's departments match the ticket category
            const cat = (ticket.category || '').toLowerCase();
            return profileDepts.some(dept => {
              const d = (dept || '').toLowerCase();
              // Generic technician/staff can see all open unassigned tickets
              if (d === 'technician' || d === 'staff' || d === 'all') return true;
              return d.includes(cat) || cat.includes(d);
            });
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
      // Fetch logs to extract media urls
      const { data: logs } = await supabase.from('ticket_logs').select('media_urls').eq('ticket_id', id);
      
      // Gather all attachment paths
      const pathsToDelete: string[] = [];
      if (logs) {
        logs.forEach(log => {
          if (log.media_urls) {
            log.media_urls.forEach(url => {
              const parts = url.split('/ticket-attachments/');
              if (parts.length > 1) {
                pathsToDelete.push(parts[1]);
              }
            });
          }
        });
      }

      // Delete storage files
      if (pathsToDelete.length > 0) {
        await supabase.storage.from('ticket-attachments').remove(pathsToDelete);
      }

      // Delete logs first just in case there is no cascade set up
      await supabase.from('ticket_logs').delete().eq('ticket_id', id);
      
      // Delete the ticket
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

      if (team && team.status !== 'busy') {
        await api.teams.update(team.id, { status: 'busy' });
      }

      if (previousAssignee && previousAssignee !== teamName) {
        const previousTeam = teams.find((item) => item.name === previousAssignee);
        if (previousTeam) {
          const activeTickets = (await api.tickets.list()).filter((item: any) => (
            item.id !== ticketId && item.assignee === previousAssignee && item.status !== 'Closed'
          ));
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
            const activeTickets = (await api.tickets.list()).filter((item: any) => (
              item.id !== ticketId && item.assignee === ticket.assignee && item.status !== 'Closed'
            ));
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
    async uploadAttachment(ticketId: string, file: File) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${ticketId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const { data, error } = await supabase.storage
        .from('ticket-attachments')
        .upload(fileName, file);
        
      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage
        .from('ticket-attachments')
        .getPublicUrl(fileName);
        
      return publicUrl;
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
