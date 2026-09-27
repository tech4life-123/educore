-- =============================================================================
-- EduCore — Migration 007: indexes covering the academic foreign keys
-- (Supabase performance advisor 0001). Composite FKs get matching composite
-- indexes; single-column indexes they supersede are dropped.
-- =============================================================================

drop index if exists public.class_subjects_teacher_idx;
drop index if exists public.guardian_links_student_idx;
drop index if exists public.enrollments_class_idx;

create index academic_terms_year_school_idx     on public.academic_terms (academic_year_id, school_id);
create index academic_terms_school_idx          on public.academic_terms (school_id);
create index grading_periods_term_school_idx    on public.grading_periods (term_id, school_id);
create index grading_periods_school_idx         on public.grading_periods (school_id);
create index classes_year_school_idx            on public.classes (academic_year_id, school_id);
create index classes_grade_school_idx           on public.classes (grade_level_id, school_id);
create index classes_homeroom_school_idx        on public.classes (homeroom_teacher_id, school_id);
create index class_subjects_class_school_idx    on public.class_subjects (class_id, school_id);
create index class_subjects_subject_school_idx  on public.class_subjects (subject_id, school_id);
create index class_subjects_teacher_school_idx  on public.class_subjects (teacher_id, school_id);
create index class_subjects_school_idx          on public.class_subjects (school_id);
create index enrollments_class_school_idx       on public.enrollments (class_id, school_id);
create index enrollments_student_school_idx     on public.enrollments (student_id, school_id);
create index enrollments_year_school_idx        on public.enrollments (academic_year_id, school_id);
create index enrollments_school_idx             on public.enrollments (school_id);
create index guardian_links_parent_school_idx   on public.guardian_links (parent_id, school_id);
create index guardian_links_student_school_idx  on public.guardian_links (student_id, school_id);
create index guardian_links_school_idx          on public.guardian_links (school_id);
