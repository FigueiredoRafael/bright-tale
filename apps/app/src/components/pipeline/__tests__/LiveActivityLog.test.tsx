import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { LiveActivityLog, type ActivityEntry } from '../LiveActivityLog'

function makeEntries(count: number): ActivityEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: new Date(2026, 0, 1, 12, i, 0).toISOString(),
    text: `Event ${i + 1}`,
  }))
}

describe('LiveActivityLog', () => {
  it('renders null when entries is empty', () => {
    const { container } = render(<LiveActivityLog entries={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows at most 5 entries when given 7', () => {
    const entries = makeEntries(7)
    render(<LiveActivityLog entries={entries} />)

    // Entries 3-7 (last 5) should appear; entries 1-2 should not
    expect(screen.queryByText('Event 1')).toBeNull()
    expect(screen.queryByText('Event 2')).toBeNull()
    expect(screen.getByText('Event 3')).toBeInTheDocument()
    expect(screen.getByText('Event 7')).toBeInTheDocument()
  })

  it('shows entries in reverse order (newest first)', () => {
    const entries = makeEntries(3)
    const { container } = render(<LiveActivityLog entries={entries} />)

    // Each entry renders as a <p>. Grab them in DOM order (excluding the heading).
    const paragraphs = Array.from(container.querySelectorAll('p.text-xs'))
    // Reversed: Event 3 first, Event 1 last
    expect(paragraphs[0].textContent).toContain('Event 3')
    expect(paragraphs[1].textContent).toContain('Event 2')
    expect(paragraphs[2].textContent).toContain('Event 1')
  })
})
