/**
 * PipelineOverview tests (updated for new 2-column dashboard design)
 *
 * PipelineOverview is now a thin wrapper around PipelineDashboard.
 * Tests verify that it renders the dashboard and forwards props correctly.
 */
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
  preview: { enabled: false },
  publish: { status: 'draft' as const },
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

describe('PipelineOverview (2-column dashboard)', () => {
  it('renders the pipeline dashboard', () => {
    snapshotOverride = makeSnapshot({
      stageResults: COMPLETED_BRAINSTORM_RESULTS,
      autopilotConfig: STANDARD_AUTOPILOT_CONFIG,
    })

    render(
      <PipelineOverview
        setShowEngine={vi.fn()}
        activityLog={[]}
        onActivityLogChange={vi.fn()}
      />,
    )

    expect(screen.getByTestId('pipeline-dashboard')).toBeInTheDocument()
  })

  it('renders all 7 stage rail buttons', () => {
    snapshotOverride = makeSnapshot({
      stageResults: COMPLETED_BRAINSTORM_RESULTS,
      autopilotConfig: STANDARD_AUTOPILOT_CONFIG,
    })

    render(
      <PipelineOverview
        setShowEngine={vi.fn()}
        activityLog={[]}
        onActivityLogChange={vi.fn()}
      />,
    )

    const stages = ['brainstorm', 'research', 'draft', 'review', 'assets', 'preview', 'publish']
    for (const stage of stages) {
      expect(screen.getByTestId(`rail-stage-${stage}`)).toBeInTheDocument()
    }
  })

  it('shows brainstorm panel as live when at brainstorm with empty stageResults', () => {
    snapshotOverride = makeSnapshot({ stateValue: 'brainstorm' })

    render(
      <PipelineOverview
        setShowEngine={vi.fn()}
        activityLog={[]}
        onActivityLogChange={vi.fn()}
      />,
    )

    // Desktop + mobile both render the panel
    expect(screen.getAllByTestId('stage-panel-brainstorm').length).toBeGreaterThan(0)
  })

  it('shows activity log count badge when log entries exist', () => {
    snapshotOverride = makeSnapshot({
      stateValue: 'research',
      stageResults: COMPLETED_BRAINSTORM_RESULTS,
    })

    const log = [{ timestamp: new Date().toISOString(), text: 'Brainstorm completed' }]
    render(
      <PipelineOverview
        setShowEngine={vi.fn()}
        activityLog={log}
        onActivityLogChange={vi.fn()}
      />,
    )

    expect(screen.getByTestId('activity-log-count').textContent).toBe('1')
  })

  it('calls setShowEngine when Open engine is clicked', async () => {
    const user = userEvent.setup()
    const setShowEngine = vi.fn()
    snapshotOverride = makeSnapshot({
      stateValue: 'research',
      stageResults: COMPLETED_BRAINSTORM_RESULTS,
      autopilotConfig: STANDARD_AUTOPILOT_CONFIG,
    })

    render(
      <PipelineOverview
        setShowEngine={setShowEngine}
        activityLog={[]}
        onActivityLogChange={vi.fn()}
      />,
    )

    // Switch to brainstorm (completed)
    await user.click(screen.getByTestId('rail-stage-brainstorm'))
    // Desktop + mobile both render the button; click the first one
    const openBtns = screen.getAllByTestId('open-engine-brainstorm')
    await user.click(openBtns[0])
    expect(setShowEngine).toHaveBeenCalledWith('brainstorm')
  })
})
