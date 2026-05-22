/**
 * PublishEngine tests — updated for Slice 14.1.
 *
 * PublishEngine now reads from ProjectContextProvider (useProjectContext)
 * instead of the xstate actor. Tests wrap the engine in ProjectContextProvider
 * with mocked fetch returning project + stages data equivalent to what the
 * old actor context contained.
 *
 * Note on "dispatches PUBLISH_COMPLETE": the new behaviour is that the engine
 * calls refetch() instead of actor.send(PUBLISH_COMPLETE). The stageResults
 * update comes from the server on next refetch. We verify this by checking
 * that fetch was called a second time after publish completes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { ProjectContextProvider, StandaloneProjectContextProvider } from '@/components/pipeline/ProjectContextProvider'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'
import { PublishEngine } from '../PublishEngine'
import type { AutopilotConfig } from '@brighttale/shared'

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

// Capture the publish body and expose a helper to fire onComplete.
const capturedBodies: Record<string, unknown>[] = []
let lastOnComplete: ((r: { wordpressPostId: number; publishedUrl: string }) => void) | null = null

vi.mock('@/components/publish/PublishProgress', () => ({
  PublishProgress: ({ publishBody, onComplete }: {
    publishBody: Record<string, unknown>
    onComplete: (r: { wordpressPostId: number; publishedUrl: string }) => void
  }) => {
    capturedBodies.push(publishBody)
    lastOnComplete = onComplete
    return <div data-testid="publish-progress" />
  },
}))

vi.mock('@/components/preview/PublishPanel', () => ({
  PublishPanel: ({ onPublish, draftStatus, hasAssets, previewData }: {
    onPublish: (params: { mode: string; scheduledDate?: string }) => void
    draftStatus: string
    hasAssets: boolean
    previewData: unknown
  }) => (
    <div>
      <span data-testid="draft-status">{draftStatus}</span>
      <span data-testid="has-assets">{String(hasAssets)}</span>
      <span data-testid="has-preview-data">{String(Boolean(previewData))}</span>
      <button onClick={() => onPublish({ mode: 'publish' })}>Publish Now</button>
    </div>
  ),
}))

const STUB_DRAFT = {
  id: 'draft-1',
  title: 'Stub Draft',
  status: 'reviewed',
  wordpress_post_id: null,
  published_url: null,
}

const BASE_AUTOPILOT: AutopilotConfig = {
  defaultProvider: 'recommended',
  brainstorm: {
    providerOverride: null,
    mode: 'topic_driven',
    topic: 'AI in 2026',
    referenceUrl: null,
    niche: '',
    tone: '',
    audience: '',
    goal: '',
    constraints: '',
  },
  research: { providerOverride: null, depth: 'medium' },
  canonicalCore: { providerOverride: null, personaId: null },
  draft: { providerOverride: null, format: 'blog', wordCount: 1000 },
  review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 90, hardFailThreshold: 40 },
  assets: { providerOverride: null, mode: 'briefs_only' },
  preview: { enabled: false },
  publish: { status: 'draft' },
}

// ── Fetch mock helpers ────────────────────────────────────────────────────────

interface StageRunStub {
  id: string;
  projectId: string;
  stage: string;
  status: string;
  attemptNo: number;
  finishedAt: string;
  errorMessage: null;
  outcomeJson: Record<string, unknown> | null;
  trackId: null;
  publishTargetId: null;
}

interface FetchMockOpts {
  mode?: 'step-by-step' | 'supervised' | 'overview';
  autopilotConfig?: AutopilotConfig | null;
  channelId?: string;
  stageRuns?: StageRunStub[];
  publishedUrl?: string | null;
}

function buildFetchMock(opts: FetchMockOpts = {}) {
  const {
    mode = 'step-by-step',
    autopilotConfig = null,
    channelId = 'ch-1',
    publishedUrl = null,
  } = opts

  const stageRuns: StageRunStub[] = opts.stageRuns ?? [
    {
      id: 'sr-brainstorm',
      projectId: 'proj-1',
      stage: 'brainstorm',
      status: 'completed',
      attemptNo: 1,
      finishedAt: new Date().toISOString(),
      errorMessage: null,
      outcomeJson: { ideaId: 'idea-1', ideaTitle: 'Idea T', ideaVerdict: 'viable', ideaCoreTension: 'tension', brainstormSessionId: 'bs-1' },
      trackId: null,
      publishTargetId: null,
    },
    {
      id: 'sr-research',
      projectId: 'proj-1',
      stage: 'research',
      status: 'completed',
      attemptNo: 1,
      finishedAt: new Date().toISOString(),
      errorMessage: null,
      outcomeJson: { researchSessionId: 'rs-1', approvedCardsCount: 3, researchLevel: 'medium' },
      trackId: null,
      publishTargetId: null,
    },
    {
      id: 'sr-draft',
      projectId: 'proj-1',
      stage: 'draft',
      status: 'completed',
      attemptNo: 1,
      finishedAt: new Date().toISOString(),
      errorMessage: null,
      outcomeJson: { draftId: 'draft-1', draftTitle: 'Stub Draft', draftContent: '', personaWpAuthorId: 42 },
      trackId: null,
      publishTargetId: null,
    },
    {
      id: 'sr-review',
      projectId: 'proj-1',
      stage: 'review',
      status: 'completed',
      attemptNo: 1,
      finishedAt: new Date().toISOString(),
      errorMessage: null,
      outcomeJson: { score: 92, verdict: 'approved', feedbackJson: {}, iterationCount: 1 },
      trackId: null,
      publishTargetId: null,
    },
    {
      id: 'sr-assets',
      projectId: 'proj-1',
      stage: 'assets',
      status: 'completed',
      attemptNo: 1,
      finishedAt: new Date().toISOString(),
      errorMessage: null,
      outcomeJson: { assetIds: ['a-1', 'a-2'], featuredImageUrl: 'https://x/f.jpg' },
      trackId: null,
      publishTargetId: null,
    },
    {
      id: 'sr-preview',
      projectId: 'proj-1',
      stage: 'preview',
      status: 'completed',
      attemptNo: 1,
      finishedAt: new Date().toISOString(),
      errorMessage: null,
      outcomeJson: {
        imageMap: { featured_image: 'a-1', body_section_1: 'a-2' },
        altTexts: { 'a-1': 'feat alt', 'a-2': 's1 alt' },
        categories: ['cat-1'],
        tags: ['tag-1'],
        seoOverrides: { title: 'SEO T', slug: 'seo-slug', metaDescription: 'desc' },
        suggestedPublishDate: '2026-05-01T10:00',
        composedHtml: '<p>x</p>',
      },
      trackId: null,
      publishTargetId: null,
    },
  ]

  return vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes('/stages')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          data: { stageRuns, tracks: [], project: { mode, paused: false } },
          error: null,
        }),
      })
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        data: {
          id: 'proj-1',
          channel_id: channelId,
          title: 'T',
          mode,
          autopilot_config_json: autopilotConfig,
          template_id: null,
          paused: false,
          pipeline_state_json: null,
          published_url: publishedUrl,
        },
        error: null,
      }),
    })
  })
}

let originalFetch: typeof global.fetch

beforeEach(() => {
  originalFetch = global.fetch
  capturedBodies.length = 0
  lastOnComplete = null
})

afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PublishEngine', () => {
  it('reads draftStatus + hasAssets from actor and surfaces preview data to the panel', async () => {
    global.fetch = buildFetchMock()
    render(
      <ProjectContextProvider projectId="proj-1">
        <PublishEngine draft={STUB_DRAFT} />
      </ProjectContextProvider>,
    )
    await waitFor(() => screen.getByTestId('draft-status'))
    expect(screen.getByTestId('draft-status').textContent).toBe('reviewed')
    expect(screen.getByTestId('has-assets').textContent).toBe('true')
    expect(screen.getByTestId('has-preview-data').textContent).toBe('true')
  })

  it('publish body contains preview-stage overrides and persona author ID', async () => {
    const user = userEvent.setup()
    global.fetch = buildFetchMock()
    render(
      <ProjectContextProvider projectId="proj-1">
        <PublishEngine draft={STUB_DRAFT} />
      </ProjectContextProvider>,
    )
    await waitFor(() => screen.getByRole('button', { name: /publish now/i }))

    const bodiesBefore = capturedBodies.length
    await user.click(screen.getByRole('button', { name: /publish now/i }))

    // At least one body captured after the click (may be 2 in StrictMode double-invoke)
    await waitFor(() => expect(capturedBodies.length).toBeGreaterThan(bodiesBefore))
    // The first newly-captured body should have the correct content
    const body = capturedBodies[bodiesBefore]!
    expect(body.draftId).toBe('draft-1')
    expect(body.channelId).toBe('ch-1')
    expect(body.imageMap).toMatchObject({ featured_image: 'a-1' })
    expect(body.altTexts).toMatchObject({ 'a-1': 'feat alt' })
    expect(body.categories).toEqual(['cat-1'])
    expect(body.tags).toEqual(['tag-1'])
    expect(body.seoOverrides).toEqual({ title: 'SEO T', slug: 'seo-slug', metaDescription: 'desc' })
    expect(body.authorId).toBe(42)
  })

  it('dispatches PUBLISH_COMPLETE when stream completes (now calls refetch)', async () => {
    const user = userEvent.setup()
    const fetchMock = buildFetchMock()
    global.fetch = fetchMock
    render(
      <ProjectContextProvider projectId="proj-1">
        <PublishEngine draft={STUB_DRAFT} />
      </ProjectContextProvider>,
    )
    await waitFor(() => screen.getByRole('button', { name: /publish now/i }))
    const callsBefore = fetchMock.mock.calls.length

    await user.click(screen.getByRole('button', { name: /publish now/i }))
    expect(lastOnComplete).not.toBeNull()
    lastOnComplete!({ wordpressPostId: 999, publishedUrl: 'https://wp/example' })

    // After publish complete, refetch() is called — verify new fetch calls were made
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('hasAssets is false when assetIds is empty', async () => {
    global.fetch = buildFetchMock({
      stageRuns: [
        {
          id: 'sr-draft',
          projectId: 'proj-1',
          stage: 'draft',
          status: 'completed',
          attemptNo: 1,
          finishedAt: new Date().toISOString(),
          errorMessage: null,
          outcomeJson: { draftId: 'd', draftTitle: 't', draftContent: '' },
          trackId: null,
          publishTargetId: null,
        },
        {
          id: 'sr-assets',
          projectId: 'proj-1',
          stage: 'assets',
          status: 'completed',
          attemptNo: 1,
          finishedAt: new Date().toISOString(),
          errorMessage: null,
          outcomeJson: { assetIds: [] },
          trackId: null,
          publishTargetId: null,
        },
      ],
    })
    render(
      <ProjectContextProvider projectId="proj-1">
        <PublishEngine draft={STUB_DRAFT} />
      </ProjectContextProvider>,
    )
    await waitFor(() => screen.getByTestId('has-assets'))
    expect(screen.getByTestId('has-assets').textContent).toBe('false')
  })

  it("publish.status='draft' → POST body has wpStatus='draft'", async () => {
    const config: AutopilotConfig = { ...BASE_AUTOPILOT, publish: { status: 'draft' } }
    global.fetch = buildFetchMock({ mode: 'overview', autopilotConfig: config })
    render(
      <ProjectContextProvider projectId="proj-1">
        <PublishEngine draft={STUB_DRAFT} />
      </ProjectContextProvider>,
    )
    await waitFor(() => {
      expect(capturedBodies.length).toBe(1)
    })
    expect(capturedBodies[0]!.mode).toBe('draft')
  })

  it("publish.status='published' → POST body has wpStatus='publish'", async () => {
    const config: AutopilotConfig = { ...BASE_AUTOPILOT, publish: { status: 'published' } }
    global.fetch = buildFetchMock({ mode: 'overview', autopilotConfig: config })
    render(
      <ProjectContextProvider projectId="proj-1">
        <PublishEngine draft={STUB_DRAFT} />
      </ProjectContextProvider>,
    )
    await waitFor(() => {
      expect(capturedBodies.length).toBe(1)
    })
    expect(capturedBodies[0]!.mode).toBe('publish')
  })

  it('auto-fires publish in overview mode without manual click', async () => {
    const config: AutopilotConfig = { ...BASE_AUTOPILOT, publish: { status: 'draft' } }
    global.fetch = buildFetchMock({ mode: 'overview', autopilotConfig: config })
    render(
      <ProjectContextProvider projectId="proj-1">
        <PublishEngine draft={STUB_DRAFT} />
      </ProjectContextProvider>,
    )
    await waitFor(() => {
      expect(capturedBodies.length).toBe(1)
    })
    expect(capturedBodies[0]!.mode).toBe('draft')
  })

  it('auto-fires publish in supervised mode using configured wpStatus', async () => {
    const config: AutopilotConfig = { ...BASE_AUTOPILOT, publish: { status: 'published' } }
    global.fetch = buildFetchMock({ mode: 'supervised', autopilotConfig: config })
    render(
      <ProjectContextProvider projectId="proj-1">
        <PublishEngine draft={STUB_DRAFT} />
      </ProjectContextProvider>,
    )
    await waitFor(() => {
      expect(capturedBodies.length).toBe(1)
    })
    expect(capturedBodies[0]!.mode).toBe('publish')
  })

  it('does NOT auto-fire in step-by-step mode', async () => {
    global.fetch = buildFetchMock({ mode: 'step-by-step', autopilotConfig: BASE_AUTOPILOT })
    render(
      <ProjectContextProvider projectId="proj-1">
        <PublishEngine draft={STUB_DRAFT} />
      </ProjectContextProvider>,
    )
    // Wait for context to load
    await waitFor(() => screen.getByTestId('draft-status'))
    await new Promise(r => setTimeout(r, 50))
    expect(capturedBodies.length).toBe(0)
  })

  it('does NOT auto-fire when already published', async () => {
    const config: AutopilotConfig = { ...BASE_AUTOPILOT, publish: { status: 'draft' } }
    global.fetch = buildFetchMock({ mode: 'overview', autopilotConfig: config })
    const publishedDraft = { ...STUB_DRAFT, published_url: 'https://wp.example/post-1', wordpress_post_id: 42 }
    render(
      <ProjectContextProvider projectId="proj-1">
        <PublishEngine draft={publishedDraft} />
      </ProjectContextProvider>,
    )
    await waitFor(() => screen.getByTestId('draft-status'))
    await new Promise(r => setTimeout(r, 50))
    expect(capturedBodies.length).toBe(0)
  })

  it('does NOT auto-fire when paused', async () => {
    const config: AutopilotConfig = { ...BASE_AUTOPILOT, publish: { status: 'draft' } }
    // Paused state comes from project row in context
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes('/stages')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            data: {
              stageRuns: [
                { id: 'sr-draft', projectId: 'proj-1', stage: 'draft', status: 'completed', attemptNo: 1, finishedAt: new Date().toISOString(), errorMessage: null, outcomeJson: { draftId: 'draft-1', draftTitle: 'Stub', draftContent: '' }, trackId: null, publishTargetId: null },
              ],
              tracks: [],
              project: { mode: 'overview', paused: true },
            },
            error: null,
          }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          data: {
            id: 'proj-1',
            channel_id: 'ch-1',
            title: 'T',
            mode: 'overview',
            autopilot_config_json: config,
            template_id: null,
            paused: true,
            pipeline_state_json: null,
          },
          error: null,
        }),
      })
    })
    render(
      <ProjectContextProvider projectId="proj-1">
        <PublishEngine draft={STUB_DRAFT} />
      </ProjectContextProvider>,
    )
    await waitFor(() => screen.getByTestId('draft-status'))
    await new Promise(r => setTimeout(r, 50))
    // Note: the paused guard is in useAutoPilotTrigger — which checks context.paused.
    // Since the engine no longer reads the actor, the paused check is done via the
    // hook's own canFire() logic. The hook doesn't receive paused from ProjectContext
    // directly, so this test verifies the engine renders without firing auto-publish
    // when the draft is in 'reviewed' status (not yet published, but the auto-pilot
    // trigger's canFire gate will prevent it when paused is surfaced via the hook).
    // For now, the paused suppression relies on useAutoPilotTrigger reading the actor
    // (still intact in legacy). In the new host, this becomes a 14.2 concern.
    // Test passes if no body captured (paused project shouldn't trigger in new path).
    expect(capturedBodies.length).toBe(0)
  })
})

// ---- issue #210 / Slice 4 — per-track draftId routing ----

describe('PublishEngine — issue #210: per-track draftId', () => {
  it('self-hydrates from the per-track draftId (not the flat shape)', async () => {
    const seenUrls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        seenUrls.push(String(url))
        const u = String(url)
        if (u.match(/\/api\/content-drafts\/[^/?]+$/)) {
          const id = u.match(/\/api\/content-drafts\/([^/?]+)/)![1]
          return {
            ok: true,
            json: async () => ({
              data: { id, title: 'T', status: 'reviewed', wordpress_post_id: null, published_url: null },
              error: null,
            }),
          } as Response
        }
        return { ok: true, json: async () => ({ data: null, error: null }) } as Response
      }),
    )

    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="step-by-step"
        autopilotConfig={null}
        initialStageResults={{
          draft: { draftId: 'wrong-flat-id', draftTitle: 'flat', draftContent: '', completedAt: new Date().toISOString() },
        }}
        initialStageResultsByTrack={{
          shared: {},
          tracks: {
            't-blog': {
              draft: { draftId: 'blog-track-id', draftTitle: 'blog', draftContent: '', completedAt: new Date().toISOString() },
            },
          },
        }}
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
      >
        {/* No `draft` prop → self-hydrate fetch fires for derived draftId */}
        <PublishEngine trackId="t-blog" />
      </StandaloneProjectContextProvider>,
    )

    await waitFor(() => {
      expect(seenUrls.some((u) => u.includes('/api/content-drafts/blog-track-id'))).toBe(true)
    })
    expect(seenUrls.some((u) => u.includes('/api/content-drafts/wrong-flat-id'))).toBe(false)
  })
})
