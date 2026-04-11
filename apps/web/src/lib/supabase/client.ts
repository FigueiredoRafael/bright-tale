import { createBrowserClient } from '@tn-figueiredo/auth-nextjs/client';

export function createClient() {
  return createBrowserClient({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  });
}
