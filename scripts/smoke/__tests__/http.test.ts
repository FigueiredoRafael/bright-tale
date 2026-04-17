import { describe, it, expect, vi, afterEach } from 'vitest'
import { smokeRequest } from '../http.js'

const originalFetch = globalThis.fetch

describe('smokeRequest', () => {
  afterEach(() => { globalThis.fetch = originalFetch })

  it('injects X-Internal-Key and x-user-id headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', {status:200, headers:{'content-type':'application/json'}}))
    globalThis.fetch = fetchMock
    await smokeRequest({
      apiUrl: 'http://localhost:3001',
      internalKey: 'KEY123',
      path: '/affiliate/me',
      method: 'GET',
      userId: 'user-abc',
    })
    const call = fetchMock.mock.calls[0]
    const headers = call[1].headers as Record<string, string>
    expect(headers['X-Internal-Key']).toBe('KEY123')
    expect(headers['x-user-id']).toBe('user-abc')
  })

  it('parses JSON body when content-type is application/json', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('{"success":true,"data":{"a":1}}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    const r = await smokeRequest({
      apiUrl: 'http://localhost:3001',
      internalKey: 'k',
      path: '/x',
      method: 'GET',
      userId: 'u',
    })
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ success: true, data: { a: 1 } })
  })

  it('returns raw text when body is not JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('Forbidden', {
        status: 403, headers: { 'content-type': 'text/plain' },
      })
    )
    const r = await smokeRequest({
      apiUrl: 'http://localhost:3001',
      internalKey: 'k',
      path: '/x',
      method: 'GET',
      userId: 'u',
    })
    expect(r.body).toBe('Forbidden')
  })

  it('forwards x-forwarded-for when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', {status:200, headers:{'content-type':'application/json'}}))
    globalThis.fetch = fetchMock
    await smokeRequest({
      apiUrl: 'http://localhost:3001',
      internalKey: 'k',
      path: '/ref/ABC',
      method: 'GET',
      userId: null,
      forwardedFor: '198.51.100.1',
    })
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers['x-forwarded-for']).toBe('198.51.100.1')
    expect(headers['x-user-id']).toBeUndefined()
  })

  it('never retries on error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'))
    globalThis.fetch = fetchMock
    await expect(smokeRequest({
      apiUrl: 'http://localhost:3001',
      internalKey: 'k',
      path: '/x',
      method: 'GET',
      userId: 'u',
    })).rejects.toThrow(/ECONNRESET/)
    expect(fetchMock.mock.calls.length).toBe(1)
  })
})
