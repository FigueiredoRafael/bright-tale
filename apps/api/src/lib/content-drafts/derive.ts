import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '../api/errors'

export type Medium = 'blog' | 'video' | 'shorts' | 'podcast'

export interface DeriveDraftInput {
  sourceId: string
  trackId: string
  medium: Medium
  userId: string
}

export interface DeriveDraftResult {
  id: string
  created: boolean
}

export async function deriveDraft(
  sb: SupabaseClient,
  input: DeriveDraftInput,
): Promise<DeriveDraftResult> {
  const { sourceId, trackId, medium, userId } = input

  const { data: source, error: srcErr } = await sb
    .from('content_drafts')
    .select(
      'id, user_id, project_id, org_id, channel_id, idea_id, research_session_id, persona_id, title, canonical_core_json',
    )
    .eq('id', sourceId)
    .maybeSingle()
  if (srcErr) throw new ApiError(500, (srcErr as { message?: string }).message ?? 'DB error', 'DB_ERROR')
  if (!source) throw new ApiError(404, 'Source draft not found', 'NOT_FOUND')

  const src = source as Record<string, unknown>
  if (src.user_id !== userId) throw new ApiError(403, 'Forbidden', 'FORBIDDEN')

  const { data: track, error: trackErr } = await sb
    .from('tracks')
    .select('id, project_id')
    .eq('id', trackId)
    .maybeSingle()
  if (trackErr) throw new ApiError(500, (trackErr as { message?: string }).message ?? 'DB error', 'DB_ERROR')
  if (!track) throw new ApiError(404, 'Track not found', 'NOT_FOUND')
  if ((track as { project_id: string }).project_id !== src.project_id) {
    throw new ApiError(409, 'Track does not belong to the source project', 'CONFLICT')
  }

  const { data: existing, error: existErr } = await sb
    .from('content_drafts')
    .select('id')
    .eq('project_id', src.project_id as string)
    .eq('track_id', trackId)
    .maybeSingle()
  if (existErr) throw new ApiError(500, (existErr as { message?: string }).message ?? 'DB error', 'DB_ERROR')
  if (existing) return { id: (existing as { id: string }).id, created: false }

  const { data: created, error: insErr } = await sb
    .from('content_drafts')
    .insert({
      project_id: (src.project_id as string | null) ?? null,
      org_id: src.org_id as string | null,
      user_id: src.user_id as string,
      channel_id: (src.channel_id as string | null) ?? null,
      idea_id: (src.idea_id as string | null) ?? null,
      research_session_id: (src.research_session_id as string | null) ?? null,
      persona_id: (src.persona_id as string | null) ?? null,
      title: (src.title as string | null) ?? null,
      canonical_core_json: src.canonical_core_json ?? null,
      track_id: trackId,
      type: medium,
      status: 'draft',
      draft_json: {},
    })
    .select('id')
    .single()
  if (insErr) throw new ApiError(500, (insErr as { message?: string }).message ?? 'DB error', 'DB_ERROR')

  return { id: (created as { id: string }).id, created: true }
}
