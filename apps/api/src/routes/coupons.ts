/**
 * M-014 — User-facing coupon redeem endpoint.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateWithUser } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';

/* ─── Untyped table helper ─────────────────────────────────────────────────
 *
 * custom_coupons and coupon_redemptions were added after the last `db:types`
 * run, so they are not in Database['public']['Tables'].
 * We bypass the generated types with a minimal structural cast.
 */

type UntypedQuery = {
  eq: (col: string, val: unknown) => UntypedQuery;
  is: (col: string, val: null) => UntypedQuery;
  limit: (n: number) => UntypedQuery;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
};

type UntypedCountQuery = {
  eq: (col: string, val: unknown) => UntypedCountQuery;
  head?: boolean;
};

type UntypedClient = {
  from: (table: string) => {
    select: (cols: string, opts?: Record<string, unknown>) => UntypedQuery & UntypedCountQuery & {
      then: Promise<{ count: number | null; error: { message: string } | null }>['then'];
    };
    insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
};

function untypedClient(): UntypedClient {
  return createServiceClient() as unknown as UntypedClient;
}

/* ─── Shared helper: get org by userId ──────────────────────────────────── */

async function getOrgForUser(userId: string): Promise<Record<string, unknown>> {
  const sb = createServiceClient();
  const { data: membership } = await sb
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!membership) throw new ApiError(404, 'Organização não encontrada.', 'NOT_FOUND');
  const { data: org } = await sb
    .from('organizations')
    .select('*')
    .eq('id', (membership as Record<string, unknown>).org_id as string)
    .single();
  if (!org) throw new ApiError(404, 'Organização não encontrada.', 'NOT_FOUND');
  return org as Record<string, unknown>;
}

/* ─── Request schema ─────────────────────────────────────────────────────── */

const redeemSchema = z.object({
  code: z.string().min(1).max(100),
});

/* ─── Routes ─────────────────────────────────────────────────────────────── */

export async function couponsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /coupons/redeem — M-014 redeem a custom coupon code.
   *
   * Validations:
   *   - Coupon exists + not archived
   *   - Within valid_from / valid_until window
   *   - total_uses < max_uses_total (if set)
   *   - Per-user uses < max_uses_per_user
   *   - User's plan is in allowed_plan_ids (if set)
   *
   * On success: adds credits_amount to org.credits_addon, records redemption.
   */
  fastify.post(
    '/redeem',
    { preHandler: [authenticateWithUser] },
    async (request, reply) => {
      try {
        if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
        const userId = request.userId;

        const body = redeemSchema.parse(request.body);
        const normalizedCode = body.code.trim().toUpperCase();

        const ub = untypedClient();
        const sb = createServiceClient();

        /* ── 1. Find coupon ──────────────────────────────────────────── */
        const { data: coupon } = await ub
          .from('custom_coupons')
          .select('*')
          .eq('code', normalizedCode)
          .is('archived_at', null)
          .maybeSingle();

        if (!coupon) {
          throw new ApiError(400, 'Cupom inválido ou não encontrado.', 'COUPON_INVALID');
        }

        /* ── 2. Validate time window ─────────────────────────────────── */
        const now = new Date();
        const validFrom = coupon.valid_from ? new Date(coupon.valid_from as string) : null;
        const validUntil = coupon.valid_until ? new Date(coupon.valid_until as string) : null;

        if (validFrom && now < validFrom) {
          throw new ApiError(400, 'Este cupom ainda não é válido.', 'COUPON_EXPIRED');
        }
        if (validUntil && now > validUntil) {
          throw new ApiError(400, 'Este cupom expirou.', 'COUPON_EXPIRED');
        }

        /* ── 3. Validate total uses ──────────────────────────────────── */
        const maxUsesTotal = coupon.max_uses_total as number | null;
        if (maxUsesTotal !== null) {
          type CountResult = { count: number | null; error: { message: string } | null };
          const totalResult = (await (ub
            .from('coupon_redemptions')
            .select('*', { count: 'exact', head: true }) as unknown as {
              eq: (col: string, val: unknown) => Promise<CountResult>;
            })
            .eq('coupon_id', coupon.id as string)) as CountResult;

          if ((totalResult.count ?? 0) >= maxUsesTotal) {
            throw new ApiError(400, 'Este cupom atingiu o limite máximo de usos.', 'COUPON_EXHAUSTED');
          }
        }

        /* ── 4. Validate per-user uses ───────────────────────────────── */
        const maxUsesPerUser = (coupon.max_uses_per_user as number | null) ?? 1;
        type CountResult = { count: number | null; error: { message: string } | null };
        const userResult = (await (ub
          .from('coupon_redemptions')
          .select('*', { count: 'exact', head: true }) as unknown as {
            eq: (col: string, val: unknown) => {
              eq: (col: string, val: unknown) => Promise<CountResult>;
            };
          })
          .eq('coupon_id', coupon.id as string)
          .eq('user_id', userId)) as CountResult;

        if ((userResult.count ?? 0) >= maxUsesPerUser) {
          throw new ApiError(400, 'Você já utilizou este cupom o máximo de vezes permitido.', 'COUPON_EXHAUSTED');
        }

        /* ── 5. Validate allowed plan IDs ───────────────────────────── */
        const allowedPlanIds = coupon.allowed_plan_ids as string[] | null;
        if (allowedPlanIds && allowedPlanIds.length > 0) {
          const org = await getOrgForUser(userId);
          const userPlan = (org.plan as string | null) ?? 'free';
          if (!allowedPlanIds.includes(userPlan)) {
            throw new ApiError(
              400,
              `Este cupom é válido apenas para os planos: ${allowedPlanIds.join(', ')}.`,
              'COUPON_INVALID',
            );
          }
        }

        /* ── 6. Grant credits to org ─────────────────────────────────── */
        const org = await getOrgForUser(userId);
        const orgId = org.id as string;
        const creditsAmount = coupon.credits_amount as number;
        const currentAddon = (org.credits_addon as number | null) ?? 0;

        await (sb.from('organizations') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<unknown> };
        })
          .update({ credits_addon: currentAddon + creditsAmount })
          .eq('id', orgId);

        /* ── 7. Record redemption ────────────────────────────────────── */
        await ub.from('coupon_redemptions').insert({
          coupon_id: coupon.id as string,
          user_id: userId,
          redeemed_at: new Date().toISOString(),
        });

        return reply.send({
          data: {
            creditsGranted: creditsAmount,
            message: `${creditsAmount.toLocaleString('pt-BR')} créditos adicionados!`,
          },
          error: null,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
