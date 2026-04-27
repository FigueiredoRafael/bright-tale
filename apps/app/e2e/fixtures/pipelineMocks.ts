import type { Page, Route, Request } from '@playwright/test'

/**
 * Pipeline mock helpers.
 *
 * The orchestrator is gated by a few /api/* calls during render:
 *   1. /api/projects/:id           — hydrate project + pipeline_state_json
 *   2. /api/channels               — sidebar channel list
 *   3. /api/admin/pipeline-settings + /api/admin/credit-settings  — provider settings
 *   4. /api/agents                 — recommended provider/model
 *
 * After mount, engine actions hit additional endpoints. Use the helpers below
 * to script each scenario instead of hand-rolling routes.
 */

export type StageName =
  | 'brainstorm'
  | 'research'
  | 'draft'
  | 'review'
  | 'assets'
  | 'preview'
  | 'publish'

export interface PipelineStateSeed {
  mode: 'step' | 'auto'
  currentStage: StageName
  stageResults?: Record<string, Record<string, unknown>>
  iterationCount?: number
}

export interface ProjectSeed {
  id: string
  channelId: string
  title: string
  pipelineState?: PipelineStateSeed
}

export const DEFAULT_PROJECT: ProjectSeed = {
  id: 'proj-e2e-1',
  channelId: 'ch-e2e-1',
  title: 'E2E Pipeline Project',
  pipelineState: {
    mode: 'step',
    currentStage: 'brainstorm',
    stageResults: {},
    iterationCount: 0,
  },
}

interface MockOptions {
  project?: ProjectSeed
  pipelineSettings?: {
    reviewApproveScore: number
    reviewRejectThreshold: number
    reviewMaxIterations: number
    defaultProviders?: Record<string, unknown>
  }
}

const DEFAULT_PIPELINE_SETTINGS = {
  reviewApproveScore: 90,
  reviewRejectThreshold: 40,
  reviewMaxIterations: 5,
  defaultProviders: {},
}

const DEFAULT_CREDIT_SETTINGS = {
  costBlog: 200,
  costVideo: 200,
  costShorts: 100,
  costPodcast: 150,
  costCanonicalCore: 80,
  costReview: 20,
  costResearchSurface: 60,
  costResearchMedium: 100,
  costResearchDeep: 180,
}

export interface PipelineMock {
  /** Last persisted pipeline state — captured from PATCH /api/projects/:id */
  lastPersistedState: () => Record<string, unknown> | null
  /** Number of PATCH /api/projects/:id calls observed */
  persistCount: () => number
  /** Tear down — call from test teardown */
  unroute: () => Promise<void>
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ data: body, error: null }),
  })

const fail = (route: Route, message: string, status = 500) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({
      data: null,
      error: { code: 'MOCK_ERROR', message },
    }),
  })

/**
 * Install the baseline route mocks. Returns a handle with observability into
 * persistence so tests can assert that state is being saved.
 */
export async function mockPipelineApis(
  page: Page,
  opts: MockOptions = {},
): Promise<PipelineMock> {
  const project = opts.project ?? DEFAULT_PROJECT
  const pipelineSettings = opts.pipelineSettings ?? DEFAULT_PIPELINE_SETTINGS

  let persistedState: Record<string, unknown> | null = project.pipelineState
    ? ({ ...project.pipelineState } as unknown as Record<string, unknown>)
    : null
  let persistCount = 0

  // Catch-all FIRST so subsequent specific routes take precedence
  // (Playwright evaluates routes in reverse registration order).
  await page.route('**/api/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200 })
    return json(route, null)
  })

  // Project hydration + persistence
  await page.route('**/api/projects/' + project.id, async (route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      return json(route, {
        id: project.id,
        title: project.title,
        channel_id: project.channelId,
        pipeline_state_json: persistedState,
      })
    }
    if (req.method() === 'PATCH' || req.method() === 'PUT') {
      persistCount += 1
      try {
        const body = JSON.parse(req.postData() ?? '{}')
        if (body.pipelineStateJson) {
          persistedState = body.pipelineStateJson as Record<string, unknown>
        }
        if (body.title) {
          project.title = body.title as string
        }
      } catch {
        // best-effort capture
      }
      return json(route, { ok: true })
    }
    return route.fallback()
  })

  // Channels — used by the sidebar + ConnectChannelEmptyState
  await page.route('**/api/channels', async (route) => {
    if (route.request().method() === 'GET') {
      return json(route, {
        items: [
          {
            id: project.channelId,
            name: 'E2E Channel',
            slug: 'e2e-channel',
            language: 'en',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      })
    }
    return route.fallback()
  })

  await page.route('**/api/channels/' + project.channelId, async (route) =>
    json(route, {
      id: project.channelId,
      name: 'E2E Channel',
      slug: 'e2e-channel',
      language: 'en',
    }),
  )

  // Settings
  await page.route('**/api/admin/pipeline-settings', async (route) =>
    json(route, pipelineSettings),
  )
  await page.route('**/api/admin/credit-settings', async (route) =>
    json(route, DEFAULT_CREDIT_SETTINGS),
  )

  // Agent recommendations — used by every engine
  await page.route('**/api/agents', async (route) =>
    json(route, {
      agents: [
        { slug: 'brainstorm', recommended_provider: 'gemini', recommended_model: 'gemini-2.5-flash' },
        { slug: 'research', recommended_provider: 'gemini', recommended_model: 'gemini-2.5-flash' },
        { slug: 'draft', recommended_provider: 'gemini', recommended_model: 'gemini-2.5-flash' },
        { slug: 'review', recommended_provider: 'gemini', recommended_model: 'gemini-2.5-flash' },
      ],
    }),
  )

  // Sidebar / topbar / billing — all benign defaults so the page renders
  await page.route('**/api/me', async (route) =>
    json(route, { id: 'user-e2e-1', email: 'e2e@brighttale.io', role: 'admin' }),
  )
  await page.route('**/api/billing/credits', async (route) =>
    json(route, { remaining: 10000, total: 10000, plan: 'pro' }),
  )

  return {
    lastPersistedState: () => persistedState,
    persistCount: () => persistCount,
    unroute: async () => {
      await page.unrouteAll({ behavior: 'ignoreErrors' })
    },
  }
}

/**
 * Mocks /api/content-drafts/:id (used by review/assets/preview/publish stages).
 * Returns a draft in `approved` status so the review engine can render its
 * "all good — Next: Assets" branch.
 */
export async function mockApprovedDraft(
  page: Page,
  draftId: string,
  overrides: Partial<{
    status: string
    review_score: number
    review_verdict: string
    iteration_count: number
    review_feedback_json: Record<string, unknown>
  }> = {},
) {
  await page.route(`**/api/content-drafts/${draftId}`, async (route) => {
    if (route.request().method() === 'GET') {
      return json(route, {
        id: draftId,
        status: overrides.status ?? 'approved',
        title: 'E2E Draft',
        review_score: overrides.review_score ?? 95,
        review_verdict: overrides.review_verdict ?? 'approved',
        iteration_count: overrides.iteration_count ?? 1,
        review_feedback_json: overrides.review_feedback_json ?? {
          blog_review: { score: 95, verdict: 'approved', quality_tier: 'excellent' },
        },
        wordpress_post_id: null,
        published_url: null,
        draft_json: { type: 'blog' },
      })
    }
    if (route.request().method() === 'PATCH') {
      return json(route, { ok: true })
    }
    return route.fallback()
  })
}

/**
 * Mocks the reproduce actor invocation. Use `succeed: false` to drive the
 * `paused` branch in the review machine.
 */
export async function mockReproduce(
  page: Page,
  draftId: string,
  succeed = true,
) {
  await page.route(
    `**/api/content-drafts/${draftId}/reproduce`,
    async (route) => {
      if (succeed) return json(route, { reproduced: true })
      return fail(route, 'Reproduce failed', 500)
    },
  )
}

/**
 * Captures structured XState events from the orchestrator dev-mode inspector
 * (PipelineOrchestrator.tsx logs `[pipeline]` to console.debug).
 *
 * Uses synchronous text parsing rather than async jsonValue() so events are
 * recorded immediately and tests can poll without race conditions.
 */
export function attachPipelineEventRecorder(page: Page) {
  const events: Array<{ type: string; raw: string }> = []
  page.on('console', (msg) => {
    if (msg.type() !== 'debug') return
    const text = msg.text()
    if (!text.startsWith('[pipeline]')) return
    // Format: "[pipeline] EVENT_TYPE {…}"
    const match = text.match(/^\[pipeline\]\s+(\S+)/)
    if (match) events.push({ type: match[1], raw: text })
  })
  return {
    events,
    types: () => events.map((e) => e.type),
    clear: () => {
      events.length = 0
    },
  }
}
