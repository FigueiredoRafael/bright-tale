/**
 * F3-002/003/004 — Billing routes: checkout, webhook, portal, status.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { getStripe } from '../lib/billing/stripe.js';
import { PLANS, getPlan, planFromPriceId, type PlanId, type BillingCycle } from '../lib/billing/plans.js';
import type Stripe from 'stripe';

async function getOrg(userId: string) {
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
    .eq('id', membership.org_id)
    .single();
  if (!org) throw new ApiError(404, 'Organization not found', 'NOT_FOUND');
  return org as Record<string, unknown>;
}

async function ensureStripeCustomer(orgId: string, email: string | null): Promise<string> {
  const sb = createServiceClient();
  const { data: org } = await sb
    .from('organizations')
    .select('stripe_customer_id, name')
    .eq('id', orgId)
    .single();
  if (org?.stripe_customer_id) return org.stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    name: (org?.name as string | undefined) ?? undefined,
    metadata: { org_id: orgId },
  });
  await (sb.from('organizations') as unknown as {
    update: (row: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<unknown> };
  })
    .update({ stripe_customer_id: customer.id })
    .eq('id', orgId);
  return customer.id;
}

const checkoutSchema = z.object({
  planId: z.enum(['starter', 'creator', 'pro']),
  billingCycle: z.enum(['monthly', 'annual']),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export async function billingRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /plans — public plan catalog (prices + credits + features) so the UI
   * doesn't have to duplicate the config.
   */
  fastify.get('/plans', async (_request, reply) => {
    return reply.send({
      data: {
        plans: Object.values(PLANS).map((p) => ({
          id: p.id,
          displayName: p.displayName,
          credits: p.credits,
          usdMonthly: p.usdMonthly,
          usdAnnual: p.usdAnnual,
          features: p.features,
          // Don't leak Stripe price IDs — not needed client-side.
        })),
      },
      error: null,
    });
  });

  /**
   * GET /status — current org's plan, credits, next reset.
   */
  fastify.get('/status', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const org = await getOrg(request.userId);
      const planId = (org.plan as PlanId) ?? 'free';
      const plan = getPlan(planId);
      return reply.send({
        data: {
          plan: {
            id: planId,
            displayName: plan.displayName,
            credits: plan.credits,
            usdMonthly: plan.usdMonthly,
            billingCycle: org.billing_cycle,
          },
          credits: {
            total: org.credits_total,
            used: org.credits_used,
            addon: org.credits_addon,
            remaining: Math.max(0, (org.credits_total as number) - (org.credits_used as number)) + (org.credits_addon as number),
            resetAt: org.credits_reset_at,
          },
          subscription: {
            stripeCustomerId: org.stripe_customer_id,
            stripeSubscriptionId: org.stripe_subscription_id,
            planStartedAt: org.plan_started_at,
            planExpiresAt: org.plan_expires_at,
          },
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /checkout — create a Stripe Checkout Session and return the URL.
   */
  fastify.post('/checkout', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const body = checkoutSchema.parse(request.body);
      const plan = getPlan(body.planId as PlanId);
      const priceId = plan.stripePriceId[body.billingCycle];
      if (!priceId) {
        throw new ApiError(
          500,
          `Stripe price id for ${body.planId}/${body.billingCycle} not configured (set STRIPE_PRICE_${body.planId.toUpperCase()}_${body.billingCycle.toUpperCase()}).`,
          'CONFIG_ERROR',
        );
      }

      const sb = createServiceClient();
      const { data: userRow } = await sb
        .from('user_profiles')
        .select('email')
        .eq('id', request.userId)
        .maybeSingle();
      const org = await getOrg(request.userId);
      const customerId = await ensureStripeCustomer(
        org.id as string,
        (userRow?.email as string | null) ?? null,
      );

      const stripe = getStripe();
      const appOrigin = process.env.APP_ORIGIN ?? 'http://localhost:3000';
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: body.successUrl ?? `${appOrigin}/settings/billing?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: body.cancelUrl ?? `${appOrigin}/settings/billing?canceled=1`,
        subscription_data: {
          trial_period_days: body.planId === 'creator' || body.planId === 'pro' ? 7 : undefined,
          metadata: { org_id: org.id as string, plan_id: body.planId, billing_cycle: body.billingCycle },
        },
        metadata: { org_id: org.id as string, plan_id: body.planId, billing_cycle: body.billingCycle },
      });

      return reply.send({ data: { url: session.url, sessionId: session.id }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /portal — Stripe Customer Portal link.
   */
  fastify.post('/portal', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const org = await getOrg(request.userId);
      if (!org.stripe_customer_id) {
        throw new ApiError(400, 'No Stripe customer for this org yet', 'NO_CUSTOMER');
      }
      const stripe = getStripe();
      const appOrigin = process.env.APP_ORIGIN ?? 'http://localhost:3000';
      const session = await stripe.billingPortal.sessions.create({
        customer: org.stripe_customer_id as string,
        return_url: `${appOrigin}/settings/billing`,
      });
      return reply.send({ data: { url: session.url }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /webhook — Stripe event handler.
   * Fastify must receive the RAW body for signature verification.
   */
  fastify.post(
    '/webhook',
    { config: { rawBody: true } },
    async (request: FastifyRequest, reply) => {
      try {
        const sig = request.headers['stripe-signature'] as string | undefined;
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!sig || !secret) {
          throw new ApiError(400, 'Missing signature or webhook secret', 'BAD_REQUEST');
        }
        const stripe = getStripe();
        const raw = (request as { rawBody?: string | Buffer }).rawBody;
        if (!raw) throw new ApiError(400, 'No raw body', 'BAD_REQUEST');

        let event: Stripe.Event;
        try {
          event = stripe.webhooks.constructEvent(raw, sig, secret);
        } catch (err) {
          throw new ApiError(400, `Invalid signature: ${(err as Error).message}`, 'BAD_SIGNATURE');
        }

        await handleStripeEvent(event, fastify);
        return reply.send({ received: true });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}

/* ─── Webhook event dispatch ──────────────────────────────────────────────── */

async function handleStripeEvent(event: Stripe.Event, fastify: FastifyInstance): Promise<void> {
  fastify.log.info({ type: event.type, id: event.id }, '[stripe] event');

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await activateSubscriptionFromSession(session);
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscription(sub);
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await downgradeToFree(sub);
      break;
    }
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      await resetCreditsOnRenewal(invoice);
      break;
    }
    default:
      // Ignore other event types for now.
      break;
  }
}

async function activateSubscriptionFromSession(session: Stripe.Checkout.Session): Promise<void> {
  const orgId = session.metadata?.org_id;
  if (!orgId || session.mode !== 'subscription' || !session.subscription) return;
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(
    typeof session.subscription === 'string' ? session.subscription : session.subscription.id,
  );
  await syncSubscription(subscription);
}

async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const orgId = subscription.metadata?.org_id;
  const priceId = subscription.items.data[0]?.price.id;
  if (!orgId || !priceId) return;
  const mapping = planFromPriceId(priceId);
  if (!mapping) return;
  const plan = getPlan(mapping.planId);

  const currentPeriodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;
  const currentPeriodStart = (subscription as unknown as { current_period_start?: number }).current_period_start;

  const sb = createServiceClient();
  await (sb.from('organizations') as unknown as {
    update: (row: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<unknown> };
  })
    .update({
      stripe_subscription_id: subscription.id,
      plan: mapping.planId,
      billing_cycle: mapping.cycle as BillingCycle,
      plan_started_at: currentPeriodStart ? new Date(currentPeriodStart * 1000).toISOString() : null,
      plan_expires_at: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
      credits_total: plan.credits,
      credits_used: 0,
      credits_reset_at: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
    })
    .eq('id', orgId);
}

async function downgradeToFree(subscription: Stripe.Subscription): Promise<void> {
  const orgId = subscription.metadata?.org_id;
  if (!orgId) return;
  const freePlan = getPlan('free');
  const sb = createServiceClient();
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
}

async function resetCreditsOnRenewal(invoice: Stripe.Invoice): Promise<void> {
  // Only reset on recurring cycle renewals (not the first invoice, which
  // syncSubscription already handled).
  if (invoice.billing_reason !== 'subscription_cycle') return;
  const subscriptionId = (invoice as unknown as { subscription?: string }).subscription;
  if (!subscriptionId) return;
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const orgId = subscription.metadata?.org_id;
  const priceId = subscription.items.data[0]?.price.id;
  if (!orgId || !priceId) return;
  const mapping = planFromPriceId(priceId);
  if (!mapping) return;
  const plan = getPlan(mapping.planId);
  const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;

  const sb = createServiceClient();
  await (sb.from('organizations') as unknown as {
    update: (row: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<unknown> };
  })
    .update({
      credits_total: plan.credits,
      credits_used: 0,
      credits_reset_at: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      plan_expires_at: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    })
    .eq('id', orgId);
}
