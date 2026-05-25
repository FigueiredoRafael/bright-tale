-- Diagnostic migration kept as a no-op for history alignment.
-- Original ran `SELECT count(*) FROM auth.users WHERE id = '5feae97f-...'::uuid`
-- to confirm the e2e user presence; superseded by 20260519170000_seed_e2e_user.sql.
SELECT 1;
