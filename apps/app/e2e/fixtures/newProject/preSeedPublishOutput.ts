/**
 * preSeedPublishOutput — write a completed publish stage_run + flip
 * content_drafts.status='published' so the publish stage shows as done in
 * the v2 sidebar without invoking WordPress / a real publish_target.
 *
 * The E2E channel has no publish_target configured (publish_targets table is
 * empty in local), so the PublishEngine "Confirm" button stays disabled. Until
 * the test seeds a publish_target (or the engine learns a no-target fallback),
 * pre-seed the row directly so downstream assertions can pass.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

function headers(prefer: string): HeadersInit {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: prefer,
  }
}

async function sbRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, {
    method,
    headers: headers(method === 'POST' ? 'return=representation' : 'return=minimal'),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`[preSeedPublishOutput] ${method} ${path} -> ${res.status}: ${text}`)
  }
  if (method === 'PATCH') return undefined as T
  return (await res.json()) as T
}

interface PreSeedPublishOptions {
  projectId: string
  draftId: string
  trackId?: string
}

export async function preSeedPublishOutput(opts: PreSeedPublishOptions): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('[preSeedPublishOutput] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing')
  }

  const now = new Date().toISOString()

  await sbRequest('PATCH', `content_drafts?id=eq.${opts.draftId}`, {
    status: 'published',
    updated_at: now,
  })

  const outcomeJson = {
    publishedAt: now,
    targetUrl: 'https://example.com/preseeded-e2e-post',
    targetType: 'manual',
  }

  const existing = await sbRequest<Array<{ id: string }>>(
    'GET',
    `stage_runs?project_id=eq.${opts.projectId}&stage=eq.publish&select=id`,
  )
  if (existing.length === 0) {
    await sbRequest('POST', 'stage_runs', {
      project_id: opts.projectId,
      stage: 'publish',
      status: 'completed',
      payload_ref: { kind: 'content_draft', id: opts.draftId },
      attempt_no: 1,
      started_at: now,
      finished_at: now,
      outcome_json: outcomeJson,
      track_id: opts.trackId ?? null,
    })
  } else {
    await sbRequest('PATCH', `stage_runs?id=eq.${existing[0].id}`, {
      status: 'completed',
      finished_at: now,
      updated_at: now,
      outcome_json: outcomeJson,
    })
  }
}
