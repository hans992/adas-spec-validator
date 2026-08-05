-- Production security hardening: soft delete with retention, access helpers that
-- exclude deleted projects, an append-only audit event log, and a purge function
-- for permanent deletion after the retention window.

-- 1. Soft delete -------------------------------------------------------------

alter table public.projects
  add column if not exists deleted_at timestamptz;

create index if not exists projects_deleted_idx on public.projects(deleted_at)
  where deleted_at is not null;

-- Access helpers now treat soft-deleted projects as invisible. Every child
-- table (runs, reviews, evidence, specs, model assets, members) authorizes
-- through these functions, so one change hides the whole project tree.
create or replace function public.can_view_project(target_project uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from projects p
    where p.id = target_project
      and p.deleted_at is null
      and (
        p.owner_id = auth.uid()
        or exists(select 1 from project_members m where m.project_id = p.id and m.user_id = auth.uid())
      )
  );
$$;

create or replace function public.can_edit_project(target_project uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from projects p
    where p.id = target_project
      and p.deleted_at is null
      and (
        p.owner_id = auth.uid()
        or exists(select 1 from project_members m where m.project_id = p.id and m.user_id = auth.uid() and m.role = 'editor')
      )
  );
$$;

-- Members lose visibility of a soft-deleted project immediately; the owner
-- keeps seeing it so they can restore or permanently delete it.
drop policy if exists "participants read projects" on public.projects;
create policy "participants read projects" on public.projects
  for select to authenticated
  using (
    owner_id = auth.uid()
    or (
      deleted_at is null
      and exists(select 1 from project_members m where m.project_id = id and m.user_id = auth.uid())
    )
  );

-- 2. Retention: permanent purge of soft-deleted projects ---------------------

-- Children cascade through existing foreign keys (validation_runs, reviews,
-- evidence, specification packages, model assets, members, invitations,
-- tokens, webhooks). Run from a scheduled job with the service role.
create or replace function public.purge_soft_deleted_projects(retention_days integer default 30)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  purged integer;
begin
  if retention_days < 0 then
    raise exception 'retention_days must be non-negative';
  end if;
  delete from public.projects
  where deleted_at is not null
    and deleted_at < now() - make_interval(days => retention_days);
  get diagnostics purged = row_count;
  return purged;
end;
$$;

revoke all on function public.purge_soft_deleted_projects(integer) from public;
revoke all on function public.purge_soft_deleted_projects(integer) from anon;
revoke all on function public.purge_soft_deleted_projects(integer) from authenticated;
grant execute on function public.purge_soft_deleted_projects(integer) to service_role;

-- 3. Audit events -------------------------------------------------------------

-- Append-only, written exclusively through the service role. Rows carry actor,
-- action, and identifiers only — never document content or credentials.
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  event text not null check (char_length(event) between 1 and 120),
  actor_id uuid,
  project_id uuid,
  target_id text check (target_id is null or char_length(target_id) <= 200),
  request_id text check (request_id is null or char_length(request_id) <= 100),
  outcome text not null default 'success' check (outcome in ('success', 'denied', 'failure')),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists audit_events_project_idx on public.audit_events(project_id, at desc);

alter table public.audit_events enable row level security;

-- Project owners can read the audit trail of their own projects. There is no
-- insert/update/delete policy for authenticated users: only the service role
-- (which bypasses RLS) writes, and nothing edits.
create policy "owners read project audit events" on public.audit_events
  for select to authenticated
  using (
    project_id is not null
    and exists(select 1 from projects p where p.id = project_id and p.owner_id = auth.uid())
  );

revoke all on public.audit_events from anon;
grant select on public.audit_events to authenticated;

-- 4. Invitation hygiene --------------------------------------------------------

create index if not exists project_invitations_expiry_idx
  on public.project_invitations(status, expires_at);

comment on column public.projects.deleted_at is
  'Soft delete marker. Members lose access instantly; purge_soft_deleted_projects removes the row permanently after the retention window.';
comment on table public.audit_events is
  'Append-only audit trail written via the service role. Identifiers and outcomes only — no document content, credentials, or emails.';
