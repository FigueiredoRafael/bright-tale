/**
 * Admin panel URL slug — configurable via NEXT_PUBLIC_ADMIN_SLUG.
 * Falls back to "admin" when not set.
 *
 * The filesystem routes live under /zadmin (internal, never exposed).
 * next.config.ts rewrites /${slug}/* → /zadmin/* so the public URL is
 * whatever NEXT_PUBLIC_ADMIN_SLUG resolves to.
 */
const ADMIN_SLUG = process.env.NEXT_PUBLIC_ADMIN_SLUG || 'admin';

/** Internal filesystem prefix — kept constant so rewrites always land. */
export const ADMIN_INTERNAL = '/zadmin';

/** Build a public-facing admin URL. `adminPath('/login')` → `/${slug}/login` */
export function adminPath(sub = '') {
  return `/${ADMIN_SLUG}${sub}`;
}

/** Build a public-facing admin API URL. `adminApi('/users/123')` → `/api/${slug}/users/123` */
export function adminApi(sub = '') {
  return `/api/${ADMIN_SLUG}${sub}`;
}

/** The raw slug value (no leading slash). */
export { ADMIN_SLUG };
