import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';

function apiBase() {
  return (process.env.API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
}

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

/**
 * Proxy an admin-scoped request from apps/web BFF → apps/api.
 * Verifies session + admin role, injects X-Internal-Key server-side,
 * forwards body verbatim, passes response envelope through unchanged.
 */
export async function proxyToApi(
  req: NextRequest,
  apiPath: string,
  method: 'POST' | 'PUT' | 'GET' | 'DELETE' = 'POST',
): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);
  if (!(await isAdminUser(supabase, user.id))) {
    return jsonError('Forbidden', 'FORBIDDEN', 403);
  }

  const bodyText = method === 'GET' || method === 'DELETE' ? undefined : await req.text();

  const res = await fetch(`${apiBase()}${apiPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Key': process.env.INTERNAL_API_KEY ?? '',
      'x-user-id': user.id,
    },
    body: bodyText,
    cache: 'no-store',
  });

  const upstreamBody = await res.text();
  return new NextResponse(upstreamBody, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
