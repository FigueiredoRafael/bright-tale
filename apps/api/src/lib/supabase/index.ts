import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@brighttale/shared/types/database';

// Allows tests to inject a mock client by setting this global
declare global {
  // eslint-disable-next-line no-var
  var __supabaseMock: ReturnType<typeof createClient<Database>> | undefined;
}

export function createServiceClient(): ReturnType<typeof createClient<Database>> {
  if (process.env.NODE_ENV === 'test' && global.__supabaseMock) {
    return global.__supabaseMock as ReturnType<typeof createClient<Database>>;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
