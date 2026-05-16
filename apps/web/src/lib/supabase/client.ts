import { createBrowserClient } from '@supabase/ssr';

// Must match the prefix used in server.ts and middleware.ts so the admin
// JWT is included in Realtime WebSocket connections (used by postgres_changes).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: { name: 'sb-admin' } },
  );
}
