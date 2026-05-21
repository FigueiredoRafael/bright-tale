-- User locale preference + bilingual notification templates.
--
-- 1. user_profiles.locale — stores the user's preferred display language.
-- 2. notification_template_translations — per-locale overrides for automated
--    notification templates. notify() fetches (type, locale) with pt-BR fallback.

-- ─── 1. user_profiles: add locale column ────────────────────────────────────
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'pt-BR';

-- ─── 2. notification_template_translations ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_template_translations (
  type               text        NOT NULL REFERENCES public.notification_templates(type) ON DELETE CASCADE,
  locale             text        NOT NULL,
  title_template     text        NOT NULL,
  body_template      text,
  PRIMARY KEY (type, locale)
);

ALTER TABLE public.notification_template_translations ENABLE ROW LEVEL SECURITY;
-- Service-role only — same as notification_templates.

CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.notification_template_translations
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- Add updated_at so the trigger above can reference it
ALTER TABLE public.notification_template_translations
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ─── 3. English translations seed ────────────────────────────────────────────
INSERT INTO public.notification_template_translations (type, locale, title_template, body_template)
VALUES
  ('donation_received',          'en', 'You received {amount} tokens!',                'Reason: {reason}'),
  ('donation_pending_approval',  'en', 'Pending approval: {amount} tokens for {recipientName}', 'Reason: {reason}'),
  ('tokens_reset',               'en', 'Your tokens have been reset',                  'Your usage credits were reset. Contact us if you have questions.'),
  ('plan_low',                   'en', 'You have used {percent}% of your plan',        'Your tokens are running low. Consider upgrading to keep creating content.'),
  ('plan_renewed',               'en', 'Plan {planName} renewed successfully!',        'Your tokens have been recharged. Let''s create!'),
  ('job_done',                   'en', '{jobName} completed!',                         'Your content is ready for review.'),
  ('announcement',               'en', '{title}',                                      '{body}'),
  ('coupon_redeemed',            'en', 'Coupon {couponCode} applied!',                 '{amount} tokens added to your account.'),
  ('security',                   'en', 'Security alert on your account',               '{action}')
ON CONFLICT (type, locale) DO NOTHING;
