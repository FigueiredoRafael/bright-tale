import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// 'sb-admin' isolates the admin session cookie from the user app (which uses
// the default 'sb-{projectRef}' prefix). Works on localhost (shared domain
// across ports) and in production (different subdomains).
const ADMIN_COOKIE_PREFIX = 'sb-admin';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: ADMIN_COOKIE_PREFIX },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component — ignore
          }
        },
      },
    },
  );
}
