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
import { buildProduceMessage, buildReproduceMessage } from '../lib/ai/prompts/production.js';
import { loadPriorReviewAttempts } from '../lib/ai/loadPriorReviewAttempts.js';
import {
  computeRubricScore,
  extractRubricEvaluation,
  getRubricForType,
} from '../lib/ai/scoring/computeRubricScore.js';
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
          .select('name, niche, language, tone, presentation_style, video_style, voice_id, voice_provider, voice_speed')
          .eq('id', draft.channel_id as string)
          .maybeSingle();
        return data;
      })) as Record<string, unknown> | null;

      // Derive video_style_config.channel_type from channel.video_style when caller didn't set it.
      // channels.video_style enum: face | dark | hybrid → videoStyleConfig.channel_type: presenter | dark.
      const effectiveProductionParams: Record<string, unknown> | null = (() => {
        if (type !== 'video' || !channelContext) return productionParams ?? null;
        const channelStyle = channelContext.video_style;
        const derivedChannelType =
          channelStyle === 'dark' ? 'dark' : channelStyle === 'face' || channelStyle === 'hybrid' ? 'presenter' : null;
        if (!derivedChannelType) return productionParams ?? null;
        const params = { ...(productionParams ?? {}) } as Record<string, unknown>;
        const styleConfig = { ...((params.video_style_config as Record<string, unknown> | undefined) ?? {}) };
        if (!styleConfig.channel_type) styleConfig.channel_type = derivedChannelType;
        params.video_style_config = styleConfig;
        return params;
      })();

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

            // When the orchestrator hands us a `review_feedback` blob in
            // productionParams it means this run is a revision (review loop).
            // Switch to the reproduce prompt so the agent rewrites the draft
            // against the feedback instead of producing from scratch.
            //
            // The review agent stores feedback as a wrapper keyed by format:
            // `{ blog_review: {...}, video_review: {...} }`, with critical/minor
            // issues nested under `issues.critical` (array of {issue, location,
            // suggested_fix}) or under `rubric_checks.critical_issues` (array of
            // strings). buildReproduceMessage expects a flat
            // `{ overall_verdict, score, critical_issues, minor_issues, strengths }`
            // shape — without this normalization the prompt receives `undefined`
            // for every field and the AI rewrites blind (score never moves).
            const reviewFeedbackRaw =
              effectiveProductionParams && typeof effectiveProductionParams === 'object'
                ? ((effectiveProductionParams as Record<string, unknown>).review_feedback as
                    | Record<string, unknown>
                    | undefined)
                : undefined;
            // Flatten the review agent's nested wrapper into the shape
            // buildReproduceMessage expects: { overall_verdict, score,
            // critical_issues, minor_issues, strengths }. The agent stores
            // feedback as `{ <type>_review: { verdict, issues: { critical, minor },
            // strengths, rubric_checks: { critical_issues, minor_issues,
            // strengths } } }` — mixing detailed-object arrays (with
            // suggested_fix + location) and plain-string arrays. Without this
            // flattening, every field arrives as `undefined` and the prompt
            // contains no actionable feedback (the score never moves). Inlined
            // (not extracted) so tsx --watch can't lose the helper.
            const normalizedReviewFeedback = ((): {
              overall_verdict?: string;
              score?: number | null;
              critical_issues?: string[];
              minor_issues?: string[];
              strengths?: string[];
            } | undefined => {
              const raw = reviewFeedbackRaw;
              if (!raw || typeof raw !== 'object') return undefined;
              const block = ((raw[`${type}_review`] as Record<string, unknown> | undefined) ??
                raw) as Record<string, unknown>;
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
              const dedupe = (arr: string[]): string[] =>
                Array.from(new Set(arr.filter(Boolean)));

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
              const blockStrengths = Array.isArray(block.strengths)
                ? (block.strengths as string[])
                : [];
              const rubricStrengths = Array.isArray(rubric.strengths)
                ? (rubric.strengths as string[])
                : [];

              // Rubric-based criticals: when the reviewer returned a
              // rubric_evaluation (new deterministic scoring path), surface every
              // failed criterion as a critical issue with its pass condition.
              // This gives the producer concrete instructions ("criterion X failed
              // because Y, to pass the draft must Z") instead of free-form text.
              const rubricForType = getRubricForType(type as string);
              const criticalFromRubric: string[] = [];
              if (rubricForType) {
                const rubricEval = extractRubricEvaluation(raw, type as string);
                const computed = computeRubricScore(rubricForType, rubricEval);
                for (const f of computed.failures) {
                  const evidenceLine = f.evidence && f.evidence !== '(no evidence provided)'
                    ? `Evidence: ${f.evidence}. `
                    : '';
                  criticalFromRubric.push(
                    `[${f.key}] ${f.title} — FAIL. ${evidenceLine}Pass condition: ${f.passWhen}`,
                  );
                }
              }

              const critical_issues = dedupe([
                ...criticalFromRubric,
                ...criticalDetailed,
                ...criticalRubric,
              ]);
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
                score: (draft.review_score as number | null) ?? null,
                critical_issues,
                minor_issues,
                strengths,
              };
            })();
            const draftTitle = (draft.title as string) ?? ((draft.draft_json as Record<string, unknown> | null)?.title as string | undefined) ?? '';
            // Mirror the reviewer's priorAttempts memory on the producer side.
            // Without it the producer keeps re-applying the same paraphrase to a
            // flagged section because it can't see what it already tried in
            // previous iterations. skipLatest=true drops the just-completed
            // review (its feedback is already in normalizedReviewFeedback below).
            const priorAttempts = normalizedReviewFeedback
              ? await loadPriorReviewAttempts(sb, draftId, type as string, {
                  skipLatest: true,
                })
              : [];
            const userMessage = normalizedReviewFeedback
              ? buildReproduceMessage({
                  type: type as string,
                  title: draftTitle,
                  canonicalCore,
                  previousDraft: draft.draft_json,
                  idea: ideaContext,
                  reviewFeedback: normalizedReviewFeedback,
                  iterationCount:
                    typeof (draft.iteration_count as number | null) === 'number'
                      ? ((draft.iteration_count as number) + 1)
                      : 1,
                  priorAttempts,
                  channel: channelContext as
                    | { name?: string; niche?: string; language?: string; tone?: string }
                    | undefined,
                })
              : buildProduceMessage({
                  type: type as string,
                  title: draftTitle,
                  canonicalCore,
                  idea: ideaContext,
                  productionParams: effectiveProductionParams ?? undefined,
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
