/**
 * pipeline-review-dispatch — handles `pipeline/stage.requested` for the
 * Review Stage. Unlike brainstorm/research/draft, Review has no separate
 * session table — feedback persists directly on `content_drafts`. The
 * dispatcher therefore acts as both dispatcher AND worker: it loads the
 * prior draft, calls agent-4 once, writes the verdict back to the draft,
 * and transitions the Stage Run to terminal.
 *
 * Skip-when-maxIterations-0 is enforced by `advanceAfter` in the
 * orchestrator (Slice 1) — this function only runs when the orchestrator
 * actually queues a review Stage Run.
 */
import { inngest } from './client.js';
import { generateWithFallback } from '../lib/ai/router.js';
import { loadAgentConfig, resolveProviderOverride } from '../lib/ai/promptLoader.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { buildReviewMessage } from '../lib/ai/prompts/review.js';

interface StageRequestedEvent {
  name: 'pipeline/stage.requested';
  data: {
    stageRunId: string;
    stage: string;
    projectId: string;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

const AUTO_APPROVE_DEFAULT = 90;
const HARD_FAIL_DEFAULT = 40;
const MAX_ITERATIONS_DEFAULT = 5;

export const pipelineReviewDispatch = inngest.createFunction(
  {
    id: 'pipeline-review-dispatch',
    retries: 0,
    triggers: [{ event: 'pipeline/stage.requested' }],
  },
  async ({ event }: { event: StageRequestedEvent }) => {
    if (event.data.stage !== 'review') return;

    const sb: Sb = createServiceClient();
    const { stageRunId, projectId } = event.data;

    const { data: stageRun } = await sb
      .from('stage_runs')
      .select('id, project_id, stage, status, input_json')
      .eq('id', stageRunId)
      .maybeSingle();
    if (!stageRun) return;
    // Idempotency: only `queued` runs are eligible. Inngest dev mode and
    // network blips can re-deliver `pipeline/stage.requested` for the same
    // Stage Run — without this guard each delivery re-runs the LLM and
    // re-charges credits.
    if (stageRun.status !== 'queued') return;

    const input = (stageRun.input_json ?? {}) as Record<string, unknown>;
    const provider = input.provider as string | undefined;
    const model = input.model as string | undefined;

    // Load review config from the project's autopilot config so the dispatcher
    // can honour the user's chosen thresholds + iteration cap.
    const { data: projectRow } = await sb
      .from('projects')
      .select('autopilot_config_json')
      .eq('id', projectId)
      .maybeSingle();
    const reviewConfig =
      ((projectRow?.autopilot_config_json as Record<string, Record<string, unknown>> | null | undefined)
        ?.review as Record<string, unknown> | undefined) ?? {};
    const autoApproveThreshold =
      (input.autoApproveThreshold as number | undefined) ??
      (reviewConfig.autoApproveThreshold as number | undefined) ??
      AUTO_APPROVE_DEFAULT;
    const hardFailThreshold =
      (input.hardFailThreshold as number | undefined) ??
      (reviewConfig.hardFailThreshold as number | undefined) ??
      HARD_FAIL_DEFAULT;
    const maxIterations =
      (input.maxIterations as number | undefined) ??
      (reviewConfig.maxIterations as number | undefined) ??
      MAX_ITERATIONS_DEFAULT;

    // Atomic compare-and-swap: only this invocation that flips queued→running
    // proceeds. Concurrent re-deliveries see the row already running and bail.
    const startedAt = new Date().toISOString();
    const { data: claimed } = await sb
      .from('stage_runs')
      .update({ status: 'running', started_at: startedAt, updated_at: startedAt })
      .eq('id', stageRunId)
      .eq('status', 'queued')
      .select('id');
    if (!claimed || (claimed as unknown[]).length === 0) return;

    // Resolve the draft to review from the prior draft Stage Run.
    const { data: priorDraft } = await sb
      .from('stage_runs')
      .select('id, stage, status, payload_ref')
      .eq('project_id', projectId)
      .eq('stage', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const draftRef = priorDraft?.payload_ref as { kind?: string; id?: string } | null | undefined;
    if (draftRef?.kind !== 'content_draft' || !draftRef.id) {
      await markFailed(sb, stageRunId, projectId, 'No prior draft Stage Run to review');
      return;
    }
    const draftId = draftRef.id;

    const { data: draft } = await sb
      .from('content_drafts')
      .select('*')
      .eq('id', draftId)
      .maybeSingle();
    if (!draft) {
      await markFailed(sb, stageRunId, projectId, `content_draft ${draftId} not found`);
      return;
    }

    try {
      const agentConfig = await loadAgentConfig('review');
      const { provider: resolvedProvider, model: resolvedModel } = resolveProviderOverride(
        provider,
        model,
        agentConfig,
      );

      const userMessage = buildReviewMessage({
        type: draft.type as string,
        title: draft.title as string,
        draftJson: draft.draft_json,
        canonicalCore: draft.canonical_core_json,
        idea: null,
        research: null,
        contentTypesRequested: [draft.type as string],
        channel: undefined,
      });

      const response = await generateWithFallback(
        'review',
        (draft.model_tier as string) ?? 'standard',
        {
          agentType: 'review',
          systemPrompt: agentConfig.instructions ?? '',
          userMessage,
        },
        {
          provider: resolvedProvider,
          model: resolvedModel,
          logContext: {
            userId: (draft.user_id as string) ?? '',
            orgId: (draft.org_id as string) ?? '',
            channelId: (draft.channel_id as string) ?? null,
            sessionId: draftId,
            sessionType: 'review',
          },
        },
      );

      const result = response.result as Record<string, unknown>;
      const overallVerdict = (result.overall_verdict as string) ?? 'revision_required';
      const draftType = draft.type as string;
      const formatReview = result[`${draftType}_review`] as Record<string, unknown> | undefined;
      const reviewScore = (formatReview?.score as number | undefined) ?? null;

      const iterationCount = ((draft.iteration_count as number) ?? 0) + 1;

      // Verdict + Stage Run terminal decision. Four lanes:
      //   approved        → draft.approved + Stage Run completed (advance → assets)
      //   hard-rejected   → draft.failed   + Stage Run failed
      //   revise + budget → draft.in_review + Stage Run completed (advance loops back to draft)
      //   revise + out    → draft.in_review + Stage Run awaiting_user(manual_review)
      let newVerdict: 'approved' | 'revision_required' | 'rejected';
      let newDraftStatus: 'approved' | 'in_review' | 'failed';
      let approvedAt: string | null = null;
      type RunOutcome =
        | { status: 'completed' }
        | { status: 'failed'; errorMessage: string }
        | { status: 'awaiting_user'; awaitingReason: 'manual_review' };
      let runOutcome: RunOutcome;

      const hardReject =
        overallVerdict === 'rejected' ||
        (reviewScore !== null && reviewScore < hardFailThreshold);
      const approved =
        overallVerdict === 'approved' ||
        (reviewScore !== null && reviewScore >= autoApproveThreshold);

      if (approved) {
        newVerdict = 'approved';
        newDraftStatus = 'approved';
        approvedAt = new Date().toISOString();
        runOutcome = { status: 'completed' };
      } else if (hardReject) {
        newVerdict = 'rejected';
        newDraftStatus = 'failed';
        runOutcome = {
          status: 'failed',
          errorMessage: `Review rejected${reviewScore != null ? ` (score ${reviewScore} < ${hardFailThreshold})` : ''}`,
        };
      } else if (iterationCount >= maxIterations) {
        newVerdict = 'revision_required';
        newDraftStatus = 'in_review';
        runOutcome = { status: 'awaiting_user', awaitingReason: 'manual_review' };
      } else {
        newVerdict = 'revision_required';
        newDraftStatus = 'in_review';
        runOutcome = { status: 'completed' };
      }

      const updateData: Record<string, unknown> = {
        review_feedback_json: result,
        review_score: reviewScore,
        review_verdict: newVerdict,
        iteration_count: iterationCount,
        status: newDraftStatus,
      };
      if (approvedAt) updateData.approved_at = approvedAt;

      await sb.from('content_drafts').update(updateData).eq('id', draftId);

      const now = new Date().toISOString();
      const stageRunPatch: Record<string, unknown> = {
        payload_ref: { kind: 'content_draft', id: draftId },
        updated_at: now,
      };
      if (runOutcome.status === 'completed') {
        stageRunPatch.status = 'completed';
        stageRunPatch.finished_at = now;
      } else if (runOutcome.status === 'failed') {
        stageRunPatch.status = 'failed';
        stageRunPatch.finished_at = now;
        stageRunPatch.error_message = runOutcome.errorMessage.slice(0, 500);
      } else {
        stageRunPatch.status = 'awaiting_user';
        stageRunPatch.awaiting_reason = runOutcome.awaitingReason;
      }
      await sb.from('stage_runs').update(stageRunPatch).eq('id', stageRunId);

      // Only completed/failed feed advanceAfter — awaiting_user keeps the
      // Stage Run parked for the human and must not auto-advance.
      if (runOutcome.status !== 'awaiting_user') {
        await inngest.send({
          name: 'pipeline/stage.run.finished',
          data: { stageRunId, projectId },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      await markFailed(sb, stageRunId, projectId, message);
      throw err;
    }
  },
);

async function markFailed(sb: Sb, stageRunId: string, projectId: string, message: string): Promise<void> {
  const now = new Date().toISOString();
  await sb
    .from('stage_runs')
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
