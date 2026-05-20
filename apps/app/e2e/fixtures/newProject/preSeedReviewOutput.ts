/**
 * preSeedReviewOutput — write a synthetic completed review stage_run + flip
 * content_drafts.status to 'approved' so the review stage shows as done in
 * the v2 sidebar without invoking the real review AI.
 *
 * Mirrors preSeedProductionOutput. ReviewEngine's "Next" button uses the same
 * broken writeStageRunOutcome chain as the other engines and never calls
 * ctx.signalStageComplete('review', ...) — so even a successful real-AI
 * review doesn't move the sidebar. Until that's fixed, e2e pre-seeds the row
 * directly to unblock downstream stages.
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
    throw new Error(`[preSeedReviewOutput] ${method} ${path} -> ${res.status}: ${text}`)
  }
  if (method === 'PATCH') return undefined as T
  return (await res.json()) as T
}

interface PreSeedReviewOptions {
  projectId: string
  draftId: string
  trackId?: string
}

export async function preSeedReviewOutput(opts: PreSeedReviewOptions): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('[preSeedReviewOutput] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing')
  }

  const now = new Date().toISOString()
  const score = 95
  const verdict = 'approved'
  const reviewFeedback = {
    blog_review: {
      score,
      verdict,
      tier: 'gold',
      strengths: ['Clear structure', 'Concise sections'],
      improvements: [],
      summary: 'Pre-seeded review output (e2e bypass).',
    },
  }

  // Flip content_drafts to approved with the same fields the real review writes.
  await sbRequest('PATCH', `content_drafts?id=eq.${opts.draftId}`, {
    status: 'approved',
    review_score: score,
    review_verdict: verdict,
    review_feedback_json: reviewFeedback,
    updated_at: now,
  })

  const outcomeJson = {
    score,
    qualityTier: 'gold',
    verdict,
    feedbackJson: reviewFeedback,
    iterationCount: 1,
  }

  // A track-bound review row should exist after the legacy split runs — but
  // splitDraftStageRuns only creates canonical + production. Review is created
  // lazily by the legacy orchestrator on first dispatch. Until that wires up
  // cleanly in real-AI mode, upsert a completed review row directly.
  const existing = await sbRequest<Array<{ id: string }>>(
    'GET',
    `stage_runs?project_id=eq.${opts.projectId}&stage=eq.review&select=id`,
  )
  if (existing.length === 0) {
    await sbRequest('POST', 'stage_runs', {
      project_id: opts.projectId,
      stage: 'review',
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
