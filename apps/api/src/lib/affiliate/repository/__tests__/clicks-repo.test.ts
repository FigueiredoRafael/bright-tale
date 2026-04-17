import { describe, it, expect, vi } from 'vitest'
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
})
