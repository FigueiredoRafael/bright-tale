/**
 * PipelineDashboard tests
 *
 * Verifies:
 * 1. Left rail + right panel render together
 * 2. Right panel auto-follows live stage (default)
 * 3. Clicking a completed stage in the rail switches the right panel
 * 4. "Back to live" pill appears when panel shows a non-live stage
 * 5. Clicking "Back to live" returns panel to live stage
 * 6. "Open engine" click fires setShowEngine
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

import { PipelineDashboard } from '../PipelineDashboard'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const COMPLETED_BRAINSTORM = {
  brainstorm: {
    ideaId: 'i1',
    ideaTitle: 'My Idea',
    ideaVerdict: 'strong',
    ideaCoreTension: 'tension',
    completedAt: new Date().toISOString(),
  },
}

function renderDashboard(overrides: Partial<React.ComponentProps<typeof PipelineDashboard>> = {}) {
  const defaults: React.ComponentProps<typeof PipelineDashboard> = {
    setShowEngine: vi.fn(),
    onRedoFrom: vi.fn(),
    activityLog: [],
    onActivityLogChange: vi.fn(),
    ...overrides,
  }
  return render(<PipelineDashboard {...defaults} />)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PipelineDashboard — layout', () => {
  it('renders the dashboard container', () => {
    snapshotOverride = makeSnapshot({ stateValue: 'brainstorm' })
    renderDashboard()
    expect(screen.getByTestId('pipeline-dashboard')).toBeInTheDocument()
  })

  it('renders all 7 stage buttons in the left rail', () => {
    snapshotOverride = makeSnapshot()
    renderDashboard()
    const stages = ['brainstorm', 'research', 'draft', 'review', 'assets', 'preview', 'publish']
    for (const stage of stages) {
      expect(screen.getByTestId(`rail-stage-${stage}`)).toBeInTheDocument()
    }
  })
})

describe('PipelineDashboard — right panel auto-follows live stage', () => {
  it('shows brainstorm panel when machine is at brainstorm', () => {
    snapshotOverride = makeSnapshot({ stateValue: 'brainstorm' })
    renderDashboard()
    // Desktop + mobile both render the panel (query "all" to handle duplicates)
    expect(screen.getAllByTestId('stage-panel-brainstorm').length).toBeGreaterThan(0)
  })

  it('shows research panel when machine is at research', () => {
    snapshotOverride = makeSnapshot({
      stateValue: 'research',
      stageResults: COMPLETED_BRAINSTORM,
    })
    renderDashboard()
    expect(screen.getAllByTestId('stage-panel-research').length).toBeGreaterThan(0)
  })
})

describe('PipelineDashboard — manual stage selection', () => {
  it('switches right panel when a completed stage is clicked in the rail', async () => {
    const user = userEvent.setup()
    snapshotOverride = makeSnapshot({
      stateValue: 'research',
      stageResults: COMPLETED_BRAINSTORM,
    })
    renderDashboard()

    // Initially at research
    expect(screen.getAllByTestId('stage-panel-research').length).toBeGreaterThan(0)

    // Click on completed brainstorm stage
    await user.click(screen.getByTestId('rail-stage-brainstorm'))

    // Panel should switch to brainstorm
    expect(screen.getAllByTestId('stage-panel-brainstorm').length).toBeGreaterThan(0)
    expect(screen.queryAllByTestId('stage-panel-research')).toHaveLength(0)
  })

  it('shows "Back to live" pill when viewing a non-live stage', async () => {
    const user = userEvent.setup()
    snapshotOverride = makeSnapshot({
      stateValue: 'research',
      stageResults: COMPLETED_BRAINSTORM,
    })
    renderDashboard()

    await user.click(screen.getByTestId('rail-stage-brainstorm'))
    expect(screen.getAllByTestId('back-to-live-btn').length).toBeGreaterThan(0)
  })

  it('does NOT show "Back to live" when viewing the live stage', () => {
    snapshotOverride = makeSnapshot({ stateValue: 'brainstorm' })
    renderDashboard()
    expect(screen.queryByTestId('back-to-live-btn')).toBeNull()
  })

  it('returns to live stage when "Back to live" is clicked', async () => {
    const user = userEvent.setup()
    snapshotOverride = makeSnapshot({
      stateValue: 'research',
      stageResults: COMPLETED_BRAINSTORM,
    })
    renderDashboard()

    // Switch to brainstorm
    await user.click(screen.getByTestId('rail-stage-brainstorm'))
    expect(screen.getAllByTestId('stage-panel-brainstorm').length).toBeGreaterThan(0)

    // Click back to live (use first back-to-live button — desktop and mobile both show it)
    const btns = screen.getAllByTestId('back-to-live-btn')
    await user.click(btns[0])

    // Should be back at research (the live stage)
    expect(screen.getAllByTestId('stage-panel-research').length).toBeGreaterThan(0)
    expect(screen.queryAllByTestId('back-to-live-btn')).toHaveLength(0)
  })
})

describe('PipelineDashboard — open engine', () => {
  it('calls setShowEngine when Open engine is clicked on a completed stage', async () => {
    const user = userEvent.setup()
    const setShowEngine = vi.fn()
    snapshotOverride = makeSnapshot({
      stateValue: 'research',
      stageResults: COMPLETED_BRAINSTORM,
    })
    renderDashboard({ setShowEngine })

    // Switch to completed brainstorm
    await user.click(screen.getByTestId('rail-stage-brainstorm'))
    // Both desktop + mobile render the button; click the first one
    const openBtns = screen.getAllByTestId('open-engine-brainstorm')
    await user.click(openBtns[0])

    expect(setShowEngine).toHaveBeenCalledWith('brainstorm')
  })
})
