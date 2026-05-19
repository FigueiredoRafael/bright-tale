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
  },
  research: {
    researchSessionId: 'rs-e2e-1',
    approvedCardsCount: 5,
    researchLevel: 'medium',
  },
  canonical: {
    draftId: 'draft-e2e-1',
    draftTitle: 'E2E Happy Path Draft',
    thesis: 'E2E thesis statement',
  },
  production: {
    draftId: 'draft-e2e-1',
    draftTitle: 'E2E Happy Path Draft',
    draftContent: 'This is the e2e test draft content for production stage.',
  },
  review: {
    score: 95,
    qualityTier: 'excellent',
    verdict: 'approved',
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
    // Map mode to what the API returns (supervised → autopilot, overview → overview, step-by-step → step-by-step)
    return {
      data: {
        project: { mode, paused: false },
        stageRuns: snapshot(),
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

  // Mirror-from-legacy endpoint (fire-and-forget in project page)
  await page.route(`**/api/projects/${project.id}/stage-runs/mirror-from-legacy`, async (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { mirrored: 0 }, error: null }) }),
  )

  // Personas / persona-related endpoints
  await page.route('**/api/personas/**', async (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { items: [] }, error: null }) }),
  )
  await page.route('**/api/personas', async (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { items: [] }, error: null }) }),
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
