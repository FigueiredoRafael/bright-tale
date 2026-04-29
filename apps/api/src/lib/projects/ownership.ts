import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '../api/errors'

export async function assertProjectOwner(
  projectId: string,
  userId: string,
  sb: SupabaseClient,
): Promise<void> {
  const { data: project } = await sb
    .from('projects')
    .select('channel_id, research_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) throw new ApiError(404, 'Project not found', 'NOT_FOUND')

  if (project.channel_id) {
    const { data: ch } = await sb
      .from('channels').select('user_id').eq('id', project.channel_id).maybeSingle()
    if (ch?.user_id === userId) return
  }
  if (project.research_id) {
    const { data: ra } = await sb
      .from('research_archives').select('user_id').eq('id', project.research_id).maybeSingle()
    if (ra?.user_id === userId) return
  }
  throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
}
