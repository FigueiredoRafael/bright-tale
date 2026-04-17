import { describe, it, expect, vi } from 'vitest'
import { createPixRepo } from '../pix-repo'

describe('pix-repo', () => {
  it('addPixKey inserts mapped row + returns mapped key', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'pix-1', affiliate_id: 'a1', key_type: 'email',
        key_value: 'me@x.com', key_display: 'me@***.com',
        is_default: false, label: 'main', created_at: '2026-04-17T00:00:00Z',
        updated_at: '2026-04-17T00:00:00Z',
      },
      error: null,
    })
    const insert = vi.fn().mockReturnValue({ select: () => ({ single }) })
    const sb = { from: vi.fn(() => ({ insert })) } as any
    const result = await createPixRepo(sb).addPixKey({
      affiliateId: 'a1', keyType: 'email', keyValue: 'me@x.com',
      keyDisplay: 'me@***.com', isDefault: false, label: 'main',
    })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      affiliate_id: 'a1', key_type: 'email', key_value: 'me@x.com',
      key_display: 'me@***.com', is_default: false, label: 'main',
    }))
    expect(result.affiliateId).toBe('a1')
    expect(result.keyType).toBe('email')
  })

  it('setDefaultPixKey: step 1 unsets all (filtered by affiliate_id)', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    const eq1 = vi.fn().mockReturnValue({ order })
    const eq2set = vi.fn().mockResolvedValue({ error: null })
    const eq2id = vi.fn().mockReturnValue({ eq: eq2set })
    const update1 = vi.fn().mockReturnValue({ eq: eq1 })
    const update2 = vi.fn().mockReturnValue({ eq: eq2id })
    let callCount = 0
    const sb = {
      from: vi.fn(() => {
        callCount += 1
        return { update: callCount === 1 ? update1 : update2 }
      }),
    } as any
    await createPixRepo(sb).setDefaultPixKey('a1', 'pix-1')
    // Step 1: unset all defaults for this affiliate
    expect(update1).toHaveBeenCalledWith({ is_default: false })
    expect(eq1).toHaveBeenCalledWith('affiliate_id', 'a1')
  })

  it('setDefaultPixKey: step 2 sets is_default=true filtered by BOTH id AND affiliate_id (cross-tenant guard)', async () => {
    const eq2set = vi.fn().mockResolvedValue({ error: null })
    const eq2id = vi.fn().mockReturnValue({ eq: eq2set })
    const eqAffOnly = vi.fn().mockResolvedValue({ data: [], error: null })
    const update1 = vi.fn().mockReturnValue({ eq: eqAffOnly })
    const update2 = vi.fn().mockReturnValue({ eq: eq2id })
    let callCount = 0
    const sb = {
      from: vi.fn(() => {
        callCount += 1
        return { update: callCount === 1 ? update1 : update2 }
      }),
    } as any
    await createPixRepo(sb).setDefaultPixKey('a1', 'pix-1')
    // Step 2 MUST filter by both id AND affiliate_id — without affiliate_id,
    // a malicious caller could promote another affiliate's pix key as default.
    expect(update2).toHaveBeenCalledWith({ is_default: true })
    expect(eq2id).toHaveBeenCalledWith('id', 'pix-1')
    expect(eq2set).toHaveBeenCalledWith('affiliate_id', 'a1')
  })

  it('setDefaultPixKey: step 2 error is propagated', async () => {
    const eq2set = vi.fn().mockResolvedValue({ error: { message: 'constraint violation' } })
    const eq2id = vi.fn().mockReturnValue({ eq: eq2set })
    const eqAffOnly = vi.fn().mockResolvedValue({ data: [], error: null })
    const update1 = vi.fn().mockReturnValue({ eq: eqAffOnly })
    const update2 = vi.fn().mockReturnValue({ eq: eq2id })
    let callCount = 0
    const sb = {
      from: vi.fn(() => {
        callCount += 1
        return { update: callCount === 1 ? update1 : update2 }
      }),
    } as any
    await expect(createPixRepo(sb).setDefaultPixKey('a1', 'pix-1')).rejects.toBeTruthy()
  })

  it('deletePixKey calls delete with id filter', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const del = vi.fn().mockReturnValue({ eq })
    const sb = { from: vi.fn(() => ({ delete: del })) } as any
    await createPixRepo(sb).deletePixKey('pix-1')
    expect(del).toHaveBeenCalled()
    expect(eq).toHaveBeenCalledWith('id', 'pix-1')
  })

  it('listPixKeys filters by affiliate_id, orders by created_at DESC, returns mapped keys', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { id: 'p1', affiliate_id: 'a1', key_type: 'email', key_value: 'x@y.com', key_display: 'x@***', is_default: true, label: null, created_at: '2026-04-17T00:00:00Z', updated_at: '2026-04-17T00:00:00Z' },
      ],
      error: null,
    })
    const eq = vi.fn().mockReturnValue({ order })
    const sb = { from: vi.fn(() => ({ select: () => ({ eq }) })) } as any
    const result = await createPixRepo(sb).listPixKeys('a1')
    expect(eq).toHaveBeenCalledWith('affiliate_id', 'a1')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(result).toHaveLength(1)
    expect(result[0].affiliateId).toBe('a1')
    expect(result[0].isDefault).toBe(true)
  })
})
