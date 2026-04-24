-- =============================================================================
-- PROPOSED MIGRATION — DO NOT APPLY AS-IS
-- =============================================================================
-- Location after review:  supabase/migrations/20260423120000_mfa_enrolment.sql
--
-- Reviewer checklist before `cp` → migrations/:
--   [ ] Timestamp is in the future of the newest applied migration.
--   [ ] `npm run db:push:dev` succeeds on a throwaway branch first.
--   [ ] `npm run db:types` regenerates cleanly.
--   [ ] apps/api recovery-code issuer is implemented with Argon2id before
--       anyone tries to enrol MFA — otherwise you'll have rows with NULL
--       hashes and a lie on the table.
-- =============================================================================
-- MFA enrolment support — recovery codes + audit log + AAL2 helper
-- =============================================================================
-- Supabase Auth ships TOTP MFA natively in `auth.mfa_factors` / `auth.mfa_challenges`.
-- This migration adds:
--   1. user_mfa_recovery_codes  — one-shot recovery codes (Argon2id-hashed in app)
--   2. user_mfa_audit_log       — append-only audit of every MFA event
--   3. public.require_aal2()    — helper to gate sensitive RPCs (if/when used)
--
-- Security invariants enforced:
--   • RLS on both tables, deny-all — only service_role can read/write.
--   • Recovery code rows are append-only: a BEFORE UPDATE trigger rejects any
--     column change except `consumed_at` (one-shot). No one updates the hash.
--   • Audit log is strictly append-only: BEFORE UPDATE / BEFORE DELETE triggers
--     reject everything. Forensics require an untampered trail.
--   • `code_hash` stored as BYTEA — never TEXT, never with a matchable format.
--   • IP + User-Agent stored as BYTEA SHA-256 fingerprints, not raw strings.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Recovery codes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_mfa_recovery_codes (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Argon2id hash computed in apps/api (m=64MiB, t=3, p=4). Stored as raw
  -- bytes; the serializer format is whichever `argon2.hash()` emits.
  code_hash    BYTEA NOT NULL,

  -- Single-use: set the moment the user redeems the code.
  consumed_at  TIMESTAMPTZ,

  -- If the user regenerates the code set, the old ones are soft-revoked.
  revoked_at   TIMESTAMPTZ,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Defense in depth: never allow the same hash twice in the same user scope.
  CONSTRAINT user_mfa_recovery_codes_hash_uniq UNIQUE (user_id, code_hash)
);

CREATE INDEX IF NOT EXISTS user_mfa_recovery_codes_user_id_idx
  ON public.user_mfa_recovery_codes (user_id)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE TRIGGER user_mfa_recovery_codes_updated_at
  BEFORE UPDATE ON public.user_mfa_recovery_codes
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- Append-mostly invariant: only `consumed_at` and `revoked_at` may transition
-- from NULL to a non-NULL timestamp. Everything else is locked after insert.
CREATE OR REPLACE FUNCTION public.user_mfa_recovery_codes_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.id <> NEW.id THEN RAISE EXCEPTION 'id is immutable'; END IF;
  IF OLD.user_id <> NEW.user_id THEN RAISE EXCEPTION 'user_id is immutable'; END IF;
  IF OLD.code_hash <> NEW.code_hash THEN RAISE EXCEPTION 'code_hash is immutable'; END IF;
  IF OLD.created_at <> NEW.created_at THEN RAISE EXCEPTION 'created_at is immutable'; END IF;

  IF OLD.consumed_at IS NOT NULL AND OLD.consumed_at <> NEW.consumed_at THEN
    RAISE EXCEPTION 'consumed_at is set once';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND OLD.revoked_at <> NEW.revoked_at THEN
    RAISE EXCEPTION 'revoked_at is set once';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER user_mfa_recovery_codes_guard_trg
  BEFORE UPDATE ON public.user_mfa_recovery_codes
  FOR EACH ROW EXECUTE FUNCTION public.user_mfa_recovery_codes_guard();

ALTER TABLE public.user_mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
-- Deny-all: no policy = no access. service_role bypasses RLS.

-- -----------------------------------------------------------------------------
-- 2. Audit log — append-only
-- -----------------------------------------------------------------------------
CREATE TYPE public.mfa_audit_event AS ENUM (
  'factor_enrolled',
  'factor_verified',
  'factor_revoked',
  'challenge_issued',
  'challenge_succeeded',
  'challenge_failed',
  'recovery_code_generated',
  'recovery_code_consumed',
  'recovery_code_revoked',
  'session_aal_downgrade'
);

CREATE TABLE IF NOT EXISTS public.user_mfa_audit_log (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event        public.mfa_audit_event NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- SHA-256 of the IP and User-Agent, not the raw values.
  ip_hash      BYTEA,
  ua_hash      BYTEA,

  -- Free-form JSON for per-event detail: factor_id, challenge_id, error
  -- category (never the TOTP code itself, never the recovery code).
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT metadata_no_secrets CHECK (
    NOT (metadata::text ILIKE '%"code":%' OR
         metadata::text ILIKE '%"secret":%' OR
         metadata::text ILIKE '%"password":%' OR
         metadata::text ILIKE '%"recovery_code":%')
  )
);

CREATE INDEX IF NOT EXISTS user_mfa_audit_log_user_id_created_at_idx
  ON public.user_mfa_audit_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_mfa_audit_log_event_created_at_idx
  ON public.user_mfa_audit_log (event, created_at DESC);

-- Append-only: block UPDATE and DELETE hard, even from service_role.
CREATE OR REPLACE FUNCTION public.user_mfa_audit_log_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'user_mfa_audit_log is append-only';
END $$;

CREATE TRIGGER user_mfa_audit_log_no_update
  BEFORE UPDATE ON public.user_mfa_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.user_mfa_audit_log_immutable();

CREATE TRIGGER user_mfa_audit_log_no_delete
  BEFORE DELETE ON public.user_mfa_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.user_mfa_audit_log_immutable();

ALTER TABLE public.user_mfa_audit_log ENABLE ROW LEVEL SECURITY;
-- Deny-all; service_role reads/writes only.

-- -----------------------------------------------------------------------------
-- 3. AAL2 helper — verify the current JWT claims carry an AAL2 session
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_aal()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal',
    'aal1'
  );
$$;

CREATE OR REPLACE FUNCTION public.require_aal2()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.current_aal() IS DISTINCT FROM 'aal2' THEN
    RAISE EXCEPTION 'MFA required for this operation (aal2 expected, got %)', public.current_aal()
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Permissions — lock it down
-- -----------------------------------------------------------------------------
REVOKE ALL ON public.user_mfa_recovery_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.user_mfa_audit_log      FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.user_mfa_recovery_codes TO service_role;
GRANT SELECT, INSERT          ON public.user_mfa_audit_log      TO service_role;
GRANT USAGE, SELECT           ON SEQUENCE public.user_mfa_audit_log_id_seq TO service_role;

GRANT EXECUTE ON FUNCTION public.current_aal()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.require_aal2()   TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Comments — machine-readable intent for future auditors
-- -----------------------------------------------------------------------------
COMMENT ON TABLE  public.user_mfa_recovery_codes IS
  'MFA recovery codes. Hashes computed in apps/api with Argon2id. Single-use. RLS deny-all.';
COMMENT ON COLUMN public.user_mfa_recovery_codes.code_hash IS
  'Argon2id(m=64MiB,t=3,p=4) hash bytes. Never the raw code.';
COMMENT ON TABLE  public.user_mfa_audit_log IS
  'Append-only audit of every MFA lifecycle event. Never UPDATE or DELETE.';
COMMENT ON FUNCTION public.require_aal2() IS
  'Raise insufficient_privilege if the current session is not AAL2 (MFA verified).';
