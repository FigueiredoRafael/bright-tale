import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getManager } from '@/lib/admin-check';
import { z } from 'zod';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

/** GET /api/zadmin/coupons — list custom (credit_grant) coupons */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);

  const manager = await getManager(supabase, user.id);
  if (!manager) return jsonError('Forbidden', 'FORBIDDEN', 403);

  const includeArchived = req.nextUrl.searchParams.get('archived') === 'true';
  const db = createAdminClient();

  let query = db.from('custom_coupons').select('*, coupon_redemptions(count)').order('created_at', { ascending: false });
  if (!includeArchived) query = query.is('archived_at', null);

  const { data: coupons, error } = await query;
  if (error) return jsonError(error.message, 'DB_ERROR', 500);

  return NextResponse.json({ data: coupons ?? [], error: null });
}

const createSchema = z.object({
  code: z.string().min(2).max(64).toUpperCase().regex(/^[A-Z0-9_-]+$/, 'Código inválido — use apenas letras, números, - ou _'),
  creditsAmount: z.number().int().positive().max(1_000_000),
  maxUsesTotal: z.number().int().positive().nullable().optional(),
  maxUsesPerUser: z.number().int().positive().default(1),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  allowedPlanIds: z.array(z.string()).nullable().optional(),
});

/** POST /api/zadmin/coupons — create credit_grant coupon */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);

  const manager = await getManager(supabase, user.id);
  if (!manager || (manager.role !== 'owner' && manager.role !== 'admin')) {
    return jsonError('Forbidden', 'FORBIDDEN', 403);
  }

  let body: unknown;
  try { body = await req.json(); } catch { return jsonError('Invalid JSON', 'INVALID_JSON', 400); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.message, 'VALIDATION_ERROR', 422);

  const { code, creditsAmount, maxUsesTotal, maxUsesPerUser, validFrom, validUntil, allowedPlanIds } = parsed.data;
  const db = createAdminClient();

  const { data: coupon, error } = await db
    .from('custom_coupons')
    .insert({
      code,
      kind: 'credit_grant',
      credits_amount: creditsAmount,
      max_uses_total: maxUsesTotal ?? null,
      max_uses_per_user: maxUsesPerUser,
      valid_from: validFrom ?? new Date().toISOString(),
      valid_until: validUntil ?? null,
      allowed_plan_ids: allowedPlanIds ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return jsonError('Código já existe', 'DUPLICATE_CODE', 409);
    return jsonError(error.message, 'DB_ERROR', 500);
  }

  return NextResponse.json({ data: coupon, error: null }, { status: 201 });
}
