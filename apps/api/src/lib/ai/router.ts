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

import type { AgentType, AIProvider, GenerateContentParams, TokenUsage } from './provider.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GeminiProvider } from './providers/gemini.js';
import { OllamaProvider } from './providers/ollama.js';
import { logEngineCall } from './engine-log.js';

interface ModelConfig {
  provider: string;
  model: string;
}

// Tier × stage → primary route. Free tier uses Gemini (generous free quota);
// `local` uses Ollama (zero cost, runs offline).
const ROUTE_TABLE: Record<string, Record<AgentType, ModelConfig>> = {
  local: {
    brainstorm: { provider: 'ollama', model: 'gemma4:e4b' },
    research: { provider: 'ollama', model: 'gemma4:e4b' },
    production: { provider: 'ollama', model: 'gemma4:e4b' },
    review: { provider: 'ollama', model: 'gemma4:e4b' },
  },
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
// try these next (in order). Ollama is local-only (no fallback to/from paid).
const FALLBACK_ORDER: Record<string, string[]> = {
  openai: ['anthropic', 'gemini'],
  anthropic: ['openai', 'gemini'],
  gemini: ['anthropic', 'openai'],
  ollama: [],
};

// Default model per provider when we fall back from a different provider.
const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-5-20250514',
  gemini: 'gemini-2.5-flash',
  ollama: 'gemma4:e4b',
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
    case 'ollama': {
      // No API key required — assumes a local Ollama server. We can't probe it
      // here without a network call, so we always return a provider; if the
      // server isn't running, generateContent will surface a network error
      // (which is retryable in the fallback chain).
      return new OllamaProvider({ model });
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
  /** Explicit provider override. By default the chain is JUST this provider (no
   *  paid fallbacks) so a user who picks a free tier doesn't accidentally get
   *  charged on another provider. Set `allowFallback: true` to re-enable. */
  provider?: string;
  /** Explicit model — only used together with provider override. */
  model?: string;
  /** When provider is set, allow falling back to other providers on errors. */
  allowFallback?: boolean;
  logContext?: {
    userId: string;
    orgId?: string | null;
    projectId?: string | null;
    channelId?: string | null;
    sessionId?: string | null;
    sessionType: string;
  };
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

  // Build the provider order:
  // - If user picked a provider WITHOUT allowFallback: chain is just that one.
  // - Otherwise: tier primary first, then its fallback chain.
  const order: string[] = [];
  if (options.provider && !options.allowFallback) {
    order.push(options.provider);
  } else {
    if (options.provider) order.push(options.provider);
    order.push(tierPrimary.provider);
    for (const fb of FALLBACK_ORDER[options.provider ?? tierPrimary.provider] ?? []) {
      order.push(fb);
    }
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
/** Should we try a different provider after this error? */
function isProviderFailover(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err ?? '').toLowerCase();
  // Quota / rate-limit / billing — this provider is unusable right now,
  // try the next one.
  if (msg.includes('429')) return true;
  if (msg.includes('quota')) return true;
  if (msg.includes('resource_exhausted')) return true;
  if (msg.includes('rate limit')) return true;
  if (msg.includes('credit balance')) return true;
  if (msg.includes('insufficient_quota')) return true;
  if (msg.includes('insufficient credits')) return true;
  if (msg.includes('billing')) return true;
  // Capacity / network issues — also worth trying a different provider.
  if (msg.includes('overloaded')) return true;
  if (msg.includes('unavailable')) return true;
  if (msg.includes('high demand')) return true;
  if (/\b5\d{2}\b/.test(msg)) return true;
  if (msg.includes('econn') || msg.includes('etimedout') || msg.includes('network')) return true;
  return false;
}

/** Worth retrying the SAME provider+model? Only for transient capacity blips,
 *  NOT for quota errors (those are hard limits — retrying just burns more). */
function shouldRetrySameProvider(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err ?? '').toLowerCase();
  if (msg.includes('overloaded')) return true;
  if (msg.includes('unavailable')) return true;
  if (msg.includes('high demand')) return true;
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
): Promise<{ result: unknown; providerName: string; model: string; attempts: number; usage?: TokenUsage }> {
  const chain = getProviderChain(stage, tier, options);
  if (chain.length === 0) {
    throw new Error(
      `No AI provider available for stage=${stage}, tier=${tier}. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_AI_KEY.`,
    );
  }

  // Per-provider in-place retries with exponential backoff. Catches transient
  // capacity errors (UNAVAILABLE, 503, brief 429 bursts) without forcing a
  // provider switch — important when the user explicitly picked a provider.
  const SAME_PROVIDER_RETRIES = 2;
  // 0 in tests, 800ms in prod. Tests can also set AI_RETRY_BASE_MS=0.
  const baseDelayMs = Number(process.env.AI_RETRY_BASE_MS ?? (process.env.NODE_ENV === 'test' ? 0 : 800));
  const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
  const startTime = Date.now();

  let lastErr: unknown;
  for (let i = 0; i < chain.length; i++) {
    const route = chain[i];
    let attempt = 0;
    while (attempt <= SAME_PROVIDER_RETRIES) {
      try {
        const result = await route.provider.generateContent(params);
        const usage = route.provider.lastUsage;
        if (options.logContext) {
          logEngineCall({
            ...options.logContext,
            stage,
            provider: route.providerName,
            model: route.model,
            input: {
              agentType: params.agentType,
              systemPrompt: params.systemPrompt,
              userMessage: params.userMessage,
            },
            output: typeof result === 'object' && result !== null ? result as Record<string, unknown> : { content: result },
            durationMs: Date.now() - startTime,
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
          });
        }
        return {
          result,
          providerName: route.providerName,
          model: route.model,
          attempts: i + 1,
          usage,
        };
      } catch (err) {
        lastErr = err;
        const message = String((err as { message?: string })?.message ?? err);
        const retrySame = shouldRetrySameProvider(err);
        console.warn(
          `[ai-router] provider=${route.providerName} model=${route.model} attempt=${attempt + 1}: ${message} (retrySame=${retrySame})`,
        );
        // Quota/billing errors short-circuit the per-provider retry loop —
        // retrying just burns more tokens against the same hard limit.
        if (!retrySame) break;
        if (attempt < SAME_PROVIDER_RETRIES) {
          await sleep(baseDelayMs * Math.pow(2, attempt));
          attempt++;
          continue;
        }
        break;
      }
    }
    if (i === chain.length - 1) break;
    if (!isProviderFailover(lastErr)) break;
  }
  if (options.logContext) {
    logEngineCall({
      ...options.logContext,
      stage,
      provider: chain[0]?.providerName ?? 'unknown',
      model: chain[0]?.model ?? 'unknown',
      input: {
        agentType: params.agentType,
        systemPrompt: params.systemPrompt,
        userMessage: params.userMessage,
      },
      durationMs: Date.now() - startTime,
      error: String((lastErr as { message?: string })?.message ?? lastErr),
    });
  }
  throw lastErr;
}
