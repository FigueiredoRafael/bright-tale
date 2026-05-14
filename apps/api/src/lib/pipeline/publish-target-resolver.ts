/**
 * publish-target-resolver.ts
 *
 * Resolves the set of active publish_targets for a given channel/org and
 * medium.  Used by the Publish stage dispatcher (T2.7) and the
 * GET /api/channels/:id/publish-targets route (T2.13).
 *
 * Refs #32
 */

import type { Database } from '@brighttale/shared/types/database';
import { createServiceClient } from '../supabase/index.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type Medium = 'blog' | 'video' | 'shorts' | 'podcast';

export type PublishTargetType =
  | 'wordpress'
  | 'youtube'
  | 'spotify'
  | 'apple_podcasts'
  | 'rss';

export type PublishTarget =
  Database['public']['Tables']['publish_targets']['Row'];

// ─── Static mapping: medium → compatible target types ────────────────────────

export const MEDIUM_TO_TARGET_TYPES: Record<Medium, PublishTargetType[]> = {
  blog: ['wordpress'],
  video: ['youtube'],
  shorts: ['youtube'],
  podcast: ['spotify', 'apple_podcasts', 'youtube', 'rss'],
};

// ─── Resolver ────────────────────────────────────────────────────────────────

/**
 * Returns all active publish_targets compatible with the given medium.
 *
 * Scope rules:
 * - Channel-scoped:  channel_id = channelId
 * - Org-scoped fallback: org_id = orgId AND channel_id IS NULL
 *
 * Both scopes are OR'd together so a single query returns them all.
 * Only rows with is_active = true and a type supported by the medium are
 * returned.
 *
 * @param channelId - The channel UUID owning this Track.
 * @param orgId     - The org UUID, or null if the channel has no org.
 * @param medium    - The Track's medium (blog | video | shorts | podcast).
 */
export async function resolvePublishTargets(
  channelId: string,
  orgId: string | null,
  medium: Medium,
): Promise<PublishTarget[]> {
  const sb = createServiceClient();
  const compatibleTypes = MEDIUM_TO_TARGET_TYPES[medium];

  // Build a PostgREST OR filter:
  //   channel_id=eq.{channelId}
  //   OR (org_id=eq.{orgId} AND channel_id IS NULL)
  //
  // PostgREST v14 supports `or()` on the query builder.
  const orgFilter =
    orgId !== null
      ? `org_id.eq.${orgId},and(channel_id.is.null,org_id.eq.${orgId})`
      : null;

  let query = sb
    .from('publish_targets')
    .select('*')
    .eq('is_active', true)
    .in('type', compatibleTypes);

  if (orgFilter !== null) {
    // Targets that are channel-scoped OR org-scoped (with no channel override).
    query = query.or(`channel_id.eq.${channelId},and(org_id.eq.${orgId},channel_id.is.null)`);
  } else {
    // No org — only channel-scoped targets.
    query = query.eq('channel_id', channelId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`resolvePublishTargets: ${error.message}`);
  }

  return data ?? [];
}
