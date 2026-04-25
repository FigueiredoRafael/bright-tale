/**
 * Admin access check — queries `public.managers` (active rows only).
 * Roles that grant admin-area access: owner, admin, support, billing, readonly.
 * Route-level guards should check the specific role for mutation permissions.
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
  const { data: manager } = await supabase
    .from('managers')
    .select('role, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  return manager != null && MANAGER_ROLES.has(manager.role as ManagerRole);
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
