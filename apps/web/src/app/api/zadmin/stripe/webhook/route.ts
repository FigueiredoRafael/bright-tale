/**
 * M-001 — Stripe webhook handler.
 *
 * TODO: Plug Stripe keys when ready:
 *   STRIPE_SECRET_KEY=sk_live_...
 *   STRIPE_WEBHOOK_SECRET=whsec_...
 *
 * Handles:
 *   checkout.session.completed  → activate plan + credit tokens
 *   invoice.payment_succeeded   → renew cycle + credit tokens
 *   invoice.payment_failed      → notify user (M-005)
 *   customer.subscription.deleted → downgrade to free
 *   charge.refunded             → revert credits (M-007)
 */
import { NextRequest, NextResponse } from 'next/server';
// import Stripe from 'stripe'; // TODO: uncomment when STRIPE_SECRET_KEY is set

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey || !webhookSecret) {
    return NextResponse.json(
      { error: 'Stripe not configured — set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET' },
      { status: 503 },
    );
  }

  // TODO: implement when Stripe keys are available
  // const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-04-10' });
  // const sig = req.headers.get('stripe-signature') ?? '';
  // const body = await req.text();
  // let event: Stripe.Event;
  // try {
  //   event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  // } catch (err) {
  //   return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  // }
  // switch (event.type) {
  //   case 'checkout.session.completed': ...
  //   case 'invoice.payment_succeeded': ...
  //   case 'invoice.payment_failed': ...
  //   case 'customer.subscription.deleted': ...
  //   case 'charge.refunded': ...
  // }

  return NextResponse.json({ received: true, status: 'stub — awaiting Stripe keys' });
}
