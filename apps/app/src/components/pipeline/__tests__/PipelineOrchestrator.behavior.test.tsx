import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { createActor } from 'xstate'

const mockPush = vi.fn()

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

afterEach(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  mockPush.mockReset()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      json: async () => ({ data: { id: 'd-1', status: 'approved' }, error: null }),
    }),
  )
})

// Mock providers
vi.mock('@/providers/PipelineSettingsProvider', () => ({
  usePipelineSettings: () => ({
    pipelineSettings: {
      reviewRejectThreshold: 40,
      reviewApproveScore: 90,
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

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

// Stub engines
vi.mock('@/components/engines/BrainstormEngine', () => ({
  BrainstormEngine: () => <div data-testid="brainstorm-engine">BrainstormEngine</div>,
}))

vi.mock('@/components/engines/ResearchEngine', () => ({
  ResearchEngine: () => <div data-testid="research-engine">ResearchEngine</div>,
}))

vi.mock('@/components/engines/DraftEngine', () => ({
  DraftEngine: () => <div data-testid="draft-engine">DraftEngine</div>,
}))

vi.mock('@/components/engines/ReviewEngine', () => ({
  ReviewEngine: () => <div data-testid="review-engine">ReviewEngine</div>,
}))

vi.mock('@/components/engines/AssetsEngine', () => ({
  AssetsEngine: () => <div data-testid="assets-engine">AssetsEngine</div>,
}))

vi.mock('@/components/engines/PreviewEngine', () => ({
  PreviewEngine: () => <div data-testid="preview-engine">PreviewEngine</div>,
}))

vi.mock('@/components/engines/PublishEngine', () => ({
  PublishEngine: () => <div data-testid="publish-engine">PublishEngine</div>,
}))

// Stub pipeline sub-components so render tests don't need a real actor context
vi.mock('../PipelineWizard', () => ({
  PipelineWizard: () => <div data-testid="pipeline-wizard">PipelineWizard</div>,
}))

vi.mock('../PipelineOverview', () => ({
  PipelineOverview: ({ setShowEngine }: { setShowEngine: (s: string) => void }) => (
    <div data-testid="pipeline-overview">
      PipelineOverview
      <button data-testid="open-draft-engine" onClick={() => setShowEngine('draft')}>
        Open engine
      </button>
    </div>
  ),
}))

vi.mock('../MiniWizardSheet', () => ({
  MiniWizardSheet: ({ isOpen }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? <div data-testid="mini-wizard-sheet">MiniWizardSheet</div> : null,
}))

vi.mock('../ConfirmReturnDialog', () => ({
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

// Mock the legacy migration so we can inject XState snapshots with specific context
// (e.g. pendingDrillIn, returnPromptOpen) in the drill-in tests.
const mockMapLegacyToSnapshot = vi.fn()
vi.mock('@/lib/pipeline/legacy-state-migration', async () => {
  const real = await vi.importActual<typeof import('@/lib/pipeline/legacy-state-migration')>(
    '@/lib/pipeline/legacy-state-migration'
  )
  return {
    ...real,
    mapLegacyToSnapshot: (...args: Parameters<typeof real.mapLegacyToSnapshot>) =>
      mockMapLegacyToSnapshot(...args) ?? real.mapLegacyToSnapshot(...args),
  }
})

import { PipelineOrchestrator } from '../PipelineOrchestrator'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'

// Build an XState snapshot with specific context fields set by driving the real machine.
function buildSnapshotWith(overrides: {
  pendingDrillIn?: 'assets' | 'preview' | null
  returnPromptOpen?: boolean
  mode?: 'overview' | 'step-by-step' | 'supervised'
}) {
  const autopilotConfig = {
    brainstorm: { providerOverride: null },
    research: { depth: 'medium', providerOverride: null },
    draft: { providerOverride: null },
    review: { providerOverride: null },
    assets: { mode: 'briefs_only', providerOverride: null },
    preview: { enabled: false },
    publish: { status: 'draft' },
  }
  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'p',
      channelId: 'c',
      projectTitle: 'Test',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
      creditSettings: DEFAULT_CREDIT_SETTINGS,
      mode: overrides.mode ?? 'overview',
      autopilotConfig: autopilotConfig as any,
      templateId: null,
    },
  })
  actor.start()
  // Move machine out of setup state
  actor.send({
    type: 'SETUP_COMPLETE',
    mode: overrides.mode ?? 'overview',
    autopilotConfig: autopilotConfig as any,
    templateId: null,
    startStage: 'brainstorm',
  })
  // Trigger drill-in
  if (overrides.pendingDrillIn === 'assets') {
    actor.send({ type: 'ASSETS_GATE_TRIGGERED' })
  } else if (overrides.pendingDrillIn === 'preview') {
    actor.send({ type: 'PREVIEW_GATE_TRIGGERED' })
  }
  // Trigger returnPromptOpen via ASSETS_COMPLETE in drill-in mode.
  // The ASSETS_COMPLETE guard checks pendingDrillIn AND machine must be in assets state.
  if (overrides.returnPromptOpen) {
    if (!overrides.pendingDrillIn) {
      actor.send({ type: 'ASSETS_GATE_TRIGGERED' })
    }
    // Navigate to assets state so ASSETS_COMPLETE is handled
    actor.send({ type: 'NAVIGATE', toStage: 'assets' })
    actor.send({
      type: 'ASSETS_COMPLETE',
      result: { assetIds: [], skipped: false, completedAt: new Date().toISOString() },
    } as any)
  }
  const snap = actor.getSnapshot()
  actor.stop()
  return snap
}

// Helper: a pipeline state that routes to a known non-setup stage.
// The legacy migration recognises 'currentStage' as a legacy shape and navigates to it.
function stateAt(stage: string, mode: string = 'step-by-step') {
  return {
    mode,
    currentStage: stage,
    stageResults: {},
    autoConfig: {},
  }
}

// Helper: a pipeline state for overview mode with brainstorm completed.
function overviewState() {
  return {
    mode: 'overview',
    currentStage: 'draft',
    stageResults: {
      brainstorm: {
        ideaId: 'i',
        ideaTitle: 't',
        ideaVerdict: 'v',
        ideaCoreTension: 'c',
        completedAt: '2026-01-01',
      },
    },
    autoConfig: {},
    // XState v5 snapshot marker: include __xstate to trigger mapLegacyToSnapshot as null
    // (there is no __xstate field, so this is just a legacy state — correct behaviour)
  }
}

describe('PipelineOrchestrator', () => {
  it('renders without crashing when isLoaded=true', () => {
    const { container } = render(
      <PipelineOrchestrator projectId="p" channelId="c" projectTitle="Test" />,
    )
    expect(container).toBeTruthy()
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('renders without crashing with initialPipelineState', () => {
    const { container } = render(
      <PipelineOrchestrator
        projectId="p"
        channelId="c"
        projectTitle="Test"
        initialPipelineState={{
          mode: 'step-by-step',
          currentStage: 'draft',
          stageResults: {
            brainstorm: {
              ideaId: 'i',
              ideaTitle: 't',
              ideaVerdict: 'v',
              ideaCoreTension: 'c',
              completedAt: '2026-01-01',
            },
          },
          autoConfig: {},
        }}
      />,
    )
    expect(container).toBeTruthy()
  })

  it('renders CompletedStageSummary with onRedoFrom prop', () => {
    const { container } = render(
      <PipelineOrchestrator
        projectId="p"
        channelId="c"
        projectTitle="Test"
        initialPipelineState={{
          mode: 'step-by-step',
          currentStage: 'research',
          stageResults: {
            brainstorm: {
              ideaId: 'i',
              ideaTitle: 't',
              ideaVerdict: 'v',
              ideaCoreTension: 'c',
              completedAt: 'x',
            },
          },
          autoConfig: {},
        }}
      />,
    )
    // Verify "Redo" button is in the rendered HTML (CompletedStageSummary renders with onRedoFrom prop)
    expect(container.innerHTML).toContain('Redo')
  })

  // ── T-8.1 render branch tests ─────────────────────────────────────────────

  it('renders <PipelineWizard /> when state.matches("setup")', () => {
    // No initialPipelineState → machine starts fresh at "setup"
    render(
      <PipelineOrchestrator projectId="p" channelId="c" projectTitle="Test" />,
    )
    expect(screen.getByTestId('pipeline-wizard')).toBeTruthy()
  })

  it("renders <PipelineOverview /> + current-stage engine hidden in overview mode", () => {
    render(<PipelineOrchestrator projectId="p" channelId="c" projectTitle="Test" initialPipelineState={overviewState()} />)
    expect(screen.getByTestId('pipeline-overview')).toBeVisible()
    const draftEngine = screen.getByTestId('draft-engine')
    expect(draftEngine).toBeInTheDocument()
    // Hidden via display:none on the wrapper
    const wrapper = draftEngine.closest('[data-testid="hidden-engine-wrapper"]')
    expect(wrapper).toHaveStyle({ display: 'none' })
  })

  it("setShowEngine flips wrapper visible; overview hides", async () => {
    render(<PipelineOrchestrator projectId="p" channelId="c" projectTitle="Test" initialPipelineState={overviewState()} />)
    fireEvent.click(screen.getByTestId('open-draft-engine'))
    await waitFor(() => {
      expect(screen.getByTestId('draft-engine')).toBeVisible()
      expect(screen.queryByTestId('pipeline-overview')).toBeNull()
    })
  })

  it("renders engine for step-by-step mode (no overview)", () => {
    render(
      <PipelineOrchestrator
        projectId="p"
        channelId="c"
        projectTitle="Test"
        initialPipelineState={stateAt('brainstorm', 'step-by-step')}
      />,
    )
    // In step-by-step mode, engine renders directly (no overview)
    expect(screen.getByTestId('brainstorm-engine')).toBeTruthy()
    expect(screen.queryByTestId('pipeline-overview')).toBeNull()
  })

  // ── T-8.3 Redo-from-start modal tests ────────────────────────────────────

  it('Redo from start (wipe) dispatches RESET_TO_SETUP and returns to setup/wizard', async () => {
    render(
      <PipelineOrchestrator
        projectId="p"
        channelId="c"
        projectTitle="Test"
        initialPipelineState={stateAt('brainstorm', 'step-by-step')}
      />,
    )

    // Open the redo modal
    fireEvent.click(screen.getByTestId('redo-from-start-trigger'))
    await waitFor(() => {
      expect(screen.getByTestId('redo-modal')).toBeTruthy()
    })

    // Click Wipe
    fireEvent.click(screen.getByTestId('redo-wipe-btn'))

    // Machine should transition to setup → PipelineWizard renders
    await waitFor(() => {
      expect(screen.getByTestId('pipeline-wizard')).toBeTruthy()
    })
  })

  it('Redo from start (clone) POSTs to /api/projects with channelId + autopilotConfig and routes to new project', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ data: { id: 'p2' }, error: null }),
    })
    vi.stubGlobal('fetch', mockFetch)

    render(
      <PipelineOrchestrator
        projectId="p"
        channelId="c"
        projectTitle="Test"
        initialPipelineState={stateAt('brainstorm', 'step-by-step')}
      />,
    )

    // Open the redo modal
    fireEvent.click(screen.getByTestId('redo-from-start-trigger'))
    await waitFor(() => {
      expect(screen.getByTestId('redo-modal')).toBeTruthy()
    })

    // Click Clone
    fireEvent.click(screen.getByTestId('redo-clone-btn'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/projects',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"channelId":"c"'),
        }),
      )
      expect(mockPush).toHaveBeenCalledWith('/projects/p2')
    })
  })

  it('Redo from start (new) pushes /projects/new without touching the machine state', async () => {
    render(
      <PipelineOrchestrator
        projectId="p"
        channelId="c"
        projectTitle="Test"
        initialPipelineState={stateAt('brainstorm', 'step-by-step')}
      />,
    )

    // Open the redo modal
    fireEvent.click(screen.getByTestId('redo-from-start-trigger'))
    await waitFor(() => {
      expect(screen.getByTestId('redo-modal')).toBeTruthy()
    })

    // Click Start new
    fireEvent.click(screen.getByTestId('redo-new-btn'))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/projects/new')
    })

    // Machine should still be running (no wizard rendered)
    expect(screen.queryByTestId('pipeline-wizard')).toBeNull()
    // Engine is still present
    expect(screen.getByTestId('brainstorm-engine')).toBeTruthy()
  })

  // ── T-2.9 Drill-in + ConfirmReturnDialog wiring ───────────────────────────

  it("pendingDrillIn='assets' triggers setShowEngine('assets')", async () => {
    // Build a snapshot with pendingDrillIn='assets' and inject it via the migration mock.
    const snap = buildSnapshotWith({ pendingDrillIn: 'assets', mode: 'overview' })
    mockMapLegacyToSnapshot.mockReturnValueOnce(snap)

    render(
      <PipelineOrchestrator
        projectId="p"
        channelId="c"
        projectTitle="Test"
        initialPipelineState={{ currentStage: 'brainstorm', mode: 'overview', stageResults: {}, autoConfig: {} }}
      />,
    )

    // The useEffect on pendingDrillIn should call setShowEngine('assets'),
    // making the assets engine visible (not in the hidden wrapper).
    await waitFor(() => {
      const engine = screen.getByTestId('assets-engine')
      expect(engine).toBeInTheDocument()
      // Should NOT be inside the hidden wrapper — it should be visible
      const hiddenWrapper = engine.closest('[data-testid="hidden-engine-wrapper"]')
      expect(hiddenWrapper).toBeNull()
    })
  })

  it('returnPromptOpen=true opens ConfirmReturnDialog', async () => {
    const snap = buildSnapshotWith({ returnPromptOpen: true, mode: 'overview' })
    mockMapLegacyToSnapshot.mockReturnValueOnce(snap)

    render(
      <PipelineOrchestrator
        projectId="p"
        channelId="c"
        projectTitle="Test"
        initialPipelineState={{ currentStage: 'brainstorm', mode: 'overview', stageResults: {}, autoConfig: {} }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('confirm-return-dialog')).toBeInTheDocument()
    })
  })

  it("clicking 'Continue autopilot →' sends CONTINUE_AUTOPILOT and closes dialog", async () => {
    const snap = buildSnapshotWith({ returnPromptOpen: true, mode: 'overview' })
    mockMapLegacyToSnapshot.mockReturnValueOnce(snap)

    render(
      <PipelineOrchestrator
        projectId="p"
        channelId="c"
        projectTitle="Test"
        initialPipelineState={{ currentStage: 'brainstorm', mode: 'overview', stageResults: {}, autoConfig: {} }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('confirm-return-dialog')).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('continue-autopilot-btn'))
    })

    // CONTINUE_AUTOPILOT clears returnPromptOpen → dialog closes
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-return-dialog')).toBeNull()
    })
  })

  it("clicking 'Finish manually' sends STOP_AUTOPILOT, mode becomes step-by-step", async () => {
    const snap = buildSnapshotWith({ returnPromptOpen: true, mode: 'overview' })
    mockMapLegacyToSnapshot.mockReturnValueOnce(snap)

    render(
      <PipelineOrchestrator
        projectId="p"
        channelId="c"
        projectTitle="Test"
        initialPipelineState={{ currentStage: 'brainstorm', mode: 'overview', stageResults: {}, autoConfig: {} }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('confirm-return-dialog')).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('finish-manually-btn'))
    })

    // STOP_AUTOPILOT flips mode to step-by-step and clears returnPromptOpen → dialog closes.
    // In step-by-step mode, 'Go autopilot' button text appears (from AutoModeControls).
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-return-dialog')).toBeNull()
      // The AutoModeControls button label switches when mode transitions to step-by-step
      expect(screen.getByTestId('mini-wizard-trigger')).toHaveTextContent('Go autopilot')
    })
  })

  // ── Enhancement 1: idea title swap in heading ─────────────────────────────

  it('shows project title in heading when no idea is selected yet', () => {
    render(
      <PipelineOrchestrator
        projectId="p"
        channelId="c"
        projectTitle="My Project"
        initialPipelineState={stateAt('brainstorm', 'step-by-step')}
      />,
    )
    const heading = screen.getByTestId('project-display-title')
    expect(heading).toHaveTextContent('My Project')
  })

  it('shows idea title in heading once brainstorm stageResult has ideaTitle', () => {
    render(
      <PipelineOrchestrator
        projectId="p"
        channelId="c"
        projectTitle="My Project"
        initialPipelineState={{
          mode: 'step-by-step',
          currentStage: 'research',
          stageResults: {
            brainstorm: {
              ideaId: 'idea-42',
              ideaTitle: 'How AI will change everything',
              ideaVerdict: 'viable',
              ideaCoreTension: 'tension',
              completedAt: '2026-01-01',
            },
          },
          autoConfig: {},
        }}
      />,
    )
    const heading = screen.getByTestId('project-display-title')
    expect(heading).toHaveTextContent('How AI will change everything')
    // Must NOT show project title once idea title is set
    expect(heading).not.toHaveTextContent('My Project')
  })
})
