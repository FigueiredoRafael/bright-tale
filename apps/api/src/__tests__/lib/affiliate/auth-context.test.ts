import { describe, it, expect, vi, beforeEach } from 'vitest'

const maybeSingle = vi.fn()
const eq2 = vi.fn(() => ({ maybeSingle }))
const eq1 = vi.fn(() => ({ eq: eq2 }))
const select = vi.fn(() => ({ eq: eq1 }))
const from = vi.fn(() => ({ select }))

vi.mock('@/lib/supabase', () => ({
  createServiceClient: vi.fn(() => ({ from })),
}))

import { getAuthenticatedUser, isAdmin } from '@/lib/affiliate/auth-context'
import { ApiError } from '@/lib/api/errors'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getAuthenticatedUser', () => {
  it('returns { id } when request.userId is set', async () => {
    expect(await getAuthenticatedUser({ userId: 'user-1' })).toEqual({ id: 'user-1' })
  })

  it('throws ApiError 401 when userId missing', async () => {
    await expect(getAuthenticatedUser({})).rejects.toBeInstanceOf(ApiError)
  })
})

describe('isAdmin', () => {
  it('returns false when request.userId missing (no DB call)', async () => {
    const result = await isAdmin({})
    expect(result).toBe(false)
    expect(from).not.toHaveBeenCalled()
  })

  it('returns true when user_roles row found with role=admin', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    const result = await isAdmin({ userId: 'admin-1' })
    expect(result).toBe(true)
    expect(from).toHaveBeenCalledWith('user_roles')
    expect(eq1).toHaveBeenCalledWith('user_id', 'admin-1')
    expect(eq2).toHaveBeenCalledWith('role', 'admin')
  })

  it('returns false when user_roles row not found', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const result = await isAdmin({ userId: 'normal-1' })
    expect(result).toBe(false)
  })

  it('caches result per-request (WeakMap) — single DB call across N invocations', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    const req = { userId: 'admin-1' }
    const a = await isAdmin(req)
    const b = await isAdmin(req)
    const c = await isAdmin(req)
    expect(a).toBe(true)
    expect(b).toBe(true)
    expect(c).toBe(true)
    expect(maybeSingle).toHaveBeenCalledTimes(1)
  })

  it('different request objects each get their own DB call', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const req1 = { userId: 'admin-1' }
    const req2 = { userId: 'normal-1' }
    expect(await isAdmin(req1)).toBe(true)
    expect(await isAdmin(req2)).toBe(false)
    expect(maybeSingle).toHaveBeenCalledTimes(2)
  })
})
