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
    const autoApproveThreshold =
      (input.autoApproveThreshold as number | undefined) ?? AUTO_APPROVE_DEFAULT;
    const provider = input.provider as string | undefined;
    const model = input.model as string | undefined;

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

      let newVerdict: 'approved' | 'revision_required' | 'rejected';
      let newStatus: 'approved' | 'in_review' | 'failed';
      let approvedAt: string | null = null;

      if (
        overallVerdict === 'approved' ||
        (reviewScore !== null && reviewScore >= autoApproveThreshold)
      ) {
        newVerdict = 'approved';
        newStatus = 'approved';
        approvedAt = new Date().toISOString();
      } else if (overallVerdict === 'rejected') {
        newVerdict = 'rejected';
        newStatus = 'failed';
      } else {
        newVerdict = 'revision_required';
        newStatus = 'in_review';
      }

      const iterationCount = ((draft.iteration_count as number) ?? 0) + 1;
      const updateData: Record<string, unknown> = {
        review_feedback_json: result,
        review_score: reviewScore,
        review_verdict: newVerdict,
        iteration_count: iterationCount,
        status: newStatus,
      };
      if (approvedAt) updateData.approved_at = approvedAt;

      await sb.from('content_drafts').update(updateData).eq('id', draftId);

      const now = new Date().toISOString();
      await sb
        .from('stage_runs')
        .update({
          status: 'completed',
          payload_ref: { kind: 'content_draft', id: draftId },
          finished_at: now,
          updated_at: now,
        })
        .eq('id', stageRunId);

      await inngest.send({
        name: 'pipeline/stage.run.finished',
        data: { stageRunId, projectId },
      });
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
