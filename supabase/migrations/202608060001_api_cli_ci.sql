-- Machine API access, immutable pipeline assets, idempotency and webhook outbox.

create table if not exists public.project_api_tokens (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  token_hash text not null unique check (char_length(token_hash) = 64),
  token_prefix text not null check (char_length(token_prefix) between 8 and 24),
  scopes text[] not null default '{}',
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint project_api_token_owner_matches_project
    foreign key (project_id, owner_id) references public.projects(id, owner_id) on delete cascade
);

create index if not exists project_api_tokens_project_idx
  on public.project_api_tokens(project_id, created_at desc);

alter table public.project_api_tokens enable row level security;
create policy "owners manage project api tokens" on public.project_api_tokens
  for all to authenticated
  using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id) and owner_id = auth.uid() and created_by = auth.uid());
revoke all on public.project_api_tokens from anon;
grant select, insert, update, delete on public.project_api_tokens to authenticated;

create or replace function public.authenticate_project_api_token(input_hash text)
returns table (
  token_id uuid,
  project_id uuid,
  owner_id uuid,
  created_by uuid,
  scopes text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.project_api_tokens t
     set last_used_at = now()
   where t.token_hash = input_hash
     and t.revoked_at is null
     and (t.expires_at is null or t.expires_at > now())
  returning t.id, t.project_id, t.owner_id, t.created_by, t.scopes;
end;
$$;
revoke all on function public.authenticate_project_api_token(text) from public;
grant execute on function public.authenticate_project_api_token(text) to anon, authenticated;

create table if not exists public.project_model_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  source_file_name text not null check (char_length(source_file_name) between 1 and 255),
  source_content_hash text not null check (char_length(source_content_hash) = 64),
  input_fingerprint text not null check (char_length(input_fingerprint) = 64),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  normalized_model jsonb not null,
  diagnostics jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, idempotency_key),
  constraint project_model_asset_owner_matches_project
    foreign key (project_id, owner_id) references public.projects(id, owner_id) on delete cascade
);
create index if not exists project_model_assets_project_idx
  on public.project_model_assets(project_id, created_at desc);
alter table public.project_model_assets enable row level security;
create policy "participants read project model assets" on public.project_model_assets
  for select to authenticated using (public.can_view_project(project_id));
create policy "editors create project model assets" on public.project_model_assets
  for insert to authenticated
  with check (public.can_edit_project(project_id) and created_by = auth.uid());
revoke all on public.project_model_assets from anon;
grant select, insert on public.project_model_assets to authenticated;

alter table public.specification_packages
  add column if not exists source_file_name text,
  add column if not exists source_content_hash text,
  add column if not exists input_fingerprint text,
  add column if not exists idempotency_key text;
create unique index if not exists specification_packages_idempotency_idx
  on public.specification_packages(project_id, idempotency_key)
  where idempotency_key is not null;

alter table public.validation_runs
  add column if not exists model_asset_id uuid references public.project_model_assets(id),
  add column if not exists specification_package_id uuid references public.specification_packages(id),
  add column if not exists input_fingerprint text,
  add column if not exists idempotency_key text,
  add column if not exists status text not null default 'completed'
    check (status in ('pending', 'completed', 'failed'));
create unique index if not exists validation_runs_idempotency_idx
  on public.validation_runs(project_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.project_webhooks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  url text not null check (char_length(url) between 1 and 2048),
  secret_hash text not null check (char_length(secret_hash) = 64),
  encrypted_secret text not null,
  events text[] not null default array['validation.completed'],
  enabled boolean not null default true,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_webhook_owner_matches_project
    foreign key (project_id, owner_id) references public.projects(id, owner_id) on delete cascade
);
create index if not exists project_webhooks_project_idx
  on public.project_webhooks(project_id, created_at desc);
alter table public.project_webhooks enable row level security;
create policy "owners manage project webhooks" on public.project_webhooks
  for all to authenticated
  using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id) and owner_id = auth.uid() and created_by = auth.uid());
revoke all on public.project_webhooks from anon;
grant select, insert, update, delete on public.project_webhooks to authenticated;

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.project_webhooks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  event_id uuid not null default gen_random_uuid(),
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'delivering', 'delivered', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_retry_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  response_status integer,
  response_body text,
  last_error text,
  created_at timestamptz not null default now(),
  unique (webhook_id, event_id)
);
create index if not exists webhook_deliveries_retry_idx
  on public.webhook_deliveries(status, next_retry_at);
alter table public.webhook_deliveries enable row level security;
create policy "owners read webhook deliveries" on public.webhook_deliveries
  for select to authenticated using (public.is_project_owner(project_id));
revoke all on public.webhook_deliveries from anon;
grant select on public.webhook_deliveries to authenticated;
