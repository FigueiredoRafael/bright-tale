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
import { loadPriorReviewAttempts } from '../lib/ai/loadPriorReviewAttempts.js';
import { calculateDraftCost } from '../lib/calculate-draft-cost.js';
import { loadPlatformSettings } from '../lib/platform-settings.js';
import { assertNotAborted, JobAborted } from '../lib/ai/abortable.js';
import { buildLayeredPersonaContext, loadPersonaForDraft } from '../lib/personas.js';
import {
  applyProviderDiscount,
  normalizeReviewFeedback,
  STAGE_CHANNEL_SELECT,
  buildStageSystemPrompt,
  buildStageUserMessage,
  deriveEffectiveProductionParams,
} from '../lib/ai/generation/index.js';

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
    /** Set when launched as part of the new Pipeline Orchestrator's Draft Stage.
     *  production-generate (canonical-core) chains into production-produce
     *  (the real content); production-produce owns the Stage Run terminal. */
    stageRunId?: string;
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
    const { draftId, orgId, userId, type, modelTier, provider, model, productionParams, stageRunId } = event.data;
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

      const creditSettings = await loadPlatformSettings(sb);
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
          .select(STAGE_CHANNEL_SELECT)
          .eq('id', draft.channel_id as string)
          .maybeSingle();
        return data;
      })) as Record<string, unknown> | null;

      // Derive video_style_config.channel_type from channel.video_style when caller didn't set it.
      // Moved to shared assembly/deriveEffectiveProductionParams so dispatcher also applies it.
      const effectiveProductionParams = deriveEffectiveProductionParams(type as string, channelContext, productionParams);

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
            // When the orchestrator hands us a `review_feedback` blob in
            // productionParams it means this run is a revision (review loop).
            const reviewFeedbackRaw =
              effectiveProductionParams && typeof effectiveProductionParams === 'object'
                ? ((effectiveProductionParams as Record<string, unknown>).review_feedback as
                    | Record<string, unknown>
                    | undefined)
                : undefined;
            const normalizedReviewFeedbackForStep = normalizeReviewFeedback({
              raw: reviewFeedbackRaw ?? null,
              type: type as string,
              reviewScore: (draft.review_score as number | null) ?? null,
            });
            const priorAttempts = normalizedReviewFeedbackForStep
              ? await loadPriorReviewAttempts(sb, draftId, type as string, { skipLatest: true })
              : [];
            const iterationCount =
              typeof (draft.iteration_count as number | null) === 'number'
                ? ((draft.iteration_count as number) + 1)
                : 1;

            const ctx = {
              draft: { ...draft, type, canonical_core_json: canonicalCore },
              persona,
              layeredPersona,
              channel: channelContext,
              idea: ideaContext,
              researchCards: approvedCards,
            };
            const userMessage = buildStageUserMessage({
              stage: normalizedReviewFeedbackForStep ? 'reproduce' : 'produce',
              ctx,
              productionParams: effectiveProductionParams,
              reviewFeedback: normalizedReviewFeedbackForStep,
              iterationCount: normalizedReviewFeedbackForStep ? iterationCount : undefined,
              priorAttempts: normalizedReviewFeedbackForStep ? priorAttempts : undefined,
            });

            const enabledTools = resolveTools(produceAgentConfig.tools).filter(
              () => resolvedProvider !== 'ollama',
            );
            const call = await generateWithFallback(
              'production',
              modelTier,
              {
                agentType: 'production',
                systemPrompt: buildStageSystemPrompt(produceAgentConfig.instructions, layeredPersona?.constraints ?? []),
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

      // Pipeline Orchestrator handoff: this is the actual end of the Draft
      // Stage (canonical-core only produces structure; produce writes the
      // body). Stage Run terminal is owned here.
      //
      // Engine path (POST /api/content-drafts/:id/produce) doesn't pass a
      // stageRunId, so the production stage_run stays in whatever state it
      // had (often aborted from a prior track-abort cascade) and the sidebar
      // never flips to ✓. Resolve the latest production stage_run for this
      // (project, track) and update it so engine-driven runs persist too.
      //
      // Step-by-step mode never fans out from Canonical (only autopilot does
      // — see orchestrator.enqueueProductionForNewTrack), so a newly-picked
      // track has NO production stage_run row. In that case we INSERT one
      // as 'completed' here, otherwise the sidebar's Production indicator
      // for that track stays blank forever.
      let resolvedStageRunId: string | null = stageRunId ?? null;
      let resolvedTrackId: string | null = null;
      if (!resolvedStageRunId && projectId) {
        // Prefer the draft's own track_id (set on per-track derived drafts
        // by /derive); falls back to track-lookup by medium for legacy /
        // single-track projects where the draft predates Issue #210.
        resolvedTrackId = (draft.track_id as string | null | undefined) ?? null;
        if (!resolvedTrackId) {
          const { data: track } = await sb
            .from('tracks')
            .select('id')
            .eq('project_id', projectId)
            .eq('medium', type)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (track?.id) resolvedTrackId = track.id as string;
        }
        if (resolvedTrackId) {
          const { data: latestRun } = await sb
            .from('stage_runs')
            .select('id')
            .eq('project_id', projectId)
            .eq('stage', 'production')
            .eq('track_id', resolvedTrackId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (latestRun?.id) resolvedStageRunId = latestRun.id as string;
        }
      }

      if (resolvedStageRunId) {
        const now = new Date().toISOString();
        await (sb.from('stage_runs') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        })
          .update({
            status: 'completed',
            payload_ref: { kind: 'content_draft', id: draftId },
            error_message: null,
            finished_at: now,
            updated_at: now,
          })
          .eq('id', resolvedStageRunId);
        await inngest.send({
          name: 'pipeline/stage.run.finished',
          data: { stageRunId: resolvedStageRunId, projectId },
        });
      } else if (projectId && resolvedTrackId) {
        // No existing stage_run for this (project, track, production) — happens
        // in step-by-step mode where the orchestrator never fanned out. Insert
        // a fresh 'completed' row so the sidebar reflects the produce.
        const now = new Date().toISOString();
        await sb.from('stage_runs').insert({
          project_id: projectId,
          stage: 'production',
          status: 'completed',
          attempt_no: 1,
          track_id: resolvedTrackId,
          publish_target_id: null,
          payload_ref: { kind: 'content_draft', id: draftId },
          started_at: now,
          finished_at: now,
          updated_at: now,
        });
      }

      return { success: true, draftId };
    } catch (err) {
      if (err instanceof JobAborted) {
        await sb.from('content_drafts').update({ status: 'paused' }).eq('id', draftId);
        await emitJobEvent(draftId, 'production', 'aborted', 'Sessão cancelada pelo usuário');
        if (stageRunId) {
          const now = new Date().toISOString();
          await (sb.from('stage_runs') as unknown as {
            update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
          })
            .update({ status: 'aborted', finished_at: now, updated_at: now })
            .eq('id', stageRunId);
          await inngest.send({
            name: 'pipeline/stage.run.finished',
            data: { stageRunId, projectId },
          });
        }
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

      if (stageRunId) {
        const now = new Date().toISOString();
        await (sb.from('stage_runs') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        })
          .update({
            status: 'failed',
            error_message: message.slice(0, 500),
            finished_at: now,
            updated_at: now,
          })
          .eq('id', stageRunId);
        await inngest.send({
          name: 'pipeline/stage.run.finished',
          data: { stageRunId, projectId },
        });
      }

      throw err;
    }
  },
);
