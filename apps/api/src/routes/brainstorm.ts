/**
 * F2-016 — Brainstorm sessions.
 * Creates a brainstorm_sessions row, runs the brainstorm agent, and persists
 * the resulting ideas to idea_archives scoped to the channel + session.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { STAGE_COSTS, generateWithFallback } from '../lib/ai/router.js';
import { loadAgentPrompt } from '../lib/ai/promptLoader.js';
import { reserve, commit, release } from '../lib/credits/reservations.js';
import { inngest } from '../jobs/client.js';
import { emitJobEvent } from '../jobs/emitter.js';
import { buildBrainstormMessage } from '../lib/ai/prompts/brainstorm.js';
import type { BrainstormInput } from '../lib/ai/prompts/brainstorm.js';
import { logAiUsage } from '../lib/axiom.js';
import { ensureStageRunId, markCompleted, markFailed, markAwaitingUser, markAborted } from '../lib/pipeline/stage-run-writer.js';
import { sessionStatusFromStageRun } from '../lib/pipeline/session-status.js';
import { createEphemeralProject } from '../lib/projects/createEphemeralProject.js';

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

const brainstormBodySchema = z.object({
  channelId: z.string().uuid().optional(),
  projectId: z.string().optional(),
  inputMode: z.enum(['blind', 'fine_tuned', 'reference_guided']),
  topic: z.string().min(2).optional(),
  fineTuning: z
    .object({
      niche: z.string().optional(),
      tone: z.string().optional(),
      audience: z.string().optional(),
      goal: z.string().optional(),
      constraints: z.string().optional(),
    })
    .optional(),
  referenceUrl: z.string().url().optional(),
  modelTier: z.string().default('standard'),
  provider: z.enum(['gemini', 'openai', 'anthropic', 'ollama', 'manual']).optional(),
  model: z.string().optional(),
  // Advanced settings
  temporalMix: z
    .object({
      evergreen: z.number().min(0).max(100),
      seasonal: z.number().min(0).max(100),
      trending: z.number().min(0).max(100),
    })
    .refine((v) => v.evergreen + v.seasonal + v.trending === 100, {
      message: 'Temporal mix must sum to 100',
    })
    .optional(),
  constraints: z
    .object({
      avoidTopics: z.array(z.string()).default([]),
      requiredFormats: z.array(z.string()).default([]),
    })
    .optional(),
  ideasRequested: z.number().int().min(1).max(10).default(5),
  performanceContext: z
    .object({
      recentWinners: z.array(z.string()).default([]),
      recentLosers: z.array(z.string()).default([]),
    })
    .optional(),
  contentGoal: z.enum(['growth', 'engagement', 'monetization', 'authority']).optional(),
}).superRefine((val, ctx) => {
  if (!val.projectId && !val.channelId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Either projectId or channelId is required',
      path: ['channelId'],
    });
  }
});

async function getOrgId(userId: string): Promise<string> {
  const sb = createServiceClient();
  const { data } = await sb
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!data) throw new ApiError(404, 'No organization found', 'NOT_FOUND');
  return data.org_id;
}

export async function brainstormRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /sessions/running — Check if the user has a brainstorm session currently
   * in progress. Returns the most recent running session so the frontend can
   * reconnect to its SSE stream after a page reload.
   */
  fastify.get('/sessions/running', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const sb = createServiceClient();
      const { channelId } = request.query as { channelId?: string };

      // Derive "running" sessions from stage_runs (single source of truth).
      // Find project_ids whose latest brainstorm stage_run maps to DTO 'running':
      //   stage_runs.status = 'running'  OR  (status = 'awaiting_user' AND awaiting_reason != 'manual_paste')
      const runsQuery = sb
        .from('stage_runs')
        .select('project_id, status, awaiting_reason')
        .eq('stage', 'brainstorm')
        .in('status', ['running', 'awaiting_user'])
        .order('created_at', { ascending: false });

      const { data: candidateRuns } = await runsQuery;

      // Dedupe to latest run per project_id, keep only those that map to DTO 'running'
      const seenProjects = new Set<string>();
      const runningProjectIds: string[] = [];
      for (const run of (candidateRuns ?? []) as Array<{ project_id: string; status: string; awaiting_reason: string | null }>) {
        if (seenProjects.has(run.project_id)) continue;
        seenProjects.add(run.project_id);
        const isRunning = run.status === 'running' ||
          (run.status === 'awaiting_user' && run.awaiting_reason !== 'manual_paste');
        if (isRunning) runningProjectIds.push(run.project_id);
      }

      if (runningProjectIds.length === 0) {
        return reply.send({ data: { session: null }, error: null });
      }

      let sessionQuery = sb
        .from('brainstorm_sessions')
        .select('id, project_id, input_json, created_at')
        .eq('user_id', request.userId)
        .in('project_id', runningProjectIds)
        .order('created_at', { ascending: false })
        .limit(1);

      if (channelId) {
        sessionQuery = sessionQuery.eq('channel_id', channelId);
      }

      const { data, error } = await sessionQuery.maybeSingle();
      if (error) throw error;

      // Inject computed status into response so body shape is unchanged
      const session = data ? { ...data, status: 'running' } : null;

      return reply.send({ data: { session }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /sessions/:id/cancel — Cancel a running brainstorm session.
   */
  fastify.post('/sessions/:id/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const { id } = request.params as { id: string };
      const sb = createServiceClient();

      const { data: session } = await sb
        .from('brainstorm_sessions')
        .select('id, status, user_id, project_id')
        .eq('id', id)
        .maybeSingle();

      if (!session) throw new ApiError(404, 'Session not found', 'NOT_FOUND');
      const sessionRow = session as Record<string, unknown>;
      if (sessionRow.user_id !== request.userId) throw new ApiError(403, 'Forbidden', 'FORBIDDEN');

      // Derive status from stage_run (single source of truth); fall back to
      // column value for legacy sessions without a project_id (removed in D24c).
      const cancelProjectId = sessionRow.project_id as string | null | undefined;
      const derivedStatus = cancelProjectId
        ? await sessionStatusFromStageRun(sb, cancelProjectId, 'brainstorm')
        : ((sessionRow.status as string | undefined) ?? 'pending');

      if (derivedStatus !== 'running' && derivedStatus !== 'awaiting_manual') {
        return reply.send({ data: { status: derivedStatus }, error: null });
      }

      await (sb.from('brainstorm_sessions') as unknown as {
        update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
      })
        .update({ error_message: 'Cancelled by user' })
        .eq('id', id);

      await emitJobEvent(id, 'brainstorm', 'failed', 'Cancelled by user');

      // Cancel the Inngest function run if possible
      try {
        await inngest.send({ name: 'inngest/function.cancelled', data: { function_id: 'brainstorm-generate', run_id: id } });
      } catch {
        // Best-effort — Inngest may not support this or the run may already be done
      }

      // BRI-157: Mark the brainstorm Stage Run aborted so the orchestrator sees
      // the terminal state. Mirrors the research cancel handler. Best-effort.
      if (cancelProjectId) {
        const cancelRunId = await ensureStageRunId(sb, cancelProjectId, 'brainstorm').catch(() => undefined);
        if (cancelRunId) {
          await markAborted(sb, cancelRunId, {
            projectId: cancelProjectId,
            stage: 'brainstorm',
            errorMessage: 'Cancelled by user',
          }).catch(() => { /* best-effort */ });
        }
      }

      return reply.send({ data: { status: 'cancelled' }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /sessions/:id/manual-output — Submit the output produced externally
   * for a session in `awaiting_manual` status. Persists the ideas, flips the
   * session to `completed`, and emits a `manual.completed` Axiom event.
   */
  fastify.post('/sessions/:id/manual-output', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const { id } = request.params as { id: string };
      const body = z.object({ output: z.unknown() }).parse(request.body);
      const sb = createServiceClient();

      const { data: session, error: fetchErr } = await sb
        .from('brainstorm_sessions')
        .select('id, status, channel_id, project_id, org_id, user_id')
        .eq('id', id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!session) throw new ApiError(404, 'Session not found', 'NOT_FOUND');
      const row = session as Record<string, unknown>;
      if (row.user_id !== request.userId) throw new ApiError(403, 'Forbidden', 'FORBIDDEN');

      // Derive status from stage_run (single source of truth); fall back to
      // column value for legacy sessions without a project_id (removed in D24c).
      const manualOutputProjectId = row.project_id as string | null | undefined;
      const manualDerivedStatus = manualOutputProjectId
        ? await sessionStatusFromStageRun(sb, manualOutputProjectId, 'brainstorm')
        : ((row.status as string | undefined) ?? 'pending');

      if (manualDerivedStatus !== 'awaiting_manual') {
        throw new ApiError(409, `Session is not awaiting manual output (status=${manualDerivedStatus})`, 'CONFLICT');
      }

      const rawIdeas = normalizeIdeas(body.output);
      if (rawIdeas.length === 0) {
        throw new ApiError(400, 'No ideas found in pasted output', 'INVALID_OUTPUT');
      }

      const { count } = await sb.from('idea_archives').select('*', { count: 'exact', head: true });
      const startNum = (count ?? 0) + 1;

      const ideaRows = rawIdeas.map((idea, i) => ({
        // Always generate a fresh BC-IDEA-NNN id. Trusting the agent's
        // idea_id (e.g., "P001") collides with prior sessions and the upsert
        // silently drops the row, leaving the session with no linked ideas.
        idea_id: `BC-IDEA-${String(startNum + i).padStart(3, '0')}`,
        title: idea.title ?? `Untitled ${i + 1}`,
        core_tension: idea.core_tension ?? '',
        target_audience: idea.target_audience ?? '',
        verdict: idea.verdict === 'viable' || idea.verdict === 'weak' || idea.verdict === 'experimental'
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
        source_type: 'manual',
        channel_id: row.channel_id ?? null,
        project_id: row.project_id ?? null,
        brainstorm_session_id: id,
        user_id: row.user_id,
        org_id: row.org_id,
      }));

      const { error: insErr } = await (sb.from('idea_archives') as unknown as {
        upsert: (rows: Record<string, unknown>[], opts?: unknown) => Promise<{ error: unknown }>;
      }).upsert(ideaRows, { onConflict: 'idea_id', ignoreDuplicates: true });
      if (insErr) throw insErr;

      let recommendation: { pick?: string; rationale?: string; content_warning?: string } | null = null;
      if (body.output && typeof body.output === 'object') {
        const out = body.output as Record<string, unknown>;
        if ('recommendation' in out) {
          recommendation = out.recommendation as { pick?: string; rationale?: string } | null;
          if (recommendation && typeof out.content_warning === 'string') {
            recommendation = { ...recommendation, content_warning: out.content_warning };
          }
        }
      }

      // BRI-157: status is now derived from stage_runs; only persist
      // recommendation_json here if present. The full pasted output is captured
      // in Axiom via the manual.completed event below.
      if (recommendation) {
        const { error: updErr } = await (sb.from('brainstorm_sessions') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: unknown }> };
        })
          .update({ recommendation_json: recommendation })
          .eq('id', id);
        if (updErr) {
          throw new ApiError(500, `Failed to update session: ${String((updErr as { message?: string })?.message ?? updErr)}`, 'DB_ERROR');
        }
      }

      // Re-query the persisted idea_archives rows so we can return real UUIDs to
      // the client AND seed the brainstorm Stage Run outcome with a proper FK.
      // The upsert above used onConflict:'idea_id' + ignoreDuplicates so we did
      // not get returning rows; reading by brainstorm_session_id is the
      // canonical source.
      const { data: persistedIdeas } = await sb
        .from('idea_archives')
        .select('id, idea_id, title, core_tension, target_audience, verdict, discovery_data')
        .eq('brainstorm_session_id', id)
        .order('created_at', { ascending: true });
      const ideas = (persistedIdeas ?? []) as Array<Record<string, unknown>>;

      // Pipeline Orchestrator handoff for manual brainstorms: flip the matching
      // brainstorm Stage Run to `completed` and seed `outcome_json` so
      // deriveStageResults picks it up (it skips rows where status !== 'completed').
      // Without this, a stage_run stuck in `failed` (e.g. initial run died because
      // no AI provider was configured) keeps the UI thinking brainstorm never
      // finished even after the user pasted output.
      const projectId = row.project_id as string | null | undefined;
      if (projectId && ideas.length > 0) {
        // Prefer the AI's `recommendation.pick` (matched by title) so autopilot
        // promotes the winning idea, not just the first card. Fall back to the
        // first `viable` verdict, then the first idea overall.
        const pickTitle = recommendation?.pick?.trim().toLowerCase();
        const byPick = pickTitle
          ? ideas.find((i) => ((i.title as string) ?? '').trim().toLowerCase() === pickTitle)
          : undefined;
        const firstViable = ideas.find((i) => i.verdict === 'viable');
        const winner = byPick ?? firstViable ?? ideas[0];
        const winnerId = winner.id as string;
        const winnerTitle = (winner.title as string) ?? '';
        const seedOutcome = {
          ideaId: winnerId,
          ideaTitle: winnerTitle,
          ideaVerdict: (winner.verdict as string) ?? '',
          ideaCoreTension: (winner.core_tension as string) ?? '',
          brainstormSessionId: id,
        };

        // Resolve the brainstorm Stage Run to reconcile, creating one when the
        // step-by-step path never pre-created it (no autopilot dispatcher).
        // Without this a manually-pasted brainstorm would leave no completed
        // stage_run → the work can't be re-hydrated on navigation (BRI-151).
        const stageRunId = await ensureStageRunId(sb, projectId, 'brainstorm').catch(() => undefined);

        if (stageRunId) {
          // markCompleted clears error_message + awaiting_reason automatically.
          await markCompleted(sb, stageRunId, {
            projectId,
            stage: 'brainstorm',
            payloadRef: { kind: 'idea_archive', id: winnerId },
            outcome: seedOutcome,
          });
        }

        if (winnerTitle) {
          await (sb.from('projects') as unknown as {
            update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
          })
            .update({ title: winnerTitle })
            .eq('id', projectId);
        }
      }

      logAiUsage({
        userId: request.userId,
        orgId: (row.org_id as string) ?? null,
        action: 'manual.completed',
        provider: 'manual',
        model: 'manual',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        durationMs: 0,
        status: 'success',
        metadata: {
          sessionId: id,
          stage: 'brainstorm',
          output: body.output,
          ideaCount: ideaRows.length,
        },
      });

      return reply.send({
        data: { ideas: ideas.length > 0 ? ideas : ideaRows, recommendation },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /sessions — Run a brainstorm and persist ideas.
   */
  fastify.post('/sessions', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');

      const body = brainstormBodySchema.parse(request.body);
      const orgId = await getOrgId(request.userId);
      const sb = createServiceClient();

      // Manual provider + Ollama: no internal credit charge.
      // Credit reservation is handled by the brainstorm/generate job via withReservation.
      const cost = body.provider === 'ollama' || body.provider === 'manual' ? 0 : STAGE_COSTS.brainstorm;
      void cost; // declared for clarity; debit handled in job

      const inputJson: Record<string, unknown> = {
        topic: body.topic ?? null,
        fineTuning: body.fineTuning ?? null,
        referenceUrl: body.referenceUrl ?? null,
        temporalMix: body.temporalMix ?? null,
        constraints: body.constraints ?? null,
        ideasRequested: body.ideasRequested,
        performanceContext: body.performanceContext ?? null,
        contentGoal: body.contentGoal ?? null,
      };

      // BRI-159: Resolve (or create) the project id. When projectId is absent,
      // auto-create an ephemeral project bound to channelId so stage_runs
      // (which require project_id NOT NULL) can be created for this session.
      // The superRefine above guarantees channelId is present when projectId is absent.
      const effectiveProjectId: string = body.projectId
        ? body.projectId
        : await createEphemeralProject(sb, {
            channelId: body.channelId as string,
            userId: request.userId,
            orgId,
            title: body.topic ? `Standalone brainstorm — ${body.topic}` : 'Standalone brainstorm',
            stage: 'brainstorm',
          });

      // Manual provider short-circuits the LLM call: build the prompt
      // synchronously, emit the full payload to Axiom, persist the session in
      // awaiting_manual state, and return early. The user pastes the output
      // produced externally via POST /sessions/:id/manual-output.
      if (body.provider === 'manual') {
        const systemPrompt = (await loadAgentPrompt('brainstorm')) ?? '';
        const channelContext = body.channelId
          ? await (async () => {
              const { data } = await sb
                .from('channels')
                .select('name, niche, language, tone, presentation_style')
                .eq('id', body.channelId as string)
                .maybeSingle();
              return data;
            })()
          : null;
        const userMessage = buildBrainstormMessage({
          topic: body.topic,
          ideasRequested: body.ideasRequested,
          fineTuning: body.fineTuning,
          referenceUrl: body.referenceUrl,
          channel: channelContext as BrainstormInput['channel'],
        });

        const { data: manualSession, error: manualInsertErr } = await (
          sb.from('brainstorm_sessions') as unknown as {
            insert: (row: Record<string, unknown>) => {
              select: () => { single: () => Promise<{ data: { id: string } | null; error: unknown }> };
            };
          }
        )
          .insert({
            org_id: orgId,
            user_id: request.userId,
            channel_id: body.channelId ?? null,
            project_id: effectiveProjectId,
            input_mode: body.inputMode,
            input_json: inputJson,
            model_tier: body.modelTier,
          })
          .select()
          .single();
        if (manualInsertErr || !manualSession) {
          throw manualInsertErr ?? new ApiError(500, 'Failed to create session', 'DB_ERROR');
        }

        // BRI-159: Ensure a stage_run exists for the ephemeral/real project and
        // mark it awaiting_user (manual_paste) so the orchestrator tracks this
        // session's state. Best-effort — session create already succeeded.
        await ensureStageRunId(sb, effectiveProjectId, 'brainstorm')
          .then((runId) => runId
            ? markAwaitingUser(sb, runId, {
                projectId: effectiveProjectId,
                stage: 'brainstorm',
                awaitingReason: 'manual_paste',
              }).catch(() => { /* best-effort */ })
            : undefined)
          .catch(() => { /* best-effort */ });

        // Combine system + user message so the operator can copy ONE prompt
        // from Axiom and paste it into ChatGPT/Claude without reassembling.
        const combinedPrompt = systemPrompt
          ? `${systemPrompt}\n\n${userMessage}`
          : userMessage;

        logAiUsage({
          userId: request.userId,
          orgId,
          action: 'manual.awaiting',
          provider: 'manual',
          model: 'manual',
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          durationMs: 0,
          status: 'awaiting_manual',
          metadata: {
            sessionId: manualSession.id,
            stage: 'brainstorm',
            channelId: body.channelId ?? null,
            prompt: combinedPrompt,
            input: inputJson,
          },
        });

        return reply.status(202).send({
          data: { sessionId: manualSession.id, status: 'awaiting_manual' },
          error: null,
        });
      }

      const { data: session, error: insertErr } = await (
        sb.from('brainstorm_sessions') as unknown as {
          insert: (row: Record<string, unknown>) => {
            select: () => { single: () => Promise<{ data: { id: string } | null; error: unknown }> };
          };
        }
      )
        .insert({
          org_id: orgId,
          user_id: request.userId,
          channel_id: body.channelId ?? null,
          project_id: effectiveProjectId,
          input_mode: body.inputMode,
          input_json: inputJson,
          model_tier: body.modelTier,
        })
        .select()
        .single();

      if (insertErr || !session) throw insertErr ?? new ApiError(500, 'Failed to create session', 'DB_ERROR');

      // Engine-driven (step-by-step) brainstorm has no autopilot dispatcher to
      // pre-create the brainstorm Stage Run, so create/reuse one here and hand
      // its id to the job. Without it the completed brainstorm leaves no
      // stage_run → deriveStageResults never surfaces stageResults.brainstorm,
      // the work vanishes on navigation, and the stage never reads as done
      // downstream (BRI-151). Best-effort: Stage Run bookkeeping must not block
      // generation — the job's resolveEffectiveStageRunId is the backstop.
      // BRI-159: effectiveProjectId always has a project (real or ephemeral).
      const brainstormStageRunId = await ensureStageRunId(sb, effectiveProjectId, 'brainstorm').catch(() => undefined);

      // Seed a "queued" event so the SSE stream has something to show immediately.
      await emitJobEvent(session.id, 'brainstorm', 'queued', 'Iniciando…');

      // Fire-and-forget: Inngest runs the job in the background.
      await inngest.send({
        name: 'brainstorm/generate',
        data: {
          sessionId: session.id,
          orgId,
          userId: request.userId,
          channelId: body.channelId ?? null,
          inputMode: body.inputMode,
          inputJson,
          modelTier: body.modelTier,
          provider: body.provider,
          model: body.model,
          targetCount: body.ideasRequested,
          stageRunId: brainstormStageRunId,
        },
      });

      return reply.status(202).send({
        data: { sessionId: session.id, status: 'queued' },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /sessions/:id/events — SSE stream of progress events for a job.
   * Polls job_events every 1s and pushes new rows to the client.
   * Closes when a `completed` or `failed` event is emitted.
   */
  fastify.get('/sessions/:id/events', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const sb = createServiceClient();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sinceParam = (request.query as { since?: string })?.since;
    let lastCreatedAt = sinceParam ?? '1970-01-01T00:00:00Z';
    let closed = false;
    request.raw.on('close', () => {
      closed = true;
    });

    const poll = async (): Promise<void> => {
      while (!closed) {
        const { data: events } = await (sb
          .from('job_events')
          .select('*')
          .eq('session_id', id)
          .gt('created_at', lastCreatedAt)
          .order('created_at', { ascending: true })) as unknown as {
          data: Array<{ id: string; stage: string; message: string; metadata: unknown; created_at: string }> | null;
        };

        if (events && events.length > 0) {
          for (const ev of events) {
            reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
            lastCreatedAt = ev.created_at;
            if (ev.stage === 'completed' || ev.stage === 'failed') {
              reply.raw.end();
              return;
            }
          }
        } else {
          // Heartbeat so proxies don't time out the connection.
          reply.raw.write(': ping\n\n');
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    };

    // Kick off polling; do not await in handler scope (stream continues until done).
    void poll().catch((err) => {
      fastify.log.error({ err }, 'SSE poll failed');
      reply.raw.end();
    });

    // Tell Fastify we've handled the response manually.
    return reply;
  });

  /**
   * GET /sessions/:id — Retrieve a session and its ideas.
   */
  fastify.get('/sessions/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: session, error } = await sb
        .from('brainstorm_sessions')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!session) throw new ApiError(404, 'Session not found', 'NOT_FOUND');

      // Prefer the raw `brainstorm_drafts` rows (every generated idea) over
      // `idea_archives` (only ideas the user has promoted). Older sessions
      // that pre-date the drafts pipeline fall back to idea_archives.
      const { data: drafts } = await sb
        .from('brainstorm_drafts')
        .select('*')
        .eq('session_id', id)
        .order('position', { ascending: true });

      let ideas: Array<Record<string, unknown>> = [];
      let pickedDraftId: string | null = null;
      if (drafts && drafts.length > 0) {
        ideas = drafts as Array<Record<string, unknown>>;

        // Resolve which brainstorm_draft was picked. Two signals:
        //   1) Project's brainstorm Stage Run payload_ref → brainstorm_draft.id
        //   2) Title match against idea_archives created from this session
        // The Stage Run signal is the new pipeline source-of-truth; we keep
        // the title-match fallback for projects that pre-date Stage Runs.
        const projectId = (session as Record<string, unknown>).project_id as
          | string
          | null
          | undefined;
        if (projectId) {
          const { data: srRow } = await sb
            .from('stage_runs')
            .select('payload_ref')
            .eq('project_id', projectId)
            .eq('stage', 'brainstorm')
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          const ref = srRow?.payload_ref as { kind?: string; id?: string } | null | undefined;
          if (ref?.kind === 'brainstorm_draft' && ref.id) pickedDraftId = ref.id;
        }
        if (!pickedDraftId) {
          const { data: archived } = await sb
            .from('idea_archives')
            .select('title')
            .eq('brainstorm_session_id', id);
          const archivedTitles = new Set(
            ((archived ?? []) as Array<Record<string, unknown>>).map((a) => a.title as string),
          );
          const winner = (drafts as Array<Record<string, unknown>>).find((d) =>
            archivedTitles.has(d.title as string),
          );
          if (winner) pickedDraftId = winner.id as string;
        }
      } else {
        const { data: archived } = await sb
          .from('idea_archives')
          .select('*')
          .eq('brainstorm_session_id', id)
          .order('created_at', { ascending: true });
        ideas = (archived ?? []) as Array<Record<string, unknown>>;
      }

      // BRI-157: Inject computed status from stage_run into the session object
      // so the response body shape is unchanged but the value is authoritative.
      const sessionObj = session as Record<string, unknown>;
      const getIdProjectId = sessionObj.project_id as string | null | undefined;
      const computedStatus = getIdProjectId
        ? await sessionStatusFromStageRun(sb, getIdProjectId, 'brainstorm')
        : ((sessionObj.status as string | undefined) ?? 'pending');
      const sessionWithStatus = { ...sessionObj, status: computedStatus };

      return reply.send({ data: { session: sessionWithStatus, ideas, pickedDraftId }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /sessions/:id/regenerate — Re-run brainstorm with same inputs.
   * Creates a new session linked to the same project.
   */
  fastify.post('/sessions/:id/regenerate', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: original, error: fetchErr } = await sb
        .from('brainstorm_sessions')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!original) throw new ApiError(404, 'Session not found', 'NOT_FOUND');

      const orig = original as Record<string, unknown>;
      const orgId = await getOrgId(request.userId);
      // Reserve credits upfront; commit on success, release on error.
      const regenToken = await reserve(orgId, request.userId, STAGE_COSTS.brainstorm);

      const inputJson = orig.input_json as Record<string, unknown>;

      // Create new session with same inputs
      const { data: session, error: insertErr } = await (
        sb.from('brainstorm_sessions') as unknown as {
          insert: (row: Record<string, unknown>) => {
            select: () => { single: () => Promise<{ data: { id: string } | null; error: unknown }> };
          };
        }
      )
        .insert({
          org_id: orgId,
          user_id: request.userId,
          channel_id: orig.channel_id ?? null,
          project_id: orig.project_id ?? null,
          input_mode: orig.input_mode,
          input_json: inputJson,
          model_tier: orig.model_tier,
        })
        .select()
        .single();

      if (insertErr || !session) throw insertErr ?? new ApiError(500, 'Failed to create session', 'DB_ERROR');

      // Pipeline Orchestrator handoff for regenerate: ensure a Stage Run exists
      // and record its id for terminal transitions below.
      // Standalone sessions (no project) have no Stage Run — skip gracefully.
      const regenProjectId = orig.project_id as string | null | undefined;
      const regenRunId = regenProjectId
        ? await ensureStageRunId(sb, regenProjectId, 'brainstorm').catch(() => undefined)
        : undefined;

      try {
        const systemPrompt = (await loadAgentPrompt('brainstorm')) ?? undefined;

        // Load channel context from the original session
        const channelContext = orig.channel_id
          ? await (async () => {
              const { data } = await createServiceClient()
                .from('channels')
                .select('name, niche, language, tone, presentation_style')
                .eq('id', orig.channel_id as string)
                .maybeSingle();
              return data;
            })()
          : null;

        const userMessage = buildBrainstormMessage({
          topic: (inputJson.topic as string) ?? undefined,
          ideasRequested: (inputJson.ideasRequested as number) ?? undefined,
          fineTuning: inputJson.fineTuning as BrainstormInput['fineTuning'],
          referenceUrl: (inputJson.referenceUrl as string) ?? undefined,
          channel: channelContext as BrainstormInput['channel'],
        });

        const { result } = await generateWithFallback(
          'brainstorm',
          (orig.model_tier as string) ?? 'standard',
          { agentType: 'brainstorm', systemPrompt: systemPrompt ?? '', userMessage },
          {
            logContext: {
              userId: request.userId!,
              orgId,
              channelId: (orig.channel_id as string | null) ?? undefined,
              sessionId: session.id,
              sessionType: 'brainstorm',
            },
          },
        );

        const ideas = normalizeIdeas(result);

        // Extract recommendation from AI output
        let recommendation: { pick?: string; rationale?: string } | null = null;
        if (result && typeof result === 'object' && 'recommendation' in (result as Record<string, unknown>)) {
          recommendation = (result as Record<string, unknown>).recommendation as { pick?: string; rationale?: string } | null;
        }

        const { count } = await sb.from('idea_archives').select('*', { count: 'exact', head: true });
        const startNum = (count ?? 0) + 1;

        const ideaRows = ideas.map((idea: RawIdea, i: number) => ({
          idea_id: `BC-IDEA-${String(startNum + i).padStart(3, '0')}`,
          title: idea.title ?? `Untitled ${i + 1}`,
          core_tension: idea.core_tension ?? '',
          target_audience: idea.target_audience ?? '',
          verdict: idea.verdict === 'viable' || idea.verdict === 'weak' || idea.verdict === 'experimental' ? idea.verdict : 'experimental',
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
          source_type: 'brainstorm',
          channel_id: orig.channel_id ?? null,
          project_id: orig.project_id ?? null,
          brainstorm_session_id: session.id,
          user_id: request.userId,
          org_id: orgId,
        }));

        if (ideaRows.length > 0) {
          await (sb.from('idea_archives') as unknown as {
            upsert: (rows: Record<string, unknown>[], opts?: unknown) => Promise<{ error: unknown }>;
          }).upsert(ideaRows, { onConflict: 'idea_id', ignoreDuplicates: true });
        }

        // BRI-157: status write removed — derived from stage_runs.
        if (recommendation) {
          await (sb.from('brainstorm_sessions') as unknown as {
            update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
          }).update({ recommendation_json: recommendation }).eq('id', session.id);
        }

        await commit(regenToken, STAGE_COSTS.brainstorm, 'brainstorm', 'text', { regeneratedFrom: id });

        // Reconcile the Stage Run to completed (best-effort — session write already succeeded).
        if (regenRunId && regenProjectId) {
          await markCompleted(sb, regenRunId, {
            projectId: regenProjectId,
            stage: 'brainstorm',
          }).catch(() => { /* best-effort */ });
        }

        return reply.send({ data: { sessionId: session.id, ideas: ideaRows }, error: null });
      } catch (err) {
        await release(regenToken).catch(() => { /* best-effort */ });
        // BRI-157: status write removed — derived from stage_runs. Keep error_message.
        await (sb.from('brainstorm_sessions') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        }).update({ error_message: (err as Error)?.message?.slice(0, 500) }).eq('id', session.id);
        // Reconcile the Stage Run to failed (best-effort).
        if (regenRunId && regenProjectId) {
          await markFailed(sb, regenRunId, {
            projectId: regenProjectId,
            stage: 'brainstorm',
            errorMessage: (err as Error)?.message ?? 'Brainstorm regeneration failed',
          }).catch(() => { /* best-effort */ });
        }
        throw err;
      }
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /sessions/:id/drafts — F2-037. List staged ideas for a session
   * (not yet persisted to idea_archives).
   */
  fastify.get('/sessions/:id/drafts', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const [draftsRes, sessionRes] = await Promise.all([
        sb.from('brainstorm_drafts').select('*').eq('session_id', id).order('position', { ascending: true }),
        sb.from('brainstorm_sessions').select('recommendation_json').eq('id', id).maybeSingle(),
      ]);
      if (draftsRes.error) throw draftsRes.error;
      if (sessionRes.error) throw sessionRes.error;
      return reply.send({
        data: {
          drafts: draftsRes.data ?? [],
          recommendation: sessionRes.data?.recommendation_json ?? null,
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /sessions/:id/drafts/save — F2-037. Move selected drafts into
   * idea_archives (the permanent library). Body: { draftIds: string[] }.
   * Removes the selected drafts from the staging table. Unselected ones
   * stay until the 24h expiry.
   */
  fastify.post('/sessions/:id/drafts/save', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const { id: sessionId } = request.params as { id: string };
      const body = z.object({ draftIds: z.array(z.string().uuid()).min(1) }).parse(request.body);
      const sb = createServiceClient();

      // Pull the selected drafts.
      const { data: drafts, error: draftsErr } = await sb
        .from('brainstorm_drafts')
        .select('*')
        .eq('session_id', sessionId)
        .in('id', body.draftIds);
      if (draftsErr) throw draftsErr;
      if (!drafts || drafts.length === 0) {
        throw new ApiError(404, 'No matching drafts', 'NOT_FOUND');
      }

      // Generate sequential idea_ids (BC-IDEA-NNN).
      const { count } = await sb.from('idea_archives').select('*', { count: 'exact', head: true });
      const startNum = (count ?? 0) + 1;

      const rows = drafts.map((d: Record<string, unknown>, i: number) => ({
        idea_id: `BC-IDEA-${String(startNum + i).padStart(3, '0')}`,
        title: d.title,
        core_tension: d.core_tension ?? '',
        target_audience: d.target_audience ?? '',
        verdict: d.verdict ?? 'experimental',
        discovery_data: d.discovery_data ?? '',
        source_type: 'brainstorm',
        channel_id: d.channel_id,
        brainstorm_session_id: d.session_id,
        user_id: d.user_id,
        org_id: d.org_id,
      }));

      const { error: insErr } = await (sb.from('idea_archives') as unknown as {
        upsert: (rows: Record<string, unknown>[], opts?: unknown) => Promise<{ error: unknown }>;
      }).upsert(rows, { onConflict: 'idea_id', ignoreDuplicates: true });
      if (insErr) throw insErr;

      // Delete the drafts that were saved.
      await sb.from('brainstorm_drafts').delete().in('id', body.draftIds);

      return reply.send({ data: { saved: rows.length }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * DELETE /sessions/:id/drafts — F2-037. Discard ALL staged drafts for a
   * session without saving.
   */
  fastify.delete('/sessions/:id/drafts', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const { id: sessionId } = request.params as { id: string };
      const sb = createServiceClient();
      const { error } = await sb.from('brainstorm_drafts').delete().eq('session_id', sessionId);
      if (error) throw error;
      return reply.send({ data: { discarded: true }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
