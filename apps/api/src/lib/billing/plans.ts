/**
 * F3-001 / M-001 — Plan catalog.
 *
 * Single source of truth for plan IDs, credit allotments, and feature gates.
 * Stripe price IDs are loaded from the database (plan_configs table).
 * PLANS static object is kept as fallback when DB is unreachable.
 */
import { createServiceClient } from '../supabase/index.js';

export type PlanId = 'free' | 'starter' | 'creator' | 'pro';
export type BillingCycle = 'monthly' | 'annual';

export interface PlanDefinition {
  id: PlanId;
  displayName: string;
  credits: number;
  usdMonthly: number;
  usdAnnual: number;            // price charged per MONTH when billed annually
  displayPriceBrlMonthly?: number;
  displayPriceBrlAnnual?: number;
  features: string[];
  stripePriceId: { monthly: string | null; annual: string | null };
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    displayName: 'Free',
    credits: 1000,
    usdMonthly: 0,
    usdAnnual: 0,
    displayPriceBrlMonthly: 0,
    displayPriceBrlAnnual: 0,
    features: [
      'AI Brainstorming',
      'Blog post + video script',
      'Research agent',
      '1 WordPress site',
      'Image generation',
      'Standard models only',
    ],
    stripePriceId: { monthly: null, annual: null },
  },
  starter: {
    id: 'starter',
    displayName: 'Starter',
    credits: 5000,
    usdMonthly: 9,
    usdAnnual: 7,
    displayPriceBrlMonthly: 49,
    displayPriceBrlAnnual: 39,
    features: [
      'Audio narration (TTS)',
      'Deep research with sources',
      'Shorts + podcast scripts',
      'YouTube Intelligence (basic)',
      '3 WordPress sites',
      'Bulk generation (up to 3)',
    ],
    stripePriceId: { monthly: null, annual: null },
  },
  creator: {
    id: 'creator',
    displayName: 'Creator',
    credits: 15_000,
    usdMonthly: 29,
    usdAnnual: 23,
    displayPriceBrlMonthly: 149,
    displayPriceBrlAnnual: 119,
    features: [
      'Dark channel video generation',
      'YouTube Intelligence (full)',
      'Premium models (Claude Sonnet/Opus)',
      'Voice cloning',
      'Express mode (1-click)',
      'Custom endpoints (3)',
      'YouTube publishing',
    ],
    stripePriceId: { monthly: null, annual: null },
  },
  pro: {
    id: 'pro',
    displayName: 'Pro',
    credits: 50_000,
    usdMonthly: 99,
    usdAnnual: 79,
    displayPriceBrlMonthly: 499,
    displayPriceBrlAnnual: 399,
    features: [
      'AI video clips (Runway/Kling)',
      'Team collaboration (3 seats)',
      'Custom AI prompts',
      'Unlimited WordPress sites',
      'API access + webhooks',
      'Multi-brand kits',
      'Analytics avançado',
    ],
    stripePriceId: { monthly: null, annual: null },
  },
};

export function getPlan(id: PlanId): PlanDefinition {
  return PLANS[id] ?? PLANS.free;
}

/**
 * Reverse-lookup: given a Stripe price id, return the (plan, cycle) it maps to.
 * Used by webhook handlers to know which plan the user just subscribed to.
 */
export function planFromPriceId(priceId: string): { planId: PlanId; cycle: BillingCycle } | null {
  for (const plan of Object.values(PLANS)) {
    if (plan.stripePriceId.monthly === priceId) return { planId: plan.id, cycle: 'monthly' };
    if (plan.stripePriceId.annual === priceId) return { planId: plan.id, cycle: 'annual' };
  }
  return null;
}

type AnySupabase = ReturnType<typeof createServiceClient> & {
  from: (table: string) => ReturnType<ReturnType<typeof createServiceClient>['from']>;
};

/**
 * M-001 — Load plan configs from database (plan_configs + system_settings).
 * Falls back to the static PLANS object if the DB query fails.
 */
export async function loadPlanConfigs(): Promise<Record<PlanId, PlanDefinition>> {
  try {
    const sb = createServiceClient() as unknown as AnySupabase;
    const { data: rows } = await sb
      .from('plan_configs')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    if (!rows || (rows as unknown[]).length === 0) return PLANS;

    const { data: modeRow } = await sb
      .from('system_settings')
      .select('value')
      .eq('key', 'stripe_mode')
      .single();
    const mode = (modeRow as { value?: string } | null)?.value === 'live' ? 'live' : 'test';

    const rowList = rows as Record<string, unknown>[];
    const result: Partial<Record<PlanId, PlanDefinition>> = {};
    for (const row of rowList) {
      const planId = row['plan_id'] as PlanId;
      result[planId] = {
        id: planId,
        displayName: row['display_name'] as string,
        credits: row['credits'] as number,
        usdMonthly: (row['price_usd_monthly_cents'] as number) / 100,
        usdAnnual: (row['price_usd_annual_cents'] as number) / 100,
        displayPriceBrlMonthly: (row['display_price_brl_monthly'] as number) ?? 0,
        displayPriceBrlAnnual: (row['display_price_brl_annual'] as number) ?? 0,
        features: (row['features_json'] as string[]) ?? [],
        stripePriceId: {
          monthly: mode === 'live'
            ? ((row['stripe_price_id_monthly_live'] as string | null) ?? null)
            : ((row['stripe_price_id_monthly_test'] as string | null) ?? null),
          annual: mode === 'live'
            ? ((row['stripe_price_id_annual_live'] as string | null) ?? null)
            : ((row['stripe_price_id_annual_test'] as string | null) ?? null),
        },
      };
    }
    for (const planId of Object.keys(PLANS) as PlanId[]) {
      if (!result[planId]) result[planId] = PLANS[planId];
    }
    return result as Record<PlanId, PlanDefinition>;
  } catch {
    return PLANS;
  }
}

/**
 * M-001 — Async reverse-lookup using DB-loaded plan configs.
 */
export async function planFromPriceIdAsync(priceId: string): Promise<{ planId: PlanId; cycle: BillingCycle } | null> {
  const plans = await loadPlanConfigs();
  for (const plan of Object.values(plans)) {
    if (plan.stripePriceId.monthly === priceId) return { planId: plan.id, cycle: 'monthly' };
    if (plan.stripePriceId.annual === priceId) return { planId: plan.id, cycle: 'annual' };
  }
  return null;
}

/* ─── F3-005 Add-on packs (one-time purchase) ─────────────────────────── */

export interface AddonPack {
  id: string;
  credits: number;
  usdPrice: number;
  stripePriceId: string | null;
}

/**
 * Packs avulsos de créditos — compra única via Stripe Checkout em modo
 * `payment` (não assinatura). Granted via webhook `invoice.paid` + metadata.
 */
export const ADDON_PACKS: Record<string, AddonPack> = {
  pack_small: {
    id: 'pack_small',
    credits: 1_000,
    usdPrice: 5,
    stripePriceId: process.env['STRIPE_PRICE_ADDON_1K'] ?? null,
  },
  pack_medium: {
    id: 'pack_medium',
    credits: 5_000,
    usdPrice: 20,
    stripePriceId: process.env['STRIPE_PRICE_ADDON_5K'] ?? null,
  },
  pack_large: {
    id: 'pack_large',
    credits: 15_000,
    usdPrice: 50,
    stripePriceId: process.env['STRIPE_PRICE_ADDON_15K'] ?? null,
  },
};

export function addonFromPriceId(priceId: string): AddonPack | null {
  for (const pack of Object.values(ADDON_PACKS)) {
    if (pack.stripePriceId === priceId) return pack;
  }
  return null;
}
