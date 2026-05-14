ALTER TABLE public.credit_settings
  ADD COLUMN IF NOT EXISTS cost_research_surface INT NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS cost_research_medium  INT NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS cost_research_deep    INT NOT NULL DEFAULT 180;

-- Explicit backfill for any rows that existed before this migration. The NOT NULL
-- DEFAULT above handles new rows and Postgres *should* backfill existing rows,
-- but this statement is idempotent and costs nothing — it guarantees no row is
-- left with a null research cost even if the ALTER is ever split or retried.
UPDATE public.credit_settings
SET cost_research_surface = COALESCE(cost_research_surface, 60),
    cost_research_medium  = COALESCE(cost_research_medium, 100),
    cost_research_deep    = COALESCE(cost_research_deep, 180)
WHERE cost_research_surface IS NULL
   OR cost_research_medium  IS NULL
   OR cost_research_deep    IS NULL;
