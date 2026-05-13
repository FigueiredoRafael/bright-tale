/**
 * Smart Model Router (F2-012, F2-029).
 *
 * Routes AI calls to the best provider/model based on:
 * - Stage (brainstorm/research → cheap+fast, production → high quality)
 * - Tier (free, standard, premium, ultra)
 * - Provider availability (skip if API key missing OR disabled in DB)
 * - Runtime fallback: getProviderChain returns an ordered list so callers can
 *   retry on 429/5xx without losing context.
 */

import type { AgentType, AIProvider, GenerateContentParams, TokenUsage } from './provider.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GeminiProvider } from './providers/gemini.js';
import { OllamaProvider } from './providers/ollama.js';
import { logEngineCall } from './engine-log.js';
import { logAiUsage } from '../axiom.js';
import { sleepCancellable } from './abortable.js';
import { createServiceClient } from '../supabase/index.js';
import { decrypt } from '../crypto.js';
import { captureError } from '../logger.js';

// ---------------------------------------------------------------------------
// Active-provider cache
// ---------------------------------------------------------------------------
// Cached DB rows for providers where is_active = true.
// TTL: 60 seconds. Module-level to avoid N+1 queries across requests.

interface ActiveProviderEntry {
  provider: string;
  /** Decrypted API key from DB, or null if placeholder / decryption failed. */
  apiKey: string | null;
}

interface ActiveProviderCache {
  entries: ActiveProviderEntry[];
  fetchedAt: number;
}

let activeProviderCache: ActiveProviderCache | null = null;
const CACHE_TTL_MS = 60_000;

// Sentinels stored in the DB when the admin has not supplied a real key.
const PLACEHOLDER_VALUES = new Set(['__placeholder__', '__manual__']);

/**
 * Fetch (or return cached) active provider entries from `ai_provider_configs`.
 * Falls back to `null` on any DB/decryption error so callers degrade gracefully
 * to env-var logic.
 */
async function getActiveProviders(): Promise<ActiveProviderEntry[] | null> {
  const now = Date.now();
  if (activeProviderCache !== null && now - activeProviderCache.fetchedAt < CACHE_TTL_MS) {
    return activeProviderCache.entries;
  }

  try {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from('ai_provider_configs')
      .select('id, provider, api_key, is_active')
      .eq('is_active', true);

    if (error) {
      captureError(new Error(`ai-router: failed to fetch ai_provider_configs: ${error.message}`), {
        code: error.code,
      });
      return null;
    }

    const rows = (data ?? []) as { id: string; provider: string; api_key: string; is_active: boolean }[];

    const entries: ActiveProviderEntry[] = rows.map((row) => {
      if (PLACEHOLDER_VALUES.has(row.api_key)) {
        return { provider: row.provider, apiKey: null };
      }
      try {
        const aad = `ai_provider_configs:api_key:${row.id}:admin`;
        const decrypted = decrypt(row.api_key, { aad });
        return { provider: row.provider, apiKey: decrypted };
      } catch (decryptErr) {
        captureError(
          decryptErr instanceof Error ? decryptErr : new Error(String(decryptErr)),
          { rowId: row.id, provider: row.provider },
        );
        return { provider: row.provider, apiKey: null };
      }
    });

    activeProviderCache = { entries, fetchedAt: now };
    return entries;
  } catch (err) {
    captureError(
      err instanceof Error ? err : new Error(String(err)),
      { context: 'getActiveProviders' },
    );
    return null;
  }
}

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
    assets: { provider: 'ollama', model: 'gemma4:e4b' },
  },
  free: {
    brainstorm: { provider: 'gemini', model: 'gemini-2.5-flash' },
    research: { provider: 'gemini', model: 'gemini-2.5-flash' },
    production: { provider: 'gemini', model: 'gemini-2.5-flash' },
    review: { provider: 'gemini', model: 'gemini-2.5-flash' },
    assets: { provider: 'gemini', model: 'gemini-2.5-flash' },
  },
  standard: {
    brainstorm: { provider: 'gemini', model: 'gemini-2.5-flash' },
    research: { provider: 'gemini', model: 'gemini-2.5-flash' },
    production: { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514' },
    review: { provider: 'gemini', model: 'gemini-2.5-flash' },
    assets: { provider: 'gemini', model: 'gemini-2.5-flash' },
  },
  premium: {
    brainstorm: { provider: 'openai', model: 'gpt-4o' },
    research: { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514' },
    production: { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514' },
    review: { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514' },
    assets: { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514' },
  },
  ultra: {
    brainstorm: { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514' },
    research: { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514' },
    production: { provider: 'anthropic', model: 'claude-opus-4-5-20250514' },
    review: { provider: 'anthropic', model: 'claude-opus-4-5-20250514' },
    assets: { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514' },
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
  assets: 30,
};

/**
 * Resolve the API key for a given provider name.
 *
 * Priority:
 *  1. If the DB cache is available AND the provider row does NOT appear in the
 *     active set → return null (admin toggled it off; do not fall back to env).
 *  2. If the DB cache has a real decrypted key for this provider → use it.
 *  3. Otherwise fall through to the env-var key (graceful degradation when the
 *     DB is unreachable, or when no DB row exists yet).
 *
 * `activeEntries` is pre-fetched once per `getProviderChain` call so we avoid
 * re-querying the cache inside each loop iteration.
 */
function resolveApiKey(
  providerName: string,
  activeEntries: ActiveProviderEntry[] | null,
): { key: string; fromDb: boolean } | null {
  if (activeEntries !== null) {
    const dbRow = activeEntries.find((e) => e.provider === providerName);
    if (dbRow === undefined) {
      // Provider not in active set — admin has disabled it (or it was never
      // added). Skip entirely; do NOT fall through to env var.
      return null;
    }
    if (dbRow.apiKey !== null) {
      // DB row has a real (decrypted) key — use it with priority.
      return { key: dbRow.apiKey, fromDb: true };
    }
    // Row is active but has a placeholder key → fall through to env var.
  }

  // Env-var fallback (DB unavailable, or active row uses __manual__ key).
  switch (providerName) {
    case 'openai': {
      const key = process.env.OPENAI_API_KEY;
      return key ? { key, fromDb: false } : null;
    }
    case 'anthropic': {
      const key = process.env.ANTHROPIC_API_KEY;
      return key ? { key, fromDb: false } : null;
    }
    case 'gemini': {
      const key = process.env.GOOGLE_AI_KEY ?? process.env.GEMINI_API_KEY;
      return key ? { key, fromDb: false } : null;
    }
    default:
      return null;
  }
}

function createProvider(
  providerName: string,
  model: string,
  activeEntries: ActiveProviderEntry[] | null,
): AIProvider | null {
  // Ollama is local — no API key and no DB toggle (infra-level concern).
  if (providerName === 'ollama') {
    // No API key required — assumes a local Ollama server. We can't probe it
    // here without a network call, so we always return a provider; if the
    // server isn't running, generateContent will surface a network error
    // (which is retryable in the fallback chain).
    return new OllamaProvider({ model });
  }

  const resolved = resolveApiKey(providerName, activeEntries);
  if (resolved === null) return null;

  switch (providerName) {
    case 'openai':
      return new OpenAIProvider(resolved.key, { model });
    case 'anthropic':
      return new AnthropicProvider(resolved.key, { model });
    case 'gemini':
      return new GeminiProvider(resolved.key, { model });
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
    draftId?: string | null;
    sessionType: string;
  };
}

/**
 * Returns the ordered list of provider routes to try for a (stage, tier).
 * Filters out providers that are disabled in `ai_provider_configs` or that
 * have no API key configured.
 *
 * If `options.provider` is set, that becomes the primary route (with model
 * override or DEFAULT_MODELS lookup), and the rest of the tier's chain is
 * appended as fallbacks.
 */
export async function getProviderChain(
  stage: AgentType,
  tier: string = 'standard',
  options: ChainOptions = {},
): Promise<ProviderRoute[]> {
  const routeTable = ROUTE_TABLE[tier] ?? ROUTE_TABLE.standard;
  const tierPrimary = routeTable[stage];

  // Fetch active-provider list once for this chain build (result is cached).
  const activeEntries = await getActiveProviders();

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
    const provider = createProvider(name, model, activeEntries);
    if (provider) chain.push({ provider, model, providerName: name });
  }

  return chain;
}

/**
 * Backwards-compatible single-provider getter. Returns the FIRST configured
 * route in the chain; throws if none.
 */
export async function getRouteForStage(stage: AgentType, tier: string = 'standard'): Promise<ProviderRoute> {
  const chain = await getProviderChain(stage, tier);
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
  // Malformed JSON from the model (truncated stream, stray trailing comma,
  // missing quote, etc.) — V8's JSON.parse throws "Expected ',' or ']'…",
  // "Unexpected token … in JSON", etc. Almost always transient; one retry
  // with the same model produces a clean payload.
  if (
    (err as { name?: string })?.name === 'SyntaxError' &&
    (msg.includes('json') || msg.includes('position') || msg.includes('token'))
  ) {
    return true;
  }
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
  const chain = await getProviderChain(stage, tier, options);
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
  const startTime = Date.now();

  let lastErr: unknown;
  for (let i = 0; i < chain.length; i++) {
    const route = chain[i];
    let attempt = 0;
    while (attempt <= SAME_PROVIDER_RETRIES) {
      try {
        const result = await route.provider.generateContent(params);
        const usage = route.provider.lastUsage;
        const durationMs = Date.now() - startTime;
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
            durationMs,
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
          });
        }
        logAiUsage({
          userId: options.logContext?.userId ?? null,
          orgId: options.logContext?.orgId ?? null,
          action: stage,
          provider: route.providerName,
          model: route.model,
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          totalTokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
          durationMs,
          status: 'success',
          error: null,
          metadata: {
            sessionId: options.logContext?.sessionId,
            draftId: options.logContext?.draftId,
            projectId: options.logContext?.projectId,
            prompt: params.userMessage,
            response: typeof result === 'string' ? result : JSON.stringify(result),
          },
        });
        return {
          result,
          providerName: route.providerName,
          model: route.model,
          attempts: i + 1,
          usage,
        };
      } catch (err) {
        // Abort errors (from signal) rethrow immediately — do not retry
        if (err instanceof Error && err.name === 'AbortError') throw err;
        if (err && typeof err === 'object' && 'noRetry' in err) throw err;

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
          await sleepCancellable(baseDelayMs * Math.pow(2, attempt), params.signal);
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
  const errMsg = String((lastErr as { message?: string })?.message ?? lastErr);
  logAiUsage({
    userId: options.logContext?.userId ?? null,
    orgId: options.logContext?.orgId ?? null,
    action: stage,
    provider: chain[0]?.providerName ?? 'unknown',
    model: chain[0]?.model ?? 'unknown',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    durationMs: Date.now() - startTime,
    status: 'error',
    error: errMsg,
    metadata: {
      sessionId: options.logContext?.sessionId,
      draftId: options.logContext?.draftId,
      projectId: options.logContext?.projectId,
      prompt: params.userMessage,
    },
  });
  throw lastErr;
}
