/**
 * assets-briefs-only-stop.test.tsx — Gate scenario 4
 *
 * Spec: assets.mode='briefs_only', same drill-in flow as scenario 3, but
 * clicking "Finish manually" dispatches STOP_AUTOPILOT:
 *   - mode flips to step-by-step
 *   - returnPromptOpen clears (dialog closes)
 *   - engine stays visible (showEngine is not cleared by STOP_AUTOPILOT)
 *
 * Approach: same mockMapLegacyToSnapshot pattern as T-2.9.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
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
  MiniWizardSheet: ({ isOpen }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? <div data-testid="mini-wizard-sheet" /> : null,
}))
vi.mock('../../PipelineOverview', () => ({
  PipelineOverview: ({ setShowEngine }: { setShowEngine: (s: string) => void }) => (
    <div data-testid="pipeline-overview">
      <button data-testid="open-assets-engine" onClick={() => setShowEngine('assets')}>
        Open assets
      </button>
    </div>
  ),
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
vi.mock('../../ConfirmReturnDialog', () => ({
  ConfirmReturnDialog: ({
    open,
    onContinue,
    onStop,
  }: {
    open: boolean
    onContinue: () => void
    onStop: () => void
  }) =>
    open ? (
      <div data-testid="confirm-return-dialog">
        <button data-testid="continue-autopilot-btn" onClick={onContinue}>
          Continue autopilot →
        </button>
        <button data-testid="finish-manually-btn" onClick={onStop}>
          Finish manually
        </button>
      </div>
    ) : null,
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

function buildReturnPromptSnapshot() {
  const config = {
    ...BASE_AUTOPILOT_CONFIG,
    assets: { ...BASE_AUTOPILOT_CONFIG.assets, mode: 'briefs_only' as const },
  }
  // Mirror the `buildSnapshotWith({ returnPromptOpen: true, mode: 'overview' })`
  // pattern from PipelineOrchestrator.behavior.test.tsx.
  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'p',
      channelId: 'c',
      projectTitle: 'Test',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
      creditSettings: DEFAULT_CREDIT_SETTINGS,
      mode: 'overview',
      autopilotConfig: config as any,
      templateId: null,
    },
  })
  actor.start()
  actor.send({
    type: 'SETUP_COMPLETE',
    mode: 'overview',
    autopilotConfig: config as any,
    templateId: null,
    startStage: 'brainstorm',
  })
  actor.send({ type: 'ASSETS_GATE_TRIGGERED' })
  actor.send({ type: 'NAVIGATE', toStage: 'assets' })
  actor.send({
    type: 'ASSETS_COMPLETE',
    result: { assetIds: [], skipped: false, completedAt: new Date().toISOString() },
  } as any)
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

describe('Gate: assets.mode=briefs_only + stop autopilot', () => {
  it('clicking Finish manually sends STOP_AUTOPILOT → mode=step-by-step, dialog closes', async () => {
    const snap = buildReturnPromptSnapshot()
    expect(snap.context.returnPromptOpen).toBe(true)

    mockMapLegacyToSnapshot.mockReturnValueOnce(snap)

    render(
      <PipelineOrchestrator
        projectId="p"
        channelId="c"
        projectTitle="Test"
        initialPipelineState={{ currentStage: 'assets', mode: 'overview', stageResults: {}, autoConfig: {} }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('confirm-return-dialog')).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('finish-manually-btn'))
    })

    // STOP_AUTOPILOT: returnPromptOpen cleared → dialog gone
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-return-dialog')).toBeNull()
    })

    // Mode should now be step-by-step: AutoModeControls button says "Go autopilot"
    await waitFor(() => {
      expect(screen.getByTestId('mini-wizard-trigger')).toHaveTextContent('Go autopilot')
    })
  })

  it('STOP_AUTOPILOT at machine level flips mode to step-by-step and clears returnPromptOpen', () => {
    const config = {
      ...BASE_AUTOPILOT_CONFIG,
      assets: { ...BASE_AUTOPILOT_CONFIG.assets, mode: 'briefs_only' as const },
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
      startStage: 'assets',
    })
    actor.send({ type: 'ASSETS_GATE_TRIGGERED' })
    actor.send({ type: 'NAVIGATE', toStage: 'assets' })
    actor.send({
      type: 'ASSETS_COMPLETE',
      result: { assetIds: [], skipped: false, completedAt: new Date().toISOString() },
    } as any)
    // Confirm returnPromptOpen before stop
    expect(actor.getSnapshot().context.returnPromptOpen).toBe(true)

    actor.send({ type: 'STOP_AUTOPILOT' })
    const snap = actor.getSnapshot()
    actor.stop()

    expect(snap.context.mode).toBe('step-by-step')
    expect(snap.context.returnPromptOpen).toBe(false)
    expect(snap.context.pendingDrillIn).toBeNull()
  })
})
