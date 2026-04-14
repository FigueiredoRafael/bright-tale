/**
 * Singleton Stripe client. Throws a helpful error if the key is missing so
 * billing endpoints fail early with a clear message instead of silently.
 */
import Stripe from 'stripe';

let _client: Stripe | null = null;

export function getStripe(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY not set. Add it to apps/api/.env.local before using billing endpoints.',
    );
  }
  _client = new Stripe(key);
  return _client;
}
