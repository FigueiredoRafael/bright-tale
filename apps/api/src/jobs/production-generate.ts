/**
 * F2-036 — Async production pipeline (canonical-core → produce) with progress events.
 * One Inngest job runs both stages so the user sees a single modal end-to-end.
 */
import { inngest } from './client.js';
import { markCompleted, markAborted, markFailed, markAwaitingUser } from '../lib/pipeline/stage-run-writer.js';
import { generateWithFallback, isQuotaExhausted } from '../lib/ai/router.js';
import { loadAgentConfig, resolveProviderOverride } from '../lib/ai/promptLoader.js';
import { resolveTools, buildToolExecutor } from '../lib/ai/tools/index.js';
import { loadIdeaContext } from '../lib/ai/loadIdeaContext.js';
import { withReservation } from './utils/with-reservation.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { emitJobEvent } from './emitter.js';
import { logUsage } from '../lib/ai/usage-log.js';
import { loadPlatformSettings } from '../lib/platform-settings.js';
import { assertNotAborted, JobAborted } from '../lib/ai/abortable.js';
import {
  buildPersonaContext,
  buildPersonaVoice,
  buildLayeredPersonaContext,
  loadPersonaForDraft,
} from '../lib/personas.js';
import {
  applyProviderDiscount,
  STAGE_CHANNEL_SELECT,
  buildStageSystemPrompt,
  buildStageUserMessage,
} from '../lib/ai/generation/index.js';

// Re-exported for backward-compat with existing tests
// (apps/api/src/jobs/__tests__/production-generate-persona.test.ts imports from here)
export { buildPersonaContext, buildPersonaVoice, loadPersonaForDraft }

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
    /** Set when launched via the new Pipeline Orchestrator. */
    stageRunId?: string;
    /**
     * T2.6 — disambiguates the two callers:
     *   'canonical' (pipeline-canonical-dispatch): terminal-write the
     *     canonical Stage Run after save-core; do NOT chain to produce.
     *   'draft'     (legacy pipeline-draft-dispatch): chain into produce
     *     so the legacy Draft Stage Run stays running through the body.
     *   undefined   (legacy callers / pre-T2.6 events): treated as 'draft'.
     */
    phase?: 'canonical' | 'draft';
  };
}

export const productionGenerate = inngest.createFunction(
  {
    id: 'production-generate',
    retries: 0,
    triggers: [{ event: 'production/generate' }],
  },
  async ({ event, step }: { event: ProductionGenerateEvent; step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => {
    const { draftId, orgId, userId, type, modelTier, provider, model, productionParams, stageRunId, phase } = event.data;
    const sb = createServiceClient();

    // Load projectId from content_drafts
    const { data: draftForProject } = await sb
      .from('content_drafts')
      .select('project_id')
      .eq('id', draftId)
      .maybeSingle();
    const projectId = draftForProject && typeof draftForProject === 'object' && 'project_id' in draftForProject
      ? (draftForProject.project_id as string | undefined)
      : undefined;

    try {
      await assertNotAborted(projectId, draftId, sb);

      const creditSettings = await loadPlatformSettings(sb);
      const coreCost = applyProviderDiscount(creditSettings.costCanonicalCore, provider);

      // ─── Stage 1: Canonical Core ─────────────────────────────────────
      await step.run('emit-loading-core', async () => {
        await emitJobEvent(draftId, 'production', 'loading_prompt', 'Carregando agente core…');
      });

      await assertNotAborted(projectId, draftId, sb);

      const draft = (await step.run('load-draft', async () => {
        const { data } = await sb.from('content_drafts').select('*').eq('id', draftId).maybeSingle();
        return data;
      })) as Record<string, unknown> | null;

      if (!draft) throw new Error('Draft não encontrado');

      await assertNotAborted(projectId, draftId, sb);

      const persona = (await step.run('load-persona', async () => {
        return loadPersonaForDraft(draft as Record<string, unknown>, sb);
      })) as Awaited<ReturnType<typeof loadPersonaForDraft>>;

      await assertNotAborted(projectId, draftId, sb);

      const layeredPersona = (await step.run('load-persona-constraints', async () => {
        if (!persona) return null
        return buildLayeredPersonaContext(persona, sb)
      })) as Awaited<ReturnType<typeof buildLayeredPersonaContext>> | null

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
          .select(STAGE_CHANNEL_SELECT)
          .eq('id', draft.channel_id as string)
          .maybeSingle();
        return data;
      })) as Record<string, unknown> | null;

      await assertNotAborted(projectId, draftId, sb);

      const ideaContext = (await step.run('load-idea', async () => {
        if (!draft.idea_id) return null;
        return await loadIdeaContext(draft.idea_id as string);
      })) as Awaited<ReturnType<typeof loadIdeaContext>>;

      await assertNotAborted(projectId, draftId, sb);

      const coreAgentConfig = (await step.run('load-core-prompt', async () => {
        const primary = await loadAgentConfig('content-core');
        if (primary.instructions) return primary;
        const fallback = await loadAgentConfig('production');
        return fallback;
      })) as Awaited<ReturnType<typeof loadAgentConfig>>;
      const coreSystemPrompt = coreAgentConfig.instructions || null;
      const { provider: resolvedProvider, model: resolvedModel } = resolveProviderOverride(provider, model, coreAgentConfig);

      await assertNotAborted(projectId, draftId, sb);

      await step.run('emit-calling-core', async () => {
        const label = resolvedProvider ? `${resolvedProvider}${resolvedModel ? ` (${resolvedModel})` : ''}` : modelTier;
        await emitJobEvent(draftId, 'production', 'calling_provider', `Estruturando ideia central com ${label}…`, { stage: 'canonical-core', provider: resolvedProvider, model: resolvedModel });
      });

      await assertNotAborted(projectId, draftId, sb);

      // ── Credit reservation lifecycle ─────────────────────────────────────
      // withReservation wraps the AI call + save-core step. The feature flag
      // is read once at entry. Persona context and assertNotAborted calls are
      // preserved inside the fn callback.
      await withReservation(
        orgId,
        userId,
        coreCost,
        'canonical-core',
        'text',
        { draftId, type, provider },
        async () => {
          const canonicalCore = await step.run('generate-core', async () => {
            const userMessage = buildStageUserMessage({
              stage: 'canonical',
              ctx: {
                draft: draft as Record<string, unknown>,
                persona,
                layeredPersona,
                channel: channelContext,
                idea: ideaContext,
                researchCards: approvedCards,
              },
              productionParams,
            });
            const enabledTools = resolveTools(coreAgentConfig.tools).filter(
              () => resolvedProvider !== 'ollama',
            );
            const call = await generateWithFallback(
              'production',
              modelTier,
              {
                agentType: 'production',
                systemPrompt: buildStageSystemPrompt(coreSystemPrompt, layeredPersona?.constraints ?? []),
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
              orgId, userId, channelId: (draft.channel_id as string | null) ?? null,
              stage: 'production', subStage: 'canonical-core',
              sessionId: draftId, sessionType: 'production',
              provider: call.providerName, model: call.model,
              usage: call.usage,
            });
            return call.result;
          });

          await assertNotAborted(projectId, draftId, sb);

          await step.run('save-core', async () => {
            const coreToSave = draft.idea_id && canonicalCore && typeof canonicalCore === 'object' && !Array.isArray(canonicalCore)
              ? { ...(canonicalCore as Record<string, unknown>), idea_id: draft.idea_id }
              : canonicalCore;
            // Regenerating the canonical core invalidates anything downstream that
            // was derived from the previous core. Clear `draft_json` (the produced
            // body) and the review fields so the user is forced to re-produce +
            // re-review against the new core. Without this, ProductionEngine's
            // hydration finds stale `draft_json` from the previous run and
            // renders phase=done — masking the fact that production never ran
            // against the new canonical. Only clears when the previous run had
            // already produced content (draft_json non-empty); first canonical
            // generation is a no-op for these fields.
            const prevDraftJson = draft.draft_json as Record<string, unknown> | null | undefined;
            const hasPrevProduction =
              prevDraftJson && typeof prevDraftJson === 'object' && Object.keys(prevDraftJson).length > 0;
            const updateRow: Record<string, unknown> = { canonical_core_json: coreToSave };
            if (hasPrevProduction) {
              updateRow.draft_json = null;
              updateRow.review_score = null;
              updateRow.review_verdict = 'pending';
              updateRow.review_feedback_json = null;
              updateRow.iteration_count = 0;
            }
            await (sb.from('content_drafts') as unknown as {
              update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
            })
              .update(updateRow)
              .eq('id', draftId);
            // Credit debit handled by withReservation (commit on success, release on throw).
          });
        },
      );

      // Produce + Review are explicit subsequent stages so the user can
      // approve the canonical core, choose the produce model, and view the
      // review feedback as deliberate steps. The /produce and /review
      // routes own those stages.
      await emitJobEvent(draftId, 'production', 'completed', 'Canonical core gerado!', { draftId, type, stage: 'canonical-core' });

      // Pipeline Orchestrator handoff. Two routes:
      //   phase='canonical' (T2.6 canonical-dispatch): the canonical Stage
      //     Run is project-scoped and ends at canonical-core. Terminal-write
      //     it now; the per-Track production Stage Runs (owned by
      //     pipeline-production-dispatch + production-produce) carry the
      //     pipeline forward from here.
      //   phase='draft' / undefined (legacy draft-dispatch): canonical-core
      //     is only HALF of the Draft Stage — chain into produce so the
      //     Stage Run stays running until the body is written.
      if (stageRunId) {
        if (phase === 'canonical') {
          if (projectId) {
            await markCompleted(sb, stageRunId, {
              projectId,
              stage: 'canonical',
              payloadRef: { kind: 'content_draft', id: draftId },
              outcome: { draftId, type },
            });
          }
        } else {
          await inngest.send({
            name: 'production/produce',
            data: {
              draftId,
              orgId,
              userId,
              type,
              modelTier,
              provider,
              model,
              productionParams,
              stageRunId,
            },
          });
        }
      }

      return { success: true, draftId };
    } catch (err) {
      if (err instanceof JobAborted) {
        await sb.from('content_drafts').update({ status: 'paused' }).eq('id', draftId);
        await emitJobEvent(draftId, 'production', 'aborted', 'Sessão cancelada pelo usuário');
        if (stageRunId) {
          await markAborted(sb, stageRunId, {
            projectId: projectId ?? '',
            stage: 'production',
          });
        }
        return;
      }

      const rawMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      // Tag the message with which provider actually failed so the user can act
      // on the right account (e.g. "Anthropic: credit balance" vs the user's
      // selected "Ollama: ECONNREFUSED").
      const providerLabel = provider ? `[${provider}${model ? `/${model}` : ''}] ` : '';
      const message = `${providerLabel}${rawMessage}`;
      const quotaExhausted = isQuotaExhausted(err);
      await (sb.from('content_drafts') as unknown as {
        update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
      })
        .update({ status: 'failed' })
        .eq('id', draftId);
      await emitJobEvent(draftId, 'production', 'failed', message.slice(0, 240), { error: rawMessage, provider, model });

      if (stageRunId) {
        if (quotaExhausted) {
          // Quota-park is non-terminal — markAwaitingUser emits NO event.
          await markAwaitingUser(sb, stageRunId, {
            projectId: projectId ?? '',
            stage: 'production',
            awaitingReason: 'provider_quota_exhausted',
          });
        } else {
          await markFailed(sb, stageRunId, {
            projectId: projectId ?? '',
            stage: 'production',
            errorMessage: message,
          });
        }
      }

      if (quotaExhausted) return;
      throw err;
    }
  },
);
