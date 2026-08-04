alter table public.validation_runs
  add constraint validation_runs_review_identity unique (id, project_id, owner_id);

create table if not exists public.validation_reviews (
  id uuid primary key default gen_random_uuid(),
  validation_run_id uuid not null,
  project_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  requirement_id text not null check (char_length(requirement_id) between 1 and 200),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved', 'waived')),
  comment text not null default '' check (char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (validation_run_id, requirement_id),
  constraint validation_review_run_project_owner
    foreign key (validation_run_id, project_id, owner_id)
    references public.validation_runs(id, project_id, owner_id) on delete cascade
);

create index if not exists validation_reviews_run_idx
  on public.validation_reviews(validation_run_id, updated_at desc);

alter table public.validation_reviews enable row level security;

create policy "owners manage validation reviews" on public.validation_reviews
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

revoke all on public.validation_reviews from anon;
grant select, insert, update, delete on public.validation_reviews to authenticated;
