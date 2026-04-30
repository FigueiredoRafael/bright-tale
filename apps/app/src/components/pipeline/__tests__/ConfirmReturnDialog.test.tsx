import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { ConfirmReturnDialog } from '../ConfirmReturnDialog'

describe('ConfirmReturnDialog', () => {
  it('renders when open=true with two action buttons', () => {
    render(<ConfirmReturnDialog open={true} onContinue={vi.fn()} onStop={vi.fn()} />)
    expect(screen.getByRole('button', { name: /continue autopilot/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /finish manually/i })).toBeInTheDocument()
  })

  it('calls onContinue when continue button clicked', () => {
    const onContinue = vi.fn()
    render(<ConfirmReturnDialog open={true} onContinue={onContinue} onStop={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /continue autopilot/i }))
    expect(onContinue).toHaveBeenCalled()
  })

  it('calls onStop when finish manually clicked', () => {
    const onStop = vi.fn()
    render(<ConfirmReturnDialog open={true} onContinue={vi.fn()} onStop={onStop} />)
    fireEvent.click(screen.getByRole('button', { name: /finish manually/i }))
    expect(onStop).toHaveBeenCalled()
  })
})
