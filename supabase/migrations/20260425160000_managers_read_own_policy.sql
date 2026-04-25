-- Allow an authenticated user to SELECT their own managers row.
-- The middleware uses the anon/authenticated Supabase client to call
-- isAdminUser(); without this policy the deny-all RLS blocks the check
-- and every admin gets redirected to unauthorized even with valid credentials.
-- service_role retains full access (bypasses RLS).

CREATE POLICY "managers_select_own"
  ON public.managers
  FOR SELECT
  USING (auth.uid() = user_id);

-- Also allow authenticated users to read their own audit log entries.
CREATE POLICY "managers_audit_select_own"
  ON public.managers_audit_log
  FOR SELECT
  USING (auth.uid() = target_user_id);
