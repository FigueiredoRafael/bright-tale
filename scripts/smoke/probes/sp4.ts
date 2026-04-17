import { smokeRequest } from '../http.js'
import { buildSignedInvoiceEvent } from '../stripe-event.js'
import type { Probe, ProbeContext } from '../types.js'

async function pendingCount(ctx: ProbeContext): Promise<number> {
  const { count, error } = await ctx.supabase
    .from('affiliate_commissions')
    .select('id', { count: 'exact', head: true })
    .eq('affiliate_id', ctx.fixture.affiliateId)
    .eq('status', 'pending')
  if (error) throw new Error(`pendingCount: ${error.message}`)
  return count ?? 0
}

async function postWebhook(
  ctx: ProbeContext,
  billingReason: 'subscription_cycle' | 'subscription_update' | 'subscription_create',
  amountPaid: number,
) {
  const { rawBody, signature } = buildSignedInvoiceEvent({
    billingReason, amountPaid,
    orgId: ctx.fixture.organizationId,
    secret: ctx.stripeWebhookSecret!,
  })
  return smokeRequest({
    apiUrl: ctx.apiUrl, internalKey: ctx.internalKey, userId: null,
    method: 'POST', path: '/billing/webhook',
    rawBody,
    extraHeaders: {
      'content-type': 'application/json',
      'stripe-signature': signature,
    },
  })
}

const SKIP = { status: 'skip' as const, detail: 'STRIPE_WEBHOOK_SECRET not set in apps/api/.env.local' }

export const SP4_PROBES: Probe[] = [
  {
    id: 'SP4-1', sp: 4,
    desc: 'webhook subscription_cycle → commission +1',
    async run(ctx) {
      if (!ctx.stripeWebhookSecret) return SKIP
      const r = await postWebhook(ctx, 'subscription_cycle', 9900)
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const after = await pendingCount(ctx)
      const expected = ctx.baselines.pendingCommissionCountForAffiliate + 1
      if (after !== expected) return { status: 'fail', detail: `pending count: expected ${expected}, got ${after}` }
      const { data, error } = await ctx.supabase.from('affiliate_commissions')
        .select('status, referral_id, payment_amount, commission_rate, total_brl, affiliate_id')
        .eq('affiliate_id', ctx.fixture.affiliateId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }).limit(1).single()
      if (error || !data) return { status: 'fail', detail: `newest row read: ${error?.message}` }
      if (data.referral_id !== ctx.fixture.referralId) {
        return { status: 'fail', detail: `referral_id mismatch: ${data.referral_id}` }
      }
      if (data.payment_amount !== 9900) {
        return { status: 'fail', detail: `payment_amount: expected 9900, got ${data.payment_amount}` }
      }
      if (Number(data.commission_rate) !== 0.15) {
        return { status: 'fail', detail: `commission_rate: expected 0.15, got ${data.commission_rate}` }
      }
      if (!(Number(data.total_brl) > 0)) {
        return { status: 'fail', detail: `total_brl: expected > 0, got ${data.total_brl}` }
      }
      return { status: 'pass' }
    },
  },
  {
    id: 'SP4-2', sp: 4,
    desc: 'webhook subscription_update → no delta',
    async run(ctx) {
      if (!ctx.stripeWebhookSecret) return SKIP
      const before = await pendingCount(ctx)
      const r = await postWebhook(ctx, 'subscription_update', 9900)
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const after = await pendingCount(ctx)
      if (after !== before) return { status: 'fail', detail: `count changed: ${before} → ${after}` }
      return { status: 'pass' }
    },
  },
  {
    id: 'SP4-3', sp: 4,
    desc: 'webhook amount_paid=0 → short-circuit',
    async run(ctx) {
      if (!ctx.stripeWebhookSecret) return SKIP
      const before = await pendingCount(ctx)
      const r = await postWebhook(ctx, 'subscription_cycle', 0)
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const after = await pendingCount(ctx)
      if (after !== before) return { status: 'fail', detail: `count changed: ${before} → ${after}` }
      return { status: 'pass' }
    },
  },
]
