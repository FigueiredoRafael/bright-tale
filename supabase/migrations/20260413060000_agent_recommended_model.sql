-- Per-agent recommended provider/model.
-- The pipeline router can use these as the preferred route per stage instead
-- of the global ROUTE_TABLE.

alter table public.agent_prompts
  add column recommended_provider text,
  add column recommended_model text;
