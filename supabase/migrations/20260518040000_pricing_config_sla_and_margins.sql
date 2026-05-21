-- Extend pricing_config with support SLAs + finance margin thresholds.
-- Stored as JSONB so the UI can add/remove tiers without schema changes.

ALTER TABLE public.pricing_config
  ADD COLUMN IF NOT EXISTS support_sla_json  jsonb NOT NULL DEFAULT
    '{"p0_mins":15,"p1_mins":120,"p2_mins":480,"p3_mins":1440}'::jsonb,
  ADD COLUMN IF NOT EXISTS margin_thresholds_json jsonb NOT NULL DEFAULT
    '{"green_pct":40,"yellow_pct":20}'::jsonb;

COMMENT ON COLUMN public.pricing_config.support_sla_json IS
  'M-008: SLA minutes per priority level (p0..p3). Editable in admin settings.';
COMMENT ON COLUMN public.pricing_config.margin_thresholds_json IS
  'M-015: margin % thresholds for finance dashboard traffic lights.';
