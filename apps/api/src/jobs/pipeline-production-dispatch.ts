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

    const { data: canonicalDraft } = await sb
      .from('content_drafts')
      .select(
        'id, project_id, type, canonical_core_json, research_session_id, idea_id, persona_id, channel_id, org_id, user_id',
      )
      .eq('id', canonicalDraftId)
      .maybeSingle();
    if (!canonicalDraft) {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: `Canonical content_draft ${canonicalDraftId} not found`,
      });
      return;
    }

    const modelTier = (input.modelTier as string | undefined) ?? 'standard';
    const provider = input.provider as string | undefined;
    const model = input.model as string | undefined;
    const productionParams = (input.productionParams as Record<string, unknown> | undefined) ?? null;

    // Reuse the canonical content_draft when its type already matches the
    // Track medium (single-Track / first-Track case). Fork otherwise: a new
    // row with the canonical_core_json copied so the produce agent has the
    // shared foundation but writes a medium-specific draft_json.
    let draftId: string;
    if (canonicalDraft.type === medium) {
      draftId = canonicalDraft.id as string;
    } else {
      const { data: forked, error: insertError } = await sb
        .from('content_drafts')
        .insert({
          org_id: canonicalDraft.org_id ?? orgId,
          user_id: canonicalDraft.user_id ?? userId,
          channel_id: canonicalDraft.channel_id ?? project.channel_id ?? null,
          project_id: projectId,
          research_session_id: canonicalDraft.research_session_id,
          idea_id: canonicalDraft.idea_id,
          persona_id: canonicalDraft.persona_id,
          type: medium,
          status: 'draft',
          canonical_core_json: canonicalDraft.canonical_core_json,
          production_params: productionParams,
        })
        .select()
        .single();
      if (insertError || !forked?.id) {
        await markFailed(sb, stageRunId, {
          ...ctx,
          errorMessage: `Failed to fork content_draft: ${(insertError as { message?: string } | undefined)?.message ?? 'unknown'}`,
        });
        return;
      }
      draftId = forked.id as string;
    }

    await markRunning(sb, stageRunId, {
      ...ctx,
      payloadRef: { kind: 'content_draft', id: draftId },
    });

    await inngest.send({
      name: 'production/produce',
      data: {
        draftId,
        orgId: canonicalDraft.org_id ?? orgId,
        userId: canonicalDraft.user_id ?? userId,
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
