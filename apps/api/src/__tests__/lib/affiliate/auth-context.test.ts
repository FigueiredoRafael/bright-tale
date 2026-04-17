import { describe, it, expect } from 'vitest'
import { getAuthenticatedUser } from '@/lib/affiliate/auth-context'
import { ApiError } from '@/lib/api/errors'

describe('getAuthenticatedUser', () => {
  it('returns { id } when request.userId is set', async () => {
    expect(await getAuthenticatedUser({ userId: 'user-1' })).toEqual({ id: 'user-1' })
  })

  it('throws ApiError 401 when userId missing', async () => {
    await expect(getAuthenticatedUser({})).rejects.toBeInstanceOf(ApiError)
  })
})
