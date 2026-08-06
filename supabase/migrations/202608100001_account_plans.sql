-- Account plans and monthly usage counters for commercially enforced limits.
-- Plans are assigned per user (default starter). Stripe is not required yet —
-- operators can upgrade rows directly; the application enforces caps on every
-- mutating path that consumes a limited resource.

create table if not exists public.account_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'starter'
    check (plan in ('starter', 'professional', 'enterprise')),
  updated_at timestamptz not null default now()
);

alter table public.account_plans enable row level security;

create policy "users read own plan" on public.account_plans
  for select to authenticated using (user_id = auth.uid());

-- Inserts/updates go through the service role (signup bootstrap + admin upgrades).
revoke all on public.account_plans from anon;
grant select on public.account_plans to authenticated;

create table if not exists public.account_usage_months (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  validation_runs integer not null default 0 check (validation_runs >= 0),
  audit_exports integer not null default 0 check (audit_exports >= 0),
  storage_bytes bigint not null default 0 check (storage_bytes >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.account_usage_months enable row level security;

create policy "users read own usage" on public.account_usage_months
  for select to authenticated using (user_id = auth.uid());

revoke all on public.account_usage_months from anon;
grant select on public.account_usage_months to authenticated;

comment on table public.account_plans is
  'Commercial plan assignment. Default starter when no row exists.';
comment on table public.account_usage_months is
  'Monthly counters for validation runs and audit exports. Storage is also estimated live from project assets.';
