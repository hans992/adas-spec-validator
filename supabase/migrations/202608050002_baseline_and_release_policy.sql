-- Baseline run pointer and deterministic release policy per project.
-- Regression decisions are computed from stored snapshots + this policy; never from AI.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'validation_runs_id_project_unique'
  ) then
    alter table public.validation_runs
      add constraint validation_runs_id_project_unique unique (id, project_id);
  end if;
end $$;

alter table public.projects
  add column if not exists baseline_validation_id uuid;

alter table public.projects
  add column if not exists release_policy jsonb not null default jsonb_build_object(
    'blockOnNewCritical', true,
    'blockOnDecreasedCoverage', true,
    'warnOnNewUnknown', true,
    'allowWaivedCritical', false,
    'maxHighFindings', null,
    'maxMediumFindings', null
  );

-- Baseline must belong to the same project when set.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_baseline_same_project'
  ) then
    alter table public.projects
      add constraint projects_baseline_same_project
      foreign key (baseline_validation_id, id)
      references public.validation_runs(id, project_id)
      on delete set null;
  end if;
end $$;

comment on column public.projects.baseline_validation_id is
  'Validation run used as the regression baseline for this project.';
comment on column public.projects.release_policy is
  'Deterministic release-gate policy evaluated against baseline vs candidate runs.';
