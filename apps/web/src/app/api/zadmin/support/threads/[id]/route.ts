/**
 * M-008 — BFF proxy for support thread mutation (PATCH).
 * Verifies admin session then forwards to apps/api.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';

function apiBase() {
  return (process.env.API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
}

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);
  if (!(await isAdminUser(supabase, user.id))) {
    return jsonError('Forbidden', 'FORBIDDEN', 403);
  }

  const bodyText = await req.text();

  const res = await fetch(`${apiBase()}/support/admin/threads/${id}`, {
    method: 'PATCH',
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
