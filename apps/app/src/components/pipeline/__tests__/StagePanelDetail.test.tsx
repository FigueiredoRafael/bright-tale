/**
 * StagePanelDetail tests
 *
 * Verifies:
 * 1. Panel renders header with stage name + status pill
 * 2. "Back to live" button appears when selectedStage !== currentStage
 * 3. "Back to live" button is absent when selectedStage === currentStage
 * 4. Clicking "Back to live" calls onBackToLive
 * 5. "Open engine" button appears when stage has result or is running
 * 6. Clicking "Open engine" calls onOpenEngine with the stage
 * 7. Empty state rendered when stage has no result
 * 8. CompletedStageSummary-ported logic: no [object Object] for feedbackJson
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

vi.mock('@brighttale/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@brighttale/shared')>()
  return { ...actual }
})

import { StagePanelDetail } from '../StagePanelDetail'
import type { PipelineStage } from '@/components/engines/types'
import type { StageResultMap } from '@/lib/pipeline/machine.types'

function makePanel(
  overrides: Partial<React.ComponentProps<typeof StagePanelDetail>> = {},
) {
  const defaults: React.ComponentProps<typeof StagePanelDetail> = {
    selectedStage: 'brainstorm',
    currentStage: 'brainstorm',
    stageResults: {},
    paused: false,
    subState: 'idle',
    autopilotConfig: null,
    onOpenEngine: vi.fn(),
    onRedoFrom: vi.fn(),
    onBackToLive: vi.fn(),
    ...overrides,
  }
  return render(<StagePanelDetail {...defaults} />)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeBrainstormResults(): StageResultMap {
  return {
    brainstorm: {
      ideaId: 'i1',
      ideaTitle: 'A Great Idea',
      ideaVerdict: 'strong',
      ideaCoreTension: 'Core tension text',
      brainstormSessionId: 'bs-session-1',
      completedAt: new Date().toISOString(),
    },
  }
}

function makeReviewResults(): StageResultMap {
  return {
    review: {
      score: 72,
      qualityTier: 'good',
      verdict: 'needs_revision',
      feedbackJson: { blog_review: { score: 72, detailed: 'object' } },
      latestFeedbackJson: { blog_review: { score: 72, detailed: 'object' } },
      iterationCount: 2,
      iterations: [
        { iterationNum: 1, score: 55, verdict: 'needs_revision', oneLineSummary: 'First pass', timestamp: new Date().toISOString() },
        { iterationNum: 2, score: 72, verdict: 'needs_revision', oneLineSummary: 'Better', timestamp: new Date().toISOString() },
      ],
      completedAt: new Date().toISOString(),
    },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StagePanelDetail — header', () => {
  it('renders the stage name in the header', () => {
    makePanel({ selectedStage: 'brainstorm', currentStage: 'brainstorm' })
    expect(screen.getByText('Brainstorm')).toBeInTheDocument()
  })

  it('shows status pill', () => {
    makePanel({ selectedStage: 'brainstorm', currentStage: 'brainstorm' })
    // Running status pill (current stage with no result = running)
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('shows Done pill when stage has completedAt', () => {
    makePanel({
      selectedStage: 'brainstorm',
      currentStage: 'research',
      stageResults: makeBrainstormResults(),
    })
    expect(screen.getByText('Done')).toBeInTheDocument()
  })
})

describe('StagePanelDetail — back-to-live', () => {
  it('hides Back-to-live when selectedStage === currentStage', () => {
    makePanel({ selectedStage: 'brainstorm', currentStage: 'brainstorm' })
    expect(screen.queryByTestId('back-to-live-btn')).toBeNull()
  })

  it('shows Back-to-live when viewing a non-live stage', () => {
    makePanel({
      selectedStage: 'brainstorm',
      currentStage: 'research',
      stageResults: makeBrainstormResults(),
    })
    expect(screen.getByTestId('back-to-live-btn')).toBeInTheDocument()
  })

  it('calls onBackToLive when Back-to-live is clicked', async () => {
    const user = userEvent.setup()
    const onBackToLive = vi.fn()
    makePanel({
      selectedStage: 'brainstorm',
      currentStage: 'research',
      stageResults: makeBrainstormResults(),
      onBackToLive,
    })
    await user.click(screen.getByTestId('back-to-live-btn'))
    expect(onBackToLive).toHaveBeenCalledTimes(1)
  })
})

describe('StagePanelDetail — open-engine button', () => {
  it('shows Open engine when stage is done', () => {
    makePanel({
      selectedStage: 'brainstorm',
      currentStage: 'research',
      stageResults: makeBrainstormResults(),
    })
    expect(screen.getByTestId('open-engine-brainstorm')).toBeInTheDocument()
  })

  it('calls onOpenEngine with stage on click', async () => {
    const user = userEvent.setup()
    const onOpenEngine = vi.fn()
    makePanel({
      selectedStage: 'brainstorm',
      currentStage: 'research',
      stageResults: makeBrainstormResults(),
      onOpenEngine,
    })
    await user.click(screen.getByTestId('open-engine-brainstorm'))
    expect(onOpenEngine).toHaveBeenCalledWith('brainstorm')
  })

  it('hides Open engine when stage is queued with no result', () => {
    makePanel({ selectedStage: 'research', currentStage: 'brainstorm', stageResults: {} })
    expect(screen.queryByTestId('open-engine-research')).toBeNull()
  })
})

describe('StagePanelDetail — empty state', () => {
  it('shows waiting message for queued stage', () => {
    makePanel({ selectedStage: 'research', currentStage: 'brainstorm', stageResults: {} })
    expect(screen.getByText('Waiting for previous stage…')).toBeInTheDocument()
  })
})

describe('StagePanelDetail — brainstorm detail body', () => {
  it('renders idea title in highlight section', () => {
    makePanel({
      selectedStage: 'brainstorm',
      currentStage: 'research',
      stageResults: makeBrainstormResults(),
    })
    expect(screen.getByText('A Great Idea')).toBeInTheDocument()
  })

  it('renders verdict KPI', () => {
    makePanel({
      selectedStage: 'brainstorm',
      currentStage: 'research',
      stageResults: makeBrainstormResults(),
    })
    expect(screen.getByText('strong')).toBeInTheDocument()
  })

  it('renders core tension quote', () => {
    makePanel({
      selectedStage: 'brainstorm',
      currentStage: 'research',
      stageResults: makeBrainstormResults(),
    })
    // The component wraps the text in curly-quote entities; just check for the text content
    expect(screen.getByText(/Core tension text/)).toBeInTheDocument()
  })
})

describe('StagePanelDetail — review detail body (CompletedStageSummary logic ported)', () => {
  it('does NOT render [object Object] for feedbackJson', () => {
    makePanel({
      selectedStage: 'review',
      currentStage: 'publish',
      stageResults: makeReviewResults(),
    })
    expect(screen.queryByText(/\[object Object\]/i)).toBeNull()
  })

  it('renders score as a KPI', () => {
    makePanel({
      selectedStage: 'review',
      currentStage: 'publish',
      stageResults: makeReviewResults(),
    })
    // StagePanelDetail is a standalone component (no duplicate mobile rendering here)
    const scoreEls = screen.getAllByText('72/100')
    expect(scoreEls.length).toBeGreaterThan(0)
  })

  it('renders iteration history', () => {
    makePanel({
      selectedStage: 'review',
      currentStage: 'publish',
      stageResults: makeReviewResults(),
    })
    expect(screen.getByText(/First pass/)).toBeInTheDocument()
    expect(screen.getByText(/Better/)).toBeInTheDocument()
  })
})
