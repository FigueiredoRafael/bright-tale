import { describe, it, expect } from 'vitest'
import { JobAborted, assertNotAborted, sleepCancellable } from '../abortable.js'

describe('JobAborted', () => {
  it('extends Error and is non-retriable', () => {
    const e = new JobAborted('p1')
    expect(e).toBeInstanceOf(Error)
    expect((e as { noRetry?: boolean }).noRetry).toBe(true)
  })
})

describe('assertNotAborted', () => {
  it('throws JobAborted when projects.abort_requested_at is set', async () => {
    const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { abort_requested_at: '2026-04-28T00:00:00Z' } }) }) }) }) } as never
    await expect(assertNotAborted('p1', undefined, sb)).rejects.toBeInstanceOf(JobAborted)
  })
  it('no-ops when projectId is undefined (bulk path)', async () => {
    await expect(assertNotAborted(undefined, undefined, {} as never)).resolves.toBeUndefined()
  })
  it('does not throw when abort_requested_at is null', async () => {
    const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { abort_requested_at: null } }) }) }) }) } as never
    await expect(assertNotAborted('p1', undefined, sb)).resolves.toBeUndefined()
  })
})

describe('sleepCancellable', () => {
  it('rejects fast on already-aborted signal', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(sleepCancellable(1000, ac.signal)).rejects.toThrow()
  })
  it('rejects when signal aborts mid-sleep', async () => {
    const ac = new AbortController()
    const p = sleepCancellable(5000, ac.signal)
    setTimeout(() => ac.abort(), 10)
    await expect(p).rejects.toThrow()
  })
  it('resolves after timeout when not aborted', async () => {
    await expect(sleepCancellable(20)).resolves.toBeUndefined()
  })
})
