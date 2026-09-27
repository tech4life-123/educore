-- =============================================================================
-- EduCore — AI usage log (AI-1)
--
-- One row per EduCore AI request: who, which school, which model, how it
-- ended and how many tokens it used. It backs the per-user / per-school usage
-- limits and later the usage monitoring screens.
--
-- Deliberately NOT stored: questions, answers, or any data shown to the
-- model. There is no column for them.
--
-- Rows are written only by the server (service role) AFTER it has
-- authenticated the caller; browsers have no INSERT/UPDATE/DELETE, so nobody
-- can erase or forge their own usage. People can read their own rows, and
-- school administrators can read their school's rows.
-- =============================================================================

create table public.ai_usage_events (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  school_id     uuid references public.schools (id) on delete cascade,
  role          public.app_role not null,
  kind          text not null check (kind in ('chat', 'check')),
  provider      text not null check (char_length(provider) between 1 and 40),
  model         text not null check (char_length(model) between 1 and 80),
  status        text not null check (status in ('ok', 'error', 'rate_limited')),
  error_code    text check (char_length(error_code) <= 40),
  input_tokens  integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  tool_calls    integer not null default 0 check (tool_calls >= 0),
  duration_ms   integer not null default 0 check (duration_ms >= 0),
  constraint ai_usage_scope check ((role = 'super_admin') = (school_id is null))
);

comment on table public.ai_usage_events is
  'EduCore AI request metadata (no conversation content). Written by the server after authentication.';

create index ai_usage_events_profile_time on public.ai_usage_events (profile_id, created_at desc);
create index ai_usage_events_school_time on public.ai_usage_events (school_id, created_at desc) where school_id is not null;

alter table public.ai_usage_events enable row level security;
alter table public.ai_usage_events force row level security;

revoke all on public.ai_usage_events from anon, authenticated;
grant select on public.ai_usage_events to authenticated;

create policy "People read their own AI usage; school admins read their school's"
  on public.ai_usage_events for select to authenticated
  using (
    profile_id = (select private.current_profile_id())
    or (school_id = (select private.current_school_id()) and (select private.is_school_admin()))
  );
