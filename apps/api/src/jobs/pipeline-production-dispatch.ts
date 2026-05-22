/**
 * pipeline-production-dispatch (T2.6) — bridges `pipeline/stage.requested`
 * (stage='production') to the legacy `production/produce` worker.
 *
 * Track-scoped: reads the Stage Run's `track_id`, resolves the Track's
 * medium (wins over input.type), finds the prior canonical Stage Run's
 * content_draft (project-scoped), reuses it when `type` matches the Track
 * medium, else forks a new content_draft copying canonical_core_json. The
 * produce worker writes the Stage Run terminal status.
 */
import { inngest } from './client.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { markFailed, markRunning } from '../lib/pipeline/stage-run-writer.js';
import { deriveDraft } from '../lib/content-drafts/derive.js';
import { ApiError } from '../lib/api/errors.js';

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

type Medium = 'blog' | 'video' | 'shorts' | 'podcast';

function isMedium(v: unknown): v is Medium {
  return v === 'blog' || v === 'video' || v === 'shorts' || v === 'podcast';
}

export const pipelineProductionDispatch = inngest.createFunction(
  {
    id: 'pipeline-production-dispatch',
    retries: 0,
    triggers: [{ event: 'pipeline/stage.requested', if: "event.data.stage == 'production'" }],
  },
  async ({ event }: { event: StageRequestedEvent }) => {
    if (event.data.stage !== 'production') return;

    const sb: Sb = createServiceClient();
    const { stageRunId, projectId } = event.data;
    const ctx = { projectId, stage: 'production' as const };

    const { data: stageRun } = await sb
      .from('stage_runs')
      .select('id, project_id, stage, status, track_id, publish_target_id, input_json')
      .eq('id', stageRunId)
      .maybeSingle();
    if (!stageRun) return;
    if (stageRun.status !== 'queued') return;

    const trackId = stageRun.track_id as string | null | undefined;
    if (!trackId) {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: 'Production Stage Run missing track_id',
      });
      return;
    }

    const { data: track } = await sb
      .from('tracks')
      .select('id, project_id, medium, status')
      .eq('id', trackId)
      .maybeSingle();
    if (!track) {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: `Track ${trackId} not found`,
      });
      return;
    }
    const medium = track.medium as string | undefined;
    if (!isMedium(medium)) {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: `Track ${trackId} has invalid medium: ${medium}`,
      });
      return;
    }

    const input = (stageRun.input_json ?? {}) as Record<string, unknown>;

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

    // Find the canonical Stage Run's content_draft (project-scoped).
    const { data: priorCanonical } = await sb
      .from('stage_runs')
      .select('id, stage, status, payload_ref')
      .eq('project_id', projectId)
      .eq('stage', 'canonical')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const canonicalRef = priorCanonical?.payload_ref as
      | { kind?: string; id?: string }
      | null
      | undefined;
    const canonicalDraftId =
      canonicalRef?.kind === 'content_draft' && canonicalRef.id ? canonicalRef.id : null;
    if (!canonicalDraftId) {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: 'No canonical content_draft found for project',
      });
      return;
    }

    const modelTier = (input.modelTier as string | undefined) ?? 'standard';
    const provider = input.provider as string | undefined;
    const model = input.model as string | undefined;
    const productionParams = (input.productionParams as Record<string, unknown> | undefined) ?? null;

    // Issue #210 — auto-pilot uses the same deriveDraft helper that the
    // step-by-step ProductionEngine calls via POST /api/content-drafts/:id/derive.
    // Always derives a per-track row (track_id set) with canonical_core_json
    // copied + empty draft_json. Idempotent at DB level via the partial unique
    // index on (project_id, track_id). The "reuse canonical when type matches"
    // optimization is gone: the canonical row stays untouched (track_id=null),
    // every track gets its own derived row.
    if (!userId) {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: 'Could not resolve user_id for derive',
      });
      return;
    }
    let draftId: string;
    try {
      const result = await deriveDraft(sb, {
        sourceId: canonicalDraftId,
        trackId,
        medium,
        userId,
      });
      draftId = result.id;
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.code}: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Unknown error';
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: `Failed to derive per-track draft: ${msg}`,
      });
      return;
    }

    await markRunning(sb, stageRunId, {
      ...ctx,
      payloadRef: { kind: 'content_draft', id: draftId },
    });

    await inngest.send({
      name: 'production/produce',
      data: {
        draftId,
        orgId,
        userId,
        type: medium,
        modelTier,
        provider,
        model,
        productionParams,
        stageRunId,
      },
    });
  },
);
