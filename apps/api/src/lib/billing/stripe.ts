/**
 * Stripe v22's CJS declaration entry resolves `Stripe` as a namespace (not
 * class+namespace), so naked `Stripe` type annotations fail on Vercel with
 * TS2709 despite compiling locally under `moduleResolution: "Bundler"`.
 * Deriving the instance type via `ReturnType<>` off a factory sidesteps
 * the type half; the value-level `new Stripe(key)` still carries a
 * construct signature and works unchanged.
 */
import Stripe from 'stripe';

function createStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Configure it in the deployment environment (or apps/api/.env.local for local dev).',
    );
  }
  return new Stripe(key);
}

type StripeClient = ReturnType<typeof createStripeClient>;

let _client: StripeClient | null = null;

export function getStripe(): StripeClient {
  if (!_client) _client = createStripeClient();
  return _client;
}
