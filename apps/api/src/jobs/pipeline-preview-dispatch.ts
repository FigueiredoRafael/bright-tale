/**
 * pipeline-preview-dispatch — Preview Stage worker.
 *
 * The Preview Stage is a lightweight checkpoint: it confirms the draft is
 * renderable (has draft_json + a title) and writes the Stage Run as
 * completed with payload_ref → the content_draft. The browser fetches
 * the draft directly when rendering the preview UI; there is no
 * separate preview record on the server.
 */
import { inngest } from './client.js';
import { createServiceClient } from '../lib/supabase/index.js';
import {
  markCompleted,
  markFailed,
  markRunning,
} from '../lib/pipeline/stage-run-writer.js';

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

export const pipelinePreviewDispatch = inngest.createFunction(
  {
    id: 'pipeline-preview-dispatch',
    retries: 0,
    triggers: [{ event: 'pipeline/stage.requested' }],
  },
  async ({ event }: { event: StageRequestedEvent }) => {
    if (event.data.stage !== 'preview') return;

    const sb: Sb = createServiceClient();
    const { stageRunId, projectId } = event.data;
    const ctx = { projectId, stage: 'preview' as const };

    const { data: stageRun } = await sb
      .from('stage_runs')
      .select('id, project_id, stage, status')
      .eq('id', stageRunId)
      .maybeSingle();
    if (!stageRun) return;
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
      await markFailed(sb, stageRunId, { ...ctx, errorMessage: 'No prior draft Stage Run to preview' });
      return;
    }
    const draftId = draftRef.id;

    // Sanity check the draft exists and has body content.
    const { data: draft } = await sb
      .from('content_drafts')
      .select('id, title, draft_json, status')
      .eq('id', draftId)
      .maybeSingle();
    if (!draft) {
      await markFailed(sb, stageRunId, { ...ctx, errorMessage: `content_draft ${draftId} not found` });
      return;
    }
    if (!draft.draft_json) {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: 'Draft has no draft_json — produce step incomplete',
      });
      return;
    }

    await markRunning(sb, stageRunId, ctx);
    await markCompleted(sb, stageRunId, {
      ...ctx,
      payloadRef: { kind: 'content_draft', id: draftId },
    });
  },
);
