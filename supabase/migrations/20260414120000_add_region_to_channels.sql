-- Add region field for cultural adaptation in AI agents.
-- Distinct from market (business target) — region drives cultural references,
-- humor style, idioms, examples, and local context in generated content.
alter table public.channels
  add column region text not null default 'br';

comment on column public.channels.region is
  'Cultural region for AI content adaptation: br, us, eu, latam, uk, global';
