/**
 * F3-002/003/004 — Billing routes: checkout, webhook, portal, status.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticateWithUser } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { getStripe } from '../lib/billing/stripe.js';
import { getPlan, planFromPriceIdAsync, loadPlanConfigs, ADDON_PACKS, type PlanId, type BillingCycle } from '../lib/billing/plans.js';
import { buildAffiliateContainer } from '../lib/affiliate/container.js';
import { insertNotification } from '../lib/notifications.js';
import { buildBillingStatus } from './billing/status.js';
import * as creditReservations from '../lib/credits/reservations.js';

type StripeClient = ReturnType<typeof getStripe>;
type StripeEvent = ReturnType<StripeClient['webhooks']['constructEvent']>;
type StripeCheckoutSession = Awaited<ReturnType<StripeClient['checkout']['sessions']['create']>>;
type StripeSubscription = Awaited<ReturnType<StripeClient['subscriptions']['retrieve']>>;
type StripeInvoice = Awaited<ReturnType<StripeClient['invoices']['retrieve']>>;

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

export async function ensureStripeCustomer(orgId: string, email: string | null): Promise<string> {
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

const addonCheckoutSchema = z.object({
  packId: z.enum(['pack_small', 'pack_medium', 'pack_large']),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

/* ─── Affiliate commission hook (2F minimal) ─────────────────────────────── */

const STRIPE_FEE_RATE = 0.0399;         // Stripe BR card standard
const STRIPE_FEE_FIXED_CENTAVOS = 39;   // R$ 0,39

export function __computeStripeFee(amountCentavos: number): number {
  return Math.round(amountCentavos * STRIPE_FEE_RATE) + STRIPE_FEE_FIXED_CENTAVOS;
}

export async function __resolveOrgPrimaryUserId(orgId: string): Promise<string | null> {
  const sb = createServiceClient();
  const { data } = await sb
    .from('org_memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  return (data?.user_id as string | undefined) ?? null;
}

export async function __fireAffiliateCommissionHook(
  invoice: StripeInvoice,
  fastify: FastifyInstance,
): Promise<void> {
  try {
    const reason = invoice.billing_reason;
    if (reason !== 'subscription_cycle' && reason !== 'subscription_create') return;

    const paymentAmount = invoice.amount_paid ?? 0;
    if (paymentAmount <= 0) return;

    const subscriptionId = (invoice as unknown as { subscription?: string }).subscription;
    if (!subscriptionId) return;

    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    const orgId = subscription.metadata?.org_id;
    const priceId = subscription.items.data[0]?.price.id;
    if (!orgId || !priceId) return;

    const mapping = await planFromPriceIdAsync(priceId);
    if (!mapping) return;

    const userId = await __resolveOrgPrimaryUserId(orgId);
    if (!userId) return;

    const paymentType: 'monthly' | 'annual' = mapping.cycle === 'annual' ? 'annual' : 'monthly';
    const today = new Date().toISOString().slice(0, 10);
    const period = (invoice as unknown as { period?: { start?: number; end?: number } }).period;
    const paymentPeriodStart = period?.start
      ? new Date(period.start * 1000).toISOString().slice(0, 10)
      : undefined;
    const paymentPeriodEnd = period?.end
      ? new Date(period.end * 1000).toISOString().slice(0, 10)
      : undefined;

    const { calcCommissionUseCase } = buildAffiliateContainer();
    const commission = await calcCommissionUseCase.execute({
      userId,
      paymentAmount,
      stripeFee: __computeStripeFee(paymentAmount),
      paymentType,
      today,
      paymentPeriodStart,
      paymentPeriodEnd,
      isRetroactive: false,
    });

    if (commission) {
      fastify.log.info(
        {
          userId,
          invoiceId: invoice.id,
          commissionId: commission.id,
          totalBrl: commission.totalBrl,
        },
        '[affiliate] commission created from Stripe invoice',
      );
    }
  } catch (err) {
    fastify.log.error(
      { err, invoiceId: invoice.id },
      '[affiliate] commission hook failed (isolated)',
    );
  }
}

export async function billingRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /plans — public plan catalog (prices + credits + features) so the UI
   * doesn't have to duplicate the config.
   */
  fastify.get('/plans', async (_request, reply) => {
    const plans = await loadPlanConfigs();
    return reply.send({
      data: {
        plans: Object.values(plans).map((p) => ({
          id: p.id,
          displayName: p.displayName,
          credits: p.credits,
          usdMonthly: p.usdMonthly,
          usdAnnual: p.usdAnnual,
          displayPriceBrlMonthly: p.displayPriceBrlMonthly ?? 0,
          displayPriceBrlAnnual: p.displayPriceBrlAnnual ?? 0,
          features: p.features,
          // Don't leak Stripe price IDs — not needed client-side.
        })),
      },
      error: null,
    });
  });

  /**
   * GET /status — current org's plan, credits, next reset.
   * Thin delegate to buildBillingStatus (V2-006.4).
   */
  fastify.get('/status', { preHandler: [authenticateWithUser] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const data = await buildBillingStatus(request.userId);
      return reply.send({ data, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /checkout — create a Stripe Checkout Session and return the URL.
   */
  fastify.post('/checkout', { preHandler: [authenticateWithUser] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const body = checkoutSchema.parse(request.body);
      const plans = await loadPlanConfigs();
      const plan = plans[body.planId as PlanId] ?? getPlan(body.planId as PlanId);
      const priceId = plan.stripePriceId[body.billingCycle];
      if (!priceId) {
        throw new ApiError(
          500,
          `Stripe price id for ${body.planId}/${body.billingCycle} not configured. Update via admin plan-configs.`,
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
        // F3-011: aceita qualquer cupom ativo no Stripe. UI do checkout mostra
        // o campo "Adicionar código promocional" automaticamente.
        allow_promotion_codes: true,
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
   * GET /addons — F3-005. Public catalog de packs avulsos de créditos.
   */
  fastify.get('/addons', async (_request, reply) => {
    return reply.send({
      data: {
        packs: Object.values(ADDON_PACKS).map((p) => ({
          id: p.id,
          credits: p.credits,
          usdPrice: p.usdPrice,
        })),
      },
      error: null,
    });
  });

  /**
   * POST /addons/checkout — F3-005. Comprar créditos avulsos. Mode=payment
   * (não assinatura). Creditos são creditados em `organizations.credits_addon`
   * via webhook `checkout.session.completed` quando pago.
   */
  fastify.post('/addons/checkout', { preHandler: [authenticateWithUser] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const body = addonCheckoutSchema.parse(request.body);
      const pack = ADDON_PACKS[body.packId];
      if (!pack?.stripePriceId) {
        throw new ApiError(500, `Stripe price id pro ${body.packId} não configurado (STRIPE_PRICE_ADDON_*)`, 'CONFIG_ERROR');
      }

      const sb = createServiceClient();
      const { data: userRow } = await sb
        .from('user_profiles')
        .select('email')
        .eq('id', request.userId)
        .maybeSingle();
      const org = await getOrg(request.userId);
      const customerId = await ensureStripeCustomer(org.id as string, (userRow?.email as string | null) ?? null);

      const stripe = getStripe();
      const appOrigin = process.env.APP_ORIGIN ?? 'http://localhost:3000';
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        line_items: [{ price: pack.stripePriceId, quantity: 1 }],
        allow_promotion_codes: true, // F3-011
        success_url: body.successUrl ?? `${appOrigin}/settings/billing?addon=1`,
        cancel_url: body.cancelUrl ?? `${appOrigin}/settings/billing?canceled=1`,
        metadata: {
          org_id: org.id as string,
          kind: 'addon',
          pack_id: pack.id,
          credits: String(pack.credits),
        },
      });

      return reply.send({ data: { url: session.url, sessionId: session.id }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /portal — Stripe Customer Portal link.
   */
  fastify.post('/portal', { preHandler: [authenticateWithUser] }, async (request, reply) => {
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

        let event: StripeEvent;
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

  /* ─── M-001 Admin: plan-configs + stripe-mode ─────────────────────────────── */

  type AnyClient = { from: (t: string) => { select: (...args: unknown[]) => unknown; update: (...args: unknown[]) => unknown; upsert: (...args: unknown[]) => unknown; [k: string]: (...args: unknown[]) => unknown } };
  const anySb = () => createServiceClient() as unknown as AnyClient;

  const updatePlanConfigSchema = z.object({
    displayName: z.string().min(1).max(64).optional(),
    credits: z.number().int().nonnegative().optional(),
    priceUsdMonthlyCents: z.number().int().nonnegative().optional(),
    priceUsdAnnualCents: z.number().int().nonnegative().optional(),
    displayPriceBrlMonthly: z.number().int().nonnegative().optional(),
    displayPriceBrlAnnual: z.number().int().nonnegative().optional(),
    stripePriceIdMonthlyTest: z.string().nullable().optional(),
    stripePriceIdAnnualTest: z.string().nullable().optional(),
    stripePriceIdMonthlyLive: z.string().nullable().optional(),
    stripePriceIdAnnualLive: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  });

  async function assertManagerAdmin(userId: string): Promise<void> {
    const sb = createServiceClient();
    const { data: manager } = await sb
      .from('managers')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();
    if (!manager) throw new ApiError(403, 'Forbidden', 'FORBIDDEN');
  }

  /**
   * GET /billing/admin/plan-configs — list all plan configs + current stripe mode.
   */
  fastify.get('/admin/plan-configs', { preHandler: [authenticateWithUser] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      await assertManagerAdmin(request.userId);

      const sb = anySb();
      const { data: rows, error: rowsErr } = await (sb.from('plan_configs').select('*') as unknown as Promise<{ data: unknown[]; error: { message: string } | null }>);
      if (rowsErr) throw new ApiError(500, rowsErr.message, 'DB_ERROR');

      const { data: modeRow } = await (
        sb.from('system_settings').select('value') as unknown as {
          eq: (k: string, v: string) => { single: () => Promise<{ data: { value: string } | null }> };
        }
      ).eq('key', 'stripe_mode').single();

      return reply.send({
        data: {
          plans: rows ?? [],
          stripeMode: modeRow?.value ?? 'test',
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PUT /billing/admin/plan-configs/:planId — update price IDs / prices / BRL display.
   */
  fastify.put('/admin/plan-configs/:planId', { preHandler: [authenticateWithUser] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      await assertManagerAdmin(request.userId);

      const { planId } = request.params as { planId: string };
      const body = updatePlanConfigSchema.parse(request.body);

      const update: Record<string, unknown> = {};
      if (body.displayName !== undefined) update['display_name'] = body.displayName;
      if (body.credits !== undefined) update['credits'] = body.credits;
      if (body.priceUsdMonthlyCents !== undefined) update['price_usd_monthly_cents'] = body.priceUsdMonthlyCents;
      if (body.priceUsdAnnualCents !== undefined) update['price_usd_annual_cents'] = body.priceUsdAnnualCents;
      if (body.displayPriceBrlMonthly !== undefined) update['display_price_brl_monthly'] = body.displayPriceBrlMonthly;
      if (body.displayPriceBrlAnnual !== undefined) update['display_price_brl_annual'] = body.displayPriceBrlAnnual;
      if (body.stripePriceIdMonthlyTest !== undefined) update['stripe_price_id_monthly_test'] = body.stripePriceIdMonthlyTest;
      if (body.stripePriceIdAnnualTest !== undefined) update['stripe_price_id_annual_test'] = body.stripePriceIdAnnualTest;
      if (body.stripePriceIdMonthlyLive !== undefined) update['stripe_price_id_monthly_live'] = body.stripePriceIdMonthlyLive;
      if (body.stripePriceIdAnnualLive !== undefined) update['stripe_price_id_annual_live'] = body.stripePriceIdAnnualLive;
      if (body.isActive !== undefined) update['is_active'] = body.isActive;

      if (Object.keys(update).length === 0) {
        throw new ApiError(400, 'No fields to update', 'BAD_REQUEST');
      }

      const sb = anySb();
      const planConfigsQuery = sb.from('plan_configs') as unknown as {
        update: (v: Record<string, unknown>) => {
          eq: (c: string, v: string) => {
            select: () => { single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> };
          };
        };
      };
      const { data: updated, error: updateErr } = await planConfigsQuery.update(update).eq('plan_id', planId).select().single();
      if (updateErr) throw new ApiError(500, updateErr.message, 'DB_ERROR');
      if (!updated) throw new ApiError(404, `Plan ${planId} not found`, 'NOT_FOUND');

      return reply.send({ data: updated, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /billing/admin/stripe-mode — returns current stripe mode.
   */
  fastify.get('/admin/stripe-mode', { preHandler: [authenticateWithUser] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      await assertManagerAdmin(request.userId);

      const sb = anySb();
      const { data: row } = await (
        sb.from('system_settings').select('value') as unknown as {
          eq: (k: string, v: string) => { single: () => Promise<{ data: { value: string } | null }> };
        }
      ).eq('key', 'stripe_mode').single();

      return reply.send({ data: { mode: row?.value ?? 'test' }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PUT /billing/admin/stripe-mode — toggle sandbox/live.
   */
  fastify.put('/admin/stripe-mode', { preHandler: [authenticateWithUser] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      await assertManagerAdmin(request.userId);

      const { mode } = z.object({ mode: z.enum(['test', 'live']) }).parse(request.body);

      const sb = anySb();
      const { error: upsertErr } = await (
        sb.from('system_settings').upsert({ key: 'stripe_mode', value: mode }) as unknown as Promise<{ error: { message: string } | null }>
      );
      if (upsertErr) throw new ApiError(500, upsertErr.message, 'DB_ERROR');

      return reply.send({ data: { mode }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}

/* ─── Webhook event dispatch ──────────────────────────────────────────────── */

export async function handleStripeEvent(event: StripeEvent, fastify: FastifyInstance): Promise<void> {
  fastify.log.info({ type: event.type, id: event.id }, '[stripe] event');

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as StripeCheckoutSession;
      // F3-005: one-time addon payments — grant credits to org.
      if (session.metadata?.kind === 'addon') {
        await grantAddonCredits(session);
        break;
      }
      await activateSubscriptionFromSession(session, fastify);
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as StripeSubscription;
      await syncSubscription(sub, fastify);
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as StripeSubscription;
      await downgradeToFree(sub, fastify);
      break;
    }
    case 'invoice.paid': {
      const invoice = event.data.object as StripeInvoice;
      await resetCreditsOnRenewal(invoice);
      await __fireAffiliateCommissionHook(invoice, fastify);
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as StripeInvoice;
      await notifyPaymentFailed(invoice);
      break;
    }
    default:
      // Ignore other event types for now.
      break;
  }
}

export async function grantAddonCredits(session: StripeCheckoutSession): Promise<void> {
  const orgId = session.metadata?.org_id;
  const creditsStr = session.metadata?.credits;
  if (!orgId || !creditsStr) return;
  const credits = Number(creditsStr);
  if (!Number.isFinite(credits) || credits <= 0) return;

  const sb = createServiceClient();
  const { data: org } = await sb
    .from('organizations')
    .select('credits_addon')
    .eq('id', orgId)
    .single();
  const current = (org?.credits_addon as number | null) ?? 0;
  await (sb.from('organizations') as unknown as {
    update: (row: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<unknown> };
  })
    .update({ credits_addon: current + credits })
    .eq('id', orgId);
}

export async function activateSubscriptionFromSession(
  session: StripeCheckoutSession,
  fastify: FastifyInstance,
): Promise<void> {
  const orgId = session.metadata?.org_id;
  if (!orgId || session.mode !== 'subscription' || !session.subscription) return;
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(
    typeof session.subscription === 'string' ? session.subscription : session.subscription.id,
  );
  await syncSubscription(subscription, fastify);

  const userId = await __resolveOrgPrimaryUserId(orgId);
  if (userId) {
    const planId = session.metadata?.plan_id;
    const planName = planId ? getPlan(planId as Parameters<typeof getPlan>[0]).displayName : 'novo';
    const sb = createServiceClient();
    await insertNotification(sb, userId, {
      type: 'plan_renewed',
      title: 'Plano ativado com sucesso!',
      body: `Bem-vindo ao plano ${planName}. Seus créditos estão disponíveis.`,
    });
  }
}

export async function syncSubscription(
  subscription: StripeSubscription,
  fastify: FastifyInstance,
): Promise<void> {
  const orgId = subscription.metadata?.org_id;
  const priceId = subscription.items.data[0]?.price.id;
  if (!orgId || !priceId) return;
  const mapping = await planFromPriceIdAsync(priceId);
  if (!mapping) return;
  const plans = await loadPlanConfigs();
  const plan = plans[mapping.planId] ?? getPlan(mapping.planId);

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

  // V2-006.6: release all held reservations for this org on plan change.
  const { data: heldRows } = await sb
    .from('credit_reservations')
    .select('token')
    .eq('org_id', orgId)
    .eq('status', 'held') as { data: Array<{ token: string }> | null; error: unknown };

  let releasedReservationCount = 0;
  for (const row of heldRows ?? []) {
    await creditReservations.release(row.token);
    releasedReservationCount++;
  }

  fastify.log.info(
    { orgId, planId: mapping.planId, releasedReservationCount },
    '[stripe] syncSubscription: plan updated, held reservations released',
  );
}

export async function downgradeToFree(
  subscription: StripeSubscription,
  fastify: FastifyInstance,
): Promise<void> {
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

  // V2-006.6: release all held reservations for this org on cancellation.
  const { data: heldRows } = await sb
    .from('credit_reservations')
    .select('token')
    .eq('org_id', orgId)
    .eq('status', 'held') as { data: Array<{ token: string }> | null; error: unknown };

  let releasedReservationCount = 0;
  for (const row of heldRows ?? []) {
    await creditReservations.release(row.token);
    releasedReservationCount++;
  }

  fastify.log.info(
    { orgId, releasedReservationCount },
    '[stripe] downgradeToFree: plan cancelled, held reservations released',
  );

  const userId = await __resolveOrgPrimaryUserId(orgId);
  if (userId) {
    await insertNotification(sb, userId, {
      type: 'plan_cancelled',
      title: 'Assinatura cancelada',
      body: 'Seu plano foi cancelado. Seus dados permanecem disponíveis.',
    });
  }
}

export async function resetCreditsOnRenewal(invoice: StripeInvoice): Promise<void> {
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
  const mapping = await planFromPriceIdAsync(priceId);
  if (!mapping) return;
  const plans = await loadPlanConfigs();
  const plan = plans[mapping.planId] ?? getPlan(mapping.planId);
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

export async function notifyPaymentFailed(invoice: StripeInvoice): Promise<void> {
  const subscriptionId = (invoice as unknown as { subscription?: string }).subscription;
  if (!subscriptionId) return;
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const orgId = subscription.metadata?.org_id;
  if (!orgId) return;
  const userId = await __resolveOrgPrimaryUserId(orgId);
  if (!userId) return;
  const sb = createServiceClient();
  await insertNotification(sb, userId, {
    type: 'payment_failed',
    title: 'Falha no pagamento',
    body: 'Não conseguimos processar seu pagamento. Atualize seu método de pagamento.',
    action_url: '/settings/billing',
  });
}
