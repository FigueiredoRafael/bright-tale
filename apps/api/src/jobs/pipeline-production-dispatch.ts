/**
 * pipeline-production-dispatch (D66, native) — handles
 * `pipeline/stage.requested` for stage='production'.
 *
 * Mirrors pipeline-review-dispatch: AI work runs INLINE via `step.run`,
 * lifecycle transitions go exclusively through stage-run-writer helpers,
 * and NO `production/produce` event is emitted.
 *
 * Normal path (fresh produce):
 *   CAS claim (queued→running) → deriveDraft (memoized per-track copy)
 *   → markRunning → load context → produce AI → save draft_json
 *   → markCompleted({ revision: false })
 *
 * Revision path (productionParams.review_feedback present):
 *   deriveDraft → markRunning → load context → reproduce AI → save draft_json
 *   → markCompleted({ revision: true, iterationCount })
 *
 * Error branches:
 *   quota → markAwaitingUser(provider_quota_exhausted)
 *   JobAborted → markAborted (no rethrow)
 *   generic → markFailed + rethrow
 *
 * Idempotency: queued AND running allowed through (running = Inngest replay).
 * Terminal statuses (completed/failed/aborted/skipped) bail immediately.
 * Every side-effect (derive, AI, saves, milestone emits) inside step.run.
 */
import { inngest } from './client.js';
import { generateWithFallback, isQuotaExhausted } from '../lib/ai/router.js';
import { loadAgentConfig, resolveProviderOverride } from '../lib/ai/promptLoader.js';
import { resolveTools, buildToolExecutor } from '../lib/ai/tools/index.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { loadIdeaContext } from '../lib/ai/loadIdeaContext.js';
import { loadPriorReviewAttempts } from '../lib/ai/loadPriorReviewAttempts.js';
import { withReservation } from './utils/with-reservation.js';
import { emitJobEvent } from './emitter.js';
import { logUsage } from '../lib/ai/usage-log.js';
import {
  buildProduceMessage,
  buildReproduceMessage,
} from '../lib/ai/prompts/production.js';
import { loadPlatformSettings } from '../lib/platform-settings.js';
import { calculateDraftCost } from '../lib/calculate-draft-cost.js';
import { assertNotAborted, JobAborted } from '../lib/ai/abortable.js';
import { loadPersonaForDraft, buildLayeredPersonaContext } from '../lib/personas.js';
import {
  computeRubricScore,
  extractRubricEvaluation,
  getRubricForType,
} from '../lib/ai/scoring/computeRubricScore.js';
import {
  markRunning,
  markCompleted,
  markFailed,
  markAwaitingUser,
  markAborted,
} from '../lib/pipeline/stage-run-writer.js';
import { deriveDraft } from '../lib/content-drafts/derive.js';
import { ApiError } from '../lib/api/errors.js';

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

export const pipelineProductionDispatch = inngest.createFunction(
  {
    id: 'pipeline-production-dispatch',
    retries: 0,
    timeouts: { finish: '5m' },
    triggers: [{ event: 'pipeline/stage.requested', if: "event.data.stage == 'production'" }],
  },
  async ({
    event,
    step,
  }: {
    event: StageRequestedEvent;
    step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };
  }) => {
    if (event.data.stage !== 'production') return;

    const sb: Sb = createServiceClient();
    const { stageRunId, projectId } = event.data;
    const ctx = { projectId, stage: 'production' as const };

    const { data: stageRun } = await sb
      .from('stage_runs')
      .select('id, project_id, stage, status, track_id, publish_target_id, input_json')
      .eq('id', stageRunId)
      .maybeSingle();
    if (!stageRun) return;

    // Idempotency: bail on terminal statuses. queued is normal entry;
    // running is valid on Inngest replays (step results are cached).
    if (
      stageRun.status !== 'queued' &&
      stageRun.status !== 'running'
    ) return;

    const trackId = stageRun.track_id as string | null | undefined;
    if (!trackId) {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: 'Production Stage Run missing track_id',
      });
      return;
    }

    const { data: track } = await sb
      .from('tracks')
      .select('id, project_id, medium, status')
      .eq('id', trackId)
      .maybeSingle();
    if (!track) {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: `Track ${trackId} not found`,
      });
      return;
    }
    const medium = track.medium as string | undefined;
    if (!isMedium(medium)) {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: `Track ${trackId} has invalid medium: ${medium}`,
      });
      return;
    }

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

    // Find the canonical Stage Run's content_draft (project-scoped).
    const { data: priorCanonical } = await sb
      .from('stage_runs')
      .select('id, stage, status, payload_ref')
      .eq('project_id', projectId)
      .eq('stage', 'canonical')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const canonicalRef = priorCanonical?.payload_ref as
      | { kind?: string; id?: string }
      | null
      | undefined;
    const canonicalDraftId =
      canonicalRef?.kind === 'content_draft' && canonicalRef.id ? canonicalRef.id : null;
    if (!canonicalDraftId) {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: 'No canonical content_draft found for project',
      });
      return;
    }

    if (!userId) {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: 'Could not resolve user_id for derive',
      });
      return;
    }

    const modelTier = (input.modelTier as string | undefined) ?? 'standard';
    const provider = input.provider as string | undefined;
    const model = input.model as string | undefined;
    const productionParams = (input.productionParams as Record<string, unknown> | undefined) ?? null;

    const safeOrgId = (orgId as string | null) ?? '';
    const safeUserId = userId;

    // Memoize deriveDraft inside step.run: replay-safe (idempotent via DB
    // partial unique index on (project_id, track_id)).
    const derived = await step.run('derive-per-track-draft', async () => {
      try {
        const result = await deriveDraft(sb, {
          sourceId: canonicalDraftId,
          trackId,
          medium,
          userId: safeUserId,
        });
        return { id: result.id, errorMessage: null };
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? `${err.code}: ${err.message}`
            : err instanceof Error
              ? err.message
              : 'Unknown error';
        return { id: null, errorMessage: msg };
      }
    });

    if (!derived.id) {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: `Failed to derive per-track draft: ${derived.errorMessage ?? 'unknown'}`,
      });
      return;
    }

    const draftId = derived.id;

    // Wrap in step.run so the queued→running transition is memoized: Inngest
    // re-executes the function body at each step boundary, and a bare
    // markRunning would re-stamp started_at on every replay.
    await step.run('mark-running', async () => {
      await markRunning(sb, stageRunId, {
        ...ctx,
        payloadRef: { kind: 'content_draft', id: draftId },
      });
    });

    // Detect revision path: review_feedback in productionParams
    const reviewFeedback =
      productionParams && typeof productionParams === 'object'
        ? ((productionParams as Record<string, unknown>).review_feedback as
            | Record<string, unknown>
            | undefined)
        : undefined;

    try {
      const creditSettings = await loadPlatformSettings(sb);
      const produceCost = applyProviderDiscount(
        calculateDraftCost(medium, creditSettings),
        provider,
      );

      await assertNotAborted(projectId, draftId, sb);

      await step.run('emit-loading-produce', async () => {
        await emitJobEvent(draftId, 'production', 'loading_prompt', `Carregando agente ${medium}…`);
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
          errorMessage: `content_draft ${draftId} not found`,
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
          .select('name, niche, language, tone, presentation_style, video_style')
          .eq('id', loadedDraft.channel_id as string)
          .maybeSingle();
        return data;
      })) as Record<string, unknown> | null;

      await assertNotAborted(projectId, draftId, sb);

      const ideaContext = (await step.run('load-idea', async () => {
        if (!loadedDraft.idea_id) return null;
        return loadIdeaContext(loadedDraft.idea_id as string);
      })) as Awaited<ReturnType<typeof loadIdeaContext>> | null;

      await assertNotAborted(projectId, draftId, sb);

      const produceAgentConfig = (await step.run('load-produce-prompt', async () => {
        const primary = await loadAgentConfig(medium);
        if (primary.instructions) return primary;
        return loadAgentConfig('production');
      })) as Awaited<ReturnType<typeof loadAgentConfig>>;

      const { provider: resolvedProvider, model: resolvedModel } = resolveProviderOverride(
        provider,
        model,
        produceAgentConfig,
      );

      await assertNotAborted(projectId, draftId, sb);

      await step.run('emit-calling-produce', async () => {
        const label = resolvedProvider
          ? `${resolvedProvider}${resolvedModel ? ` (${resolvedModel})` : ''}`
          : modelTier;
        await emitJobEvent(
          draftId,
          'production',
          'calling_provider',
          `Escrevendo ${medium} com ${label}…`,
          { stage: 'produce', provider: resolvedProvider, model: resolvedModel },
        );
      });

      await assertNotAborted(projectId, draftId, sb);

      // Normalise review feedback for buildReproduceMessage (same logic as
      // production-produce.ts: flatten nested wrapper into flat shape).
      const normalizedReviewFeedback = ((): {
        overall_verdict?: string;
        score?: number | null;
        critical_issues?: string[];
        minor_issues?: string[];
        strengths?: string[];
      } | undefined => {
        const raw = reviewFeedback;
        if (!raw || typeof raw !== 'object') return undefined;
        const block = (
          (raw[`${medium}_review`] as Record<string, unknown> | undefined) ?? raw
        ) as Record<string, unknown>;
        const issues = (block.issues as Record<string, unknown> | undefined) ?? {};
        const rubric = (block.rubric_checks as Record<string, unknown> | undefined) ?? {};

        const fmtIssue = (i: unknown): string => {
          if (typeof i === 'string') return i;
          if (!i || typeof i !== 'object') return '';
          const obj = i as Record<string, unknown>;
          const issueText = (obj.issue as string) ?? '';
          const fix = (obj.suggested_fix as string) ?? '';
          const loc = (obj.location as string) ?? '';
          const head = loc ? `[${loc}] ${issueText}` : issueText;
          return fix ? `${head} — Fix: ${fix}` : head;
        };
        const dedupe = (arr: string[]): string[] => Array.from(new Set(arr.filter(Boolean)));

        const criticalDetailed = Array.isArray(issues.critical)
          ? (issues.critical as unknown[]).map(fmtIssue)
          : [];
        const minorDetailed = Array.isArray(issues.minor)
          ? (issues.minor as unknown[]).map(fmtIssue)
          : [];
        const criticalRubric = Array.isArray(rubric.critical_issues)
          ? (rubric.critical_issues as string[])
          : [];
        const minorRubric = Array.isArray(rubric.minor_issues)
          ? (rubric.minor_issues as string[])
          : [];
        const blockStrengths = Array.isArray(block.strengths) ? (block.strengths as string[]) : [];
        const rubricStrengths = Array.isArray(rubric.strengths)
          ? (rubric.strengths as string[])
          : [];

        const rubricForType = getRubricForType(medium as string);
        const criticalFromRubric: string[] = [];
        if (rubricForType) {
          const rubricEval = extractRubricEvaluation(raw, medium as string);
          const computed = computeRubricScore(rubricForType, rubricEval);
          for (const f of computed.failures) {
            const evidenceLine =
              f.evidence && f.evidence !== '(no evidence provided)'
                ? `Evidence: ${f.evidence}. `
                : '';
            criticalFromRubric.push(
              `[${f.key}] ${f.title} — FAIL. ${evidenceLine}Pass condition: ${f.passWhen}`,
            );
          }
        }

        const critical_issues = dedupe([...criticalFromRubric, ...criticalDetailed, ...criticalRubric]);
        const minor_issues = dedupe([...minorDetailed, ...minorRubric]);
        const strengths = dedupe([...blockStrengths, ...rubricStrengths]);

        if (
          critical_issues.length === 0 &&
          minor_issues.length === 0 &&
          strengths.length === 0
        ) {
          return undefined;
        }
        return {
          overall_verdict:
            (block.verdict as string) ?? (block.quality_tier as string) ?? undefined,
          score: (loadedDraft.review_score as number | null) ?? null,
          critical_issues,
          minor_issues,
          strengths,
        };
      })();

      const approvedCardsObj =
        approvedCards && typeof approvedCards === 'object' && !Array.isArray(approvedCards)
          ? (approvedCards as Record<string, unknown>)
          : null;
      const researchSources =
        medium === 'blog' && approvedCardsObj?.sources
          ? (approvedCardsObj.sources as unknown[])
          : undefined;

      const iterationCount =
        typeof (loadedDraft.iteration_count as number | null) === 'number'
          ? ((loadedDraft.iteration_count as number) + 1)
          : 1;

      await withReservation(
        safeOrgId,
        safeUserId,
        produceCost,
        `production-${medium}`,
        'text',
        { draftId, type: medium },
        async () => {
          const draftJson = await step.run('generate-produce', async () => {
            const draftTitle =
              (loadedDraft.title as string) ??
              ((loadedDraft.draft_json as Record<string, unknown> | null)?.title as
                | string
                | undefined) ??
              '';

            const enabledTools = resolveTools(produceAgentConfig.tools).filter(
              () => resolvedProvider !== 'ollama',
            );

            const priorAttempts = normalizedReviewFeedback
              ? await loadPriorReviewAttempts(sb, draftId, medium as string, { skipLatest: true })
              : [];

            const userMessage = normalizedReviewFeedback
              ? buildReproduceMessage({
                  type: medium as string,
                  title: draftTitle,
                  canonicalCore: loadedDraft.canonical_core_json,
                  previousDraft: loadedDraft.draft_json,
                  idea: ideaContext,
                  reviewFeedback: normalizedReviewFeedback,
                  iterationCount,
                  priorAttempts,
                  channel: channelContext as
                    | { name?: string; niche?: string; language?: string; tone?: string }
                    | undefined,
                })
              : buildProduceMessage({
                  type: medium as string,
                  title: draftTitle,
                  canonicalCore: loadedDraft.canonical_core_json,
                  idea: ideaContext,
                  productionParams: productionParams ?? undefined,
                  sources: researchSources,
                  persona: layeredPersona?.voice ?? null,
                  channel: channelContext as
                    | { name?: string; niche?: string; language?: string; tone?: string }
                    | undefined,
                });

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
              subStage: `produce-${medium}`,
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
            await sb
              .from('content_drafts')
              .update({ draft_json: draftJson, status: 'draft' })
              .eq('id', draftId);
          });
        },
      );

      await step.run('emit-produce-done', async () => {
        const label =
          medium === 'blog'
            ? 'Post'
            : medium === 'video'
              ? 'Vídeo'
              : medium === 'shorts'
                ? 'Shorts'
                : 'Podcast';
        await emitJobEvent(draftId, 'production', 'completed', `${label} pronto!`, {
          draftId,
          type: medium,
          stage: 'produce',
        });
      });

      const outcome: Record<string, unknown> = reviewFeedback
        ? { revision: true, iterationCount }
        : { revision: false };

      await markCompleted(sb, stageRunId, {
        ...ctx,
        payloadRef: { kind: 'content_draft', id: draftId },
        outcome,
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
