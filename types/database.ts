// AUTO-GENERATED from the Supabase schema. Do not edit by hand.
// Regenerate with: npm run db:types   (see README → Database types)

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
      academic_terms: {
        Row: {
          academic_year_id: string
          created_at: string
          ends_on: string | null
          id: string
          name: string
          school_id: string
          sequence: number
          starts_on: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          ends_on?: string | null
          id?: string
          name: string
          school_id: string
          sequence: number
          starts_on?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          ends_on?: string | null
          id?: string
          name?: string
          school_id?: string
          sequence?: number
          starts_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_terms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_terms_year_fkey"
            columns: ["academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      academic_years: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          is_current: boolean
          name: string
          school_id: string
          starts_on: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          is_current?: boolean
          name: string
          school_id: string
          starts_on: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          is_current?: boolean
          name?: string
          school_id?: string
          starts_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          new_data: Json | null
          old_data: Json | null
          school_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          school_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          school_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      class_subjects: {
        Row: {
          class_id: string
          created_at: string
          id: string
          school_id: string
          subject_id: string
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          school_id: string
          subject_id: string
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          school_id?: string
          subject_id?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_subjects_class_fkey"
            columns: ["class_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "class_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_subject_fkey"
            columns: ["subject_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "class_subjects_teacher_fkey"
            columns: ["teacher_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      classes: {
        Row: {
          academic_year_id: string
          capacity: number | null
          created_at: string
          grade_level_id: string
          homeroom_teacher_id: string | null
          id: string
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          capacity?: number | null
          created_at?: string
          grade_level_id: string
          homeroom_teacher_id?: string | null
          id?: string
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          capacity?: number | null
          created_at?: string
          grade_level_id?: string
          homeroom_teacher_id?: string | null
          id?: string
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_grade_fkey"
            columns: ["grade_level_id", "school_id"]
            isOneToOne: false
            referencedRelation: "grade_levels"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "classes_homeroom_fkey"
            columns: ["homeroom_teacher_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_year_fkey"
            columns: ["academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      enrollments: {
        Row: {
          academic_year_id: string
          class_id: string
          created_at: string
          enrolled_on: string
          id: string
          school_id: string
          status: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          class_id: string
          created_at?: string
          enrolled_on?: string
          id?: string
          school_id: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          created_at?: string
          enrolled_on?: string
          id?: string
          school_id?: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_class_fkey"
            columns: ["class_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "enrollments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_fkey"
            columns: ["student_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "enrollments_year_fkey"
            columns: ["academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      grade_levels: {
        Row: {
          created_at: string
          id: string
          name: string
          school_id: string
          sequence: number
          stage: Database["public"]["Enums"]["school_stage"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          school_id: string
          sequence: number
          stage?: Database["public"]["Enums"]["school_stage"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          sequence?: number
          stage?: Database["public"]["Enums"]["school_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_levels_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_periods: {
        Row: {
          created_at: string
          ends_on: string | null
          id: string
          kind: Database["public"]["Enums"]["term_period_kind"]
          name: string
          school_id: string
          sequence: number
          starts_on: string | null
          term_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["term_period_kind"]
          name: string
          school_id: string
          sequence: number
          starts_on?: string | null
          term_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["term_period_kind"]
          name?: string
          school_id?: string
          sequence?: number
          starts_on?: string | null
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grading_periods_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grading_periods_term_fkey"
            columns: ["term_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      guardian_links: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          parent_id: string
          relationship: string
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          parent_id: string
          relationship?: string
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          parent_id?: string
          relationship?: string
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardian_links_parent_fkey"
            columns: ["parent_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "guardian_links_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_links_student_fkey"
            columns: ["student_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          middle_name: string | null
          must_change_password: boolean
          phone: string | null
          photo_url: string | null
          role: Database["public"]["Enums"]["app_role"]
          school_id: string | null
          status: Database["public"]["Enums"]["profile_status"]
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          middle_name?: string | null
          must_change_password?: boolean
          phone?: string | null
          photo_url?: string | null
          role: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          middle_name?: string | null
          must_change_password?: boolean
          phone?: string | null
          photo_url?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_settings: {
        Row: {
          academic_system: Database["public"]["Enums"]["academic_system"]
          allow_parent_accounts: boolean
          allow_student_registration: boolean
          attendance_threshold: number
          created_at: string
          id: string
          passing_score: number
          school_id: string
          updated_at: string
        }
        Insert: {
          academic_system?: Database["public"]["Enums"]["academic_system"]
          allow_parent_accounts?: boolean
          allow_student_registration?: boolean
          attendance_threshold?: number
          created_at?: string
          id?: string
          passing_score?: number
          school_id: string
          updated_at?: string
        }
        Update: {
          academic_system?: Database["public"]["Enums"]["academic_system"]
          allow_parent_accounts?: boolean
          allow_student_registration?: boolean
          attendance_threshold?: number
          created_at?: string
          id?: string
          passing_score?: number
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          city: string | null
          code: string
          country: string
          county: string | null
          cover_image_url: string | null
          created_at: string
          currency: string
          email: string | null
          id: string
          logo_url: string | null
          motto: string | null
          name: string
          phone: string | null
          primary_color: string | null
          school_type: Database["public"]["Enums"]["school_type"]
          secondary_color: string | null
          slug: string
          status: Database["public"]["Enums"]["school_status"]
          timezone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          country?: string
          county?: string | null
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          motto?: string | null
          name: string
          phone?: string | null
          primary_color?: string | null
          school_type?: Database["public"]["Enums"]["school_type"]
          secondary_color?: string | null
          slug: string
          status?: Database["public"]["Enums"]["school_status"]
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          country?: string
          county?: string | null
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          motto?: string | null
          name?: string
          phone?: string | null
          primary_color?: string | null
          school_type?: Database["public"]["Enums"]["school_type"]
          secondary_color?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["school_status"]
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      subjects: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_standard_subjects: { Args: never; Returns: number }
      create_academic_year: {
        Args: {
          p_ends_on: string
          p_make_current: boolean
          p_name: string
          p_starts_on: string
          p_template: string
        }
        Returns: string
      }
      create_member: {
        Args: {
          p_email: string
          p_first_name: string
          p_last_name: string
          p_middle_name: string
          p_phone: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_school_id: string
          p_user_id: string
          p_username: string
        }
        Returns: string
      }
      move_grade_level: {
        Args: { p_direction: string; p_grade_id: string }
        Returns: undefined
      }
      platform_create_school: {
        Args: {
          p_city: string
          p_code: string
          p_country: string
          p_county: string
          p_motto: string
          p_name: string
          p_primary_color: string
          p_school_type: Database["public"]["Enums"]["school_type"]
          p_slug: string
        }
        Returns: string
      }
      require_password_change: {
        Args: { p_profile_id: string }
        Returns: string
      }
      set_current_academic_year: {
        Args: { p_year_id: string }
        Returns: undefined
      }
      set_member_status: {
        Args: {
          p_profile_id: string
          p_status: Database["public"]["Enums"]["profile_status"]
        }
        Returns: string
      }
    }
    Enums: {
      academic_system: "semester" | "trimester" | "quarter" | "term"
      app_role:
        | "super_admin"
        | "school_admin"
        | "teacher"
        | "student"
        | "parent"
      enrollment_status: "active" | "withdrawn" | "transferred" | "completed"
      profile_status: "invited" | "active" | "suspended" | "inactive"
      school_stage:
        | "early_childhood"
        | "primary"
        | "junior_high"
        | "senior_high"
        | "other"
      school_status: "pending" | "active" | "suspended" | "archived"
      school_type:
        | "high_school"
        | "junior_high"
        | "elementary"
        | "university"
        | "college"
        | "vocational"
        | "other"
      term_period_kind: "marking_period" | "exam"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      academic_system: ["semester", "trimester", "quarter", "term"],
      app_role: ["super_admin", "school_admin", "teacher", "student", "parent"],
      enrollment_status: ["active", "withdrawn", "transferred", "completed"],
      profile_status: ["invited", "active", "suspended", "inactive"],
      school_stage: [
        "early_childhood",
        "primary",
        "junior_high",
        "senior_high",
        "other",
      ],
      school_status: ["pending", "active", "suspended", "archived"],
      school_type: [
        "high_school",
        "junior_high",
        "elementary",
        "university",
        "college",
        "vocational",
        "other",
      ],
      term_period_kind: ["marking_period", "exam"],
    },
  },
} as const
