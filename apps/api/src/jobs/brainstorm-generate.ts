/**
 * F2-036 — Async brainstorm generation with progress events.
 *
 * Triggered by POST /brainstorm/sessions (which only enqueues + returns sessionId).
 * Each step emits a job_event consumed by the SSE endpoint so the frontend modal
 * can show live progress ("Calling Ollama…", "Parsing output…", "Saving…").
 */
import { inngest } from './client.js';
import { STAGE_COSTS, generateWithFallback } from '../lib/ai/router.js';
import { loadAgentPrompt } from '../lib/ai/promptLoader.js';
import { debitCredits } from '../lib/credits.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { emitJobEvent } from './emitter.js';

interface BrainstormGenerateEvent {
  name: 'brainstorm/generate';
  data: {
    sessionId: string;
    orgId: string;
    userId: string;
    channelId: string | null;
    inputMode: 'blind' | 'fine_tuned' | 'reference_guided';
    inputJson: Record<string, unknown>;
    modelTier: string;
    provider?: 'gemini' | 'openai' | 'anthropic' | 'ollama';
    model?: string;
  };
}

interface RawIdea {
  title?: string;
  angle?: string;
  core_tension?: string;
  target_audience?: string;
  verdict?: string;
  monetization?: string;
  repurposing?: string[];
}

function normalizeIdeas(raw: unknown): RawIdea[] {
  function looksLikeIdea(item: unknown): boolean {
    if (!item || typeof item !== 'object') return false;
    const o = item as Record<string, unknown>;
    return typeof o.title === 'string' || typeof o.idea_id === 'string' || typeof o.angle === 'string';
  }
  function find(node: unknown, depth = 0): RawIdea[] | null {
    if (depth > 6) return null;
    if (Array.isArray(node)) {
      if (node.length > 0 && node.some(looksLikeIdea)) return node as RawIdea[];
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

export const brainstormGenerate = inngest.createFunction(
  {
    id: 'brainstorm-generate',
    retries: 0,
    triggers: [{ event: 'brainstorm/generate' }],
  },
  async ({ event, step }: { event: BrainstormGenerateEvent; step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => {
    const { sessionId, orgId, userId, channelId, inputJson, modelTier, provider, model } = event.data;
    const sb = createServiceClient();

    try {
      await step.run('emit-loading-prompt', async () => {
        await emitJobEvent(sessionId, 'brainstorm', 'loading_prompt', 'Carregando agente brainstorm…');
      });

      const systemPrompt = (await step.run('load-prompt', async () => {
        return (await loadAgentPrompt('brainstorm')) ?? null;
      })) as string | null;

      await step.run('emit-calling-provider', async () => {
        const label = provider ? `${provider}${model ? ` (${model})` : ''}` : modelTier;
        await emitJobEvent(sessionId, 'brainstorm', 'calling_provider', `Conversando com ${label}…`, { provider, model });
      });

      const result = (await step.run('call-provider', async () => {
        const { result } = await generateWithFallback(
          'brainstorm',
          modelTier,
          {
            agentType: 'brainstorm',
            input: inputJson,
            schema: null,
            systemPrompt: systemPrompt ?? undefined,
          },
          { provider, model },
        );
        return result;
      })) as unknown;

      await step.run('emit-parsing', async () => {
        await emitJobEvent(sessionId, 'brainstorm', 'parsing_output', 'Processando resposta da IA…');
      });

      const ideas = normalizeIdeas(result);

      await step.run('emit-saving', async () => {
        await emitJobEvent(sessionId, 'brainstorm', 'saving', `Salvando ${ideas.length} ideias…`, { count: ideas.length });
      });

      const persisted = await step.run('persist-ideas', async () => {
        const { count } = await sb.from('idea_archives').select('*', { count: 'exact', head: true });
        const startNum = (count ?? 0) + 1;

        const ideaRows = ideas.map((idea, i) => ({
          idea_id: `BC-IDEA-${String(startNum + i).padStart(3, '0')}`,
          title: idea.title ?? `Untitled ${i + 1}`,
          core_tension: idea.core_tension ?? '',
          target_audience: idea.target_audience ?? '',
          verdict:
            idea.verdict === 'viable' || idea.verdict === 'weak' || idea.verdict === 'experimental'
              ? idea.verdict
              : 'experimental',
          discovery_data: JSON.stringify({
            angle: idea.angle,
            monetization: idea.monetization,
            repurposing: idea.repurposing,
          }),
          source_type: 'brainstorm',
          channel_id: channelId,
          brainstorm_session_id: sessionId,
          user_id: userId,
          org_id: orgId,
        }));

        if (ideaRows.length > 0) {
          await (sb.from('idea_archives') as unknown as {
            upsert: (rows: Record<string, unknown>[], opts?: unknown) => Promise<{ error: unknown }>;
          }).upsert(ideaRows, { onConflict: 'idea_id', ignoreDuplicates: true });
        }

        await (sb.from('brainstorm_sessions') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        })
          .update({ status: 'completed' })
          .eq('id', sessionId);

        const charge = provider === 'ollama' ? 0 : STAGE_COSTS.brainstorm;
        if (charge > 0) {
          await debitCredits(orgId, userId, 'brainstorm', 'text', charge, {
            channelId,
            mode: event.data.inputMode,
            provider,
          });
        }

        return ideaRows.length;
      });

      await emitJobEvent(
        sessionId,
        'brainstorm',
        'completed',
        `${persisted} ideias geradas com sucesso!`,
        { ideaCount: persisted },
      );

      return { success: true, ideas: persisted };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      await (sb.from('brainstorm_sessions') as unknown as {
        update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
      })
        .update({ status: 'failed', error_message: message.slice(0, 500) })
        .eq('id', sessionId);

      await emitJobEvent(sessionId, 'brainstorm', 'failed', message.slice(0, 200), { error: message });
      throw err;
    }
  },
);
