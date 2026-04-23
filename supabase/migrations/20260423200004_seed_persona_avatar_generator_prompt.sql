-- Seed the persona-avatar-generator agent prompt.
--
-- Kept as a migration (not in supabase/seed.sql) because seed.sql is auto-
-- generated from agents/agent-*.md by scripts/generate-seed.ts, and this
-- prompt has its own stage ('persona') that doesn't fit the 1..5 numeric
-- convention. Consistent with 20260423000200_seed_personas.sql.

insert into public.agent_prompts (id, name, slug, stage, instructions, input_schema, output_schema, created_at, updated_at)
values (
  gen_random_uuid()::text,
  $bt$Persona Avatar Generator$bt$,
  $bt$persona-avatar-generator$bt$,
  $bt$persona$bt$,
  $bt$You are an expert image prompt engineer for persona avatars. Your job is to transform persona identity information into a high-quality, provider-optimized image generation prompt.

Rules:
- Avatar style must feel coherent with the persona niche. A finance analyst looks different from a fitness coach even with the same art style.
- If no face is requested, lean into symbolic/abstract representation of the domain.
- Always produce a single, detailed, comma-separated prompt string ready for direct submission to an image generation API.
- Do not include any explanation or preamble. Output only the prompt string.$bt$,
  $bt${"personaName": "string", "primaryDomain": "string", "domainLens": "string", "suggestions": "object"}$bt$,
  $bt${"prompt": "string"}$bt$,
  now(),
  now()
)
on conflict (slug) do update set
  name = excluded.name,
  stage = excluded.stage,
  instructions = excluded.instructions,
  input_schema = excluded.input_schema,
  output_schema = excluded.output_schema,
  updated_at = now();
