import Stripe from 'stripe'
import { randomUUID } from 'node:crypto'

export const PRICE_ID_MONTHLY = 'price_smoke_creator_monthly'

export interface BuildEventInput {
  billingReason: 'subscription_cycle' | 'subscription_create' | 'subscription_update' | 'manual'
  amountPaid: number
  orgId: string
  secret: string
}

export interface SignedEvent {
  rawBody: string
  signature: string
}

export function buildSignedInvoiceEvent(input: BuildEventInput): SignedEvent {
  const invoiceId = `in_smoke_${randomUUID().slice(0, 8)}`
  const subId = `sub_smoke_${randomUUID().slice(0, 8)}`
  const now = Math.floor(Date.now() / 1000)
  const event = {
    id: `evt_smoke_${randomUUID().slice(0, 8)}`,
    object: 'event',
    api_version: '2024-06-20',
    created: now,
    type: 'invoice.payment_succeeded',
    data: {
      object: {
        id: invoiceId,
        object: 'invoice',
        amount_paid: input.amountPaid,
        billing_reason: input.billingReason,
        subscription: {
          id: subId,
          metadata: { org_id: input.orgId },
        },
        lines: {
          data: [{
            id: `il_${randomUUID().slice(0, 8)}`,
            price: { id: PRICE_ID_MONTHLY, recurring: { interval: 'month' } },
            period: { start: now - 2592000, end: now },
          }],
        },
      },
    },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  }
  const rawBody = JSON.stringify(event)
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: rawBody,
    secret: input.secret,
  })
  return { rawBody, signature }
}
