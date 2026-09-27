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
      announcement_audience: "everyone" | "staff" | "students" | "parents" | "class"
      app_role:
        | "super_admin"
        | "school_admin"
        | "teacher"
        | "student"
        | "parent"
      attendance_status: "present" | "absent" | "late" | "excused"
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
      announcement_audience: ["everyone", "staff", "students", "parents", "class"],
      app_role: ["super_admin", "school_admin", "teacher", "student", "parent"],
      attendance_status: ["present", "absent", "late", "excused"],
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
