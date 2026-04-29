import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createActor } from 'xstate'
import { reproduceActor, abortRequester } from '../actors.js'

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

describe('abortRequester', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('PATCHes /api/projects/:id/abort on input.projectId', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchSpy)
    const actor = createActor(abortRequester, { input: { projectId: 'p1' } })
    actor.start()

    await new Promise<void>((resolve) => {
      actor.subscribe((snap) => {
        if (snap.status === 'done') resolve()
      })
    })

    expect(fetchSpy).toHaveBeenCalledWith('/api/projects/p1/abort', { method: 'PATCH' })
    vi.unstubAllGlobals()
  })

  it('rejects on non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const actor = createActor(abortRequester, { input: { projectId: 'p1' } })
    let caughtError: unknown = null
    actor.subscribe({ error: (err) => { caughtError = err } })
    actor.start()

    // wait for promise rejection to propagate
    await new Promise((r) => setTimeout(r, 10))
    expect(caughtError).toBeInstanceOf(Error)
    expect((caughtError as Error).message).toMatch(/Failed to request abort/)
    vi.unstubAllGlobals()
  })
})
