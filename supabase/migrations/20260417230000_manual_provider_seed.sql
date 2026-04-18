-- Seed the Manual provider so it appears alongside gemini/openai/anthropic/ollama
-- in any admin UI that lists ai_provider_configs. The row has no real secret;
-- the router does not read this table yet — see
-- docs/superpowers/specs/2026-04-17-manual-provider-design.md.

insert into public.ai_provider_configs (provider, api_key, is_active, config_json)
values ('manual', '__manual__', true, '{"description":"Human-in-the-loop provider — emits prompt to Axiom, waits for pasted output"}')
on conflict do nothing;
