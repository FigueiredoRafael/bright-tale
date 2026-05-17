import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createActor } from 'xstate'
import React from 'react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { StandaloneProjectContextProvider } from '@/components/pipeline/ProjectContextProvider'
import { PreviewEngine } from '../PreviewEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'
import type { AutopilotConfig } from '@brighttale/shared'
import type { StageRun } from '@brighttale/shared/pipeline/inputs'

const mockWriteStageRunOutcome = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/api/stageRuns', () => ({
  get writeStageRunOutcome() {
    return mockWriteStageRunOutcome
  },
}))

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

  it('machine accepts STAGE_PROGRESS with status=Composing preview for preview stage', () => {
    // Verifies the machine wiring for the STAGE_PROGRESS dispatch that
    // PreviewEngine fires on the auto-derive path (preview.enabled=false).
    const actor = createActor(pipelineMachine, {
      input: {
        projectId: 'proj-1',
        channelId: 'ch-1',
        projectTitle: 'T',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
        creditSettings: DEFAULT_CREDIT_SETTINGS,
      },
    }).start()
    actor.send({ type: 'NAVIGATE', toStage: 'preview' })
    actor.send({ type: 'STAGE_PROGRESS', stage: 'preview', partial: { status: 'Composing preview' } })

    const partial = actor.getSnapshot().context.stageResults.preview as { status?: string } | undefined
    expect(partial?.status).toBe('Composing preview')
  })

  it('machine accepts STAGE_PROGRESS with status=Awaiting your review for preview stage', () => {
    // Verifies the machine wiring for the STAGE_PROGRESS dispatch that
    // PreviewEngine fires on the gate path (preview.enabled=true).
    const actor = createActor(pipelineMachine, {
      input: {
        projectId: 'proj-1',
        channelId: 'ch-1',
        projectTitle: 'T',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
        creditSettings: DEFAULT_CREDIT_SETTINGS,
      },
    }).start()
    actor.send({ type: 'NAVIGATE', toStage: 'preview' })
    actor.send({ type: 'STAGE_PROGRESS', stage: 'preview', partial: { status: 'Awaiting your review' } })

    const partial = actor.getSnapshot().context.stageResults.preview as { status?: string } | undefined
    expect(partial?.status).toBe('Awaiting your review')
  })
})

describe('PreviewEngine — stageRun binding (T3.5)', () => {
  const stageRun: StageRun = {
    id: 'sr-preview-1',
    projectId: 'proj-1',
    stage: 'preview',
    status: 'queued',
    attemptNo: 1,
    awaitingReason: null,
    payloadRef: null,
    inputJson: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  beforeEach(() => {
    mockWriteStageRunOutcome.mockClear()
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

  it('writes outcome via stage-run-writer when stageRun prop is provided and user approves', async () => {
    const user = userEvent.setup()

    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode={null}
        autopilotConfig={null}
        initialStageResults={PREVIEW_STAGE_RESULTS}
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
      >
        <PreviewEngine stageRun={stageRun} />
      </StandaloneProjectContextProvider>,
    )

    const approveBtn = await screen.findByRole('button', { name: /approve.*publish/i })
    await user.click(approveBtn)

    await waitFor(() => {
      expect(mockWriteStageRunOutcome).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          stageRunId: 'sr-preview-1',
          outcome: expect.objectContaining({ imageMap: expect.any(Object) }),
        }),
      )
    })
  })
})
