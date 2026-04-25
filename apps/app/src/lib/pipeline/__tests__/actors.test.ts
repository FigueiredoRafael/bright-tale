import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createActor } from 'xstate'
import { reproduceActor } from '../actors'

describe('reproduceActor', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves when API returns no error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {}, error: null }),
    }))

    const actor = createActor(reproduceActor, {
      input: { draftId: 'd-1', feedbackJson: { issues: ['clarity'] } },
    })
    actor.start()

    await new Promise<void>((resolve, reject) => {
      actor.subscribe((snap) => {
        if (snap.status === 'done') resolve()
        if (snap.status === 'error') reject(snap.error)
      })
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/content-drafts/d-1/reproduce',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('throws when API returns error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: null, error: { message: 'Reproduce failed' } }),
    }))

    const actor = createActor(reproduceActor, {
      input: { draftId: 'd-1', feedbackJson: {} },
    })
    actor.start()

    // XState v5's fromPromise emits state changes via getSnapshot() polling
    // rather than through subscription callbacks for error states
    const error = await new Promise<unknown>((resolve, reject) => {
      const checkState = () => {
        const snap = actor.getSnapshot()
        if (snap.status === 'error') {
          resolve(snap.error)
        } else if (snap.status === 'done') {
          reject(new Error('Expected error but got done'))
        } else {
          setTimeout(checkState, 5)
        }
      }
      checkState()
      setTimeout(() => reject(new Error('Timeout waiting for error state')), 2000)
    })

    expect(error instanceof Error ? error.message : String(error)).toBe('Reproduce failed')
  })
})
