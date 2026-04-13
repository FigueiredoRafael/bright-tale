/**
 * Smart Model Router (F2-012)
 *
 * Routes AI calls to the best provider/model based on:
 * - Stage (brainstorm → fast/cheap, production → high quality)
 * - Model tier (standard, premium, ultra)
 * - Provider availability (fallback if one fails)
 *
 * Model tiers:
 *   standard  → cheapest suitable model per stage
 *   premium   → balanced quality/cost
 *   ultra     → best available model
 */

import type { AgentType, AIProvider } from './provider.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';

interface ModelConfig {
  provider: string;
  model: string;
}

// Model routing table: [tier][stage] → { provider, model }
const ROUTE_TABLE: Record<string, Record<AgentType, ModelConfig>> = {
  standard: {
    brainstorm: { provider: 'openai', model: 'gpt-4o-mini' },
    research: { provider: 'openai', model: 'gpt-4o-mini' },
    production: { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514' },
    review: { provider: 'openai', model: 'gpt-4o-mini' },
  },
  premium: {
    brainstorm: { provider: 'openai', model: 'gpt-4o' },
    research: { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514' },
    production: { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514' },
    review: { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514' },
  },
  ultra: {
    brainstorm: { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514' },
    research: { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514' },
    production: { provider: 'anthropic', model: 'claude-opus-4-5-20250514' },
    review: { provider: 'anthropic', model: 'claude-opus-4-5-20250514' },
  },
};

// Fallback order per provider
const FALLBACK_ORDER: Record<string, string[]> = {
  anthropic: ['openai'],
  openai: ['anthropic'],
};

// Credit costs per stage
export const STAGE_COSTS: Record<AgentType, number> = {
  brainstorm: 10,
  research: 30,
  production: 50,
  review: 20,
};

function createProvider(providerName: string, model: string): AIProvider | null {
  switch (providerName) {
    case 'openai': {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return null;
      return new OpenAIProvider(key, { model });
    }
    case 'anthropic': {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return null;
      return new AnthropicProvider(key, { model });
    }
    default:
      return null;
  }
}

/**
 * Get the best AI provider for a given stage and tier.
 * Falls back to other providers if the primary one isn't configured.
 */
export function getRouteForStage(
  stage: AgentType,
  tier: string = 'standard',
): { provider: AIProvider; model: string; providerName: string } {
  const routeTable = ROUTE_TABLE[tier] ?? ROUTE_TABLE.standard;
  const route = routeTable[stage];

  // Try primary provider
  const primary = createProvider(route.provider, route.model);
  if (primary) {
    return { provider: primary, model: route.model, providerName: route.provider };
  }

  // Try fallbacks
  const fallbacks = FALLBACK_ORDER[route.provider] ?? [];
  for (const fallbackName of fallbacks) {
    // Use the fallback's model for the same tier/stage
    const fallbackRoute = ROUTE_TABLE[tier]?.[stage];
    const fallbackModel = fallbackRoute?.provider === fallbackName
      ? fallbackRoute.model
      : ROUTE_TABLE.standard[stage].model;

    const fallback = createProvider(fallbackName, fallbackModel);
    if (fallback) {
      return { provider: fallback, model: fallbackModel, providerName: fallbackName };
    }
  }

  throw new Error(`No AI provider available for stage=${stage}, tier=${tier}. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.`);
}
