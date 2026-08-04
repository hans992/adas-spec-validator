create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer', 'editor')),
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 320),
  role text not null check (role in ('viewer', 'editor')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (project_id, email),
  constraint invitation_owner_matches_project foreign key (project_id, owner_id)
    references public.projects(id, owner_id) on delete cascade
);

create or replace function public.can_view_project(target_project uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from projects p where p.id = target_project and p.owner_id = auth.uid())
  or exists(select 1 from project_members m where m.project_id = target_project and m.user_id = auth.uid()); $$;

create or replace function public.can_edit_project(target_project uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from projects p where p.id = target_project and p.owner_id = auth.uid())
  or exists(select 1 from project_members m where m.project_id = target_project and m.user_id = auth.uid() and m.role = 'editor'); $$;

alter table public.project_members enable row level security;
alter table public.project_invitations enable row level security;

create policy "members visible to project participants" on public.project_members
  for select to authenticated using (public.can_view_project(project_id));
create policy "owners manage project members" on public.project_members
  for all to authenticated using (exists(select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists(select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()));

create policy "owners manage invitations" on public.project_invitations
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "recipients see invitations" on public.project_invitations
  for select to authenticated using (email = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy "recipients accept invitations" on public.project_invitations
  for update to authenticated using (
    email = lower(coalesce(auth.jwt() ->> 'email', '')) and status = 'pending' and expires_at > now()
  ) with check (email = lower(coalesce(auth.jwt() ->> 'email', '')) and status = 'accepted');

create or replace function public.accept_project_invitation(invitation_uuid uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare invitation project_invitations%rowtype;
begin
  select * into invitation from project_invitations
    where id = invitation_uuid and status = 'pending' and expires_at > now()
      and email = lower(coalesce(auth.jwt() ->> 'email', '')) for update;
  if not found then raise exception 'Invitation not found or expired' using errcode = 'P0002'; end if;
  insert into project_members(project_id, user_id, role, invited_by)
    values(invitation.project_id, auth.uid(), invitation.role, invitation.owner_id)
    on conflict(project_id, user_id) do update set role = excluded.role;
  update project_invitations set status = 'accepted', accepted_at = now() where id = invitation.id;
  return invitation.project_id;
end; $$;

drop policy if exists "owners manage projects" on public.projects;
create policy "participants read projects" on public.projects for select to authenticated
  using (owner_id = auth.uid() or exists(select 1 from project_members m where m.project_id = id and m.user_id = auth.uid()));
create policy "owners insert projects" on public.projects for insert to authenticated with check (owner_id = auth.uid());
create policy "owners update projects" on public.projects for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners delete projects" on public.projects for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "owners manage validation runs" on public.validation_runs;
create policy "participants read validation runs" on public.validation_runs for select to authenticated using (public.can_view_project(project_id));
create policy "editors create validation runs" on public.validation_runs for insert to authenticated with check (public.can_edit_project(project_id));

drop policy if exists "owners manage validation reviews" on public.validation_reviews;
create policy "participants read validation reviews" on public.validation_reviews for select to authenticated using (public.can_view_project(project_id));
create policy "editors create validation reviews" on public.validation_reviews for insert to authenticated with check (public.can_edit_project(project_id));
create policy "editors update validation reviews" on public.validation_reviews for update to authenticated using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

alter table public.validation_runs add column if not exists created_by uuid references auth.users(id);
update public.validation_runs set created_by = owner_id where created_by is null;
alter table public.validation_runs alter column created_by set not null;
alter table public.validation_reviews add column if not exists updated_by uuid references auth.users(id);
update public.validation_reviews set updated_by = owner_id where updated_by is null;
alter table public.validation_reviews alter column updated_by set not null;

revoke all on public.project_members, public.project_invitations from anon;
grant select, insert, update, delete on public.project_members, public.project_invitations to authenticated;
grant execute on function public.accept_project_invitation(uuid) to authenticated;
