-- RLS test matrix for AEC Spec Validator.
--
-- Run against a local Supabase stack after applying every migration:
--   supabase db reset
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test_matrix.sql
--
-- The script seeds four personas (owner, editor, viewer, outsider), exercises
-- the access matrix across every project-scoped table, and raises an exception
-- on the first violation. Everything rolls back at the end; the database is
-- left untouched. Success prints "RLS MATRIX PASSED".

begin;

-- ---------------------------------------------------------------------------
-- Seed personas and fixtures (as superuser, bypassing RLS)
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@rls.test',    crypt('password-owner',    gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor@rls.test',   crypt('password-editor',   gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer@rls.test',   crypt('password-viewer',   gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@rls.test', crypt('password-outsider', gen_salt('bf')), now(), now(), now());

insert into public.projects (id, owner_id, name)
values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'RLS matrix project');

insert into public.project_members (project_id, user_id, role, invited_by) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'editor', '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'viewer', '00000000-0000-4000-8000-000000000001');

insert into public.validation_runs (id, project_id, owner_id, created_by, model_name, normalized_model, requirements, results, metrics)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'matrix.ifc', '{"levels":[],"rooms":[],"doors":[]}', '[]', '[]', '{}'
);

insert into public.validation_reviews (validation_run_id, project_id, owner_id, updated_by, requirement_id, status, comment)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'REQ-001', 'open', 'seed');

insert into public.finding_evidence (validation_run_id, project_id, owner_id, created_by, requirement_id, finding_key, kind, title, comment)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'REQ-001', 'REQ-001|rule|e1', 'comment', 'Seed evidence', 'seeded comment');

insert into public.specification_packages (id, project_id, owner_id, created_by, name, revision, requirements)
values ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Matrix spec', 'A', '[]');

insert into public.project_invitations (project_id, owner_id, email, role)
values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'invited@rls.test', 'viewer');

insert into public.audit_events (event, actor_id, project_id, outcome)
values ('project.soft_deleted', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'success');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function pg_temp.impersonate(user_id uuid, user_email text)
returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format(
    'set local request.jwt.claims = %L',
    json_build_object('sub', user_id, 'role', 'authenticated', 'email', user_email)::text
  );
end $$;

create or replace function pg_temp.expect_count(query text, expected bigint, label text)
returns void language plpgsql as $$
declare actual bigint;
begin
  execute query into actual;
  if actual is distinct from expected then
    raise exception 'RLS MATRIX FAILED: % (expected %, got %)', label, expected, actual;
  end if;
end $$;

create or replace function pg_temp.expect_denied(statement text, label text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when insufficient_privilege or check_violation or foreign_key_violation or raise_exception then
    return; -- denied as expected
  end;
  raise exception 'RLS MATRIX FAILED: % (write was NOT denied)', label;
end $$;

-- ---------------------------------------------------------------------------
-- OWNER: full visibility
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.impersonate('00000000-0000-4000-8000-000000000001', 'owner@rls.test');
  perform pg_temp.expect_count('select count(*) from public.projects', 1, 'owner sees own project');
  perform pg_temp.expect_count('select count(*) from public.validation_runs', 1, 'owner sees runs');
  perform pg_temp.expect_count('select count(*) from public.validation_reviews', 1, 'owner sees reviews');
  perform pg_temp.expect_count('select count(*) from public.finding_evidence', 1, 'owner sees evidence');
  perform pg_temp.expect_count('select count(*) from public.specification_packages', 1, 'owner sees specs');
  perform pg_temp.expect_count('select count(*) from public.project_members', 2, 'owner sees members');
  perform pg_temp.expect_count('select count(*) from public.project_invitations', 1, 'owner sees invitations');
  perform pg_temp.expect_count('select count(*) from public.audit_events', 1, 'owner reads audit events');
  execute 'reset role';
end $$;

-- ---------------------------------------------------------------------------
-- EDITOR MEMBER: read + write, no owner-only surfaces
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.impersonate('00000000-0000-4000-8000-000000000002', 'editor@rls.test');
  perform pg_temp.expect_count('select count(*) from public.projects', 1, 'editor sees shared project');
  perform pg_temp.expect_count('select count(*) from public.validation_runs', 1, 'editor sees runs');
  perform pg_temp.expect_count('select count(*) from public.audit_events', 0, 'editor cannot read audit events');
  perform pg_temp.expect_count('select count(*) from public.project_invitations', 0, 'editor cannot read invitations');
  -- Editor CAN insert a review with their own identity.
  execute $ins$insert into public.validation_reviews (validation_run_id, project_id, owner_id, updated_by, requirement_id, status, comment)
    values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'REQ-EDITOR', 'open', 'by editor')$ins$;
  -- Editor CANNOT manage members (owner-only).
  perform pg_temp.expect_denied(
    $blk$insert into public.project_members (project_id, user_id, role, invited_by)
      values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', 'viewer', '00000000-0000-4000-8000-000000000002')$blk$,
    'editor cannot add members');
  execute 'reset role';
end $$;

-- ---------------------------------------------------------------------------
-- VIEWER MEMBER: read-only
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.impersonate('00000000-0000-4000-8000-000000000003', 'viewer@rls.test');
  perform pg_temp.expect_count('select count(*) from public.projects', 1, 'viewer sees shared project');
  perform pg_temp.expect_count('select count(*) from public.validation_reviews', 2, 'viewer reads reviews');
  perform pg_temp.expect_denied(
    $blk$insert into public.validation_reviews (validation_run_id, project_id, owner_id, updated_by, requirement_id, status, comment)
      values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'REQ-VIEWER', 'open', 'by viewer')$blk$,
    'viewer cannot write reviews');
  perform pg_temp.expect_denied(
    $blk$insert into public.finding_evidence (validation_run_id, project_id, owner_id, created_by, requirement_id, finding_key, kind, title, comment)
      values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'REQ-001', 'k', 'comment', 'T', 'viewer evidence')$blk$,
    'viewer cannot attach evidence');
  -- RLS silently matches zero rows for unauthorized updates; verify no effect.
  execute $blk$update public.projects set name = 'hijacked' where id = '10000000-0000-4000-8000-000000000001'$blk$;
  perform pg_temp.expect_count(
    $q$select count(*) from public.projects where name = 'hijacked'$q$, 0,
    'viewer cannot rename the project');
  execute 'reset role';
end $$;

-- ---------------------------------------------------------------------------
-- OUTSIDER: zero visibility, even with guessed IDs
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.impersonate('00000000-0000-4000-8000-000000000004', 'outsider@rls.test');
  perform pg_temp.expect_count('select count(*) from public.projects', 0, 'outsider sees no projects');
  perform pg_temp.expect_count(
    $q$select count(*) from public.projects where id = '10000000-0000-4000-8000-000000000001'$q$, 0,
    'outsider cannot fetch a project by guessed ID');
  perform pg_temp.expect_count(
    $q$select count(*) from public.validation_runs where id = '20000000-0000-4000-8000-000000000001'$q$, 0,
    'outsider cannot fetch a run by guessed ID');
  perform pg_temp.expect_count('select count(*) from public.validation_reviews', 0, 'outsider sees no reviews');
  perform pg_temp.expect_count('select count(*) from public.finding_evidence', 0, 'outsider sees no evidence');
  perform pg_temp.expect_count('select count(*) from public.specification_packages', 0, 'outsider sees no specs');
  perform pg_temp.expect_count('select count(*) from public.project_members', 0, 'outsider sees no members');
  perform pg_temp.expect_count('select count(*) from public.project_invitations', 0, 'outsider sees no invitations');
  perform pg_temp.expect_count('select count(*) from public.audit_events', 0, 'outsider sees no audit events');
  perform pg_temp.expect_denied(
    $blk$insert into public.validation_runs (project_id, owner_id, created_by, model_name, normalized_model, requirements, results, metrics)
      values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000004', 'attack.ifc', '{}', '[]', '[]', '{}')$blk$,
    'outsider cannot insert a run into a foreign project');
  perform pg_temp.expect_denied(
    $blk$insert into public.projects (id, owner_id, name) values (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'forged owner')$blk$,
    'outsider cannot create a project owned by someone else');
  execute 'reset role';
end $$;

-- ---------------------------------------------------------------------------
-- SOFT DELETE: members lose access instantly, owner keeps restore visibility
-- ---------------------------------------------------------------------------
update public.projects set deleted_at = now() where id = '10000000-0000-4000-8000-000000000001';

do $$ begin
  perform pg_temp.impersonate('00000000-0000-4000-8000-000000000002', 'editor@rls.test');
  perform pg_temp.expect_count('select count(*) from public.projects', 0, 'editor loses soft-deleted project');
  perform pg_temp.expect_count('select count(*) from public.validation_runs', 0, 'editor loses runs of soft-deleted project');
  perform pg_temp.expect_count('select count(*) from public.finding_evidence', 0, 'editor loses evidence of soft-deleted project');
  execute 'reset role';
  perform pg_temp.impersonate('00000000-0000-4000-8000-000000000001', 'owner@rls.test');
  perform pg_temp.expect_count('select count(*) from public.projects', 1, 'owner still sees soft-deleted project for restore');
  execute 'reset role';
end $$;

-- ---------------------------------------------------------------------------
-- ANON: nothing at all
-- ---------------------------------------------------------------------------
do $$ begin
  execute 'set local role anon';
  begin
    perform count(*) from public.projects;
    raise exception 'RLS MATRIX FAILED: anon can read projects';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end $$;

select 'RLS MATRIX PASSED' as result;

rollback;
