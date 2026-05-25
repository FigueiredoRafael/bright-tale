/**
 * preSeedResearch — write a completed research_session + stage_runs row + patch
 * pipeline_state_json so the canonical stage starts with valid research context
 * without burning a real AI call.
 *
 * Used by e2e specs that want to validate canonical-onwards behavior without
 * exercising the (occasionally flaky) research agent's OpenAI tool-call loop.
 *
 * Writes via Supabase service-role REST API — same pattern as cleanupHelper.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the test process env.
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
    throw new Error(`[preSeedResearch] ${method} ${path} -> ${res.status}: ${text}`)
  }
  if (method === 'PATCH') return undefined as T
  return (await res.json()) as T
}

interface PreSeedResearchOptions {
  projectId: string
  ideaId: string
  userId: string
  topic: string
}

interface PreSeedResearchResult {
  researchSessionId: string
}

export async function preSeedResearch(
  opts: PreSeedResearchOptions,
): Promise<PreSeedResearchResult> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('[preSeedResearch] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing')
  }

  const projects = await sbRequest<Array<{ channel_id: string; org_id: string; pipeline_state_json: Record<string, unknown> | null }>>(
    'GET',
    `projects?id=eq.${opts.projectId}&select=channel_id,org_id,pipeline_state_json`,
  )
  if (projects.length === 0) {
    throw new Error(`[preSeedResearch] project ${opts.projectId} not found`)
  }
  const { channel_id: channelId, org_id: orgId, pipeline_state_json: psj } = projects[0]

  const now = new Date().toISOString()

  // research_sessions.idea_id has an FK to idea_archives.id. The brainstorm
  // engine writes `outcome_json.ideaId = brainstorm_drafts.id`, which is NOT an
  // archive id. Mirror what `resolveIdeaArchiveFromBrainstorm` does on the API
  // side: look up the brainstorm draft, then promote it to idea_archives by
  // (brainstorm_session_id + title) if not already promoted, and use that
  // resulting archive id below.
  const drafts = await sbRequest<Array<{
    id: string
    session_id: string
    channel_id: string | null
    user_id: string
    org_id: string
    title: string | null
    core_tension: string | null
    target_audience: string | null
    verdict: string | null
    discovery_data: string | null
  }>>(
    'GET',
    `brainstorm_drafts?id=eq.${opts.ideaId}&select=id,session_id,channel_id,user_id,org_id,title,core_tension,target_audience,verdict,discovery_data`,
  )
  if (drafts.length === 0) {
    throw new Error(`[preSeedResearch] brainstorm_draft ${opts.ideaId} not found`)
  }
  const draft = drafts[0]

  const existingArchive = await sbRequest<Array<{ id: string }>>(
    'GET',
    `idea_archives?brainstorm_session_id=eq.${draft.session_id}&title=eq.${encodeURIComponent(draft.title ?? '')}&select=id`,
  )
  let ideaArchiveId: string
  if (existingArchive.length > 0) {
    ideaArchiveId = existingArchive[0].id
  } else {
    const allArchives = await sbRequest<Array<{ id: string }>>('GET', 'idea_archives?select=id')
    const slug = `BC-IDEA-${String(allArchives.length + 1).padStart(3, '0')}`
    const [archive] = await sbRequest<Array<{ id: string }>>('POST', 'idea_archives', {
      idea_id: slug,
      title: draft.title ?? '',
      core_tension: draft.core_tension ?? '',
      target_audience: draft.target_audience ?? '',
      verdict: draft.verdict ?? 'experimental',
      discovery_data: draft.discovery_data ?? '',
      source_type: 'brainstorm',
      channel_id: draft.channel_id,
      brainstorm_session_id: draft.session_id,
      user_id: draft.user_id,
      org_id: draft.org_id,
    })
    ideaArchiveId = archive.id
  }

  const card = {
    id: 'card-preseeded-1',
    title: 'Pre-seeded research card',
    summary: 'Synthesized for e2e canonical-onwards validation.',
    key_insight: 'Pre-seed bypass for the research agent — content is illustrative, not real.',
    sources: [
      { url: 'https://example.com/preseed', title: 'Pre-seeded source' },
    ],
    confidence: 'high',
    evidence_strength: 'strong',
  }

  const inputJson = {
    topic: opts.topic,
    intent: 'informational',
    audience: 'practitioners',
    primaryKeyword: opts.topic,
    secondaryKeywords: [],
    searchIntent: 'informational',
  }

  const [session] = await sbRequest<Array<{ id: string }>>('POST', 'research_sessions', {
    org_id: orgId,
    user_id: opts.userId,
    channel_id: channelId,
    project_id: opts.projectId,
    idea_id: ideaArchiveId,
    level: 'medium',
    focus_tags: [],
    input_json: inputJson,
    cards_json: [card],
    approved_cards_json: [card],
    model_tier: 'standard',
    status: 'completed',
  })

  const outcomeJson: Record<string, unknown> = {
    researchSessionId: session.id,
    approvedCardsCount: 1,
    researchLevel: 'medium',
    primaryKeyword: opts.topic,
    secondaryKeywords: [],
    searchIntent: 'informational',
    confidenceScore: 0.9,
    evidenceStrength: 'strong',
    sourceCount: 1,
    expertQuoteCount: 0,
    researchSummary: 'Pre-seeded research for e2e canonical-onwards validation.',
  }

  await sbRequest('POST', 'stage_runs', {
    project_id: opts.projectId,
    stage: 'research',
    status: 'completed',
    payload_ref: { kind: 'research_session', id: session.id },
    attempt_no: 1,
    started_at: now,
    finished_at: now,
    outcome_json: outcomeJson,
  })

  const existingResults = ((psj ?? {}).stageResults as Record<string, unknown> | undefined) ?? {}
  const mergedPsj = {
    ...(psj ?? {}),
    stageResults: {
      ...existingResults,
      research: { ...outcomeJson, completedAt: now },
    },
  }
  await sbRequest('PATCH', `projects?id=eq.${opts.projectId}`, {
    pipeline_state_json: mergedPsj,
    current_stage: 'canonical',
  })

  return { researchSessionId: session.id }
}
