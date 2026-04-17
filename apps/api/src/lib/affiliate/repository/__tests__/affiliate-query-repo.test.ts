import { describe, it, expect, vi } from 'vitest'
import { createQueryRepo } from '../affiliate-query-repo'

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aff-1', user_id: 'u1', code: 'X', name: 'A', email: 'a@x.com',
    status: 'active', tier: 'nano', commission_rate: 0.15,
    fixed_fee_brl: null, contract_start_date: null, contract_end_date: null,
    contract_version: 1, contract_acceptance_version: null, contract_accepted_at: null,
    contract_accepted_ip: null, contract_accepted_ua: null,
    proposed_tier: null, proposed_commission_rate: null, proposed_fixed_fee_brl: null,
    proposal_notes: null, proposal_created_at: null,
    channel_name: null, channel_url: null, channel_platform: null,
    social_links: [], subscribers_count: null, adjusted_followers: null,
    affiliate_type: 'external', known_ip_hashes: [], notes: null, tax_id: null,
    total_clicks: 0, total_referrals: 0, total_conversions: 0, total_earnings_brl: 0,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('affiliate-query-repo', () => {
  it('findById returns mapped affiliate when found', async () => {
    const row = makeRow()
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null })
    const sb = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })) } as any
    const repo = createQueryRepo(sb)
    const r = await repo.findById('aff-1')
    expect(sb.from).toHaveBeenCalledWith('affiliates')
    expect(r?.id).toBe('aff-1')
    expect(r?.commissionRate).toBe(0.15)
  })

  it('findByCode returns null when not found', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const sb = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })) } as any
    expect(await createQueryRepo(sb).findByCode('NONE')).toBeNull()
  })

  it('findByUserId queries affiliates.user_id and returns mapped affiliate', async () => {
    const row = makeRow({ id: 'aff-2', user_id: 'u1' })
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null })
    const eq = vi.fn(() => ({ maybeSingle }))
    const sb = { from: vi.fn(() => ({ select: () => ({ eq }) })) } as any
    const r = await createQueryRepo(sb).findByUserId('u1')
    expect(sb.from).toHaveBeenCalledWith('affiliates')
    expect(eq).toHaveBeenCalledWith('user_id', 'u1')
    expect(r?.id).toBe('aff-2')
  })

  it('findByUserId returns null when no row', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const sb = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })) } as any
    expect(await createQueryRepo(sb).findByUserId('missing')).toBeNull()
  })

  it('findByEmail queries affiliates.email column', async () => {
    const row = makeRow({ email: 'a@x.com' })
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null })
    const eq = vi.fn(() => ({ maybeSingle }))
    const sb = { from: vi.fn(() => ({ select: () => ({ eq }) })) } as any
    const r = await createQueryRepo(sb).findByEmail('a@x.com')
    expect(eq).toHaveBeenCalledWith('email', 'a@x.com')
    expect(r?.email).toBe('a@x.com')
  })

  it('isCodeTaken returns true when row found', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'aff-1' }, error: null })
    const sb = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })) } as any
    expect(await createQueryRepo(sb).isCodeTaken('X')).toBe(true)
  })

  it('isCodeTaken returns false when no row', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const sb = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })) } as any
    expect(await createQueryRepo(sb).isCodeTaken('NOPE')).toBe(false)
  })

  it('create inserts snake_case columns with social_links default [] and returns mapped affiliate', async () => {
    const row = makeRow({ id: 'aff-new', code: 'NEW', name: 'New', email: 'n@x.com' })
    const single = vi.fn().mockResolvedValue({ data: row, error: null })
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select }))
    const sb = { from: vi.fn(() => ({ insert })) } as any
    const r = await createQueryRepo(sb).create({
      code: 'NEW', name: 'New', email: 'n@x.com',
      channelName: 'ch', channelUrl: 'https://y.com',
    } as any)
    expect(sb.from).toHaveBeenCalledWith('affiliates')
    const inserted = (insert.mock.calls as any[])[0]?.[0] as Record<string, unknown>
    expect(inserted.code).toBe('NEW')
    expect(inserted.name).toBe('New')
    expect(inserted.email).toBe('n@x.com')
    expect(inserted.channel_name).toBe('ch')
    expect(inserted.channel_url).toBe('https://y.com')
    expect(inserted.social_links).toEqual([])
    expect(inserted.tax_id).toBeNull()
    expect(inserted.notes).toBeNull()
    expect(r.id).toBe('aff-new')
  })

  it('createInternal inserts affiliate_type=internal and status=active', async () => {
    const row = makeRow({ id: 'int-1', code: 'INT', affiliate_type: 'internal', status: 'active' })
    const single = vi.fn().mockResolvedValue({ data: row, error: null })
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select }))
    const sb = { from: vi.fn(() => ({ insert })) } as any
    const r = await createQueryRepo(sb).createInternal({
      code: 'INT', name: 'Internal', email: 'i@x.com',
    } as any)
    const inserted = (insert.mock.calls as any[])[0]?.[0] as Record<string, unknown>
    expect(inserted.affiliate_type).toBe('internal')
    expect(inserted.status).toBe('active')
    expect(inserted.code).toBe('INT')
    expect(inserted.email).toBe('i@x.com')
    expect(r.affiliateType).toBe('internal')
  })

  it('linkUserId updates user_id and returns mapped affiliate', async () => {
    const row = makeRow({ id: 'aff-9', user_id: 'u-new' })
    const single = vi.fn().mockResolvedValue({ data: row, error: null })
    const select = vi.fn(() => ({ single }))
    const eq = vi.fn(() => ({ select }))
    const update = vi.fn(() => ({ eq }))
    const sb = { from: vi.fn(() => ({ update })) } as any
    const r = await createQueryRepo(sb).linkUserId('aff-9', 'u-new')
    expect(update).toHaveBeenCalledWith({ user_id: 'u-new' })
    expect(eq).toHaveBeenCalledWith('id', 'aff-9')
    expect(r.id).toBe('aff-9')
  })

  it('listAll with no options uses narrow projection (not *), applies no filters', async () => {
    const row = makeRow()
    const order = vi.fn().mockResolvedValue({ data: [row], error: null })
    const eq = vi.fn()
    const limit = vi.fn()
    const range = vi.fn()
    const select = vi.fn(() => ({ eq, limit, range, order }))
    const sb = { from: vi.fn(() => ({ select })) } as any
    await createQueryRepo(sb).listAll()
    const projection = (select.mock.calls as any[])[0]?.[0] as string
    expect(projection).not.toBe('*')
    expect(projection).toContain('id')
    expect(projection).toContain('code')
    expect(projection).toContain('commission_rate')
    expect(projection).not.toContain('tax_id')
    expect(projection).not.toContain('known_ip_hashes')
    expect(projection).not.toContain('notes')
    expect(projection).not.toContain('channel_url')
    expect(eq).not.toHaveBeenCalled()
    expect(limit).not.toHaveBeenCalled()
    expect(range).not.toHaveBeenCalled()
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('listAll with status filter calls eq(status, value)', async () => {
    const row = makeRow({ status: 'approved' })
    const eq = vi.fn()
    const order = vi.fn().mockResolvedValue({ data: [row], error: null })
    const builder: any = { eq, limit: vi.fn(), range: vi.fn(), order }
    eq.mockReturnValue(builder)
    const select = vi.fn(() => builder)
    const sb = { from: vi.fn(() => ({ select })) } as any
    await createQueryRepo(sb).listAll({ status: 'approved' } as any)
    expect(eq).toHaveBeenCalledWith('status', 'approved')
  })

  it('listAll with offset=0 + limit=10 calls range(0, 9) — off-by-one fix via offset !== undefined', async () => {
    const row = makeRow()
    const limit = vi.fn()
    const range = vi.fn()
    const order = vi.fn().mockResolvedValue({ data: [row], error: null })
    const builder: any = { eq: vi.fn(), limit, range, order }
    limit.mockReturnValue(builder)
    range.mockReturnValue(builder)
    const select = vi.fn(() => builder)
    const sb = { from: vi.fn(() => ({ select })) } as any
    await createQueryRepo(sb).listAll({ offset: 0, limit: 10 } as any)
    expect(limit).toHaveBeenCalledWith(10)
    expect(range).toHaveBeenCalledWith(0, 9)
  })

  it('listAll returns AffiliateAdminSummary rows (no taxId/notes/knownIpHashes leaked)', async () => {
    const row = makeRow({ id: 'aff-s', tax_id: 'TAX123', notes: 'secret', known_ip_hashes: ['hash1'] })
    const order = vi.fn().mockResolvedValue({ data: [row], error: null })
    const builder: any = { eq: vi.fn(), limit: vi.fn(), range: vi.fn(), order }
    const select = vi.fn(() => builder)
    const sb = { from: vi.fn(() => ({ select })) } as any
    const results = await createQueryRepo(sb).listAll()
    expect(results).toHaveLength(1)
    const first = results[0] as unknown as Record<string, unknown>
    expect(first.id).toBe('aff-s')
    expect(first.code).toBe('X')
    expect(first.commissionRate).toBe(0.15)
    expect(first).not.toHaveProperty('taxId')
    expect(first).not.toHaveProperty('notes')
    expect(first).not.toHaveProperty('knownIpHashes')
    expect(first).not.toHaveProperty('channelUrl')
  })
})
