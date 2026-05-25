/**
 * Overview-mode engine suppression tests
 *
 * Verifies that NO engine (engine-host testid) mounts when the pipeline is in
 * overview mode. FocusPanel must short-circuit to <OverviewProgressView> before
 * EngineHost ever renders.
 *
 * Each describe block covers one mode combination:
 *   overview     → engine-host absent, overview-progress-view present
 *   supervised   → engine-host present (normal rendering)
 *   step-by-step → engine-host present (normal rendering)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { StandaloneProjectContextProvider } from '@/components/pipeline/ProjectContextProvider'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'

// ─── next/navigation mock ─────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('stage=brainstorm&attempt=1'),
  usePathname: () => '/projects/proj-1',
  useParams: () => ({ id: 'proj-1' }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}))

// ─── useProjectStream mock ────────────────────────────────────────────────────

const useProjectStreamMock = vi.fn()
vi.mock('@/hooks/useProjectStream', () => ({
  useProjectStream: (...args: unknown[]) => useProjectStreamMock(...args),
}))

const EMPTY_STAGE_RUNS = {
  brainstorm: null,
  research: null,
  canonical: null,
  production: null,
  review: null,
  assets: null,
  preview: null,
  publish: null,
}

function mockStream() {
  useProjectStreamMock.mockReturnValue({
    stageRuns: EMPTY_STAGE_RUNS,
    liveEvent: null,
    isConnected: true,
    project: { mode: 'autopilot', paused: false },
    refresh: vi.fn(async () => undefined),
    allAttempts: [],
    tracks: [],
  })
}

// ─── EngineHost stub ──────────────────────────────────────────────────────────
// Must be a stub so FocusPanel can import it; we assert on data-testid="engine-host"

vi.mock('@/components/pipeline/EngineHost', () => ({
  EngineHost: () => <div data-testid="engine-host" />,
}))

// ─── OverviewProgressView stub ────────────────────────────────────────────────
// Stub so FocusPanel's overview branch renders a predictable testid without
// pulling in the full OverviewProgressView dependency tree.

vi.mock('@/components/pipeline/OverviewProgressView', () => ({
  OverviewProgressView: ({ projectId }: { projectId: string }) => (
    <div data-testid="overview-progress-view" data-project-id={projectId} />
  ),
}))

// ─── AlertDialog stub (used by FocusPanel's restart dialog) ──────────────────

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AlertDialogAction: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}))

import { FocusPanel } from '@/components/pipeline/FocusPanel'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderFocusPanel(mode: 'overview' | 'supervised' | 'step-by-step') {
  return render(
    <StandaloneProjectContextProvider
      projectId="proj-1"
      channelId="ch-1"
      mode={mode}
      autopilotConfig={null}
      initialStageResults={{}}
      pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
      creditSettings={DEFAULT_CREDIT_SETTINGS}
    >
      <FocusPanel projectId="proj-1" />
    </StandaloneProjectContextProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockStream()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: null, error: null }),
  }))
})

// ─── Overview mode: engines must NOT mount ────────────────────────────────────

describe('FocusPanel in overview mode — engine suppression', () => {
  it('does NOT render engine-host when mode is overview', () => {
    renderFocusPanel('overview')
    expect(screen.queryByTestId('engine-host')).not.toBeInTheDocument()
  })

  it('renders overview-progress-view instead of engine-host in overview mode', () => {
    renderFocusPanel('overview')
    expect(screen.getByTestId('overview-progress-view')).toBeInTheDocument()
  })

  it('overview-progress-view receives the correct projectId prop', () => {
    renderFocusPanel('overview')
    const view = screen.getByTestId('overview-progress-view')
    expect(view).toHaveAttribute('data-project-id', 'proj-1')
  })

  it('focus-panel-content testid is absent (engine tree skipped entirely)', () => {
    renderFocusPanel('overview')
    expect(screen.queryByTestId('focus-panel-content')).not.toBeInTheDocument()
  })

  it('focus-panel-empty testid is absent (overview view replaces it)', () => {
    renderFocusPanel('overview')
    expect(screen.queryByTestId('focus-panel-empty')).not.toBeInTheDocument()
  })
})

// ─── Supervised mode: engines MUST mount ─────────────────────────────────────

describe('FocusPanel in supervised mode — engines render normally', () => {
  it('renders engine-host when mode is supervised', () => {
    renderFocusPanel('supervised')
    expect(screen.getByTestId('engine-host')).toBeInTheDocument()
  })

  it('does NOT render overview-progress-view when mode is supervised', () => {
    renderFocusPanel('supervised')
    expect(screen.queryByTestId('overview-progress-view')).not.toBeInTheDocument()
  })
})

// ─── Step-by-step mode: engines MUST mount ───────────────────────────────────

describe('FocusPanel in step-by-step mode — engines render normally', () => {
  it('renders engine-host when mode is step-by-step', () => {
    renderFocusPanel('step-by-step')
    expect(screen.getByTestId('engine-host')).toBeInTheDocument()
  })

  it('does NOT render overview-progress-view when mode is step-by-step', () => {
    renderFocusPanel('step-by-step')
    expect(screen.queryByTestId('overview-progress-view')).not.toBeInTheDocument()
  })
})

// ─── Null mode: engines MUST mount (default behavior) ────────────────────────

describe('FocusPanel with null mode — engines render normally', () => {
  it('renders engine-host when mode is null (default)', () => {
    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode={null}
        autopilotConfig={null}
        initialStageResults={{}}
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
      >
        <FocusPanel projectId="proj-1" />
      </StandaloneProjectContextProvider>,
    )
    expect(screen.getByTestId('engine-host')).toBeInTheDocument()
  })

  it('does NOT render overview-progress-view when mode is null', () => {
    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode={null}
        autopilotConfig={null}
        initialStageResults={{}}
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
      >
        <FocusPanel projectId="proj-1" />
      </StandaloneProjectContextProvider>,
    )
    expect(screen.queryByTestId('overview-progress-view')).not.toBeInTheDocument()
  })
})
