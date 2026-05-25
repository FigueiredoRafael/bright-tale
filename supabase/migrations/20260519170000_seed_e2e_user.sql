-- Idempotently seed the dev e2e user matching apps/app/.env.local:E2E_USER_ID.
-- This UUID is referenced by playwright live specs and must exist in auth.users
-- for org_memberships FK to validate when the wizard creates the first channel.
-- The user is never expected to log in (NEXT_PUBLIC_E2E bypass injects user_id
-- directly in proxy.ts) — encrypted_password is a placeholder bcrypt-shaped
-- string so the NOT NULL constraint passes without depending on pgcrypto.

DO $$
DECLARE
  v_user_id uuid := '5feae97f-86a5-4996-96c1-fc2ed459fa7f';
  v_email text := 'e2e@bright-tale.test';
  v_inserted int;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, reauthentication_token,
    is_super_admin, is_sso_user, is_anonymous
  )
  VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    v_email,
    '$2a$10$abcdefghijklmnopqrstuvCmqkRb4FzWGtBuTUuhP1eJG.YxN7p7m6',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"e2e":true}'::jsonb,
    now(),
    now(),
    '', '', '', '', '',
    false, false, false
  )
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE '[seed-e2e-user] auth.users inserted=% for id=%', v_inserted, v_user_id;

  -- Best-effort user_profile row so ensureOrgId can upsert without surprises.
  INSERT INTO public.user_profiles (id, email)
  VALUES (v_user_id, v_email)
  ON CONFLICT (id) DO NOTHING;
END $$;
