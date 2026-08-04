create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table if not exists public.validation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  model_name text not null check (char_length(model_name) between 1 and 255),
  normalized_model jsonb not null,
  requirements jsonb not null,
  results jsonb not null,
  metrics jsonb not null,
  created_at timestamptz not null default now(),
  constraint validation_run_owner_matches_project
    foreign key (project_id, owner_id) references public.projects(id, owner_id)
);

create index if not exists projects_owner_updated_idx on public.projects(owner_id, updated_at desc);
create index if not exists validation_runs_project_created_idx on public.validation_runs(project_id, created_at desc);

alter table public.projects enable row level security;
alter table public.validation_runs enable row level security;

create policy "owners manage projects" on public.projects
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "owners manage validation runs" on public.validation_runs
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

revoke all on public.projects, public.validation_runs from anon;
grant select, insert, update, delete on public.projects, public.validation_runs to authenticated;
