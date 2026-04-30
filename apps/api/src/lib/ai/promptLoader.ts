/**
 * F2-027 — Agent prompt loader.
 * Fetches `instructions` and `tools_json` from `agent_prompts` by slug
 * with an in-memory TTL cache. Admins editing prompts in web/admin see the
 * change on the next cache miss.
 */
import { createServiceClient } from '../supabase/index.js';

interface AgentConfig {
  instructions: string;
  tools: string[];
  recommended_provider: string | null;
  recommended_model: string | null;
}

interface CacheEntry extends AgentConfig {
  fetchedAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

export async function loadAgentConfig(slug: string): Promise<AgentConfig> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) {
    return { instructions: hit.instructions, tools: hit.tools, recommended_provider: hit.recommended_provider, recommended_model: hit.recommended_model };
  }

  const sb = createServiceClient();
  const { data, error } = await sb
    .from('agent_prompts')
    .select('instructions, tools_json, recommended_provider, recommended_model')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) return { instructions: '', tools: [], recommended_provider: null, recommended_model: null };

  const entry: CacheEntry = {
    instructions: data.instructions ?? '',
    tools: Array.isArray(data.tools_json) ? (data.tools_json as string[]) : [],
    recommended_provider: (data as Record<string, unknown>).recommended_provider as string | null ?? null,
    recommended_model: (data as Record<string, unknown>).recommended_model as string | null ?? null,
    fetchedAt: Date.now(),
  };
  cache.set(slug, entry);
  return { instructions: entry.instructions, tools: entry.tools, recommended_provider: entry.recommended_provider, recommended_model: entry.recommended_model };
}

/**
 * Resolve the provider/model to use for a call.
 * Priority: event (user explicit) → admin recommended → undefined (router falls to ROUTE_TABLE).
 */
export function resolveProviderOverride(
  eventProvider: string | undefined,
  eventModel: string | undefined,
  config: Pick<AgentConfig, 'recommended_provider' | 'recommended_model'>,
): { provider: string | undefined; model: string | undefined } {
  const provider = eventProvider ?? config.recommended_provider ?? undefined;
  // Only carry the admin model when we're actually using the admin provider;
  // if the user picked their own provider, let the router pick the default model for it.
  const model = eventModel ?? (!eventProvider ? config.recommended_model ?? undefined : undefined);
  return { provider, model };
}

/** Backwards-compatible shim — returns only the instructions string. */
export async function loadAgentPrompt(slug: string): Promise<string | null> {
  const config = await loadAgentConfig(slug);
  return config.instructions || null;
}

export function clearPromptCache(slug?: string): void {
  if (slug) cache.delete(slug);
  else cache.clear();
}
