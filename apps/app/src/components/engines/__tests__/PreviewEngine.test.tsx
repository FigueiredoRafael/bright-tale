import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StandaloneProjectContextProvider } from '@/components/pipeline/ProjectContextProvider'
import { PreviewEngine } from '../PreviewEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'
import type { AutopilotConfig } from '@brighttale/shared'

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/components/pipeline/PipelineAbortProvider', () => ({
  usePipelineAbort: () => null,
}))

vi.mock('@/hooks/use-auto-pilot-trigger', () => ({
  useAutoPilotTrigger: vi.fn(),
}))

const STUB_DRAFT = {
  id: 'draft-1',
  title: 'Stub Draft',
  draft_json: {
    blog: {
      full_draft: '## Section A\n\nBody A.\n\n## Section B\n\nBody B.',
      outline: [{ h2: 'Section A' }, { h2: 'Section B' }],
    },
  },
  review_feedback_json: {
    publication_plan: {
      blog: {
        categories: ['cat-1'],
        tags: ['tag-1'],
        final_seo: { title: 'SEO Title', slug: 'seo-slug', meta_description: 'SEO desc' },
      },
    },
  },
}

const STUB_ASSETS = [
  { id: 'asset-feat', source_url: 'https://x/f.jpg', webp_url: null, alt_text: 'feat alt', role: 'featured_image' },
  { id: 'asset-1',    source_url: 'https://x/1.jpg', webp_url: null, alt_text: 's1 alt',   role: 'body_section_1' },
  { id: 'asset-2',    source_url: 'https://x/2.jpg', webp_url: null, alt_text: 's2 alt',   role: 'body_section_2' },
]

const STUB_AUTOPILOT_CONFIG_PREVIEW_ENABLED: AutopilotConfig = {
  defaultProvider: 'recommended',
  brainstorm: null,
  research: null,
  canonicalCore: { providerOverride: null, personaId: null },
  draft: { providerOverride: null, format: 'blog', wordCount: 1000 },
  review: { providerOverride: null, maxIterations: 3, autoApproveThreshold: 90, hardFailThreshold: 50 },
  assets: { providerOverride: null, mode: 'briefs_only' },
  preview: { enabled: true },
  publish: { status: 'draft' },
}

const STUB_AUTOPILOT_CONFIG_PREVIEW_DISABLED: AutopilotConfig = {
  ...STUB_AUTOPILOT_CONFIG_PREVIEW_ENABLED,
  preview: { enabled: false },
}

// All upstream stage results for a preview-ready pipeline
const PREVIEW_STAGE_RESULTS = {
  brainstorm: { ideaId: 'idea-1', ideaTitle: 'Idea T', ideaVerdict: 'viable', ideaCoreTension: 'tension', completedAt: new Date().toISOString() },
  research:   { researchSessionId: 'rs-1', approvedCardsCount: 3, researchLevel: 'medium', completedAt: new Date().toISOString() },
  draft:      { draftId: 'draft-1', draftTitle: 'Stub Draft', draftContent: '', completedAt: new Date().toISOString() },
  review:     { score: 92, verdict: 'approved', feedbackJson: STUB_DRAFT.review_feedback_json, iterationCount: 1, completedAt: new Date().toISOString() },
  assets:     { assetIds: ['asset-feat', 'asset-1', 'asset-2'], featuredImageUrl: 'https://x/f.jpg', completedAt: new Date().toISOString() },
}

function mountAtPreviewStage(opts?: {
  autopilotConfig?: AutopilotConfig | null
  mode?: 'step-by-step' | 'overview' | 'supervised' | null
  onStageComplete?: (stage: string, result: Record<string, unknown>) => void
}) {
  return render(
    <StandaloneProjectContextProvider
      projectId="proj-1"
      channelId="ch-1"
      mode={opts?.mode ?? null}
      autopilotConfig={opts?.autopilotConfig ?? null}
      initialStageResults={PREVIEW_STAGE_RESULTS}
      onStageComplete={opts?.onStageComplete}
      pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
      creditSettings={DEFAULT_CREDIT_SETTINGS}
    >
      <PreviewEngine />
    </StandaloneProjectContextProvider>,
  )
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/api/content-drafts/draft-1')) {
        return { ok: true, json: async () => ({ data: STUB_DRAFT, error: null }) } as Response
      }
      if (String(url).includes('/api/assets?content_id=draft-1')) {
        return { ok: true, json: async () => ({ data: { assets: STUB_ASSETS }, error: null }) } as Response
      }
      return { ok: true, json: async () => ({ data: null, error: null }) } as Response
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PreviewEngine', () => {
  it('reads draftId from context and loads draft + assets without legacy props', async () => {
    mountAtPreviewStage()
    // Loader visible first, then the approve button after fetches resolve.
    await screen.findByRole('button', { name: /approve.*publish/i })
  })

  it('dispatches PREVIEW_COMPLETE with PreviewResult shape on approve', async () => {
    const user = userEvent.setup()
    const completedStages: Array<{ stage: string; result: Record<string, unknown> }> = []

    mountAtPreviewStage({
      onStageComplete: (stage, result) => completedStages.push({ stage, result }),
    })

    const approveBtn = await screen.findByRole('button', { name: /approve.*publish/i })
    await user.click(approveBtn)

    await waitFor(() => {
      const previewComplete = completedStages.find((e) => e.stage === 'preview')
      expect(previewComplete).toBeDefined()
      const result = previewComplete!.result as {
        imageMap?: Record<string, string>
        categories?: string[]
        tags?: string[]
        seoOverrides?: Record<string, string>
      }
      expect(result.imageMap).toMatchObject({
        featured_image: 'asset-feat',
        body_section_1: 'asset-1',
        body_section_2: 'asset-2',
      })
      expect(result.categories).toEqual(['cat-1'])
      expect(result.tags).toEqual(['tag-1'])
      expect(result.seoOverrides).toEqual({ title: 'SEO Title', slug: 'seo-slug', metaDescription: 'SEO desc' })
    })
  })

  it('renders a Back button in the action bar when preview is loaded', async () => {
    // In context mode navigate() is a no-op (orchestrator reads server state).
    // We verify the Back button is present and clickable without crashing.
    const user = userEvent.setup()
    mountAtPreviewStage()
    await screen.findByRole('button', { name: /approve.*publish/i })

    const backBtn = screen.getByRole('button', { name: /^back$/i })
    // Clicking should not throw or cause infinite re-renders
    await expect(user.click(backBtn)).resolves.not.toThrow()
    // Approve button is still there (navigate is a no-op in context mode)
    expect(screen.getByRole('button', { name: /approve.*publish/i })).toBeInTheDocument()
  })

  it('preview.enabled=false in overview mode → auto-derives + fires stage complete without user interaction', async () => {
    const completedStages: Array<{ stage: string; result: Record<string, unknown> }> = []

    mountAtPreviewStage({
      mode: 'overview',
      autopilotConfig: STUB_AUTOPILOT_CONFIG_PREVIEW_DISABLED,
      onStageComplete: (stage, result) => completedStages.push({ stage, result }),
    })

    // After fetch resolves the load effect sets busy=false; the auto-derive effect
    // then fires signalStageComplete, calling onStageComplete with the preview result.
    await waitFor(() => {
      const previewComplete = completedStages.find((e) => e.stage === 'preview')
      expect(previewComplete).toBeDefined()
      const result = previewComplete!.result as { autoDerived?: boolean }
      expect(result.autoDerived).toBe(true)
    }, { timeout: 5000 })
  })

  it('preview.enabled=true in overview mode → does not auto-complete (gate triggered)', async () => {
    const completedStages: Array<{ stage: string; result: Record<string, unknown> }> = []

    mountAtPreviewStage({
      mode: 'overview',
      autopilotConfig: STUB_AUTOPILOT_CONFIG_PREVIEW_ENABLED,
      onStageComplete: (stage, result) => completedStages.push({ stage, result }),
    })

    // Wait long enough for any auto-complete to have fired (it shouldn't)
    await new Promise((r) => setTimeout(r, 200))

    // PREVIEW_COMPLETE must NOT have fired — gate is triggered, user must approve
    const previewComplete = completedStages.find((e) => e.stage === 'preview')
    expect(previewComplete).toBeUndefined()
  })

})

// ---- issue #214 — video routing + read-only layout ----

const STUB_VIDEO_DRAFT = {
  id: 'video-draft-1',
  title: 'The China Copycat Trap',
  draft_json: {
    video_title: 'The China Copycat Trap: Why Most Founders Steal the Wrong Lesson',
    video_description: `Copying China sounds easy. It rarely is.\n\nIn this video we unpack the part of the China story founders usually skip.`,
    pinned_comment: 'Sources and links: brightcurios.com/china — drop questions below.',
    tags: ['china business', 'entrepreneurship', 'startup lessons'],
    lower_thirds: [
      { at: '0:42', label: 'The setup: copying was real' },
      { at: '2:30', label: 'The hidden engine' },
      { at: '4:15', label: 'What to steal instead' },
    ],
    script: {
      hook: { content: 'China did not win just because it copied.' },
      problem: { content: 'A lot of founders hear one simplified idea.' },
      chapters: [
        {
          title: 'Yes, Copying Was Part of the Story',
          content: 'Let\'s start with the part people usually oversimplify.',
          duration: '1:48',
        },
        {
          title: 'The Hidden Engine Nobody Imports',
          content: 'Here\'s the part the copy-paste reading skips.',
          duration: '1:45',
        },
      ],
      outro: { cta: 'Subscribe for the weekly small-business teardown.' },
    },
  },
  review_feedback_json: null,
}

const VIDEO_STAGE_RESULTS = {
  brainstorm: { ideaId: 'idea-2', ideaTitle: 'China Trap', ideaVerdict: 'viable', ideaCoreTension: 'copy vs build', completedAt: new Date().toISOString() },
  research:   { researchSessionId: 'rs-2', approvedCardsCount: 2, researchLevel: 'medium', completedAt: new Date().toISOString() },
  draft:      { draftId: 'video-draft-1', draftTitle: 'The China Copycat Trap', draftContent: '', completedAt: new Date().toISOString() },
  review:     { score: 91, verdict: 'approved', feedbackJson: {} as Record<string, unknown>, iterationCount: 1, completedAt: new Date().toISOString() },
  assets:     { assetIds: [], featuredImageUrl: undefined, completedAt: new Date().toISOString() },
}

function mountVideoPreview(opts?: {
  onStageComplete?: (stage: string, result: Record<string, unknown>) => void
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/api/content-drafts/video-draft-1')) {
        return { ok: true, json: async () => ({ data: STUB_VIDEO_DRAFT, error: null }) } as Response
      }
      if (String(url).includes('/api/assets?content_id=video-draft-1')) {
        return { ok: true, json: async () => ({ data: { assets: [] }, error: null }) } as Response
      }
      return { ok: true, json: async () => ({ data: null, error: null }) } as Response
    }),
  )

  return render(
    <StandaloneProjectContextProvider
      projectId="proj-2"
      channelId="ch-2"
      mode={null}
      autopilotConfig={null}
      initialStageResults={VIDEO_STAGE_RESULTS}
      onStageComplete={opts?.onStageComplete}
      pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
      creditSettings={DEFAULT_CREDIT_SETTINGS}
    >
      <PreviewEngine trackMedium="video" />
    </StandaloneProjectContextProvider>,
  )
}

describe('PreviewEngine — issue #214: video routing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders inventory pills strip when trackMedium=video', async () => {
    mountVideoPreview()
    // Inventory pills should appear — not the blog HTML preview
    await screen.findByTestId('preview-video-inventory')
  })

  it('renders viewer-style card with video title when trackMedium=video', async () => {
    mountVideoPreview()
    const viewerCard = await screen.findByTestId('preview-video-viewer-card')
    // Multiple elements may contain the title (ContextBanner + card) — scope to viewer card
    expect(viewerCard.textContent).toMatch(/China Copycat Trap/i)
  })

  it('renders teleprompter with chapter titles when trackMedium=video', async () => {
    mountVideoPreview()
    await screen.findByTestId('preview-video-teleprompter')
    await screen.findByText(/Yes, Copying Was Part of the Story/i)
    await screen.findByText(/Hidden Engine Nobody Imports/i)
  })

  it('teleprompter renders lower-third cues beside chapter headings', async () => {
    mountVideoPreview()
    await screen.findByTestId('preview-video-teleprompter')
    // The prototype uses lowerThirds[i+1] for chapter i, so:
    // chapter 0 gets lower_thirds[1] → 'The hidden engine'
    // chapter 1 gets lower_thirds[2] → 'What to steal instead'
    // Lower-third cues are rendered in <span> with font-mono class.
    // Use getAllByText because chapter titles may contain similar text.
    const cueElements = await screen.findAllByText(/The hidden engine/i)
    expect(cueElements.length).toBeGreaterThan(0)
    await screen.findByText(/What to steal instead/i)
  })

  it('inventory pills show missing affordance when pinned_comment absent from draft_json', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (String(url).includes('/api/content-drafts/video-draft-1')) {
          const draftWithoutComment = {
            ...STUB_VIDEO_DRAFT,
            draft_json: { ...STUB_VIDEO_DRAFT.draft_json, pinned_comment: undefined },
          }
          return { ok: true, json: async () => ({ data: draftWithoutComment, error: null }) } as Response
        }
        return { ok: true, json: async () => ({ data: { assets: [] }, error: null }) } as Response
      }),
    )
    render(
      <StandaloneProjectContextProvider
        projectId="proj-2"
        channelId="ch-2"
        mode={null}
        autopilotConfig={null}
        initialStageResults={VIDEO_STAGE_RESULTS}
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
      >
        <PreviewEngine trackMedium="video" />
      </StandaloneProjectContextProvider>,
    )
    await screen.findByTestId('preview-video-inventory')
    // The pinned comment pill should show "missing" affordance
    const missingPills = screen.getAllByTestId('inventory-pill-missing')
    expect(missingPills.length).toBeGreaterThan(0)
  })

  it('no mutation fetch calls fire from the video preview surface', async () => {
    const fetchCalls: Array<{ url: string; method: string }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        fetchCalls.push({ url: String(url), method: init?.method ?? 'GET' })
        if (String(url).includes('/api/content-drafts/video-draft-1')) {
          return { ok: true, json: async () => ({ data: STUB_VIDEO_DRAFT, error: null }) } as Response
        }
        return { ok: true, json: async () => ({ data: { assets: [] }, error: null }) } as Response
      }),
    )
    render(
      <StandaloneProjectContextProvider
        projectId="proj-2"
        channelId="ch-2"
        mode={null}
        autopilotConfig={null}
        initialStageResults={VIDEO_STAGE_RESULTS}
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
      >
        <PreviewEngine trackMedium="video" />
      </StandaloneProjectContextProvider>,
    )
    await screen.findByTestId('preview-video-inventory')
    // Wait a tick to let any stray effects fire
    await waitFor(() => expect(fetchCalls.length).toBeGreaterThan(0))
    const mutating = fetchCalls.filter((c) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.method.toUpperCase()))
    expect(mutating).toHaveLength(0)
  })

  it('CTA "Approve bundle → Publish" fires stage complete + advances to publish', async () => {
    const user = userEvent.setup()
    const completed: Array<{ stage: string }> = []
    mountVideoPreview({ onStageComplete: (stage) => completed.push({ stage }) })

    const cta = await screen.findByTestId('preview-video-cta')
    await user.click(cta)

    await waitFor(() => {
      expect(completed.some((e) => e.stage === 'preview')).toBe(true)
    })
  })

  it('blog flow unchanged when trackMedium is absent', async () => {
    // Mounting without trackMedium — should render the existing blog preview (Live Preview card)
    mountAtPreviewStage()
    // Blog path renders the approve button (no video testids)
    await screen.findByRole('button', { name: /approve.*publish/i })
    expect(screen.queryByTestId('preview-video-inventory')).toBeNull()
  })
})

// ---- issue #210 / Slice 4 — per-track draftId routing ----

describe('PreviewEngine — issue #210: per-track draftId', () => {
  it('loads the draft from the per-track draftId (not the flat shape)', async () => {
    const seenUrls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        seenUrls.push(String(url))
        const u = String(url)
        if (u.match(/\/api\/content-drafts\/[^/?]+$/)) {
          return { ok: true, json: async () => ({ data: STUB_DRAFT, error: null }) } as Response
        }
        return { ok: true, json: async () => ({ data: [], error: null }) } as Response
      }),
    )

    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="step-by-step"
        autopilotConfig={null}
        initialStageResults={{
          ...PREVIEW_STAGE_RESULTS,
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
        <PreviewEngine trackId="t-blog" />
      </StandaloneProjectContextProvider>,
    )

    await waitFor(() => {
      expect(seenUrls.some((u) => u.includes('/api/content-drafts/blog-track-id'))).toBe(true)
    })
    expect(seenUrls.some((u) => u.includes('/api/content-drafts/wrong-flat-id'))).toBe(false)
  })
})

