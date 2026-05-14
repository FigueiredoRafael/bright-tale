-- M-001: plan_configs + system_settings tables

CREATE TABLE IF NOT EXISTS public.plan_configs (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id                       text        NOT NULL UNIQUE,
  display_name                  text        NOT NULL,
  credits                       integer     NOT NULL DEFAULT 0,
  price_usd_monthly_cents       integer     NOT NULL DEFAULT 0,
  price_usd_annual_cents        integer     NOT NULL DEFAULT 0,
  display_price_brl_monthly     integer     NOT NULL DEFAULT 0,
  display_price_brl_annual      integer     NOT NULL DEFAULT 0,
  features_json                 jsonb       NOT NULL DEFAULT '[]',
  stripe_price_id_monthly_test  text,
  stripe_price_id_annual_test   text,
  stripe_price_id_monthly_live  text,
  stripe_price_id_annual_live   text,
  is_active                     boolean     NOT NULL DEFAULT true,
  sort_order                    integer     NOT NULL DEFAULT 0,
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  created_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_settings (
  key        text        PRIMARY KEY,
  value      text        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.plan_configs
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

ALTER TABLE public.plan_configs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.plan_configs    TO authenticated, anon;
GRANT SELECT ON public.system_settings TO authenticated, anon;

CREATE POLICY "plan_configs_public_read"    ON public.plan_configs    FOR SELECT USING (true);
CREATE POLICY "system_settings_public_read" ON public.system_settings FOR SELECT USING (true);

INSERT INTO public.plan_configs
  (plan_id, display_name, credits, price_usd_monthly_cents, price_usd_annual_cents,
   display_price_brl_monthly, display_price_brl_annual, features_json,
   stripe_price_id_monthly_test, stripe_price_id_annual_test, sort_order)
VALUES
  ('free', 'Free', 1000, 0, 0, 0, 0,
   '["AI Brainstorming","Blog post + video script","Research agent","1 WordPress site","Image generation","Standard models only"]',
   null, null, 0),
  ('starter', 'Starter', 5000, 900, 700, 4900, 3900,
   '["Audio narration (TTS)","Deep research with sources","Shorts + podcast scripts","YouTube Intelligence (basic)","3 WordPress sites","Bulk generation (up to 3)"]',
   'price_1TWxZHId9XjD5HHlzDoR5X1a', 'price_1TWxZHId9XjD5HHl5GzilQaS', 1),
  ('creator', 'Creator', 15000, 2900, 2300, 14900, 11900,
   '["Dark channel video generation","YouTube Intelligence (full)","Premium models (Claude Sonnet/Opus)","Voice cloning","Express mode (1-click)","Custom endpoints (3)","YouTube publishing"]',
   'price_1TWxbYId9XjD5HHlBTuAqD27', 'price_1TWxb8Id9XjD5HHl16Y3A74p', 2),
  ('pro', 'Pro', 50000, 9900, 7900, 49900, 39900,
   '["AI video clips (Runway/Kling)","Team collaboration (3 seats)","Custom AI prompts","Unlimited WordPress sites","API access + webhooks","Multi-brand kits","Analytics avançado"]',
   'price_1TWxd1Id9XjD5HHlsF77eWT9', 'price_1TWxcbId9XjD5HHlP7SK2bLu', 3)
ON CONFLICT (plan_id) DO NOTHING;

INSERT INTO public.system_settings (key, value) VALUES ('stripe_mode', 'test')
ON CONFLICT (key) DO NOTHING;
