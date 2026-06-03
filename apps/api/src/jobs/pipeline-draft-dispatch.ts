/**
 * pipeline-draft-dispatch — native dispatcher + worker for `pipeline/stage.requested`
 * (stage='draft'). Mirrors the pattern of pipeline-review-dispatch: AI work runs
 * INLINE via `step.run`, and lifecycle transitions go exclusively through
 * stage-run-writer helpers — no `production/generate` or `production/produce`
 * event hops.
 *
 * Normal path:
 *   insert content_drafts → markRunning → canonical-core AI (inline)
 *   → write canonical_core_json → produce AI (inline) → write draft_json
 *   → markCompleted({ revision: false })
 *
 * Revision path (productionParams.review_feedback present):
 *   locate existing content_draft → markRunning → reproduce AI (inline)
 *   → write draft_json → markCompleted({ revision: true, iterationCount })
 */
import { inngest } from './client.js';
import { generateWithFallback, isQuotaExhausted } from '../lib/ai/router.js';
import { loadAgentConfig, resolveProviderOverride } from '../lib/ai/promptLoader.js';
import { resolveTools, buildToolExecutor } from '../lib/ai/tools/index.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { resolveIdeaArchiveFromBrainstorm } from '../lib/pipeline/idea-resolution.js';
import { loadIdeaContext } from '../lib/ai/loadIdeaContext.js';
import { loadPriorReviewAttempts } from '../lib/ai/loadPriorReviewAttempts.js';
import { withReservation } from './utils/with-reservation.js';
import { emitJobEvent } from './emitter.js';
import { logUsage } from '../lib/ai/usage-log.js';
import {
  buildCanonicalCoreMessage,
  buildProduceMessage,
  buildReproduceMessage,
} from '../lib/ai/prompts/production.js';
import { loadPlatformSettings } from '../lib/platform-settings.js';
import { calculateDraftCost } from '../lib/calculate-draft-cost.js';
import { assertNotAborted, JobAborted } from '../lib/ai/abortable.js';
import { loadPersonaForDraft, buildLayeredPersonaContext } from '../lib/personas.js';
import {
  markRunning,
  markCompleted,
  markFailed,
  markAwaitingUser,
  markAborted,
} from '../lib/pipeline/stage-run-writer.js';
import {
  computeRubricScore,
  extractRubricEvaluation,
  getRubricForType,
} from '../lib/ai/scoring/computeRubricScore.js';

interface StageRequestedEvent {
  name: 'pipeline/stage.requested';
  data: {
    stageRunId: string;
    stage: string;
    projectId: string;
  };
}

type Sb = any;

function formatConstraintsBlock(constraints: string[]): string {
  if (constraints.length === 0) return '';
  const lines = constraints.map((c) => `- ${c}`).join('\n');
  return `## Content Constraints\nThe following rules are non-negotiable and override all other instructions:\n${lines}\n\n`;
}

function applyProviderDiscount(cost: number, provider?: string): number {
  if (provider === 'ollama') return 0;
  return cost;
}

export const pipelineDraftDispatch = inngest.createFunction(
  {
    id: 'pipeline-draft-dispatch',
    retries: 0,
    timeouts: { finish: '5m' },
    // See pipeline-brainstorm-dispatch for the rationale behind `if:`.
    triggers: [{ event: 'pipeline/stage.requested', if: "event.data.stage == 'draft'" }],
  },
  async ({
    event,
    step,
  }: {
    event: StageRequestedEvent;
    step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };
  }) => {
    if (event.data.stage !== 'draft') return;

    const sb = createServiceClient() as Sb & {
      from: (table: string) => Record<string, unknown>;
    };
    const { stageRunId, projectId } = event.data;
    const ctx = { projectId, stage: 'draft' as const };

    const { data: stageRun } = await (sb as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }> };
        };
      };
    }).from('stage_runs')
      .select('id, project_id, stage, status, track_id, input_json')
      .eq('id', stageRunId)
      .maybeSingle();
    if (!stageRun) return;

    // Idempotency: bail on TERMINAL statuses. `queued` is the normal entry;
    // `running` is valid on Inngest replays (step results are cached).
    if (stageRun.status !== 'queued' && stageRun.status !== 'running') return;

    const input = (stageRun.input_json ?? {}) as Record<string, unknown>;
    const type = (input.type as 'blog' | 'video' | 'shorts' | 'podcast' | undefined) ?? 'blog';
    const modelTier = (input.modelTier as string | undefined) ?? 'standard';
    const provider = input.provider as string | undefined;
    const model = input.model as string | undefined;
    const personaId = (input.personaId as string | undefined) ?? null;
    const productionParams = (input.productionParams as Record<string, unknown> | undefined) ?? null;

    const { data: project } = await (sb as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }> };
        };
      };
    }).from('projects')
      .select('id, channel_id, org_id')
      .eq('id', projectId)
      .maybeSingle();
    if (!project) return;

    let orgId = project.org_id as string | null | undefined;
    let userId: string | null = null;
    if (project.channel_id) {
      const { data: ch } = await (sb as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }> };
          };
        };
      }).from('channels')
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
      const { data: priorResearch } = await (sb as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, val: string) => {
              eq: (col: string, val: string) => {
                order: (c: string, o: unknown) => {
                  limit: (n: number) => {
                    maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
                  };
                };
              };
            };
          };
        };
      }).from('stage_runs')
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

    // Revision path: when review_feedback is present in productionParams,
    // re-produce against the existing content_draft (canonical core is valid).
    const reviewFeedback =
      productionParams && typeof productionParams === 'object'
        ? ((productionParams as Record<string, unknown>).review_feedback as
            | Record<string, unknown>
            | undefined)
        : undefined;

    const safeOrgId = (orgId as string | null) ?? '';
    const safeUserId = userId ?? '';

    if (reviewFeedback) {
      const { data: priorContentDraft } = await (sb as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, val: string) => {
              order: (c: string, o: unknown) => {
                limit: (n: number) => {
                  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
                };
              };
            };
          };
        };
      }).from('content_drafts')
        .select('id')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const existingDraftId = (priorContentDraft?.id as string | undefined) ?? null;
      if (!existingDraftId) {
        await markFailed(sb as Parameters<typeof markFailed>[0], stageRunId, {
          ...ctx,
          errorMessage: 'Revision requested but no prior content_draft to revise',
        });
        return;
      }

      await markRunning(sb as Parameters<typeof markRunning>[0], stageRunId, {
        ...ctx,
        payloadRef: { kind: 'content_draft', id: existingDraftId },
      });

      try {
        const creditSettings = await loadPlatformSettings(sb as Parameters<typeof loadPlatformSettings>[0]);
        const produceCost = applyProviderDiscount(
          calculateDraftCost(type, creditSettings),
          provider,
        );

        await assertNotAborted(projectId, existingDraftId, sb as Parameters<typeof assertNotAborted>[2]);

        const draftForRevision = (await step.run('load-draft-for-revision', async () => {
          const { data } = await (sb as {
            from: (t: string) => {
              select: (c: string) => {
                eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> };
              };
            };
          }).from('content_drafts').select('*').eq('id', existingDraftId).maybeSingle();
          return data;
        })) as Record<string, unknown> | null;

        if (!draftForRevision) {
          await markFailed(sb as Parameters<typeof markFailed>[0], stageRunId, {
            ...ctx,
            errorMessage: `content_draft ${existingDraftId} not found for revision`,
          });
          return;
        }

        await assertNotAborted(projectId, existingDraftId, sb as Parameters<typeof assertNotAborted>[2]);

        const persona = (await step.run('load-persona-revision', async () => {
          return loadPersonaForDraft(draftForRevision, sb as Parameters<typeof loadPersonaForDraft>[1]);
        })) as Awaited<ReturnType<typeof loadPersonaForDraft>>;

        const layeredPersona = (await step.run('load-persona-constraints-revision', async () => {
          if (!persona) return null;
          return buildLayeredPersonaContext(persona, sb as Parameters<typeof buildLayeredPersonaContext>[1]);
        })) as Awaited<ReturnType<typeof buildLayeredPersonaContext>> | null;

        await assertNotAborted(projectId, existingDraftId, sb as Parameters<typeof assertNotAborted>[2]);

        const channelContextRevision = (await step.run('load-channel-revision', async () => {
          if (!draftForRevision.channel_id) return null;
          const { data } = await (sb as {
            from: (t: string) => {
              select: (c: string) => {
                eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> };
              };
            };
          }).from('channels')
            .select('name, niche, language, tone, presentation_style')
            .eq('id', draftForRevision.channel_id as string)
            .maybeSingle();
          return data;
        })) as Record<string, unknown> | null;

        const ideaContextRevision = (await step.run('load-idea-revision', async () => {
          if (!draftForRevision.idea_id) return null;
          return loadIdeaContext(draftForRevision.idea_id as string);
        })) as Awaited<ReturnType<typeof loadIdeaContext>> | null;

        const produceAgentConfig = (await step.run('load-produce-prompt-revision', async () => {
          const primary = await loadAgentConfig(type);
          if (primary.instructions) return primary;
          return loadAgentConfig('production');
        })) as Awaited<ReturnType<typeof loadAgentConfig>>;
        const { provider: resolvedProvider, model: resolvedModel } = resolveProviderOverride(
          provider,
          model,
          produceAgentConfig,
        );

        await assertNotAborted(projectId, existingDraftId, sb as Parameters<typeof assertNotAborted>[2]);

        const priorAttempts = await loadPriorReviewAttempts(
          sb as Parameters<typeof loadPriorReviewAttempts>[0],
          existingDraftId,
          type as string,
          { skipLatest: true },
        );

        const rubricForType = getRubricForType(type as string);
        const normalizedFeedback = ((): {
          overall_verdict?: string;
          score?: number | null;
          critical_issues?: string[];
          minor_issues?: string[];
          strengths?: string[];
        } => {
          const raw = reviewFeedback;
          const block = ((raw[`${type}_review`] as Record<string, unknown> | undefined) ?? raw) as Record<string, unknown>;
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
          const rubricStrengths = Array.isArray(rubric.strengths) ? (rubric.strengths as string[]) : [];

          const criticalFromRubric: string[] = [];
          if (rubricForType) {
            const rubricEval = extractRubricEvaluation(raw, type as string);
            const computed = computeRubricScore(rubricForType, rubricEval);
            for (const f of computed.failures) {
              const evidenceLine =
                f.evidence && f.evidence !== '(no evidence provided)' ? `Evidence: ${f.evidence}. ` : '';
              criticalFromRubric.push(
                `[${f.key}] ${f.title} — FAIL. ${evidenceLine}Pass condition: ${f.passWhen}`,
              );
            }
          }

          return {
            overall_verdict: (block.verdict as string) ?? (block.quality_tier as string) ?? undefined,
            score: (draftForRevision.review_score as number | null) ?? null,
            critical_issues: dedupe([...criticalFromRubric, ...criticalDetailed, ...criticalRubric]),
            minor_issues: dedupe([...minorDetailed, ...minorRubric]),
            strengths: dedupe([...blockStrengths, ...rubricStrengths]),
          };
        })();

        const iterationCount = ((draftForRevision.iteration_count as number) ?? 0) + 1;
        const draftTitle =
          (draftForRevision.title as string) ??
          ((draftForRevision.draft_json as Record<string, unknown> | null)?.title as string | undefined) ??
          '';

        await withReservation(
          safeOrgId,
          safeUserId,
          produceCost,
          `production-${type}`,
          'text',
          { draftId: existingDraftId, type },
          async () => {
            const reproduced = await step.run('generate-reproduce', async () => {
              const enabledTools = resolveTools(produceAgentConfig.tools).filter(
                () => resolvedProvider !== 'ollama',
              );
              const userMessage = buildReproduceMessage({
                type: type as string,
                title: draftTitle,
                canonicalCore: draftForRevision.canonical_core_json,
                previousDraft: draftForRevision.draft_json,
                idea: ideaContextRevision,
                reviewFeedback: normalizedFeedback,
                iterationCount,
                priorAttempts,
                channel: channelContextRevision as
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
                    channelId: (draftForRevision.channel_id as string | null) ?? undefined,
                    sessionId: existingDraftId,
                    sessionType: 'production',
                  },
                },
              );
              await logUsage({
                orgId: safeOrgId,
                userId: safeUserId,
                channelId: (draftForRevision.channel_id as string | null) ?? null,
                stage: 'production',
                subStage: `produce-${type}`,
                sessionId: existingDraftId,
                sessionType: 'production',
                provider: call.providerName,
                model: call.model,
                usage: call.usage,
              });
              return call.result;
            });

            await assertNotAborted(projectId, existingDraftId, sb as Parameters<typeof assertNotAborted>[2]);

            await step.run('save-reproduce', async () => {
              await (sb as {
                from: (t: string) => {
                  update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
                };
              }).from('content_drafts')
                .update({ draft_json: reproduced, status: 'draft' })
                .eq('id', existingDraftId);
            });
          },
        );

        await step.run('emit-reproduce-done', async () => {
          await emitJobEvent(existingDraftId, 'production', 'completed', 'Revisão concluída!', {
            draftId: existingDraftId,
            type,
            stage: 'reproduce',
          });
        });

        await markCompleted(sb as Parameters<typeof markCompleted>[0], stageRunId, {
          ...ctx,
          payloadRef: { kind: 'content_draft', id: existingDraftId },
          outcome: { revision: true, iterationCount },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        if (err instanceof JobAborted) {
          await markAborted(sb as Parameters<typeof markAborted>[0], stageRunId, { ...ctx });
          return;
        }
        if (isQuotaExhausted(err)) {
          await markAwaitingUser(sb as Parameters<typeof markAwaitingUser>[0], stageRunId, {
            ...ctx,
            awaitingReason: 'provider_quota_exhausted',
            markStarted: true,
          });
          return;
        }
        await markFailed(sb as Parameters<typeof markFailed>[0], stageRunId, { ...ctx, errorMessage: message });
        throw err;
      }
      return;
    }

    // ── Normal path ──────────────────────────────────────────────────────────
    // The insert MUST run inside step.run: Inngest re-executes the function
    // body from the top after every step boundary (completed steps return
    // memoized results), so an un-stepped insert would create a DUPLICATE
    // content_drafts row on each re-execution. step.run memoizes the created
    // id so replays reuse the same draft.
    const created = await step.run('create-content-draft', async () => {
      const { data, error } = await (sb as {
        from: (t: string) => {
          insert: (row: Record<string, unknown>) => {
            select: () => { single: () => Promise<{ data: Record<string, unknown> | null; error: unknown }> };
          };
        };
      }).from('content_drafts')
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
          production_params: productionParams,
        })
        .select()
        .single();
      return {
        id: (data?.id as string | undefined) ?? null,
        errorMessage: error ? ((error as { message?: string }).message ?? 'unknown') : null,
      };
    });

    if (!created.id) {
      await markFailed(sb as Parameters<typeof markFailed>[0], stageRunId, {
        ...ctx,
        errorMessage: `Failed to create content_drafts row: ${created.errorMessage ?? 'unknown'}`,
      });
      return;
    }

    const draftId = created.id;

    await markRunning(sb as Parameters<typeof markRunning>[0], stageRunId, ctx);

    try {
      const creditSettings = await loadPlatformSettings(sb as Parameters<typeof loadPlatformSettings>[0]);
      const coreCost = applyProviderDiscount(creditSettings.costCanonicalCore, provider);
      const produceCost = applyProviderDiscount(calculateDraftCost(type, creditSettings), provider);

      await assertNotAborted(projectId, draftId, sb as Parameters<typeof assertNotAborted>[2]);

      await step.run('emit-loading-core', async () => {
        await emitJobEvent(draftId, 'production', 'loading_prompt', 'Carregando agente core…');
      });

      await assertNotAborted(projectId, draftId, sb as Parameters<typeof assertNotAborted>[2]);

      const loadedDraft = (await step.run('load-draft', async () => {
        const { data } = await (sb as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> };
            };
          };
        }).from('content_drafts').select('*').eq('id', draftId).maybeSingle();
        return data;
      })) as Record<string, unknown> | null;

      if (!loadedDraft) throw new Error('Draft não encontrado após inserção');

      await assertNotAborted(projectId, draftId, sb as Parameters<typeof assertNotAborted>[2]);

      const persona = (await step.run('load-persona', async () => {
        return loadPersonaForDraft(loadedDraft, sb as Parameters<typeof loadPersonaForDraft>[1]);
      })) as Awaited<ReturnType<typeof loadPersonaForDraft>>;

      const layeredPersona = (await step.run('load-persona-constraints', async () => {
        if (!persona) return null;
        return buildLayeredPersonaContext(persona, sb as Parameters<typeof buildLayeredPersonaContext>[1]);
      })) as Awaited<ReturnType<typeof buildLayeredPersonaContext>> | null;

      await assertNotAborted(projectId, draftId, sb as Parameters<typeof assertNotAborted>[2]);

      const approvedCards = (await step.run('load-research', async () => {
        if (!loadedDraft.research_session_id) return null;
        const { data } = await (sb as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> };
            };
          };
        }).from('research_sessions')
          .select('approved_cards_json, cards_json')
          .eq('id', loadedDraft.research_session_id as string)
          .maybeSingle();
        return data?.approved_cards_json ?? data?.cards_json ?? null;
      })) as unknown;

      await assertNotAborted(projectId, draftId, sb as Parameters<typeof assertNotAborted>[2]);

      const channelContext = (await step.run('load-channel', async () => {
        if (!loadedDraft.channel_id) return null;
        const { data } = await (sb as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> };
            };
          };
        }).from('channels')
          .select('name, niche, language, tone, presentation_style')
          .eq('id', loadedDraft.channel_id as string)
          .maybeSingle();
        return data;
      })) as Record<string, unknown> | null;

      await assertNotAborted(projectId, draftId, sb as Parameters<typeof assertNotAborted>[2]);

      const ideaContext = (await step.run('load-idea', async () => {
        if (!loadedDraft.idea_id) return null;
        return loadIdeaContext(loadedDraft.idea_id as string);
      })) as Awaited<ReturnType<typeof loadIdeaContext>>;

      await assertNotAborted(projectId, draftId, sb as Parameters<typeof assertNotAborted>[2]);

      const coreAgentConfig = (await step.run('load-core-prompt', async () => {
        const primary = await loadAgentConfig('content-core');
        if (primary.instructions) return primary;
        return loadAgentConfig('production');
      })) as Awaited<ReturnType<typeof loadAgentConfig>>;

      const { provider: resolvedCoreProvider, model: resolvedCoreModel } = resolveProviderOverride(
        provider,
        model,
        coreAgentConfig,
      );

      await assertNotAborted(projectId, draftId, sb as Parameters<typeof assertNotAborted>[2]);

      await step.run('emit-calling-core', async () => {
        const label = resolvedCoreProvider
          ? `${resolvedCoreProvider}${resolvedCoreModel ? ` (${resolvedCoreModel})` : ''}`
          : modelTier;
        await emitJobEvent(
          draftId,
          'production',
          'calling_provider',
          `Estruturando ideia central com ${label}…`,
          { stage: 'canonical-core', provider: resolvedCoreProvider, model: resolvedCoreModel },
        );
      });

      await assertNotAborted(projectId, draftId, sb as Parameters<typeof assertNotAborted>[2]);

      // ── Canonical-core phase ────────────────────────────────────────────────
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
              channel: channelContext as { name?: string; niche?: string; language?: string; tone?: string } | undefined,
            });
            const enabledTools = resolveTools(coreAgentConfig.tools).filter(
              () => resolvedCoreProvider !== 'ollama',
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
                provider: resolvedCoreProvider,
                model: resolvedCoreModel,
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

          await assertNotAborted(projectId, draftId, sb as Parameters<typeof assertNotAborted>[2]);

          await step.run('save-core', async () => {
            const coreToSave =
              loadedDraft.idea_id &&
              canonicalCore &&
              typeof canonicalCore === 'object' &&
              !Array.isArray(canonicalCore)
                ? { ...(canonicalCore as Record<string, unknown>), idea_id: loadedDraft.idea_id }
                : canonicalCore;
            await (sb as {
              from: (t: string) => {
                update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
              };
            }).from('content_drafts')
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

      await assertNotAborted(projectId, draftId, sb as Parameters<typeof assertNotAborted>[2]);

      // ── Produce phase ───────────────────────────────────────────────────────
      // Re-load draft with canonical_core_json now saved.
      const draftWithCore = (await step.run('reload-draft-for-produce', async () => {
        const { data } = await (sb as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> };
            };
          };
        }).from('content_drafts').select('*').eq('id', draftId).maybeSingle();
        return data;
      })) as Record<string, unknown> | null;

      if (!draftWithCore) throw new Error(`content_draft ${draftId} disappeared before produce`);

      const produceAgentConfig = (await step.run('load-produce-prompt', async () => {
        const primary = await loadAgentConfig(type);
        if (primary.instructions) return primary;
        return loadAgentConfig('production');
      })) as Awaited<ReturnType<typeof loadAgentConfig>>;

      const { provider: resolvedProduceProvider, model: resolvedProduceModel } =
        resolveProviderOverride(provider, model, produceAgentConfig);

      await step.run('emit-calling-produce', async () => {
        const label = resolvedProduceProvider
          ? `${resolvedProduceProvider}${resolvedProduceModel ? ` (${resolvedProduceModel})` : ''}`
          : modelTier;
        await emitJobEvent(draftId, 'production', 'calling_provider', `Escrevendo ${type} com ${label}…`, {
          stage: 'produce',
          provider: resolvedProduceProvider,
          model: resolvedProduceModel,
        });
      });

      await assertNotAborted(projectId, draftId, sb as Parameters<typeof assertNotAborted>[2]);

      const approvedCardsObj =
        approvedCards && typeof approvedCards === 'object' && !Array.isArray(approvedCards)
          ? (approvedCards as Record<string, unknown>)
          : null;
      const researchSources =
        type === 'blog' && approvedCardsObj?.sources ? (approvedCardsObj.sources as unknown[]) : undefined;

      await withReservation(
        safeOrgId,
        safeUserId,
        produceCost,
        `production-${type}`,
        'text',
        { draftId, type },
        async () => {
          const draftJson = await step.run('generate-produce', async () => {
            const enabledTools = resolveTools(produceAgentConfig.tools).filter(
              () => resolvedProduceProvider !== 'ollama',
            );
            const draftTitle =
              (draftWithCore.title as string) ??
              ((draftWithCore.draft_json as Record<string, unknown> | null)?.title as string | undefined) ??
              '';
            const userMessage = buildProduceMessage({
              type: type as string,
              title: draftTitle,
              canonicalCore: draftWithCore.canonical_core_json,
              idea: ideaContext,
              productionParams: productionParams ?? undefined,
              sources: researchSources,
              persona: layeredPersona?.voice ?? null,
              channel: channelContext as { name?: string; niche?: string; language?: string; tone?: string } | undefined,
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
                provider: resolvedProduceProvider,
                model: resolvedProduceModel,
                logContext: {
                  userId: safeUserId,
                  orgId: safeOrgId,
                  channelId: (draftWithCore.channel_id as string | null) ?? undefined,
                  sessionId: draftId,
                  sessionType: 'production',
                },
              },
            );
            await logUsage({
              orgId: safeOrgId,
              userId: safeUserId,
              channelId: (draftWithCore.channel_id as string | null) ?? null,
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

          await assertNotAborted(projectId, draftId, sb as Parameters<typeof assertNotAborted>[2]);

          await step.run('emit-saving', async () => {
            await emitJobEvent(draftId, 'production', 'saving', 'Salvando rascunho…');
          });

          await assertNotAborted(projectId, draftId, sb as Parameters<typeof assertNotAborted>[2]);

          await step.run('save-produce', async () => {
            await (sb as {
              from: (t: string) => {
                update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
              };
            }).from('content_drafts')
              .update({ draft_json: draftJson, status: 'draft' })
              .eq('id', draftId);
          });
        },
      );

      await step.run('emit-produce-done', async () => {
        await emitJobEvent(
          draftId,
          'production',
          'completed',
          `${type === 'blog' ? 'Post' : type === 'video' ? 'Vídeo' : type === 'shorts' ? 'Shorts' : 'Podcast'} pronto!`,
          { draftId, type, stage: 'produce' },
        );
      });

      await markCompleted(sb as Parameters<typeof markCompleted>[0], stageRunId, {
        ...ctx,
        payloadRef: { kind: 'content_draft', id: draftId },
        outcome: { revision: false },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      if (err instanceof JobAborted) {
        await (sb as {
          from: (t: string) => {
            update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
          };
        }).from('content_drafts')
          .update({ status: 'paused' })
          .eq('id', draftId);
        await emitJobEvent(draftId, 'production', 'aborted', 'Sessão cancelada pelo usuário');
        await markAborted(sb as Parameters<typeof markAborted>[0], stageRunId, { ...ctx });
        return;
      }
      if (isQuotaExhausted(err)) {
        await markAwaitingUser(sb as Parameters<typeof markAwaitingUser>[0], stageRunId, {
          ...ctx,
          awaitingReason: 'provider_quota_exhausted',
          markStarted: true,
        });
        return;
      }
      await markFailed(sb as Parameters<typeof markFailed>[0], stageRunId, {
        ...ctx,
        errorMessage: message,
      });
      throw err;
    }
  },
);
