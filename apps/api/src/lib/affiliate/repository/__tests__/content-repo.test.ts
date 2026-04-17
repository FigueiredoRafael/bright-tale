import { describe, it, expect, vi } from 'vitest'
import { createContentRepo } from '../content-repo'

// Minimal DB row for affiliate_content_submissions satisfying mapContentSubmissionFromDb.
const dbRowSample = {
  id: 's-1',
  affiliate_id: 'aff-1',
  platform: 'youtube',
  content_type: 'video',
  url: 'https://example.com/v',
  title: 'My video',
  description: null,
  status: 'pending',
  review_notes: null,
  posted_at: null,
  created_at: '2026-04-01T00:00:00Z',
}

function buildInsertMock(returnedRow: Record<string, unknown>) {
  const single = vi.fn().mockResolvedValue({ data: returnedRow, error: null })
  const select = vi.fn().mockReturnValue({ single })
  const insert = vi.fn().mockReturnValue({ select })
  return { insert, select, single }
}

function buildUpdateMock(returnedRow: Record<string, unknown>) {
  const single = vi.fn().mockResolvedValue({ data: returnedRow, error: null })
  const select = vi.fn().mockReturnValue({ single })
  const eq = vi.fn().mockReturnValue({ select })
  const update = vi.fn().mockReturnValue({ eq })
  return { update, eq, select, single }
}

describe('content-repo', () => {
  it('submitContent maps camelCase input → snake_case row', async () => {
    const m = buildInsertMock(dbRowSample)
    const sb = { from: vi.fn(() => ({ insert: m.insert })) } as any
    await createContentRepo(sb).submitContent({
      affiliateId: 'aff-1',
      platform: 'youtube',
      contentType: 'video',
      url: 'https://example.com/v',
      title: 'My video',
      description: 'desc',
      postedAt: '2026-04-01T00:00:00Z',
    } as any)
    expect(sb.from).toHaveBeenCalledWith('affiliate_content_submissions')
    const row = m.insert.mock.calls[0][0]
    expect(row.affiliate_id).toBe('aff-1')
    expect(row.content_type).toBe('video')
    expect(row.url).toBe('https://example.com/v')
    expect(row.posted_at).toBe('2026-04-01T00:00:00Z')
    expect(row).not.toHaveProperty('contentType')
  })

  it('reviewContent("s1", "approved", "looks good") updates and returns mapped submission', async () => {
    const m = buildUpdateMock({ ...dbRowSample, status: 'approved', review_notes: 'looks good' })
    const sb = { from: vi.fn(() => ({ update: m.update })) } as any
    const result = await createContentRepo(sb).reviewContent('s-1', 'approved', 'looks good')
    expect(m.update).toHaveBeenCalledWith({ status: 'approved', review_notes: 'looks good' })
    expect(m.eq).toHaveBeenCalledWith('id', 's-1')
    expect(result.id).toBe('s-1')
    expect(result.status).toBe('approved')
    expect(result.reviewNotes).toBe('looks good')
  })

  it('reviewContent("s1", "rejected") with no notes writes review_notes: null', async () => {
    const m = buildUpdateMock({ ...dbRowSample, status: 'rejected' })
    const sb = { from: vi.fn(() => ({ update: m.update })) } as any
    await createContentRepo(sb).reviewContent('s-1', 'rejected')
    expect(m.update).toHaveBeenCalledWith({ status: 'rejected', review_notes: null })
  })

  it('listContentSubmissions(affId) orders by created_at DESC and filters affiliate_id', async () => {
    const order = vi.fn().mockResolvedValue({ data: [dbRowSample], error: null })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    const sb = { from: vi.fn(() => ({ select })) } as any
    const items = await createContentRepo(sb).listContentSubmissions('aff-1')
    expect(eq).toHaveBeenCalledWith('affiliate_id', 'aff-1')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(items).toHaveLength(1)
    expect(items[0].affiliateId).toBe('aff-1')
  })
})
