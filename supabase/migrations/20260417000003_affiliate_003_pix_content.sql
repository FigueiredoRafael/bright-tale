-- affiliate@0.2.0 — Migration 003: PIX keys and content submissions

CREATE TABLE IF NOT EXISTS public.affiliate_pix_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  key_type VARCHAR(10) NOT NULL
    CHECK (key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')),
  key_value TEXT NOT NULL,
  key_display TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  label TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_pix_keys_affiliate_id ON public.affiliate_pix_keys (affiliate_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_pix_keys_unique_default ON public.affiliate_pix_keys (affiliate_id) WHERE (is_default = TRUE);

CREATE TABLE IF NOT EXISTS public.affiliate_content_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  platform TEXT NOT NULL
    CHECK (platform IN ('youtube', 'instagram', 'tiktok', 'twitter', 'linkedin', 'blog', 'other')),
  content_type TEXT NOT NULL
    CHECK (content_type IN ('video', 'reel', 'story', 'post', 'article', 'other')),
  url TEXT NOT NULL,
  title TEXT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  review_notes TEXT DEFAULT NULL,
  posted_at DATE DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_submissions_affiliate ON public.affiliate_content_submissions (affiliate_id);
CREATE INDEX IF NOT EXISTS idx_content_submissions_status ON public.affiliate_content_submissions (status);
