import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getManager } from '@/lib/admin-check';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? '';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);

  const manager = await getManager(supabase, user.id);
  if (!manager) return jsonError('Forbidden', 'FORBIDDEN', 403);

  const res = await fetch(`${API_URL}/billing/admin/plan-configs`, {
    headers: {
      'x-internal-key': INTERNAL_KEY,
      'x-user-id': user.id,
    },
    cache: 'no-store',
  });

  const json = await res.json() as unknown;
  return NextResponse.json(json, { status: res.status });
}
