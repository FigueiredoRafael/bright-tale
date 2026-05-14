import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getManager, canMutateData } from '@/lib/admin-check';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? '';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ planId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);

  const manager = await getManager(supabase, user.id);
  if (!manager || !canMutateData(manager.role)) return jsonError('Forbidden', 'FORBIDDEN', 403);

  const { planId } = await params;

  let body: unknown;
  try { body = await req.json(); } catch { return jsonError('Invalid JSON', 'INVALID_JSON', 400); }

  const res = await fetch(`${API_URL}/billing/admin/plan-configs/${planId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': INTERNAL_KEY,
      'x-user-id': user.id,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json() as unknown;
  return NextResponse.json(json, { status: res.status });
}
