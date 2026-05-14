/**
 * M-007 — Auto-refund endpoint + admin refund list.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateWithUser } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { getStripe } from '../lib/billing/stripe.js';
import { getPlan } from '../lib/billing/plans.js';
import type { PlanId } from '../lib/billing/plans.js';

/* ─── Untyped table helper ─────────────────────────────────────────────────
 *
 * refund_audit, custom_coupons, and coupon_redemptions were added after the
 * last `db:types` run, so they are not in Database['public']['Tables'].
 * We bypass the generated types with a minimal structural cast.
 */

type UntypedClient = {
  from: (table: string) => {
    select: (cols: string, opts?: Record<string, unknown>) => UntypedQuery;
    insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
};

type UntypedQuery = {
  eq: (col: string, val: unknown) => UntypedQuery;
  is: (col: string, val: null) => UntypedQuery;
  order: (col: string, opts?: Record<string, unknown>) => UntypedQuery;
  limit: (n: number) => UntypedQuery;
  range: (from: number, to: number) => UntypedQuery;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  then: Promise<{ data: Record<string, unknown>[]; error: { message: string } | null; count: number | null }>['then'];
};

function untypedClient(): UntypedClient {
  return createServiceClient() as unknown as UntypedClient;
}

/* ─── Shared helper: get org by userId (mirrors billing.ts) ─────────────── */

async function getOrgForUser(userId: string): Promise<Record<string, unknown>> {
  const sb = createServiceClient();
  const { data: membership } = await sb
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!membership) throw new ApiError(404, 'No organization found', 'NOT_FOUND');
  const { data: org } = await sb
    .from('organizations')
    .select('*')
    .eq('id', (membership as Record<string, unknown>).org_id as string)
    .single();
  if (!org) throw new ApiError(404, 'Organization not found', 'NOT_FOUND');
  return org as Record<string, unknown>;
}

/* ─── Helper: check manager role ─────────────────────────────────────────── */

async function assertManager(userId: string): Promise<void> {
  const sb = createServiceClient();
  const { data: manager } = await sb
    .from('managers')
    .select('role, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (!manager) {
    throw new ApiError(403, 'Admin role required', 'FORBIDDEN');
  }
  const role = (manager as Record<string, unknown>).role as string;
  const allowedRoles = new Set(['owner', 'admin', 'billing', 'support', 'readonly']);
  if (!allowedRoles.has(role)) {
    throw new ApiError(403, 'Admin role required', 'FORBIDDEN');
  }
}

/* ─── Pagination query schema ────────────────────────────────────────────── */

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/* ─── Routes ─────────────────────────────────────────────────────────────── */

export async function refundsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /billing/refund — M-007 auto-refund.
   *
   * Anti-fraud gates:
   *   1. Account must be >= 24h old
   *   2. No previous approved refund for this user
   *   3. Credits used <= 10% of plan allocation
   *   4. Subscription created <= 7 days ago
   */
  fastify.post(
    '/billing/refund',
    { preHandler: [authenticateWithUser] },
    async (request, reply) => {
      try {
        if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
        const userId = request.userId;
        const sb = createServiceClient();
        const ub = untypedClient();

        /* ── 1. Load user profile (for account age check) ─────────────── */
        const { data: userProfile } = await sb
          .from('user_profiles')
          .select('created_at')
          .eq('id', userId)
          .maybeSingle();

        const antiFraudChecks: Record<string, boolean> = {};

        /* ── 2. Anti-fraud: account age < 24h ─────────────────────────── */
        if (userProfile?.created_at) {
          const accountAgeMs = Date.now() - new Date(userProfile.created_at as string).getTime();
          const accountAgeHours = accountAgeMs / (1000 * 60 * 60);
          antiFraudChecks.accountAge24h = accountAgeHours >= 24;
          if (accountAgeHours < 24) {
            throw new ApiError(
              400,
              'Conta muito recente para solicitar reembolso. Aguarde 24 horas após o cadastro.',
              'REFUND_INELIGIBLE',
            );
          }
        } else {
          antiFraudChecks.accountAge24h = false;
          throw new ApiError(
            400,
            'Perfil de usuário não encontrado.',
            'REFUND_INELIGIBLE',
          );
        }

        /* ── 3. Anti-fraud: previous approved refund ──────────────────── */
        const { data: previousRefund } = await ub
          .from('refund_audit')
          .select('id')
          .eq('user_id', userId)
          .eq('decision', 'approved')
          .limit(1)
          .maybeSingle();

        antiFraudChecks.noLifetimeRefund = !previousRefund;
        if (previousRefund) {
          throw new ApiError(
            400,
            'Você já utilizou o reembolso vitalício disponível para esta conta.',
            'REFUND_INELIGIBLE',
          );
        }

        /* ── 4. Load org + plan data ──────────────────────────────────── */
        const org = await getOrgForUser(userId);
        const planId = (org.plan as PlanId) ?? 'free';
        const plan = getPlan(planId);
        const creditsTotal = (org.credits_total as number | null) ?? plan.credits;
        const creditsUsed = (org.credits_used as number | null) ?? 0;
        const subscriptionId = org.stripe_subscription_id as string | null;
        const stripeCustomerId = org.stripe_customer_id as string | null;
        const planStartedAt = org.plan_started_at as string | null;

        /* ── 5. Anti-fraud: credits used > 10% ───────────────────────── */
        const usedPct = creditsTotal > 0 ? (creditsUsed / creditsTotal) * 100 : 0;
        antiFraudChecks.creditsUnder10Pct = usedPct <= 10;
        if (usedPct > 10) {
          throw new ApiError(
            400,
            `Você já utilizou ${usedPct.toFixed(1)}% dos seus créditos. O reembolso só é possível com uso menor que 10%.`,
            'REFUND_INELIGIBLE',
          );
        }

        /* ── 6. Anti-fraud: subscription age > 7 days ────────────────── */
        if (!planStartedAt) {
          throw new ApiError(
            400,
            'Nenhuma assinatura ativa encontrada para reembolso.',
            'REFUND_INELIGIBLE',
          );
        }
        const subAgeMs = Date.now() - new Date(planStartedAt).getTime();
        const subAgeDays = subAgeMs / (1000 * 60 * 60 * 24);
        antiFraudChecks.within7DayWindow = subAgeDays <= 7;
        if (subAgeDays > 7) {
          throw new ApiError(
            400,
            'O prazo para reembolso é de 7 dias após a assinatura. Seu prazo expirou.',
            'REFUND_INELIGIBLE',
          );
        }

        if (!subscriptionId || !stripeCustomerId) {
          throw new ApiError(
            400,
            'Nenhuma assinatura Stripe encontrada.',
            'REFUND_INELIGIBLE',
          );
        }

        /* ── 7. Issue Stripe refund ───────────────────────────────────── */
        const stripe = getStripe();

        const invoices = await stripe.invoices.list({
          customer: stripeCustomerId,
          limit: 1,
        });
        const latestInvoice = invoices.data[0];
        if (!latestInvoice) {
          throw new ApiError(400, 'Nenhuma fatura encontrada para reembolso.', 'REFUND_INELIGIBLE');
        }

        // Stripe's Invoice type exposes payment_intent as string | PaymentIntent | null
        // in newer SDK versions; cast to access the id regardless of expanded state.
        const rawPaymentIntent = (latestInvoice as unknown as { payment_intent?: string | { id: string } | null }).payment_intent;
        const paymentIntentId: string | null =
          typeof rawPaymentIntent === 'string'
            ? rawPaymentIntent
            : (rawPaymentIntent?.id ?? null);

        if (!paymentIntentId) {
          throw new ApiError(400, 'Fatura sem payment_intent associado.', 'REFUND_INELIGIBLE');
        }

        const refund = await stripe.refunds.create({
          payment_intent: paymentIntentId,
          reason: 'requested_by_customer',
        });

        const amountCents = refund.amount;
        const currency = refund.currency;

        /* ── 8. Insert into refund_audit ─────────────────────────────── */
        await ub.from('refund_audit').insert({
          user_id: userId,
          payment_id: paymentIntentId,
          amount_usd_cents: amountCents,
          decision: 'approved',
          rule_matched: 'within_7d_no_use',
          used_pct: usedPct,
          fraud_score: 0,
          fraud_signals: antiFraudChecks,
          decided_at: new Date().toISOString(),
          decided_by: null,
        });

        /* ── 9. Cancel Stripe subscription ───────────────────────────── */
        await stripe.subscriptions.cancel(subscriptionId);

        /* ── 10. Reset org plan to free ──────────────────────────────── */
        const freePlan = getPlan('free');
        const orgId = org.id as string;
        await (sb.from('organizations') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<unknown> };
        })
          .update({
            plan: 'free',
            stripe_subscription_id: null,
            plan_expires_at: new Date().toISOString(),
            credits_total: freePlan.credits,
            credits_used: 0,
          })
          .eq('id', orgId);

        return reply.send({
          data: { refunded: true, amountCents, currency },
          error: null,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * GET /admin/refunds — paginated refund audit log.
   * Requires authenticated user with a manager row (any role).
   */
  fastify.get(
    '/admin/refunds',
    { preHandler: [authenticateWithUser] },
    async (request, reply) => {
      try {
        if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');

        await assertManager(request.userId);

        const query = paginationSchema.parse(request.query);
        const { page, limit } = query;
        const offset = (page - 1) * limit;

        const ub = untypedClient();

        type RefundAuditList = {
          data: Record<string, unknown>[] | null;
          error: { message: string } | null;
          count: number | null;
        };

        const result = (await ub
          .from('refund_audit')
          .select('*', { count: 'exact' })
          .order('decided_at', { ascending: false })
          .range(offset, offset + limit - 1)) as unknown as RefundAuditList;

        if (result.error) throw new ApiError(500, result.error.message, 'DB_ERROR');

        const total = result.count ?? 0;
        const totalPages = Math.ceil(total / limit);

        return reply.send({
          data: {
            items: result.data ?? [],
            total,
            page,
            limit,
            totalPages,
          },
          error: null,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
