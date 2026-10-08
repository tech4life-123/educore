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
      ai_usage_events: {
        Row: {
          created_at: string
          duration_ms: number
          error_code: string | null
          id: string
          input_tokens: number
          kind: string
          model: string
          output_tokens: number
          profile_id: string
          provider: string
          role: Database["public"]["Enums"]["app_role"]
          school_id: string | null
          status: string
          tool_calls: number
          tool_names: string[]
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          error_code?: string | null
          id?: string
          input_tokens?: number
          kind: string
          model: string
          output_tokens?: number
          profile_id: string
          provider: string
          role: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          status: string
          tool_calls?: number
          tool_names?: string[]
        }
        Update: {
          created_at?: string
          duration_ms?: number
          error_code?: string | null
          id?: string
          input_tokens?: number
          kind?: string
          model?: string
          output_tokens?: number
          profile_id?: string
          provider?: string
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          status?: string
          tool_calls?: number
          tool_names?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          profile_id: string
          read_at: string
          school_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          profile_id: string
          read_at?: string
          school_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          profile_id?: string
          read_at?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_fkey"
            columns: ["announcement_id", "school_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "announcement_reads_profile_fkey"
            columns: ["profile_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "announcement_reads_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: Database["public"]["Enums"]["announcement_audience"]
          author_id: string | null
          body: string
          class_id: string | null
          created_at: string
          expires_on: string | null
          id: string
          pinned: boolean
          publish_at: string
          school_id: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["announcement_audience"]
          author_id?: string | null
          body: string
          class_id?: string | null
          created_at?: string
          expires_on?: string | null
          id?: string
          pinned?: boolean
          publish_at?: string
          school_id: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["announcement_audience"]
          author_id?: string | null
          body?: string
          class_id?: string | null
          created_at?: string
          expires_on?: string | null
          id?: string
          pinned?: boolean
          publish_at?: string
          school_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_fkey"
            columns: ["author_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "announcements_class_fkey"
            columns: ["class_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          school_id: string
          sequence: number
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          school_id: string
          sequence?: number
          updated_at?: string
          weight: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string
          sequence?: number
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_categories_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_scores: {
        Row: {
          assessment_id: string
          comment: string | null
          created_at: string
          id: string
          is_excused: boolean
          school_id: string
          score: number | null
          student_id: string
          updated_at: string
        }
        Insert: {
          assessment_id: string
          comment?: string | null
          created_at?: string
          id?: string
          is_excused?: boolean
          school_id: string
          score?: number | null
          student_id: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          is_excused?: boolean
          school_id?: string
          score?: number | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_scores_assessment_fkey"
            columns: ["assessment_id", "school_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "assessment_scores_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_scores_student_fkey"
            columns: ["student_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      assessments: {
        Row: {
          assessed_on: string | null
          category_id: string | null
          class_subject_id: string
          created_at: string
          created_by: string | null
          grading_period_id: string
          id: string
          max_score: number
          school_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assessed_on?: string | null
          category_id?: string | null
          class_subject_id: string
          created_at?: string
          created_by?: string | null
          grading_period_id: string
          id?: string
          max_score: number
          school_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assessed_on?: string | null
          category_id?: string | null
          class_subject_id?: string
          created_at?: string
          created_by?: string | null
          grading_period_id?: string
          id?: string
          max_score?: number
          school_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_category_fkey"
            columns: ["category_id", "school_id"]
            isOneToOne: false
            referencedRelation: "assessment_categories"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "assessments_class_subject_fkey"
            columns: ["class_subject_id", "school_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "assessments_created_by_fkey"
            columns: ["created_by", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "assessments_period_fkey"
            columns: ["grading_period_id", "school_id"]
            isOneToOne: false
            referencedRelation: "grading_periods"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "assessments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          class_id: string
          created_at: string
          date: string
          id: string
          note: string | null
          recorded_by: string | null
          register_id: string
          school_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          date: string
          id?: string
          note?: string | null
          recorded_by?: string | null
          register_id: string
          school_id: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          recorded_by?: string | null
          register_id?: string
          school_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_class_fkey"
            columns: ["class_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "attendance_records_recorded_by_fkey"
            columns: ["recorded_by", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "attendance_records_register_fkey"
            columns: ["register_id", "school_id"]
            isOneToOne: false
            referencedRelation: "attendance_registers"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "attendance_records_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_student_fkey"
            columns: ["student_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      attendance_registers: {
        Row: {
          class_id: string
          created_at: string
          date: string
          id: string
          school_id: string
          taken_at: string
          taken_by: string | null
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          date: string
          id?: string
          school_id: string
          taken_at?: string
          taken_by?: string | null
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          date?: string
          id?: string
          school_id?: string
          taken_at?: string
          taken_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_registers_class_fkey"
            columns: ["class_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "attendance_registers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_registers_taken_by_fkey"
            columns: ["taken_by", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
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
      grade_submissions: {
        Row: {
          class_subject_id: string
          created_at: string
          grading_period_id: string
          id: string
          school_id: string
          submitted_at: string
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          class_subject_id: string
          created_at?: string
          grading_period_id: string
          id?: string
          school_id: string
          submitted_at?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          class_subject_id?: string
          created_at?: string
          grading_period_id?: string
          id?: string
          school_id?: string
          submitted_at?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_submissions_by_fkey"
            columns: ["submitted_by", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "grade_submissions_class_subject_fkey"
            columns: ["class_subject_id", "school_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "grade_submissions_period_fkey"
            columns: ["grading_period_id", "school_id"]
            isOneToOne: false
            referencedRelation: "grading_periods"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "grade_submissions_school_id_fkey"
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
          published_at: string | null
          published_by: string | null
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
          published_at?: string | null
          published_by?: string | null
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
          published_at?: string | null
          published_by?: string | null
          school_id?: string
          sequence?: number
          starts_on?: string | null
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grading_periods_published_by_fkey"
            columns: ["published_by", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
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
      finance_settings: {
        Row: {
          school_id: string
          default_currency: string
          invoice_prefix: string
          created_at: string
          updated_at: string
        }
        Insert: {
          school_id: string
          default_currency?: string
          invoice_prefix?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          school_id?: string
          default_currency?: string
          invoice_prefix?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      fee_structures: {
        Row: {
          id: string
          school_id: string
          name: string
          academic_year_id: string
          term_id: string | null
          grade_level_id: string | null
          student_category: string | null
          currency: string
          is_active: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          name: string
          academic_year_id: string
          term_id?: string | null
          grade_level_id?: string | null
          student_category?: string | null
          currency: string
          is_active?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          name?: string
          academic_year_id?: string
          term_id?: string | null
          grade_level_id?: string | null
          student_category?: string | null
          currency?: string
          is_active?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      fee_items: {
        Row: {
          id: string
          school_id: string
          fee_structure_id: string
          fee_type: Database["public"]["Enums"]["fee_type"]
          description: string | null
          amount: number
          due_date: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          fee_structure_id: string
          fee_type: Database["public"]["Enums"]["fee_type"]
          description?: string | null
          amount: number
          due_date?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          fee_structure_id?: string
          fee_type?: Database["public"]["Enums"]["fee_type"]
          description?: string | null
          amount?: number
          due_date?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_accounts: {
        Row: {
          id: string
          school_id: string
          student_id: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          student_id: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          student_id?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          school_id: string
          invoice_number: string | null
          student_id: string
          guardian_id: string | null
          academic_year_id: string
          term_id: string | null
          currency: string
          issue_date: string | null
          due_date: string
          status: Database["public"]["Enums"]["invoice_status"]
          notes: string | null
          created_by: string | null
          issued_by: string | null
          issued_at: string | null
          cancelled_by: string | null
          cancelled_at: string | null
          cancel_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          invoice_number?: string | null
          student_id: string
          guardian_id?: string | null
          academic_year_id: string
          term_id?: string | null
          currency: string
          issue_date?: string | null
          due_date: string
          status?: Database["public"]["Enums"]["invoice_status"]
          notes?: string | null
          created_by?: string | null
          issued_by?: string | null
          issued_at?: string | null
          cancelled_by?: string | null
          cancelled_at?: string | null
          cancel_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          invoice_number?: string | null
          student_id?: string
          guardian_id?: string | null
          academic_year_id?: string
          term_id?: string | null
          currency?: string
          issue_date?: string | null
          due_date?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          notes?: string | null
          created_by?: string | null
          issued_by?: string | null
          issued_at?: string | null
          cancelled_by?: string | null
          cancelled_at?: string | null
          cancel_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          id: string
          school_id: string
          invoice_id: string
          fee_item_id: string | null
          fee_type: Database["public"]["Enums"]["fee_type"]
          description: string
          amount: number
          created_at: string
        }
        Insert: {
          id?: string
          school_id: string
          invoice_id: string
          fee_item_id?: string | null
          fee_type: Database["public"]["Enums"]["fee_type"]
          description: string
          amount: number
          created_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          invoice_id?: string
          fee_item_id?: string | null
          fee_type?: Database["public"]["Enums"]["fee_type"]
          description?: string
          amount?: number
          created_at?: string
        }
        Relationships: []
      }
      student_account_entries: {
        Row: {
          id: string
          school_id: string
          account_id: string
          student_id: string
          currency: string
          direction: Database["public"]["Enums"]["ledger_direction"]
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          amount: number
          description: string
          entry_date: string
          invoice_id: string | null
          invoice_item_id: string | null
          payment_id: string | null
          reverses_entry_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          school_id: string
          account_id: string
          student_id: string
          currency: string
          direction: Database["public"]["Enums"]["ledger_direction"]
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          amount: number
          description: string
          entry_date?: string
          invoice_id?: string | null
          invoice_item_id?: string | null
          payment_id?: string | null
          reverses_entry_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          account_id?: string
          student_id?: string
          currency?: string
          direction?: Database["public"]["Enums"]["ledger_direction"]
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
          amount?: number
          description?: string
          entry_date?: string
          invoice_id?: string | null
          invoice_item_id?: string | null
          payment_id?: string | null
          reverses_entry_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      payment_provider_accounts: {
        Row: {
          id: string
          school_id: string
          provider: string
          environment: string
          label: string
          status: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          provider: string
          environment?: string
          label: string
          status?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          provider?: string
          environment?: string
          label?: string
          status?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_provider_secrets: {
        Row: {
          account_id: string
          school_id: string
          webhook_secret: string
          rotated_at: string
        }
        Insert: {
          account_id: string
          school_id: string
          webhook_secret: string
          rotated_at?: string
        }
        Update: {
          account_id?: string
          school_id?: string
          webhook_secret?: string
          rotated_at?: string
        }
        Relationships: []
      }
      provider_events: {
        Row: {
          id: string
          school_id: string
          account_id: string
          provider: string
          external_id: string
          outcome: string
          detail: string | null
          transaction_id: string | null
          payload: Json
          delivery_count: number
          received_at: string
          last_received_at: string
        }
        Insert: {
          id?: string
          school_id: string
          account_id: string
          provider: string
          external_id: string
          outcome: string
          detail?: string | null
          transaction_id?: string | null
          payload: Json
          delivery_count?: number
          received_at?: string
          last_received_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          account_id?: string
          provider?: string
          external_id?: string
          outcome?: string
          detail?: string | null
          transaction_id?: string | null
          payload?: Json
          delivery_count?: number
          received_at?: string
          last_received_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          school_id: string
          student_id: string
          invoice_id: string | null
          amount: number
          currency: string
          method: Database["public"]["Enums"]["payment_method"]
          status: Database["public"]["Enums"]["payment_status"]
          provider: string | null
          reference: string | null
          transaction_id: string | null
          paid_on: string
          payer_name: string | null
          explanation: string | null
          idempotency_key: string | null
          recorded_by: string | null
          verified_by: string | null
          verified_at: string | null
          status_reason: string | null
          ledger_entry_id: string | null
          reversal_entry_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          student_id: string
          invoice_id?: string | null
          amount: number
          currency: string
          method: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["payment_status"]
          provider?: string | null
          reference?: string | null
          transaction_id?: string | null
          paid_on: string
          payer_name?: string | null
          explanation?: string | null
          idempotency_key?: string | null
          recorded_by?: string | null
          verified_by?: string | null
          verified_at?: string | null
          status_reason?: string | null
          ledger_entry_id?: string | null
          reversal_entry_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          student_id?: string
          invoice_id?: string | null
          amount?: number
          currency?: string
          method?: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["payment_status"]
          provider?: string | null
          reference?: string | null
          transaction_id?: string | null
          paid_on?: string
          payer_name?: string | null
          explanation?: string | null
          idempotency_key?: string | null
          recorded_by?: string | null
          verified_by?: string | null
          verified_at?: string | null
          status_reason?: string | null
          ledger_entry_id?: string | null
          reversal_entry_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      financial_audit_logs: {
        Row: {
          id: string
          school_id: string
          user_id: string | null
          actor_role: string | null
          action: string
          entity_type: string
          entity_id: string | null
          old_data: Json | null
          new_data: Json | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          school_id: string
          user_id?: string | null
          actor_role?: string | null
          action: string
          entity_type: string
          entity_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          user_id?: string | null
          actor_role?: string | null
          action?: string
          entity_type?: string
          entity_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          metadata?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          id: string
          school_id: string
          receipt_number: string
          payment_id: string
          student_id: string
          invoice_id: string | null
          currency: string
          amount: number
          previous_balance: number
          remaining_balance: number
          verification_token: string
          issued_by: string | null
          issued_at: string
        }
        Insert: {
          id?: string
          school_id: string
          receipt_number: string
          payment_id: string
          student_id: string
          invoice_id?: string | null
          currency: string
          amount: number
          previous_balance: number
          remaining_balance: number
          verification_token?: string
          issued_by?: string | null
          issued_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          receipt_number?: string
          payment_id?: string
          student_id?: string
          invoice_id?: string | null
          currency?: string
          amount?: number
          previous_balance?: number
          remaining_balance?: number
          verification_token?: string
          issued_by?: string | null
          issued_at?: string
        }
        Relationships: []
      }
      document_types: {
        Row: {
          id: string
          school_id: string
          code: string
          name: string
          description: string | null
          fee_amount: number
          currency: string | null
          requires_payment: boolean
          requires_clearance: boolean
          requires_approval: boolean
          allow_override: boolean
          admissions_handled: boolean
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          code: string
          name: string
          description?: string | null
          fee_amount?: number
          currency?: string | null
          requires_payment?: boolean
          requires_clearance?: boolean
          requires_approval?: boolean
          allow_override?: boolean
          admissions_handled?: boolean
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          code?: string
          name?: string
          description?: string | null
          fee_amount?: number
          currency?: string | null
          requires_payment?: boolean
          requires_clearance?: boolean
          requires_approval?: boolean
          allow_override?: boolean
          admissions_handled?: boolean
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_requests: {
        Row: {
          id: string
          school_id: string
          student_id: string
          document_type_id: string
          requested_by: string
          status: Database["public"]["Enums"]["document_request_status"]
          invoice_id: string | null
          note: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          review_decision: string | null
          review_note: string | null
          override_by: string | null
          override_reason: string | null
          override_waived: string[] | null
          cancelled_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          student_id: string
          document_type_id: string
          requested_by: string
          status?: Database["public"]["Enums"]["document_request_status"]
          invoice_id?: string | null
          note?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_decision?: string | null
          review_note?: string | null
          override_by?: string | null
          override_reason?: string | null
          override_waived?: string[] | null
          cancelled_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          student_id?: string
          document_type_id?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["document_request_status"]
          invoice_id?: string | null
          note?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_decision?: string | null
          review_note?: string | null
          override_by?: string | null
          override_reason?: string | null
          override_waived?: string[] | null
          cancelled_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      issued_documents: {
        Row: {
          id: string
          school_id: string
          request_id: string
          student_id: string
          document_type_id: string
          document_number: string
          verification_token: string
          payload: Json
          issued_by: string
          issued_at: string
          revoked_at: string | null
          revoked_by: string | null
          revoke_reason: string | null
        }
        Insert: {
          id?: string
          school_id: string
          request_id: string
          student_id: string
          document_type_id: string
          document_number: string
          verification_token?: string
          payload: Json
          issued_by: string
          issued_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          revoke_reason?: string | null
        }
        Update: {
          id?: string
          school_id?: string
          request_id?: string
          student_id?: string
          document_type_id?: string
          document_number?: string
          verification_token?: string
          payload?: Json
          issued_by?: string
          issued_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          revoke_reason?: string | null
        }
        Relationships: []
      }
      incoming_transactions: {
        Row: {
          id: string
          school_id: string
          method: Database["public"]["Enums"]["payment_method"]
          amount: number
          currency: string
          reference: string
          transaction_date: string
          payer_name: string | null
          payer_phone: string | null
          notes: string | null
          source: string
          status: Database["public"]["Enums"]["transaction_status"]
          payment_id: string | null
          status_reason: string | null
          created_by: string | null
          handled_by: string | null
          handled_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          method: Database["public"]["Enums"]["payment_method"]
          amount: number
          currency: string
          reference: string
          transaction_date: string
          payer_name?: string | null
          payer_phone?: string | null
          notes?: string | null
          source?: string
          status?: Database["public"]["Enums"]["transaction_status"]
          payment_id?: string | null
          status_reason?: string | null
          created_by?: string | null
          handled_by?: string | null
          handled_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          amount?: number
          currency?: string
          reference?: string
          transaction_date?: string
          payer_name?: string | null
          payer_phone?: string | null
          notes?: string | null
          source?: string
          status?: Database["public"]["Enums"]["transaction_status"]
          payment_id?: string | null
          status_reason?: string | null
          created_by?: string | null
          handled_by?: string | null
          handled_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
          show_school_background: boolean
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
          show_school_background?: boolean
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
          show_school_background?: boolean
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
      promotion_decisions: {
        Row: {
          academic_year_id: string
          created_at: string
          decided_by: string | null
          decision: string
          id: string
          note: string | null
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          decided_by?: string | null
          decision: string
          id?: string
          note?: string | null
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          decided_by?: string | null
          decision?: string
          id?: string
          note?: string | null
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_decisions_by_fkey"
            columns: ["decided_by", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "promotion_decisions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_decisions_student_fkey"
            columns: ["student_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "promotion_decisions_year_fkey"
            columns: ["academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      report_card_remarks: {
        Row: {
          author_id: string | null
          class_id: string
          created_at: string
          id: string
          remark: string
          school_id: string
          student_id: string
          term_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          class_id: string
          created_at?: string
          id?: string
          remark: string
          school_id: string
          student_id: string
          term_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          class_id?: string
          created_at?: string
          id?: string
          remark?: string
          school_id?: string
          student_id?: string
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_card_remarks_author_fkey"
            columns: ["author_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "report_card_remarks_class_fkey"
            columns: ["class_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "report_card_remarks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_card_remarks_student_fkey"
            columns: ["student_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "report_card_remarks_term_fkey"
            columns: ["term_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      report_cards: {
        Row: {
          academic_year_id: string
          average: number | null
          class_id: string
          class_size: number
          created_at: string
          data: Json
          id: string
          issued_at: string
          issued_by: string | null
          rank: number | null
          school_id: string
          student_id: string
          term_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          average?: number | null
          class_id: string
          class_size: number
          created_at?: string
          data: Json
          id?: string
          issued_at?: string
          issued_by?: string | null
          rank?: number | null
          school_id: string
          student_id: string
          term_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          average?: number | null
          class_id?: string
          class_size?: number
          created_at?: string
          data?: Json
          id?: string
          issued_at?: string
          issued_by?: string | null
          rank?: number | null
          school_id?: string
          student_id?: string
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_cards_class_fkey"
            columns: ["class_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "report_cards_issued_by_fkey"
            columns: ["issued_by", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "report_cards_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_student_fkey"
            columns: ["student_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "report_cards_term_fkey"
            columns: ["term_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "report_cards_year_fkey"
            columns: ["academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      school_domains: {
        Row: {
          created_at: string
          domain: string
          domain_type: Database["public"]["Enums"]["domain_type"]
          id: string
          is_primary: boolean
          school_id: string
          ssl_status: Database["public"]["Enums"]["domain_ssl_status"]
          updated_at: string
          verification_status: Database["public"]["Enums"]["domain_verification_status"]
          verification_token: string | null
          vercel_domain_id: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          domain_type: Database["public"]["Enums"]["domain_type"]
          id?: string
          is_primary?: boolean
          school_id: string
          ssl_status?: Database["public"]["Enums"]["domain_ssl_status"]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["domain_verification_status"]
          verification_token?: string | null
          vercel_domain_id?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          domain_type?: Database["public"]["Enums"]["domain_type"]
          id?: string
          is_primary?: boolean
          school_id?: string
          ssl_status?: Database["public"]["Enums"]["domain_ssl_status"]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["domain_verification_status"]
          verification_token?: string | null
          vercel_domain_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_domains_school_id_fkey"
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
          exam_weight: number
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
          exam_weight?: number
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
          exam_weight?: number
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
          is_demo: boolean
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
          is_demo?: boolean
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
          is_demo?: boolean
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
      staff_profiles: {
        Row: {
          created_at: string
          employee_number: string | null
          employment_type: string | null
          gender: string | null
          hire_date: string | null
          home_address: string | null
          id: string
          job_title: string | null
          profile_id: string
          qualification: string | null
          school_id: string
          specialization: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_number?: string | null
          employment_type?: string | null
          gender?: string | null
          hire_date?: string | null
          home_address?: string | null
          id?: string
          job_title?: string | null
          profile_id: string
          qualification?: string | null
          school_id: string
          specialization?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_number?: string | null
          employment_type?: string | null
          gender?: string | null
          hire_date?: string | null
          home_address?: string | null
          id?: string
          job_title?: string | null
          profile_id?: string
          qualification?: string | null
          school_id?: string
          specialization?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_profile_fkey"
            columns: ["profile_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "staff_profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      student_profiles: {
        Row: {
          admission_date: string | null
          admission_number: string | null
          created_at: string
          date_of_birth: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          gender: string | null
          home_address: string | null
          id: string
          nationality: string | null
          place_of_birth: string | null
          previous_school: string | null
          profile_id: string
          school_id: string
          updated_at: string
        }
        Insert: {
          admission_date?: string | null
          admission_number?: string | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gender?: string | null
          home_address?: string | null
          id?: string
          nationality?: string | null
          place_of_birth?: string | null
          previous_school?: string | null
          profile_id: string
          school_id: string
          updated_at?: string
        }
        Update: {
          admission_date?: string | null
          admission_number?: string | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gender?: string | null
          home_address?: string | null
          id?: string
          nationality?: string | null
          place_of_birth?: string | null
          previous_school?: string | null
          profile_id?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_profiles_profile_fkey"
            columns: ["profile_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "student_profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
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
      invoice_adjustments: {
        Row: {
          id: string
          school_id: string
          invoice_id: string
          student_id: string
          kind: string
          amount: number
          currency: string
          reason: string
          status: string
          ledger_entry_id: string
          voided_reason: string | null
          voided_entry_id: string | null
          voided_by: string | null
          voided_at: string | null
          created_by: string | null
          created_at: string
        }
        Insert: { [_ in never]: never }
        Update: { [_ in never]: never }
        Relationships: []
      }
      payment_refunds: {
        Row: {
          id: string
          school_id: string
          payment_id: string
          invoice_id: string | null
          student_id: string
          amount: number
          currency: string
          method: Database["public"]["Enums"]["payment_method"]
          reference: string | null
          reason: string
          refunded_on: string
          ledger_entry_id: string
          created_by: string | null
          created_at: string
        }
        Insert: { [_ in never]: never }
        Update: { [_ in never]: never }
        Relationships: []
      }
      payment_plans: {
        Row: {
          id: string
          school_id: string
          invoice_id: string
          student_id: string
          currency: string
          base_settled: number
          note: string | null
          status: string
          cancelled_reason: string | null
          cancelled_by: string | null
          cancelled_at: string | null
          created_by: string | null
          created_at: string
        }
        Insert: { [_ in never]: never }
        Update: { [_ in never]: never }
        Relationships: []
      }
      plan_installments: {
        Row: {
          id: string
          school_id: string
          plan_id: string
          seq: number
          due_date: string
          amount: number
          created_at: string
        }
        Insert: { [_ in never]: never }
        Update: { [_ in never]: never }
        Relationships: []
      }
    }
    Views: {
      document_request_details: {
        Row: {
          id: string | null
          school_id: string | null
          student_id: string | null
          document_type_id: string | null
          requested_by: string | null
          status: Database["public"]["Enums"]["document_request_status"] | null
          invoice_id: string | null
          note: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          review_decision: string | null
          review_note: string | null
          override_reason: string | null
          override_waived: string[] | null
          cancelled_reason: string | null
          created_at: string | null
          updated_at: string | null
          type_code: string | null
          type_name: string | null
          fee_amount: number | null
          type_currency: string | null
          requires_payment: boolean | null
          requires_clearance: boolean | null
          requires_approval: boolean | null
          allow_override: boolean | null
          first_name: string | null
          middle_name: string | null
          last_name: string | null
          admission_number: string | null
          invoice_number: string | null
          invoice_status: string | null
          invoice_balance_due: number | null
          invoice_currency: string | null
          document_id: string | null
          document_number: string | null
          document_revoked_at: string | null
        }
        Relationships: []
      }
      student_balances: {
        Row: {
          school_id: string | null
          student_id: string | null
          currency: string | null
          total_charges: number | null
          total_paid: number | null
          balance: number | null
          total_adjustments: number | null
          total_refunded: number | null
        }
        Relationships: []
      }
      invoice_balances: {
        Row: {
          invoice_id: string | null
          school_id: string | null
          invoice_number: string | null
          student_id: string | null
          currency: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          due_date: string | null
          total_amount: number | null
          amount_paid: number | null
          balance_due: number | null
          display_status: string | null
          adjustments_total: number | null
          amount_refunded: number | null
        }
        Relationships: []
      }
      plan_installment_status: {
        Row: {
          installment_id: string | null
          school_id: string | null
          plan_id: string | null
          invoice_id: string | null
          student_id: string | null
          currency: string | null
          seq: number | null
          due_date: string | null
          amount: number | null
          paid: number | null
          remaining: number | null
          status: string | null
          plan_status: string | null
        }
        Relationships: []
      }
      fee_reminders: {
        Row: {
          school_id: string | null
          student_id: string | null
          invoice_id: string | null
          installment_id: string | null
          seq: number | null
          invoice_number: string | null
          currency: string | null
          due_date: string | null
          amount_due: number | null
          kind: string | null
          days_overdue: number | null
        }
        Relationships: []
      }
      finance_receivables: {
        Row: {
          school_id: string | null
          student_id: string | null
          invoice_id: string | null
          installment_id: string | null
          seq: number | null
          invoice_number: string | null
          currency: string | null
          due_date: string | null
          amount_due: number | null
        }
        Relationships: []
      }
      finance_students: {
        Row: {
          school_id: string | null
          student_id: string | null
          first_name: string | null
          middle_name: string | null
          last_name: string | null
          admission_number: string | null
          status: Database["public"]["Enums"]["profile_status"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      public_school_site: {
        Args: { p_domain: string }
        Returns: {
          name: string
          school_type: Database["public"]["Enums"]["school_type"]
          motto: string | null
          logo_url: string | null
          cover_image_url: string | null
          address: string | null
          city: string | null
          county: string | null
          country: string
          phone: string | null
          email: string | null
          website: string | null
          primary_color: string | null
        }[]
      }
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
      finance_apply_adjustment: {
        Args: { p_amount: number; p_invoice_id: string; p_kind: string; p_reason: string }
        Returns: string
      }
      finance_void_adjustment: {
        Args: { p_adjustment_id: string; p_reason: string }
        Returns: undefined
      }
      finance_refund_payment: {
        Args: {
          p_amount: number
          p_method: Database["public"]["Enums"]["payment_method"]
          p_payment_id: string
          p_reason: string
          p_reference: string
          p_date: string
        }
        Returns: string
      }
      finance_create_payment_plan: {
        Args: { p_installments: Json; p_invoice_id: string; p_note: string }
        Returns: string
      }
      finance_cancel_payment_plan: {
        Args: { p_plan_id: string; p_reason: string }
        Returns: undefined
      }
      finance_cancel_invoice: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: undefined
      }
      finance_confirm_payment: { Args: { p_payment_id: string }; Returns: string }
      finance_create_invoice: {
        Args: {
          p_academic_year_id: string
          p_currency: string
          p_due_date: string
          p_guardian_id: string
          p_items: Json
          p_notes: string
          p_student_id: string
          p_term_id: string
        }
        Returns: string
      }
      finance_issue_invoice: { Args: { p_invoice_id: string }; Returns: string }
      finance_record_payment: {
        Args: {
          p_amount: number
          p_currency: string
          p_explanation: string
          p_idempotency_key: string
          p_invoice_id: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_paid_on: string
          p_payer_name: string
          p_reference: string
          p_student_id: string
          p_transaction_id: string
        }
        Returns: string
      }
      finance_reject_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: undefined
      }
      finance_reverse_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: string
      }
      finance_assign_transaction: {
        Args: { p_invoice_id: string; p_note: string; p_student_id: string; p_transaction_id: string }
        Returns: string
      }
      provider_account_create: {
        Args: { p_environment: string; p_label: string; p_provider: string }
        Returns: { account_id: string; webhook_secret: string }[]
      }
      provider_account_rotate_secret: {
        Args: { p_account: string }
        Returns: string
      }
      provider_account_set_status: {
        Args: { p_account: string; p_status: string }
        Returns: undefined
      }
      provider_ingest: {
        Args: {
          p_account: string
          p_amount: number | null
          p_currency: string | null
          p_date: string | null
          p_external_id: string
          p_payer_name: string | null
          p_payer_phone: string | null
          p_payload: Json
          p_status: string
        }
        Returns: Json
      }
      finance_log_transaction: {
        Args: {
          p_amount: number
          p_currency: string
          p_date: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_notes: string
          p_payer_name: string
          p_payer_phone: string
          p_reference: string
        }
        Returns: string
      }
      finance_match_transaction: {
        Args: { p_payment_id: string; p_transaction_id: string }
        Returns: undefined
      }
      finance_reject_transaction: {
        Args: { p_reason: string; p_transaction_id: string }
        Returns: undefined
      }
      student_clearance: {
        Args: { p_student_id: string }
        Returns: Json
      }
      doc_seed_types: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      doc_save_type: {
        Args: {
          p_active: boolean
          p_admissions_handled: boolean
          p_allow_override: boolean
          p_code: string
          p_currency: string
          p_description: string
          p_fee: number
          p_id: string
          p_name: string
          p_requires_approval: boolean
          p_requires_clearance: boolean
          p_requires_payment: boolean
        }
        Returns: string
      }
      doc_request: {
        Args: { p_note: string; p_student_id: string; p_type_id: string }
        Returns: string
      }
      doc_cancel_request: {
        Args: { p_reason: string; p_request_id: string }
        Returns: undefined
      }
      doc_review_request: {
        Args: { p_approve: boolean; p_note: string; p_request_id: string }
        Returns: undefined
      }
      doc_generate: {
        Args: { p_override_reason: string; p_request_id: string }
        Returns: string
      }
      doc_mark: {
        Args: { p_request_id: string; p_status: Database["public"]["Enums"]["document_request_status"] }
        Returns: undefined
      }
      doc_revoke: {
        Args: { p_document_id: string; p_reason: string }
        Returns: undefined
      }
      verify_document: {
        Args: { p_token: string }
        Returns: {
          document_number: string
          document_type: string
          is_valid: boolean
          issued_on: string
          school_name: string
          student_label: string
        }[]
      }
      verify_receipt: {
        Args: { p_token: string }
        Returns: {
          amount: number
          currency: string
          is_valid: boolean
          issued_on: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          receipt_number: string
          school_name: string
          student_label: string
        }[]
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
      platform_school_statistics: {
        Args: never
        Returns: {
          admins: number
          att_absent: number
          att_excused: number
          att_late: number
          att_present: number
          classes: number
          code: string
          county: string
          created_at: string
          current_year: string
          enrolled: number
          female: number
          graded_students: number
          is_demo: boolean
          male: number
          name: string
          passed: number
          passing_score: number
          school_id: string
          school_type: Database["public"]["Enums"]["school_type"]
          status: Database["public"]["Enums"]["school_status"]
          students: number
          teachers: number
        }[]
      }
      platform_set_domain_verification: {
        Args: {
          p_domain_id: string
          p_status: Database["public"]["Enums"]["domain_verification_status"]
        }
        Returns: Database["public"]["Enums"]["domain_verification_status"]
      }
      platform_set_school_status: {
        Args: {
          p_school_id: string
          p_status: Database["public"]["Enums"]["school_status"]
        }
        Returns: Database["public"]["Enums"]["school_status"]
      }
      report_attendance_by_month: {
        Args: { p_year_id: string }
        Returns: {
          absent: number
          class_id: string
          excused: number
          late: number
          month: string
          present: number
        }[]
      }
      report_attendance_by_student: {
        Args: { p_year_id: string }
        Returns: {
          absent: number
          excused: number
          late: number
          present: number
          student_id: string
        }[]
      }
      require_password_change: {
        Args: { p_profile_id: string }
        Returns: string
      }
      set_current_academic_year: {
        Args: { p_year_id: string }
        Returns: undefined
      }
      set_grading_period_published: {
        Args: { p_period_id: string; p_published: boolean }
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
      announcement_audience:
        | "everyone"
        | "staff"
        | "students"
        | "parents"
        | "class"
      app_role:
        | "super_admin"
        | "school_admin"
        | "teacher"
        | "student"
        | "parent"
        | "finance_officer"
        | "admissions_officer"
      attendance_status: "present" | "absent" | "late" | "excused"
      domain_ssl_status: "pending" | "issued" | "failed"
      domain_type: "subdomain" | "custom"
      domain_verification_status: "pending" | "verified" | "failed"
      enrollment_status: "active" | "withdrawn" | "transferred" | "completed"
      profile_status: "invited" | "active" | "suspended" | "inactive"
      school_stage:
        | "early_childhood"
        | "primary"
        | "junior_high"
        | "senior_high"
        | "other"
      fee_type:
        | "registration"
        | "tuition"
        | "examination"
        | "laboratory"
        | "library"
        | "sports"
        | "technology"
        | "transportation"
        | "boarding"
        | "graduation"
        | "transcript"
        | "certificate"
        | "id_card"
        | "other"
      invoice_status:
        | "draft"
        | "issued"
        | "cancelled"
      ledger_direction:
        | "debit"
        | "credit"
      ledger_entry_type:
        | "charge"
        | "payment"
        | "reversal"
        | "adjustment"
        | "refund"
      payment_method:
        | "bank"
        | "orange_money"
        | "mtn_momo"
        | "cash"
        | "other"
      document_request_status:
        | "requested"
        | "payment_pending"
        | "paid"
        | "under_review"
        | "approved"
        | "generated"
        | "printed"
        | "delivered"
        | "rejected"
        | "cancelled"
      payment_status:
        | "pending"
        | "processing"
        | "confirmed"
        | "reconciled"
        | "posted"
        | "failed"
        | "rejected"
        | "reversed"
        | "refunded"
        | "cancelled"
      transaction_status:
        | "unmatched"
        | "matched"
        | "rejected"
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
      announcement_audience: [
        "everyone",
        "staff",
        "students",
        "parents",
        "class",
      ],
      app_role: ["super_admin", "school_admin", "teacher", "student", "parent", "finance_officer", "admissions_officer"],
      attendance_status: ["present", "absent", "late", "excused"],
      domain_ssl_status: ["pending", "issued", "failed"],
      domain_type: ["subdomain", "custom"],
      domain_verification_status: ["pending", "verified", "failed"],
      enrollment_status: ["active", "withdrawn", "transferred", "completed"],
      profile_status: ["invited", "active", "suspended", "inactive"],
      school_stage: [
        "early_childhood",
        "primary",
        "junior_high",
        "senior_high",
        "other",
      ],
      fee_type: ["registration", "tuition", "examination", "laboratory", "library", "sports", "technology", "transportation", "boarding", "graduation", "transcript", "certificate", "id_card", "other"],
      invoice_status: ["draft", "issued", "cancelled"],
      ledger_direction: ["debit", "credit"],
      ledger_entry_type: ["charge", "payment", "reversal", "adjustment", "refund"],
      payment_method: ["bank", "orange_money", "mtn_momo", "cash", "other"],
      document_request_status: ["requested", "payment_pending", "paid", "under_review", "approved", "generated", "printed", "delivered", "rejected", "cancelled"],
      payment_status: ["pending", "processing", "confirmed", "reconciled", "posted", "failed", "rejected", "reversed", "refunded", "cancelled"],
      transaction_status: ["unmatched", "matched", "rejected"],
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
