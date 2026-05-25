-- Fix Supabase Realtime walrus RLS evaluation: anon role needs SELECT on tables
-- referenced in RLS policies of published tables. Without GRANT, the policy
-- evaluation crashes with aclcheck_error (insufficient_privilege) and aborts the
-- entire pooling replication connection, killing postgres_changes for all subscribers.
-- RLS itself ensures anon users can never read any actual rows.
GRANT SELECT ON public.managers TO anon;
