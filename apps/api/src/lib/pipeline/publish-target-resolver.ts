/**
 * publish-target-resolver — given a Track's channel/org scope + medium,
 * returns the active `publish_targets` rows the Publish dispatcher should
 * fan out to.
 *
 * Resolution rules:
 *   - Targets attached directly to the Track's channel always apply.
 *   - Targets attached to the parent org (channel_id IS NULL) apply when
 *     the channel itself has no target of that type.
 *   - Only `is_active = true` rows are returned.
 *   - Only rows whose `type` is in `MEDIUM_TO_TARGET_TYPES[medium]` are
 *     returned — e.g. a Track with medium=blog never sees YouTube targets.
 *
 * Used by:
 *   - Publish dispatcher (T2.7) — to decide which external publishers to call.
 *   - `GET /api/channels/:id/publish-targets` (T2.13) — to render the
 *     channel-settings page.
 */
import type { Medium } from '@brighttale/shared/pipeline/inputs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

export type PublishTargetType =
  | 'wordpress'
  | 'youtube'
  | 'spotify'
  | 'apple_podcasts'
  | 'rss';

export const MEDIUM_TO_TARGET_TYPES: Record<Medium, PublishTargetType[]> = {
  blog: ['wordpress'],
  video: ['youtube'],
  shorts: ['youtube'],
  podcast: ['spotify', 'apple_podcasts', 'youtube', 'rss'],
};

export interface PublishTarget {
  id: string;
  channelId: string | null;
  orgId: string | null;
  type: PublishTargetType;
  displayName: string;
  configJson: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PublishTargetRow {
  id: string;
  channel_id: string | null;
  org_id: string | null;
  type: string;
  display_name: string;
  config_json: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function resolvePublishTargets(
  sb: Sb,
  channelId: string,
  orgId: string | null,
  medium: Medium,
): Promise<PublishTarget[]> {
  const compatibleTypes = MEDIUM_TO_TARGET_TYPES[medium];
  if (!compatibleTypes.length) return [];

  // Scope filter: channel-attached OR (org-attached when no channel).
  // Supabase's PostgREST OR syntax with AND requires careful parenthesising;
  // the `.or()` string below is the documented way to express it.
  const scopeFilter = orgId
    ? `channel_id.eq.${channelId},and(org_id.eq.${orgId},channel_id.is.null)`
    : `channel_id.eq.${channelId}`;

  const { data, error } = await sb
    .from('publish_targets')
    .select(
      'id, channel_id, org_id, type, display_name, config_json, is_active, created_at, updated_at',
    )
    .or(scopeFilter)
    .eq('is_active', true)
    .in('type', compatibleTypes);

  if (error) throw new Error(`resolvePublishTargets: ${error.message}`);
  const rows = (data ?? []) as PublishTargetRow[];
  return rows.map(rowToTarget);
}

function rowToTarget(row: PublishTargetRow): PublishTarget {
  return {
    id: row.id,
    channelId: row.channel_id,
    orgId: row.org_id,
    type: row.type as PublishTargetType,
    displayName: row.display_name,
    configJson: row.config_json,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
