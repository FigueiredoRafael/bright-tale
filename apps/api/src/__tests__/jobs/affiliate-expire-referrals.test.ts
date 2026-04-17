import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
}))

vi.mock('@/jobs/client.js', () => ({
  inngest: {
    createFunction: (cfg: unknown, handler: unknown) => ({ handler, cfg }),
  },
}))

const mockExecute = vi.fn()

vi.mock('@/lib/affiliate/container.js', () => ({
  buildAffiliateContainer: vi.fn(() => ({
    expirePendingUseCase: { execute: mockExecute },
  })),
}))

import * as Sentry from '@sentry/node'
import { affiliateExpireReferrals } from '@/jobs/affiliate-expire-referrals'

interface JobShape {
  handler: (ctx: { step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => Promise<{ totalExpired: number; ranAt: string }>
  cfg: { id: string; retries: number; triggers: Array<{ cron: string }> }
}

describe('affiliate-expire-referrals job', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes expected inngest config (id, retries, cron trigger)', () => {
    const job = affiliateExpireReferrals as unknown as JobShape
    expect(job.cfg.id).toBe('affiliate-expire-referrals')
    expect(job.cfg.retries).toBe(2)
    expect(job.cfg.triggers).toEqual([{ cron: '0 5 * * *' }])
  })

  it('happy path: invokes step.run once and returns { totalExpired, ranAt }', async () => {
    mockExecute.mockResolvedValueOnce({ totalExpired: 5 })
    const stepRun = vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn())
    const job = affiliateExpireReferrals as unknown as JobShape
    const result = await job.handler({ step: { run: stepRun } })
    expect(stepRun).toHaveBeenCalledTimes(1)
    expect(stepRun).toHaveBeenCalledWith('expire-pending-referrals', expect.any(Function))
    expect(mockExecute).toHaveBeenCalledTimes(1)
    expect(mockExecute).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-/))
    expect(result.totalExpired).toBe(5)
    expect(result.ranAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('failure path: captures via Sentry with job tag and re-throws', async () => {
    const boom = new Error('boom')
    const stepRun = vi.fn().mockRejectedValueOnce(boom)
    const job = affiliateExpireReferrals as unknown as JobShape
    await expect(job.handler({ step: { run: stepRun } })).rejects.toThrow('boom')
    expect(Sentry.captureException).toHaveBeenCalledWith(boom, {
      tags: { job: 'affiliate-expire-referrals' },
    })
  })

  it('passes ISO-formatted "now" to expirePendingUseCase.execute', async () => {
    mockExecute.mockResolvedValueOnce({ totalExpired: 0 })
    const stepRun = vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn())
    const job = affiliateExpireReferrals as unknown as JobShape
    await job.handler({ step: { run: stepRun } })
    const arg = mockExecute.mock.calls[0][0]
    expect(typeof arg).toBe('string')
    // Parseable as a valid date
    expect(Number.isNaN(new Date(arg).getTime())).toBe(false)
  })
})
