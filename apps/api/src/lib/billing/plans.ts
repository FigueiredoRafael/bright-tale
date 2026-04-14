/**
 * F3-001 — Plan catalog.
 *
 * Single source of truth for plan IDs, credit allotments, and feature gates.
 * Stripe price IDs come from env so dev/prod can point at different accounts.
 */

export type PlanId = 'free' | 'starter' | 'creator' | 'pro';
export type BillingCycle = 'monthly' | 'annual';

export interface PlanDefinition {
  id: PlanId;
  displayName: string;
  credits: number;
  usdMonthly: number;
  usdAnnual: number;            // price charged per MONTH when billed annually
  features: string[];
  stripePriceId: { monthly: string | null; annual: string | null };
}

function env(key: string): string | null {
  return process.env[key] ?? null;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    displayName: 'Free',
    credits: 1000,
    usdMonthly: 0,
    usdAnnual: 0,
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
    features: [
      'Audio narration (TTS)',
      'Deep research with sources',
      'Shorts + podcast scripts',
      'YouTube Intelligence (basic)',
      '3 WordPress sites',
      'Bulk generation (up to 3)',
    ],
    stripePriceId: {
      monthly: env('STRIPE_PRICE_STARTER_MONTHLY'),
      annual: env('STRIPE_PRICE_STARTER_ANNUAL'),
    },
  },
  creator: {
    id: 'creator',
    displayName: 'Creator',
    credits: 15_000,
    usdMonthly: 29,
    usdAnnual: 23,
    features: [
      'Dark channel video generation',
      'YouTube Intelligence (full)',
      'Premium models (Claude Sonnet/Opus)',
      'Voice cloning',
      'Express mode (1-click)',
      'Custom endpoints (3)',
      'YouTube publishing',
    ],
    stripePriceId: {
      monthly: env('STRIPE_PRICE_CREATOR_MONTHLY'),
      annual: env('STRIPE_PRICE_CREATOR_ANNUAL'),
    },
  },
  pro: {
    id: 'pro',
    displayName: 'Pro',
    credits: 50_000,
    usdMonthly: 99,
    usdAnnual: 79,
    features: [
      'AI video clips (Runway/Kling)',
      'Team collaboration (3 seats)',
      'Custom AI prompts',
      'Unlimited WordPress sites',
      'API access + webhooks',
      'Multi-brand kits',
      'Analytics avançado',
    ],
    stripePriceId: {
      monthly: env('STRIPE_PRICE_PRO_MONTHLY'),
      annual: env('STRIPE_PRICE_PRO_ANNUAL'),
    },
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
    stripePriceId: env('STRIPE_PRICE_ADDON_1K'),
  },
  pack_medium: {
    id: 'pack_medium',
    credits: 5_000,
    usdPrice: 20,
    stripePriceId: env('STRIPE_PRICE_ADDON_5K'),
  },
  pack_large: {
    id: 'pack_large',
    credits: 15_000,
    usdPrice: 50,
    stripePriceId: env('STRIPE_PRICE_ADDON_15K'),
  },
};

export function addonFromPriceId(priceId: string): AddonPack | null {
  for (const pack of Object.values(ADDON_PACKS)) {
    if (pack.stripePriceId === priceId) return pack;
  }
  return null;
}
