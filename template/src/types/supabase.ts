export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          area: string
          contact_name: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          registration_link: string | null
        }
        Insert: {
          area: string
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id: string
          name: string
          phone?: string | null
          registration_link?: string | null
        }
        Update: {
          area?: string
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          registration_link?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          title: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          title: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          title?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      quick_templates: {
        Row: {
          category_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          target_status: string | null
          template_text: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          target_status?: string | null
          template_text: string
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          target_status?: string | null
          template_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      response_teams: {
        Row: {
          area: string | null
          id: string
          name: string
          phone: string | null
          role_label: string | null
          specialty: string | null
          status: string | null
          updated_at: string | null
          is_active: boolean | null
        }
        Insert: {
          area?: string | null
          id: string
          name: string
          phone?: string | null
          role_label?: string | null
          specialty?: string | null
          status?: string | null
          updated_at?: string | null
          is_active?: boolean | null
        }
        Update: {
          area?: string | null
          id?: string
          name?: string
          phone?: string | null
          role_label?: string | null
          specialty?: string | null
          status?: string | null
          updated_at?: string | null
          is_active?: boolean | null
        }
        Relationships: []
      }
      sub_categories: {
        Row: {
          category_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_affected_companies: {
        Row: {
          company_id: string
          ticket_id: string
        }
        Insert: {
          company_id: string
          ticket_id: string
        }
        Update: {
          company_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_affected_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_affected_companies_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_counters: {
        Row: {
          last_value: number
          ticket_date: string
        }
        Insert: {
          last_value?: number
          ticket_date: string
        }
        Update: {
          last_value?: number
          ticket_date?: string
        }
        Relationships: []
      }
      ticket_feedback: {
        Row: {
          comment: string | null
          fix_quality_comment: string | null
          fix_quality_score: number | null
          id: string
          score: number
          service_quality_comment: string | null
          service_quality_score: number | null
          submitted_at: string | null
          submitted_by: string | null
          ticket_id: string
        }
        Insert: {
          comment?: string | null
          fix_quality_comment?: string | null
          fix_quality_score?: number | null
          id?: string
          score: number
          service_quality_comment?: string | null
          service_quality_score?: number | null
          submitted_at?: string | null
          submitted_by?: string | null
          ticket_id: string
        }
        Update: {
          comment?: string | null
          fix_quality_comment?: string | null
          fix_quality_score?: number | null
          id?: string
          score?: number
          service_quality_comment?: string | null
          service_quality_score?: number | null
          submitted_at?: string | null
          submitted_by?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_feedback_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_logs: {
        Row: {
          author_id: string | null
          author_name: string | null
          author_role: string | null
          id: string
          is_internal: boolean | null
          media_urls: string[] | null
          message: string
          status_from: string | null
          status_to: string | null
          ticket_id: string
          timestamp: string | null
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          author_role?: string | null
          id?: string
          is_internal?: boolean | null
          media_urls?: string[] | null
          message: string
          status_from?: string | null
          status_to?: string | null
          ticket_id: string
          timestamp?: string | null
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          author_role?: string | null
          id?: string
          is_internal?: boolean | null
          media_urls?: string[] | null
          message?: string
          status_from?: string | null
          status_to?: string | null
          ticket_id?: string
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          area: string | null
          assignee: string | null
          auto_close_at: string | null
          category: string
          category_id: string | null
          channel: string | null
          company_id: string | null
          company_name: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          duration_min: number | null
          id: string
          impact_radius_meters: number | null
          lat: number | null
          lng: number | null
          location_text: string | null
          priority: string
          resolved_at: string | null
          resolved_crm_at: string | null
          responder_id: string | null
          sla_due_at: string | null
          status: string
          sub_category: string | null
          sub_category_id: string | null
          type: string
        }
        Insert: {
          area?: string | null
          assignee?: string | null
          auto_close_at?: string | null
          category: string
          category_id?: string | null
          channel?: string | null
          company_id?: string | null
          company_name?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_min?: number | null
          id: string
          impact_radius_meters?: number | null
          lat?: number | null
          lng?: number | null
          location_text?: string | null
          priority?: string
          resolved_at?: string | null
          resolved_crm_at?: string | null
          sla_due_at?: string | null
          status?: string
          sub_category?: string | null
          sub_category_id?: string | null
          type: string
        }
        Update: {
          area?: string | null
          assignee?: string | null
          auto_close_at?: string | null
          category?: string
          category_id?: string | null
          channel?: string | null
          company_id?: string | null
          company_name?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_min?: number | null
          id?: string
          impact_radius_meters?: number | null
          lat?: number | null
          lng?: number | null
          location_text?: string | null
          priority?: string
          resolved_at?: string | null
          resolved_crm_at?: string | null
          sla_due_at?: string | null
          status?: string
          sub_category?: string | null
          sub_category_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_sub_category_id_fkey"
            columns: ["sub_category_id"]
            isOneToOne: false
            referencedRelation: "sub_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          company_id: string | null
          created_at: string | null
          department: string[] | null
          email: string | null
          emp_id: string | null
          full_name: string | null
          id: string
          phone: string | null
          role: string
          status: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          department?: string[] | null
          email?: string | null
          emp_id?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          role?: string
          status?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          department?: string[] | null
          email?: string | null
          emp_id?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_user_exists: { Args: { email_to_check: string }; Returns: boolean }
      check_user_exists_by_company: { Args: { cid: string }; Returns: boolean }
      get_masked_profile_by_company: {
        Args: { cid: string }
        Returns: {
          masked_phone: string
          user_email: string
          user_full_name: string
          user_id: string
        }[]
      }
      get_my_role: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
