import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

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

import { PipelineOrchestrator } from '../PipelineOrchestrator'

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
})
