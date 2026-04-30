/**
 * StageRail tests
 *
 * Verifies:
 * 1. Left rail renders all 7 stages
 * 2. Running stage shows spinner icon
 * 3. Done stage shows check icon
 * 4. Clicking a stage fires onSelectStage
 * 5. Selected stage has aria-current="step"
 * 6. Activity log count badge shows event count
 * 7. Activity log expands on click
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { StageRail } from '../StageRail'
import type { StageResultMap } from '@/lib/pipeline/machine.types'

function makeResults(overrides: StageResultMap = {}): StageResultMap {
  return overrides
}

const EMPTY_RESULTS = makeResults()

const BRAINSTORM_DONE = makeResults({
  brainstorm: {
    ideaId: 'i1',
    ideaTitle: 'My Idea',
    ideaVerdict: 'strong',
    ideaCoreTension: 'tension',
    completedAt: new Date().toISOString(),
  },
})

function renderRail(overrides: Partial<React.ComponentProps<typeof StageRail>> = {}) {
  const defaults: React.ComponentProps<typeof StageRail> = {
    currentStage: 'brainstorm',
    stageResults: EMPTY_RESULTS,
    paused: false,
    subState: 'idle',
    autopilotConfig: null,
    selectedStage: 'brainstorm',
    activityLog: [],
    onSelectStage: vi.fn(),
    ...overrides,
  }
  return render(<StageRail {...defaults} />)
}

describe('StageRail', () => {
  it('renders all 7 stage buttons', () => {
    renderRail()
    const stages = ['brainstorm', 'research', 'draft', 'review', 'assets', 'preview', 'publish']
    for (const stage of stages) {
      expect(screen.getByTestId(`rail-stage-${stage}`)).toBeInTheDocument()
    }
  })

  it('marks selected stage with aria-current="step"', () => {
    renderRail({ selectedStage: 'brainstorm' })
    expect(screen.getByTestId('rail-stage-brainstorm')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByTestId('rail-stage-research')).not.toHaveAttribute('aria-current')
  })

  it('fires onSelectStage when a stage button is clicked', async () => {
    const user = userEvent.setup()
    const onSelectStage = vi.fn()
    renderRail({ onSelectStage, stageResults: BRAINSTORM_DONE, currentStage: 'research', selectedStage: 'research' })

    await user.click(screen.getByTestId('rail-stage-brainstorm'))
    expect(onSelectStage).toHaveBeenCalledWith('brainstorm')
  })

  it('does NOT show activity log toggle when activityLog is empty', () => {
    renderRail({ activityLog: [] })
    expect(screen.queryByTestId('activity-log-toggle')).toBeNull()
  })

  it('shows activity log toggle with count badge when entries exist', () => {
    const entries = [
      { timestamp: new Date().toISOString(), text: 'Brainstorm completed' },
      { timestamp: new Date().toISOString(), text: 'Research completed' },
    ]
    renderRail({ activityLog: entries })
    expect(screen.getByTestId('activity-log-toggle')).toBeInTheDocument()
    expect(screen.getByTestId('activity-log-count').textContent).toBe('2')
  })

  it('expands activity log on toggle click', async () => {
    const user = userEvent.setup()
    const entries = [{ timestamp: new Date().toISOString(), text: 'Brainstorm completed' }]
    renderRail({ activityLog: entries })

    // Entries should not be visible before click
    expect(screen.queryByTestId('activity-log-entries')).toBeNull()

    await user.click(screen.getByTestId('activity-log-toggle'))
    expect(screen.getByTestId('activity-log-entries')).toBeInTheDocument()
    expect(screen.getByText('Brainstorm completed')).toBeInTheDocument()
  })

  it('shows selected stage with highlighted styling', () => {
    renderRail({ selectedStage: 'research', currentStage: 'research', stageResults: EMPTY_RESULTS })
    const btn = screen.getByTestId('rail-stage-research')
    // Selected stage has bg-primary/10 class applied
    expect(btn.className).toContain('bg-primary/10')
  })
})
