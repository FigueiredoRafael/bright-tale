/**
 * F2-036 — Async production pipeline (canonical-core → produce) with progress events.
 * One Inngest job runs both stages so the user sees a single modal end-to-end.
 */
import { inngest } from './client.js';
import { generateWithFallback } from '../lib/ai/router.js';
import { loadAgentPrompt } from '../lib/ai/promptLoader.js';
import { debitCredits } from '../lib/credits.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { emitJobEvent } from './emitter.js';

const FORMAT_COSTS: Record<string, number> = {
  blog: 200,
  video: 200,
  shorts: 100,
  podcast: 150,
};
const CANONICAL_CORE_COST = 80;

interface ProductionGenerateEvent {
  name: 'production/generate';
  data: {
    draftId: string;
    orgId: string;
    userId: string;
    type: 'blog' | 'video' | 'shorts' | 'podcast';
    modelTier: string;
    provider?: 'gemini' | 'openai' | 'anthropic' | 'ollama';
    model?: string;
  };
}

export const productionGenerate = inngest.createFunction(
  {
    id: 'production-generate',
    retries: 0,
    triggers: [{ event: 'production/generate' }],
  },
  async ({ event, step }: { event: ProductionGenerateEvent; step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => {
    const { draftId, orgId, userId, type, modelTier, provider, model } = event.data;
    const sb = createServiceClient();
    const cost = FORMAT_COSTS[type] ?? 200;

    try {
      // ─── Stage 1: Canonical Core ─────────────────────────────────────
      await step.run('emit-loading-core', async () => {
        await emitJobEvent(draftId, 'production', 'loading_prompt', 'Carregando agente core…');
      });

      const draft = (await step.run('load-draft', async () => {
        const { data } = await sb.from('content_drafts').select('*').eq('id', draftId).maybeSingle();
        return data;
      })) as Record<string, unknown> | null;

      if (!draft) throw new Error('Draft não encontrado');

      const approvedCards = (await step.run('load-research', async () => {
        if (!draft.research_session_id) return null;
        const { data } = await sb
          .from('research_sessions')
          .select('approved_cards_json, cards_json')
          .eq('id', draft.research_session_id as string)
          .maybeSingle();
        return data?.approved_cards_json ?? data?.cards_json ?? null;
      })) as unknown;

      const coreSystemPrompt = (await step.run('load-core-prompt', async () => {
        return (await loadAgentPrompt('content-core')) ?? (await loadAgentPrompt('production')) ?? null;
      })) as string | null;

      await step.run('emit-calling-core', async () => {
        const label = provider ? `${provider}${model ? ` (${model})` : ''}` : modelTier;
        await emitJobEvent(draftId, 'production', 'calling_provider', `Estruturando ideia central com ${label}…`, { stage: 'canonical-core', provider, model });
      });

      const canonicalCore = await step.run('generate-core', async () => {
        const { result } = await generateWithFallback(
          'production',
          modelTier,
          {
            agentType: 'production',
            input: {
              stage: 'canonical-core',
              type,
              title: draft.title,
              ideaId: draft.idea_id,
              researchCards: approvedCards,
            },
            schema: null,
            systemPrompt: coreSystemPrompt ?? undefined,
          },
          { provider, model },
        );
        return result;
      });

      await step.run('save-core', async () => {
        await (sb.from('content_drafts') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        })
          .update({ canonical_core_json: canonicalCore })
          .eq('id', draftId);
        await debitCredits(orgId, userId, 'canonical-core', 'text', CANONICAL_CORE_COST, { draftId, type });
      });

      // ─── Stage 2: Produce final draft ────────────────────────────────
      await step.run('emit-loading-produce', async () => {
        await emitJobEvent(draftId, 'production', 'loading_prompt', `Carregando agente ${type}…`);
      });

      const produceSystemPrompt = (await step.run('load-produce-prompt', async () => {
        return (await loadAgentPrompt(type)) ?? (await loadAgentPrompt('production')) ?? null;
      })) as string | null;

      await step.run('emit-calling-produce', async () => {
        const label = provider ? `${provider}${model ? ` (${model})` : ''}` : modelTier;
        await emitJobEvent(draftId, 'production', 'calling_provider', `Escrevendo ${type} com ${label}…`, { stage: 'produce', provider, model });
      });

      const draftJson = await step.run('generate-produce', async () => {
        const { result } = await generateWithFallback(
          'production',
          modelTier,
          {
            agentType: 'production',
            input: {
              stage: 'produce',
              type,
              title: draft.title,
              canonicalCore,
              researchSessionId: draft.research_session_id,
            },
            schema: null,
            systemPrompt: produceSystemPrompt ?? undefined,
          },
          { provider, model },
        );
        return result;
      });

      await step.run('emit-saving', async () => {
        await emitJobEvent(draftId, 'production', 'saving', 'Salvando rascunho…');
      });

      await step.run('save-produce', async () => {
        await (sb.from('content_drafts') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        })
          .update({ draft_json: draftJson, status: 'in_review' })
          .eq('id', draftId);
        await debitCredits(orgId, userId, `production-${type}`, 'text', cost, { draftId, type });
      });

      // ─── Stage 3: Auto-review ────────────────────────────────────────
      // Best-effort: if review fails we don't rollback the produced draft,
      // we just log and let the user manually re-trigger review.
      try {
        await step.run('emit-calling-review', async () => {
          const label = provider ? `${provider}${model ? ` (${model})` : ''}` : modelTier;
          await emitJobEvent(draftId, 'production', 'calling_provider', `Revisando com ${label}…`, { stage: 'review', provider, model });
        });

        const reviewSystemPrompt = (await step.run('load-review-prompt', async () => {
          return (await loadAgentPrompt('review')) ?? null;
        })) as string | null;

        const reviewResult = await step.run('generate-review', async () => {
          const { result } = await generateWithFallback(
            'review',
            modelTier,
            {
              agentType: 'review',
              input: { type, title: draft.title, draft: draftJson, canonicalCore },
              schema: null,
              systemPrompt: reviewSystemPrompt ?? undefined,
            },
            { provider, model },
          );
          return result;
        });

        await step.run('save-review', async () => {
          await (sb.from('content_drafts') as unknown as {
            update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
          })
            .update({ review_feedback_json: reviewResult })
            .eq('id', draftId);
        });
      } catch (reviewErr) {
        // Surface a soft warning but treat the job as a success since the
        // produced draft is saved.
        await emitJobEvent(
          draftId,
          'production',
          'parsing_output',
          `Review automática falhou (rascunho está salvo): ${(reviewErr as Error).message?.slice(0, 100)}`,
          { reviewFailed: true },
        );
      }

      await emitJobEvent(draftId, 'production', 'completed', `${type === 'blog' ? 'Post' : type === 'video' ? 'Vídeo' : type === 'shorts' ? 'Shorts' : 'Podcast'} pronto!`, { draftId, type });
      return { success: true, draftId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      await (sb.from('content_drafts') as unknown as {
        update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
      })
        .update({ status: 'failed' })
        .eq('id', draftId);
      await emitJobEvent(draftId, 'production', 'failed', message.slice(0, 200), { error: message });
      throw err;
    }
  },
);
