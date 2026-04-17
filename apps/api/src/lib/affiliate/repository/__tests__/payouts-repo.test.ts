import { describe, it, expect, vi } from 'vitest'
import { createPayoutsRepo } from '../payouts-repo'

// Build a chainable insert-mock that returns a fully-shaped DB row at .single().
function buildInsertMock(returnedRow: Record<string, unknown>) {
  const single = vi.fn().mockResolvedValue({ data: returnedRow, error: null })
  const select = vi.fn().mockReturnValue({ single })
  const insert = vi.fn().mockReturnValue({ select })
  return { insert, select, single }
}

// Build a chainable update-mock for `.update().eq().select().single()`.
function buildUpdateMock(returnedRow: Record<string, unknown>) {
  const single = vi.fn().mockResolvedValue({ data: returnedRow, error: null })
  const select = vi.fn().mockReturnValue({ single })
  const eq = vi.fn().mockReturnValue({ select })
  const update = vi.fn().mockReturnValue({ eq })
  return { update, eq, select, single }
}

// Minimal DB row that satisfies mapPayoutFromDb (every key it reads is present).
const dbRowSample = {
  id: 'p-1',
  affiliate_id: 'aff-1',
  affiliate_code: 'CODE',
  total_brl: 1000,
  commission_ids: ['c1', 'c2'],
  pix_key_id: null,
  pix_key_value: null,
  pix_key_type: null,
  status: 'pending',
  requested_at: '2026-01-01T00:00:00Z',
  reviewed_at: null,
  completed_at: null,
  admin_notes: null,
  tax_id: null,
  tax_id_type: null,
}

describe('payouts-repo', () => {
  it('createPayout inserts a snake_case row', async () => {
    const m = buildInsertMock(dbRowSample)
    const sb = { from: vi.fn(() => ({ insert: m.insert })) } as any
    await createPayoutsRepo(sb).createPayout({
      affiliateId: 'aff-1',
      affiliateCode: 'CODE',
      totalBrl: 1000,
      commissionIds: ['c1', 'c2'],
      status: 'pending',
    } as any)
    expect(sb.from).toHaveBeenCalledWith('affiliate_payouts')
    const row = m.insert.mock.calls[0][0]
    expect(row.affiliate_id).toBe('aff-1')
    expect(row.total_brl).toBe(1000)
    expect(row.commission_ids).toEqual(['c1', 'c2'])
  })

  it('updatePayoutStatus with full meta writes reviewed_at, completed_at, admin_notes', async () => {
    const m = buildUpdateMock(dbRowSample)
    const sb = { from: vi.fn(() => ({ update: m.update })) } as any
    await createPayoutsRepo(sb).updatePayoutStatus('p-1', 'completed', {
      reviewedAt: '2026-02-01T00:00:00Z',
      completedAt: '2026-02-02T00:00:00Z',
      adminNotes: 'paid out',
    })
    const fields = m.update.mock.calls[0][0]
    expect(fields).toEqual({
      status: 'completed',
      reviewed_at: '2026-02-01T00:00:00Z',
      completed_at: '2026-02-02T00:00:00Z',
      admin_notes: 'paid out',
    })
    expect(m.eq).toHaveBeenCalledWith('id', 'p-1')
  })

  it('updatePayoutStatus with only reviewedAt writes only reviewed_at (no others)', async () => {
    const m = buildUpdateMock(dbRowSample)
    const sb = { from: vi.fn(() => ({ update: m.update })) } as any
    await createPayoutsRepo(sb).updatePayoutStatus('p-1', 'processing', {
      reviewedAt: '2026-02-01T00:00:00Z',
    })
    const fields = m.update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(fields).toEqual({ status: 'processing', reviewed_at: '2026-02-01T00:00:00Z' })
    expect(fields).not.toHaveProperty('completed_at')
    expect(fields).not.toHaveProperty('admin_notes')
  })

  it('updatePayoutStatus with no meta writes only { status }', async () => {
    const m = buildUpdateMock(dbRowSample)
    const sb = { from: vi.fn(() => ({ update: m.update })) } as any
    await createPayoutsRepo(sb).updatePayoutStatus('p-1', 'pending')
    expect(m.update.mock.calls[0][0]).toEqual({ status: 'pending' })
  })

  it('listPayouts with status, affiliateId, limit, offset chains correctly', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    const range = vi.fn().mockReturnValue({ order })
    const limit = vi.fn().mockReturnValue({ range, order })
    const eqAff = vi.fn().mockReturnValue({ limit, range, order })
    const eqStatus = vi.fn().mockReturnValue({ eq: eqAff, limit, range, order })
    const select = vi.fn().mockReturnValue({ eq: eqStatus, limit, range, order })
    const sb = { from: vi.fn(() => ({ select })) } as any

    await createPayoutsRepo(sb).listPayouts({
      status: 'pending',
      affiliateId: 'aff-1',
      limit: 10,
      offset: 20,
    } as any)

    expect(eqStatus).toHaveBeenCalledWith('status', 'pending')
    expect(eqAff).toHaveBeenCalledWith('affiliate_id', 'aff-1')
    expect(limit).toHaveBeenCalledWith(10)
    expect(range).toHaveBeenCalledWith(20, 29)
    expect(order).toHaveBeenCalledWith('requested_at', { ascending: false })
  })

  it('listPayouts with offset=0, limit=5 calls range(0, 4) (off-by-one fix)', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    const range = vi.fn().mockReturnValue({ order })
    const limit = vi.fn().mockReturnValue({ range, order })
    const select = vi.fn().mockReturnValue({ limit, range, order })
    const sb = { from: vi.fn(() => ({ select })) } as any

    await createPayoutsRepo(sb).listPayouts({ offset: 0, limit: 5 } as any)

    expect(limit).toHaveBeenCalledWith(5)
    // The bug guard: offset=0 must NOT be treated as "no offset".
    expect(range).toHaveBeenCalledWith(0, 4)
  })
})
