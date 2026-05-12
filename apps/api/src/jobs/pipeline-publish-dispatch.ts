/**
 * pipeline-publish-dispatch — Publish Stage worker.
 *
 * The orchestrator's advanceAfter inserts Publish Stage Runs in
 * `awaiting_user(manual_advance)` per ADR-0004 (canonical decision in
 * CLAUDE.md). The Continue endpoint flips that to `queued` and emits
 * `pipeline/stage.requested`, which this dispatcher picks up.
 *
 * The actual WP API call is performed by the existing
 * `POST /wordpress/publish-draft` route. We invoke it via internal fetch
 * (INTERNAL_API_KEY auth) to avoid duplicating ~500 lines of WP
 * integration. The route writes `published_url` + `published_at` onto
 * `content_drafts`; we mirror the URL into the Stage Run's
 * `payload_ref` for the UI.
 */
import { inngest } from './client.js';
import { createServiceClient } from '../lib/supabase/index.js';

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

export const pipelinePublishDispatch = inngest.createFunction(
  {
    id: 'pipeline-publish-dispatch',
    retries: 0,
    triggers: [{ event: 'pipeline/stage.requested' }],
  },
  async ({ event }: { event: StageRequestedEvent }) => {
    if (event.data.stage !== 'publish') return;

    const sb: Sb = createServiceClient();
    const { stageRunId, projectId } = event.data;

    const { data: stageRun } = await sb
      .from('stage_runs')
      .select('id, project_id, stage, status, input_json')
      .eq('id', stageRunId)
      .maybeSingle();
    if (!stageRun) return;
    // Only run when the orchestrator has transitioned us to `queued` via
    // the Continue endpoint. awaiting_user stays parked until the user clicks;
    // terminal states are inherently excluded too (idempotency on re-delivery).
    if (stageRun.status !== 'queued') return;

    // Resolve the draft from the prior draft Stage Run.
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
      await markFailed(sb, stageRunId, projectId, 'No prior draft Stage Run to publish');
      return;
    }
    const draftId = draftRef.id;

    const now = new Date().toISOString();
    await sb
      .from('stage_runs')
      .update({ status: 'running', started_at: now, updated_at: now })
      .eq('id', stageRunId);

    try {
      const apiBase = process.env.API_URL ?? 'http://localhost:3001';
      const internalKey = process.env.INTERNAL_API_KEY;
      if (!internalKey) throw new Error('INTERNAL_API_KEY not set — cannot invoke WP publish');

      const { data: draft } = await sb
        .from('content_drafts')
        .select('user_id')
        .eq('id', draftId)
        .maybeSingle();
      if (!draft?.user_id) throw new Error(`content_draft ${draftId} has no user_id`);

      const input = (stageRun.input_json ?? {}) as Record<string, unknown>;
      const response = await fetch(`${apiBase}/wordpress/publish-draft`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-key': internalKey,
          'x-user-id': draft.user_id as string,
        },
        body: JSON.stringify({
          draftId,
          status: (input.status as string) ?? 'publish',
          scheduledAt: input.scheduledAt,
          destinationId: input.destinationId,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.error) {
        const message =
          (body?.error?.message as string | undefined) ?? `WP publish failed (${response.status})`;
        throw new Error(message);
      }

      const publishedUrl = (body?.data?.published_url as string | undefined) ?? null;
      const wpPostId = (body?.data?.wp_post_id as number | string | undefined) ?? null;

      const finishedAt = new Date().toISOString();
      await sb
        .from('stage_runs')
        .update({
          status: 'completed',
          payload_ref: {
            kind: 'publish_record',
            id: String(wpPostId ?? draftId),
            published_url: publishedUrl,
          },
          finished_at: finishedAt,
          updated_at: finishedAt,
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
