/**
 * pipeline-research-dispatch — bridges the new `pipeline/stage.requested`
 * event to the legacy `research/generate` job for the Research Stage.
 *
 * In autopilot, the prior brainstorm Stage Run carries `payload_ref →
 * brainstorm_draft`; we resolve the winning idea from there. In manual mode
 * the caller can pass an explicit `ideaId` (and optionally `topic`) in the
 * Stage Run's `input_json` and we honour that.
 *
 * The dispatcher transitions the Stage Run to `running`, then emits
 * `research/generate` with `stageRunId` so the worker can write back
 * terminal status + payload_ref on completion.
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

export const pipelineResearchDispatch = inngest.createFunction(
  {
    id: 'pipeline-research-dispatch',
    retries: 0,
    triggers: [{ event: 'pipeline/stage.requested' }],
  },
  async ({ event }: { event: StageRequestedEvent }) => {
    if (event.data.stage !== 'research') return;

    const sb: Sb = createServiceClient();
    const { stageRunId, projectId } = event.data;

    const { data: stageRun } = await sb
      .from('stage_runs')
      .select('id, project_id, stage, status, input_json')
      .eq('id', stageRunId)
      .maybeSingle();
    if (!stageRun) return;

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

    // Resolve the idea_archive id (NOT brainstorm_draft id) — research_sessions.
    // idea_id is FK to idea_archives.id. If the user has an explicit ideaArchiveId
    // in input, honour it. Otherwise read the prior brainstorm Stage Run's
    // payload_ref (which points to a brainstorm_draft) and promote that draft
    // to idea_archives if it hasn't been promoted yet — same shape as
    // POST /brainstorm/sessions/:id/drafts/save.
    let ideaArchiveId = (input.ideaId as string | undefined) ?? null;
    let topic = (input.topic as string | undefined) ?? null;
    let brainstormDraftId: string | null = null;

    if (!ideaArchiveId) {
      const { data: priorBrainstorm } = await sb
        .from('stage_runs')
        .select('id, stage, status, payload_ref')
        .eq('project_id', projectId)
        .eq('stage', 'brainstorm')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const ref = priorBrainstorm?.payload_ref as { kind?: string; id?: string } | null | undefined;
      if (ref?.kind === 'brainstorm_draft' && ref.id) {
        brainstormDraftId = ref.id;
      }
    }

    if (brainstormDraftId) {
      const { data: draft } = await sb
        .from('brainstorm_drafts')
        .select('*')
        .eq('id', brainstormDraftId)
        .maybeSingle();
      if (draft) {
        if (!topic && draft.title) topic = draft.title as string;
        // Try to find an existing idea_archive promotion for this draft.
        const { data: existingArchive } = await sb
          .from('idea_archives')
          .select('id')
          .eq('brainstorm_session_id', draft.session_id as string)
          .eq('title', draft.title as string)
          .maybeSingle();
        if (existingArchive?.id) {
          ideaArchiveId = existingArchive.id as string;
        } else {
          // Promote: same shape as POST /brainstorm/sessions/:id/drafts/save.
          const { count } = await sb
            .from('idea_archives')
            .select('*', { count: 'exact', head: true });
          const newIdeaId = `BC-IDEA-${String((count ?? 0) + 1).padStart(3, '0')}`;
          const { data: archive, error: archiveErr } = await sb
            .from('idea_archives')
            .insert({
              idea_id: newIdeaId,
              title: draft.title ?? '',
              core_tension: draft.core_tension ?? '',
              target_audience: draft.target_audience ?? '',
              verdict: draft.verdict ?? 'experimental',
              discovery_data: draft.discovery_data ?? '',
              source_type: 'brainstorm',
              channel_id: draft.channel_id,
              brainstorm_session_id: draft.session_id,
              user_id: draft.user_id,
              org_id: draft.org_id,
            })
            .select('id')
            .single();
          if (!archiveErr && archive?.id) {
            ideaArchiveId = archive.id as string;
          }
        }
      }
    }

    // Convenience alias for the legacy event payload.
    const ideaId = ideaArchiveId;

    const level = (input.level as 'surface' | 'medium' | 'deep' | undefined) ?? 'medium';
    const focusTags = (input.focusTags as string[] | undefined) ?? [];
    const provider = input.provider as string | undefined;
    const model = input.model as string | undefined;
    const modelTier = (input.modelTier as string | undefined) ?? 'standard';

    const { data: session, error: insertError } = await sb
      .from('research_sessions')
      .insert({
        project_id: projectId,
        channel_id: project.channel_id ?? null,
        org_id: orgId,
        user_id: userId,
        idea_id: ideaArchiveId,
        level,
        focus_tags: focusTags,
        input_json: { topic, ideaTitle: topic, focusTags, level },
        model_tier: modelTier,
        status: 'running',
      })
      .select()
      .single();
    if (insertError || !session?.id) {
      // Surface the silent failure on the Stage Run so the UI shows why.
      const now = new Date().toISOString();
      await sb
        .from('stage_runs')
        .update({
          status: 'failed',
          error_message: `Failed to create research_sessions row: ${(insertError as { message?: string } | undefined)?.message ?? 'unknown'}`,
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
      name: 'research/generate',
      data: {
        sessionId: session.id,
        orgId,
        userId,
        channelId: project.channel_id ?? null,
        ideaId,
        level,
        inputJson: { topic, ideaTitle: topic, focusTags, level },
        modelTier: 'standard',
        provider,
        model,
        stageRunId,
      },
    });
  },
);
