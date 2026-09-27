-- Cover the remaining foreign keys on the grades tables.
create index assessments_school_idx on public.assessments (school_id);
create index assessments_class_subject_school_idx on public.assessments (class_subject_id, school_id);
create index assessment_scores_school_idx on public.assessment_scores (school_id);
create index grade_submissions_school_idx on public.grade_submissions (school_id);
