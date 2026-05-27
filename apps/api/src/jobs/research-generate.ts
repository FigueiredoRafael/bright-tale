/**
 * F2-036 — Async research generation with progress events.
 * Mirrors brainstorm-generate pattern.
 */
import { inngest } from './client.js';
import { generateWithFallback } from '../lib/ai/router.js';

import { withReservation } from './utils/with-reservation.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { emitJobEvent } from './emitter.js';
import { logUsage } from '../lib/ai/usage-log.js';
import { buildResearchMessage } from '../lib/ai/prompts/research.js';
import { assertNotAborted, JobAborted } from '../lib/ai/abortable.js';
import { resolveTools, buildToolExecutor } from '../lib/ai/tools/index.js';
import { loadAgentConfig, resolveProviderOverride } from '../lib/ai/promptLoader.js';
import type { ResearchInput } from '../lib/ai/prompts/research.js';

const LEVEL_COSTS: Record<'surface' | 'medium' | 'deep', number> = {
  surface: 60,
  medium: 100,
  deep: 180,
};

interface ResearchGenerateEvent {
  name: 'research/generate';
  data: {
    sessionId: string;
    orgId: string;
    userId: string;
    channelId: string | null;
    ideaId: string | null;
    level: 'surface' | 'medium' | 'deep';
    inputJson: Record<string, unknown>;
    modelTier: string;
    provider?: 'gemini' | 'openai' | 'anthropic' | 'ollama';
    model?: string;
    /** Set when this run was launched via the new Pipeline Orchestrator. */
    stageRunId?: string;
  };
}

/**
 * Extract the full BC_RESEARCH_OUTPUT findings object so all sections
 * (sources, statistics, expert_quotes, counterarguments) are preserved.
 * Unwraps the BC_RESEARCH_OUTPUT wrapper key if present.
 * Falls back to a legacy flat-array normalizer for old-style model output.
 */
function extractResearchSignals(findings: unknown): Record<string, unknown> {
  if (!findings || typeof findings !== 'object') return {};
  const f = findings as Record<string, unknown>;
  const seo = f.seo as Record<string, unknown> | undefined;
  const validation = f.idea_validation as Record<string, unknown> | undefined;
  const refinedAngle = f.refined_angle as Record<string, unknown> | undefined;
  const secondaryKeywords =
    seo && Array.isArray(seo.secondary_keywords)
      ? (seo.secondary_keywords as Array<Record<string, unknown>>)
          .map((k) => k.keyword as string)
          .filter(Boolean)
      : undefined;
  const out: Record<string, unknown> = {};
  if (seo && typeof seo.primary_keyword === 'string') out.primaryKeyword = seo.primary_keyword;
  if (secondaryKeywords) out.secondaryKeywords = secondaryKeywords;
  if (seo && typeof seo.search_intent === 'string') out.searchIntent = seo.search_intent;
  if (validation && typeof validation.confidence_score === 'number') out.confidenceScore = validation.confidence_score;
  if (validation && typeof validation.evidence_strength === 'string') out.evidenceStrength = validation.evidence_strength;
  if (Array.isArray(f.sources)) out.sourceCount = (f.sources as unknown[]).length;
  if (Array.isArray(f.expert_quotes)) out.expertQuoteCount = (f.expert_quotes as unknown[]).length;
  if (typeof f.research_summary === 'string') out.researchSummary = f.research_summary;
  if (refinedAngle && typeof refinedAngle.recommendation === 'string') out.pivotRecommendation = refinedAngle.recommendation;
  return out;
}

function extractFindings(raw: unknown): { findings: Record<string, unknown>; cardCount: number } {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const top = raw as Record<string, unknown>;
    // Unwrap wrapper key if model returned { BC_RESEARCH_OUTPUT: { ... } }
    const inner = (top.BC_RESEARCH_OUTPUT && typeof top.BC_RESEARCH_OUTPUT === 'object' && !Array.isArray(top.BC_RESEARCH_OUTPUT))
      ? top.BC_RESEARCH_OUTPUT as Record<string, unknown>
      : top;
    const count = (['sources', 'statistics', 'expert_quotes', 'counterarguments'] as const)
      .reduce((n, k) => n + (Array.isArray(inner[k]) ? (inner[k] as unknown[]).length : 0), 0);
    return { findings: inner, cardCount: count };
  }
  // Legacy: flat array output (small local models)
  if (Array.isArray(raw)) {
    return { findings: { sources: raw }, cardCount: (raw as unknown[]).length };
  }
  return { findings: {}, cardCount: 0 };
}

export const researchGenerate = inngest.createFunction(
  {
    id: 'research-generate',
    retries: 0,
    triggers: [{ event: 'research/generate' }],
  },
  async ({ event, step }: { event: ResearchGenerateEvent; step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => {
    const { sessionId, orgId, userId, channelId, ideaId, level, inputJson, modelTier, provider, model, stageRunId } = event.data;
    const sb = createServiceClient();

    // Load projectId from research_sessions if available
    const { data: session } = await sb
      .from('research_sessions')
      .select('project_id')
      .eq('id', sessionId)
      .maybeSingle();
    const projectId = session?.project_id ?? undefined;

    try {
      await assertNotAborted(projectId, undefined, sb);

      await step.run('emit-loading-prompt', async () => {
        await emitJobEvent(sessionId, 'research', 'loading_prompt', 'Carregando agente research…');
      });

      await assertNotAborted(projectId, undefined, sb);

      const agentConfig = (await step.run('load-prompt', async () => {
        const config = await loadAgentConfig('research');
        return {
          instructions: `${config.instructions}\n\nLevel directive: ${(inputJson as { instruction?: string }).instruction ?? ''}`.trim(),
          tools: config.tools,
          recommended_provider: config.recommended_provider,
          recommended_model: config.recommended_model,
        };
      })) as Awaited<ReturnType<typeof loadAgentConfig>>;
      const systemPrompt = agentConfig.instructions;
      const { provider: resolvedProvider, model: resolvedModel } = resolveProviderOverride(provider, model, agentConfig);

      await assertNotAborted(projectId, undefined, sb);

      await step.run('emit-calling-provider', async () => {
        const label = resolvedProvider ? `${resolvedProvider}${resolvedModel ? ` (${resolvedModel})` : ''}` : modelTier;
        await emitJobEvent(sessionId, 'research', 'calling_provider', `Pesquisando com ${label}…`, { provider: resolvedProvider, model: resolvedModel, level });
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
      const charge = provider === 'ollama' ? 0 : LEVEL_COSTS[level];
      const creditMeta = { channelId, ideaId, provider };
      // Hoisted so the post-reservation stage-run write at the bottom of this
      // job can read the parsed findings (the reservation callback returns
      // only the card count for credit-commit accounting).
      let findings: Record<string, unknown> = {};

      const cardCount = await withReservation(
        orgId,
        userId,
        charge,
        `research-${level}`,
        'text',
        creditMeta,
        async () => {
          const result = (await step.run('call-provider', async () => {
            const userMessage = buildResearchMessage({
              ideaId: (inputJson.ideaId as string) ?? undefined,
              ideaTitle: (inputJson.topic as string) ?? undefined,
              coreTension: undefined,
              targetAudience: undefined,
              level: (inputJson.level as string) ?? undefined,
              instruction: (inputJson.instruction as string) ?? undefined,
              channel: channelContext as ResearchInput['channel'],
            });

            const enabledTools = resolveTools(agentConfig.tools).filter(
              () => resolvedProvider !== 'ollama',
            );
            const call = await generateWithFallback(
              'research',
              modelTier,
              {
                agentType: 'research',
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
                  sessionType: 'research',
                },
              },
            );
            await logUsage({
              orgId, userId, channelId,
              stage: 'research', subStage: level,
              sessionId, sessionType: 'research',
              provider: call.providerName, model: call.model,
              usage: call.usage,
            });
            return call.result;
          })) as unknown;

          await assertNotAborted(projectId, undefined, sb);

          await step.run('emit-parsing', async () => {
            await emitJobEvent(sessionId, 'research', 'parsing_output', 'Organizando fontes e citações…');
          });

          const extracted = extractFindings(result);
          findings = extracted.findings;
          const count = extracted.cardCount;

          await assertNotAborted(projectId, undefined, sb);

          await step.run('emit-saving', async () => {
            await emitJobEvent(sessionId, 'research', 'saving', `Salvando ${count} cards de pesquisa…`, { count });
          });

          await assertNotAborted(projectId, undefined, sb);

          await step.run('persist', async () => {
            await (sb.from('research_sessions') as unknown as {
              update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
            })
              .update({ status: 'completed', cards_json: findings })
              .eq('id', sessionId);
            // Credit debit handled by withReservation (commit on success, release on throw).
          });

          return count;
        },
      );

      await emitJobEvent(
        sessionId,
        'research',
        'completed',
        `${cardCount} cards de pesquisa gerados!`,
        { cardCount },
      );

      // Bind this completed session to a stage_run so ctx/sidebar pick it up.
      // - Orchestrator path: stageRunId is passed by pipeline-research-dispatch.
      // - Engine path (POST /api/research-sessions, /:id/regenerate): no
      //   stageRunId — resolve the latest research stage_run for the project
      //   and update it. Without this the new session is orphaned: sidebar
      //   stays on the prior aborted/completed row and downstream stages
      //   can't see the new research.
      let resolvedStageRunId: string | null = stageRunId ?? null;
      if (!resolvedStageRunId && projectId) {
        const { data: latestRun } = await sb
          .from('stage_runs')
          .select('id')
          .eq('project_id', projectId)
          .eq('stage', 'research')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestRun?.id) resolvedStageRunId = latestRun.id as string;
      }

      if (resolvedStageRunId) {
        const now = new Date().toISOString();
        const signals = extractResearchSignals(findings);
        const outcomeJson: Record<string, unknown> = {
          researchSessionId: sessionId,
          approvedCardsCount: cardCount,
          researchLevel: level,
          ...signals,
        };
        await (sb.from('stage_runs') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        })
          .update({
            status: 'completed',
            payload_ref: { kind: 'research_session', id: sessionId },
            outcome_json: outcomeJson,
            error_message: null,
            finished_at: now,
            updated_at: now,
          })
          .eq('id', resolvedStageRunId);
        await inngest.send({
          name: 'pipeline/stage.run.finished',
          data: { stageRunId: resolvedStageRunId, projectId },
        });
      }

      return { success: true, cards: cardCount };
    } catch (err) {
      if (err instanceof JobAborted) {
        // research_sessions.status does not support 'paused' status yet,
        // so we only emit the abort event (no database update)
        await emitJobEvent(sessionId, 'research', 'aborted', 'Sessão cancelada pelo usuário');
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

      const message = err instanceof Error ? err.message : 'Erro desconhecido';

      // Any AI failure parks the stage in awaiting_user(manual_paste) so the
      // user can paste an externally-generated BC_RESEARCH_OUTPUT. Replaces
      // the legacy `provider_quota_exhausted` branch.
      await (sb.from('research_sessions') as unknown as {
        update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
      })
        .update({ status: 'awaiting_manual', error_message: message.slice(0, 500) })
        .eq('id', sessionId);

      await emitJobEvent(sessionId, 'research', 'awaiting_manual', message.slice(0, 200), { error: message });

      if (stageRunId) {
        const now = new Date().toISOString();
        await (sb.from('stage_runs') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        })
          .update({
            status: 'awaiting_user',
            awaiting_reason: 'manual_paste',
            payload_ref: { kind: 'research_session', id: sessionId },
            error_message: message.slice(0, 500),
            updated_at: now,
          })
          .eq('id', stageRunId);
      }

      return;
    }
  },
);
