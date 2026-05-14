create table autopilot_templates (
  id              text primary key default gen_random_uuid()::text,
  user_id         uuid not null references auth.users(id) on delete cascade,
  channel_id      uuid references channels(id) on delete cascade,
  name            text not null,
  config_json     jsonb not null,
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_autopilot_templates_user_channel
  on autopilot_templates(user_id, channel_id);

create unique index idx_autopilot_templates_one_channel_default
  on autopilot_templates(user_id, channel_id)
  where is_default = true and channel_id is not null;

create unique index idx_autopilot_templates_one_global_default
  on autopilot_templates(user_id)
  where is_default = true and channel_id is null;

create trigger handle_updated_at before update on autopilot_templates
  for each row execute function moddatetime(updated_at);

alter table autopilot_templates enable row level security;

create or replace function clear_autopilot_default(p_user_id uuid, p_channel_id uuid)
returns void language sql as $$
  update autopilot_templates
     set is_default = false
   where user_id = p_user_id
     and channel_id is not distinct from p_channel_id
     and is_default = true;
$$;
