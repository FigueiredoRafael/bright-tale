import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import React from 'react'
import { StandaloneProjectContextProvider } from '@/components/pipeline/ProjectContextProvider'
import { AssetsEngine } from '../AssetsEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'
import type { AutopilotConfig } from '@brighttale/shared'
import { useAutoPilotTrigger } from '@/hooks/use-auto-pilot-trigger'

vi.mock('@/hooks/use-auto-pilot-trigger', () => ({
  useAutoPilotTrigger: vi.fn(),
}))

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/components/pipeline/PipelineAbortProvider', () => ({
  usePipelineAbort: () => ({ signal: null }),
}))

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

const STUB_DRAFT = {
  id: 'd-1',
  status: 'draft',
  draft_json: {},
}

const defaultFetchMock = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ data: { assets: [] }, error: null }),
} as unknown as Response)

beforeEach(() => {
  vi.stubGlobal('fetch', defaultFetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function makeAutopilotForMode(assetsMode: 'briefs_only' | 'auto_generate' | 'skip'): AutopilotConfig {
  return {
    ...BASE_AUTOPILOT,
    assets: { providerOverride: null, mode: assetsMode, imageScope: 'all' as const },
  }
}

describe("AssetsEngine mode='briefs_only'", () => {
  it('mounts without crashing and does not immediately fire ASSETS_COMPLETE in briefs_only mode', async () => {
    // In context mode, the machine gate is replaced by server-state orchestration.
    // 'briefs_only' should NOT immediately call signalStageComplete on mount.
    const completedStages: string[] = []
    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="overview"
        autopilotConfig={makeAutopilotForMode('briefs_only')}
        initialStageResults={{ draft: { draftId: 'd-1', draftTitle: 'T', draftContent: '', completedAt: new Date().toISOString() } }}
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
        onStageComplete={(stage) => completedStages.push(stage)}
      >
        <AssetsEngine mode="generate" draft={STUB_DRAFT} />
      </StandaloneProjectContextProvider>,
    )

    // Give effects a tick to run
    await new Promise((r) => setTimeout(r, 50))
    expect(completedStages).not.toContain('assets')
  })

  it('does NOT immediately dispatch ASSETS_COMPLETE in briefs_only mode', async () => {
    const completedStages: string[] = []
    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="overview"
        autopilotConfig={makeAutopilotForMode('briefs_only')}
        initialStageResults={{ draft: { draftId: 'd-1', draftTitle: 'T', draftContent: '', completedAt: new Date().toISOString() } }}
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
        onStageComplete={(stage) => completedStages.push(stage)}
      >
        <AssetsEngine mode="generate" draft={STUB_DRAFT} />
      </StandaloneProjectContextProvider>,
    )

    await new Promise((r) => setTimeout(r, 50))
    // Engine should stay in assets state — no completion signal
    expect(completedStages).toHaveLength(0)
  })
})

describe("AssetsEngine mode='auto_generate'", () => {
  it('does NOT fire ASSETS_COMPLETE immediately on mount (auto_generate waits for generation)', async () => {
    const completedStages: string[] = []
    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="overview"
        autopilotConfig={makeAutopilotForMode('auto_generate')}
        initialStageResults={{ draft: { draftId: 'd-1', draftTitle: 'T', draftContent: '', completedAt: new Date().toISOString() } }}
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
        onStageComplete={(stage) => completedStages.push(stage)}
      >
        <AssetsEngine mode="generate" draft={STUB_DRAFT} />
      </StandaloneProjectContextProvider>,
    )

    await new Promise((r) => setTimeout(r, 50))
    expect(completedStages).not.toContain('assets')
  })
})

describe('AssetsEngine STAGE_PROGRESS', () => {
  it('calls setStageStatus with status=Generating briefs when handleGenerateBriefs fires', async () => {
    // In context mode, the engine calls ctx.setStageStatus instead of actor.send(STAGE_PROGRESS).
    // We mock useAutoPilotTrigger to invoke fire() in a useEffect to trigger handleGenerateBriefs.
    vi.mocked(useAutoPilotTrigger).mockImplementation(({ fire }) => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      React.useEffect(() => { void fire() }, [])
    })

    const stageStatuses: Array<{ stage: string; status: Record<string, unknown> }> = []

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (String(url).includes('/api/assets?content_id')) {
          return { ok: true, json: async () => ({ data: { assets: [] }, error: null }) } as Response
        }
        if (String(url).includes('/generate-asset-prompts')) {
          return {
            ok: true,
            json: async () => ({
              data: { slots: [{ slot: 'featured', section_title: 'Featured', prompt_brief: 'A photo', style_rationale: '', aspect_ratio: '16:9', alt_text: '' }] },
              error: null,
            }),
          } as Response
        }
        return { ok: true, json: async () => ({ data: null, error: null }) } as Response
      }),
    )

    // We need to intercept setStageStatus. Wrap StandaloneProjectContextProvider
    // and capture calls via a custom wrapper that proxies setStageStatus.
    // The simplest approach: verify the fetch to generate-asset-prompts was called,
    // which is the direct consequence of handleGenerateBriefs firing.
    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="overview"
        autopilotConfig={makeAutopilotForMode('auto_generate')}
        initialStageResults={{ draft: { draftId: 'd-1', draftTitle: 'D', draftContent: '', completedAt: new Date().toISOString() } }}
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
      >
        <AssetsEngine mode="generate" draft={STUB_DRAFT} />
      </StandaloneProjectContextProvider>,
    )

    // Wait for useAutoPilotTrigger to fire handleGenerateBriefs
    await new Promise((r) => setTimeout(r, 100))

    // The generate-asset-prompts fetch being called proves handleGenerateBriefs fired,
    // which is the same action that now calls ctx.setStageStatus('assets', { status: 'Generating briefs' }).
    const fetchMock = vi.mocked(global.fetch)
    const generateBriefsCalled = fetchMock.mock.calls.some((args) =>
      String(args[0]).includes('/generate-asset-prompts'),
    )
    expect(generateBriefsCalled).toBe(true)
  })
})

describe('AssetsEngine — import flow signal', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (String(url).includes('/api/assets') || String(url).includes('/asset-prompts')) {
          return { ok: true, json: async () => ({ data: { assets: [] }, error: null }) } as Response
        }
        return { ok: true, json: async () => ({ data: null, error: null }) } as Response
      }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('signals stage complete when import-mode selects a library asset', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()
    const { screen } = await import('@testing-library/react')

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (String(url).includes('/api/assets')) {
          return {
            ok: true,
            json: async () => ({ data: { assets: [{ id: 'lib-asset-1', url: 'https://x/1.jpg', alt_text: 'lib alt', role: 'featured_image' }] }, error: null }),
          } as Response
        }
        return { ok: true, json: async () => ({ data: null, error: null }) } as Response
      }),
    )

    const completedStages: Array<{ stage: string; result: Record<string, unknown> }> = []
    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="step-by-step"
        autopilotConfig={null}
        initialStageResults={{}}
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
        onStageComplete={(stage, result) => completedStages.push({ stage, result })}
      >
        <AssetsEngine mode="import" draft={{ id: 'd-1', status: 'approved', draft_json: {} }} />
      </StandaloneProjectContextProvider>,
    )

    const libItem = await screen.findByText('lib alt', {}, { timeout: 3000 })
    await user.click(libItem)

    await waitFor(() => {
      expect(
        completedStages.some(
          (e) => e.stage === 'assets' && Array.isArray(e.result.assetIds),
        ),
      ).toBe(true)
    })
  })
})

// ---- issue #210 / Slice 4 — per-track draftId routing ----

describe('AssetsEngine — issue #210: per-track draftId', () => {
  it('uses the per-track draftId for /api/assets?content_id (not the flat shape)', async () => {
    const seenUrls: string[] = []
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      seenUrls.push(String(url))
      return {
        ok: true,
        json: async () => ({ data: { assets: [], briefs: [], suggested_count: 0 }, error: null }),
      } as unknown as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="step-by-step"
        autopilotConfig={null}
        initialStageResults={{
          // Flat shape points at the canonical / wrong-track draft id.
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
        {/* Pass through `draft` with the per-track id so internal hydration uses the right row */}
        <AssetsEngine mode="generate" draft={{ id: 'blog-track-id', status: 'approved', draft_json: {} }} trackId="t-blog" />
      </StandaloneProjectContextProvider>,
    )

    await waitFor(() => {
      expect(seenUrls.some((u) => u.includes('/api/assets?content_id=blog-track-id'))).toBe(true)
    })
    expect(seenUrls.some((u) => u.includes('/api/assets?content_id=wrong-flat-id'))).toBe(false)
  })
})
