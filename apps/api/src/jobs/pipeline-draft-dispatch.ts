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

    let ideaId = (input.ideaId as string | undefined) ?? null;
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

    const personaId = (input.personaId as string | undefined) ?? null;
    const productionParams = (input.productionParams as Record<string, unknown> | undefined) ?? null;
    const modelTier = (input.modelTier as string | undefined) ?? 'standard';
    const provider = input.provider as string | undefined;
    const model = input.model as string | undefined;

    const { data: draft } = await sb
      .from('content_drafts')
      .insert({
        org_id: orgId,
        user_id: userId,
        channel_id: project.channel_id ?? null,
        project_id: projectId,
        research_session_id: researchSessionId,
        idea_id: ideaId,
        persona_id: personaId,
        type,
        status: 'draft',
        production_params: productionParams,
        model_tier: modelTier,
      })
      .select()
      .single();
    if (!draft?.id) return;

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
