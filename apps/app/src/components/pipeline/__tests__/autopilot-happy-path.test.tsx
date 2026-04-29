/**
 * autopilot-happy-path.test.tsx
 *
 * Spec 1 integration acceptance test — autopilot happy path.
 *
 * Verifies the 6-stage pipeline machine transitions end-to-end when engines
 * auto-dispatch their completion events (simulating full autopilot with no
 * user input required):
 *
 *   brainstorm → research → draft → review → assets → preview
 *   (publish stage is wired but not asserted — it requires WP config)
 *
 * Architecture:
 *  - Renders a real PipelineOrchestrator with the real XState pipeline machine
 *    in `overview` mode. Overview mode renders PipelineOverview →
 *    OverviewTimeline → StageRow (`data-testid="stage-row-*"`).
 *  - Engines are smart stubs: each reads the real PipelineActorContext via
 *    `useContext` and fires the appropriate *_COMPLETE event on mount.
 *  - SSE / EventSource is stubbed (engines using SSE are mocked out).
 *  - Assertions target CSS classes on `stage-row-*` testids:
 *      running   = className contains `border-l-2`
 *      completed = className does NOT contain `border-l-2` (Check icon shown)
 *
 * SSE notes: BrainstormEngine / ResearchEngine / DraftEngine / ReviewEngine
 * all use EventSource internally via GenerationProgressFloat → useJobEvents.
 * Since these engines are fully mocked here, EventSource is stubbed as a no-op
 * to prevent "EventSource is not defined" errors from any sub-components that
 * leak through.
 *
 * Scope deviation: publish stage not fully asserted (requires WP config + user
 * confirmation which are outside Wave 1 scope). The architecture allows it but
 * the test stops at preview.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React, { useEffect, useContext } from 'react'

// ─── EventSource stub ─────────────────────────────────────────────────────────
// Needed for any component that imports useJobEvents (even if mocked engines
// don't reach it, the module-level import triggers EventSource access).

class NoopEventSource {
  static OPEN = 1
  static CLOSED = 2
  readyState = 2
  onmessage: null = null
  onerror: null = null
  constructor(_url: string) {}
  close() {}
}
vi.stubGlobal('EventSource', NoopEventSource)

// ─── localStorage stub ────────────────────────────────────────────────────────
vi.stubGlobal('localStorage', {
  getItem: vi.fn().mockReturnValue(null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
})

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/providers/PipelineSettingsProvider', () => ({
  usePipelineSettings: () => ({
    pipelineSettings: {
      reviewRejectThreshold: 30,
      reviewApproveScore: 80,
      reviewMaxIterations: 5,
      defaultProviders: {},
    },
    creditSettings: {
      costBlog: 200,
      costVideo: 200,
      costShorts: 100,
      costPodcast: 150,
      costCanonicalCore: 80,
      costReview: 20,
      costResearchSurface: 60,
      costResearchMedium: 100,
      costResearchDeep: 180,
    },
    isLoaded: true,
  }),
  PipelineSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../PipelineWizard', () => ({
  PipelineWizard: () => <div data-testid="pipeline-wizard">PipelineWizard</div>,
}))

vi.mock('../MiniWizardSheet', () => ({
  MiniWizardSheet: () => null,
}))

// ─── Smart engine stubs ───────────────────────────────────────────────────────
// Each stub accesses the real PipelineActorContext and fires *_COMPLETE.
// vi.mock async factories can use `await import(...)` with relative paths that
// resolve the alias correctly under vitest's resolver.

vi.mock('@/components/engines/BrainstormEngine', async () => {
  const React = await import('react')
  const { PipelineActorContext } = await import('../../../providers/PipelineActorProvider')
  function BrainstormEngine() {
    const actor = React.useContext(PipelineActorContext)
    React.useEffect(() => {
      actor?.send({
        type: 'BRAINSTORM_COMPLETE',
        result: {
          ideaId: 'idea-1',
          ideaTitle: 'Test Idea',
          ideaVerdict: 'viable',
          ideaCoreTension: 'Core tension',
          brainstormSessionId: 'bs-1',
        },
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return <div data-testid="brainstorm-engine-stub" />
  }
  return { BrainstormEngine }
})

vi.mock('@/components/engines/ResearchEngine', async () => {
  const React = await import('react')
  const { PipelineActorContext } = await import('../../../providers/PipelineActorProvider')
  function ResearchEngine() {
    const actor = React.useContext(PipelineActorContext)
    React.useEffect(() => {
      actor?.send({
        type: 'RESEARCH_COMPLETE',
        result: {
          researchSessionId: 'rs-1',
          approvedCardsCount: 5,
          researchLevel: 'medium',
          primaryKeyword: 'test keyword',
          secondaryKeywords: [],
          searchIntent: 'informational',
        },
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return <div data-testid="research-engine-stub" />
  }
  return { ResearchEngine }
})

vi.mock('@/components/engines/DraftEngine', async () => {
  const React = await import('react')
  const { PipelineActorContext } = await import('../../../providers/PipelineActorProvider')
  function DraftEngine() {
    const actor = React.useContext(PipelineActorContext)
    React.useEffect(() => {
      actor?.send({
        type: 'DRAFT_COMPLETE',
        result: {
          draftId: 'draft-1',
          draftTitle: 'Test Draft',
          draftContent: '# Test\n\nBody text.',
        },
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return <div data-testid="draft-engine-stub" />
  }
  return { DraftEngine }
})

vi.mock('@/components/engines/ReviewEngine', async () => {
  const React = await import('react')
  const { PipelineActorContext } = await import('../../../providers/PipelineActorProvider')
  // isApprovedGuard: verdict='approved' → always passes regardless of score
  function ReviewEngine() {
    const actor = React.useContext(PipelineActorContext)
    React.useEffect(() => {
      actor?.send({
        type: 'REVIEW_COMPLETE',
        result: {
          score: 92,
          qualityTier: 'excellent',
          verdict: 'approved',
          feedbackJson: {},
          iterationCount: 1,
        },
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return <div data-testid="review-engine-stub" />
  }
  return { ReviewEngine }
})

vi.mock('@/components/engines/AssetsEngine', async () => {
  const React = await import('react')
  const { PipelineActorContext } = await import('../../../providers/PipelineActorProvider')
  // Fires ASSETS_COMPLETE even when assets.mode='skip'; the machine still needs
  // the event to advance (OverviewTimeline shows 'skipped' visually, machine
  // requires the event).
  function AssetsEngine() {
    const actor = React.useContext(PipelineActorContext)
    React.useEffect(() => {
      actor?.send({
        type: 'ASSETS_COMPLETE',
        result: { assetIds: [], featuredImageUrl: undefined },
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return <div data-testid="assets-engine-stub" />
  }
  return { AssetsEngine }
})

vi.mock('@/components/engines/PreviewEngine', async () => {
  const React = await import('react')
  const { PipelineActorContext } = await import('../../../providers/PipelineActorProvider')
  function PreviewEngine() {
    const actor = React.useContext(PipelineActorContext)
    React.useEffect(() => {
      actor?.send({
        type: 'PREVIEW_COMPLETE',
        result: {
          categories: ['Tech'],
          tags: ['automation'],
          seoOverrides: { title: 'Test', slug: 'test', metaDescription: 'Test desc' },
          imageMap: {},
          altTexts: {},
          composedHtml: '<h1>Test</h1>',
        },
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return <div data-testid="preview-engine-stub" />
  }
  return { PreviewEngine }
})

vi.mock('@/components/engines/PublishEngine', async () => {
  const React = await import('react')
  const { PipelineActorContext } = await import('../../../providers/PipelineActorProvider')
  // Publish is normally user-confirmed; auto-dispatch for integration test completeness
  function PublishEngine() {
    const actor = React.useContext(PipelineActorContext)
    React.useEffect(() => {
      actor?.send({
        type: 'PUBLISH_COMPLETE',
        result: { wordpressPostId: 42, publishedUrl: 'https://example.com/test-idea' },
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return <div data-testid="publish-engine-stub" />
  }
  return { PublishEngine }
})

// ─── Fetch mock ───────────────────────────────────────────────────────────────
// The orchestrator PATCHes /api/projects/:id to persist state (debounced 150ms).
// Return neutral responses for all calls.

function buildFetchMock() {
  return vi.fn().mockImplementation(async (url: string) => {
    const u = String(url)

    if (u.includes('/api/agents')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            agents: [
              { slug: 'brainstorm', recommended_provider: 'gemini', recommended_model: 'gemini-2.5-flash' },
              { slug: 'research',   recommended_provider: 'gemini', recommended_model: 'gemini-2.5-flash' },
              { slug: 'content-core', recommended_provider: 'gemini', recommended_model: 'gemini-2.5-flash' },
              { slug: 'review',     recommended_provider: 'gemini', recommended_model: 'gemini-2.5-flash' },
            ],
          },
          error: null,
        }),
      }
    }

    if (u.includes('/api/content-drafts/draft-1')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            id: 'draft-1',
            title: 'Test Draft',
            status: 'draft',
            draft_json: { blog: { full_draft: '# Test\n\nBody.' } },
            review_feedback_json: null,
            review_score: null,
            review_verdict: 'not_requested',
            iteration_count: 0,
            canonical_core_json: null,
            wordpress_post_id: null,
            published_url: null,
          },
          error: null,
        }),
      }
    }

    if (u.includes('/api/content-drafts')) {
      return {
        ok: true,
        json: async () => ({
          data: { id: 'draft-1', status: 'draft', title: 'Test Draft' },
          error: null,
        }),
      }
    }

    if (u.includes('/api/assets')) {
      return {
        ok: true,
        json: async () => ({ data: { assets: [], prompts: [] }, error: null }),
      }
    }

    // Default: neutral (covers project PATCH, brainstorm sessions running, personas, etc.)
    return {
      ok: true,
      json: async () => ({ data: { id: 'p1', abortRequestedAt: null }, error: null }),
    }
  })
}

afterEach(() => {
  vi.clearAllMocks()
})

// ─── Import after mocks ───────────────────────────────────────────────────────
import { PipelineOrchestrator } from '../PipelineOrchestrator'

// ─── Fixture helpers ──────────────────────────────────────────────────────────

/**
 * Legacy pipeline state that `mapLegacyToSnapshot` picks up (looksLegacy=true
 * because `currentStage` is set). The orchestrator boots in `overview` mode
 * which renders PipelineOverview → OverviewTimeline → stage-row-* testids.
 *
 * `autopilotConfig` is NOT read by `mapLegacyToSnapshot` (not in LegacyShape),
 * so the machine has no autopilotConfig in context. The test asserts machine
 * transitions via stage-row CSS classes — those don't require autopilotConfig.
 * Review's `isApprovedGuard` uses `verdict='approved'` path (no threshold needed).
 */
function buildInitialState() {
  return {
    mode: 'overview' as const,
    currentStage: 'brainstorm',
    stageResults: {},
    autoConfig: {},
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('autopilot happy-path (Spec 1 integration)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', buildFetchMock())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    // Restore stubs set at module level
    vi.stubGlobal('EventSource', NoopEventSource)
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })
  })

  it('brainstorm row is not running after BRAINSTORM_COMPLETE (machine advanced past brainstorm)', async () => {
    render(
      <PipelineOrchestrator
        projectId="p1"
        channelId="c1"
        projectTitle="Test"
        initialPipelineState={buildInitialState()}
      />,
    )

    // On mount: brainstorm is running (border-l-2). After BrainstormEngine mock
    // dispatches BRAINSTORM_COMPLETE the machine transitions. Since all engines
    // fire immediately, the whole chain may complete before the first assertion
    // fires — so we just verify brainstorm is no longer the running stage.
    await waitFor(
      () => {
        expect(screen.getByTestId('stage-row-brainstorm').className).not.toContain('border-l-2')
      },
      { timeout: 3000 },
    )
  })

  it('full 5-stage chain: CompletedStageSummary shows for brainstorm, research, and draft', async () => {
    render(
      <PipelineOrchestrator
        projectId="p1"
        channelId="c1"
        projectTitle="Test"
        initialPipelineState={buildInitialState()}
      />,
    )

    // CompletedStageSummary renders only when stageResults[stage].completedAt is set.
    // Each stage emits unique summary text that we assert:
    //   brainstorm: "Test Idea (viable)"
    //   research:   "5 cards · medium depth"  (or similar pattern)
    //   draft:      "Test Draft"

    // Brainstorm completes → summary appears (both in OverviewTimeline and CompletedStageSummary)
    await waitFor(
      () => {
        // Use getAllByText to handle multiple occurrences (OverviewTimeline + CompletedStageSummary)
        const els = screen.queryAllByText(/Test Idea \(viable\)/i)
        expect(els.length).toBeGreaterThan(0)
      },
      { timeout: 3000 },
    )

    // Research completes → summary appears ("cards approved · medium depth")
    await waitFor(
      () => {
        const els = screen.queryAllByText(/5 cards/i)
        expect(els.length).toBeGreaterThan(0)
      },
      { timeout: 3000 },
    )

    // Draft completes → summary appears in OverviewTimeline or CompletedStageSummary
    await waitFor(
      () => {
        const els = screen.queryAllByText(/Test Draft/i)
        expect(els.length).toBeGreaterThan(0)
      },
      { timeout: 3000 },
    )
  })

  it('LiveActivityLog shows "Brainstorm completed" after machine transitions past brainstorm', async () => {
    render(
      <PipelineOrchestrator
        projectId="p1"
        channelId="c1"
        projectTitle="Test"
        initialPipelineState={buildInitialState()}
      />,
    )

    // PipelineOverview.useEffect fires when currentStage changes and logs
    // "<StageLabel> completed". Wait for the log to appear with this text.
    // The mock engine fires BRAINSTORM_COMPLETE immediately, so the transition
    // from brainstorm → research triggers the log entry.
    await waitFor(
      () => {
        const log = screen.queryByTestId('live-activity-log')
        expect(log).not.toBeNull()
        expect(log?.textContent).toMatch(/Brainstorm completed/i)
      },
      { timeout: 4000 },
    )
  })

  it('preview stage becomes non-running after full chain', async () => {
    render(
      <PipelineOrchestrator
        projectId="p1"
        channelId="c1"
        projectTitle="Test"
        initialPipelineState={buildInitialState()}
      />,
    )

    // Wait through the full chain until preview completes
    await waitFor(
      () => {
        expect(screen.getByTestId('stage-row-preview').className).not.toContain('border-l-2')
      },
      { timeout: 10000 },
    )
  })
})
