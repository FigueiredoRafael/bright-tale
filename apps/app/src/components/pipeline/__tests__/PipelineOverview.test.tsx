import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// ─── Shared mocks ─────────────────────────────────────────────────────────────

const sendSpy = vi.fn()

function makeSnapshot({
  stageResults = {} as Record<string, unknown>,
  autopilotConfig = null as unknown,
  paused = false,
} = {}) {
  return {
    value: 'draft',
    context: {
      projectId: 'p1',
      channelId: 'c1',
      mode: 'overview' as const,
      autopilotConfig,
      stageResults,
      paused,
      pauseReason: null,
    },
  }
}

const DEFAULT_SNAPSHOT = makeSnapshot()
let snapshotOverride = DEFAULT_SNAPSHOT

vi.mock('@/hooks/usePipelineActor', () => ({
  usePipelineActor: () => ({
    getSnapshot: () => snapshotOverride,
    send: sendSpy,
  }),
}))

afterEach(() => {
  vi.clearAllMocks()
  snapshotOverride = DEFAULT_SNAPSHOT
})

// ─── Import components AFTER mocks ────────────────────────────────────────────
import { OverviewProgressRail } from '../OverviewProgressRail'
import { OverviewStageResults } from '../OverviewStageResults'
import { PipelineOverview } from '../PipelineOverview'

// ─── Test data ────────────────────────────────────────────────────────────────

const ALL_STATUS_STAGES = [
  { name: 'brainstorm', status: 'completed' as const },
  { name: 'research',   status: 'running'   as const },
  { name: 'draft',      status: 'pending'   as const },
  { name: 'review',     status: 'paused'    as const },
  { name: 'assets',     status: 'failed'    as const },
  { name: 'preview',    status: 'skipped'   as const },
  { name: 'publish',    status: 'pending'   as const },
]

const COMPLETED_BRAINSTORM_RESULTS = {
  brainstorm: {
    ideaId: 'idea-1',
    ideaTitle: 'My Great Idea',
    ideaVerdict: 'strong',
    ideaCoreTension: 'tension',
    completedAt: '2026-01-01T00:00:00Z',
  },
}

const STANDARD_AUTOPILOT_CONFIG = {
  defaultProvider: 'recommended' as const,
  brainstorm: null,
  research: null,
  canonicalCore: { providerOverride: null, personaId: null },
  draft: { providerOverride: null, format: 'blog' as const, wordCount: 1500 },
  review: {
    providerOverride: null,
    maxIterations: 3,
    autoApproveThreshold: 90,
    hardFailThreshold: 40,
  },
  assets: { providerOverride: null, mode: 'skip' as const },
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('OverviewProgressRail', () => {
  it('renders all 7 stage status icons including each distinct status character', () => {
    render(<OverviewProgressRail stages={ALL_STATUS_STAGES} />)

    // Each status has a distinct icon character
    expect(screen.getByText('✓')).toBeInTheDocument() // completed
    expect(screen.getByText('◐')).toBeInTheDocument() // running
    // Two 'pending' stages → at least one ○
    expect(screen.getAllByText('○').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('⏸')).toBeInTheDocument() // paused
    expect(screen.getByText('✗')).toBeInTheDocument() // failed
    expect(screen.getByText('⊘')).toBeInTheDocument() // skipped
  })
})

describe('OverviewStageResults', () => {
  it('renders one card per stage (7 cards total)', () => {
    render(
      <OverviewStageResults
        stageResults={{}}
        autopilotConfig={STANDARD_AUTOPILOT_CONFIG}
        setShowEngine={vi.fn()}
      />,
    )

    const cards = screen.getAllByTestId(/^stage-card-/)
    expect(cards).toHaveLength(7)
  })

  it('completed brainstorm stage shows "Open Brainstorm engine →" button', () => {
    render(
      <OverviewStageResults
        stageResults={COMPLETED_BRAINSTORM_RESULTS}
        autopilotConfig={STANDARD_AUTOPILOT_CONFIG}
        setShowEngine={vi.fn()}
      />,
    )

    const btn = screen.getByRole('button', { name: /open brainstorm engine/i })
    expect(btn).toBeInTheDocument()
  })

  it('clicking "Open ... engine →" calls setShowEngine with the stage name', async () => {
    const user = userEvent.setup()
    const setShowEngine = vi.fn()

    render(
      <OverviewStageResults
        stageResults={COMPLETED_BRAINSTORM_RESULTS}
        autopilotConfig={STANDARD_AUTOPILOT_CONFIG}
        setShowEngine={setShowEngine}
      />,
    )

    const btn = screen.getByRole('button', { name: /open brainstorm engine/i })
    await user.click(btn)

    expect(setShowEngine).toHaveBeenCalledWith('brainstorm')
  })

  it('shows "Skipped" badge on review card when maxIterations === 0', () => {
    const skippedConfig = {
      ...STANDARD_AUTOPILOT_CONFIG,
      review: {
        ...STANDARD_AUTOPILOT_CONFIG.review,
        maxIterations: 0,
        autoApproveThreshold: 90,
        hardFailThreshold: 40,
      },
    }

    render(
      <OverviewStageResults
        stageResults={{}}
        autopilotConfig={skippedConfig}
        setShowEngine={vi.fn()}
      />,
    )

    const reviewCard = screen.getByTestId('stage-card-review')
    expect(reviewCard).toHaveTextContent(/skipped/i)
  })

  it('renders pause-gate panel when review.score < hardFailThreshold', () => {
    const reviewWithLowScore = {
      review: {
        score: 30,
        verdict: 'reject',
        iterationCount: 1,
        feedbackJson: {},
        completedAt: '2026-01-01T00:00:00Z',
      },
    }

    render(
      <OverviewStageResults
        stageResults={reviewWithLowScore}
        autopilotConfig={STANDARD_AUTOPILOT_CONFIG}
        setShowEngine={vi.fn()}
      />,
    )

    // hardFailThreshold is 40, score is 30 → should show the pause panel
    expect(screen.getByTestId('pause-gate-panel')).toBeInTheDocument()
  })

  it('clicking "Pause autopilot" dispatches REQUEST_ABORT to actor', async () => {
    const user = userEvent.setup()

    const reviewWithLowScore = {
      review: {
        score: 30,
        verdict: 'reject',
        iterationCount: 1,
        feedbackJson: {},
        completedAt: '2026-01-01T00:00:00Z',
      },
    }

    snapshotOverride = makeSnapshot({
      stageResults: reviewWithLowScore,
      autopilotConfig: STANDARD_AUTOPILOT_CONFIG,
    })

    render(
      <OverviewStageResults
        stageResults={reviewWithLowScore}
        autopilotConfig={STANDARD_AUTOPILOT_CONFIG}
        setShowEngine={vi.fn()}
      />,
    )

    const pauseBtn = screen.getByRole('button', { name: /pause autopilot/i })
    await user.click(pauseBtn)

    expect(sendSpy).toHaveBeenCalledWith({ type: 'REQUEST_ABORT' })
  })
})

describe('PipelineOverview', () => {
  it('renders the progress rail and stage results columns together', () => {
    snapshotOverride = makeSnapshot({
      stageResults: COMPLETED_BRAINSTORM_RESULTS,
      autopilotConfig: STANDARD_AUTOPILOT_CONFIG,
    })

    render(<PipelineOverview setShowEngine={vi.fn()} />)

    // Rail should have a rail stage entry for brainstorm
    expect(screen.getByTestId('rail-stage-brainstorm')).toBeInTheDocument()

    // Right column should have stage cards
    const cards = screen.getAllByTestId(/^stage-card-/)
    expect(cards).toHaveLength(7)
  })
})
