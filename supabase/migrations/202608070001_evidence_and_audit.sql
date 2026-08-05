-- Rich finding evidence attachments and append-only review decision history.
-- Audit packages are assembled server-side from immutable snapshots + SHA-256 manifests.

alter table public.validation_reviews
  add column if not exists waiver_reason text check (waiver_reason is null or char_length(waiver_reason) <= 2000),
  add column if not exists waiver_expires_at timestamptz,
  add column if not exists decision_id uuid default gen_random_uuid();

update public.validation_reviews
set decision_id = coalesce(decision_id, gen_random_uuid())
where decision_id is null;

-- Legacy waived rows may lack a reason; backfill before the constraint is applied.
update public.validation_reviews
set waiver_reason = 'Legacy waiver — reason not recorded'
where status = 'waived'
  and (waiver_reason is null or char_length(trim(waiver_reason)) = 0);

update public.validation_reviews
set waiver_reason = null, waiver_expires_at = null
where status <> 'waived'
  and (waiver_reason is not null or waiver_expires_at is not null);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'validation_reviews_waiver_fields'
  ) then
    alter table public.validation_reviews
      add constraint validation_reviews_waiver_fields
      check (
        (status <> 'waived' and waiver_reason is null and waiver_expires_at is null)
        or (status = 'waived' and waiver_reason is not null and char_length(trim(waiver_reason)) > 0)
      );
  end if;
end $$;

create table if not exists public.validation_review_history (
  id uuid primary key default gen_random_uuid(),
  validation_run_id uuid not null,
  project_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  requirement_id text not null check (char_length(requirement_id) between 1 and 200),
  decision_id uuid not null,
  status text not null check (status in ('open', 'acknowledged', 'resolved', 'waived')),
  comment text not null default '' check (char_length(comment) <= 2000),
  waiver_reason text check (waiver_reason is null or char_length(waiver_reason) <= 2000),
  waiver_expires_at timestamptz,
  reviewer_id uuid not null references auth.users(id),
  decided_at timestamptz not null,
  superseded_at timestamptz not null default now(),
  superseded_by_decision_id uuid,
  constraint validation_review_history_run_project_owner
    foreign key (validation_run_id, project_id, owner_id)
    references public.validation_runs(id, project_id, owner_id) on delete cascade
);

create index if not exists validation_review_history_run_idx
  on public.validation_review_history(validation_run_id, requirement_id, decided_at desc);

alter table public.validation_review_history enable row level security;
create policy "participants read review history" on public.validation_review_history
  for select to authenticated using (public.can_view_project(project_id));
create policy "editors insert review history" on public.validation_review_history
  for insert to authenticated
  with check (public.can_edit_project(project_id) and reviewer_id = auth.uid());
revoke all on public.validation_review_history from anon;
grant select, insert on public.validation_review_history to authenticated;

create table if not exists public.finding_evidence (
  id uuid primary key default gen_random_uuid(),
  validation_run_id uuid not null,
  project_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  requirement_id text not null check (char_length(requirement_id) between 1 and 200),
  rule_id text check (rule_id is null or char_length(rule_id) <= 200),
  finding_key text not null check (char_length(finding_key) between 1 and 500),
  kind text not null check (kind in ('file', 'screenshot', 'model_element', 'comment', 'link', 'technical_note')),
  title text not null check (char_length(title) between 1 and 200),
  comment text not null default '' check (char_length(comment) <= 4000),
  link_url text check (link_url is null or char_length(link_url) <= 2048),
  technical_note text check (technical_note is null or char_length(technical_note) <= 8000),
  model_element_id text check (model_element_id is null or char_length(model_element_id) <= 200),
  model_element_type text check (model_element_type is null or model_element_type in ('room', 'door', 'model')),
  file_name text check (file_name is null or char_length(file_name) <= 255),
  file_mime text check (file_mime is null or char_length(file_mime) <= 120),
  file_size_bytes integer check (file_size_bytes is null or (file_size_bytes >= 0 and file_size_bytes <= 5242880)),
  file_content_hash text check (file_content_hash is null or char_length(file_content_hash) = 64),
  file_content_base64 text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint finding_evidence_run_project_owner
    foreign key (validation_run_id, project_id, owner_id)
    references public.validation_runs(id, project_id, owner_id) on delete cascade,
  constraint finding_evidence_kind_payload check (
    (kind = 'file' and file_name is not null and file_content_hash is not null and file_content_base64 is not null)
    or (kind = 'screenshot' and file_name is not null and file_content_hash is not null and file_content_base64 is not null)
    or (kind = 'model_element' and model_element_id is not null and model_element_type is not null)
    or (kind = 'comment' and char_length(trim(comment)) > 0)
    or (kind = 'link' and link_url is not null)
    or (kind = 'technical_note' and technical_note is not null)
  )
);

create index if not exists finding_evidence_run_idx
  on public.finding_evidence(validation_run_id, requirement_id, created_at desc);

alter table public.finding_evidence enable row level security;
create policy "participants read finding evidence" on public.finding_evidence
  for select to authenticated using (public.can_view_project(project_id));
create policy "editors create finding evidence" on public.finding_evidence
  for insert to authenticated
  with check (public.can_edit_project(project_id) and created_by = auth.uid());
create policy "editors delete finding evidence" on public.finding_evidence
  for delete to authenticated using (public.can_edit_project(project_id));
revoke all on public.finding_evidence from anon;
grant select, insert, delete on public.finding_evidence to authenticated;

comment on table public.finding_evidence is
  'Human-attached evidence for a finding. Engine EvidenceItem rows stay inside validation_runs.results.';
comment on table public.validation_review_history is
  'Superseded review decisions retained for audit. Current decision remains on validation_reviews.';
