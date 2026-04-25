-- Grant base SELECT to the authenticated role on managers tables.
-- Without this grant, RLS policies don't even get evaluated — Postgres
-- blocks the query at the GRANT layer with `42501 permission denied`.
-- The managers_select_own RLS policy then narrows the rows returned.

GRANT SELECT ON public.managers TO authenticated;
GRANT SELECT ON public.managers_audit_log TO authenticated;
