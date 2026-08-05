-- Background job system for large model imports and validations.
--
-- Jobs execute as short, step-based worker ticks (one phase per invocation) so
-- no single serverless request has to survive a whole import. Rows carry the
-- temporary upload payload, which is cleared as soon as it is no longer needed.

create table if not exists public.validation_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  kind text not null default 'import_and_validate' check (kind in ('import_and_validate')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  phase text not null default 'queued' check (phase in ('queued', 'parsing', 'validating', 'persisting', 'completed')),
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),

  -- Input: uploaded file kept only until parsing succeeds (temp payload).
  input_file_name text not null check (char_length(input_file_name) between 1 and 255),
  input_content_base64 text,
  input_content_hash text not null check (char_length(input_content_hash) = 64),
  input_size_bytes integer not null check (input_size_bytes between 1 and 27962027), -- 20 MB as base64
  specification_package_id uuid not null,

  -- Intermediate state between phases (normalized model, results, metrics).
  working_state jsonb,

  -- Execution bookkeeping.
  attempts integer not null default 0,
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  lease_expires_at timestamptz,
  next_run_at timestamptz not null default now(),
  timeout_seconds integer not null default 300 check (timeout_seconds between 30 and 3600),
  cancel_requested boolean not null default false,
  last_error text check (last_error is null or char_length(last_error) <= 2000),
  error_retryable boolean,
  dead_lettered_at timestamptz,

  -- Results.
  model_asset_id uuid,
  validation_run_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,

  unique (project_id, idempotency_key),
  constraint validation_jobs_project_owner
    foreign key (project_id, owner_id) references public.projects(id, owner_id) on delete cascade
);

create index if not exists validation_jobs_claim_idx
  on public.validation_jobs(status, next_run_at)
  where status in ('queued', 'processing');
create index if not exists validation_jobs_project_idx
  on public.validation_jobs(project_id, created_at desc);

alter table public.validation_jobs enable row level security;

-- Participants can watch job progress; editors can enqueue. All state
-- transitions (claiming, phase progress, cancellation, retry) go through the
-- service role via the app's API so users can never forge status or results.
create policy "participants read validation jobs" on public.validation_jobs
  for select to authenticated using (public.can_view_project(project_id));
create policy "editors enqueue validation jobs" on public.validation_jobs
  for insert to authenticated
  with check (public.can_edit_project(project_id) and created_by = auth.uid());

revoke all on public.validation_jobs from anon;
grant select, insert on public.validation_jobs to authenticated;

comment on table public.validation_jobs is
  'Step-based background jobs. input_content_base64 is a temporary payload cleared after parsing; working_state carries results between phases.';
