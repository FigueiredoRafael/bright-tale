import { describe, it, expect, vi } from 'vitest'
import { probeApiHealth } from '../preflight.js'

describe('probeApiHealth', () => {
  it('returns pass when GET /health returns 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    globalThis.fetch = fetchMock
    const r = await probeApiHealth('http://localhost:3001')
    expect(r.status).toBe('pass')
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/health', expect.anything())
  })

  it('returns fail when non-200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('err', { status: 500 }))
    const r = await probeApiHealth('http://localhost:3001')
    expect(r.status).toBe('fail')
    expect(r.detail).toContain('500')
  })

  it('returns fail when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const r = await probeApiHealth('http://localhost:3001')
    expect(r.status).toBe('fail')
    expect(r.detail).toContain('ECONNREFUSED')
  })
})
