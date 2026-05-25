-- Idempotently seed the dev e2e user matching apps/app/.env.local:E2E_USER_ID.
-- This UUID is referenced by playwright live specs (full-pipeline-real-ai.spec.ts,
-- live-autopilot.spec.ts) and must exist in auth.users for org_memberships FK
-- to validate when the wizard creates the first channel.
--
-- NOTE: This initial migration depended on pgcrypto's crypt()/gen_salt() and
-- may have applied as a no-op (silent WHERE NOT EXISTS skip with 0 rows) in
-- some environments. The follow-up migration 20260519170000_seed_e2e_user.sql
-- uses a constant bcrypt-shaped placeholder password + DO block with RAISE
-- NOTICE so the row is reliably present.

INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  reauthentication_token,
  is_super_admin,
  is_sso_user,
  is_anonymous
)
SELECT
  '5feae97f-86a5-4996-96c1-fc2ed459fa7f'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'e2e@bright-tale.test',
  crypt('e2e-no-login', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"e2e":true}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  '',
  '',
  false,
  false,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE id = '5feae97f-86a5-4996-96c1-fc2ed459fa7f'::uuid
)
  AND NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'e2e@bright-tale.test'
);
