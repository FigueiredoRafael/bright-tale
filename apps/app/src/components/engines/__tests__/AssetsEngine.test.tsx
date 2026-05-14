import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { createActor } from 'xstate'
import React from 'react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { AssetsEngine } from '../AssetsEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'
import type { AutopilotConfig } from '@brighttale/shared'

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

function makeActor(assetsMode: 'briefs_only' | 'auto_generate' | 'skip') {
  const config: AutopilotConfig = {
    ...BASE_AUTOPILOT,
    assets: { providerOverride: null, mode: assetsMode, imageScope: 'all' as const },
  }
  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'proj-1',
      channelId: 'ch-1',
      projectTitle: 'T',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
      creditSettings: DEFAULT_CREDIT_SETTINGS,
    },
  }).start()
  actor.send({
    type: 'SETUP_COMPLETE',
    mode: 'overview',
    autopilotConfig: config,
    templateId: null,
    startStage: 'assets',
  })
  return actor
}

describe("AssetsEngine mode='briefs_only'", () => {
  it("fires ASSETS_GATE_TRIGGERED on mount, setting pendingDrillIn='assets'", () => {
    const actor = makeActor('briefs_only')

    render(
      <PipelineActorProvider value={actor}>
        <AssetsEngine mode="generate" draft={STUB_DRAFT} />
      </PipelineActorProvider>,
    )

    expect(actor.getSnapshot().context.pendingDrillIn).toBe('assets')
  })

  it('does NOT immediately dispatch ASSETS_COMPLETE in briefs_only mode', () => {
    const actor = makeActor('briefs_only')

    render(
      <PipelineActorProvider value={actor}>
        <AssetsEngine mode="generate" draft={STUB_DRAFT} />
      </PipelineActorProvider>,
    )

    // Machine should still be in assets state (not preview)
    expect(actor.getSnapshot().value).toMatchObject({ assets: expect.anything() })
  })
})

describe("AssetsEngine mode='auto_generate'", () => {
  it('does NOT fire ASSETS_GATE_TRIGGERED on mount', () => {
    const actor = makeActor('auto_generate')

    render(
      <PipelineActorProvider value={actor}>
        <AssetsEngine mode="generate" draft={STUB_DRAFT} />
      </PipelineActorProvider>,
    )

    expect(actor.getSnapshot().context.pendingDrillIn).toBeNull()
  })
})

describe("assets mode='skip' handled by machine", () => {
  it('auto-skips assets state and transitions immediately to preview when mode=skip', () => {
    // The machine transitions from assets.idle → preview immediately via the always guard
    // when autopilotConfig.assets.mode === 'skip'. AssetsEngine never needs to mount.
    const config: AutopilotConfig = {
      ...BASE_AUTOPILOT,
      assets: { providerOverride: null, mode: 'skip', imageScope: 'all' as const },
    }
    const actor = createActor(pipelineMachine, {
      input: {
        projectId: 'proj-1',
        channelId: 'ch-1',
        projectTitle: 'T',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
        creditSettings: DEFAULT_CREDIT_SETTINGS,
      },
    }).start()
    actor.send({
      type: 'SETUP_COMPLETE',
      mode: 'overview',
      autopilotConfig: config,
      templateId: null,
      startStage: 'assets',
    })

    // Machine should have skipped straight to preview
    expect(actor.getSnapshot().value).toMatchObject({ preview: expect.anything() })
    // stageResults.assets should be present with skipped=true
    expect(actor.getSnapshot().context.stageResults.assets?.skipped).toBe(true)
    expect(actor.getSnapshot().context.stageResults.assets?.assetIds).toEqual([])
  })

  it('skip also works when flowing through full pipeline from draft', () => {
    const config: AutopilotConfig = {
      ...BASE_AUTOPILOT,
      review: { ...BASE_AUTOPILOT.review, maxIterations: 0 }, // skip review too
      assets: { providerOverride: null, mode: 'skip', imageScope: 'all' as const },
    }
    const actor = createActor(pipelineMachine, {
      input: {
        projectId: 'proj-1',
        channelId: 'ch-1',
        projectTitle: 'T',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
        creditSettings: DEFAULT_CREDIT_SETTINGS,
      },
    }).start()
    actor.send({
      type: 'SETUP_COMPLETE',
      mode: 'overview',
      autopilotConfig: config,
      templateId: null,
      startStage: 'brainstorm',
    })
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: { ideaId: 'i-1', ideaTitle: 'T', ideaVerdict: 'viable', ideaCoreTension: 'c' } })
    actor.send({ type: 'RESEARCH_COMPLETE', result: { researchSessionId: 'rs-1', approvedCardsCount: 3, researchLevel: 'medium' } })
    actor.send({ type: 'DRAFT_COMPLETE', result: { draftId: 'd-1', draftTitle: 'D', draftContent: 'body' } })

    // After DRAFT_COMPLETE with skip-review config, machine goes to assets.idle which immediately
    // transitions to preview via shouldSkipAssets guard.
    expect(actor.getSnapshot().value).toMatchObject({ preview: expect.anything() })
    expect(actor.getSnapshot().context.stageResults.assets?.skipped).toBe(true)
  })
})

describe('AssetsEngine STAGE_PROGRESS', () => {
  it('dispatches STAGE_PROGRESS with status=Generating images when handleGenerateBriefs fires', async () => {
    const actor = makeActor('auto_generate')

    const sentEvents: Array<{ type: string; stage?: string; partial?: { status?: string } }> = []
    const originalSend = actor.send.bind(actor)
    vi.spyOn(actor, 'send').mockImplementation((event: unknown) => {
      const e = event as { type: string; stage?: string; partial?: { status?: string } }
      sentEvents.push(e)
      return originalSend(event as Parameters<typeof actor.send>[0])
    })

    // Feed a draftId so the guard passes
    actor.send({
      type: 'STAGE_PROGRESS',
      stage: 'draft' as const,
      partial: { draftId: 'd-1', draftTitle: 'D' },
    })

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

    render(
      <PipelineActorProvider value={actor}>
        <AssetsEngine mode="generate" draft={STUB_DRAFT} />
      </PipelineActorProvider>,
    )

    // Wait for useAutoPilotTrigger to fire handleGenerateBriefs (loading=false triggers it)
    await new Promise((r) => setTimeout(r, 100))

    expect(sentEvents.some((e) => e.type === 'STAGE_PROGRESS' && e.partial?.status === 'Generating images')).toBe(true)
  })
})
