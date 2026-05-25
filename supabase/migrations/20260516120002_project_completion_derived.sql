-- T7.3: Derive projects.status from tracks + publish_targets state.
--
-- Rule: projects.status = 'completed' iff every non-aborted track has a
-- stage_runs row with stage='publish', status='completed', for every
-- active publish_target linked to the project's channel.
--
-- Guards:
--   - Zero non-aborted tracks  → leave status untouched (vacuous truth guard).
--   - No active targets        → leave status untouched (can't publish anywhere).
--   - No channel_id on project → leave status untouched.
--   - If any (track, target) pair is missing a succeeded run AND current
--     status='completed' → revert to 'running' (new track added case).
--
-- Mirrors the TS function `recomputeProjectStatus` in
-- apps/api/src/lib/pipeline/project-completion.ts — keep both in sync.

-- ─── Core function ────────────────────────────────────────────────────────────

create or replace function public.recompute_project_status(p_project_id text)
returns void
language plpgsql
security definer
as $$
declare
  v_channel_id      uuid;
  v_current_status  text;
  v_track_count     int;
  v_target_count    int;
  v_pair_count      int;
  v_done_count      int;
  v_new_status      text;
begin
  -- 1. Load project
  select channel_id, status
    into v_channel_id, v_current_status
    from public.projects
   where id = p_project_id;

  if not found then
    return;
  end if;

  -- No channel → can't resolve targets
  if v_channel_id is null then
    return;
  end if;

  -- 2. Count non-aborted tracks
  select count(*) into v_track_count
    from public.tracks
   where project_id = p_project_id
     and status <> 'aborted';

  -- Vacuous truth guard: no active tracks → do nothing
  if v_track_count = 0 then
    return;
  end if;

  -- 3. Count active publish_targets for this channel
  select count(*) into v_target_count
    from public.publish_targets
   where channel_id = v_channel_id
     and is_active = true;

  -- No targets → cannot be complete
  if v_target_count = 0 then
    return;
  end if;

  -- 4. Total (track, target) pairs expected
  v_pair_count := v_track_count * v_target_count;

  -- 5. Count (track, target) pairs that have a completed publish stage_run
  select count(*) into v_done_count
    from (
      select distinct sr.track_id, sr.publish_target_id
        from public.stage_runs sr
        join public.tracks t
          on t.id = sr.track_id
         and t.project_id = p_project_id
         and t.status <> 'aborted'
        join public.publish_targets pt
          on pt.id = sr.publish_target_id
         and pt.channel_id = v_channel_id
         and pt.is_active = true
       where sr.project_id = p_project_id
         and sr.stage      = 'publish'
         and sr.status     = 'completed'
    ) sub;

  -- 6. Derive new status
  if v_done_count >= v_pair_count then
    v_new_status := 'completed';
  elsif v_current_status = 'completed' then
    -- A previously completed project now has unfulfilled pairs → revert.
    v_new_status := 'running';
  else
    -- No change needed
    return;
  end if;

  if v_new_status = v_current_status then
    return;
  end if;

  update public.projects
     set status = v_new_status
   where id = p_project_id;
end;
$$;

-- ─── Trigger function wrapper ─────────────────────────────────────────────────

create or replace function public.trg_recompute_project_status_from_track()
returns trigger
language plpgsql
security definer
as $$
begin
  perform public.recompute_project_status(NEW.project_id::text);
  return null;
end;
$$;

create or replace function public.trg_recompute_project_status_from_stage_run()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Only react to publish-stage rows
  if NEW.stage = 'publish' then
    perform public.recompute_project_status(NEW.project_id::text);
  end if;
  return null;
end;
$$;

create or replace function public.trg_recompute_project_status_from_publish_target()
returns trigger
language plpgsql
security definer
as $$
declare
  r record;
begin
  -- Recompute for every project in the channel this target belongs to.
  -- Uses OLD for UPDATE (is_active toggled off) and NEW for INSERT/on-activate.
  for r in
    select distinct p.id
      from public.projects p
     where p.channel_id = coalesce(NEW.channel_id, OLD.channel_id)
  loop
    perform public.recompute_project_status(r.id::text);
  end loop;
  return null;
end;
$$;

-- ─── Triggers ────────────────────────────────────────────────────────────────

-- tracks: fires when a track's status changes (e.g. new track added → active,
-- or existing track aborted, or track completed).
drop trigger if exists trg_project_status_from_track on public.tracks;
create trigger trg_project_status_from_track
  after insert or update of status
  on public.tracks
  for each row
  execute function public.trg_recompute_project_status_from_track();

-- stage_runs: fires when a publish stage_run status changes.
drop trigger if exists trg_project_status_from_stage_run on public.stage_runs;
create trigger trg_project_status_from_stage_run
  after insert or update of status
  on public.stage_runs
  for each row
  execute function public.trg_recompute_project_status_from_stage_run();

-- publish_targets: fires when is_active changes (target enabled/disabled).
drop trigger if exists trg_project_status_from_publish_target on public.publish_targets;
create trigger trg_project_status_from_publish_target
  after insert or update of is_active
  on public.publish_targets
  for each row
  execute function public.trg_recompute_project_status_from_publish_target();
