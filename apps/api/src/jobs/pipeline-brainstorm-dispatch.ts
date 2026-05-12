/**
 * pipeline-brainstorm-dispatch — bridges the new `pipeline/stage.requested`
 * event to the legacy `brainstorm/generate` job.
 *
 * Responsibilities:
 *   - Pulls the Stage Run + project + channel.
 *   - Creates a `brainstorm_sessions` row from `stage_runs.input_json` so
 *     existing job_events + SSE plumbing keeps working.
 *   - If `input.provider === 'manual'`, parks the Stage Run in
 *     `awaiting_user(manual_paste)` — no AI call is enqueued.
 *   - Otherwise transitions the Stage Run to `running` and sends
 *     `brainstorm/generate` with the `stageRunId` attached so the worker
 *     can write back terminal status + payload_ref on completion.
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

export const pipelineBrainstormDispatch = inngest.createFunction(
  {
    id: 'pipeline-brainstorm-dispatch',
    retries: 0,
    triggers: [{ event: 'pipeline/stage.requested' }],
  },
  async ({ event }: { event: StageRequestedEvent }) => {
    if (event.data.stage !== 'brainstorm') return;

    const sb: Sb = createServiceClient();
    const { stageRunId, projectId } = event.data;

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

    // Resolve org_id + user_id via the channel (Wave 1 ownership rule).
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

    // Insert the brainstorm_sessions row that drives the existing job.
    const inputMode = (input.mode as string) === 'reference_guided' ? 'reference_guided' : 'fine_tuned';
    const { data: session } = await sb
      .from('brainstorm_sessions')
      .insert({
        project_id: projectId,
        channel_id: project.channel_id ?? null,
        org_id: orgId,
        user_id: userId,
        input_mode: inputMode,
        input_json: input,
        model_tier: 'standard',
        status: 'running',
      })
      .select()
      .single();
    if (!session?.id) return;

    const provider = input.provider as string | undefined;
    const now = new Date().toISOString();

    if (provider === 'manual') {
      // Park the Stage Run — user will paste the AI output via the existing
      // manual-output endpoint, which is responsible for transitioning the
      // Stage Run to `completed` and emitting `pipeline/stage.run.finished`.
      await sb
        .from('stage_runs')
        .update({
          status: 'awaiting_user',
          awaiting_reason: 'manual_paste',
          payload_ref: { kind: 'brainstorm_session', id: session.id },
          started_at: now,
          updated_at: now,
        })
        .eq('id', stageRunId);
      return;
    }

    await sb
      .from('stage_runs')
      .update({
        status: 'running',
        started_at: now,
        updated_at: now,
      })
      .eq('id', stageRunId);

    await inngest.send({
      name: 'brainstorm/generate',
      data: {
        sessionId: session.id,
        orgId,
        userId,
        channelId: project.channel_id ?? null,
        inputMode,
        inputJson: input,
        modelTier: 'standard',
        provider,
        model: input.model as string | undefined,
        stageRunId,
      },
    });
  },
);
