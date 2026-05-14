/**
 * pipeline-publish-dispatch — Publish Stage worker.
 *
 * T2.7 scopes the dispatcher to (track, publish_target). The orchestrator
 * (fan-out-planner) emits one Stage Run per active `publish_targets` row
 * compatible with the Track's medium; this worker resolves the row, finds
 * the prior `production` content_draft for the same Track, and routes to
 * the type-specific driver. Outcome lives on the single Stage Run row —
 * one target failing never touches its siblings.
 *
 * Drivers:
 *   - `wordpress` — calls the existing `POST /wordpress/publish-draft` route
 *     internally (INTERNAL_API_KEY auth) with `channelId` resolved from
 *     `publish_targets.channel_id`. Mirrors `published_url` + `wp_post_id`
 *     into the Stage Run's payload_ref for the UI.
 *   - everything else — fail fast with `NOT_IMPLEMENTED`. T6.x adds the
 *     real YouTube/Spotify/Apple/RSS drivers.
 *
 * As before, the Stage Run is parked in `awaiting_user(manual_advance)` by
 * the orchestrator until the Continue endpoint flips it to `queued` and
 * emits `pipeline/stage.requested`.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

export const pipelinePublishDispatch = inngest.createFunction(
  {
    id: 'pipeline-publish-dispatch',
    retries: 0,
    // See pipeline-brainstorm-dispatch for the rationale behind `if:`.
    triggers: [{ event: 'pipeline/stage.requested', if: "event.data.stage == 'publish'" }],
  },
  async ({ event }: { event: StageRequestedEvent }) => {
    if (event.data.stage !== 'publish') return;

    const sb: Sb = createServiceClient();
    const { stageRunId, projectId } = event.data;
    const ctx = { projectId, stage: 'publish' as const };

    const { data: stageRun } = await sb
      .from('stage_runs')
      .select('id, project_id, stage, status, track_id, publish_target_id, input_json')
      .eq('id', stageRunId)
      .maybeSingle();
    if (!stageRun) return;
    // Only run when the orchestrator has transitioned us to `queued` via
    // the Continue endpoint. awaiting_user stays parked until the user clicks;
    // terminal states are inherently excluded too (idempotency on re-delivery).
    if (stageRun.status !== 'queued') return;

    const trackId = (stageRun.track_id as string | null | undefined) ?? null;
    const publishTargetId = (stageRun.publish_target_id as string | null | undefined) ?? null;

    if (!publishTargetId) {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: 'Publish Stage Run missing publish_target_id',
      });
      return;
    }

    const { data: target } = await sb
      .from('publish_targets')
      .select('id, type, channel_id, org_id, is_active, config_json, display_name')
      .eq('id', publishTargetId)
      .maybeSingle();
    if (!target) {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: `publish_target ${publishTargetId} not found`,
      });
      return;
    }
    if (target.is_active === false) {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: `publish_target ${publishTargetId} is inactive`,
      });
      return;
    }

    const targetType = target.type as string;
    if (targetType !== 'wordpress') {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: `NOT_IMPLEMENTED: publish driver for type=${targetType} not yet implemented`,
      });
      return;
    }

    // Resolve the draft from the prior production Stage Run. Track-scoped:
    // each Track has its own production run carrying a medium-specific draft.
    // Legacy single-Track projects (trackId=null) fall back to the most-recent
    // production run regardless of track — preserves pre-multi-track behavior
    // for projects backfilled before T2.1 ran.
    let priorQuery = sb
      .from('stage_runs')
      .select('id, stage, status, payload_ref')
      .eq('project_id', projectId)
      .eq('stage', 'production');
    if (trackId) priorQuery = priorQuery.eq('track_id', trackId);
    const { data: priorProduction } = await priorQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const draftRef = priorProduction?.payload_ref as { kind?: string; id?: string } | null | undefined;
    if (draftRef?.kind !== 'content_draft' || !draftRef.id) {
      await markFailed(sb, stageRunId, {
        ...ctx,
        errorMessage: 'No prior production Stage Run with content_draft payload_ref',
      });
      return;
    }
    const draftId = draftRef.id;

    await markRunning(sb, stageRunId, ctx);

    try {
      const apiBase = process.env.API_URL ?? 'http://localhost:3001';
      const internalKey = process.env.INTERNAL_API_KEY;
      if (!internalKey) throw new Error('INTERNAL_API_KEY not set — cannot invoke WP publish');

      const { data: draft } = await sb
        .from('content_drafts')
        .select('user_id')
        .eq('id', draftId)
        .maybeSingle();
      if (!draft?.user_id) throw new Error(`content_draft ${draftId} has no user_id`);

      const input = (stageRun.input_json ?? {}) as Record<string, unknown>;
      // Map publishInputSchema (status/scheduledAt) → the WordPress route's
      // publishDraftSchema (mode/scheduledDate/channelId). The channelId
      // comes from the publish_target, not the input — that's the whole
      // point of fan-out: each target row owns the destination.
      const rawStatus = (input.status as string | undefined) ?? 'publish';
      const mode: 'publish' | 'draft' | 'schedule' =
        rawStatus === 'future'
          ? 'schedule'
          : rawStatus === 'draft'
            ? 'draft'
            : 'publish';
      const publishBody: Record<string, unknown> = { draftId, mode };
      if (input.scheduledAt) publishBody.scheduledDate = input.scheduledAt;
      if (target.channel_id) publishBody.channelId = target.channel_id;

      const response = await fetch(`${apiBase}/wordpress/publish-draft`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-key': internalKey,
          'x-user-id': draft.user_id as string,
        },
        body: JSON.stringify(publishBody),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.error) {
        const message =
          (body?.error?.message as string | undefined) ?? `WP publish failed (${response.status})`;
        throw new Error(message);
      }

      const publishedUrl = (body?.data?.published_url as string | undefined) ?? null;
      const wpPostId = (body?.data?.wp_post_id as number | string | undefined) ?? null;

      await markCompleted(sb, stageRunId, {
        ...ctx,
        payloadRef: {
          kind: 'publish_record',
          id: String(wpPostId ?? draftId),
          // published_url is a non-standard PayloadRef field carried through
          // for the UI — narrowed away from the type but persisted as JSONB.
          ...(publishedUrl ? { published_url: publishedUrl } : {}),
        } as unknown as { kind: string; id: string },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      await markFailed(sb, stageRunId, { ...ctx, errorMessage: message });
      throw err;
    }
  },
);
