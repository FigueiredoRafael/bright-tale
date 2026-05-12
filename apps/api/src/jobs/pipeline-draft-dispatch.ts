/**
 * pipeline-draft-dispatch — bridges `pipeline/stage.requested` (stage='draft')
 * to the legacy `production/generate` job.
 *
 * Creates a `content_drafts` row linked to the prior research session +
 * brainstorm idea, transitions the Stage Run to `running`, and emits
 * `production/generate` with `stageRunId` so the worker can write back
 * terminal status + payload_ref on completion.
 */
import { inngest } from './client.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { resolveIdeaArchiveFromBrainstorm } from '../lib/pipeline/idea-resolution.js';

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

export const pipelineDraftDispatch = inngest.createFunction(
  {
    id: 'pipeline-draft-dispatch',
    retries: 0,
    triggers: [{ event: 'pipeline/stage.requested' }],
  },
  async ({ event }: { event: StageRequestedEvent }) => {
    if (event.data.stage !== 'draft') return;

    const sb: Sb = createServiceClient();
    const { stageRunId, projectId } = event.data;

    const { data: stageRun } = await sb
      .from('stage_runs')
      .select('id, project_id, stage, status, input_json')
      .eq('id', stageRunId)
      .maybeSingle();
    if (!stageRun) return;
    // Idempotency: only `queued` is eligible. Without this, Inngest event
    // re-delivery causes duplicate content_drafts inserts and re-charges.
    if (stageRun.status !== 'queued') return;

    const input = (stageRun.input_json ?? {}) as Record<string, unknown>;
    const type = (input.type as 'blog' | 'video' | 'shorts' | 'podcast' | undefined) ?? 'blog';

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

    // idea_id is FK to idea_archives.id, NOT brainstorm_drafts.id. Promote
    // via shared helper if the user didn't pass an explicit one.
    let ideaArchiveId = (input.ideaId as string | undefined) ?? null;
    if (!ideaArchiveId) {
      const resolved = await resolveIdeaArchiveFromBrainstorm(sb, projectId);
      ideaArchiveId = resolved.ideaArchiveId;
    }

    const personaId = (input.personaId as string | undefined) ?? null;
    const productionParams = (input.productionParams as Record<string, unknown> | undefined) ?? null;
    const modelTier = (input.modelTier as string | undefined) ?? 'standard';
    const provider = input.provider as string | undefined;
    const model = input.model as string | undefined;

    // Revision path: when the orchestrator triggers a draft Stage Run with
    // `review_feedback` in productionParams, we re-produce against the
    // existing content_draft instead of inserting a new one. Skips
    // canonical-core (already valid) and goes straight to production/produce
    // so the agent receives the feedback context.
    const reviewFeedback =
      productionParams && typeof productionParams === 'object'
        ? ((productionParams as Record<string, unknown>).review_feedback as
            | Record<string, unknown>
            | undefined)
        : undefined;
    if (reviewFeedback) {
      const { data: priorDraftRun } = await sb
        .from('stage_runs')
        .select('payload_ref')
        .eq('project_id', projectId)
        .eq('stage', 'draft')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const existingDraftRef = priorDraftRun?.payload_ref as
        | { kind?: string; id?: string }
        | null
        | undefined;
      if (existingDraftRef?.kind !== 'content_draft' || !existingDraftRef.id) {
        const now = new Date().toISOString();
        await sb
          .from('stage_runs')
          .update({
            status: 'failed',
            error_message: 'Revision requested but no prior content_draft to revise',
            finished_at: now,
            updated_at: now,
          })
          .eq('id', stageRunId);
        await inngest.send({
          name: 'pipeline/stage.run.finished',
          data: { stageRunId, projectId },
        });
        return;
      }

      const now = new Date().toISOString();
      await sb
        .from('stage_runs')
        .update({ status: 'running', started_at: now, updated_at: now })
        .eq('id', stageRunId);

      await inngest.send({
        name: 'production/produce',
        data: {
          draftId: existingDraftRef.id,
          orgId,
          userId,
          type,
          modelTier,
          provider,
          model,
          productionParams,
          stageRunId,
        },
      });
      return;
    }

    const { data: draft, error: insertError } = await sb
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
        production_params: productionParams,
      })
      .select()
      .single();
    if (insertError || !draft?.id) {
      const now = new Date().toISOString();
      await sb
        .from('stage_runs')
        .update({
          status: 'failed',
          error_message: `Failed to create content_drafts row: ${(insertError as { message?: string } | undefined)?.message ?? 'unknown'}`,
          finished_at: now,
          updated_at: now,
        })
        .eq('id', stageRunId);
      await inngest.send({
        name: 'pipeline/stage.run.finished',
        data: { stageRunId, projectId },
      });
      return;
    }

    const now = new Date().toISOString();
    await sb
      .from('stage_runs')
      .update({
        status: 'running',
        started_at: now,
        updated_at: now,
      })
      .eq('id', stageRunId);

    await inngest.send({
      name: 'production/generate',
      data: {
        draftId: draft.id,
        orgId,
        userId,
        type,
        modelTier,
        provider,
        model,
        productionParams,
        stageRunId,
      },
    });
  },
);
