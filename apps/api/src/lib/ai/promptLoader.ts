/**
 * F2-027 — Agent prompt loader.
 * Fetches `instructions` from `agent_prompts` by slug with in-memory TTL cache.
 * Admins editing prompts in web/admin see the change on the next cache miss.
 */
import { createServiceClient } from '../supabase/index.js';

interface CacheEntry {
  instructions: string;
  fetchedAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

export async function loadAgentPrompt(slug: string): Promise<string | null> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) {
    return hit.instructions;
  }

  const sb = createServiceClient();
  const { data, error } = await sb
    .from('agent_prompts')
    .select('instructions')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data?.instructions) return null;

  cache.set(slug, { instructions: data.instructions, fetchedAt: Date.now() });
  return data.instructions;
}

export function clearPromptCache(slug?: string): void {
  if (slug) cache.delete(slug);
  else cache.clear();
}
