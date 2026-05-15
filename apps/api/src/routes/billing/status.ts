/**
 * V2-006.4 — Billing Status Builder
 *
 * Extracts `buildBillingStatus(userId)` as a pure-function-style builder
 * that composes:
 *   - Org + plan data (from DB)
 *   - Signup bonus fields (M-004)
 *   - creditsReserved (V2-006 via getBalance)
 *
 * The Fastify /billing/status route becomes a 2-line thin delegate.
 */
import type { FastifyInstance } from 'fastify';
import { createServiceClient } from '../../lib/supabase/index.js';
import { ApiError } from '../../lib/api/errors.js';
import { getPlan, type PlanId } from '../../lib/billing/plans.js';
import { getBalance, type CreditBalance } from '../../lib/credits/balance.js';
import { authenticateWithUser } from '../../middleware/authenticate.js';
import { sendError } from '../../lib/api/fastify-errors.js';

// ---------------------------------------------------------------------------
// StatusPayload — the shape returned by buildBillingStatus
// ---------------------------------------------------------------------------

export interface StatusPayload {
  plan: {
    id: PlanId;
    displayName: string;
    credits: number;
    usdMonthly: number;
    billingCycle: string | null;
  };
  credits: CreditBalance;
  subscription: {
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    planStartedAt: string | null;
    planExpiresAt: string | null;
  };
}

// ---------------------------------------------------------------------------
// Internal: load org row for a given userId
// ---------------------------------------------------------------------------

async function getOrgForUser(userId: string): Promise<Record<string, unknown>> {
  const sb = createServiceClient();

  const { data: membership } = await sb
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!membership) {
    throw new ApiError(404, 'No organization found', 'NOT_FOUND');
  }

  const { data: org } = await sb
    .from('organizations')
    .select('*')
    .eq('id', (membership as { org_id: string }).org_id)
    .single();

  if (!org) {
    throw new ApiError(404, 'Organization not found', 'NOT_FOUND');
  }

  return org as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// buildBillingStatus — pure builder (injectable in tests)
// ---------------------------------------------------------------------------

/**
 * Builds the full billing status payload for a user.
 *
 * Delegates credit-balance computation (including creditsReserved, signup
 * bonus, VIP unlimited) to getBalance() from lib/credits/balance.
 *
 * @throws ApiError 404 — no org found for user
 */
export async function buildBillingStatus(userId: string): Promise<StatusPayload> {
  const org = await getOrgForUser(userId);

  const planId = (org.plan as PlanId) ?? 'free';
  const plan = getPlan(planId);

  const orgId = org.id as string;
  const balance = await getBalance(orgId);

  return {
    plan: {
      id: planId,
      displayName: plan.displayName,
      credits: plan.credits,
      usdMonthly: plan.usdMonthly,
      billingCycle: (org.billing_cycle as string | null) ?? null,
    },
    credits: balance,
    subscription: {
      stripeCustomerId: (org.stripe_customer_id as string | null) ?? null,
      stripeSubscriptionId: (org.stripe_subscription_id as string | null) ?? null,
      planStartedAt: (org.plan_started_at as string | null) ?? null,
      planExpiresAt: (org.plan_expires_at as string | null) ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Fastify route registration — thin delegate (≤ 2-line body)
// ---------------------------------------------------------------------------

export async function billingStatusRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get('/status', { preHandler: [authenticateWithUser] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const data = await buildBillingStatus(request.userId);
      return reply.send({ data, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
