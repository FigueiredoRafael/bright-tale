/**
 * pipeline-preview-dispatch — Preview Stage worker.
 *
 * The Preview Stage is a lightweight, AI-free checkpoint: it confirms the
 * draft is renderable (has draft_json) and writes the Stage Run as completed
 * with payload_ref → the content_draft. The browser fetches the draft
 * directly when rendering the preview UI; there is no separate preview
 * record on the server.
 *
 * Native pattern (parity with pipeline-assets-dispatch / D66):
 *   - idempotency guard admits `queued` + `running` (Inngest replay), bails
 *     on terminal statuses,
 *   - the draft is resolved from the per-track PRODUCTION Stage Run's
 *     content_draft (track-scoped), with a fallback to the legacy
 *     project-scoped `draft` stage for pre-multi-track projects (BRI-24),
 *   - `load-draft` + `mark-running` are wrapped in `step.run` so they are
 *     memoized across replays (markRunning would otherwise re-stamp
 *     started_at).
 *
 * No `outcome_json` is written: preview makes no decision the orchestrator
 * reads (the fan-out planner advances preview → publish unconditionally), so
 * there is no preview outcome contract in stage-run-writer.
 *
 * No try/catch wraps `markCompleted`: preview performs no AI/external call,
 * so the only failure outcomes are validation failures (no prior draft /
 * empty draft), handled explicitly with markFailed. A raw DB exception fails
 * the Inngest function loudly rather than risking a completed→failed flip.
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


type Sb = any;

export const pipelinePreviewDispatch = inngest.createFunction(
  {
    id: 'pipeline-preview-dispatch',
    retries: 0,
    timeouts: { finish: '5m' },
    // See pipeline-brainstorm-dispatch for the rationale behind `if:`.
    triggers: [{ event: 'pipeline/stage.requested', if: "event.data.stage == 'preview'" }],
  },
  async ({ event, step }: { event: StageRequestedEvent; step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    if (event.data.stage !== 'preview') return;

    const sb: Sb = createServiceClient();
    const { stageRunId, projectId } = event.data;
    const ctx = { projectId, stage: 'preview' as const };

    const { data: stageRun } = await sb
      .from('stage_runs')
      .select('id, project_id, stage, status, track_id')
      .eq('id', stageRunId)
      .maybeSingle();
    if (!stageRun) return;
    // Idempotency: bail on terminal statuses. queued is normal entry; running
    // is valid on Inngest replays (step results are cached).
    if (stageRun.status !== 'queued' && stageRun.status !== 'running') return;

    const trackId = stageRun.track_id as string | null | undefined;

    // Resolve the draft to preview. After the D66 draft→canonical+production
    // split the body lives on the per-track PRODUCTION Stage Run's
    // content_draft (track-scoped), not the legacy project-scoped 'draft'
    // stage. Fall back to that legacy stage for pre-multi-track projects whose
    // runs predate the split (BRI-24).
    let draftRef: { kind?: string; id?: string } | null | undefined;
    if (trackId) {
      const { data: priorProduction } = await sb
        .from('stage_runs')
        .select('id, stage, status, payload_ref')
        .eq('project_id', projectId)
        .eq('stage', 'production')
        .eq('track_id', trackId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      draftRef = priorProduction?.payload_ref as { kind?: string; id?: string } | null | undefined;
    }
    if (draftRef?.kind !== 'content_draft' || !draftRef.id) {
      const { data: priorDraft } = await sb
        .from('stage_runs')
        .select('id, stage, status, payload_ref')
        .eq('project_id', projectId)
        .eq('stage', 'draft')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      draftRef = priorDraft?.payload_ref as { kind?: string; id?: string } | null | undefined;
    }
    if (draftRef?.kind !== 'content_draft' || !draftRef.id) {
      await markFailed(sb, stageRunId, { ...ctx, errorMessage: 'No prior draft Stage Run to anchor preview to' });
      return;
    }
    const draftId = draftRef.id;

    // Sanity check the draft exists and has body content. Wrapped in step.run
    // so the snapshot is memoized across Inngest replays.
    const draft = (await step.run('load-draft', async () => {
      const { data } = await sb
        .from('content_drafts')
        .select('id, title, draft_json, status')
        .eq('id', draftId)
        .maybeSingle();
      return data;
    })) as Record<string, unknown> | null;
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

    // Wrap in step.run so the queued→running transition is memoized: a bare
    // markRunning would re-stamp started_at on every Inngest replay.
    await step.run('mark-running', async () => {
      await markRunning(sb, stageRunId, { ...ctx, payloadRef: { kind: 'content_draft', id: draftId } });
    });

    await markCompleted(sb, stageRunId, {
      ...ctx,
      payloadRef: { kind: 'content_draft', id: draftId },
    });
  },
);
