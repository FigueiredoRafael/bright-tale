/**
 * F2-036 — Async brainstorm generation with progress events.
 *
 * Triggered by POST /brainstorm/sessions (which only enqueues + returns sessionId).
 * Each step emits a job_event consumed by the SSE endpoint so the frontend modal
 * can show live progress ("Calling Ollama…", "Parsing output…", "Saving…").
 */
import { inngest } from './client.js';
import { STAGE_COSTS, generateWithFallback, isQuotaExhausted } from '../lib/ai/router.js';
import { loadAgentConfig, resolveProviderOverride } from '../lib/ai/promptLoader.js';
import { resolveTools, buildToolExecutor } from '../lib/ai/tools/index.js';
import { withReservation } from './utils/with-reservation.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { emitJobEvent } from './emitter.js';
import { logUsage } from '../lib/ai/usage-log.js';
import { buildBrainstormMessage } from '../lib/ai/prompts/brainstorm.js';
import { assertNotAborted, JobAborted } from '../lib/ai/abortable.js';
import { markCompleted, markAborted, markFailed, markAwaitingUser } from '../lib/pipeline/stage-run-writer.js';
import type { BrainstormInput } from '../lib/ai/prompts/brainstorm.js';

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
    targetCount?: number;
    /** Set when this run was launched via the new Pipeline Orchestrator. */
    stageRunId?: string;
  };
}

interface RawIdea {
  idea_id?: string;
  title?: string;
  angle?: string;
  core_tension?: string;
  target_audience?: string;
  search_intent?: string;
  primary_keyword?: { term?: string; difficulty?: string; monthly_volume_estimate?: string };
  scroll_stopper?: string;
  curiosity_gap?: string;
  monetization?: string | { affiliate_angle?: string; product_fit?: string; sponsor_appeal?: string };
  monetization_hypothesis?: { affiliate_angle?: string; product_categories?: string[]; sponsor_category?: string };
  repurpose_potential?: { blog_angle?: string; video_angle?: string; shorts_hooks?: string[]; podcast_angle?: string };
  repurposing?: string[];
  risk_flags?: string[];
  verdict?: string;
  verdict_rationale?: string;
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
    const { sessionId, orgId, userId, channelId, inputJson, modelTier, provider, model, targetCount, stageRunId } = event.data;
    const sb = createServiceClient();

    // Load projectId from brainstorm_sessions if available
    const { data: session } = await sb
      .from('brainstorm_sessions')
      .select('project_id')
      .eq('id', sessionId)
      .maybeSingle();
    const projectId = session?.project_id ?? undefined;

    // Resolve the stage_run to write back to. When the dispatcher gives one
    // explicitly (autopilot path), use it. Otherwise — engine-driven retries
    // and standalone runs that are still linked to a project — fall back to
    // the most recent brainstorm stage_run for the project so a successful
    // output always reconciles a leftover failed/queued/running row instead
    // of leaving it stale.
    const resolveEffectiveStageRunId = async (): Promise<string | undefined> => {
      if (stageRunId) return stageRunId;
      if (!projectId) return undefined;
      const { data: latestRun } = await sb
        .from('stage_runs')
        .select('id')
        .eq('project_id', projectId)
        .eq('stage', 'brainstorm')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (latestRun?.id as string | undefined) ?? undefined;
    };

    try {
      await assertNotAborted(projectId, undefined, sb);

      await step.run('emit-loading-prompt', async () => {
        await emitJobEvent(sessionId, 'brainstorm', 'loading_prompt', 'Carregando agente brainstorm…');
      });

      await assertNotAborted(projectId, undefined, sb);

      const agentConfig = (await step.run('load-prompt', async () => {
        return loadAgentConfig('brainstorm');
      })) as Awaited<ReturnType<typeof loadAgentConfig>>;
      const systemPrompt = agentConfig.instructions || null;
      const { provider: resolvedProvider, model: resolvedModel } = resolveProviderOverride(provider, model, agentConfig);

      await assertNotAborted(projectId, undefined, sb);

      await step.run('emit-calling-provider', async () => {
        const label = resolvedProvider ? `${resolvedProvider}${resolvedModel ? ` (${resolvedModel})` : ''}` : modelTier;
        await emitJobEvent(sessionId, 'brainstorm', 'calling_provider', `Conversando com ${label}…`, { provider: resolvedProvider, model: resolvedModel });
      });

      await assertNotAborted(projectId, undefined, sb);

      const channelContext = (await step.run('load-channel', async () => {
        if (!channelId) return null;
        const { data } = await sb
          .from('channels')
          .select('name, niche, language, tone, presentation_style')
          .eq('id', channelId as string)
          .maybeSingle();
        return data;
      })) as Record<string, unknown> | null;

      await assertNotAborted(projectId, undefined, sb);

      // ── Credit reservation lifecycle ─────────────────────────────────────
      // withReservation reads the feature flag once. When ON it reserves credits
      // up front and commits (or releases on throw) after fn completes.
      // When OFF it falls back to checkCredits + debitCredits inline.
      const charge = provider === 'ollama' ? 0 : STAGE_COSTS.brainstorm;
      const creditMeta = { channelId, mode: event.data.inputMode, provider };

      const persisted = await withReservation(
        orgId,
        userId,
        charge,
        'brainstorm',
        'text',
        creditMeta,
        async () => {
          const result = (await step.run('call-provider', async () => {
            const userMessage = buildBrainstormMessage({
              topic: (inputJson.topic as string) ?? undefined,
              ideasRequested: (inputJson.ideasRequested as number) ?? undefined,
              fineTuning: inputJson.fineTuning as BrainstormInput['fineTuning'],
              referenceUrl: (inputJson.referenceUrl as string) ?? undefined,
              channel: channelContext as BrainstormInput['channel'],
            });

            const enabledTools = resolveTools(agentConfig.tools).filter(
              () => resolvedProvider !== 'ollama',
            );
            const call = await generateWithFallback(
              'brainstorm',
              modelTier,
              {
                agentType: 'brainstorm',
                systemPrompt: systemPrompt ?? '',
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
                  channelId,
                  sessionId,
                  sessionType: 'brainstorm',
                },
              },
            );
            await logUsage({
              orgId, userId, channelId,
              stage: 'brainstorm',
              sessionId, sessionType: 'brainstorm',
              provider: call.providerName, model: call.model,
              usage: call.usage,
            });
            return call.result;
          })) as unknown;

          await assertNotAborted(projectId, undefined, sb);

          await step.run('emit-parsing', async () => {
            await emitJobEvent(sessionId, 'brainstorm', 'parsing_output', 'Processando resposta da IA…');
          });

          const ideas = normalizeIdeas(result);

          if (ideas.length === 0) {
            throw new Error('AI returned a response but no ideas could be parsed from the output. Try a different model or re-run.');
          }

          // Extract recommendation from AI output
          let recommendation: { pick?: string; rationale?: string } | null = null;
          if (result && typeof result === 'object' && 'recommendation' in (result as Record<string, unknown>)) {
            recommendation = (result as Record<string, unknown>).recommendation as { pick?: string; rationale?: string } | null;
          }

          // F2-037: enforce target_count at the job level as a safety net in
          // case the model ignored the prompt directive.
          const capped = typeof targetCount === 'number' ? ideas.slice(0, targetCount) : ideas;

          await assertNotAborted(projectId, undefined, sb);

          await step.run('emit-saving', async () => {
            await emitJobEvent(sessionId, 'brainstorm', 'saving', `Salvando ${capped.length} ideias em draft…`, { count: capped.length });
          });

          await assertNotAborted(projectId, undefined, sb);

          return step.run('persist-ideas', async () => {
            // F2-037: stage ideas in brainstorm_drafts instead of idea_archives.
            // The user picks which to keep via POST /drafts/save.
            const draftRows = capped.map((idea, i) => ({
              session_id: sessionId,
              org_id: orgId,
              user_id: userId,
              channel_id: channelId,
              title: idea.title ?? `Untitled ${i + 1}`,
              core_tension: idea.core_tension ?? '',
              target_audience: idea.target_audience ?? '',
              verdict:
                idea.verdict === 'viable' || idea.verdict === 'weak' || idea.verdict === 'experimental'
                  ? idea.verdict
                  : 'experimental',
              discovery_data: JSON.stringify({
                angle: idea.angle,
                search_intent: idea.search_intent,
                primary_keyword: idea.primary_keyword,
                scroll_stopper: idea.scroll_stopper,
                curiosity_gap: idea.curiosity_gap,
                monetization: idea.monetization,
                monetization_hypothesis: idea.monetization_hypothesis,
                repurpose_potential: idea.repurpose_potential,
                repurposing: idea.repurposing,
                risk_flags: idea.risk_flags,
                verdict_rationale: idea.verdict_rationale,
              }),
              position: i,
            }));

            if (draftRows.length > 0) {
              // Clear any previous drafts from this session (shouldn't happen with
              // idempotent inngest, but defensive) then insert fresh ones.
              await sb.from('brainstorm_drafts').delete().eq('session_id', sessionId);
              await (sb.from('brainstorm_drafts') as unknown as {
                insert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }>;
              }).insert(draftRows);
            }

            await (sb.from('brainstorm_sessions') as unknown as {
              update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
            })
              .update({ status: 'completed', ...(recommendation ? { recommendation_json: recommendation } : {}) })
              .eq('id', sessionId);

            // Credit debit is now handled by withReservation (commit on success,
            // release on throw). No inline debitCredits call here.
            return draftRows.length;
          });
        },
      );

      await emitJobEvent(
        sessionId,
        'brainstorm',
        'completed',
        `${persisted} ideias geradas — revise e escolha quais salvar.`,
        { ideaCount: persisted },
      );

      // Pipeline Orchestrator handoff: write terminal status to the Stage Run
      // and emit `pipeline/stage.run.finished` so `pipeline-advance` can react.
      const successStageRunId = await resolveEffectiveStageRunId();
      if (successStageRunId) {
        const { data: firstDraft } = await sb
          .from('brainstorm_drafts')
          .select('id, title, verdict, core_tension')
          .eq('session_id', sessionId)
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle();
        // Seed outcome_json with the first draft's metadata so downstream
        // engines (ResearchEngine reads brainstormResult.ideaTitle from
        // stage_runs.outcome_json via deriveStageResults) have a sensible
        // default. The user can override the choice via the UI; that path
        // goes through a separate selection endpoint (or no-ops when picking
        // the first card, which is the same as the auto-default).
        const seedOutcome = firstDraft?.id
          ? {
              ideaId: firstDraft.id,
              ideaTitle: firstDraft.title as string,
              ideaVerdict: (firstDraft.verdict as string) ?? '',
              ideaCoreTension: (firstDraft.core_tension as string) ?? '',
              brainstormSessionId: sessionId,
            }
          : undefined;
        // markCompleted clears error_message + awaiting_reason automatically
        // so retry rows are always reconciled cleanly.
        await markCompleted(sb, successStageRunId, {
          projectId: projectId ?? '',
          stage: 'brainstorm',
          payloadRef: firstDraft?.id ? { kind: 'brainstorm_draft', id: firstDraft.id } : undefined,
          outcome: seedOutcome,
        });
        if (projectId && firstDraft?.title) {
          await (sb.from('projects') as unknown as {
            update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
          })
            .update({ title: firstDraft.title as string })
            .eq('id', projectId);
        }
      }

      return { success: true, ideas: persisted };
    } catch (err) {
      if (err instanceof JobAborted) {
        // brainstorm_sessions.status does not support 'paused' status yet,
        // so we only emit the abort event (no database update)
        await emitJobEvent(sessionId, 'brainstorm', 'aborted', 'Sessão cancelada pelo usuário');
        const abortStageRunId = await resolveEffectiveStageRunId();
        if (abortStageRunId) {
          await markAborted(sb, abortStageRunId, {
            projectId: projectId ?? '',
            stage: 'brainstorm',
          });
        }
        return;
      }

      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      const quotaExhausted = isQuotaExhausted(err);

      // Provider quota exhausted: park the stage awaiting user (not failed) so
      // the operator can top up credits / swap providers and resume. Leave the
      // upstream session row in 'failed' — the orchestrator only reads stage_runs.
      await (sb.from('brainstorm_sessions') as unknown as {
        update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
      })
        .update({ status: 'failed', error_message: message.slice(0, 500) })
        .eq('id', sessionId);

      await emitJobEvent(sessionId, 'brainstorm', 'failed', message.slice(0, 200), { error: message });

      const failureStageRunId = await resolveEffectiveStageRunId();
      if (failureStageRunId) {
        if (quotaExhausted) {
          // Quota-park is non-terminal — markAwaitingUser emits NO event;
          // orchestrator resumes via the explicit /continue path.
          await markAwaitingUser(sb, failureStageRunId, {
            projectId: projectId ?? '',
            stage: 'brainstorm',
            awaitingReason: 'provider_quota_exhausted',
          });
        } else {
          await markFailed(sb, failureStageRunId, {
            projectId: projectId ?? '',
            stage: 'brainstorm',
            errorMessage: message,
          });
        }
      }

      if (quotaExhausted) return;
      throw err;
    }
  },
);
