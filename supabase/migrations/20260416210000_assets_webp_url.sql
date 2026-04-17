-- Add webp_url column to assets table for optimized image delivery.
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS webp_url text;
