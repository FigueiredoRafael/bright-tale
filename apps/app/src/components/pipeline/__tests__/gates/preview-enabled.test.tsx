/**
 * preview-enabled.test.tsx — Gate scenario 5
 *
 * Spec: when autopilotConfig.preview.enabled=true:
 *  - Machine stays in `preview` (no auto-skip).
 *  - PREVIEW_GATE_TRIGGERED sets pendingDrillIn='preview'.
 *  - When rendered in overview mode with pendingDrillIn='preview', the
 *    orchestrator calls setShowEngine('preview'), making the PreviewEngine
 *    visible outside the hidden wrapper.
 *
 * Approaches:
 *  - Test 1: pure machine — PREVIEW_GATE_TRIGGERED sets pendingDrillIn.
 *  - Test 2: render — inject snapshot with pendingDrillIn='preview', assert
 *    engine is outside the hidden wrapper (mirrors T-2.9 pendingDrillIn='assets').
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { createActor } from 'xstate'

// ── Global stubs ─────────────────────────────────────────────────────────────
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
vi.stubGlobal('localStorage', {
  getItem: vi.fn().mockReturnValue(null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
})

// ── Module mocks ──────────────────────────────────────────────────────────────
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
      reviewRejectThreshold: 40, reviewApproveScore: 90,
      reviewMaxIterations: 5, defaultProviders: {},
    },
    creditSettings: {
      costBlog: 200, costVideo: 200, costShorts: 100, costPodcast: 150,
      costCanonicalCore: 80, costReview: 20, costResearchSurface: 60,
      costResearchMedium: 100, costResearchDeep: 180,
    },
    isLoaded: true,
  }),
  PipelineSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('../../PipelineWizard', () => ({
  PipelineWizard: () => <div data-testid="pipeline-wizard" />,
}))
vi.mock('../../MiniWizardSheet', () => ({
  MiniWizardSheet: () => null,
}))
vi.mock('../../PipelineOverview', () => ({
  PipelineOverview: () => <div data-testid="pipeline-overview" />,
}))
vi.mock('../../ConfirmReturnDialog', () => ({
  ConfirmReturnDialog: ({ open }: { open: boolean; onContinue: () => void; onStop: () => void }) =>
    open ? <div data-testid="confirm-return-dialog" /> : null,
}))
vi.mock('@/components/engines/BrainstormEngine', () => ({
  BrainstormEngine: () => <div data-testid="brainstorm-engine" />,
}))
vi.mock('@/components/engines/ResearchEngine', () => ({
  ResearchEngine: () => <div data-testid="research-engine" />,
}))
vi.mock('@/components/engines/DraftEngine', () => ({
  DraftEngine: () => <div data-testid="draft-engine" />,
}))
vi.mock('@/components/engines/ReviewEngine', () => ({
  ReviewEngine: () => <div data-testid="review-engine" />,
}))
vi.mock('@/components/engines/AssetsEngine', () => ({
  AssetsEngine: () => <div data-testid="assets-engine" />,
}))
vi.mock('@/components/engines/PreviewEngine', () => ({
  PreviewEngine: () => <div data-testid="preview-engine" />,
}))
vi.mock('@/components/engines/PublishEngine', () => ({
  PublishEngine: () => <div data-testid="publish-engine" />,
}))

const mockMapLegacyToSnapshot = vi.fn()
vi.mock('@/lib/pipeline/legacy-state-migration', async () => {
  const real = await vi.importActual<typeof import('@/lib/pipeline/legacy-state-migration')>(
    '@/lib/pipeline/legacy-state-migration',
  )
  return {
    ...real,
    mapLegacyToSnapshot: (...args: Parameters<typeof real.mapLegacyToSnapshot>) =>
      mockMapLegacyToSnapshot(...args) ?? real.mapLegacyToSnapshot(...args),
  }
})

import { PipelineOrchestrator } from '../../PipelineOrchestrator'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'
import { BASE_AUTOPILOT_CONFIG } from './_helpers'

function buildPreviewEnabledSnapshot() {
  const config = {
    ...BASE_AUTOPILOT_CONFIG,
    preview: { enabled: true },
    assets: { ...BASE_AUTOPILOT_CONFIG.assets, mode: 'skip' as const },
  }
  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'p',
      channelId: 'c',
      projectTitle: 'Test',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
      creditSettings: DEFAULT_CREDIT_SETTINGS,
      mode: 'overview',
      autopilotConfig: config,
      templateId: null,
    },
  })
  actor.start()
  actor.send({
    type: 'SETUP_COMPLETE',
    mode: 'overview',
    autopilotConfig: config,
    templateId: null,
    startStage: 'preview',
  })
  // Simulate gate trigger — orchestrator fires this when it detects preview.enabled=true
  actor.send({ type: 'PREVIEW_GATE_TRIGGERED' })
  const snap = actor.getSnapshot()
  actor.stop()
  return snap
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 'p' }, error: null }),
    }),
  )
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.stubGlobal('EventSource', NoopEventSource)
  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  })
})

describe('Gate: preview.enabled=true', () => {
  it('PREVIEW_GATE_TRIGGERED sets pendingDrillIn=preview on machine context', () => {
    const config = {
      ...BASE_AUTOPILOT_CONFIG,
      preview: { enabled: true },
    }
    const actor = createActor(pipelineMachine, {
      input: {
        projectId: 'p',
        channelId: 'c',
        projectTitle: 'Test',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
        creditSettings: DEFAULT_CREDIT_SETTINGS,
      },
    })
    actor.start()
    actor.send({
      type: 'SETUP_COMPLETE',
      mode: 'overview',
      autopilotConfig: config,
      templateId: null,
      startStage: 'preview',
    })
    actor.send({ type: 'PREVIEW_GATE_TRIGGERED' })
    expect(actor.getSnapshot().context.pendingDrillIn).toBe('preview')
    actor.stop()
  })

  it('pendingDrillIn=preview → useEffect calls setShowEngine(preview) → engine visible outside hidden wrapper', async () => {
    const snap = buildPreviewEnabledSnapshot()
    expect(snap.context.pendingDrillIn).toBe('preview')

    mockMapLegacyToSnapshot.mockReturnValueOnce(snap)

    render(
      <PipelineOrchestrator
        projectId="p"
        channelId="c"
        projectTitle="Test"
        initialPipelineState={{ currentStage: 'preview', mode: 'overview', stageResults: {}, autoConfig: {} }}
      />,
    )

    await waitFor(() => {
      const engine = screen.getByTestId('preview-engine')
      expect(engine).toBeInTheDocument()
      // Should NOT be inside the hidden wrapper when pendingDrillIn triggered setShowEngine
      const hiddenWrapper = engine.closest('[data-testid="hidden-engine-wrapper"]')
      expect(hiddenWrapper).toBeNull()
    })
  })
})
