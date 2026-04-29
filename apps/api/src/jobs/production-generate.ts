/**
 * F2-036 — Async production pipeline (canonical-core → produce) with progress events.
 * One Inngest job runs both stages so the user sees a single modal end-to-end.
 */
import { inngest } from './client.js';
import { generateWithFallback } from '../lib/ai/router.js';
import { loadAgentPrompt } from '../lib/ai/promptLoader.js';
import { loadIdeaContext } from '../lib/ai/loadIdeaContext.js';
import { debitCredits } from '../lib/credits.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { emitJobEvent } from './emitter.js';
import { logUsage } from '../lib/ai/usage-log.js';
import { buildCanonicalCoreMessage } from '../lib/ai/prompts/production.js';
import { calculateDraftCost } from '../lib/calculate-draft-cost.js';
import { loadCreditSettings } from '../lib/credit-settings.js';
import {
  buildPersonaContext,
  buildPersonaVoice,
  buildLayeredPersonaContext,
  loadPersonaForDraft,
} from '../lib/personas.js'

// Re-exported for backward-compat with existing tests
// (apps/api/src/jobs/__tests__/production-generate-persona.test.ts imports from here)
export { buildPersonaContext, buildPersonaVoice, loadPersonaForDraft }

function formatConstraintsBlock(constraints: string[]): string {
  if (constraints.length === 0) return ''
  const lines = constraints.map(c => `- ${c}`).join('\n')
  return `## Content Constraints\nThe following rules are non-negotiable and override all other instructions:\n${lines}\n\n`
}

/**
 * When the user runs everything locally via Ollama, our infra cost is zero —
 * so we charge nothing in internal credits either. Any other provider hits a
 * paid API and is billed at full rate.
 */
function applyProviderDiscount(cost: number, provider?: string): number {
  if (provider === 'ollama') return 0;
  return cost;
}

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
    productionParams?: Record<string, unknown> | null;
  };
}

export const productionGenerate = inngest.createFunction(
  {
    id: 'production-generate',
    retries: 0,
    triggers: [{ event: 'production/generate' }],
  },
  async ({ event, step }: { event: ProductionGenerateEvent; step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => {
    const { draftId, orgId, userId, type, modelTier, provider, model, productionParams } = event.data;
    const sb = createServiceClient();
    const creditSettings = await loadCreditSettings(sb);
    const cost = applyProviderDiscount(calculateDraftCost(type, creditSettings), provider);
    const coreCost = applyProviderDiscount(creditSettings.costCanonicalCore, provider);

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

      const persona = (await step.run('load-persona', async () => {
        return loadPersonaForDraft(draft as Record<string, unknown>, sb);
      })) as Awaited<ReturnType<typeof loadPersonaForDraft>>;

      const layeredPersona = (await step.run('load-persona-constraints', async () => {
        if (!persona) return null
        return buildLayeredPersonaContext(persona, sb)
      })) as Awaited<ReturnType<typeof buildLayeredPersonaContext>> | null

      const approvedCards = (await step.run('load-research', async () => {
        if (!draft.research_session_id) return null;
        const { data } = await sb
          .from('research_sessions')
          .select('approved_cards_json, cards_json')
          .eq('id', draft.research_session_id as string)
          .maybeSingle();
        return data?.approved_cards_json ?? data?.cards_json ?? null;
      })) as unknown;

      const channelContext = (await step.run('load-channel', async () => {
        if (!draft.channel_id) return null;
        const { data } = await sb
          .from('channels')
          .select('name, niche, language, tone, presentation_style')
          .eq('id', draft.channel_id as string)
          .maybeSingle();
        return data;
      })) as Record<string, unknown> | null;

      const ideaContext = (await step.run('load-idea', async () => {
        if (!draft.idea_id) return null;
        return await loadIdeaContext(draft.idea_id as string);
      })) as Awaited<ReturnType<typeof loadIdeaContext>>;

      const coreSystemPrompt = (await step.run('load-core-prompt', async () => {
        return (await loadAgentPrompt('content-core')) ?? (await loadAgentPrompt('production')) ?? null;
      })) as string | null;

      await step.run('emit-calling-core', async () => {
        const label = provider ? `${provider}${model ? ` (${model})` : ''}` : modelTier;
        await emitJobEvent(draftId, 'production', 'calling_provider', `Estruturando ideia central com ${label}…`, { stage: 'canonical-core', provider, model });
      });

      const canonicalCore = await step.run('generate-core', async () => {
        const userMessage = buildCanonicalCoreMessage({
          type: type as string,
          title: draft.title as string,
          ideaId: draft.idea_id as string | undefined,
          idea: ideaContext,
          researchCards: approvedCards as unknown[] | undefined,
          productionParams,
          personaContext: layeredPersona?.context ?? null,
          channel: channelContext as { name?: string; niche?: string; language?: string; tone?: string } | undefined,
        });
        const call = await generateWithFallback(
          'production',
          modelTier,
          {
            agentType: 'production',
            systemPrompt: layeredPersona?.constraints.length
              ? `${formatConstraintsBlock(layeredPersona.constraints)}${coreSystemPrompt ?? ''}`
              : coreSystemPrompt ?? '',
            userMessage,
          },
          {
            provider,
            model,
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
          orgId, userId, channelId: (draft.channel_id as string | null) ?? null,
          stage: 'production', subStage: 'canonical-core',
          sessionId: draftId, sessionType: 'production',
          provider: call.providerName, model: call.model,
          usage: call.usage,
        });
        return call.result;
      });

      await step.run('save-core', async () => {
        const coreToSave = draft.idea_id && canonicalCore && typeof canonicalCore === 'object' && !Array.isArray(canonicalCore)
          ? { ...(canonicalCore as Record<string, unknown>), idea_id: draft.idea_id }
          : canonicalCore;
        await (sb.from('content_drafts') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        })
          .update({ canonical_core_json: coreToSave })
          .eq('id', draftId);
        await debitCredits(orgId, userId, 'canonical-core', 'text', coreCost, { draftId, type, provider });
      });

      // Produce + Review are explicit subsequent stages so the user can
      // approve the canonical core, choose the produce model, and view the
      // review feedback as deliberate steps. The /produce and /review
      // routes own those stages.
      await emitJobEvent(draftId, 'production', 'completed', 'Canonical core gerado!', { draftId, type, stage: 'canonical-core' });
      return { success: true, draftId };
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      // Tag the message with which provider actually failed so the user can act
      // on the right account (e.g. "Anthropic: credit balance" vs the user's
      // selected "Ollama: ECONNREFUSED").
      const providerLabel = provider ? `[${provider}${model ? `/${model}` : ''}] ` : '';
      const message = `${providerLabel}${rawMessage}`;
      await (sb.from('content_drafts') as unknown as {
        update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
      })
        .update({ status: 'failed' })
        .eq('id', draftId);
      await emitJobEvent(draftId, 'production', 'failed', message.slice(0, 240), { error: rawMessage, provider, model });
      throw err;
    }
  },
);
