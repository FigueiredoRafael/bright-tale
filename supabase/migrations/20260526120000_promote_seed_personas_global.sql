-- Promote the three seeded personas to visibility=global so every org sees them
-- in the canonical/draft picker. Without this, fresh orgs see zero personas
-- (the 20260423000200 seed predates the 20260518050000 org_id+visibility
-- migration; backfill assigned them to the first org with default private).

UPDATE public.personas
SET visibility = 'global'
WHERE slug IN ('cole-merritt', 'alex-strand', 'casey-park');
