-- =============================================================================
-- PROPOSED MIGRATION — DO NOT APPLY AS-IS
-- =============================================================================
-- Location after review:  supabase/migrations/20260424130000_managers_table.sql
--
-- Reviewer checklist before `cp` → migrations/:
--   [ ] Timestamp is newer than the newest applied migration
--   [ ] `npm run db:push:dev` succeeds on a throwaway branch first
--   [ ] `npm run db:types` regenerates cleanly
--   [ ] Backfill of existing user_roles admins runs end-to-end
--   [ ] isAdminUser() updated to query the new table (apps/web/src/lib/admin-check.ts)
--   [ ] ADMIN-PROVISIONING.md updated with the new flow
-- =============================================================================
-- Managers table — separates platform operators from customer users
-- =============================================================================
-- WHY: the prior `user_roles` table only marked "is this user an admin?"
-- with a single string column. That mixed concerns and scaled poorly:
--   • no metadata about who invited whom, when, what level of access
--   • no fine-grained role (support read-only vs full admin vs billing-only)
--   • no audit trail of role changes
--   • impossible to render a clean /admin/managers view without joining
--     auth.users and guessing display_name
--
-- This migration introduces a proper `managers` table that lives
-- alongside `auth.users` (doesn't replace Supabase auth — the person
-- still logs in via normal auth.users credentials). The `managers`
-- row flags "this auth.users is also a platform operator" and carries
-- the extra metadata useful for organizational management.
--
-- `user_roles` is kept for backwards compat during the transition.
-- `isAdminUser()` reads managers first, falls back to user_roles.
-- After 2 sprints of stability, a follow-up migration drops user_roles.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Enum for role gradation
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.manager_role AS ENUM (
    'owner',      -- founder / root account — can't be demoted via UI
    'admin',      -- full admin access, can manage other managers (except owners)
    'support',    -- read customer data + trigger password reset / user support actions
    'billing',    -- read + manage billing, payouts, affiliate approvals
    'readonly'    -- view-only access to admin area, no mutations
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- 2. Managers table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.managers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role            public.manager_role NOT NULL DEFAULT 'admin',

  -- Display / gestão metadata
  display_name    TEXT,
  title           TEXT,         -- e.g., "Co-founder", "Support Lead", "CFO"
  department      TEXT,         -- e.g., "Engineering", "Support", "Finance"
  notes           TEXT,         -- free-form admin notes

  -- Provisioning trace
  invited_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Activity tracking
  last_login_at   TIMESTAMPTZ,

  -- Lifecycle (soft-delete via is_active)
  is_active       BOOLEAN NOT NULL DEFAULT true,
  deactivated_at  TIMESTAMPTZ,
  deactivated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deactivation_reason TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Invariants
  CONSTRAINT deactivated_when_inactive CHECK (
    (is_active = true AND deactivated_at IS NULL) OR
    (is_active = false AND deactivated_at IS NOT NULL)
  )
);

-- -----------------------------------------------------------------------------
-- 3. Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS managers_role_idx ON public.managers (role) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS managers_user_id_idx ON public.managers (user_id);
CREATE INDEX IF NOT EXISTS managers_invited_at_idx ON public.managers (invited_at DESC);

-- -----------------------------------------------------------------------------
-- 4. updated_at trigger
-- -----------------------------------------------------------------------------
CREATE TRIGGER managers_updated_at
  BEFORE UPDATE ON public.managers
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- -----------------------------------------------------------------------------
-- 5. RLS deny-all (service_role is the only writer)
-- -----------------------------------------------------------------------------
ALTER TABLE public.managers ENABLE ROW LEVEL SECURITY;
-- No policies = deny-all for authenticated / anon. service_role bypasses RLS.

REVOKE ALL ON public.managers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.managers TO service_role;

-- -----------------------------------------------------------------------------
-- 6. Audit log — append-only trail of every managers row change
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.managers_audit_event AS ENUM (
    'invited',
    'role_changed',
    'metadata_changed',  -- display_name / title / department / notes
    'deactivated',
    'reactivated',
    'removed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.managers_audit_log (
  id              BIGSERIAL PRIMARY KEY,
  manager_id      UUID REFERENCES public.managers(id) ON DELETE SET NULL,
  target_user_id  UUID NOT NULL,        -- the auth.users.id being changed
  actor_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event           public.managers_audit_event NOT NULL,
  old_role        public.manager_role,
  new_role        public.manager_role,
  ip_hash         BYTEA,                -- SHA-256 of source IP
  ua_hash         BYTEA,                -- SHA-256 of User-Agent
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT metadata_no_secrets CHECK (
    NOT (metadata::text ILIKE '%"password":%'
      OR metadata::text ILIKE '%"secret":%'
      OR metadata::text ILIKE '%"token":%')
  )
);

CREATE INDEX IF NOT EXISTS managers_audit_target_idx
  ON public.managers_audit_log (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS managers_audit_event_idx
  ON public.managers_audit_log (event, created_at DESC);

-- Append-only: reject UPDATE and DELETE
CREATE OR REPLACE FUNCTION public.managers_audit_log_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'managers_audit_log is append-only';
END $$;

CREATE TRIGGER managers_audit_no_update
  BEFORE UPDATE ON public.managers_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.managers_audit_log_immutable();
CREATE TRIGGER managers_audit_no_delete
  BEFORE DELETE ON public.managers_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.managers_audit_log_immutable();

ALTER TABLE public.managers_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.managers_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.managers_audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.managers_audit_log_id_seq TO service_role;

-- -----------------------------------------------------------------------------
-- 7. Trigger: every insert / update / delete on managers writes an audit row
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.managers_emit_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  event_type public.managers_audit_event;
  meta JSONB := '{}'::jsonb;
  actor_uid UUID;
BEGIN
  -- Server Actions set 'app.audit_actor' to the calling admin's UUID via
  -- set_config('app.audit_actor', '<uuid>', true) in the same transaction.
  -- SQL run directly (migrations, dashboard) leaves it NULL — fine, shows
  -- up in audit as "system action" which is the accurate label.
  BEGIN
    actor_uid := nullif(current_setting('app.audit_actor', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    actor_uid := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    event_type := 'invited';
    meta := jsonb_build_object(
      'display_name', NEW.display_name,
      'title',        NEW.title,
      'department',   NEW.department
    );
    INSERT INTO public.managers_audit_log
      (manager_id, target_user_id, actor_user_id, event, new_role, metadata)
    VALUES (NEW.id, NEW.user_id, actor_uid, event_type, NEW.role, meta);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      INSERT INTO public.managers_audit_log
        (manager_id, target_user_id, actor_user_id, event, old_role, new_role)
      VALUES (NEW.id, NEW.user_id, actor_uid, 'role_changed', OLD.role, NEW.role);
    END IF;
    IF OLD.is_active = true AND NEW.is_active = false THEN
      INSERT INTO public.managers_audit_log
        (manager_id, target_user_id, actor_user_id, event, metadata)
      VALUES (
        NEW.id, NEW.user_id, actor_uid, 'deactivated',
        jsonb_build_object('reason', NEW.deactivation_reason)
      );
    ELSIF OLD.is_active = false AND NEW.is_active = true THEN
      INSERT INTO public.managers_audit_log
        (manager_id, target_user_id, actor_user_id, event)
      VALUES (NEW.id, NEW.user_id, actor_uid, 'reactivated');
    END IF;
    IF (OLD.display_name IS DISTINCT FROM NEW.display_name)
       OR (OLD.title IS DISTINCT FROM NEW.title)
       OR (OLD.department IS DISTINCT FROM NEW.department)
       OR (OLD.notes IS DISTINCT FROM NEW.notes) THEN
      INSERT INTO public.managers_audit_log
        (manager_id, target_user_id, actor_user_id, event, metadata)
      VALUES (
        NEW.id, NEW.user_id, actor_uid, 'metadata_changed',
        jsonb_build_object(
          'old_display_name', OLD.display_name, 'new_display_name', NEW.display_name,
          'old_title',        OLD.title,        'new_title',        NEW.title,
          'old_department',   OLD.department,   'new_department',   NEW.department
        )
      );
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.managers_audit_log
      (manager_id, target_user_id, actor_user_id, event, old_role)
    VALUES (OLD.id, OLD.user_id, actor_uid, 'removed', OLD.role);
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER managers_audit_insert
  AFTER INSERT ON public.managers
  FOR EACH ROW EXECUTE FUNCTION public.managers_emit_audit();
CREATE TRIGGER managers_audit_update
  AFTER UPDATE ON public.managers
  FOR EACH ROW EXECUTE FUNCTION public.managers_emit_audit();
CREATE TRIGGER managers_audit_delete
  AFTER DELETE ON public.managers
  FOR EACH ROW EXECUTE FUNCTION public.managers_emit_audit();

-- -----------------------------------------------------------------------------
-- 8. Backfill — migrate existing user_roles='admin' rows into managers
-- -----------------------------------------------------------------------------
INSERT INTO public.managers (user_id, role, title, invited_at, display_name)
SELECT
  ur.user_id,
  'admin'::public.manager_role,
  'Admin (migrated)',
  now(),
  (SELECT email FROM auth.users WHERE id = ur.user_id)
FROM public.user_roles ur
WHERE ur.role = 'admin'
ON CONFLICT (user_id) DO NOTHING;

-- Mark the migrated rows so audit is clear
UPDATE public.managers
   SET notes = 'Migrated from user_roles on ' || now()::text
 WHERE notes IS NULL AND title = 'Admin (migrated)';

-- -----------------------------------------------------------------------------
-- 9. Comments for future auditors
-- -----------------------------------------------------------------------------
COMMENT ON TABLE  public.managers IS
  'Platform operators (admins, support, billing). 1:1 with auth.users for people who have admin-area access. RLS deny-all; service_role writes only.';
COMMENT ON COLUMN public.managers.role IS
  'Gradation of admin privilege. owner > admin > billing/support > readonly.';
COMMENT ON TABLE  public.managers_audit_log IS
  'Append-only audit trail for every manager lifecycle event. Never UPDATE or DELETE.';

COMMIT;
