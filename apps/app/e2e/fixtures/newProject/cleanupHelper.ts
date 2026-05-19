/**
 * cleanupHelper — Supabase admin REST helpers for e2e teardown.
 *
 * Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the environment.
 * The caller must have those vars set (e.g. in apps/app/.env.local or
 * playwright.config.ts webServer.env) for cleanup to actually run.
 *
 * Design rules:
 * - NEVER touches `publish_targets` rows.
 * - Uses service_role REST API (bypasses RLS).
 * - Fails silently if env vars are missing — tests still pass.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

function headers(): HeadersInit {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }
}

async function sbDelete(table: string, filter: string): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return
  const url = `${SUPABASE_URL}/rest/v1/${table}?${filter}`
  const res = await fetch(url, { method: 'DELETE', headers: headers() })
  if (!res.ok && res.status !== 404) {
    const body = await res.text()
    console.warn(`[cleanupHelper] DELETE ${table} failed (${res.status}): ${body}`)
  }
}

async function sbSelect<T = Record<string, unknown>>(
  table: string,
  filter: string,
  select = 'id',
): Promise<T[]> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return []
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}&${filter}`
  const res = await fetch(url, { method: 'GET', headers: headers() })
  if (!res.ok) return []
  return (await res.json()) as T[]
}

/**
 * Delete all projects (+ cascaded rows) for the given channelId.
 *
 * Cascade order matters for FK constraints:
 * 1. stage_run_events / job_events / stage_runs (child of projects)
 * 2. tracks (child of projects)
 * 3. blog_drafts (child of projects via project_id)
 * 4. content_drafts (child of projects, also referenced by stage_runs)
 * 5. projects
 * Then orphan sweeps:
 * 6. research_archives (channel-scoped)
 * 7. idea_archives (channel-scoped)
 */
export async function resetProjects(channelId: string): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.warn('[cleanupHelper] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — skipping cleanup')
    return
  }

  // Get project ids for this channel
  const projects = await sbSelect<{ id: string }>('projects', `channel_id=eq.${channelId}`, 'id')
  const projectIds = projects.map((p) => p.id)

  if (projectIds.length > 0) {
    const idFilter = `project_id=in.(${projectIds.join(',')})`

    // Delete stage_run_events first (child of stage_runs)
    await sbDelete('stage_run_events', idFilter)

    // Delete job_events if table exists
    await sbDelete('job_events', idFilter)

    // Delete stage_runs
    await sbDelete('stage_runs', idFilter)

    // Delete tracks
    await sbDelete('tracks', idFilter)

    // Get content_draft ids before deleting
    const drafts = await sbSelect<{ id: string }>('content_drafts', idFilter, 'id')
    const draftIds = drafts.map((d) => d.id)

    // Delete blog_drafts (references content_drafts)
    if (draftIds.length > 0) {
      await sbDelete('blog_drafts', `content_draft_id=in.(${draftIds.join(',')})`)
    }
    await sbDelete('blog_drafts', idFilter)

    // Delete content_drafts
    await sbDelete('content_drafts', idFilter)

    // Delete projects
    await sbDelete('projects', `id=in.(${projectIds.join(',')})`)
  }

  // Orphan sweeps by channel_id
  await sbDelete('research_archives', `channel_id=eq.${channelId}`)
  await sbDelete('idea_archives', `channel_id=eq.${channelId}`)
}

/**
 * Delete all channels (+ all their projects) for a user.
 * Calls resetProjects for each channel first.
 */
export async function resetChannel(userId: string): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.warn('[cleanupHelper] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — skipping cleanup')
    return
  }

  const channels = await sbSelect<{ id: string }>('channels', `user_id=eq.${userId}`, 'id')
  for (const ch of channels) {
    await resetProjects(ch.id)
  }

  if (channels.length > 0) {
    await sbDelete('channels', `user_id=eq.${userId}`)
  }
}
