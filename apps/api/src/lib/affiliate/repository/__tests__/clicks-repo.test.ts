import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createClicksRepo } from '../clicks-repo'

describe('clicks-repo', () => {
  it('incrementClicks calls RPC with correct name + arg', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const sb = { rpc } as any
    await createClicksRepo(sb).incrementClicks('aff-1')
    expect(rpc).toHaveBeenCalledWith('increment_affiliate_clicks', { aff_id: 'aff-1' })
  })

  it('incrementClicks throws when RPC errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'boom' } })
    const sb = { rpc } as any
    await expect(createClicksRepo(sb).incrementClicks('aff-1')).rejects.toBeTruthy()
  })

  // ── getClicksByPlatform ──────────────────────────────────────────────
  function makeSelectChain(returnData: unknown) {
    const gte = vi.fn().mockResolvedValue({ data: returnData, error: null })
    const eq = vi.fn().mockReturnValue({ gte })
    const select = vi.fn().mockReturnValue({ eq })
    const sb = { from: vi.fn(() => ({ select })) }
    return { sb, select, eq, gte }
  }

  it('getClicksByPlatform returns empty array when data is empty', async () => {
    const { sb } = makeSelectChain([])
    const result = await createClicksRepo(sb as any).getClicksByPlatform('aff-1')
    expect(result).toEqual([])
  })

  it('getClicksByPlatform groups multiple rows: 2 youtube (1 converted) + 1 instagram (none)', async () => {
    const { sb } = makeSelectChain([
      { source_platform: 'youtube', converted_at: null },
      { source_platform: 'youtube', converted_at: '2026-04-10T00:00:00Z' },
      { source_platform: 'instagram', converted_at: null },
    ])
    const result = await createClicksRepo(sb as any).getClicksByPlatform('aff-1')
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ sourcePlatform: 'youtube', clicks: 2, conversions: 1 })
    expect(result).toContainEqual({ sourcePlatform: 'instagram', clicks: 1, conversions: 0 })
  })

  it("getClicksByPlatform groups source_platform: null rows under 'unknown'", async () => {
    const { sb } = makeSelectChain([
      { source_platform: null, converted_at: null },
      { source_platform: null, converted_at: '2026-04-10T00:00:00Z' },
    ])
    const result = await createClicksRepo(sb as any).getClicksByPlatform('aff-1')
    expect(result).toContainEqual({ sourcePlatform: 'unknown', clicks: 2, conversions: 1 })
  })

  describe('with fake timers for date assertions', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-04-17T00:00:00.000Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('getClicksByPlatform with days=7 filters gte("created_at", <7 days ago ISO>)', async () => {
      const { sb, gte } = makeSelectChain([])
      await createClicksRepo(sb as any).getClicksByPlatform('aff-1', 7)
      const expectedSince = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString()
      expect(gte).toHaveBeenCalledWith('created_at', expectedSince)
      expect(expectedSince).toBe('2026-04-10T00:00:00.000Z')
    })

    it('markClickConverted updates converted_user_id + converted_at (current ISO)', async () => {
      const eq = vi.fn().mockResolvedValue({ error: null })
      const update = vi.fn().mockReturnValue({ eq })
      const sb = { from: vi.fn(() => ({ update })) } as any
      await createClicksRepo(sb).markClickConverted('click-1', 'user-1')
      expect(sb.from).toHaveBeenCalledWith('affiliate_clicks')
      expect(update).toHaveBeenCalledWith({
        converted_user_id: 'user-1',
        converted_at: '2026-04-17T00:00:00.000Z',
      })
      expect(eq).toHaveBeenCalledWith('id', 'click-1')
    })
  })
})
