/**
 * Async produce-only pipeline. Runs after the user (or auto-pilot) approves
 * the canonical core. Emits progress events so DraftEngine's modal can render
 * a live status feed during the LLM call.
 */
import { inngest } from './client.js';
import { generateWithFallback } from '../lib/ai/router.js';
import { loadAgentConfig, resolveProviderOverride } from '../lib/ai/promptLoader.js';
import { resolveTools, buildToolExecutor } from '../lib/ai/tools/index.js';
import { loadIdeaContext } from '../lib/ai/loadIdeaContext.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { withReservation } from './utils/with-reservation.js';
import { emitJobEvent } from './emitter.js';
import { logUsage } from '../lib/ai/usage-log.js';
import { buildProduceMessage } from '../lib/ai/prompts/production.js';
import { calculateDraftCost } from '../lib/calculate-draft-cost.js';
import { loadCreditSettings } from '../lib/credit-settings.js';
import { assertNotAborted, JobAborted } from '../lib/ai/abortable.js';
import { buildLayeredPersonaContext, loadPersonaForDraft } from '../lib/personas.js';

function formatConstraintsBlock(constraints: string[]): string {
  if (constraints.length === 0) return '';
  const lines = constraints.map((c) => `- ${c}`).join('\n');
  return `## Content Constraints\nThe following rules are non-negotiable and override all other instructions:\n${lines}\n\n`;
}

function applyProviderDiscount(cost: number, provider?: string): number {
  if (provider === 'ollama') return 0;
  return cost;
}

interface ProductionProduceEvent {
  name: 'production/produce';
  data: {
    draftId: string;
    orgId: string;
    userId: string;
    type: 'blog' | 'video' | 'shorts' | 'podcast';
    modelTier: string;
    provider?: 'gemini' | 'openai' | 'anthropic' | 'ollama';
    model?: string;
    productionParams?: Record<string, unknown> | null;
  };
}

export const productionProduce = inngest.createFunction(
  {
    id: 'production-produce',
    retries: 0,
    triggers: [{ event: 'production/produce' }],
  },
  async ({
    event,
    step,
  }: {
    event: ProductionProduceEvent;
    step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> };
  }) => {
    const { draftId, orgId, userId, type, modelTier, provider, model, productionParams } = event.data;
    const sb = createServiceClient();

    // Load projectId from content_drafts
    const { data: draftForProject } = await sb
      .from('content_drafts')
      .select('project_id')
      .eq('id', draftId)
      .maybeSingle();
    const projectId = draftForProject?.project_id ?? undefined;

    try {
      await assertNotAborted(projectId, draftId, sb);

      const creditSettings = await loadCreditSettings(sb);
      const cost = applyProviderDiscount(calculateDraftCost(type, creditSettings), provider);

      await step.run('emit-loading-produce', async () => {
        await emitJobEvent(draftId, 'production', 'loading_prompt', `Carregando agente ${type}…`);
      });

      await assertNotAborted(projectId, draftId, sb);

      const draft = (await step.run('load-draft', async () => {
        const { data } = await sb.from('content_drafts').select('*').eq('id', draftId).maybeSingle();
        return data;
      })) as Record<string, unknown> | null;

      if (!draft) throw new Error('Draft não encontrado');

      await assertNotAborted(projectId, draftId, sb);

      const canonicalCore = draft.canonical_core_json;
      if (!canonicalCore || typeof canonicalCore !== 'object') {
        throw new Error('Canonical core ausente — gere o core antes de produzir o conteúdo');
      }

      await assertNotAborted(projectId, draftId, sb);

      const persona = (await step.run('load-persona', async () => {
        return loadPersonaForDraft(draft, sb);
      })) as Awaited<ReturnType<typeof loadPersonaForDraft>>;

      await assertNotAborted(projectId, draftId, sb);

      const layeredPersona = (await step.run('load-persona-constraints', async () => {
        if (!persona) return null;
        return buildLayeredPersonaContext(persona, sb);
      })) as Awaited<ReturnType<typeof buildLayeredPersonaContext>> | null;

      await assertNotAborted(projectId, draftId, sb);

      const approvedCards = (await step.run('load-research', async () => {
        if (!draft.research_session_id) return null;
        const { data } = await sb
          .from('research_sessions')
          .select('approved_cards_json, cards_json')
          .eq('id', draft.research_session_id as string)
          .maybeSingle();
        return data?.approved_cards_json ?? data?.cards_json ?? null;
      })) as unknown;

      await assertNotAborted(projectId, draftId, sb);

      const channelContext = (await step.run('load-channel', async () => {
        if (!draft.channel_id) return null;
        const { data } = await sb
          .from('channels')
          .select('name, niche, language, tone, presentation_style')
          .eq('id', draft.channel_id as string)
          .maybeSingle();
        return data;
      })) as Record<string, unknown> | null;

      await assertNotAborted(projectId, draftId, sb);

      const ideaContext = (await step.run('load-idea', async () => {
        if (!draft.idea_id) return null;
        return loadIdeaContext(draft.idea_id as string);
      })) as Awaited<ReturnType<typeof loadIdeaContext>> | null;

      await assertNotAborted(projectId, draftId, sb);

      const produceAgentConfig = (await step.run('load-produce-prompt', async () => {
        const primary = await loadAgentConfig(type);
        if (primary.instructions) return primary;
        return loadAgentConfig('production');
      })) as Awaited<ReturnType<typeof loadAgentConfig>>;
      const { provider: resolvedProvider, model: resolvedModel } = resolveProviderOverride(provider, model, produceAgentConfig);

      await assertNotAborted(projectId, draftId, sb);

      await step.run('emit-calling-produce', async () => {
        const label = resolvedProvider ? `${resolvedProvider}${resolvedModel ? ` (${resolvedModel})` : ''}` : modelTier;
        await emitJobEvent(draftId, 'production', 'calling_provider', `Escrevendo ${type} com ${label}…`, {
          stage: 'produce',
          provider: resolvedProvider,
          model: resolvedModel,
        });
      });

      await assertNotAborted(projectId, draftId, sb);

      // ── Credit reservation lifecycle ─────────────────────────────────────
      // withReservation reserves credits up front, commits on success,
      // releases (returns to pool) if fn throws.
      await withReservation(
        orgId,
        userId,
        cost,
        `production-${type}`,
        'text',
        { draftId, type },
        async () => {
          const draftJson = await step.run('generate-produce', async () => {
            const approvedCardsObj =
              approvedCards && typeof approvedCards === 'object' && !Array.isArray(approvedCards)
                ? (approvedCards as Record<string, unknown>)
                : null;
            const researchSources =
              type === 'blog' && approvedCardsObj?.sources ? (approvedCardsObj.sources as unknown[]) : undefined;

            const userMessage = buildProduceMessage({
              type: type as string,
              title: draft.title as string,
              canonicalCore,
              idea: ideaContext,
              productionParams: productionParams ?? undefined,
              sources: researchSources,
              persona: layeredPersona?.voice ?? null,
              channel: channelContext as
                | { name?: string; niche?: string; language?: string; tone?: string }
                | undefined,
            });
            const enabledTools = resolveTools(produceAgentConfig.tools).filter(
              () => resolvedProvider !== 'ollama',
            );
            const call = await generateWithFallback(
              'production',
              modelTier,
              {
                agentType: 'production',
                systemPrompt: layeredPersona?.constraints.length
                  ? `${formatConstraintsBlock(layeredPersona.constraints)}${produceAgentConfig.instructions}`
                  : produceAgentConfig.instructions,
                userMessage,
                tools: enabledTools.length > 0 ? enabledTools : undefined,
                toolExecutor: enabledTools.length > 0 ? buildToolExecutor(enabledTools) : undefined,
              },
              {
                provider: resolvedProvider,
                model: resolvedModel,
                logContext: {
                  userId,
                  orgId,
                  projectId: undefined,
                  channelId: (draft.channel_id as string | null) ?? undefined,
                  sessionId: draftId,
                  sessionType: 'production',
                },
              },
            );
            await logUsage({
              orgId,
              userId,
              channelId: (draft.channel_id as string | null) ?? null,
              stage: 'production',
              subStage: `produce-${type}`,
              sessionId: draftId,
              sessionType: 'production',
              provider: call.providerName,
              model: call.model,
              usage: call.usage,
            });
            return call.result;
          });

          await assertNotAborted(projectId, draftId, sb);

          await step.run('emit-saving', async () => {
            await emitJobEvent(draftId, 'production', 'saving', 'Salvando rascunho…');
          });

          await assertNotAborted(projectId, draftId, sb);

          await step.run('save-produce', async () => {
            await (sb.from('content_drafts') as unknown as {
              update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
            })
              .update({ draft_json: draftJson, status: 'draft' })
              .eq('id', draftId);
          });
        },
      );

      await emitJobEvent(
        draftId,
        'production',
        'completed',
        `${type === 'blog' ? 'Post' : type === 'video' ? 'Vídeo' : type === 'shorts' ? 'Shorts' : 'Podcast'} pronto!`,
        { draftId, type, stage: 'produce' },
      );
      return { success: true, draftId };
    } catch (err) {
      if (err instanceof JobAborted) {
        await sb.from('content_drafts').update({ status: 'paused' }).eq('id', draftId);
        await emitJobEvent(draftId, 'production', 'aborted', 'Sessão cancelada pelo usuário');
        return;
      }

      const rawMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      const providerLabel = provider ? `[${provider}${model ? `/${model}` : ''}] ` : '';
      const message = `${providerLabel}${rawMessage}`;
      await (sb.from('content_drafts') as unknown as {
        update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
      })
        .update({ status: 'failed', error_message: message.slice(0, 500) })
        .eq('id', draftId);
      await emitJobEvent(draftId, 'production', 'failed', message.slice(0, 200), { error: message });
      throw err;
    }
  },
);
