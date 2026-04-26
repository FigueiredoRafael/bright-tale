import type { FastifyInstance } from 'fastify';
import { createServiceClient } from '../lib/supabase/index.js';

/**
 * Currency rates refresh — internal cron route.
 *
 * Pulls USD→{BRL,EUR} from a free public FX API and upserts into
 * `currency_rates`. Stripe gives us USD on webhooks; this is presentation-
 * layer only.
 *
 * Trigger: Vercel Cron (vercel.json `crons`) once per day, OR manual
 * `POST /api/currency-refresh` with the internal key.
 *
 * Source: AwesomeAPI (https://docs.awesomeapi.com.br/api-de-moedas) — no
 * key required, gracefully tolerates downtime via the seeded fallback row.
 */

const SUPPORTED = ['BRL', 'EUR'] as const;
type Supported = (typeof SUPPORTED)[number];

interface AwesomeAPIQuote {
  bid: string; // BRL per 1 USD (stringified number)
}

async function fetchUsdRate(target: Supported): Promise<number | null> {
  // AwesomeAPI uses USD-{target} pairs (e.g., USD-BRL).
  const url = `https://economia.awesomeapi.com.br/json/last/USD-${target}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      // 5s timeout via AbortController
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, AwesomeAPIQuote>;
    const key = `USD${target}`;
    const bid = json[key]?.bid;
    if (!bid) return null;
    const rate = Number(bid);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return rate;
  } catch {
    return null;
  }
}

export async function currencyRefreshRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.post('/currency-refresh', async (request, reply) => {
    // Cast to untyped client: `currency_rates` is a new table (M-000) not yet
    // in the generated Database type. Run `npm run db:types` after the
    // migration is applied to drop the cast.
    const supabase = createServiceClient() as unknown as {
      from: (table: string) => {
        upsert: (
          values: Record<string, unknown>,
          options: { onConflict: string },
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    const updates: { currency: string; rate_to_usd: number; status: string }[] = [];

    for (const target of SUPPORTED) {
      const rate = await fetchUsdRate(target);
      if (rate === null) {
        updates.push({ currency: target, rate_to_usd: 0, status: 'fetch_failed' });
        request.log.warn({ target }, 'currency rate fetch failed');
        continue;
      }
      const { error } = await supabase
        .from('currency_rates')
        .upsert(
          { currency: target, rate_to_usd: rate, source: 'awesomeapi', fetched_at: new Date().toISOString() },
          { onConflict: 'currency' },
        );
      if (error) {
        updates.push({ currency: target, rate_to_usd: rate, status: 'upsert_failed' });
        request.log.error({ target, error: error.message }, 'currency upsert failed');
        continue;
      }
      updates.push({ currency: target, rate_to_usd: rate, status: 'ok' });
    }

    return reply.send({ data: { updates }, error: null });
  });
}
