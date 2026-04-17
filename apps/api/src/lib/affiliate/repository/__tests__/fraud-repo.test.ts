import { describe, it, expect, vi } from 'vitest'
import { createFraudRepo } from '../fraud-repo'

// Minimal DB row for affiliate_fraud_flags satisfying mapFraudFlagFromDb.
const dbFlagSample = {
  id: 'f-1',
  affiliate_id: 'aff-1',
  referral_id: 'r-1',
  flag_type: 'duplicate_ip',
  severity: 'high',
  details: { foo: 'bar' },
  status: 'pending',
  admin_notes: null,
  resolved_at: null,
  created_at: '2026-03-01T00:00:00Z',
}

// Build a chainable list-mock for `.select(..., {count}).range().order()`.
function buildListMock(items: Record<string, unknown>[], total: number) {
  const order = vi.fn().mockResolvedValue({ data: items, count: total, error: null })
  const range = vi.fn().mockReturnValue({ order })
  const select = vi.fn().mockReturnValue({ range, order })
  return { select, range, order }
}

// Build a chainable update-mock for `.update().eq().select().single()`.
function buildUpdateMock(returnedRow: Record<string, unknown>) {
  const single = vi.fn().mockResolvedValue({ data: returnedRow, error: null })
  const select = vi.fn().mockReturnValue({ single })
  const eq = vi.fn().mockReturnValue({ select })
  const update = vi.fn().mockReturnValue({ eq })
  return { update, eq, select, single }
}

describe('fraud-repo', () => {
  it('listFraudFlags() with no options defaults to perPage=50, page=1 → range(0,49)', async () => {
    const m = buildListMock([], 0)
    const sb = { from: vi.fn(() => ({ select: m.select })) } as any
    await createFraudRepo(sb).listFraudFlags()
    expect(m.select).toHaveBeenCalledWith('*', { count: 'exact' })
    expect(m.range).toHaveBeenCalledWith(0, 49)
  })

  it('listFraudFlags({ page: 2, perPage: 25 }) → range(25, 49)', async () => {
    const m = buildListMock([], 0)
    const sb = { from: vi.fn(() => ({ select: m.select })) } as any
    await createFraudRepo(sb).listFraudFlags({ page: 2, perPage: 25 })
    expect(m.range).toHaveBeenCalledWith(25, 49)
  })

  it('listFraudFlags returns { items, total } from count: exact', async () => {
    const m = buildListMock([dbFlagSample, { ...dbFlagSample, id: 'f-2' }], 42)
    const sb = { from: vi.fn(() => ({ select: m.select })) } as any
    const result = await createFraudRepo(sb).listFraudFlags()
    expect(result.total).toBe(42)
    expect(result.items).toHaveLength(2)
    expect(result.items[0].id).toBe('f-1')
  })

  it('updateFraudFlagStatus(id, "resolved", "notes") sets resolved_at to ISO string', async () => {
    const m = buildUpdateMock({ ...dbFlagSample, status: 'resolved', admin_notes: 'notes', resolved_at: '2026-03-02T00:00:00Z' })
    const sb = { from: vi.fn(() => ({ update: m.update })) } as any
    await createFraudRepo(sb).updateFraudFlagStatus('f-1', 'resolved', 'notes')
    const fields = m.update.mock.calls[0][0]
    expect(fields.status).toBe('resolved')
    expect(fields.admin_notes).toBe('notes')
    expect(typeof fields.resolved_at).toBe('string')
    // ISO 8601 sanity check.
    expect(() => new Date(fields.resolved_at).toISOString()).not.toThrow()
  })

  it('updateFraudFlagStatus(id, "investigating") does NOT set resolved_at', async () => {
    const m = buildUpdateMock({ ...dbFlagSample, status: 'investigating' })
    const sb = { from: vi.fn(() => ({ update: m.update })) } as any
    await createFraudRepo(sb).updateFraudFlagStatus('f-1', 'investigating')
    const fields = m.update.mock.calls[0][0]
    expect(fields.status).toBe('investigating')
    expect(fields).not.toHaveProperty('resolved_at')
  })

  it('updateFraudFlagStatus returns mapped AffiliateFraudFlag (camelCase)', async () => {
    const m = buildUpdateMock({
      ...dbFlagSample,
      status: 'confirmed_fraud',
      resolved_at: '2026-03-03T00:00:00Z',
      admin_notes: 'bad actor',
    })
    const sb = { from: vi.fn(() => ({ update: m.update })) } as any
    const result = await createFraudRepo(sb).updateFraudFlagStatus('f-1', 'confirmed_fraud', 'bad actor')
    expect(result.affiliateId).toBe('aff-1')
    expect(result.referralId).toBe('r-1')
    expect(result.flagType).toBe('duplicate_ip')
    expect(result.adminNotes).toBe('bad actor')
    expect(result.resolvedAt).toBe('2026-03-03T00:00:00Z')
    expect(result.createdAt).toBe('2026-03-01T00:00:00Z')
  })
})
