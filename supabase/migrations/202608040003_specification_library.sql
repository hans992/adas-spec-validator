create table if not exists public.specification_packages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  revision text not null check (char_length(revision) between 1 and 100),
  requirements jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (project_id, name, revision),
  constraint specification_owner_matches_project foreign key (project_id, owner_id)
    references public.projects(id, owner_id) on delete cascade
);

create index if not exists specification_packages_project_created_idx
  on public.specification_packages(project_id, created_at desc);

alter table public.specification_packages enable row level security;

create policy "participants read specification packages" on public.specification_packages
  for select to authenticated using (public.can_view_project(project_id));
create policy "editors create specification packages" on public.specification_packages
  for insert to authenticated with check (public.can_edit_project(project_id));

revoke all on public.specification_packages from anon;
grant select, insert on public.specification_packages to authenticated;
