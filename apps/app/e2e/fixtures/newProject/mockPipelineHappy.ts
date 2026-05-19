/**
 * mockPipelineHappy — Playwright page.route mocks for the full happy-path
 * pipeline contract. Covers all 8 stages (assets + preview are skipped in
 * test config; mocked as `skipped` here for overview-mode assertions).
 *
 * Route registration order: broad catch-all FIRST (runs last), specific routes
 * LAST (run first). This matches pipelineV2Mocks.ts convention.
 *
 * Managed state:
 *   - In-memory stageRuns map (same shape as pipelineV2Mocks StageRunRow)
 *   - projectRow: project metadata returned by GET /api/projects/:id
 *
 * The mock auto-completes stages synchronously (no real delay) for test speed.
 * Callers can call mock.completeStage(stage) after triggering a run to advance
 * the snapshot, or rely on the POST handler auto-completing for supervised/overview.
 */

import type { Page, Route } from '@playwright/test'

export type HappyStage =
  | 'brainstorm'
  | 'research'
  | 'canonical'
  | 'production'
  | 'review'
  | 'assets'
  | 'preview'
  | 'publish'

export interface HappyProjectSeed {
  id: string
  channelId: string
  title: string
  mode: 'step-by-step' | 'supervised' | 'overview'
}

interface StageRunRow {
  id: string
  projectId: string
  stage: HappyStage
  status: string
  attemptNo: number
  inputJson: unknown
  outcomeJson: unknown
  payloadRef: { kind: string; id: string } | null
  finishedAt: string | null
  errorMessage: string | null
  trackId: string | null
  publishTargetId: string | null
  createdAt: string
  updatedAt: string
}

const OUTCOME_BY_STAGE: Record<HappyStage, unknown> = {
  brainstorm: {
    ideaId: 'idea-e2e-1',
    ideaTitle: 'E2E Happy Path Idea',
    ideaVerdict: 'viable',
    ideaCoreTension: 'Quality vs Speed',
    audience: 'Freelancers nearing retirement',
    angle: 'Solo 401(k) for variable income',
    format: 'long-form blog',
  },
  research: {
    researchSessionId: 'rs-e2e-1',
    approvedCardsCount: 5,
    researchLevel: 'medium',
    avgConfidence: 92,
    confidenceCards: [
      { title: 'Solo 401(k) contribution limits', confidence: 96 },
      { title: 'SEP-IRA eligibility rules', confidence: 90 },
      { title: 'Roth conversion strategy', confidence: 88 },
    ],
  },
  canonical: {
    draftId: 'draft-e2e-1',
    draftTitle: 'E2E Happy Path Draft',
    thesis: 'Freelancers need self-directed retirement vehicles to maximize contributions',
    persona: {
      name: 'E2E Persona',
      age: 38,
      niche: 'personal finance for freelancers',
      voice: 'clear, steady, plain',
    },
    argument_chain: [
      { claim: 'No employer match means freelancers fall behind by default' },
      { claim: 'Solo 401(k) doubles the contribution limit through employee+employer roles' },
      { claim: 'SEP-IRA is simpler but caps lower for solo earners' },
    ],
  },
  production: {
    draftId: 'draft-e2e-1',
    draftTitle: 'E2E Happy Path Draft',
    draftContent: 'This is the e2e test draft content for production stage. ' +
      'Freelancers face unique challenges when planning for retirement. '.repeat(40),
    wordCount: 1500,
    headings: [
      'Why freelancers need a different plan',
      'Solo 401(k) basics',
      'SEP-IRA overview',
      'Roth conversions for variable income',
    ],
  },
  review: {
    score: 95,
    qualityTier: 'excellent',
    verdict: 'approved',
    topIssue: 'Add one more concrete example for SEP-IRA contribution math',
    feedbackJson: { summary: 'Great content!' },
  },
  assets: {
    skipped: true,
    assetIds: [],
  },
  preview: {
    skipped: true,
    autoDerived: true,
    seoOverrides: { title: 'E2E Happy Path', slug: 'e2e-happy-path', metaDescription: 'Test' },
    composedHtml: '<h1>E2E Happy Path</h1>',
  },
  publish: {
    wordpressPostId: 99999,
    publishedUrl: 'https://example.com/e2e-happy-path',
    status: 'published',
  },
}

const PAYLOAD_KIND_BY_STAGE: Record<HappyStage, string> = {
  brainstorm: 'brainstorm_draft',
  research: 'research_session',
  canonical: 'content_draft',
  production: 'content_draft',
  review: 'content_draft',
  assets: 'asset_set',
  preview: 'preview_payload',
  publish: 'content_draft',
}

function nowIso(offsetSec = 0): string {
  return new Date(Date.now() + offsetSec * 1000).toISOString()
}

async function readBody(route: Route): Promise<unknown> {
  const raw = route.request().postData()
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return raw }
}

export interface HappyMock {
  project: HappyProjectSeed
  runs: Map<HappyStage, StageRunRow>
  /** Manually mark a stage as completed (useful in step-by-step mode) */
  completeStage(stage: HappyStage): StageRunRow
  /** Snapshot of all stage runs sorted by createdAt */
  snapshot(): StageRunRow[]
  /** Actions captured (POST/PATCH) */
  actions: Array<{ method: string; url: string; body: unknown }>
  /** Teardown */
  unroute(): Promise<void>
}

export async function mockPipelineHappy(
  page: Page,
  opts: { project: HappyProjectSeed },
): Promise<HappyMock> {
  const { project } = opts
  const runs = new Map<HappyStage, StageRunRow>()
  const actions: HappyMock['actions'] = []

  function makeRow(stage: HappyStage, partial: Partial<StageRunRow> = {}): StageRunRow {
    const existing = runs.get(stage)
    return {
      id: existing?.id ?? `sr-${stage}-e2e`,
      projectId: project.id,
      stage,
      status: 'queued',
      attemptNo: 1,
      inputJson: null,
      outcomeJson: null,
      payloadRef: null,
      finishedAt: null,
      errorMessage: null,
      trackId: null,
      publishTargetId: null,
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      ...existing,
      ...partial,
    }
  }

  function completeStage(stage: HappyStage): StageRunRow {
    const row = makeRow(stage, {
      status: 'completed',
      outcomeJson: OUTCOME_BY_STAGE[stage],
      payloadRef: { kind: PAYLOAD_KIND_BY_STAGE[stage], id: `${stage}-e2e-1` },
      finishedAt: nowIso(),
    })
    runs.set(stage, row)
    return row
  }

  function snapshot(): StageRunRow[] {
    return Array.from(runs.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  function snapshotResponse() {
    const mode = project.mode
    // Build a single blog track with the track-scoped stage runs
    const TRACK_ID = 'track-e2e-blog-1'
    const trackScopedStages: HappyStage[] = ['production', 'review', 'assets', 'preview', 'publish']
    const trackStageRuns: Record<string, unknown> = {}
    for (const stage of trackScopedStages) {
      const row = runs.get(stage)
      trackStageRuns[stage] = row
        ? { ...row, trackId: TRACK_ID, allAttempts: [] }
        : null
    }
    const tracks = [
      {
        id: TRACK_ID,
        medium: 'blog',
        status: 'active',
        paused: false,
        stageRuns: trackStageRuns,
        publishTargets: [{ id: 'pt-e2e-1', displayName: 'E2E WordPress' }],
      },
    ]
    return {
      data: {
        project: { mode, paused: false },
        stageRuns: snapshot().map((r) => ({ ...r, allAttempts: [] })),
        tracks,
      },
      error: null,
    }
  }

  function projectResponse() {
    return {
      data: {
        id: project.id,
        channel_id: project.channelId,
        title: project.title,
        mode: project.mode,
        paused: false,
        autopilot_config_json: {
          brainstorm: { topic: 'E2E test topic' },
          assets: { mode: 'skip' },
          preview: { enabled: false },
          publish: { status: 'draft' },
        },
        pipeline_state_json: null,
        template_id: null,
        migrated_to_stage_runs_at: nowIso(-86400),
      },
      error: null,
    }
  }

  // ── Register routes — catch-all FIRST (tried last) ────────────────────────

  await page.route('**/api/**', async (route: Route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') return route.fulfill({ status: 200 })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: null, error: null }),
    })
  })

  // Channels list
  await page.route('**/api/channels', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { items: [{ id: project.channelId, name: 'E2E Channel', slug: 'e2e', language: 'en' }] },
        error: null,
      }),
    })
  })

  await page.route(`**/api/channels/${project.channelId}`, async (route: Route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { id: project.channelId, name: 'E2E Channel', slug: 'e2e', language: 'en' },
        error: null,
      }),
    })
  })

  // Settings
  await page.route('**/api/admin/pipeline-settings', async (route: Route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { reviewApproveScore: 90, reviewRejectThreshold: 40, reviewMaxIterations: 5, defaultProviders: {} }, error: null }),
    }),
  )
  await page.route('**/api/admin/credit-settings', async (route: Route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { costBlog: 200, costVideo: 200, costShorts: 100, costPodcast: 150, costCanonicalCore: 80, costReview: 20, costResearchSurface: 60, costResearchMedium: 100, costResearchDeep: 180 }, error: null }),
    }),
  )
  await page.route('**/api/me', async (route: Route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { id: 'user-e2e', email: 'e2e@brighttale.io', role: 'admin' }, error: null }),
    }),
  )
  await page.route('**/api/billing/credits', async (route: Route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { remaining: 10000, total: 10000, plan: 'pro' }, error: null }),
    }),
  )
  await page.route('**/api/agents', async (route: Route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: {
          agents: [
            { slug: 'brainstorm', recommended_provider: 'gemini', recommended_model: 'gemini-2.5-flash' },
            { slug: 'research', recommended_provider: 'gemini', recommended_model: 'gemini-2.5-flash' },
            { slug: 'canonical', recommended_provider: 'gemini', recommended_model: 'gemini-2.5-flash' },
            { slug: 'production', recommended_provider: 'gemini', recommended_model: 'gemini-2.5-flash' },
            { slug: 'review', recommended_provider: 'gemini', recommended_model: 'gemini-2.5-flash' },
          ],
        },
        error: null,
      }),
    }),
  )

  // GET /api/agent-prompts/:slot — admin-defined provider/model defaults per slot.
  // Engines consult this when the wizard didn't override provider/model.
  await page.route(/\/api\/agent-prompts\/[^/?#]+/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const url = route.request().url()
    const slotMatch = url.match(/\/api\/agent-prompts\/([^/?#]+)/)
    const slot = slotMatch?.[1] ?? 'brainstorm'
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: {
          slot,
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          temperature: 0.5,
          system_prompt: `[e2e] default system prompt for ${slot}`,
        },
        error: null,
      }),
    })
  })

  // ── Wizard-flow endpoints (used when T1 starts at /projects → Start Workflow) ─

  // Autopilot templates list — empty (use Blank)
  await page.route('**/api/autopilot-templates**', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { items: [] }, error: null }),
    })
  })

  // Channel default-media-config
  await page.route(`**/api/channels/${project.channelId}/default-media-config`, async (route: Route) => {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { mediaConfig: { blog: { wordCount: 1500 } } }, error: null }),
    })
  })

  // Channel personas
  await page.route(`**/api/channels/${project.channelId}/personas`, async (route: Route) => {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { items: [] }, error: null }),
    })
  })

  // Channel WordPress config — PublishPanel fetches this; `Publish` button stays
  // disabled until wpConfig is non-null. Provide a minimal valid config.
  await page.route(`**/api/channels/${project.channelId}/wordpress`, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: {
          site_url: 'https://example.test',
          username: 'e2e-publisher',
          configured: true,
        },
        error: null,
      }),
    })
  })

  // POST /api/projects — create project (wizard submit)
  // Seed brainstorm stage_run as queued so PipelineWorkspace cold-start
  // auto-route picks it up and points the user at the brainstorm engine.
  // For supervised/overview, also seed assets+preview as 'skipped' to mirror
  // the orchestrator's response to the wizard's assets.mode='skip' /
  // preview.enabled=false config — without this, supervised auto-advance
  // mounts the AssetsEngine instead of jumping to publish.
  await page.route('**/api/projects', async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = await readBody(route)
    actions.push({ method: 'POST', url: '/api/projects', body })
    // Seed brainstorm as queued (only if not already set)
    if (!runs.get('brainstorm')) {
      runs.set('brainstorm', makeRow('brainstorm', { status: 'queued' }))
    }
    // Seed assets+preview as 'skipped' so the supervised auto-advance
    // walks past them and lands on publish.
    if (!runs.get('assets')) {
      runs.set('assets', makeRow('assets', { status: 'skipped', outcomeJson: OUTCOME_BY_STAGE.assets, finishedAt: nowIso() }))
    }
    if (!runs.get('preview')) {
      runs.set('preview', makeRow('preview', { status: 'skipped', outcomeJson: OUTCOME_BY_STAGE.preview, finishedAt: nowIso() }))
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { id: project.id }, error: null }),
    })
  })

  // Mirror-from-legacy endpoint (fire-and-forget in project page)
  await page.route(`**/api/projects/${project.id}/stage-runs/mirror-from-legacy`, async (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { mirrored: 0 }, error: null }) }),
  )

  // ── Brainstorm engine endpoints ──────────────────────────────────────────
  const BRAINSTORM_SESSION_ID = 'sess-e2e-brainstorm-1'

  // POST /api/brainstorm/sessions — start a brainstorm; return sessionId so the engine subscribes to SSE
  await page.route('**/api/brainstorm/sessions', async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = await readBody(route)
    actions.push({ method: 'POST', url: '/api/brainstorm/sessions', body })
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { sessionId: BRAINSTORM_SESSION_ID, status: 'streaming' }, error: null }),
    })
  })

  // GET /api/brainstorm/sessions/:id/events — SSE stream: emit one `completed` event
  await page.route(/\/api\/brainstorm\/sessions\/[^/]+\/events/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const completedEvent = {
      id: 'evt-completed-1',
      stage: 'completed',
      message: 'Brainstorm completed',
      metadata: null,
      created_at: nowIso(),
    }
    const sseBody = `data: ${JSON.stringify(completedEvent)}\n\n`
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
      body: sseBody,
    })
  })

  // GET /api/brainstorm/sessions/:id/drafts — list staged ideas + recommendation
  await page.route(/\/api\/brainstorm\/sessions\/[^/]+\/drafts/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: {
          drafts: [
            {
              id: 'idea-e2e-1',
              position: 1,
              title: 'E2E Happy Path Idea',
              core_tension: 'Quality vs Speed',
              target_audience: 'Test readers',
              verdict: 'viable',
              discovery_data: 'Some discovery',
            },
            {
              id: 'idea-e2e-2',
              position: 2,
              title: 'E2E Alt Idea',
              core_tension: 'Cost vs Value',
              target_audience: 'Test readers',
              verdict: 'experimental',
              discovery_data: 'Some discovery',
            },
          ],
          recommendation: { pick: 'idea-e2e-1', rationale: 'Highest viability' },
        },
        error: null,
      }),
    })
  })

  // POST /api/brainstorm/sessions/:id/cancel — no-op
  await page.route(/\/api\/brainstorm\/sessions\/[^/]+\/cancel/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ok: true }, error: null }) })
  })

  // ── Research engine endpoints ────────────────────────────────────────────
  const RESEARCH_SESSION_ID = 'sess-e2e-research-1'
  // Realistic findings shape that ResearchFindingsReport renders into
  // per-section cards. The structured arrays (sources/statistics/quotes/
  // counterarguments) are what e2e specs must confront — empty arrays mean
  // the report only shows the summary card and tests cannot prove the
  // research stage actually surfaced research.
  const RESEARCH_FINDINGS = {
    seo: {
      primary_keyword: 'retirement planning freelancers',
      secondary_keywords: ['solo 401k', 'sep ira', 'roth ira freelancer'],
      search_intent: 'informational',
    },
    idea_validation: {
      core_claim_verified: true,
      evidence_strength: 'strong',
      confidence_score: 0.92,
      validation_notes: 'Multiple independent sources confirm the contribution ceiling differential.',
    },
    research_summary: 'Freelancers need self-directed retirement vehicles. Solo 401(k) and SEP-IRA offer the highest contribution limits.',
    sources: [
      {
        source_id: 'src-1',
        title: 'IRS Publication 560 — Retirement Plans for Self-Employed',
        url: 'https://www.irs.gov/publications/p560',
        type: 'government',
        credibility: 'High',
        key_insight: 'Solo 401(k) contribution limit reaches $69,000 in 2024 (employee + employer).',
        date_published: '2024-01-15',
      },
      {
        source_id: 'src-2',
        title: 'Fidelity Self-Employed Retirement Guide',
        url: 'https://www.fidelity.com/retirement-ira/small-business',
        type: 'industry',
        credibility: 'Medium',
        key_insight: 'SEP-IRA caps at 25% of net earnings; lower than Solo 401(k) for high earners.',
        date_published: '2024-03-02',
      },
    ],
    statistics: [
      {
        stat_id: 'stat-1',
        figure: '$69,000',
        claim: 'Solo 401(k) max contribution (2024)',
        source_id: 'src-1',
        context: 'Employee deferral + employer profit sharing combined ceiling.',
      },
      {
        stat_id: 'stat-2',
        figure: '36%',
        claim: 'Freelancers with no retirement account',
        source_id: 'src-2',
        context: 'Industry survey across 1,200 US freelancers.',
      },
    ],
    expert_quotes: [
      {
        quote_id: 'q-1',
        quote: 'A Solo 401(k) is the single highest-ceiling tax-advantaged option for self-employed earners.',
        author: 'Jane Tax-CPA',
        credentials: 'CPA, retirement planning specialist',
        source_id: 'src-1',
      },
    ],
    counterarguments: [
      {
        counter_id: 'c-1',
        point: 'SEP-IRAs are simpler to administer than Solo 401(k)s.',
        strength: 'Medium',
        rebuttal: 'Modern providers (Fidelity, Schwab) offer Solo 401(k)s with the same admin burden as SEPs.',
        source_id: 'src-2',
      },
    ],
    knowledge_gaps: [
      'How quarterly variable income impacts Solo 401(k) contribution timing.',
    ],
    refined_angle: {
      should_pivot: false,
      updated_title: 'Solo 401(k) vs SEP-IRA for Freelancers — the honest comparison',
      updated_hook: 'You can contribute up to $69k if you pick the right vehicle.',
      angle_notes: 'Lead with the dollar figure; keep the original audience.',
      recommendation: 'Proceed with the original angle, sharpen the hook.',
    },
    confidence_score: 0.92,
    evidence_strength: 'strong',
    source_count: 12,
    expert_quote_count: 3,
    pivot_recommendation: 'None — original angle is strong',
  }

  // POST /api/research-sessions — return findings synchronously (skip SSE)
  await page.route('**/api/research-sessions', async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = await readBody(route)
    actions.push({ method: 'POST', url: '/api/research-sessions', body })
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: {
          sessionId: RESEARCH_SESSION_ID,
          status: 'completed',
          findings: RESEARCH_FINDINGS,
        },
        error: null,
      }),
    })
  })

  // GET /api/research-sessions/:id — session detail
  await page.route(/\/api\/research-sessions\/[^/]+$/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: {
          session: {
            id: RESEARCH_SESSION_ID,
            cards_json: RESEARCH_FINDINGS,
            status: 'completed',
          },
        },
        error: null,
      }),
    })
  })

  // SSE /api/research-sessions/:id/events — emit completed
  await page.route(/\/api\/research-sessions\/[^/]+\/events/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const sseBody = `data: ${JSON.stringify({ id: 'evt-r-1', stage: 'completed', message: 'done', metadata: null, created_at: nowIso() })}\n\n`
    return route.fulfill({
      status: 200, contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
      body: sseBody,
    })
  })

  // POST /api/research-sessions/:id/cancel
  await page.route(/\/api\/research-sessions\/[^/]+\/cancel/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ok: true }, error: null }) })
  })

  // PATCH /api/research-sessions/:id/review (legacy approve cards path)
  await page.route(/\/api\/research-sessions\/[^/]+\/review/, async (route: Route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ok: true }, error: null }) })
  })

  // ── Draft / canonical / production engine endpoints ─────────────────────
  const DRAFT_ID = 'draft-e2e-1'
  const CANONICAL_CORE = {
    title: 'Retirement Planning for Freelancers: A Complete Guide',
    seo: { primary_keyword: 'retirement planning freelancers', meta_description: 'How freelancers can plan retirement.', slug: 'retirement-planning-freelancers' },
    outline: [
      { heading: 'Why freelancers need a different plan', points: ['No employer match', 'Variable income'] },
      { heading: 'Solo 401(k) basics', points: ['Contribution limits', 'Tax treatment'] },
      { heading: 'SEP-IRA overview', points: ['Eligibility', 'Maxing out'] },
    ],
    image_slots: [],
  }
  const PRODUCED_CONTENT = {
    body_markdown: '# Retirement Planning for Freelancers\n\n' + 'Freelancers face unique challenges when planning for retirement. '.repeat(120),
    word_count: 1500,
    meta_description: 'How freelancers can plan retirement using solo 401(k) and SEP-IRA.',
  }

  // POST /api/content-drafts — create
  await page.route('**/api/content-drafts', async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = await readBody(route)
    actions.push({ method: 'POST', url: '/api/content-drafts', body })
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { id: DRAFT_ID, draftId: DRAFT_ID }, error: null }),
    })
  })

  // POST /api/content-drafts/:id/canonical-core — generate canonical
  await page.route(/\/api\/content-drafts\/[^/]+\/canonical-core/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = await readBody(route)
    actions.push({ method: 'POST', url: '/api/content-drafts/:id/canonical-core', body })
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { canonicalCoreJson: CANONICAL_CORE, canonical_core_json: CANONICAL_CORE }, error: null }),
    })
  })

  // POST /api/content-drafts/:id/generate — kicks off production
  await page.route(/\/api\/content-drafts\/[^/]+\/generate/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = await readBody(route)
    actions.push({ method: 'POST', url: '/api/content-drafts/:id/generate', body })
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { status: 'completed', ...PRODUCED_CONTENT }, error: null }),
    })
  })

  // POST /api/content-drafts/:id/produce — production
  await page.route(/\/api\/content-drafts\/[^/]+\/produce/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = await readBody(route)
    actions.push({ method: 'POST', url: '/api/content-drafts/:id/produce', body })
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { status: 'completed', ...PRODUCED_CONTENT }, error: null }),
    })
  })

  // SSE /api/content-drafts/:id/events
  await page.route(/\/api\/content-drafts\/[^/]+\/events/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const sseBody = `data: ${JSON.stringify({ id: 'evt-d-1', stage: 'completed', message: 'done', metadata: null, created_at: nowIso() })}\n\n`
    return route.fulfill({
      status: 200, contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
      body: sseBody,
    })
  })

  // POST /api/content-drafts/:id/cancel
  await page.route(/\/api\/content-drafts\/[^/]+\/cancel/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ok: true }, error: null }) })
  })

  // Review state — shared by POST /review, PATCH /content-drafts/:id, GET /content-drafts/:id.
  // ReviewEngine flow: PATCH(status:in_review) → POST /review → refetchDraft GET → expects
  // review_feedback_json / review_score / review_verdict populated.
  const REVIEW_ID = 'rev-e2e-1'
  const REVIEW_SCORE = 95
  const REVIEW_VERDICT = 'approved'
  const REVIEW_FEEDBACK = {
    overall_verdict: 'approved',
    blog_review: { score: REVIEW_SCORE, verdict: 'approved', strengths: ['clear thesis'], weaknesses: [] },
    summary: 'Great content!',
  }
  let draftStatus: 'completed' | 'in_review' | 'approved' = 'completed'
  let reviewPosted = false
  let iterationCount = 0

  // GET /api/content-drafts/:id — draft detail (review fields populated after review POST)
  await page.route(/\/api\/content-drafts\/[^/]+$/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: DRAFT_ID,
          status: draftStatus,
          canonical_core_json: CANONICAL_CORE,
          // ProductionEngine.extractProducedContent reads draft_json.blog.full_draft
          // for the blog medium, with fallbacks to draft_json.full_draft.
          draft_json: {
            blog: { full_draft: PRODUCED_CONTENT.body_markdown },
            full_draft: PRODUCED_CONTENT.body_markdown,
            word_count: PRODUCED_CONTENT.word_count,
          },
          body_markdown: PRODUCED_CONTENT.body_markdown,
          word_count: PRODUCED_CONTENT.word_count,
          meta_description: PRODUCED_CONTENT.meta_description,
          title: CANONICAL_CORE.title,
          // Review fields — null until POST /review runs, then populated for refetchDraft
          review_score: reviewPosted ? REVIEW_SCORE : null,
          review_verdict: reviewPosted ? REVIEW_VERDICT : null,
          review_feedback_json: reviewPosted ? REVIEW_FEEDBACK : null,
          iteration_count: iterationCount,
        },
        error: null,
      }),
    })
  })

  // PATCH /api/content-drafts/:id — ReviewEngine PATCHes status:in_review then status:approved.
  // Sibling routes above already filter on method GET/POST, so PATCH falls through to here.
  await page.route(/\/api\/content-drafts\/[^/]+$/, async (route: Route) => {
    const method = route.request().method()
    if (method !== 'PATCH' && method !== 'PUT') return route.fallback()
    const body = await readBody(route) as Record<string, unknown> | null
    actions.push({ method, url: '/api/content-drafts/:id', body })
    if (body && typeof body === 'object') {
      if (body.status === 'in_review' || body.status === 'approved') {
        draftStatus = body.status as typeof draftStatus
      }
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { id: DRAFT_ID, status: draftStatus }, error: null }),
    })
  })

  // POST /api/content-drafts/:id/review — kick off review (returns review payload directly)
  await page.route(/\/api\/content-drafts\/[^/]+\/review/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = await readBody(route)
    actions.push({ method: 'POST', url: '/api/content-drafts/:id/review', body })
    reviewPosted = true
    iterationCount += 1
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: DRAFT_ID,
          status: draftStatus,
          review_score: REVIEW_SCORE,
          review_verdict: REVIEW_VERDICT,
          review_feedback_json: REVIEW_FEEDBACK,
          iteration_count: iterationCount,
        },
        error: null,
      }),
    })
  })

  await page.route('**/api/reviews', async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = await readBody(route)
    actions.push({ method: 'POST', url: '/api/reviews', body })
    reviewPosted = true
    iterationCount += 1
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: { reviewId: REVIEW_ID, status: 'completed', review_score: REVIEW_SCORE, review_verdict: REVIEW_VERDICT, review_feedback_json: REVIEW_FEEDBACK },
        error: null,
      }),
    })
  })

  await page.route(/\/api\/reviews\/[^/]+/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { id: REVIEW_ID, status: 'completed', review_score: REVIEW_SCORE, review_verdict: REVIEW_VERDICT, review_feedback_json: REVIEW_FEEDBACK }, error: null }),
    })
  })

  // ── Publish engine endpoints ────────────────────────────────────────────
  await page.route(/\/api\/content-drafts\/[^/]+\/publish/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = await readBody(route)
    actions.push({ method: 'POST', url: '/api/content-drafts/:id/publish', body })
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { ok: true, postId: 'wp-post-e2e-1', url: 'https://example.test/blog/retirement' }, error: null }),
    })
  })

  await page.route('**/api/publish-targets', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: {
          items: [
            { id: 'pt-e2e-1', name: 'E2E WordPress', type: 'wordpress', channel_id: project.channelId },
          ],
        },
        error: null,
      }),
    })
  })

  // Personas / persona-related endpoints — CanonicalEngine expects `data` to be a Persona[] array
  const E2E_PERSONA = {
    id: 'persona-e2e-1',
    slug: 'e2e-persona',
    name: 'E2E Persona',
    avatarUrl: null,
    bioShort: 'E2E test persona',
    bioLong: 'E2E test persona used for happy-path runs.',
    primaryDomain: 'finance',
    domainLens: 'personal finance for freelancers',
    approvedCategories: ['retirement'],
    writingVoiceJson: {
      tone: 'clear',
      cadence: 'steady',
      diction: 'plain',
      signaturePhrases: ['Independent income, dependable retirement.'],
    },
    eeatSignalsJson: { credentials: [], experience: [] },
    soulJson: {
      tagline: 'Independent income, dependable retirement.',
      humorStyle: 'dry wit',
      strongOpinions: ['Solo 401(k) beats SEP-IRA for solo earners.', 'Roth contributions matter more than people think.'],
    },
    wpAuthorId: null,
    archetypeSlug: null,
    avatarParamsJson: null,
    isActive: true,
    createdAt: nowIso(-86400),
    updatedAt: nowIso(),
  }
  await page.route('**/api/personas/**', async (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [E2E_PERSONA], error: null }) }),
  )
  await page.route('**/api/personas', async (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [E2E_PERSONA], error: null }) }),
  )

  // Stage-run action routes (PATCH/POST on specific runs)
  await page.route(`**/api/projects/${project.id}/stage-runs/**`, async (route: Route) => {
    const method = route.request().method()
    const url = route.request().url()
    if (url.includes('/mirror-from-legacy')) return route.fallback()
    const body = await readBody(route)
    actions.push({ method, url, body })

    if (method === 'POST' && url.endsWith('/continue')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { status: 'completed' }, error: null }) })
    }
    if (method === 'POST' && url.endsWith('/manual-output')) {
      // Infer the stage from the stageRunId in the URL (format: sr-<stage>-e2e)
      const match = url.match(/stage-runs\/sr-([a-z]+)-e2e\/manual-output/)
      const stage = match?.[1] as HappyStage | undefined
      if (stage) completeStage(stage)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ok: true }, error: null }) })
    }
    if (method === 'PATCH') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ok: true }, error: null }) })
    }
    return route.fallback()
  })

  // POST /api/projects/:id/stage-runs — create a stage run
  // In happy-path: auto-complete the stage on creation for supervised/overview modes
  await page.route(`**/api/projects/${project.id}/stage-runs`, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = (await readBody(route)) as { stage?: HappyStage; input?: unknown } | null
    actions.push({ method: 'POST', url: '/stage-runs', body })
    const stage = body?.stage
    if (!stage) {
      return route.fulfill({ status: 400, body: JSON.stringify({ data: null, error: { code: 'BAD' } }) })
    }
    // Auto-complete for supervised/overview mode
    const row = completeStage(stage)
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          stageRun: {
            id: row.id,
            projectId: row.projectId,
            stage: row.stage,
            status: row.status,
            attemptNo: row.attemptNo,
            outcomeJson: row.outcomeJson,
            payloadRef: row.payloadRef,
            finishedAt: row.finishedAt,
            createdAt: row.createdAt,
          },
        },
        error: null,
      }),
    })
  })

  // GET /api/projects/:id/stages — snapshot endpoint
  await page.route(`**/api/projects/${project.id}/stages`, async (route: Route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(snapshotResponse()),
    })
  })

  // GET /api/projects/:id — project hydration (registered last → runs first)
  await page.route(`**/api/projects/${project.id}`, async (route: Route) => {
    const method = route.request().method()
    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(projectResponse()),
      })
    }
    if (method === 'PATCH' || method === 'PUT') {
      actions.push({ method, url: `/api/projects/${project.id}`, body: await readBody(route) })
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ok: true }, error: null }) })
    }
    return route.fallback()
  })

  return {
    project,
    runs,
    completeStage,
    snapshot,
    actions,
    unroute: async () => {
      await page.unrouteAll({ behavior: 'ignoreErrors' })
    },
  }
}
