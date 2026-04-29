import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { StageRow } from '../StageRow'

describe('StageRow', () => {
  it('renders running state with status text + progress bar', () => {
    render(
      <StageRow
        stage="brainstorm"
        label="Brainstorm"
        state="running"
        status="Generating ideas…"
        current={3}
        total={10}
      />,
    )

    const row = screen.getByTestId('stage-row-brainstorm')
    expect(row).toBeInTheDocument()
    expect(screen.getByText('Generating ideas…')).toBeInTheDocument()
    // Progress bar: width should be 30%
    const bar = row.querySelector('.bg-primary')
    expect(bar).toBeInTheDocument()
    expect((bar as HTMLElement).style.width).toBe('30%')
  })

  it('renders completed state with summary + Open engine button', async () => {
    const onOpenEngine = vi.fn()
    render(
      <StageRow
        stage="brainstorm"
        label="Brainstorm"
        state="completed"
        summary="Great idea (strong)"
        onOpenEngine={onOpenEngine}
      />,
    )

    expect(screen.getByText('Great idea (strong)')).toBeInTheDocument()
    const btn = screen.getByRole('button', { name: /open engine/i })
    expect(btn).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(btn)
    expect(onOpenEngine).toHaveBeenCalledTimes(1)
  })

  it('renders pending state with circle icon, no status text or progress bar', () => {
    render(
      <StageRow
        stage="research"
        label="Research"
        state="pending"
      />,
    )

    const row = screen.getByTestId('stage-row-research')
    expect(row).toBeInTheDocument()
    // No status text
    expect(row.querySelector('.bg-primary')).toBeNull()
    // No "Open engine" button
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders skipped state with minus icon', () => {
    render(
      <StageRow
        stage="review"
        label="Review"
        state="skipped"
      />,
    )

    const row = screen.getByTestId('stage-row-review')
    expect(row).toBeInTheDocument()
    // Skipped — no progress bar, no open engine
    expect(row.querySelector('.bg-primary')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    // Should show the label
    expect(screen.getByText('Review')).toBeInTheDocument()
  })
})
