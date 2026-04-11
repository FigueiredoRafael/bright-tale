import { createAdminClient as createEcosystemAdminClient } from '@tn-figueiredo/auth-nextjs';

// ISOLADO: Nunca importar em Server Components voltados ao usuário!
// Usar APENAS em: admin layouts, admin API routes, operações internas.
const adminFetch: typeof fetch = (url, options = {}) =>
  fetch(url, { ...options, cache: 'no-store' });

export function createAdminClient() {
  return createEcosystemAdminClient({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    adminFetch,
  });
}
