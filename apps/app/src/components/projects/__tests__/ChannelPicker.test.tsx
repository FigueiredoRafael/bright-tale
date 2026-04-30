import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { ChannelPicker } from '../ChannelPicker'

beforeEach(() => { localStorage.clear() })

const channels = [
  { id: 'c1', name: 'Alpha' },
  { id: 'c2', name: 'Beta' },
  { id: 'c3', name: 'Gamma' },
  { id: 'c4', name: 'Delta' },
  { id: 'c5', name: 'Epsilon' },
]

describe('ChannelPicker', () => {
  it('renders channels with recent group + divider + alphabetical group', () => {
    // Make c4 and c5 recent
    localStorage.setItem('lastVisitedChannelAt:c4', '2026-04-29T11:00:00Z')
    localStorage.setItem('lastVisitedChannelAt:c5', '2026-04-29T10:00:00Z')

    render(<ChannelPicker channels={channels} onSelect={vi.fn()} />)

    expect(screen.getAllByTestId('channel-option')).toHaveLength(5)
    expect(screen.getByTestId('channel-divider')).toBeInTheDocument()
  })

  it('clicking a channel option calls onSelect with channel id', () => {
    const onSelect = vi.fn()
    render(<ChannelPicker channels={channels} onSelect={onSelect} />)
    fireEvent.click(screen.getAllByTestId('channel-option')[0])
    expect(onSelect).toHaveBeenCalledWith(channels[0].id)
  })

  it('renders empty state when no channels exist', () => {
    render(<ChannelPicker channels={[]} onSelect={vi.fn()} />)
    expect(screen.getByText(/create your first channel/i)).toBeInTheDocument()
  })

  it('shows no divider when all channels are alphabetical (none recent)', () => {
    render(<ChannelPicker channels={channels} onSelect={vi.fn()} />)
    expect(screen.queryByTestId('channel-divider')).not.toBeInTheDocument()
  })

  it('shows no divider when all channels are recent', () => {
    // Only 2 channels, both recent — no alphabetical tail
    const twoChannels = [
      { id: 'c1', name: 'Alpha' },
      { id: 'c2', name: 'Beta' },
    ]
    localStorage.setItem('lastVisitedChannelAt:c1', '2026-04-29T11:00:00Z')
    localStorage.setItem('lastVisitedChannelAt:c2', '2026-04-29T10:00:00Z')

    render(<ChannelPicker channels={twoChannels} onSelect={vi.fn()} />)
    expect(screen.queryByTestId('channel-divider')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('channel-option')).toHaveLength(2)
  })
})
