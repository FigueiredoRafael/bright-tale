/**
 * CompletedStageSummary — Fix 2 regression tests (pipeline-autopilot-wizard-impl)
 *
 * Verifies that:
 * 1. feedbackJson / latestFeedbackJson keys are filtered out entirely (no [object Object]).
 * 2. Array values show a count summary ("N item(s)"), not a join of objects.
 * 3. Non-object / non-array values render as plain strings.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// Minimal stubs — CompletedStageSummary has no provider dependencies
vi.mock('@brighttale/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@brighttale/shared')>()
  return { ...actual }
})

import { CompletedStageSummary } from '../CompletedStageSummary'
import type { PipelineStage } from '@/components/engines/types'
import type { StageResultMap } from '@/lib/pipeline/machine.types'

afterEach(() => {
  vi.clearAllMocks()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReviewResult(overrides: Partial<StageResultMap['review']> = {}): StageResultMap {
  return {
    review: {
      score: 60,
      verdict: 'needs_revision',
      qualityTier: 'needs_revision',
      feedbackJson: { blog_review: { score: 60 } },
      latestFeedbackJson: { blog_review: { score: 60 } },
      iterationCount: 1,
      iterations: [{ iterationNum: 1, score: 60, verdict: 'needs_revision', oneLineSummary: 'Needs work', timestamp: new Date().toISOString() }],
      completedAt: new Date().toISOString(),
      ...overrides,
    },
  }
}

/**
 * Mount with currentStage matching stage so the card starts expanded by default.
 * This avoids needing to click the icon-only chevron button.
 */
function mount(
  stageResults: StageResultMap,
  stage: PipelineStage = 'review',
) {
  return render(
    <CompletedStageSummary
      stage={stage}
      stageResults={stageResults}
      // Use stage as currentStage → card starts expanded (no click needed)
      currentStage={stage}
      onNavigate={vi.fn()}
      onRedoFrom={undefined}
    />,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// Card starts expanded when currentStage === stage (see component logic),
// so no click is needed to reveal the details panel.

describe('CompletedStageSummary — expanded details panel', () => {
  it('does NOT render [object Object] for feedbackJson', () => {
    mount(makeReviewResult())
    expect(screen.queryByText(/\[object Object\]/i)).toBeNull()
  })

  it('filters out feedbackJson and latestFeedbackJson keys entirely', () => {
    mount(makeReviewResult())
    expect(screen.queryAllByText(/feedbackJson|latestFeedbackJson/)).toHaveLength(0)
  })

  it('renders array value as "N item(s)" summary, not raw join', () => {
    mount(makeReviewResult())
    // iterations is an array of 1 object — must show "1 item(s)"
    expect(screen.getByText('1 item(s)')).toBeTruthy()
  })

  it('renders empty array as "—"', () => {
    mount(makeReviewResult({ iterations: [] }))
    // iterations key should show "—"
    const iterLabel = screen.getByText('iterations:')
    const row = iterLabel.closest('div')
    expect(row?.textContent).toContain('—')
  })

  it('renders plain numeric value as string', () => {
    mount(makeReviewResult())
    // score: 60 → "60"
    const scoreLabel = screen.getByText('score:')
    const row = scoreLabel.closest('div')
    expect(row?.textContent).toContain('60')
  })

  it('renders plain string value correctly', () => {
    mount(makeReviewResult())
    // verdict: needs_revision
    const verdictLabel = screen.getByText('verdict:')
    const row = verdictLabel.closest('div')
    expect(row?.textContent).toContain('needs_revision')
  })
})
