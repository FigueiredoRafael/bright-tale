/**
 * pipeline-canonical-dispatch (D66, native) — handles
 * `pipeline/stage.requested` for stage='canonical'.
 *
 * Mirrors pipeline-review-dispatch: AI work runs INLINE via `step.run`,
 * lifecycle transitions go exclusively through stage-run-writer helpers,
 * and NO `production/generate` event is emitted.
 *
 * Normal path:
 *   CAS claim (queued→running) → create shared content_draft (memoized)
 *   → load context → canonical-core AI → save canonical_core_json
 *   → markCompleted({ stage:'canonical', payloadRef })
 *
 * Idempotency: queued AND running are both allowed through (running = Inngest
 * replay sees cached step results and must not short-circuit). Terminal
 * statuses (completed/failed/aborted/skipped) bail immediately.
 */
import { inngest } from './client.js';
import { generateWithFallback, isQuotaExhausted } from '../lib/ai/router.js';
import { loadAgentConfig, resolveProviderOverride } from '../lib/ai/promptLoader.js';
import { resolveTools, buildToolExecutor } from '../lib/ai/tools/index.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { resolveIdeaArchiveFromBrainstorm } from '../lib/pipeline/idea-resolution.js';
import { loadIdeaContext } from '../lib/ai/loadIdeaContext.js';
import { withReservation } from './utils/with-reservation.js';
import { emitJobEvent } from './emitter.js';
import { logUsage } from '../lib/ai/usage-log.js';
import { buildCanonicalCoreMessage } from '../lib/ai/prompts/production.js';
import { loadPlatformSettings } from '../lib/platform-settings.js';
import { assertNotAborted, JobAborted } from '../lib/ai/abortable.js';
import { loadPersonaForDraft, buildLayeredPersonaContext } from '../lib/personas.js';
import {
  markRunning,
  markCompleted,
  markFailed,
  markAwaitingUser,
  markAborted,
} from '../lib/pipeline/stage-run-writer.js';

interface StageRequestedEvent {
  name: 'pipeline/stage.requested';
  data: {
    stageRunId: string;
    stage: string;
    projectId: string;
  };
}

type Sb = any;

type Medium = 'blog' | 'video' | 'shorts' | 'podcast';

function isMedium(v: unknown): v is Medium {
  return v === 'blog' || v === 'video' || v === 'shorts' || v === 'podcast';
}

function formatConstraintsBlock(constraints: string[]): string {
  if (constraints.length === 0) return '';
  const lines = constraints.map((c) => `- ${c}`).join('\n');
  return `## Content Constraints\nThe following rules are non-negotiable and override all other instructions:\n${lines}\n\n`;
}

function applyProviderDiscount(cost: number, provider?: string): number {
  if (provider === 'ollama') return 0;
  return cost;
}

export const pipelineCanonicalDispatch = inngest.createFunction(
  {
    id: 'pipeline-canonical-dispatch',
    retries: 0,
    timeouts: { finish: '5m' },
    triggers: [{ event: 'pipeline/stage.requested', if: "event.data.stage == 'canonical'" }],
  },
  async ({
    event,
    step,
  }: {
    event: StageRequestedEvent;
    step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };
  }) => {
    if (event.data.stage !== 'canonical') return;

    const sb: Sb = createServiceClient();
    const { stageRunId, projectId } = event.data;
    const ctx = { projectId, stage: 'canonical' as const };

    const { data: stageRun } = await sb
      .from('stage_runs')
      .select('id, project_id, stage, status, input_json')
      .eq('id', stageRunId)
      .maybeSingle();
    if (!stageRun) return;

    // Idempotency: bail on terminal statuses. `queued` is the normal entry;
    // `running` means Inngest is replaying (step results are cached) — let it through.
    if (
      stageRun.status !== 'queued' &&
      stageRun.status !== 'running'
    ) return;

    const input = (stageRun.input_json ?? {}) as Record<string, unknown>;

    const { data: project } = await sb
      .from('projects')
      .select('id, channel_id, org_id')
      .eq('id', projectId)
      .maybeSingle();
    if (!project) return;

    let orgId = project.org_id as string | null | undefined;
    let userId: string | null = null;
    if (project.channel_id) {
      const { data: ch } = await sb
        .from('channels')
        .select('user_id, org_id')
        .eq('id', project.channel_id as string)
        .maybeSingle();
      if (ch) {
        userId = (ch.user_id as string) ?? null;
        orgId = orgId ?? ((ch.org_id as string) ?? null);
      }
    }

    let researchSessionId = (input.researchSessionId as string | undefined) ?? null;
    if (!researchSessionId) {
      const { data: priorResearch } = await sb
        .from('stage_runs')
        .select('id, stage, status, payload_ref')
        .eq('project_id', projectId)
        .eq('stage', 'research')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const ref = priorResearch?.payload_ref as { kind?: string; id?: string } | null | undefined;
      if (ref?.kind === 'research_session' && ref.id) {
        researchSessionId = ref.id;
      }
    }

    let ideaArchiveId = (input.ideaId as string | undefined) ?? null;
    if (!ideaArchiveId) {
      const resolved = await resolveIdeaArchiveFromBrainstorm(sb, projectId);
      ideaArchiveId = resolved.ideaArchiveId;
    }

    const { data: tracks } = await sb
      .from('tracks')
      .select('id, medium, status')
      .eq('project_id', projectId)
      .eq('status', 'active');
    const firstMedium = (tracks as Array<{ medium?: string }> | null)?.[0]?.medium;
    const type: Medium = isMedium(firstMedium) ? firstMedium : 'blog';

    const personaId = (input.personaId as string | undefined) ?? null;
    const modelTier = (input.modelTier as string | undefined) ?? 'standard';
    const provider = input.provider as string | undefined;
    const model = input.model as string | undefined;
    const productionParams = (input.productionParams as Record<string, unknown> | undefined) ?? null;

    const safeOrgId = (orgId as string | null) ?? '';
    const safeUserId = userId ?? '';

    // Memoize the insert inside step.run: Inngest re-executes the function body
    // on every step boundary, so an un-stepped insert would create a duplicate
    // content_drafts row on replay. step.run returns the cached id on replays.
    const created = await step.run('create-content-draft', async () => {
      const { data, error } = await sb
        .from('content_drafts')
        .insert({
          org_id: orgId,
          user_id: userId,
          channel_id: project.channel_id ?? null,
          project_id: projectId,
          research_session_id: researchSessionId,
          idea_id: ideaArchiveId,
          persona_id: personaId,
          type,
          status: 'draft',
        })
        .select()
        .single();
      return {
        id: (data?.id as string | undefined) ?? null,
        errorMessage: error ? ((error as { message?: string }).message ?? 'unknown') : null,
      };
    });

    if (!created.id) {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: `Failed to create content_drafts row: ${created.errorMessage ?? 'unknown'}`,
      });
      return;
    }

    const draftId = created.id;

    // Wrap in step.run so the queued→running transition is memoized: Inngest
    // re-executes the function body at each step boundary, and a bare
    // markRunning would re-stamp started_at on every replay.
    await step.run('mark-running', async () => {
      await markRunning(sb, stageRunId, {
        ...ctx,
        payloadRef: { kind: 'content_draft', id: draftId },
      });
    });

    try {
      const creditSettings = await loadPlatformSettings(sb);
      const coreCost = applyProviderDiscount(creditSettings.costCanonicalCore, provider);

      await assertNotAborted(projectId, draftId, sb);

      await step.run('emit-loading-core', async () => {
        await emitJobEvent(draftId, 'production', 'loading_prompt', 'Carregando agente core…');
      });

      const loadedDraft = (await step.run('load-draft', async () => {
        const { data } = await sb
          .from('content_drafts')
          .select('*')
          .eq('id', draftId)
          .maybeSingle();
        return data;
      })) as Record<string, unknown> | null;

      if (!loadedDraft) {
        await markFailed(sb, stageRunId, {
          ...ctx,
          errorMessage: `content_draft ${draftId} not found after insert`,
        });
        return;
      }

      await assertNotAborted(projectId, draftId, sb);

      const persona = (await step.run('load-persona', async () => {
        return loadPersonaForDraft(loadedDraft, sb);
      })) as Awaited<ReturnType<typeof loadPersonaForDraft>>;

      const layeredPersona = (await step.run('load-persona-constraints', async () => {
        if (!persona) return null;
        return buildLayeredPersonaContext(persona, sb);
      })) as Awaited<ReturnType<typeof buildLayeredPersonaContext>> | null;

      await assertNotAborted(projectId, draftId, sb);

      const approvedCards = (await step.run('load-research', async () => {
        if (!loadedDraft.research_session_id) return null;
        const { data } = await sb
          .from('research_sessions')
          .select('approved_cards_json, cards_json')
          .eq('id', loadedDraft.research_session_id as string)
          .maybeSingle();
        return data?.approved_cards_json ?? data?.cards_json ?? null;
      })) as unknown;

      await assertNotAborted(projectId, draftId, sb);

      const channelContext = (await step.run('load-channel', async () => {
        if (!loadedDraft.channel_id) return null;
        const { data } = await sb
          .from('channels')
          .select('name, niche, language, tone, presentation_style')
          .eq('id', loadedDraft.channel_id as string)
          .maybeSingle();
        return data;
      })) as Record<string, unknown> | null;

      await assertNotAborted(projectId, draftId, sb);

      const ideaContext = (await step.run('load-idea', async () => {
        if (!loadedDraft.idea_id) return null;
        return loadIdeaContext(loadedDraft.idea_id as string);
      })) as Awaited<ReturnType<typeof loadIdeaContext>>;

      await assertNotAborted(projectId, draftId, sb);

      const coreAgentConfig = (await step.run('load-core-prompt', async () => {
        const primary = await loadAgentConfig('content-core');
        if (primary.instructions) return primary;
        return loadAgentConfig('production');
      })) as Awaited<ReturnType<typeof loadAgentConfig>>;

      const { provider: resolvedProvider, model: resolvedModel } = resolveProviderOverride(
        provider,
        model,
        coreAgentConfig,
      );

      await assertNotAborted(projectId, draftId, sb);

      await step.run('emit-calling-core', async () => {
        const label = resolvedProvider
          ? `${resolvedProvider}${resolvedModel ? ` (${resolvedModel})` : ''}`
          : modelTier;
        await emitJobEvent(
          draftId,
          'production',
          'calling_provider',
          `Estruturando ideia central com ${label}…`,
          { stage: 'canonical-core', provider: resolvedProvider, model: resolvedModel },
        );
      });

      await assertNotAborted(projectId, draftId, sb);

      await withReservation(
        safeOrgId,
        safeUserId,
        coreCost,
        'canonical-core',
        'text',
        { draftId, type, provider },
        async () => {
          const canonicalCore = await step.run('generate-core', async () => {
            const userMessage = buildCanonicalCoreMessage({
              type: type as string,
              title: loadedDraft.title as string,
              ideaId: loadedDraft.idea_id as string | undefined,
              idea: ideaContext,
              researchCards: approvedCards ?? undefined,
              productionParams,
              personaContext: layeredPersona?.context ?? null,
              channel: channelContext as
                | { name?: string; niche?: string; language?: string; tone?: string }
                | undefined,
            });
            const enabledTools = resolveTools(coreAgentConfig.tools).filter(
              () => resolvedProvider !== 'ollama',
            );
            const call = await generateWithFallback(
              'production',
              modelTier,
              {
                agentType: 'production',
                systemPrompt: layeredPersona?.constraints.length
                  ? `${formatConstraintsBlock(layeredPersona.constraints)}${coreAgentConfig.instructions ?? ''}`
                  : coreAgentConfig.instructions ?? '',
                userMessage,
                tools: enabledTools.length > 0 ? enabledTools : undefined,
                toolExecutor: enabledTools.length > 0 ? buildToolExecutor(enabledTools) : undefined,
              },
              {
                provider: resolvedProvider,
                model: resolvedModel,
                logContext: {
                  userId: safeUserId,
                  orgId: safeOrgId,
                  channelId: (loadedDraft.channel_id as string | null) ?? undefined,
                  sessionId: draftId,
                  sessionType: 'production',
                },
              },
            );
            await logUsage({
              orgId: safeOrgId,
              userId: safeUserId,
              channelId: (loadedDraft.channel_id as string | null) ?? null,
              stage: 'production',
              subStage: 'canonical-core',
              sessionId: draftId,
              sessionType: 'production',
              provider: call.providerName,
              model: call.model,
              usage: call.usage,
            });
            return call.result;
          });

          await assertNotAborted(projectId, draftId, sb);

          await step.run('save-core', async () => {
            const coreToSave =
              loadedDraft.idea_id &&
              canonicalCore &&
              typeof canonicalCore === 'object' &&
              !Array.isArray(canonicalCore)
                ? { ...(canonicalCore as Record<string, unknown>), idea_id: loadedDraft.idea_id }
                : canonicalCore;
            await sb
              .from('content_drafts')
              .update({ canonical_core_json: coreToSave })
              .eq('id', draftId);
          });
        },
      );

      await step.run('emit-core-done', async () => {
        await emitJobEvent(draftId, 'production', 'completed', 'Canonical core gerado!', {
          draftId,
          type,
          stage: 'canonical-core',
        });
      });

      await markCompleted(sb, stageRunId, {
        ...ctx,
        payloadRef: { kind: 'content_draft', id: draftId },
        outcome: { draftId, type },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error(err);
      if (err instanceof JobAborted) {
        await markAborted(sb, stageRunId, { ...ctx });
        return;
      }
      if (isQuotaExhausted(err)) {
        await markAwaitingUser(sb, stageRunId, {
          ...ctx,
          awaitingReason: 'provider_quota_exhausted',
          markStarted: true,
        });
        return;
      }
      await markFailed(sb, stageRunId, { ...ctx, errorMessage: message });
      throw err;
    }
  },
);
