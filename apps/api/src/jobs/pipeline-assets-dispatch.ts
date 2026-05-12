/**
 * pipeline-assets-dispatch — handles `pipeline/stage.requested` for the
 * Assets Stage. Runs agent-5-assets to produce visual_direction + slot
 * briefs and writes the result into `content_drafts.draft_json.asset_briefs`.
 *
 * Mode handling:
 *   - `manual_upload` — Stage Run parks in `awaiting_user(manual_paste)`,
 *     no AI is invoked.
 *   - `briefs_only` (default) — runs the briefs agent and marks the
 *     Stage Run completed.
 *   - `auto_generate` — same as briefs_only at this slice; downstream image
 *     generation is deferred to a follow-up.
 *
 * `skip` mode is filtered out by `shouldSkip` in advanceAfter, so the
 * dispatcher never sees it.
 */
import { inngest } from './client.js';
import { generateWithFallback } from '../lib/ai/router.js';
import { loadAgentConfig, resolveProviderOverride } from '../lib/ai/promptLoader.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { buildAssetsMessage } from '../lib/ai/prompts/assets.js';

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

export const pipelineAssetsDispatch = inngest.createFunction(
  {
    id: 'pipeline-assets-dispatch',
    retries: 0,
    triggers: [{ event: 'pipeline/stage.requested' }],
  },
  async ({ event }: { event: StageRequestedEvent }) => {
    if (event.data.stage !== 'assets') return;

    const sb: Sb = createServiceClient();
    const { stageRunId, projectId } = event.data;

    const { data: stageRun } = await sb
      .from('stage_runs')
      .select('id, project_id, stage, status, input_json')
      .eq('id', stageRunId)
      .maybeSingle();
    if (!stageRun) return;

    const input = (stageRun.input_json ?? {}) as Record<string, unknown>;
    const mode = (input.mode as 'auto_generate' | 'briefs_only' | 'manual_upload' | undefined) ?? 'briefs_only';
    const provider = input.provider as string | undefined;
    const model = input.model as string | undefined;

    // Resolve the prior draft.
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
      await markFailed(sb, stageRunId, projectId, 'No prior draft Stage Run to anchor assets to');
      return;
    }
    const draftId = draftRef.id;

    // Manual upload short-circuits — park the Stage Run for the user.
    if (mode === 'manual_upload') {
      const now = new Date().toISOString();
      await sb
        .from('stage_runs')
        .update({
          status: 'awaiting_user',
          awaiting_reason: 'manual_paste',
          payload_ref: { kind: 'content_draft', id: draftId },
          started_at: now,
          updated_at: now,
        })
        .eq('id', stageRunId);
      return;
    }

    const { data: draft } = await sb
      .from('content_drafts')
      .select('*')
      .eq('id', draftId)
      .maybeSingle();
    if (!draft) {
      await markFailed(sb, stageRunId, projectId, `content_draft ${draftId} not found`);
      return;
    }

    // queued → running
    const startedAt = new Date().toISOString();
    await sb
      .from('stage_runs')
      .update({ status: 'running', started_at: startedAt, updated_at: startedAt })
      .eq('id', stageRunId);

    try {
      const agentConfig = await loadAgentConfig('assets');
      const { provider: resolvedProvider, model: resolvedModel } = resolveProviderOverride(
        provider,
        model,
        agentConfig,
      );

      const draftJson = (draft.draft_json ?? {}) as Record<string, unknown>;
      const sections = Array.isArray(draftJson.sections)
        ? (draftJson.sections as Array<Record<string, unknown>>).map((s, i) => ({
            slot: (s.slot as string) ?? `section_${i + 1}`,
            section_title: (s.section_title as string) ?? (s.title as string) ?? '',
            key_points: Array.isArray(s.key_points) ? (s.key_points as string[]) : [],
          }))
        : [];

      const userMessage = buildAssetsMessage({
        title: (draft.title as string) ?? '',
        content_type: (draft.type as string) ?? 'blog',
        sections,
        channel_context: {},
        idea_context: null,
      });

      const response = await generateWithFallback(
        'assets',
        (draft.model_tier as string) ?? 'standard',
        {
          agentType: 'assets',
          systemPrompt: agentConfig.instructions ?? '',
          userMessage,
        },
        {
          provider: resolvedProvider,
          model: resolvedModel,
          logContext: {
            userId: (draft.user_id as string) ?? '',
            orgId: (draft.org_id as string) ?? '',
            channelId: (draft.channel_id as string) ?? null,
            sessionId: draftId,
            sessionType: 'assets',
          },
        },
      );

      const briefs = response.result as Record<string, unknown>;
      const mergedDraftJson = { ...draftJson, asset_briefs: briefs };
      await sb.from('content_drafts').update({ draft_json: mergedDraftJson }).eq('id', draftId);

      const now = new Date().toISOString();
      await sb
        .from('stage_runs')
        .update({
          status: 'completed',
          payload_ref: { kind: 'content_draft', id: draftId },
          finished_at: now,
          updated_at: now,
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
