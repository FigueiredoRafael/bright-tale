alter table projects
  add column mode                    text,
  add column autopilot_config_json   jsonb,
  add column autopilot_template_id   text references autopilot_templates(id) on delete set null,
  add column abort_requested_at      timestamptz;

-- Mode backfill from legacy pipeline_state_json + auto_advance.
-- 'overview' is never auto-assigned; users opt in via mid-flow toggle.
update projects set mode = case
  when pipeline_state_json->>'mode' = 'auto'                    then 'supervised'
  when auto_advance = true and pipeline_state_json is not null  then 'supervised'
  when pipeline_state_json is not null                          then 'step-by-step'
  else null
end;
