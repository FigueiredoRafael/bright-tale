-- M-006/M-008 extension: user rating + closure system messages.

ALTER TABLE public.support_threads
  ADD COLUMN IF NOT EXISTS user_rating  integer  CHECK (user_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS rating_comment text,
  ADD COLUMN IF NOT EXISTS rated_at      timestamptz;
