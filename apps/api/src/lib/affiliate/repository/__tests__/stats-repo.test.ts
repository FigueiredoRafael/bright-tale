import { describe, it, expect, vi } from 'vitest'
import { createStatsRepo } from '../stats-repo'

function makeStatsClient(rows: Array<{ status: string; total_brl: number }>) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: rows, error: null })),
      })),
    })),
  } as any
}

function makeErrorStatsClient(err: { message: string }) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: err })),
      })),
    })),
  } as any
}

function makeCountClient(count: number | null, error: { message: string } | null = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        not: vi.fn(() => Promise.resolve({ count, error })),
      })),
    })),
  } as any
}

describe('stats-repo: getStats', () => {
  it('returns zeros for empty result', async () => {
    const sb = makeStatsClient([])
    const result = await createStatsRepo(sb).getStats('aff-1')
    expect(result).toEqual({ pendingPayoutBrl: 0, paidPayoutBrl: 0 })
  })

  it('only "completed" payouts contribute to paidPayoutBrl', async () => {
    const sb = makeStatsClient([
      { status: 'completed', total_brl: 100 },
      { status: 'completed', total_brl: 250 },
    ])
    const result = await createStatsRepo(sb).getStats('aff-1')
    expect(result).toEqual({ pendingPayoutBrl: 0, paidPayoutBrl: 350 })
  })

  it('pending + approved + processing all sum to pendingPayoutBrl', async () => {
    const sb = makeStatsClient([
      { status: 'pending', total_brl: 50 },
      { status: 'approved', total_brl: 75 },
      { status: 'processing', total_brl: 25 },
    ])
    const result = await createStatsRepo(sb).getStats('aff-1')
    expect(result).toEqual({ pendingPayoutBrl: 150, paidPayoutBrl: 0 })
  })

  it('rejected and failed statuses are ignored', async () => {
    const sb = makeStatsClient([
      { status: 'rejected', total_brl: 999 },
      { status: 'failed', total_brl: 888 },
      { status: 'completed', total_brl: 10 },
      { status: 'pending', total_brl: 20 },
    ])
    const result = await createStatsRepo(sb).getStats('aff-1')
    expect(result).toEqual({ pendingPayoutBrl: 20, paidPayoutBrl: 10 })
  })

  it('throws when supabase returns an error', async () => {
    const sb = makeErrorStatsClient({ message: 'db down' })
    await expect(createStatsRepo(sb).getStats('aff-1')).rejects.toBeTruthy()
  })

  it('handles null data gracefully', async () => {
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    } as any
    const result = await createStatsRepo(sb).getStats('aff-1')
    expect(result).toEqual({ pendingPayoutBrl: 0, paidPayoutBrl: 0 })
  })
})

describe('stats-repo: getPendingContractsCount', () => {
  it('returns count from supabase result', async () => {
    const sb = makeCountClient(7)
    const count = await createStatsRepo(sb).getPendingContractsCount()
    expect(count).toBe(7)
  })

  it('returns 0 when count is null', async () => {
    const sb = makeCountClient(null)
    const count = await createStatsRepo(sb).getPendingContractsCount()
    expect(count).toBe(0)
  })

  it('throws when supabase returns an error', async () => {
    const sb = makeCountClient(null, { message: 'db down' })
    await expect(createStatsRepo(sb).getPendingContractsCount()).rejects.toBeTruthy()
  })
})
