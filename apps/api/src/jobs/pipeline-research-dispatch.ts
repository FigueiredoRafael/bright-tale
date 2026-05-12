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

    // Resolve the idea: prefer explicit input.ideaId, otherwise read the prior
    // brainstorm Stage Run's payload_ref → brainstorm_drafts pick.
    let ideaId = (input.ideaId as string | undefined) ?? null;
    let topic = (input.topic as string | undefined) ?? null;

    if (!ideaId) {
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
        ideaId = ref.id;
      }
    }

    if (ideaId && !topic) {
      const { data: draft } = await sb
        .from('brainstorm_drafts')
        .select('id, title, session_id')
        .eq('id', ideaId)
        .maybeSingle();
      if (draft?.title) topic = draft.title as string;
    }

    const level = (input.level as 'surface' | 'medium' | 'deep' | undefined) ?? 'medium';
    const focusTags = (input.focusTags as string[] | undefined) ?? [];
    const provider = input.provider as string | undefined;
    const model = input.model as string | undefined;

    const { data: session } = await sb
      .from('research_sessions')
      .insert({
        project_id: projectId,
        channel_id: project.channel_id ?? null,
        org_id: orgId,
        user_id: userId,
        idea_id: ideaId,
        level,
        focus_tags: focusTags,
        input_json: { topic, ideaTitle: topic, focusTags, level },
        status: 'running',
      })
      .select()
      .single();
    if (!session?.id) return;

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
