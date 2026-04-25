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

    const error = await new Promise<unknown>((resolve) => {
      actor.subscribe({
        error: (err) => resolve(err),
      })
      actor.start()
    })

    expect(error instanceof Error ? error.message : String(error)).toBe('Reproduce failed')
  })
})
