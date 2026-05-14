import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createActor } from 'xstate'
import React from 'react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { PublishEngine } from '../PublishEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'
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
  assets: { providerOverride: null, mode: 'briefs_only', imageScope: 'all' as const },
  preview: { enabled: false },
  publish: { status: 'draft' },
}

function mountAtPublishStage(opts: { withPreviewResult?: boolean } = { withPreviewResult: true }) {
  capturedBodies.length = 0
  lastOnComplete = null

  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'proj-1',
      channelId: 'ch-1',
      projectTitle: 'T',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
      creditSettings: DEFAULT_CREDIT_SETTINGS,
      initialStageResults: {
        brainstorm: { ideaId: 'idea-1', ideaTitle: 'Idea T', ideaVerdict: 'viable', ideaCoreTension: 'tension', completedAt: new Date().toISOString() },
        research:   { researchSessionId: 'rs-1', approvedCardsCount: 3, researchLevel: 'medium', completedAt: new Date().toISOString() },
        draft:      { draftId: 'draft-1', draftTitle: 'Stub Draft', draftContent: '', personaWpAuthorId: 42, completedAt: new Date().toISOString() },
        review:     { score: 92, verdict: 'approved', feedbackJson: {}, iterationCount: 1, completedAt: new Date().toISOString() },
        assets:     { assetIds: ['a-1', 'a-2'], featuredImageUrl: 'https://x/f.jpg', completedAt: new Date().toISOString() },
        preview:    opts.withPreviewResult ? {
          imageMap: { featured_image: 'a-1', body_section_1: 'a-2' },
          altTexts: { 'a-1': 'feat alt', 'a-2': 's1 alt' },
          categories: ['cat-1'],
          tags: ['tag-1'],
          seoOverrides: { title: 'SEO T', slug: 'seo-slug', metaDescription: 'desc' },
          suggestedPublishDate: '2026-05-01T10:00',
          composedHtml: '<p>x</p>',
          completedAt: new Date().toISOString(),
        } : undefined,
      },
    },
  }).start()

  // Navigate to publish state
  actor.send({ type: 'NAVIGATE', toStage: 'publish' })

  const utils = render(
    <PipelineActorProvider value={actor}>
      <PublishEngine draft={STUB_DRAFT} />
    </PipelineActorProvider>,
  )
  return { actor, ...utils }
}

function mountAtPublishStageWithConfig(publishStatus: 'draft' | 'published') {
  capturedBodies.length = 0
  lastOnComplete = null

  const config: AutopilotConfig = {
    ...BASE_AUTOPILOT,
    publish: { status: publishStatus },
  }

  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'proj-1',
      channelId: 'ch-1',
      projectTitle: 'T',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
      creditSettings: DEFAULT_CREDIT_SETTINGS,
      initialStageResults: {
        draft: { draftId: 'draft-1', draftTitle: 'Stub Draft', draftContent: '', completedAt: new Date().toISOString() },
      },
    },
  }).start()

  actor.send({
    type: 'SETUP_COMPLETE',
    mode: 'overview',
    autopilotConfig: config,
    templateId: null,
    startStage: 'publish',
  })

  actor.send({ type: 'NAVIGATE', toStage: 'publish' })

  const utils = render(
    <PipelineActorProvider value={actor}>
      <PublishEngine draft={STUB_DRAFT} />
    </PipelineActorProvider>,
  )
  return { actor, ...utils }
}

beforeEach(() => {
  capturedBodies.length = 0
  lastOnComplete = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PublishEngine', () => {
  it('reads draftStatus + hasAssets from actor and surfaces preview data to the panel', () => {
    mountAtPublishStage()
    expect(screen.getByTestId('draft-status').textContent).toBe('reviewed')
    expect(screen.getByTestId('has-assets').textContent).toBe('true')
    expect(screen.getByTestId('has-preview-data').textContent).toBe('true')
  })

  it('publish body contains preview-stage overrides and persona author ID', async () => {
    const user = userEvent.setup()
    mountAtPublishStage()

    await user.click(screen.getByRole('button', { name: /publish now/i }))

    // `await user.click(...)` already flushes React renders; the PublishProgress
    // mock captures `publishBody` synchronously during render. Match
    // BrainstormEngine.test.tsx convention — no `waitFor` wrapper.
    expect(capturedBodies.length).toBe(1)
    const body = capturedBodies[0]!
    expect(body.draftId).toBe('draft-1')
    expect(body.channelId).toBe('ch-1')
    expect(body.imageMap).toMatchObject({ featured_image: 'a-1' })
    expect(body.altTexts).toMatchObject({ 'a-1': 'feat alt' })
    expect(body.categories).toEqual(['cat-1'])
    expect(body.tags).toEqual(['tag-1'])
    expect(body.seoOverrides).toEqual({ title: 'SEO T', slug: 'seo-slug', metaDescription: 'desc' })
    expect(body.authorId).toBe(42)
  })

  it('dispatches PUBLISH_COMPLETE when stream completes', async () => {
    const user = userEvent.setup()
    const { actor } = mountAtPublishStage()

    await user.click(screen.getByRole('button', { name: /publish now/i }))
    expect(lastOnComplete).not.toBeNull()
    lastOnComplete!({ wordpressPostId: 999, publishedUrl: 'https://wp/example' })

    // `actor.send(...)` inside lastOnComplete is synchronous (XState v5 `assign`).
    const publish = actor.getSnapshot().context.stageResults.publish
    expect(publish).toBeDefined()
    expect(publish!.wordpressPostId).toBe(999)
    expect(publish!.publishedUrl).toBe('https://wp/example')
  })

  it('hasAssets is false when assetIds is empty', () => {
    const actor = createActor(pipelineMachine, {
      input: {
        projectId: 'p',
        channelId: 'c',
        projectTitle: 'T',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
        creditSettings: DEFAULT_CREDIT_SETTINGS,
        initialStageResults: {
          draft:  { draftId: 'd', draftTitle: 't', draftContent: '', completedAt: new Date().toISOString() },
          assets: { assetIds: [], completedAt: new Date().toISOString() },
        },
      },
    }).start()
    render(
      <PipelineActorProvider value={actor}>
        <PublishEngine draft={STUB_DRAFT} />
      </PipelineActorProvider>,
    )
    expect(screen.getByTestId('has-assets').textContent).toBe('false')
  })

  it("publish.status='draft' → POST body has wpStatus='draft'", async () => {
    mountAtPublishStageWithConfig('draft')

    await waitFor(() => {
      expect(capturedBodies.length).toBe(1)
    })
    expect(capturedBodies[0]!.wpStatus).toBe('draft')
  })

  it("publish.status='published' → POST body has wpStatus='publish'", async () => {
    mountAtPublishStageWithConfig('published')

    await waitFor(() => {
      expect(capturedBodies.length).toBe(1)
    })
    expect(capturedBodies[0]!.wpStatus).toBe('publish')
  })

  it('auto-fires publish in overview mode without manual click', async () => {
    mountAtPublishStageWithConfig('draft')

    await waitFor(() => {
      expect(capturedBodies.length).toBe(1)
    })
    expect(capturedBodies[0]!.wpStatus).toBe('draft')
  })

  it('auto-fires publish in supervised mode using configured wpStatus', async () => {
    capturedBodies.length = 0
    lastOnComplete = null

    const config: AutopilotConfig = { ...BASE_AUTOPILOT, publish: { status: 'published' } }
    const actor = createActor(pipelineMachine, {
      input: {
        projectId: 'p',
        channelId: 'c',
        projectTitle: 'T',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
        creditSettings: DEFAULT_CREDIT_SETTINGS,
        initialStageResults: {
          draft: { draftId: 'draft-1', draftTitle: 'Stub', draftContent: '', completedAt: new Date().toISOString() },
        },
      },
    }).start()

    actor.send({ type: 'SETUP_COMPLETE', mode: 'supervised', autopilotConfig: config, templateId: null, startStage: 'publish' })
    actor.send({ type: 'NAVIGATE', toStage: 'publish' })

    render(
      <PipelineActorProvider value={actor}>
        <PublishEngine draft={STUB_DRAFT} />
      </PipelineActorProvider>,
    )

    await waitFor(() => {
      expect(capturedBodies.length).toBe(1)
    })
    expect(capturedBodies[0]!.wpStatus).toBe('publish')
  })

  it('does NOT auto-fire in step-by-step mode', async () => {
    capturedBodies.length = 0
    lastOnComplete = null

    const actor = createActor(pipelineMachine, {
      input: {
        projectId: 'p',
        channelId: 'c',
        projectTitle: 'T',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
        creditSettings: DEFAULT_CREDIT_SETTINGS,
        initialStageResults: {
          draft: { draftId: 'draft-1', draftTitle: 'Stub', draftContent: '', completedAt: new Date().toISOString() },
        },
      },
    }).start()

    actor.send({ type: 'SETUP_COMPLETE', mode: 'step-by-step', autopilotConfig: null, templateId: null, startStage: 'publish' })
    actor.send({ type: 'NAVIGATE', toStage: 'publish' })

    render(
      <PipelineActorProvider value={actor}>
        <PublishEngine draft={STUB_DRAFT} />
      </PipelineActorProvider>,
    )

    await new Promise(r => setTimeout(r, 50))
    expect(capturedBodies.length).toBe(0)
  })

  it('does NOT auto-fire when already published', async () => {
    capturedBodies.length = 0
    lastOnComplete = null

    const config: AutopilotConfig = { ...BASE_AUTOPILOT, publish: { status: 'draft' } }
    const actor = createActor(pipelineMachine, {
      input: {
        projectId: 'p',
        channelId: 'c',
        projectTitle: 'T',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
        creditSettings: DEFAULT_CREDIT_SETTINGS,
        initialStageResults: {
          draft: { draftId: 'draft-1', draftTitle: 'Stub', draftContent: '', completedAt: new Date().toISOString() },
        },
      },
    }).start()

    actor.send({ type: 'SETUP_COMPLETE', mode: 'overview', autopilotConfig: config, templateId: null, startStage: 'publish' })
    actor.send({ type: 'NAVIGATE', toStage: 'publish' })

    const publishedDraft = { ...STUB_DRAFT, published_url: 'https://wp.example/post-1', wordpress_post_id: 42 }
    render(
      <PipelineActorProvider value={actor}>
        <PublishEngine draft={publishedDraft} />
      </PipelineActorProvider>,
    )

    await new Promise(r => setTimeout(r, 50))
    expect(capturedBodies.length).toBe(0)
  })

  it('does NOT auto-fire when paused', async () => {
    capturedBodies.length = 0
    lastOnComplete = null

    const config: AutopilotConfig = { ...BASE_AUTOPILOT, publish: { status: 'draft' } }
    const actor = createActor(pipelineMachine, {
      input: {
        projectId: 'p',
        channelId: 'c',
        projectTitle: 'T',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
        creditSettings: DEFAULT_CREDIT_SETTINGS,
        initialStageResults: {
          draft: { draftId: 'draft-1', draftTitle: 'Stub', draftContent: '', completedAt: new Date().toISOString() },
        },
      },
    }).start()

    actor.send({ type: 'SETUP_COMPLETE', mode: 'overview', autopilotConfig: config, templateId: null, startStage: 'publish' })
    actor.send({ type: 'NAVIGATE', toStage: 'publish' })
    actor.send({ type: 'PAUSE' })

    render(
      <PipelineActorProvider value={actor}>
        <PublishEngine draft={STUB_DRAFT} />
      </PipelineActorProvider>,
    )

    await new Promise(r => setTimeout(r, 50))
    expect(capturedBodies.length).toBe(0)
  })
})
