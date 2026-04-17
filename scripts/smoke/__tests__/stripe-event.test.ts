import { describe, it, expect } from 'vitest'
import Stripe from 'stripe'
import { buildSignedInvoiceEvent, PRICE_ID_MONTHLY } from '../stripe-event.js'

const SECRET = 'whsec_test_secret'

describe('buildSignedInvoiceEvent', () => {
  it('produces a payload verifiable with stripe.webhooks.constructEvent', () => {
    const { rawBody, signature } = buildSignedInvoiceEvent({
      billingReason: 'subscription_cycle',
      amountPaid: 9900,
      orgId: 'org-123',
      secret: SECRET,
    })
    const stripe = new Stripe('sk_test_dummy', { apiVersion: '2024-06-20' as any })
    const event = stripe.webhooks.constructEvent(rawBody, signature, SECRET)
    expect(event.type).toBe('invoice.payment_succeeded')
    const invoice = event.data.object as { amount_paid: number; billing_reason: string }
    expect(invoice.amount_paid).toBe(9900)
    expect(invoice.billing_reason).toBe('subscription_cycle')
  })

  it('sets subscription.metadata.org_id', () => {
    const { rawBody } = buildSignedInvoiceEvent({
      billingReason: 'subscription_cycle',
      amountPaid: 9900,
      orgId: 'org-456',
      secret: SECRET,
    })
    const parsed = JSON.parse(rawBody)
    expect(parsed.data.object.subscription.metadata.org_id).toBe('org-456')
  })

  it('tags line_items with a known priceId', () => {
    const { rawBody } = buildSignedInvoiceEvent({
      billingReason: 'subscription_cycle',
      amountPaid: 9900,
      orgId: 'org-1',
      secret: SECRET,
    })
    const parsed = JSON.parse(rawBody)
    const line = parsed.data.object.lines.data[0]
    expect(line.price.id).toBe(PRICE_ID_MONTHLY)
  })
})
