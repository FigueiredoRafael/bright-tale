/**
 * Smart Model Router (F2-012, F2-029).
 *
 * Routes AI calls to the best provider/model based on:
 * - Stage (brainstorm/research → cheap+fast, production → high quality)
 * - Tier (free, standard, premium, ultra)
 * - Provider availability (skip if API key missing)
 * - Runtime fallback: getProviderChain returns an ordered list so callers can
 *   retry on 429/5xx without losing context.
 */

import type { AgentType, AIProvider, GenerateContentParams } from './provider.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GeminiProvider } from './providers/gemini.js';

interface ModelConfig {
  provider: string;
  model: string;
}

// Tier × stage → primary route. Free tier uses Gemini (generous free quota).
const ROUTE_TABLE: Record<string, Record<AgentType, ModelConfig>> = {
  free: {
    brainstorm: { provider: 'gemini', model: 'gemini-2.5-flash' },
    research: { provider: 'gemini', model: 'gemini-2.5-flash' },
    production: { provider: 'gemini', model: 'gemini-2.5-flash' },
    review: { provider: 'gemini', model: 'gemini-2.5-flash' },
  },
  standard: {
    brainstorm: { provider: 'gemini', model: 'gemini-2.5-flash' },
    research: { provider: 'gemini', model: 'gemini-2.5-flash' },
    production: { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514' },
    review: { provider: 'gemini', model: 'gemini-2.5-flash' },
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

// Runtime fallback order: when the primary provider errors at call time,
// try these next (in order). Always try Gemini last because it's free.
const FALLBACK_ORDER: Record<string, string[]> = {
  openai: ['anthropic', 'gemini'],
  anthropic: ['openai', 'gemini'],
  gemini: ['anthropic', 'openai'],
};

// Default model per provider when we fall back from a different provider.
const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-5-20250514',
  gemini: 'gemini-2.5-flash',
};

// Credit costs per stage (debited per call; runtime fallback does NOT double-debit).
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
    case 'gemini': {
      const key = process.env.GOOGLE_AI_KEY ?? process.env.GEMINI_API_KEY;
      if (!key) return null;
      return new GeminiProvider(key, { model });
    }
    default:
      return null;
  }
}

interface ProviderRoute {
  provider: AIProvider;
  model: string;
  providerName: string;
}

interface ChainOptions {
  /** Explicit provider override (highest priority). Falls back to FALLBACK_ORDER if it errors. */
  provider?: string;
  /** Explicit model — only used together with provider override. */
  model?: string;
}

/**
 * Returns the ordered list of provider routes to try for a (stage, tier).
 * Filters out providers without an API key configured.
 *
 * If `options.provider` is set, that becomes the primary route (with model
 * override or DEFAULT_MODELS lookup), and the rest of the tier's chain is
 * appended as fallbacks.
 */
export function getProviderChain(
  stage: AgentType,
  tier: string = 'standard',
  options: ChainOptions = {},
): ProviderRoute[] {
  const routeTable = ROUTE_TABLE[tier] ?? ROUTE_TABLE.standard;
  const tierPrimary = routeTable[stage];

  // Start the chain with the explicit override (if any), then the tier primary,
  // then the tier primary's standard fallback order.
  const order: string[] = [];
  if (options.provider) order.push(options.provider);
  order.push(tierPrimary.provider);
  for (const fb of FALLBACK_ORDER[options.provider ?? tierPrimary.provider] ?? []) {
    order.push(fb);
  }

  const seen = new Set<string>();
  const chain: ProviderRoute[] = [];
  for (const name of order) {
    if (seen.has(name)) continue;
    seen.add(name);
    const model =
      name === options.provider && options.model
        ? options.model
        : name === tierPrimary.provider
          ? tierPrimary.model
          : DEFAULT_MODELS[name];
    if (!model) continue;
    const provider = createProvider(name, model);
    if (provider) chain.push({ provider, model, providerName: name });
  }

  return chain;
}

/**
 * Backwards-compatible single-provider getter. Returns the FIRST configured
 * route in the chain; throws if none.
 */
export function getRouteForStage(stage: AgentType, tier: string = 'standard'): ProviderRoute {
  const chain = getProviderChain(stage, tier);
  if (chain.length === 0) {
    throw new Error(
      `No AI provider available for stage=${stage}, tier=${tier}. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_AI_KEY.`,
    );
  }
  return chain[0];
}

/**
 * Errors that should trigger a fallback to the next provider.
 * Quota/rate-limit (429), server errors (5xx), and network errors are retryable.
 * Validation/auth errors (400/401/403) are NOT retryable — the caller's input
 * is the problem, not the provider.
 */
function isRetryableError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err ?? '').toLowerCase();
  if (msg.includes('429')) return true;
  if (msg.includes('quota')) return true;
  if (msg.includes('rate limit')) return true;
  if (msg.includes('overloaded')) return true;
  if (/\b5\d{2}\b/.test(msg)) return true;
  if (msg.includes('econn') || msg.includes('etimedout') || msg.includes('network')) return true;
  return false;
}

/**
 * Run generateContent with runtime fallback through the provider chain.
 * Stops at the first success; rethrows the LAST error if every provider fails.
 */
export async function generateWithFallback(
  stage: AgentType,
  tier: string,
  params: GenerateContentParams,
  options: ChainOptions = {},
): Promise<{ result: unknown; providerName: string; model: string; attempts: number }> {
  const chain = getProviderChain(stage, tier, options);
  if (chain.length === 0) {
    throw new Error(
      `No AI provider available for stage=${stage}, tier=${tier}. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_AI_KEY.`,
    );
  }

  let lastErr: unknown;
  for (let i = 0; i < chain.length; i++) {
    const route = chain[i];
    try {
      const result = await route.provider.generateContent(params);
      return { result, providerName: route.providerName, model: route.model, attempts: i + 1 };
    } catch (err) {
      lastErr = err;
      if (i === chain.length - 1) break;
      if (!isRetryableError(err)) break;
    }
  }
  throw lastErr;
}
