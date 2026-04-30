import { renderHook } from '@testing-library/react'
import { beforeEach, it, expect, describe } from 'vitest'
import { usePinnedChannels } from '../usePinnedChannels'

beforeEach(() => { localStorage.clear() })

describe('usePinnedChannels', () => {
  it('returns channels sorted alphabetically when no localStorage entries', () => {
    const { result } = renderHook(() => usePinnedChannels([
      { id: 'c1', name: 'Beta' },
      { id: 'c2', name: 'Alpha' },
    ]))
    expect(result.current).toEqual([
      { id: 'c2', name: 'Alpha', recent: false },
      { id: 'c1', name: 'Beta', recent: false },
    ])
  })

  it('puts up to 3 most-recent channels first', () => {
    localStorage.setItem('lastVisitedChannelAt:c2', '2026-04-29T10:00:00Z')
    localStorage.setItem('lastVisitedChannelAt:c1', '2026-04-29T11:00:00Z')
    const { result } = renderHook(() => usePinnedChannels([
      { id: 'c1', name: 'Beta' }, { id: 'c2', name: 'Alpha' }, { id: 'c3', name: 'Gamma' },
    ]))
    expect(result.current.map((c) => c.id)).toEqual(['c1', 'c2', 'c3'])
    expect(result.current[0].recent).toBe(true)
    expect(result.current[1].recent).toBe(true)
    expect(result.current[2].recent).toBe(false)
  })

  it('caps recent list at 3 entries', () => {
    localStorage.setItem('lastVisitedChannelAt:c1', '2026-04-29T15:00:00Z')
    localStorage.setItem('lastVisitedChannelAt:c2', '2026-04-29T14:00:00Z')
    localStorage.setItem('lastVisitedChannelAt:c3', '2026-04-29T13:00:00Z')
    localStorage.setItem('lastVisitedChannelAt:c4', '2026-04-29T12:00:00Z')
    localStorage.setItem('lastVisitedChannelAt:c5', '2026-04-29T11:00:00Z')
    const { result } = renderHook(() => usePinnedChannels([
      { id: 'c1', name: 'Chan1' },
      { id: 'c2', name: 'Chan2' },
      { id: 'c3', name: 'Chan3' },
      { id: 'c4', name: 'Chan4' },
      { id: 'c5', name: 'Chan5' },
    ]))
    // First 3 should be recent, last 2 should not
    expect(result.current.slice(0, 3).every((c) => c.recent)).toBe(true)
    expect(result.current.slice(3).every((c) => !c.recent)).toBe(true)
    // The 3 most recent by timestamp come first
    expect(result.current[0].id).toBe('c1')
    expect(result.current[1].id).toBe('c2')
    expect(result.current[2].id).toBe('c3')
  })
})
