/**
 * V2-006.3 — Unit tests for withReservation wrapper (cleaned V2-006.7).
 *
 * Uses vi.hoisted + chainable mock pattern.
 * Category A — no DB dependency.
 *
 * Scenarios:
 *   (a) success → commit called at actualCost (returned by setActualCost)
 *   (b) throw inside fn → release called, error re-thrown
 *   (c) assertNotAborted throws JobAborted → release called, no commit
 *   (d) success but actualCost > estimatedCost → commit is called
 *       (the RPC enforces cap; wrapper surfaces whatever commit throws)
 *
 * NOTE: the legacy-path (flag OFF) tests have been removed in V2-006.7.
 * The wrapper no longer consults the feature flag; it always uses reservations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mock factories ─────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  // Vitest v4 uses a single function-type generic for vi.fn
  const reserve = vi.fn<(orgId: string, userId: string, cost: number) => Promise<string>>()
  const commit = vi.fn<(token: string, actualCost: number, action: string, category: string, metadata?: Record<string, unknown>) => Promise<void>>()
  const release = vi.fn<(token: string) => Promise<void>>()

  return { reserve, commit, release }
})

vi.mock('../../lib/credits/reservations.js', () => ({
  reserve: mocks.reserve,
  commit: mocks.commit,
  release: mocks.release,
}))

import { withReservation } from '../utils/with-reservation.js'

describe('withReservation', () => {
  const orgId = 'org-001'
  const userId = 'user-001'
  const estimatedCost = 100
  const baseCommitArgs = {
    action: 'brainstorm',
    category: 'text',
    metadata: { channelId: 'ch-1' },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── (a) success path → commit at actualCost ────────────────────────────

  it('(a) success: reserves, calls fn, commits at actualCost set by setActualCost', async () => {
    mocks.reserve.mockResolvedValue('token-abc')
    mocks.commit.mockResolvedValue(undefined)

    const result = await withReservation(
      orgId,
      userId,
      estimatedCost,
      baseCommitArgs.action,
      baseCommitArgs.category,
      baseCommitArgs.metadata,
      async ({ token, setActualCost }) => {
        expect(token).toBe('token-abc')
        setActualCost(80)
        return 'done'
      },
    )

    expect(result).toBe('done')
    expect(mocks.reserve).toHaveBeenCalledOnce()
    expect(mocks.reserve).toHaveBeenCalledWith(orgId, userId, estimatedCost)
    expect(mocks.commit).toHaveBeenCalledOnce()
    expect(mocks.commit).toHaveBeenCalledWith('token-abc', 80, baseCommitArgs.action, baseCommitArgs.category, baseCommitArgs.metadata)
    expect(mocks.release).not.toHaveBeenCalled()
  })

  it('(a) success without setActualCost → commits at estimatedCost', async () => {
    mocks.reserve.mockResolvedValue('token-xyz')
    mocks.commit.mockResolvedValue(undefined)

    await withReservation(
      orgId,
      userId,
      estimatedCost,
      baseCommitArgs.action,
      baseCommitArgs.category,
      undefined,
      async () => 'result',
    )

    expect(mocks.commit).toHaveBeenCalledWith('token-xyz', estimatedCost, baseCommitArgs.action, baseCommitArgs.category, undefined)
    expect(mocks.release).not.toHaveBeenCalled()
  })

  // ── (b) fn throws → release, no commit, error re-thrown ───────────────

  it('(b) fn throws → release is called and error is re-thrown', async () => {
    mocks.reserve.mockResolvedValue('token-err')
    mocks.release.mockResolvedValue(undefined)

    const boom = new Error('AI failed')

    await expect(
      withReservation(
        orgId,
        userId,
        estimatedCost,
        baseCommitArgs.action,
        baseCommitArgs.category,
        undefined,
        async () => {
          throw boom
        },
      ),
    ).rejects.toThrow('AI failed')

    expect(mocks.release).toHaveBeenCalledOnce()
    expect(mocks.release).toHaveBeenCalledWith('token-err')
    expect(mocks.commit).not.toHaveBeenCalled()
  })

  // ── (c) assertNotAborted/JobAborted → release, re-throw ───────────────

  it('(c) JobAborted thrown inside fn → release called, abort error re-thrown', async () => {
    mocks.reserve.mockResolvedValue('token-abort')
    mocks.release.mockResolvedValue(undefined)

    // Simulate the JobAborted error class (NonRetriableError subclass in prod)
    class JobAborted extends Error {
      noRetry = true
      constructor(msg: string) {
        super(msg)
        this.name = 'JobAborted'
      }
    }

    const abortErr = new JobAborted('Job aborted for project proj-1')

    await expect(
      withReservation(
        orgId,
        userId,
        estimatedCost,
        'brainstorm',
        'text',
        undefined,
        async () => {
          throw abortErr
        },
      ),
    ).rejects.toThrow('Job aborted for project proj-1')

    expect(mocks.release).toHaveBeenCalledOnce()
    expect(mocks.release).toHaveBeenCalledWith('token-abort')
    expect(mocks.commit).not.toHaveBeenCalled()
  })

  // ── (d) actualCost > estimatedCost → commit is called (RPC enforces cap) ─

  it('(d) actualCost > estimatedCost → commit is called (RPC enforces cap)', async () => {
    mocks.reserve.mockResolvedValue('token-over')
    // Simulate commit failing with RESERVATION_OVER_CAP from the RPC
    const capError = Object.assign(new Error('Reservation over cap'), { code: 'RESERVATION_OVER_CAP' })
    mocks.commit.mockRejectedValue(capError)
    mocks.release.mockResolvedValue(undefined)

    await expect(
      withReservation(
        orgId,
        userId,
        estimatedCost,
        'brainstorm',
        'text',
        undefined,
        async ({ setActualCost }) => {
          setActualCost(estimatedCost + 50) // over cap
          return 'ok'
        },
      ),
    ).rejects.toThrow('Reservation over cap')

    // commit was attempted with the over-cap cost
    expect(mocks.commit).toHaveBeenCalledWith('token-over', estimatedCost + 50, 'brainstorm', 'text', undefined)
    // release is NOT called when commit itself throws (the reservation is committed/failed at RPC level)
    // per design: commit failure = RPC-level; release would double-touch the row
    expect(mocks.release).not.toHaveBeenCalled()
  })
})
