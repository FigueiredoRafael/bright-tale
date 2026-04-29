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
  stateValue = 'brainstorm' as string | Record<string, unknown>,
} = {}) {
  return {
    value: stateValue,
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

type Snapshot = ReturnType<typeof makeSnapshot>
let snapshotOverride: Snapshot = makeSnapshot()

vi.mock('@/hooks/usePipelineActor', () => ({
  usePipelineActor: () => ({
    getSnapshot: () => snapshotOverride,
    send: sendSpy,
  }),
}))

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => Snapshot }, selector: (s: Snapshot) => unknown) =>
    selector(actor.getSnapshot()),
}))

afterEach(() => {
  vi.clearAllMocks()
  snapshotOverride = makeSnapshot()
})

// Import AFTER mocks
import { PipelineOverview } from '../PipelineOverview'

// ─── Test data ────────────────────────────────────────────────────────────────

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

const COMPLETED_BRAINSTORM_RESULTS = {
  brainstorm: {
    ideaId: 'idea-1',
    ideaTitle: 'My Great Idea',
    ideaVerdict: 'strong',
    ideaCoreTension: 'tension',
    completedAt: '2026-01-01T00:00:00Z',
  },
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PipelineOverview', () => {
  it('renders OverviewTimeline with all 7 stage rows', () => {
    snapshotOverride = makeSnapshot({
      stageResults: COMPLETED_BRAINSTORM_RESULTS,
      autopilotConfig: STANDARD_AUTOPILOT_CONFIG,
    })

    render(<PipelineOverview setShowEngine={vi.fn()} />)

    // The OverviewTimeline wrapper card
    expect(screen.getByTestId('pipeline-overview')).toBeInTheDocument()
    // All 7 stage rows present
    const stageNames = ['brainstorm', 'research', 'draft', 'review', 'assets', 'preview', 'publish']
    for (const stage of stageNames) {
      expect(screen.getByTestId(`stage-row-${stage}`)).toBeInTheDocument()
    }
  })

  it('does NOT render LiveActivityLog when no stage transitions have occurred', () => {
    snapshotOverride = makeSnapshot()
    render(<PipelineOverview setShowEngine={vi.fn()} />)
    expect(screen.queryByTestId('live-activity-log')).toBeNull()
  })

  it('renders brainstorm row running when at brainstorm with empty stageResults', () => {
    snapshotOverride = makeSnapshot({ stateValue: 'brainstorm' })
    render(<PipelineOverview setShowEngine={vi.fn()} />)

    const brainstormRow = screen.getByTestId('stage-row-brainstorm')
    expect(brainstormRow.className).toContain('border-l-2')
  })

  it('renders completed brainstorm with Open engine button and summary', () => {
    snapshotOverride = makeSnapshot({
      stateValue: 'research',
      stageResults: COMPLETED_BRAINSTORM_RESULTS,
      autopilotConfig: STANDARD_AUTOPILOT_CONFIG,
    })

    render(<PipelineOverview setShowEngine={vi.fn()} />)

    expect(screen.getByRole('button', { name: /open engine/i })).toBeInTheDocument()
    expect(screen.getByText('My Great Idea (strong)')).toBeInTheDocument()
  })

  it('calls setShowEngine with stage name when Open engine button is clicked', async () => {
    const user = userEvent.setup()
    const setShowEngine = vi.fn()

    snapshotOverride = makeSnapshot({
      stateValue: 'research',
      stageResults: COMPLETED_BRAINSTORM_RESULTS,
      autopilotConfig: STANDARD_AUTOPILOT_CONFIG,
    })

    render(<PipelineOverview setShowEngine={setShowEngine} />)

    const btn = screen.getByRole('button', { name: /open engine/i })
    await user.click(btn)

    expect(setShowEngine).toHaveBeenCalledWith('brainstorm')
  })

  it('shows assets row as skipped when assets.mode is skip', () => {
    snapshotOverride = makeSnapshot({
      stateValue: 'brainstorm',
      autopilotConfig: STANDARD_AUTOPILOT_CONFIG, // assets.mode === 'skip'
    })

    render(<PipelineOverview setShowEngine={vi.fn()} />)

    const assetsRow = screen.getByTestId('stage-row-assets')
    expect(assetsRow.className).not.toContain('border-l-2')
    expect(assetsRow.querySelector('.bg-primary')).toBeNull()
  })
})
