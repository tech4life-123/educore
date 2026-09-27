-- AI-4: record which data tools a request used (names only, never inputs or results).
alter table public.ai_usage_events
  add column tool_names text[] not null default '{}'
  check (cardinality(tool_names) <= 20);
