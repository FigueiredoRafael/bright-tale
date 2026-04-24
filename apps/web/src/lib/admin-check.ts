/**
 * Admin access check — consults `public.managers` first, falls back to
 * the legacy `public.user_roles` table during transition.
 *
 * Roles that grant admin-area access:
 *   owner, admin, support, billing, readonly
 * (Route-level guards should check the specific role for mutation
 *  permissions; this function only checks "is this person a manager?")
 *
 * Migration note: after managers table is live and backfilled, every
 * `user_roles` admin gets a matching `managers` row by the SQL in
 * 20260424130000_managers_table.sql. The fallback query below is a
 * safety net for the short transition window — remove it once the
 * managers table has been the sole source for ≥1 full sprint.
 */

export type ManagerRole = 'owner' | 'admin' | 'support' | 'billing' | 'readonly';

const MANAGER_ROLES: ReadonlySet<ManagerRole> = new Set([
  'owner',
  'admin',
  'support',
  'billing',
  'readonly',
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isAdminUser(supabase: any, userId: string): Promise<boolean> {
  // Preferred path — `managers` table (active rows only)
  const { data: manager } = await supabase
    .from('managers')
    .select('role, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (manager && MANAGER_ROLES.has(manager.role as ManagerRole)) {
    return true;
  }

  // Legacy fallback — `user_roles`. Kept until migration 20260424130000
  // has been live for ≥1 sprint and every admin has a managers row.
  const { data: legacy } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();

  return legacy?.role === 'admin';
}

/**
 * Returns the manager's full record (or null) — useful when the caller
 * needs the role / metadata, not just a boolean. Does NOT fall back to
 * user_roles (that table has no metadata to return).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getManager(supabase: any, userId: string): Promise<{
  id: string;
  role: ManagerRole;
  display_name: string | null;
  title: string | null;
  department: string | null;
  last_login_at: string | null;
  is_active: boolean;
} | null> {
  const { data } = await supabase
    .from('managers')
    .select('id, role, display_name, title, department, last_login_at, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  return data ?? null;
}

/** Role helpers for fine-grained UI gating. */
export function canMutateData(role: ManagerRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'support' || role === 'billing';
}
export function canManageOtherManagers(role: ManagerRole): boolean {
  return role === 'owner' || role === 'admin';
}
export function canViewBilling(role: ManagerRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'billing';
}
