alter table projects
  add column if not exists channel_id              uuid references channels(id) on delete set null,
  add column if not exists mode                    text,
  add column if not exists autopilot_config_json   jsonb,
  add column if not exists autopilot_template_id   text references autopilot_templates(id) on delete set null,
  add column if not exists abort_requested_at      timestamptz;

create index if not exists idx_projects_channel_id on projects(channel_id);

-- Note: projects.channel_id is intentionally NOT backfilled. Legacy projects
-- with NULL channel_id surface a one-time PickChannelModal on first reopen
-- (Wave 6 spec).

-- Mode backfill from legacy pipeline_state_json + auto_advance.
-- 'overview' is never auto-assigned; users opt in via mid-flow toggle.
update projects set mode = case
  when pipeline_state_json->>'mode' = 'auto'                    then 'supervised'
  when auto_advance = true and pipeline_state_json is not null  then 'supervised'
  when pipeline_state_json is not null                          then 'step-by-step'
  else null
end;
