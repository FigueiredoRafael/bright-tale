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
import { generateWithFallback, isQuotaExhausted } from '../lib/ai/router.js';
import { loadAgentConfig, resolveProviderOverride } from '../lib/ai/promptLoader.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { buildAssetsMessage } from '../lib/ai/prompts/assets.js';
import {
  markAwaitingUser,
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

export const pipelineAssetsDispatch = inngest.createFunction(
  {
    id: 'pipeline-assets-dispatch',
    retries: 0,
    timeouts: { finish: '5m' },
    // See pipeline-brainstorm-dispatch for the rationale behind `if:`.
    triggers: [{ event: 'pipeline/stage.requested', if: "event.data.stage == 'assets'" }],
  },
  async ({ event, step }: { event: StageRequestedEvent; step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    if (event.data.stage !== 'assets') return;

    const sb: Sb = createServiceClient();
    const { stageRunId, projectId } = event.data;
    const ctx = { projectId, stage: 'assets' as const };

    const { data: stageRun } = await sb
      .from('stage_runs')
      .select('id, project_id, stage, status, track_id, input_json')
      .eq('id', stageRunId)
      .maybeSingle();
    if (!stageRun) return;
    // Idempotency: bail on terminal statuses. queued is normal entry; running
    // is valid on Inngest replays (step results are cached).
    if (stageRun.status !== 'queued' && stageRun.status !== 'running') return;

    const trackId = stageRun.track_id as string | null | undefined;
    const input = (stageRun.input_json ?? {}) as Record<string, unknown>;
    const mode = (input.mode as 'auto_generate' | 'briefs_only' | 'manual_upload' | undefined) ?? 'briefs_only';
    const provider = input.provider as string | undefined;
    const model = input.model as string | undefined;

    // Resolve the draft to annotate. After the D66 draft→canonical+production
    // split the body lives on the per-track PRODUCTION Stage Run's
    // content_draft (track-scoped), not the legacy project-scoped 'draft'
    // stage. Fall back to that legacy stage for pre-multi-track projects whose
    // runs predate the split.
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
      await markFailed(sb, stageRunId, { ...ctx, errorMessage: 'No prior draft Stage Run to anchor assets to' });
      return;
    }
    const draftId = draftRef.id;

    // Manual upload short-circuits — park the Stage Run for the user.
    if (mode === 'manual_upload') {
      await markAwaitingUser(sb, stageRunId, {
        ...ctx,
        awaitingReason: 'manual_paste',
        payloadRef: { kind: 'content_draft', id: draftId },
        markStarted: true,
        outcome: { mode },
      });
      return;
    }

    // Wrap in step.run so the draft snapshot is memoized across Inngest
    // replays (matches pipeline-production-dispatch's `load-draft`).
    const draft = (await step.run('load-draft', async () => {
      const { data } = await sb
        .from('content_drafts')
        .select('*')
        .eq('id', draftId)
        .maybeSingle();
      return data;
    })) as Record<string, unknown> | null;
    if (!draft) {
      await markFailed(sb, stageRunId, { ...ctx, errorMessage: `content_draft ${draftId} not found` });
      return;
    }

    // Wrap in step.run so the queued→running transition is memoized: a bare
    // markRunning would re-stamp started_at on every Inngest replay.
    await step.run('mark-running', async () => {
      await markRunning(sb, stageRunId, { ...ctx, payloadRef: { kind: 'content_draft', id: draftId } });
    });

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

      const response = await step.run('call-assets-agent', () =>
        generateWithFallback(
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
        ),
      );

      const briefs = response.result as Record<string, unknown>;
      const mergedDraftJson = { ...draftJson, asset_briefs: briefs };
      await step.run('save-asset-briefs', async () => {
        await sb.from('content_drafts').update({ draft_json: mergedDraftJson }).eq('id', draftId);
      });

      await markCompleted(sb, stageRunId, {
        ...ctx,
        payloadRef: { kind: 'content_draft', id: draftId },
        outcome: { mode },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      if (isQuotaExhausted(err)) {
        await markAwaitingUser(sb, stageRunId, {
          ...ctx,
          awaitingReason: 'provider_quota_exhausted',
          markStarted: true,
        });
        return;
      }
      await markFailed(sb, stageRunId, { ...ctx, errorMessage: message });
      throw err;
    }
  },
);
