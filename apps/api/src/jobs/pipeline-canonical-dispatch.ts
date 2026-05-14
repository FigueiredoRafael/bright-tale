/**
 * pipeline-canonical-dispatch (T2.6) — bridges `pipeline/stage.requested`
 * (stage='canonical') to the canonical-core phase of the production worker.
 *
 * Project-scoped (no track_id): the canonical core is the shared foundation
 * that every Track's `production` Stage Run consumes downstream. Unlike the
 * legacy draft dispatcher, this one tells the worker (via `phase: 'canonical'`)
 * to terminal-write the Stage Run after canonical-core and SKIP the chain
 * into produce — produce is owned by the per-Track production dispatcher.
 */
import { inngest } from './client.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { resolveIdeaArchiveFromBrainstorm } from '../lib/pipeline/idea-resolution.js';
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

export const pipelineCanonicalDispatch = inngest.createFunction(
  {
    id: 'pipeline-canonical-dispatch',
    retries: 0,
    triggers: [{ event: 'pipeline/stage.requested', if: "event.data.stage == 'canonical'" }],
  },
  async ({ event }: { event: StageRequestedEvent }) => {
    if (event.data.stage !== 'canonical') return;

    const sb: Sb = createServiceClient();
    const { stageRunId, projectId } = event.data;
    const ctx = { projectId, stage: 'canonical' as const };

    const { data: stageRun } = await sb
      .from('stage_runs')
      .select('id, project_id, stage, status, input_json')
      .eq('id', stageRunId)
      .maybeSingle();
    if (!stageRun) return;
    if (stageRun.status !== 'queued') return;

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

    let ideaArchiveId = (input.ideaId as string | undefined) ?? null;
    if (!ideaArchiveId) {
      const resolved = await resolveIdeaArchiveFromBrainstorm(sb, projectId);
      ideaArchiveId = resolved.ideaArchiveId;
    }

    // Canonical is project-scoped — content_draft.type must be set for the
    // NOT NULL check, but the canonical_core_json is medium-agnostic. We
    // pick the first active Track's medium so downstream production Stage
    // Runs that reuse this content_draft (single-Track case) avoid an
    // unnecessary copy. Defaults to 'blog' when no Tracks exist yet (the
    // legacy lazy-migrate path will create one).
    const { data: tracks } = await sb
      .from('tracks')
      .select('id, medium, status')
      .eq('project_id', projectId)
      .eq('status', 'active');
    const firstMedium = (tracks as Array<{ medium?: string }> | null)?.[0]?.medium;
    const type: Medium = isMedium(firstMedium) ? firstMedium : 'blog';

    const personaId = (input.personaId as string | undefined) ?? null;
    const modelTier = (input.modelTier as string | undefined) ?? 'standard';
    const provider = input.provider as string | undefined;
    const model = input.model as string | undefined;

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
      })
      .select()
      .single();
    if (insertError || !draft?.id) {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: `Failed to create content_drafts row: ${(insertError as { message?: string } | undefined)?.message ?? 'unknown'}`,
      });
      return;
    }

    await markRunning(sb, stageRunId, {
      ...ctx,
      payloadRef: { kind: 'content_draft', id: draft.id as string },
    });

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
        stageRunId,
        phase: 'canonical',
      },
    });
  },
);
