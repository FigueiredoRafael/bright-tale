/**
 * F2-036 — Async research generation with progress events.
 * Mirrors brainstorm-generate pattern.
 */
import { inngest } from './client.js';
import { generateWithFallback } from '../lib/ai/router.js';
import { loadAgentPrompt } from '../lib/ai/promptLoader.js';
import { debitCredits } from '../lib/credits.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { emitJobEvent } from './emitter.js';

const LEVEL_COSTS: Record<'surface' | 'medium' | 'deep', number> = {
  surface: 60,
  medium: 100,
  deep: 180,
};

interface ResearchGenerateEvent {
  name: 'research/generate';
  data: {
    sessionId: string;
    orgId: string;
    userId: string;
    channelId: string | null;
    ideaId: string | null;
    level: 'surface' | 'medium' | 'deep';
    inputJson: Record<string, unknown>;
    modelTier: string;
    provider?: 'gemini' | 'openai' | 'anthropic' | 'ollama';
    model?: string;
  };
}

/**
 * Recursive search for the cards array. Agents nest output in arbitrary keys
 * (BC_RESEARCH_OUTPUT.cards, output.cards, sources, citations, etc.) — small
 * local models in particular love to invent wrappers. Find the first array
 * whose items look like research cards (have title/quote/claim/url/source).
 */
function normalizeCards(raw: unknown): Array<Record<string, unknown>> {
  function looksLikeCard(item: unknown): boolean {
    if (!item || typeof item !== 'object') return false;
    const o = item as Record<string, unknown>;
    return (
      typeof o.title === 'string' ||
      typeof o.quote === 'string' ||
      typeof o.claim === 'string' ||
      typeof o.url === 'string' ||
      typeof o.source === 'string' ||
      typeof o.author === 'string'
    );
  }
  function find(node: unknown, depth = 0): Array<Record<string, unknown>> | null {
    if (depth > 6) return null;
    if (Array.isArray(node)) {
      if (node.length > 0 && node.some(looksLikeCard)) return node as Array<Record<string, unknown>>;
      return null;
    }
    if (node && typeof node === 'object') {
      for (const v of Object.values(node as Record<string, unknown>)) {
        const found = find(v, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }
  return find(raw) ?? [];
}

export const researchGenerate = inngest.createFunction(
  {
    id: 'research-generate',
    retries: 0,
    triggers: [{ event: 'research/generate' }],
  },
  async ({ event, step }: { event: ResearchGenerateEvent; step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => {
    const { sessionId, orgId, userId, channelId, ideaId, level, inputJson, modelTier, provider, model } = event.data;
    const sb = createServiceClient();

    try {
      await step.run('emit-loading-prompt', async () => {
        await emitJobEvent(sessionId, 'research', 'loading_prompt', 'Carregando agente research…');
      });

      const systemPrompt = (await step.run('load-prompt', async () => {
        const base = (await loadAgentPrompt('research')) ?? '';
        return `${base}\n\nLevel directive: ${(inputJson as { instruction?: string }).instruction ?? ''}`.trim();
      })) as string;

      await step.run('emit-calling-provider', async () => {
        const label = provider ? `${provider}${model ? ` (${model})` : ''}` : modelTier;
        await emitJobEvent(sessionId, 'research', 'calling_provider', `Pesquisando com ${label}…`, { provider, model, level });
      });

      const result = (await step.run('call-provider', async () => {
        const { result } = await generateWithFallback(
          'research',
          modelTier,
          {
            agentType: 'research',
            input: inputJson,
            schema: null,
            systemPrompt,
          },
          { provider, model },
        );
        return result;
      })) as unknown;

      await step.run('emit-parsing', async () => {
        await emitJobEvent(sessionId, 'research', 'parsing_output', 'Organizando fontes e citações…');
      });

      const cards = normalizeCards(result);

      await step.run('emit-saving', async () => {
        await emitJobEvent(sessionId, 'research', 'saving', `Salvando ${cards.length} cards de pesquisa…`, { count: cards.length });
      });

      await step.run('persist', async () => {
        await (sb.from('research_sessions') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        })
          .update({ status: 'completed', cards_json: cards })
          .eq('id', sessionId);

        const charge = provider === 'ollama' ? 0 : LEVEL_COSTS[level];
        if (charge > 0) {
          await debitCredits(orgId, userId, `research-${level}`, 'text', charge, {
            channelId,
            ideaId,
            provider,
          });
        }
      });

      await emitJobEvent(
        sessionId,
        'research',
        'completed',
        `${cards.length} cards de pesquisa gerados!`,
        { cardCount: cards.length },
      );

      return { success: true, cards: cards.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      await (sb.from('research_sessions') as unknown as {
        update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
      })
        .update({ status: 'failed', error_message: message.slice(0, 500) })
        .eq('id', sessionId);

      await emitJobEvent(sessionId, 'research', 'failed', message.slice(0, 200), { error: message });
      throw err;
    }
  },
);
