import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

// Mock usePipelineActor to return a fake actor with getSnapshot
vi.mock('@/hooks/usePipelineActor', () => ({
  usePipelineActor: () => ({
    getSnapshot: () => snapshotOverride,
    send: sendSpy,
  }),
}))

// Mock useSelector to call the selector function against the current snapshot.
// This matches how real XState useSelector works but without reactivity.
vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => Snapshot }, selector: (s: Snapshot) => unknown) =>
    selector(actor.getSnapshot()),
}))

afterEach(() => {
  vi.clearAllMocks()
  snapshotOverride = makeSnapshot()
})

// Import AFTER mocks
import { OverviewTimeline } from '../OverviewTimeline'

// ─── Tests ────────────────────────────────────────────────────────────────────

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
  assets: { providerOverride: null, mode: 'generate' as const },
}

describe('OverviewTimeline', () => {
  it('renders brainstorm row as running and all others as pending when stageResults is empty and machine is at brainstorm', () => {
    snapshotOverride = makeSnapshot({ stateValue: 'brainstorm' })

    render(<OverviewTimeline setShowEngine={vi.fn()} />)

    const brainstormRow = screen.getByTestId('stage-row-brainstorm')
    const researchRow = screen.getByTestId('stage-row-research')

    // Running state has the specific CSS class
    expect(brainstormRow.className).toContain('border-l-2')
    // Pending rows do not have border-l-2
    expect(researchRow.className).not.toContain('border-l-2')
  })

  it('renders brainstorm as completed with summary and research as running', () => {
    snapshotOverride = makeSnapshot({
      stateValue: 'research',
      stageResults: {
        brainstorm: {
          ideaId: 'idea-1',
          ideaTitle: 'My Great Idea',
          ideaVerdict: 'strong',
          ideaCoreTension: 'tension',
          completedAt: '2026-01-01T00:00:00Z',
        },
      },
    })

    render(<OverviewTimeline setShowEngine={vi.fn()} />)

    // Brainstorm should show "Open engine" button (completed)
    expect(screen.getByRole('button', { name: /open engine/i })).toBeInTheDocument()
    // Brainstorm summary
    expect(screen.getByText('My Great Idea (strong)')).toBeInTheDocument()

    // Research row should be running
    const researchRow = screen.getByTestId('stage-row-research')
    expect(researchRow.className).toContain('border-l-2')
  })

  it('renders assets row as skipped when assets.mode is skip', () => {
    const skippedAssetsConfig = {
      ...STANDARD_AUTOPILOT_CONFIG,
      assets: { providerOverride: null, mode: 'skip' as const },
    }

    snapshotOverride = makeSnapshot({
      stateValue: 'brainstorm',
      autopilotConfig: skippedAssetsConfig,
    })

    render(<OverviewTimeline setShowEngine={vi.fn()} />)

    const assetsRow = screen.getByTestId('stage-row-assets')
    // Skipped rows do not have border-l-2 (not running)
    expect(assetsRow.className).not.toContain('border-l-2')
    // No progress bar should be present in assets row
    expect(assetsRow.querySelector('.bg-primary')).toBeNull()
  })
})
